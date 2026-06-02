# Fit List PWA

A Progressive Web App for organizing family gift ideas, clothing sizes, and shared shopping lists. Built for self-hosting on a Raspberry Pi (or any machine) with Docker.

## Stack

- **Frontend**: HTML/CSS/JS PWA (`public/`)
- **Backend**: Node.js + Express (`server.js`)
- **Database**: PostgreSQL 15
- **Auth**: JWT + bcrypt (register/login)

## Features

- Landing page with **login / register**
- Per-account kid profiles: sizes, style notes, gift ideas, purchase history
- **Family sharing**: invite codes, username search, access requests with owner approve/deny
- **Gift claims** sync to the server when browsing a shared family list
- Installable PWA with offline shell caching

## Run on Raspberry Pi 5 (Ubuntu + Docker)

```bash
git clone <your-repo> fitlist-pwa
cd fitlist-pwa
cp .env.example .env
# Edit .env — set a long random JWT_SECRET
docker compose up -d --build
```

First build may take several minutes on a Pi (native `bcrypt` compile).

Open in a browser on your LAN:

- **Home / login**: `http://<pi-ip>:4173/`
- **App** (after login): `http://<pi-ip>:4173/app`

### Suggested workflow for two parents

1. Partner A registers (e.g. username `mom`, display name Mom).
2. Partner A adds kids and gift ideas in the app.
3. Partner A opens **Family** → **Generate invite code** and shares it with Partner B.
4. Partner B registers (`dad`), opens **Family** → pastes code → **Join with code**.
5. Partner B browses Mom’s list and claims gifts (claims save to the server).

Alternatively, Partner B can search for `mom` and **Request access**; Mom approves under **Sharing** or in the Family panel.

## Local development (without Docker)

```bash
npm install
# Start Postgres locally and set DATABASE_URL in .env
npm start
```

Generate PWA icons after clone:

```bash
node scripts/generate-icons.js
```

## Environment


| Variable       | Description                      |
| -------------- | -------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string     |
| `JWT_SECRET`   | Secret for signing auth tokens   |
| `PORT`         | HTTP port (default `4173`)       |
| `HOST`         | Bind address (default `0.0.0.0`) |


## Project structure

- `public/index.html` — landing + auth
- `public/app.html` — main application UI
- `public/app.js` — app logic
- `public/auth.js` — login/register on landing
- `server.js` — API, auth, Postgres schema
- `docker-compose.yml` — Postgres + app services

## App store later

This PWA can be wrapped with [Capacitor](https://capacitorjs.com/) or a Trusted Web Activity for iOS/Android store distribution without changing the core API.