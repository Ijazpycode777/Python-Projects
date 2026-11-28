# SmartCampus 360 — AI-Powered Intermediate College Management System

A complete, production-oriented full-stack college management application for an
**Intermediate college in Punjab, Pakistan**. It provides three independent
role-based portals (Admin / Teacher / Student) that all communicate with one
centralized Express backend and one shared **SQLite** database.

> Built with React + Vite + TypeScript + Tailwind on the frontend and Node.js +
> Express + better-sqlite3 on the backend, following a compact monolithic
> single-file source architecture (`index.tsx` for the frontend and `server.js`
> for the backend).

---

## 1. What's inside

### Ten original college modules (Admin)
1. Admissions & Registration (with OCR-assisted field check)
2. Student & Teacher Management
3. Attendance Management (with correction requests)
4. Examination & Marks Management
5. Automatic Results & Grades (configurable grading policy)
6. Fee Management (challans, payments, concessions)
7. Timetable & Classes (with conflict detection + AI Architect suggestions)
8. Study Materials (group/part-scoped uploads)
9. Notices & Announcements
10. Admin Analytics Dashboard (real database metrics)

### Ten advanced Admin features
AI Campus Intelligence · Predictive Student Analytics · AI Timetable Architect ·
Smart Approval Engine · Digital Campus Map · Intelligent Document Verification ·
Financial Forecasting · Smart Complaint Intelligence · Workforce Optimization ·
Academic Session Command Center (Part 1 → Part 2 promotion).

### Ten advanced Student features
AI Personal Study Companion (RAG over uploaded materials) · Adaptive Learning
Roadmap · Exam Readiness Simulator · Achievement & Skill Passport · Smart Daily
Planner · Digital Campus Identity Wallet · Collaborative Project Hub · Career &
Skill Navigator · Campus Service Booking · Academic Journey Timeline.

### Ten advanced Teacher features
AI Teacher Co-Pilot · Intelligent Assessment Studio · Classroom Learning Heatmap ·
AI Feedback Assistant · Interactive Digital Classroom · Syllabus Velocity Tracker ·
Student Support Case Manager · Teaching Knowledge Library · Smart Workload
Manager · Unified Communication Center.

### Intermediate-specific
Five academic groups (ICS, FSc Pre-Medical, FSc Pre-Engineering, FA, ICom) ·
Part 1 / Part 2 · Academic session management · BISE board registration records ·
Send-up + practical + theory examinations · Part 1 → Part 2 promotion workflow.

### Global Campus AI Agent
A role-scoped assistant that uses only the user's authorized data and never
performs sensitive administrative actions on its own.

---

## 2. Technology stack

| Layer        | Choice |
|---|---|
| Frontend     | React 18, Vite 5, TypeScript, Tailwind CSS, React Router, Recharts, Lucide React |
| Backend      | Node.js, Express, JavaScript (ESM), Socket.IO |
| Database     | SQLite via better-sqlite3 (the **only** database — no Postgres/MySQL/Mongo) |
| Security     | argon2id password hashing, Helmet + CSP, double-submit CSRF tokens, server-side SQLite-backed sessions, AES-256-GCM session-data encryption, express-rate-limit, strict file-upload validation, audit logs |
| Real-time    | Socket.IO for live notifications (auth + role rooms) |
| AI           | Pluggable `AI_API_KEY` — when unset, features degrade to deterministic rule-based responses (never pretend to call a live service) |

---

## 3. Project layout

```
smartcampus-360/
├── index.html            # Vite HTML entry
├── index.tsx             # Whole React app (3 portals, dashboards, all modules)
├── server.js             # Whole Express backend (schema, auth, APIs, sockets)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── .gitignore
├── render.yaml           # Render Blueprint (web service + persistent disk)
├── README.md
├── src/
│   └── styles.css         # Tailwind directives + theme/print rules
├── public/
│   └── assets/
├── data/                  # SQLite database (created on first run, persisted)
│   └── .gitkeep
└── uploads/               # Private uploaded files (NOT under public/)
    └── .gitkeep
```

---

## 4. Prerequisites

- Node.js ≥ 18 (tested on Node 20 / 22 / 24)
- npm ≥ 9
- Native build tools for `argon2` and `better-sqlite3`:
  - Linux: `python3 make g++ libsqlite3-dev`
  - macOS: Xcode command-line tools
  - Windows: `windows-build-tools` or Visual Studio Build Tools

---

