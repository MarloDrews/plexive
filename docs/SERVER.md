# Plexive – Server-Referenz (Raspberry Pi)

Stand: 21. Juli 2026. Diese Datei dokumentiert das laufende Deployment auf dem
Raspberry Pi zum schnellen Nachschlagen und Debuggen. Keine echten Secrets hier –
nur Namen und Pfade.

---

## Host

| | |
|---|---|
| Gerät | Raspberry Pi, Hostname `GommeHD` |
| Login-User | `silas` |
| OS | 64-bit Raspberry Pi OS |
| Python | 3.13 (System), Backend nutzt venv unter `backend/.venv` |
| Node | v24.16.0 **über nvm** → `/home/silas/.nvm/versions/node/v24.16.0/bin` |
| Repo-Pfad | `/home/silas/deepscroll` |
| Aktiver Branch | `main` |
| Repo-Sichtbarkeit | **öffentlich** (relevant für Auto-Deploy-Sicherheit) |

## Architektur in einem Satz

Das Backend (FastAPI/uvicorn, Port 8000) läuft als systemd-Service auf dem Pi und
ist über einen **Cloudflare Tunnel** öffentlich unter `https://api.plexive.org`
erreichbar. Das **Frontend liegt auf Vercel** unter `https://plexive.org`. Die DB
liegt extern auf **Supabase (PostgreSQL)**, Datei-Uploads auf **Supabase Storage**.

| Komponente | Ort | Adresse |
|---|---|---|
| Frontend (Next.js) | Vercel | `https://plexive.org` |
| Backend (FastAPI) | Raspberry Pi | `https://api.plexive.org` |
| DB + Storage | Supabase | – |

Tailscale bleibt als Wartungszugang zum Pi bestehen, ist aber für den App-Zugriff
nicht mehr nötig.

---

## Backend

> **Hinweis (M138):** Dieses Dokument beschreibt das Raspberry-Pi/systemd-Setup.
> Fuer das Railway-Deployment ist `backend/railway.toml` die verbindliche Quelle.
> In beiden Faellen gilt die harte Deployment-Invariante: **genau ein Prozess**
> (eine Replica, ein uvicorn-Worker, niemals `--workers` oder `WEB_CONCURRENCY`).
> Rate-Limiter, Chat-/Battle-Socket-Registries und Stats-Caches leben im
> Prozessspeicher; bei N Prozessen vervielfachen sich alle Limits still um N und
> die Live-Zustellung von Chat/Battle zerfaellt. Details: ARCHITECTURE.md.

- **Service:** `deepscroll-backend` (systemd)
- **Unit:** `/etc/systemd/system/deepscroll-backend.service`
- **Port:** 8000, single uvicorn-Worker
- **Start:** `uvicorn app.main:app --host 0.0.0.0 --port 8000`
  - `--host 0.0.0.0` ist wichtig, damit auch die Tailscale-IP bedient wird.
  - `--proxy-headers --forwarded-allow-ips=*` wurde **entfernt** (SEC-004/ARCH-002):
    `--forwarded-allow-ips=*` liess uvicorn `X-Forwarded-*` von **jedem** Peer
    vertrauen, sodass `websocket.client.host` faelschbar war. Der WS-Gate prueft
    jetzt den echten TCP-Peer selbst; der Tailscale-Bereich (100.64.0.0/10) ist
    dort als lokal erlaubt, plain `ws` ueber Tailscale funktioniert also direkt.
  - TLS terminiert jetzt `cloudflared` auf Loopback, daher steht
    `TRUSTED_PROXY_IPS=127.0.0.1` in der Env (nur von dort wird
    `x-forwarded-proto` ausgewertet).
- **Secrets-Datei:** `/etc/deepscroll/backend.env`, Rechte `root:root`, `chmod 600`
  (liegt **außerhalb** des Repos, wird von systemd via `EnvironmentFile=` geladen).
- **create_all** beim Start: legt fehlende Tabellen an, **aber keine neuen Spalten**
  in bestehende Tabellen → siehe „Bekannte Fallstricke".

### Erforderliche Env-Variablen (in `/etc/deepscroll/backend.env`)

```
JWT_SECRET=...
DATABASE_URL=postgresql://...supabase...
SEED_ADMIN_PASSWORD=...
SUPABASE_URL=https://<projekt>.supabase.co
SUPABASE_SERVICE_KEY=...            # ACHTUNG: exakt dieser Name (NICHT ..._SERVICE_ROLE)
FRONTEND_ORIGIN=https://plexive.org # ACHTUNG: mit https:// und ohne / am Ende
TRUSTED_PROXY_IPS=127.0.0.1         # cloudflared terminiert TLS und verbindet sich per Loopback
CLOSED_BETA=1                       # Closed Beta: API nur mit Bearer-Token, Registrierung zu
```

