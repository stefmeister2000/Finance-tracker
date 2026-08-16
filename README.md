# Finance Tracker

A local-first personal & business finance tracker: transactions, invoices, subscriptions,
fixed costs, net worth, product margins, a 24-month financial model, funding/cap table,
inventory and more. React + TypeScript + Vite front end, with a small Express + SQLite
API for persistence.

> **Data stays local.** The SQLite database (`server/data.sqlite`) holds your financial
> data and any API keys and is **git-ignored** — it is never committed.

## Run

```bash
npm install
npm run build      # build the front end
npm run dev:api    # or: node server/index.js  — serves the app + API on http://localhost:3001
```

Then open http://localhost:3001.

For development with hot-reload: `npm run dev` (Vite dev server + API).

## Scripts

- `npm run dev` — Vite dev server + API together
- `npm run build` — production build into `dist/`
- `npm run dev:api` — API/server only (serves the built app too)

## Stack

- React 18, TypeScript, Vite
- Recharts for charts
- Express 5 + better-sqlite3 for the API/storage