## 5. Quick start (development)

```bash
# 1. Unzip the project
unzip smartcampus-360.zip
cd smartcampus-360

# 2. Copy environment config and generate strong secrets
cp .env.example .env
# Edit .env and set:
#   SESSION_SECRET            = $(openssl rand -hex 64)
#   SESSION_ENCRYPTION_KEY    = $(openssl rand -base64 32)

# 3. Install dependencies (builds native modules)
npm install

# 4. Run BOTH the backend (port 4000) and the Vite dev server (port 5173)
npm run dev

# 5. Open the app
# Frontend:  http://localhost:5173
# Backend:    http://localhost:4000/api/health
#
# Default admin:  username: admin    password: Admin@12345
# (Change the password immediately under Settings.)
```

The Vite dev server proxies `/api`, `/socket.io`, and `/uploads` to the
Express backend, so a single `npm run dev` is enough.

---

## 6. Production build & run (local)

```bash
# Build the Vite frontend into dist/
npm run build

# Start the production server (serves API + compiled frontend on one port)
NODE_ENV=production npm start
# Open http://localhost:4000
```

In production the Express process serves both `/api/*` and the static `dist/`
assets, so the deployment exposes a single port.

---

## 7. Deploy on Render (recommended)

This project ships with a [`render.yaml`](./render.yaml) Blueprint so you can
deploy with a few clicks. Render runs one Node Web Service that serves the
API and the built frontend on a single port, with an attached persistent Disk
for the SQLite database and uploaded files.

### One-click Blueprint deploy

1. Push this project to a GitHub or GitLab repository.
2. In Render, go to **New → Blueprint** and select your repository.
3. Render reads `render.yaml` and creates:
   - A **Web Service** (`smartcampus-360`) running `npm install && npm run build`
     then `npm start`, with a health check on `/api/health`.
   - A **persistent Disk** (1 GB) mounted at `/var/data` for the SQLite DB and
     uploads, so your data survives every deploy and restart.
   - Auto-generated secrets for `SESSION_SECRET` and `SESSION_ENCRYPTION_KEY`.
4. After the first deploy finishes, open the service URL and log in with
   `admin` / `Admin@12345`, then **change the password immediately** in
   **Settings → Change password**.
5. (Optional) Edit `render.yaml` and set `FRONTEND_URL` to your real Render
   URL (e.g. `https://smartcampus-360.onrender.com`) so CORS / CSRF Origin
   validation matches exactly. Re-deploy.

### Manual deploy (without the Blueprint)

If you prefer to configure Render by hand:

1. **New → Web Service** → connect your repo.
2. **Runtime:** Node, **Build Command:** `npm install && npm run build`,
   **Start Command:** `npm start`.
3. **Plan:** Starter or above (the free tier does **not** support persistent
   disks — your SQLite DB would reset on every deploy there).
4. Add a **Disk** (1 GB) mounted at `/var/data`.
5. Set environment variables (see `render.yaml` for the full list). Mark
   `SESSION_SECRET` and `SESSION_ENCRYPTION_KEY` as **Generated Value** so
   Render creates strong random secrets for you.
6. Set `DATABASE_PATH=/var/data/smartcampus.db` and
   `FILE_STORAGE_PATH=/var/data/uploads` so data lives on the disk.

### Why a persistent disk matters

SQLite is an embedded file database. Render's ephemeral filesystem is wiped
on every deploy, so the database file **must** live on the attached disk
(`/var/data`). The `render.yaml` Blueprint sets this up for you. Without the
disk you would lose all data on every deploy.

---

## 8. Environment variables

| Variable                  | Required | Description |
|---|---|---|
| `PORT`                    | no       | Express port (default 4000) |
| `NODE_ENV`                | no       | `development` / `production` |
| `SESSION_SECRET`          | **yes**  | Random hex string for cookie signing |
| `SESSION_ENCRYPTION_KEY` | **yes**  | 32-byte base64 key for AES-256-GCM session data at rest |
| `DATABASE_PATH`           | no       | SQLite file path (default `./data/smartcampus.db`) |
| `FRONTEND_URL`            | no       | Frontend origin for CORS / CSRF validation |
| `AI_API_KEY`              | no       | External AI provider key (optional; features degrade gracefully without it) |
| `FILE_STORAGE_PATH`       | no       | Upload directory (default `./uploads`) |
| `SESSION_MAX_AGE`         | no       | Session max age in ms (default 8h) |
| `SESSION_INACTIVITY_TIMEOUT` | no    | Inactivity timeout in ms (default 30 min) |