> `CLOSED_BETA` wird **beim Import** gelesen, also erst nach
> `sudo systemctl restart deepscroll-backend` wirksam — wie jede Variable in
> dieser Datei (`EnvironmentFile=` wird nur beim Start gelesen).
>
> Ob das Gate wirklich an ist, beantwortet der Dienst selbst; eine vergessene
> Variable ist sonst unsichtbar, und „offen" ist genau der Zustand, den das
> Gate beseitigt:
>
> ```
> journalctl -u deepscroll-backend | grep closed-beta
> # [closed-beta] gate ON: anonymous requests are refused. Open: ...
> ```
>
> Bewusst **nicht** fail-closed: eine fehlende optionale Variable darf den
> Server nicht am Starten hindern. Ohne `CLOSED_BETA=1` läuft die API offen
> weiter und sagt das in derselben Zeile (`gate OFF`).
>
> Von außen prüfbar mit `bash tools/probe_public_surface.sh` (HTTP) und
> `backend/.venv/Scripts/python.exe tools/probe_websocket.py` (Websockets).

> Vollständige Liste der vom Code zwingend erwarteten Variablen jederzeit prüfen mit:
> `grep -rhno "os.environ\[[^]]*\]" /home/silas/deepscroll/backend/app/ | sort -u`

## Cloudflare Tunnel

Macht das Backend öffentlich erreichbar, **ohne** eine Portfreigabe im Router:
`cloudflared` baut eine ausgehende Verbindung zu Cloudflare auf. Die Heim-IP
bleibt verborgen, TLS terminiert Cloudflare.

- **Dienst:** `cloudflared` (systemd, via `cloudflared service install`)
- **Route:** `api.plexive.org` → `http://localhost:8000`
- **Nameserver** von plexive.org liegen bei Cloudflare.
- `uvicorn` bleibt bewusst ohne `--proxy-headers` (SEC-004/ARCH-002); der WS-Gate
  prüft den echten TCP-Peer, und der ist bei cloudflared `127.0.0.1` (Loopback,
  daher ohnehin erlaubt).

```bash
systemctl status cloudflared --no-pager
journalctl -u cloudflared --no-pager -n 50
cloudflared tunnel list
```

## Frontend

Läuft auf **Vercel**, nicht mehr auf dem Pi. Der alte systemd-Service
`deepscroll-frontend` ist stillgelegt (`sudo systemctl disable --now
deepscroll-frontend`); damit entfällt auch das RAM-Problem beim Build auf dem Pi.

- **Root Directory** im Vercel-Projekt: `frontend`
- **Env-Variable:** `NEXT_PUBLIC_API_URL=https://api.plexive.org`
  > **Wird zur BUILD-Zeit fest ins Bundle eingebacken**, nicht zur Laufzeit gelesen.
  > Jede Änderung erfordert einen neuen Build – ein bloßes Redeploy reicht NICHT.
- Die WebSocket-URL wird daraus automatisch als `wss://` abgeleitet
  (`frontend/src/lib/storage.ts`), ebenso die CSP-`connect-src`-Einträge
  (`frontend/next.config.ts`). Es gibt keine zweite Variable dafür.
- **Preview-Deployments** bekommen wechselnde URLs, die nicht in
  `FRONTEND_ORIGIN` stehen und daher an CORS scheitern. Über die
  Produktions-Domain testen.

## Datenbank & Storage

- **DB:** Supabase PostgreSQL, Verbindung über `DATABASE_URL`.
- **Storage:** Supabase Storage (Bucket für Uploads), Zugriff serverseitig über
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Service-Key **niemals** ins Frontend.
- **Seed:** einmalig befüllt; bei Bedarf erneut:
  ```bash
  cd /home/silas/deepscroll/backend
  sudo env $(sudo cat /etc/deepscroll/backend.env | grep -v '^#' | xargs) .venv/bin/python seed.py
  ```

## Backups

Supabase macht auf dem Free-Tier **keine automatischen Backups**. Bis das anders
ist, ist `tools/backup_supabase.sh` die einzige Kopie, die es gibt.

