# Foreman — backend + landing page

A small Express server that serves the Foreman landing page and powers a real,
working waitlist: signup, duplicate detection, a live signup counter, and an
admin CSV export. Data is stored in a JSON file on disk (`data/waitlist.json`),
which is fine at waitlist scale — see "Scaling up" below if you outgrow it.

## Run it locally

```bash
npm install
cp .env.example .env      # then open .env and set a real ADMIN_KEY
npm start
```

Visit `http://localhost:3000`. Sign up with an email, then check:

- `http://localhost:3000/api/waitlist/count` — live count
- `http://localhost:3000/api/waitlist/export?key=YOUR_ADMIN_KEY` — CSV of every signup
- `http://localhost:3000/api/waitlist?key=YOUR_ADMIN_KEY` — same data as JSON

## Project layout

```
foreman-backend/
  server.js          the whole backend: routes + JSON file storage
  package.json
  .env.example        copy to .env and fill in
  public/
    index.html        the landing page (calls the API below)
  data/                created automatically at runtime, holds waitlist.json
```

## API

| Method | Route                          | Purpose                                   |
|--------|---------------------------------|--------------------------------------------|
| POST   | `/api/waitlist`                 | Body `{ "email": "..." }`. Adds a signup, returns `{ number }`. |
| GET    | `/api/waitlist/count`           | Public. Returns `{ count, displayCount }`. |
| GET    | `/api/waitlist?key=ADMIN_KEY`   | Admin. Full JSON list of signups.          |
| GET    | `/api/waitlist/export?key=ADMIN_KEY` | Admin. Downloads a CSV of signups.    |
| GET    | `/api/health`                   | Returns `{ ok: true }`, useful for host health checks. |

## Deploying

This is a normal Node/Express app, so it runs on any Node host. Two easy free-tier options:

### Render
1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com) → New → Web Service → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables from `.env.example` in the Render dashboard (at minimum, set `ADMIN_KEY`).
5. **Important:** Render's free tier has an ephemeral filesystem on redeploys — attach a persistent disk (Render → your service → Disks) mounted at `/opt/render/project/src/data` so `waitlist.json` survives deploys. Otherwise use the Postgres option below.

### Railway
1. Push to GitHub, then [railway.app](https://railway.app) → New Project → Deploy from repo.
2. Railway auto-detects Node and runs `npm start`.
3. Set env vars in the Railway dashboard.
4. Add a volume mounted at `/app/data` so signups persist across deploys.

### Fly.io / a plain VPS
Works the same way — `npm install && npm start`, behind a reverse proxy (Caddy/Nginx) for HTTPS if you're on a bare VPS. Just make sure whatever disk `data/` lands on is persistent.

## Environment variables

See `.env.example`. Key ones:

- `ADMIN_KEY` — required to view/export signups. **Change this before deploying.**
- `BASE_COUNT` — a vanity number added to the real count shown on the page (e.g. so it doesn't start at "0 people on the list").
- `SMTP_*` / `NOTIFY_TO` — optional. If set, you get an email every time someone joins the waitlist. Leave blank to disable.

## Scaling up

The JSON file store is intentionally simple and works well for hundreds to low
thousands of signups on a single server instance. If you outgrow it (multiple
server instances, need for real querying, want signups even if the disk gets
wiped), swap `readDb`/`writeDb` in `server.js` for a real database — Postgres
via Supabase or Neon are both easy managed options with generous free tiers,
and the rest of the API surface won't need to change.
