# Deepscroll – Server-Referenz (Raspberry Pi)

Stand: 11. Juni 2026. Diese Datei dokumentiert das laufende Deployment auf dem
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

Frontend (Next.js, Port 3000) und Backend (FastAPI/uvicorn, Port 8000) laufen als
zwei systemd-Services auf dem Pi. Die DB liegt extern auf **Supabase (PostgreSQL)**,
Datei-Uploads auf **Supabase Storage**. Zugriff erfolgt privat über **Tailscale**.

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
  - Steht spaeter ein echter Reverse-Proxy davor, der TLS terminiert, dessen IP
    in `TRUSTED_PROXY_IPS` eintragen (nur dann wird sein `x-forwarded-proto`
    ausgewertet). Solange ohne Proxy: leer lassen.
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
FRONTEND_ORIGIN=http://100.64.140.55:3000   # ACHTUNG: mit http:// und Port, ohne / am Ende
# TRUSTED_PROXY_IPS=127.0.0.1,10.0.0.0/8    # optional: nur setzen, wenn ein TLS-terminierender
#                                             Reverse-Proxy davorsteht; dessen x-forwarded-proto
#                                             wird nur von diesen IPs/CIDRs vertraut. Leer/ungesetzt
#                                             ohne Proxy (aktueller Tailscale-Betrieb).
```

> Vollständige Liste der vom Code zwingend erwarteten Variablen jederzeit prüfen mit:
> `grep -rhno "os.environ\[[^]]*\]" /home/silas/deepscroll/backend/app/ | sort -u`

## Frontend

- **Service:** `deepscroll-frontend` (systemd)
- **Unit:** `/etc/systemd/system/deepscroll-frontend.service`
- **Port:** 3000
- **Läuft über nvm-Node** → die Unit braucht den nvm-Pfad in `PATH` und im `ExecStart`,
  sonst findet npm sein node nicht:
  ```ini
  Environment=PATH=/home/silas/.nvm/versions/node/v24.16.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  ExecStart=/home/silas/.nvm/versions/node/v24.16.0/bin/npm run start
  ```
  > Wenn Node per nvm aktualisiert wird, ändert sich `v24.16.0` → Unit anpassen!
- **Build-Variable:** `/home/silas/deepscroll/frontend/.env.production.local`
  ```
  NEXT_PUBLIC_API_URL=http://100.64.140.55:8000   # mit http:// und Port 8000
  ```
  > **Wird zur BUILD-Zeit fest ins Bundle eingebacken**, nicht zur Laufzeit gelesen.
  > Jede Änderung erfordert ein neues `npm run build` – ein bloßer Restart reicht NICHT.

## Datenbank & Storage

- **DB:** Supabase PostgreSQL, Verbindung über `DATABASE_URL`.
- **Storage:** Supabase Storage (Bucket für Uploads), Zugriff serverseitig über
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Service-Key **niemals** ins Frontend.
- **Seed:** einmalig befüllt; bei Bedarf erneut:
  ```bash
  cd /home/silas/deepscroll/backend
  sudo env $(sudo cat /etc/deepscroll/backend.env | grep -v '^#' | xargs) .venv/bin/python seed.py
  ```

## Netzwerk / Tailscale

| Gerät | Tailscale-IP | Hostname | Identität |
|---|---|---|---|
| Raspberry Pi | **100.64.140.55** | `gommehd` | `silas-mack@` (GitHub-Login) |
| Windows-PC | 100.120.205.125 | `desktop-h00vcgb` | `silas-mack@` |

- **App immer über `http://100.64.140.55:3000` aufrufen** – auch im Heim-WLAN.
  Grund: Die API-URL ist auf die Tailscale-IP gebaut; bei Zugriff über die alte
  LAN-IP passen Origin und einkompilierter API-Pfad nicht zusammen → „Loading…"/CORS.
- Jedes zugreifende Gerät braucht den Tailscale-Client, im selben Tailnet eingeloggt.
- Weitere Admins: in der Tailscale-Admin-Konsole per „Invite" einladen.

---

## Routine: Befehle