**Der Laptop ist der primäre Host, nicht der Pi.** Das ist eine Entscheidung und
keine Bequemlichkeit: der Pi ist ein Gerät mit einer SD-Karte zu Hause und steht
unter „Offene Punkte" selbst als Single Point of Failure. Ein Dump, der auf dem
Pi liegt, verschiebt das Risiko, statt es zu entfernen. Auf dem Pi laufen lassen
und danach herunterkopieren funktioniert -- und ist die Variante, die man nach
dem dritten Mal sein lässt. Der Pi bleibt der dokumentierte Ausweichweg: das
Skript ist bash und läuft dort unverändert, und `alembic` steht in
`requirements.txt`, also kann der Pi nach einem normalen Deploy-Install
mitmachen.

Voraussetzung sind die PostgreSQL-Client-Tools (`pg_dump`, `pg_restore`, `psql`):

```bash
winget install --id PostgreSQL.PostgreSQL.17 -e
```

Die **Major-Version muss zum Server passen**. `pg_dump` verweigert den Dienst
gegen einen neueren Server, und ein Dump von einem neueren Client lässt sich
nicht zuverlässig in einen älteren Server zurückspielen. Welche Version Supabase
fährt:

```bash
psql "$DATABASE_URL" -tAc "show server_version"
```

Lauf:

```bash
PLEXIVE_BACKUP_DIR=/d/plexive-backups bash tools/backup_supabase.sh
```

Das Skript schreibt drei Dateien und **weigert sich, ins Repository zu
schreiben** -- das Repo ist öffentlich und der Dump enthält jede E-Mail-Adresse
und jeden bcrypt-Hash.

**Das Manifest ist der wertvollere Teil, nicht der Dump.** Ein Dump nützt erst
etwas, wenn ihn jemand zurückspielt. Das Manifest nützt in dem Moment etwas, in
dem es entsteht, weil es die erste schriftliche Aufzeichnung davon ist, was in
der Produktion tatsächlich steht: Zeilenzahlen pro Tabelle, RLS-Status,
Policy-Liste.

**Manifeste nicht aufräumen.** Die Dateinamen tragen einen Zeitstempel und nichts
wird überschrieben. Die Folge der Manifeste ist eine Schema- und
Wachstumshistorie, die sonst niemand führt. Dumps darf man wegwerfen, Manifeste
nicht.

Was ein Dump **nicht** abdeckt -- das Skript sagt es bei jedem Lauf selbst:

- **Supabase-Storage-Objekte.** Die Dateien selbst liegen in keinem
  PostgreSQL-Dump und werden von keinem Supabase-Tier gesichert. Nur die
  Metadaten-Zeilen in `storage.objects` sind dabei. Ein Restore liefert also
  Zeilen, die auf Bilder zeigen, die es nicht mehr gibt.
- **Row Level Security.** Steht im Dump, aber das Einschalten beim Restore
  braucht Table Ownership. Ein Restore unter einer Rolle ohne Ownership kann mit
  RLS **aus** zurückkommen und trotzdem Erfolg melden -- ein Sicherheitsvorfall
  im Kostüm eines sauberen Restores. Nach **jedem** Restore gegen die
  RLS-Tabelle im Manifest vergleichen, nicht annehmen.
- **Datenbank-Rollen und deren Passwörter.**
- Alles außerhalb der Datenbank: Vercel, Cloudflare,
  `/etc/deepscroll/backend.env`.

Konten-Hinweis: Plexive nutzt **kein Supabase Auth**. Die Konten liegen in
`public.users` mit bcrypt-Hash und selbst ausgestelltem JWT, und Google-Sign-in
schreibt `public.users.google_sub`. `auth.users` ist hier also erwartbar leer;
eine niedrige Zahl dort ist kein fehlendes Backup, sondern der Normalzustand.

## Schema-Migrationen (Alembic)

Das hier ist die operative Reihenfolge -- die Befehle, die jemand wirklich tippt.
Sie steht in dieser Datei und nicht in `docs/research/schema-drift-2026-08.md`:
das Forschungsdokument ist eine datierte Aufzeichnung, ein Ablauf, den jemand
ausführt, gehört ins Runbook.

**Wo diese Befehle laufen:** vom **Laptop** aus, aus dem Verzeichnis `backend/`,
gegen die `DATABASE_URL` in `backend/.env`. Der Pi ist der dokumentierte
Ausweichweg: dort ist das Verzeichnis `/home/silas/deepscroll/backend` und der
Interpreter `.venv/bin/alembic` statt `.venv/Scripts/alembic.exe`. `alembic`
steht in `requirements.txt`, die Produktion hat es aber noch nie installiert --
es kommt dort mit dem nächsten `pip install -r requirements.txt` an.