The server refuses to start if `SESSION_SECRET` is missing or unchanged, and
crashes in production if `SESSION_ENCRYPTION_KEY` is missing.

---

## 9. Security highlights

- **Passwords**: hashed with argon2id. Never logged, never returned in API
  responses. Account lockout after 5 failed attempts.
- **Sessions**: stored server-side in SQLite (`connect-sqlite3`), HttpOnly
  cookies, SameSite=Lax, `Secure` in production. Session IDs regenerated on
  login and on password change. Inactivity + absolute timeouts. Other
  sessions are revoked on password change.
- **Session data at rest**: sensitive markers are encrypted with AES-256-GCM
  before being stored in the session row (separate from cookie signing).
- **CSRF**: double-submit cookie (`sc.csrf`) plus `X-CSRF-Token` header
  validation on all POST/PUT/PATCH/DELETE, with constant-time comparison and
  Origin/Referer defense in depth. Login and forgot-password endpoints
  follow a separate flow but still go through the Origin check.
- **XSS**: React safe-rendering, Helmet + strict CSP, no `dangerouslySetInnerHTML`.
- **SQL injection**: every query uses `better-sqlite3` prepared statements
  with bound parameters. No string concatenation of user input.
- **File uploads**: strict MIME allowlist, no executables, sanitized filenames,
  10 MB cap, stored outside `public/`, served through an authenticated route
  with path-traversal protection.
- **Rate limiting**: 300 req/min on `/api`, 20 req/15min on `/api/auth`.
- **Audit logs**: every sensitive action is recorded with actor, action,
  entity, IP and timestamp.
- **Error handling**: no stack traces leaked in production responses.

---

## 10. AI integration

Every AI feature has a transparent, deterministic local fallback so the app
is fully functional without any external service. When `AI_API_KEY` is set,
the integration points in `server.js` are clearly marked and ready to forward
to your provider of choice — see the `// Real integration point` comments in
the `/api/ai/*` routes. The app **never** pretends an unconfigured service is
working: every AI response honestly reports whether it came from a local
rule-based engine or a live provider.

---

## 11. Default accounts

| Role    | Username | Password       | Notes |
|---|---|---|---|
| Admin   | `admin`  | `Admin@12345`  | Created automatically on first server start. **Change immediately** in Settings → Change password. |
| Teacher | (admin creates) | (admin sets) | Admin creates teacher accounts under Admin → Users. |
| Student | (auto on admission approval, or admin creates) | (temp password) | Student is forced to change password at first login. |

---

## 12. Scaling & SQLite

SQLite is a file-embedded, single-writer database. This system intentionally
runs as **one** application instance with a persistent volume — exactly as
the deployment files configure. If your college grows to need horizontal
scaling, you would need to migrate to a server database (PostgreSQL/MySQL).
That change is out of scope here; do not silently swap the database.

---

## 13. Database backup & restore

```bash
# Local backup (online, consistent — better-sqlite3 runs in WAL mode)
sqlite3 data/smartcampus.db ".backup 'data/backup-$(date +%F).db'"

# Local restore: stop the server, replace the file, restart
cp data/backup-2026-05-31.db data/smartcampus.db

# On Render: use the Render dashboard "Disk Snapshot" feature to back up the
# 1 GB persistent disk. Restoring a snapshot remounts the disk as it was at
# the snapshot time — no manual file copy needed.
```

The SQLite database is never recreated on server restart. The schema uses
`CREATE TABLE IF NOT EXISTS` and a versioned `pragma user_version`, so
upgrades are migration-driven and never destroy existing data.

---

## 14. Scripts

| Script | Action |
|---|---|
| `npm run dev` | Run backend (port 4000) + Vite dev server (port 5173) together |
| `npm run dev:server` | Run only the backend |
| `npm run dev:web` | Run only the Vite dev server |
| `npm run build` | Build the Vite frontend into `dist/` |
| `npm start` | Run the production server (serves `dist/` + `/api`) |
| `npm run typecheck` | TypeScript type-check only |

Render runs `npm install && npm run build` at build time and `npm start` at
runtime, so no extra configuration is needed.

---

## 15. License

Provided as-is for educational and institutional use. Replace the placeholder
secrets, change the default admin password, and deploy behind HTTPS (Render
terminates TLS at its load balancer automatically — see `render.yaml`).