```bash
# Status beider Dienste
systemctl status deepscroll-backend deepscroll-frontend --no-pager

# Logs (immer den UNTERSTEN, aktuellsten Block lesen!)
journalctl -u deepscroll-backend --no-pager -n 50
journalctl -u deepscroll-frontend --no-pager -n 50

# Neustart
sudo systemctl restart deepscroll-backend
sudo systemctl restart deepscroll-frontend

# Health-/Daten-Check direkt auf dem Pi (umgeht Browser + Tailscale)
curl http://localhost:8000/health          # → {"status":"ok"}
curl http://localhost:8000/api/interests    # → lange Liste

# Tailscale
tailscale status
```

### Update einspielen (manuell)

```bash
cd /home/silas/deepscroll && git pull && \
  cd backend && .venv/bin/pip install -r requirements.txt && \
  cd ../frontend && npm install && npm run build && \
  sudo systemctl restart deepscroll-backend deepscroll-frontend
```

Nach dem Build: prüfen, dass die **Routen-Tabelle** erscheint (nicht „Killed").
Danach im Browser **hart neu laden** (Inkognito oder Strg+Shift+R).

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
3. **Browser: was wird wirklich versucht?** F12 → Netzwerk → Strg+Shift+R.
   Ziel-URL und Status der gescheiterten `api/...`-Requests ablesen.
4. **CORS-Header-Test** (wenn Requests die richtige URL treffen, aber blocken):
   ```bash
   curl -s -D - -o /dev/null -H "Origin: http://100.64.140.55:3000" \
     http://localhost:8000/api/interests | grep -i access-control
   ```
   Muss `access-control-allow-origin: http://100.64.140.55:3000` zeigen.

---

## Bekannte Fallstricke (real aufgetreten)

- **`http://` vergessen:** `FRONTEND_ORIGIN=100.64.140.55:3000` ohne Schema → CORS
  blockt (Status 200, aber Header fehlt). Muss `http://...` sein. Gleiches gilt für
  `NEXT_PUBLIC_API_URL`.
- **Env-Variablenname falsch:** Code erwartet `SUPABASE_SERVICE_KEY`, in der Env
  stand `SUPABASE_SERVICE_ROLE` → `KeyError` beim Start → Crash-Schleife.
- **Env-Änderung ohne Restart:** systemd liest `EnvironmentFile` nur beim Start →
  nach jeder Änderung `sudo systemctl restart deepscroll-backend`.
- **Frontend-Fix „nicht sichtbar":** fast immer Browser-Cache → Inkognito / „Cache
  deaktivieren" im Netzwerk-Tab / anderes Gerät. Oder `npm run build` lief nicht
  frisch. Verifizieren mit `grep -rl "<text-aus-fix>" frontend/.next/`.
- **`npm run build` bricht still mit „Killed" ab** (zu wenig RAM): `next start` läuft
  dann mit altem Bundle weiter. Bei Bedarf Swap erhöhen. Immer aufs Build-Ende achten.
- **Falscher Zugriffspfad:** App über LAN-IP statt Tailscale-IP aufgerufen → nur
  Skelett/„Loading…", weil die einkompilierte API-URL nicht zum Origin passt.
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

- **WebSocket-Chat über Tailscale.** Der Tailscale-Bereich `100.64.0.0/10` ist im
  WS-Gate (`app/ws_security.py`) inzwischen als lokal erlaubt (BUG-012), plain
  `ws://` über Tailscale verbindet also direkt, ohne Reverse-Proxy. `x-forwarded-proto`
  wird nur noch von IPs aus `TRUSTED_PROXY_IPS` ausgewertet (SEC-004/029).
- **Auto-Deploy (GitHub Actions Self-hosted Runner) noch nicht eingerichtet.**
  Braucht Repo-Admin-Rechte vom Owner. **Sicherheitswarnung:** Repo ist öffentlich –
  Runner nur mit Trigger `push: main` (nicht `pull_request`) und deaktivierten
  Fork-PR-Workflows betreiben. Alternative ohne Owner-Rechte: Self-Pull per
  systemd-Timer.
- **Schema-Migrationen:** `create_all` fügt keine neuen Spalten zu bestehenden
  Tabellen hinzu. Sobald ein Update das Schema ändert → **Alembic** einführen.
  Bis dahin: nur Code-Updates sind gefahrlos.
- **Build-RAM:** falls `npm run build` zunehmend „Killed" wirft → Swap erhöhen oder
  woanders bauen und nur `.next` auf den Pi kopieren.