**Die PostgreSQL-Client-Tools müssen auf dem PATH liegen**, sonst bricht
Schritt 1 mit `FATAL: pg_dump is not on PATH` ab. Der winget-Install legt sie
nicht auf den PATH von Git Bash:

```bash
export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"
```

### Zwei Dinge, bevor Schritt 1 läuft

**Die Zielzeile lesen.** `app/database.py:8` ruft ein blankes `load_dotenv()`
auf, das `backend/.env` aus **jedem** Arbeitsverzeichnis findet. Deshalb sagt
jeder Alembic-Befehl auf stderr, wohin er verbindet, *bevor* er verbindet:

```
[alembic] online target: scheme=postgresql host=aws-1-eu-central-2.pooler.supabase.com port=5432 db=postgres user=postgres.<projekt-ref> (password redacted)
```

Steht dort `host=localhost`, ist es nicht die Produktion. Die Ansage ist **nicht**
der Schutz -- eine Zeile, die niemand liest, schützt nichts --, das ist
`PLEXIVE_DB_WRITE=1` (`alembic/env.py:66,92`). Ohne diese Variable weigern sich
`upgrade`, `downgrade`, `stamp` und `merge`, und zwar bevor überhaupt eine
Verbindung aufgebaut wird:

```
REFUSED: upgrade can write to the database and PLEXIVE_DB_WRITE is not set.
  Nothing was connected to and nothing was changed.
```

**`alembic check` niemals gegen eine ungestempelte Datenbank.** Es verlangt die
Datenbank auf `head`, scheitert sonst mit Exit 127 (`Target database is not up to
date.`) -- und **legt dabei `alembic_version` an**: aus 12 Tabellen werden 13.
Der einzige Alembic-Befehl, dessen Name „lesen" sagt, schreibt also, und zwar
genau in die Datenbank, deren unveränderter Zustand der Beweis ist. Für eine
ungestempelte Datenbank ist `scripts/schema_diff.py` das Werkzeug: es liest
`alembic_version` nie und schreibt nichts. Diese Warnung bleibt stehen, obwohl
die Produktion seit dem 28.08.2026 gestempelt ist -- sie gilt für jede künftige
Datenbank, die es nicht ist.

### 1. Backup ziehen

**Verzeichnis:** Repository-Wurzel.

```bash
PLEXIVE_BACKUP_URL="$(grep -E '^DATABASE_URL=' backend/.env | cut -d= -f2-)" \
  PLEXIVE_BACKUP_DIR=/c/Users/marlo/GitHub/plexive-backups \
  bash tools/backup_supabase.sh
```

Die URL steht ausgeschrieben, weil der dokumentierte Rückfall auf `DATABASE_URL`
in der Praxis **nicht greift**: in einer normalen Shell ist die Variable nicht
exportiert, und das Skript bricht ab, bevor man Schritt 2 überhaupt erreicht:

```
FATAL: no database URL.
       Set PLEXIVE_BACKUP_URL, or DATABASE_URL, to the connection string.
```

`PLEXIVE_BACKUP_DIR` muss **außerhalb des Repositories** liegen -- das Repo ist
öffentlich, der Dump enthält jede E-Mail-Adresse und jeden bcrypt-Hash. Welches
Verzeichnis es ist, spielt keine Rolle; ein Pfad im Repo wird abgelehnt:

```
FATAL: refusing to write into the repository (/c/Users/marlo/GitHub/deepscroll/backups).
```

**Erwartete Ausgabe** (gekürzt; gegen die Produktion sind die Zeilenzahlen
größer):

```
Plexive database backup
-----------------------
target dir : /c/Users/marlo/GitHub/plexive-backups
host       : aws-1-eu-central-2.pooler.supabase.com:5432
pg_dump    : major 17
server     : major 17 (17.6)

rls        : role exempt (superuser or BYPASSRLS) = t, 0 RLS table(s) not readable by ownership
Reading what is actually there...
TABLE                                            ROWS
public.alembic_version                              1
public.comments                                   ...

public tables: 14, rows in public: ...

archive check: <n> restorable entries (floor 40)

Wrote:
  dump           .../plexive-<zeitstempel>.dump (... bytes)
  schema         .../plexive-<zeitstempel>-schema.sql (... bytes)

NOT COVERED, and this is not a footnote:
  ...

  manifest: .../plexive-<zeitstempel>-manifest.txt
```

