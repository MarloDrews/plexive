# Deepscroll – Server-Referenz (Raspberry Pi)

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
```

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
- **Schema-Migrationen:** `create_all` fügt keine neuen Spalten zu bestehenden
  Tabellen hinzu. Sobald ein Update das Schema ändert → **Alembic** einführen.
  Bis dahin: das passende Skript aus `backend/scripts/` von Hand laufen lassen.
- **Single Point of Failure:** Strom- oder Internetausfall zu Hause legt das
  Backend lahm. Für die Testphase akzeptabel.
