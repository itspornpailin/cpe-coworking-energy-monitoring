# CPE Co-Working Space Dashboard

Web dashboard for brightness, temperature and air conditioner electricity in the CPE co-working space.

## Install first

- [Go](https://go.dev/dl/) 1.26.1 or newer
- [Node.js](https://nodejs.org/) 22.12 or newer
- [PostgreSQL](https://www.postgresql.org/download/) (tested with 17)
- goose (database migrations): `go install github.com/pressly/goose/v3/cmd/goose@latest`

## Set up (once)

**1. Create a database** called `cpe_coworking` (pgAdmin, or `CREATE DATABASE cpe_coworking;` in psql).

**2. Create the settings files** (from the project folder; works in PowerShell and Mac Terminal):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**3. Edit `backend/.env`:**

- `DATABASE_URL`: replace `CHANGE_ME` with your PostgreSQL password. If it contains `@ : / # ? %`, [percent-encode](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) those characters.
- `MOCK_SENSORS=true`: fake sensor data. Without it or real hardware, the dashboard is empty.
- `MQTT_ENABLED=false`: unless you have an MQTT broker.

**4. Create the tables** (use the same URL as `DATABASE_URL`):

```bash
cd backend
goose -dir migrations postgres "YOUR_DATABASE_URL" up
```

`goose` not found? Add the `bin` folder inside the folder that `go env GOPATH` prints to your PATH.

**5. Create an admin account** (still in `backend/`). The username needs 3 to 64 characters. Use a strong password.

Windows PowerShell:

```powershell
$env:ADMIN_USERNAME='yourname'; $env:ADMIN_PASSWORD='your password'; go run ./cmd/create-admin; Remove-Item Env:ADMIN_PASSWORD
```

Mac / Linux:

```bash
ADMIN_USERNAME=yourname ADMIN_PASSWORD='your password' go run ./cmd/create-admin
```

Accounts live only in your own database. Run the command again with another username to add another admin.

## Run (every time)

Terminal 1, the API:

```bash
cd backend
go run ./cmd/api
```

Terminal 2, the website:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Guests see the map and area conditions. Click **Login** for admin features.

## What an admin can do

- **Change a sensor's zone:** click the sensor on the map, then pick a zone.
- **Place or move sensors:** "Move sensors on the map" in "Sensors and zones". A new real sensor must be placed there before it shows on the map.
- **Set brightness limits:** "Settings" on a zone card.
- **Estimate AC electricity:** "Edit rating" for each air conditioner, with BTU/h and SEER from its label. ON time appears after each full hour.

Estimate: `kWh = BTU/h ÷ (SEER × (1 − M)^age) × ON hours ÷ 1000`, where `M` is 0.01 if serviced yearly, 0.03 if not.

## Real hardware

Set `MQTT_ENABLED=true`, `MOCK_SENSORS=false` and `MQTT_BROKER_URL`. Nodes publish JSON:

| Topic | Fields |
|---|---|
| `greenoffice/sensor/env/<node>` | `node_id`, `temperature_c`, `light_lux` |
| `greenoffice/sensor/ac/<node>` | `node_id`, `is_running` (needed for ON time), `vibration_raw` |
| `greenoffice/sensor/door/<node>` | `node_id` (`door_left` or `door_right`), `direction` (`IN` or `OUT`) |

`timestamp` (like `2026-11-28T13:00:00+07:00`) is optional. The door count is saved but not shown yet.

## If something breaks

- **After `git pull`:** run the `goose ... up` command again.
- **Page is empty or login fails:** the website address must equal `FRONTEND_ORIGIN` in `backend/.env`, and `VITE_API_BASE_URL` in `frontend/.env` must point to the API.
- **Still the wrong port:** a `VITE_API_BASE_URL` set in your terminal overrides `frontend/.env`. Open a new terminal.
- **Changed `backend/.env`:** restart the API.
- **Never commit** `.env` files. They hold your passwords.