Der Manifest-Pfad kommt **zuletzt**, und das ist Absicht: der Dump nützt erst
etwas, wenn ihn jemand zurückspielt, das Manifest nützt in dem Moment etwas, in
dem es entsteht. Manifeste nicht aufräumen.

### 2. Drift lesen

**Verzeichnis:** `backend/`. Read-only: keine DDL, nichts geschrieben, nicht
gestempelt. Funktioniert gestempelt wie ungestempelt.

```bash
.venv/Scripts/python.exe scripts/schema_diff.py
```

**Erwartete Ausgabe** (gegen die Produktion gemessen, 28.08.2026, nach dem
Stempeln):

```
target: host=aws-1-eu-central-2.pooler.supabase.com port=5432 db=postgres user=postgres.<projekt-ref>
mode:   read-only (no DDL, no writes, no stamp)

compared 12 tables declared in models.py against 14 tables in the database
not compared (deliberately unmanaged, alembic/policy.py): user_elo
differences: 3

==============================================================================
EXTRA IN THE DATABASE -- production has it, models.py does not declare it
==============================================================================
  [benign] ix_conversation_participants_conversation_id on conversation_participants(conversation_id)  [remove_index]
  [benign] ix_follows_id on follows(id)  [remove_index]
  [benign] ix_quiz_answers_user_id on quiz_answers(user_id)  [remove_index]

3 difference(s), 0 of them ALARMING
```

**Die Ausgabe rückwärts lesen.** Alembic benennt einen Unterschied nach der
Migration, die es erzeugen *würde*. `remove_index` heißt deshalb: die
**Datenbank** hat den Index und `models.py` nicht -- eine Migration würde ihn
LÖSCHEN. Für `remove_column` und `remove_table` gilt dasselbe, und so löscht
jemand eine Spalte, der die sichere Richtung gewählt zu haben glaubte.

Genau diese drei Zeilen sind erwartet; sie sind der Grund für Revision `0002`.
Eine **vierte** Zeile ist neue Drift.

Zu „12 gegen 14 Tabellen": `user_elo` wird in der Zeile darüber genannt, die
14. ist `alembic_version`, die Alembic selbst aus dem Vergleich nimmt.

### 3. Stempeln -- ERLEDIGT am 28.08.2026, nicht wiederholen

```bash
PLEXIVE_DB_WRITE=1 .venv/Scripts/alembic.exe stamp head
```

Dieser Schritt ist Geschichte, keine Anweisung. Er steht hier, weil die
**Reihenfolge** der eigentliche Punkt ist: `stamp` *behauptet*, dass die
Datenbank zum Baseline passt. Wer vor Schritt 1 und 2 stempelt, zerstört die
einzige Gelegenheit, diese Behauptung zu prüfen -- und `stamp` ist billig
auszuführen, was genau die Versuchung ist.

Für eine künftige, noch ungestempelte Datenbank gilt die Reihenfolge
unverändert: erst 1, dann 2, dann 3.

### 4. Bestätigen

**Verzeichnis:** `backend/`. Read-only; `current` steht nicht in
`WRITE_COMMANDS` und braucht die Schreibfreigabe nicht.

```bash
.venv/Scripts/alembic.exe current
```

**Erwartete Ausgabe** -- und hier ist die Klammer die eigentliche Information:

```
[alembic] online target: scheme=postgresql host=... db=postgres user=... (password redacted)
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
0001
```

Am 28.08.2026, unmittelbar nach dem Stempeln, stand dort `0001 (head)`. Seit
Revision `0002` im Repository liegt, ist `0001` **nicht mehr** `head`, und die
fehlende Klammer ist genau das Signal, dass eine Migration bereitliegt. Nach
Schritt 5 steht dort `0002 (head)`.

Kommt gar keine Revisionszeile, ist die Datenbank nicht gestempelt.

### 5. Migration anwenden

**Verzeichnis:** `backend/`. **Schritt 1 ist Voraussetzung, nicht Empfehlung.**

```bash
PLEXIVE_DB_WRITE=1 .venv/Scripts/alembic.exe upgrade head
```

**Erwartete Ausgabe** für Revision `0002` (gemessen auf einer lokalen
Wegwerf-Datenbank, die in genau der Index-Gestalt der Produktion aufgebaut
wurde):

