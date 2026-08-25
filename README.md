# Piassa Plate — Café Management System

A complete, role-based café/restaurant management platform: POS with receipt printing,
kitchen display, store/inventory (organized by category — fruits, vegetables, drinks, etc),
table & reservation management, customer loyalty, staff/shift scheduling, finance/expense
tracking, and sales reports.

## Roles supported
- **Owner** — full access to everything
- **Manager** — full operational access (menu, inventory, staff, finance, reports)
- **Cashier** — POS, tables/reservations, customers
- **Chef** — kitchen/bar display, inventory stock adjustments
- **Storekeeper** — full control of the store/inventory (add items, adjust stock, organize by category) but no menu pricing or financial access
- **Finance** — finance dashboard, expenses, reports

## Architecture
- **Backend**: Node.js + Express + SQLite via Node's **built-in** `node:sqlite` module (no native compiling, no build tools needed — works out of the box on Windows/Mac/Linux with Node 20+)
- **Frontend**: React (Vite), React Router, Recharts for analytics, plain CSS
- **Database**: SQLite file-based (`backend/data/cafe.db`), auto-created and seeded with demo data the first time you run it

---

## How to run the latest version

### 1. Unzip the project
Extract the zip anywhere, e.g. `Downloads\cafe-management-system`.

### 2. Start the backend
Open a terminal (PowerShell on Windows):
```powershell
cd path\to\cafe-management-system\backend
npm install
npm start
```
You should see:
```
Database seeded with demo data.
Demo logins (unique password per role):
 owner@cafe.com / Owner@2026
 manager@cafe.com / Manager@2026
 cashier@cafe.com / Cashier@2026
 finance@cafe.com / Finance@2026
 chef@cafe.com / Chef@2026
 storekeeper@cafe.com / Storekeeper@2026
Cafe management API running on http://localhost:4000
```
**Leave this terminal open** — it needs to keep running.

### 3. Start the frontend
Open a **second** terminal:
```powershell
cd path\to\cafe-management-system\frontend
npm install
npm run dev
```
You'll see a line like:
```
➜  Local:   http://localhost:5173/
```
Open that URL in your browser.

### 4. Log in
Each role has its own unique password — type the email and password in directly (there are no quick-login buttons on the live login screen anymore, since showing demo credentials publicly isn't safe once you're hosting this for real use):
| Role | Email | Password |
|---|---|---|
| Owner | owner@cafe.com | Owner@2026 |
| Manager | manager@cafe.com | Manager@2026 |
| Cashier | cashier@cafe.com | Cashier@2026 |
| Storekeeper | storekeeper@cafe.com | Storekeeper@2026 |
| Finance | finance@cafe.com | Finance@2026 |
| Chef | chef@cafe.com | Chef@2026 |

**Change these before giving real staff access** — go to Staff & Shifts as owner/manager and update each account's password (or create fresh accounts and disable these demo ones). You can also rename any account's display name there — click **Edit** next to a staff member in the Staff Accounts tab.

### If you update to a newer zip later
Whenever the **database structure** changes (new tables/columns), you'll need to reset the database once so it reseeds cleanly:
```powershell
cd backend
Remove-Item -Recurse -Force data
npm start
```
This wipes any test data you'd entered (orders, customers, etc.) and starts fresh with demo data. Regular code updates that don't touch the schema don't need this — just `npm install` again if `package.json` changed, then restart.

---