```
INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002, drop redundant indexes
[0002] dropped ix_follows_id on follows -- covered by follows_pkey UNIQUE btree (id) -- identical column list
[0002] dropped ix_quiz_answers_user_id on quiz_answers -- covered by uq_quiz_answer UNIQUE btree (user_id, post_id, question_index) -- leading column
[0002] dropped ix_conversation_participants_conversation_id on conversation_participants -- covered by uq_conversation_participant UNIQUE btree (conversation_id, user_id) -- leading column
[0002] dropped 3 of 3 redundant indexes
```

`dropped 3 of 3` ist die Zahl, auf die es ankommt. `dropped 0 of 3` ist auf einer
**frischen** Datenbank richtig -- dort hat `0001` diese Indizes nie angelegt --,
gegen die Produktion aber falsch: dann hat sie jemand vorher von Hand gelöscht.

### 6. Danach auf Drift prüfen

**Verzeichnis:** `backend/`. Jetzt -- und erst jetzt -- ist `alembic check` das
richtige Werkzeug.

```bash
.venv/Scripts/alembic.exe check
```

**Erwartete Ausgabe:**

```
No new upgrade operations detected.
```

**`check` verlangt die Datenbank auf `head`, nicht bloß „gestempelt".** Solange
`0002` im Repository liegt und noch nicht angewendet ist, steht die Produktion
auf `0001` und damit *hinter* `head`; `check` antwortet dann mit Exit 127 und
`Target database is not up to date.` -- gemessen, nicht vermutet. Das ist kein
Fehler, sondern die Aussage „es liegt eine Migration bereit". In diesem Zustand
antwortet `scripts/schema_diff.py` aus Schritt 2 trotzdem.

---

## Secrets vom Pi herunterholen

`/etc/deepscroll/backend.env` existiert genau einmal, auf einer SD-Karte in einem
Gerät zu Hause. Stirbt die Karte, ist nicht nur der Dienst weg, sondern auch
`JWT_SECRET`, die DB-Zugangsdaten und der Supabase-Service-Key. Das Folgende ist
zu **tun**, nicht zu wissen.

1. Datei vom Laptop aus über Tailscale holen:

   ```bash
   ssh silas@100.64.140.55 'sudo cat /etc/deepscroll/backend.env' > backend.env.pi
   ```

2. In den Passwortmanager legen (als Anhang oder sichere Notiz), danach die
   lokale Kopie löschen:

   ```bash
   rm backend.env.pi
   ```

3. **Wohin sie nicht darf:** nicht ins Repository (es ist öffentlich), nicht in
   einen Cloud-Ordner im Klartext, nicht in einen Chat, nicht als E-Mail an sich
   selbst, und nicht auf dieselbe SD-Karte.

4. **In dieselbe Ablage gehört außerdem:**
   - die Vercel-Environment-Variablen des Projekts, inklusive der
     Basic-Auth-Zugangsdaten der Closed Beta (Benutzer `beta`; das Passwort steht
     bewusst nirgends im Repo und enthält ein Euro-Zeichen)
   - die Cloudflare-Tunnel-Credentials vom Pi (`/etc/cloudflared/*.json` und
     `cert.pem`). Ohne sie ist `api.plexive.org` nicht wiederherstellbar.
   - die Supabase-Datenbank-URL und der `SUPABASE_SERVICE_KEY`
   - Google-OAuth-Client-ID und Client-Secret
   - Name des Supabase-Projekts und der Cloudflare-Zone

5. **Recovery-Codes.** Für jedes dieser Konten die Zwei-Faktor-Recovery-Codes
   erzeugen und in dieselbe Ablage legen. Sortiert nach Schaden bei Verlust:

   | Konto | Warum der Verlust das Projekt beenden würde |
   |---|---|
   | Google (`marlo07drews@gmail.com`) | Zuerst, weil es der Wiederherstellungsweg für alle anderen ist. Trägt außerdem den OAuth-Client für Google-Sign-in. |
   | Supabase | Datenbank und Storage. Verlust = alle Nutzerdaten, und auf dem Free-Tier gibt es kein automatisches Backup, das einspringt. |
   | Cloudflare | DNS für plexive.org **und** der Tunnel. Verlust nimmt die API vom Netz und die Domain in Geiselhaft. |
   | GitHub (`MarloDrews`) | Code, Ruleset und das private Content-Repository. |
   | Registrar von plexive.org | Die Nameserver liegen bei Cloudflare, die Domain selbst nicht zwingend. |
   | Vercel | Am wenigsten kritisch: das Frontend lässt sich anderswo neu deployen. |

   Nicht auf dieser Liste, weil ersetzbar: `JWT_SECRET`. Geht es verloren, werden
   alle Sessions ungültig und alle müssen sich neu anmelden -- ärgerlich, aber
   kein Datenverlust.

6. Wiederholen, wenn sich eine Variable ändert. `EnvironmentFile=` wird nur beim
   Start gelesen, also fällt eine veraltete Kopie sonst erst im Ernstfall auf.

---

## Netzwerk

- **App-Zugriff:** `https://plexive.org` – öffentlich, kein Tailscale nötig.
- **Wartungszugang zum Pi:** weiterhin Tailscale.

| Gerät | Tailscale-IP | Hostname | Identität |
|---|---|---|---|
| Raspberry Pi | **100.64.140.55** | `gommehd` | `silas-mack@` (GitHub-Login) |
| Windows-PC | 100.120.205.125 | `desktop-h00vcgb` | `silas-mack@` |

- Für SSH auf den Pi braucht das Gerät weiterhin den Tailscale-Client im selben
  Tailnet. Weitere Admins: in der Tailscale-Admin-Konsole per „Invite" einladen.

---

## Routine: Befehle

```bash
# Status beider Dienste
systemctl status deepscroll-backend cloudflared --no-pager

# Logs (immer den UNTERSTEN, aktuellsten Block lesen!)
journalctl -u deepscroll-backend --no-pager -n 50
journalctl -u cloudflared --no-pager -n 50

# Neustart
sudo systemctl restart deepscroll-backend
sudo systemctl restart cloudflared

# Health-/Daten-Check direkt auf dem Pi (umgeht Browser + Tunnel)
curl http://localhost:8000/health          # → {"status":"ok"}
curl http://localhost:8000/api/interests    # → lange Liste

# Health-Check von außen (prüft zusätzlich den Tunnel)
curl https://api.plexive.org/health         # → {"status":"ok"}

# Tailscale (nur Wartungszugang)
tailscale status
```

### Update einspielen (manuell)

```bash
cd /home/silas/deepscroll && git pull && \
  cd backend && .venv/bin/pip install -r requirements.txt && \
  sudo systemctl restart deepscroll-backend
```

Das Frontend deployt Vercel automatisch beim Push auf `main` – auf dem Pi ist
dafür nichts mehr zu tun. Danach im Browser **hart neu laden** (Inkognito oder
Strg+Shift+R).