## What's implemented (end-to-end, tested)
- Login/JWT auth with per-route role checks enforced on the backend (not just hidden in the UI)
- **POS**: build an order from the menu, attach a table and/or customer, checkout with cash/card, auto-computes tax
- **Receipt printing**: after checkout, a formatted receipt pops up with a "Print Receipt" button — uses the browser's print function, so it works with any printer installed on the till computer, including thermal receipt printers
- Placing an order **automatically deducts ingredient stock** based on each menu item's recipe
- **Kitchen/Bar** live ticket queue (auto-refreshes every 5s), station-based so baristas and cooks each see only their own tickets
- Table status (free/occupied/reserved) and reservation booking/seating flow
- **Store/Inventory**: starts completely empty — no sample data pre-loaded. Add your own categories (Fruits, Vegetables, Drinks, Dairy, etc.) and stock items from the Inventory page. Shows live stock value in ETB, low-stock alerts, and a full Movement History tab (every purchase/waste/adjustment logged with who did it and when)
- Customer directory with loyalty points (auto-earned on checkout, redeemable)
- Staff accounts (owner/manager can create cashier/chef/storekeeper/finance/manager accounts) and shift scheduling
- Finance: expense logging + automatic profit & loss (revenue − COGS − expenses)
- **Activity Log** (owner-only): a running feed of every significant action across the system — orders placed and checked out, stock adjustments, staff accounts created, expenses added — each with who did it, their role, and a timestamp
- **Mobile-responsive**: on phones/tablets the sidebar becomes a slide-out menu (tap the ☰ icon), tables scroll horizontally instead of squeezing, and the POS screen stacks the menu above the cart instead of side-by-side
- Reports: daily revenue chart, top-selling items chart

## What you'll likely want to add before a real production launch
- **Payment processor integration** (Stripe/Square/etc.) — payments are currently logged, not actually charged
- **Real-time updates** — Kitchen display polls every 5s; swap for WebSockets/SSE for instant updates if needed
- **Multi-location support** — current schema is single-store
- **Automated tests** (manually verified end-to-end during this build, no test suite yet)
- **Backups** — SQLite is a single file; back up `backend/data/cafe.db` regularly, or migrate to PostgreSQL for hosted/multi-writer scale
- **HTTPS + a real reverse proxy** (nginx/Caddy) in front of both services when deployed
- **Rate limiting / audit logging** for sensitive actions (refunds, role changes)

A note on `node:sqlite`: it's Node's built-in SQLite support, marked "experimental" (you'll see a one-line warning in the server logs — expected and harmless). If you outgrow SQLite, swap it for `pg` and adjust `db.js` — the schema in `schema.sql` translates almost 1:1 to PostgreSQL.

---

## Deploying for free — Vercel (frontend) + Render (backend)

### 1. Push to GitHub
```powershell
cd path\to\cafe-management-system
git init
git add .
git commit -m "Initial commit"
```
Create an empty repo on GitHub, then:
```powershell
git remote add origin https://github.com/<you>/piassa-plate.git
git branch -M main
git push -u origin main
```

### 2. Backend → Render (free)
1. render.com → sign in with GitHub → **New → Web Service** → pick your repo
2. Root Directory: `backend` · Build Command: `npm install` · Start Command: `npm start` · Instance: Free
3. Environment variable: `JWT_SECRET` → any long random string
4. Deploy, then copy the URL (e.g. `https://piassa-plate-backend.onrender.com`)
5. Confirm it's live: visit `https://your-backend.onrender.com/api/health`

**Free-tier caveat**: no persistent disk, so the database resets on restart/redeploy/sleep. Fine for demos; for real data, upgrade to a paid disk or a hosted database later.

### 3. Frontend → Vercel (free)
1. vercel.com → sign in with GitHub → **Add New → Project** → same repo
2. Root Directory: `frontend` · Framework: Vite (auto-detected)
3. Environment variable: `VITE_API_URL` → `https://your-backend.onrender.com/api`
4. Deploy — you'll get a URL like `https://piassa-plate.vercel.app`

### 4. Verify
Open your Vercel URL and log in. If data doesn't load, check the browser console — usually it's `VITE_API_URL` not set before the build ran, or Render still waking up (free tier can take 30-60s on first request after being idle).

## Tax rate
Hardcoded at 10% in `backend/src/routes/orders.js` (`recalcOrderTotals`). Change to match your local rate.

## Currency
All prices, costs, and totals are displayed in **ETB (Ethiopian Birr)** throughout the app — POS, menu, inventory, receipts, finance, and reports. The formatting lives in one place, `frontend/src/format.js`, so if you ever need a different currency it's a one-line change.