Ändert ein Update das **Schema**, vorher das passende Skript aus
`backend/scripts/` gegen die Live-DB laufen lassen (siehe „Bekannte Fallstricke").

---

## Debugging-Playbook (in dieser Reihenfolge)

Diese Schichtung hat sich bewährt – sie sagt, in welcher Ebene es klemmt:

1. **Dienste laufen?** `systemctl status …` → `active (running)`?
   - Achtung: `active (running)` kann ein kurzer Moment in einer **Crash-Schleife**
     sein. Gegencheck: zeigt `journalctl` einen hochzählenden „restart counter"?
     Ändert sich die „Main PID" bei wiederholtem `status`-Aufruf? → dann crasht er.
2. **Backend erreichbar?** auf dem Pi: `curl http://localhost:8000/health`
   und `.../api/interests`.
   - Antwortet nichts trotz „running" → Crash-Schleife → `journalctl` lesen.
3. **Tunnel erreichbar?** von außen: `curl https://api.plexive.org/health`.
   - Lokal ok, von außen nicht → Fehler liegt bei cloudflared oder im DNS:
     `journalctl -u cloudflared` und `cloudflared tunnel list`.
4. **Browser: was wird wirklich versucht?** F12 → Netzwerk → Strg+Shift+R.
   Ziel-URL und Status der gescheiterten `api/...`-Requests ablesen.
5. **CORS-Header-Test** (wenn Requests die richtige URL treffen, aber blocken):
   ```bash
   curl -s -D - -o /dev/null -H "Origin: https://plexive.org" \
     http://localhost:8000/api/interests | grep -i access-control
   ```
   Muss `access-control-allow-origin: https://plexive.org` zeigen.
6. **WebSocket bricht nach ~100 s ab?** Der Client pingt alle 45 s
   (`HEARTBEAT_MS` in `frontend/src/lib/*Socket.ts`), damit Cloudflare den
   Socket nicht als „idle" schließt. Im Netzwerk-Tab unter WS prüfen, ob die
   `ping`/`pong`-Paare laufen – fehlen sie, läuft ein altes Bundle.

---

## Bekannte Fallstricke (real aufgetreten)

- **Schema vergessen oder Slash am Ende:** `FRONTEND_ORIGIN=plexive.org` oder
  `https://plexive.org/` → CORS blockt (Status 200, aber Header fehlt). Muss exakt
  `https://plexive.org` sein. Gleiches gilt für `NEXT_PUBLIC_API_URL`.
- **Env-Variablenname falsch:** Code erwartet `SUPABASE_SERVICE_KEY`, in der Env
  stand `SUPABASE_SERVICE_ROLE` → `KeyError` beim Start → Crash-Schleife.
- **Env-Änderung ohne Restart:** systemd liest `EnvironmentFile` nur beim Start →
  nach jeder Änderung `sudo systemctl restart deepscroll-backend`.
- **Frontend-Fix „nicht sichtbar":** fast immer Browser-Cache → Inkognito / „Cache
  deaktivieren" im Netzwerk-Tab / anderes Gerät. Oder das Vercel-Deployment ist
  noch nicht durch – im Vercel-Dashboard den Build-Status prüfen.
- **`NEXT_PUBLIC_API_URL` in Vercel geändert, aber nichts passiert:** Der Wert wird
  zur Build-Zeit eingebacken. Nach einer Änderung neu bauen, nicht nur redeployen.
- **`tailscale status` listet ≠ verbunden:** Gerät kann „logged out"/„NoState" sein,
  obwohl es in der Liste steht. Fix: Tailscale-Dienst neustarten, ggf. Windows-Reboot,
  dann `tailscale up`. Verbindung mit `tailscale ping <andere-ip>` prüfen (nicht die
  eigene IP pingen → „is local Tailscale IP").
- **`secret`/`.env`-Datei als `silas` nicht lesbar:** beabsichtigt (`chmod 600`,
  `root:root`). Für manuelle Tests/Seed `sudo` nutzen; systemd liest sie als root.
- **Log richtig lesen:** `journalctl` zeigt auch alte gescheiterte Startversuche.
  Immer den **untersten Block mit der aktuellsten Uhrzeit** auswerten.

---

## Offene Punkte / To-do

- **Rate-Limits teilen sich einen Bucket.** Hinter dem Tunnel sieht das Backend für
  jeden Nutzer `127.0.0.1`, weil `cloudflared` per Loopback verbindet. Alle
  Per-IP-Limits (`request.client.host` in `auth.py`, `feed.py`, `search.py` u. a.)
  und das WS-Handshake-Limit von 30/min gelten damit für alle Nutzer gemeinsam.
  Bei wenigen Testern meist unkritisch, aber das Login-Limit kann kollektiv
  aussperren. Sauberer Fix: echte Client-IP aus `CF-Connecting-IP` lesen, aber nur
  wenn der Peer in `TRUSTED_PROXY_IPS` steht. Noch offen.
- **Backend-Update auf dem Pi ist manuell.** Vercel deployt das Frontend beim Push
  auf `main` automatisch; auf dem Pi bleibt `git pull` + `systemctl restart` von
  Hand. Auto-Deploy per systemd-Timer (Self-Pull) wäre die einfachste Ergänzung.
- **Schema-Migrationen:** Alembic ist seit dem 28.08.2026 eingerichtet
  (`backend/alembic/`) und seit demselben Tag **gestempelt**: `alembic_version`
  enthält `0001`. `create_all` fügt weiterhin keine neuen Spalten zu bestehenden
  Tabellen hinzu, und die 17 Skripte in `backend/scripts/` bleiben.
  Die Befehle -- Backup, Drift lesen, stempeln, bestätigen, anwenden, prüfen --
  stehen als nummerierte Liste unter „Schema-Migrationen (Alembic)" weiter oben
  in dieser Datei. Warum die Reihenfolge so ist und was vorher gemessen wurde,
  steht in `docs/research/schema-drift-2026-08.md`.
  **Offen:** Revision `0002` (löscht drei redundante Indizes) liegt bereit und
  ist noch **nicht angewendet**; solange das so ist, meldet `alembic check`
  Exit 127, weil die Datenbank hinter `head` steht. Danach offen:
  `RUN_STARTUP_DDL=0` in `/etc/deepscroll/backend.env`, damit nicht zwei
  Mechanismen dasselbe Schema anfassen.
- **Single Point of Failure:** Strom- oder Internetausfall zu Hause legt das
  Backend lahm. Für die Testphase akzeptabel.
