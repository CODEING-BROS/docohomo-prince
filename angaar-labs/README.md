# Angaar Labs: DocHomoeo rebuild

New code lives here. Everything outside this folder (`../apps`, `../db`, `../gateway`) is the
old system, kept unchanged as a working reference.

| Folder | What it is |
| --- | --- |
| `backend/` | API: Express 5 + TypeScript + Prisma on PostgreSQL. Port 4000. |
| `frontend/` | One Next.js 16 app (shadcn/ui, Tailwind). Port 3000. Three panels: `/admin`, `/doctor`, `/patient`. The public website is another team's work. |

## Run

PostgreSQL runs in Docker (start Docker Desktop first; from `D:\Docomo` run `npm run db:up` if the container is stopped).

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Open http://localhost:3000/admin. The sign-in form is pre-filled on a developer machine from
`frontend/.env.local`; the same admin is defined in `backend/.env` (`SEED_ADMIN_*`).

`npm run dev` rebuilds each page the first time it is opened, so it feels slow. To use the panels
at full speed, build once and serve the result (changes to the code then need a new build):

```bash
cd frontend
npm run build
```

```bash
cd frontend
npm run start
```

`NEXT_PUBLIC_DEMO_LOGINS=true` in `frontend/.env.local` keeps the sign-in pages pre-filled in the
built version too. **Never set it where the live site is built.**

While a built copy is in use on port 3000, the code can still be worked on: `npm run dev` writes to
`.next-dev`. `npm run start:new` serves the same build on port 3001 instead of 3000 (launch entry
`frontend-new`), for when port 3000 is wanted for something else. To compare two versions side by side,
build the second one with `NEXT_DIST_DIR=.next-new` (see `next.config.ts`).
Both ports share the same backend and the same sign-in cookies, so signing in or out on one does
it on the other too.

## Backend

| Path | What |
| --- | --- |
| `prisma/schema.prisma` | The data model: every table and field, grouped by area and commented |
| `prisma/seed.ts` | First admin and default B2B price tiers (`npm run db:seed`) |
| `src/modules/*.routes.ts` | One file per API area (auth, dashboard, notifications, products, orders, customers, doctors) |
| `src/scripts/import-legacy.ts` | Reloads the new database from old data staged by hand (`npm run db:import-legacy -- --yes`); the owner's button in Admin → Import from old site is the usual way |

After changing `schema.prisma`: `npm run db:migrate` then `npm run db:generate`.
`npm run db:studio` opens a table browser.

Databases (same PostgreSQL server, port 5433): `dochomoeo_v2` is the new one; `dochomoeo` holds
the old data as imported from MongoDB and is only read by the import script.

## Frontend

The look is the "Dispensary Ledger" design system: the spec is `frontend/components/custom/DESIGN.md`, the component
contracts `frontend/components/custom/CONTRACTS.md`, the components themselves `frontend/components/custom/`
(status pills, data tables, filter chips, timelines, steppers, dialogs, the panel shell and the sign-in frame).
`/design` on a developer machine shows every component with sample data. `frontend/components/admin/parts.tsx`
is a thin layer over the library for older pages. Tailwind v4 drops `cursor: pointer` from buttons; `app/globals.css`
puts it back on everything clickable (and `not-allowed` on anything disabled), so pages never set cursors by hand.


| Path | What |
| --- | --- |
| `app/admin/login` | Staff sign-in |
| `app/admin/(panel)` | Admin pages; the layout checks the session and draws the sidebar and header |
| `components/admin` | Shared admin pieces: sidebar, date range picker, searchable dropdown, notification bell, table parts |
| `components/ui` | shadcn/ui components |
| `lib/api.ts` | Calls the backend through `/api/*`, which Next.js forwards to port 4000 |

The browser only talks to port 3000; the session is an http-only cookie set by the backend.

## Outside services

All keys live in `backend/.env` (never in the code). Each service is used only when its keys are filled in.

| Service | Settings | State (5 Oct 2026) |
|---|---|---|
| Payments (PhonePe) | `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_ENV` | Live, with the old site's merchant account. `PUBLIC_API_URL` is needed once hosted so PhonePe can post results. |
| Sign-in codes and SMS (MSG91) | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | Sign-in codes are delivered (confirmed 6 Oct 2026). Other SMS (order updates and so on) need an approved text set for each message in Admin → Automatic messages. `OTP_DEV_CODE` empty = real codes. |
| Email (Brevo, over SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Pointed at Brevo (`smtp-relay.brevo.com`, 587) on 6 Oct 2026; waiting for the SMTP login, an SMTP key and a verified sender address. The old Gmail login (refused by Google) is kept as a comment in `.env`. `MAIL_FROM` is required: with Brevo the login is not an address. |
| WhatsApp (Meta Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Not set up. |
| Courier (Shiprocket) | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN` | Connected to the real account, which the old live site still uses. Mode is "Automatic"; on development computers `SHIPPING_TEST_MODE=true` swaps in a pretend courier, so nothing real is booked. No real booking has been made from this system yet. |

What runs by itself (see `backend/src/lib/housekeeping.ts`, every 5 minutes): re-checks open payments, cancels online orders unpaid after 45 minutes, sends consultation reminders, retries failed messages, checks parcel tracking, sends the daily / weekly / monthly report emails when due, checks refunds that are on their way, closes consultations nobody closed (started and forgotten = completed; never started by the doctor = cancelled, patient refunded or staff alerted), and once a day sends the low-stock list, moves doctors up a level when they have earned it, and on the payout day gathers each doctor's earnings into a payout.

Orders confirm themselves: pay-on-delivery and credit orders are Confirmed the moment they are placed, and an online order the moment its payment arrives (it stays Pending only while the money is awaited, and is cancelled after 45 minutes unpaid). Nobody has to confirm an order by hand. From there it carries on alone: the invoice is made, the order is sent to Shiprocket with the courier and pickup booked, tracking moves it to shipped and delivered, and a pay-on-delivery order is marked paid on delivery. The only human steps are packing the parcel, sticking the label on and pressing **Mark as packed** on the order: "Packed" is never set by the system, because only a person knows the parcel is really ready. If an invoice or a courier booking fails, it is tried again on the next round (every 5 minutes for invoices, hourly for the courier) and staff are told.

`SHIPPING_TEST_MODE=true` in `backend/.env` (set on development computers) replaces Shiprocket with a pretend courier that collects after 2 minutes and delivers after 7, so the whole chain can be watched without booking anything real. **Remove that line on the live server.** With no pickup address chosen, the verified one in Shiprocket is used; with no business address typed in, invoices use that same address, and they are plain invoices (not GST tax invoices) until a GSTIN is added in Admin → Invoices.

Money rules to know:
- **Refunds** (Admin → Refunds): only for payments this system took. Automatic refunds are **off** until switched on there; while off, a cancelled paid order or consultation waits in the list and staff get an alert.
- **Doctor payouts** (Admin → Doctor payouts): prepared every Monday by default (changeable). No money is sent by the system: download the bank sheet, pay from the bank, then mark the payouts as paid.
- **Returns** (Admin → Returns): a customer asks from their order page (within 7 days of delivery by default) or staff open one for them. Approve, receive the parcel (only units fit to sell go back into stock), then refund: through the gateway, by hand with a reference, or close without a refund. The courier to collect the parcel is booked through Shiprocket: by itself when Shipping → Courier is "Automatic", with the "Book courier pickup" button when it is "By hand" (a pickup address must be chosen first). Tracking moves the return to "picked up" and tells staff when the parcel is back; staff can also type in a courier they arranged themselves.
- **Orders placed by staff** (Admin → Orders → Retail order / B2B order): retail orders use website prices, coupons and delivery rules; "handed over at the counter" records a finished sale. Money that arrives later (bank transfer, cheque, credit) is written down with **Record payment** on the order.
- **Report emails** (Admin → Report emails): daily, weekly (Monday) and monthly are all on; they go to the staff-alert addresses unless others are chosen.
- **Doctor levels** (Admin → Doctor levels): a level needs a "moves up" rule (consultations and/or rating) before anyone is promoted to it automatically. Set now: Silver at 100 consultations and a 4.0 rating, Gold at 500 and 4.5.

Admin screens for these: **Automatic messages** (wording, channels, sent log, staff alert addresses), **Shipping** (courier settings), **Invoices** (business details, GST rate and HSN in bulk).

**Staff and roles** (Admin → Staff and roles; `backend/src/lib/permissions.ts`, `modules/staff.routes.ts`): the panel is cut into 16 areas (orders, catalog, doctors…) and a role says for each one "cannot see", "can see" or "can see and change". Every staff member has one role. The server checks every `/api/admin/*` request (reading needs "see", anything else needs "change"); the menu only hides what would be refused anyway. The owner (`SUPER_ADMIN`) always has everything. An admin account carried over from the old site keeps full access until it is given a role or switched off; a new staff member without a role sees nothing. A switched-off account is refused at once, even if still signed in. Six starter roles are added the first time (Manager, Order desk, Catalog manager, Doctor desk, Accounts, Viewer) and can be changed or deleted. Whoever can change "Staff and roles" can give any role to anyone, so keep that area to the owner. A new admin API area must be added to `ROUTES` in `permissions.ts`, or it is open to every staff member.

**Streams, specializations and guided booking.** One consulting stream is on (Homeopathy); staff add more under Admin → Consulting streams. Each stream has specializations (`npm run db:specializations` adds ten starters), each with the symptoms that point patients at it and, optionally, test questions of its own. A doctor picks one when registering and can change it from Profile; their test mixes the stream's general questions with their specialization's, and is taken again only when the new choice brings questions of its own. Patients book through `/patient/book`: who it is for, their details, the problem, the specialization the symptoms point at, a few preferences, then two or three doctors labelled Best match, Best value and Most experienced. The choosing is in `backend/src/lib/doctor-match.ts` (the rules are at the top of the file) and its numbers are under Admin → Consulting streams → Matching. Every search and what happened to it (shown, opened, booked) is kept in `MatchSession` / `MatchEvent`, so the weights can later be judged against real outcomes.

**Bringing the old site's data in (Admin → Import from old site).** One button for the owner, for the time before launch. Set `LEGACY_MONGODB_URI` (the old site's MongoDB address) in the server's `backend/.env`, restart, open the screen, press the button and type IMPORT. What it does (`backend/src/lib/legacy-import.ts`):

1. Reads the old site (find only, it is never written to) into staging tables in a schema of their own, `legacy_import` (`lib/legacy-stage.ts`, table definitions in `prisma/legacy-schema.sql`).
2. In one transaction, empties the tables that come from the old site and fills them again (`lib/legacy-load.ts`): customers, addresses, brands, categories, products, stock, orders, payments, doctors, coupons, delivery charges, banners, blog, enquiries.
3. Gives each doctor a specialization, ends customer and doctor sign-ins made before the import, and drops the staging tables.

If step 1 or 2 fails, the database is exactly as it was. It can be pressed again and again: each press replaces the last result. **Kept**, because they are set up here and the old site has nothing like them: staff accounts and roles (the owner stays signed in), settings, message wording, consulting streams with their specializations and test questions, doctor levels, B2B price tiers. **Removed**: everything else made here, such as test orders, appointments, prescriptions, B2B accounts and discount rules. Old customers are numbered after the staff accounts, so nobody's account number collides.

The button **closes itself for good** once this site has taken a real gateway payment or booked a real courier, because from then on it would erase live orders. Test payments and the pretend courier do not close it. Remove `LEGACY_MONGODB_URI` from the server after launch. The terminal command `npm run db:import-legacy -- --yes` still exists for a database that was staged by hand (`LEGACY_DATABASE_URL`); unlike the button it empties everything, staff and settings included, and has no lock.

Launch day: put the old site in maintenance, press the button, check the numbers on the screen, remove `SHIPPING_TEST_MODE` and `LEGACY_MONGODB_URI` from the server's `.env`, restart, point the domain here.

**The time of a consultation is given by the system**, not picked from a calendar. The patient is offered the doctor's earliest free slot and can ask for the next one ("Next slot") or step back ("Earlier"), on the guided booking and on the page for booking one doctor again (`/patient/doctors/[slug]`, reached from "Book again" in Consultations). There is no list of every doctor for patients: `/patient/doctors` forwards to the guided booking. The slot comes from `GET /api/care/doctors/:slug/next-slot?after=` (`nextFreeSlots` in `backend/src/lib/slots.ts`); the control is `frontend/components/patient/assigned-time.tsx`.

**Tick and delete in every admin list.** Every list in the admin panel has row checkboxes and a bar to delete (and, where there is a spreadsheet, export) the ticked rows: `frontend/components/admin/bulk.tsx` on the page, `POST /api/admin/<list>/bulk-delete` on the server, each written to the audit log. The server decides what may really go and answers how many rows it kept and why, because some rows are records that must stay:

| List | What "delete" removes | What is always kept |
| --- | --- | --- |
| Orders, products, B2B customers, banners, coupons, delivery charges, blog, enquiries, B2B discount rules, doctor reviews | everything ticked | — |
| Customers, doctors | accounts with no consultation history | anyone with appointments or prescriptions |
| Brands, categories | empty ones | those with products inside |
| Consulting streams, specializations, doctor levels | unused ones | those doctors are registered in |
| Test questions | everything ticked (no question left in use means no test) | — |
| Appointments | cancelled ones that were never paid for | consultations that took place or were paid for |
| Doctor payouts | waiting or failed ones (their consultations are owed again) | payouts already paid |
| Payments | failed attempts, and unfinished ones older than a day | payments that brought money in or were refunded |
| Refunds | ones that failed | refunds sent or on their way |
| Returns | rejected and cancelled ones | open, received and refunded returns |
| Staff | accounts that never changed anything | the owner, yourself, anyone with history (switch them off instead) |
| Sent-message log | sent, failed and skipped entries | messages still waiting to be sent |
| Prescriptions | nothing: they can be ticked and exported only | every prescription given to a patient |

Stock (Inventory) rows are product packs, so they are ticked for export and removed from Products. Invoices, Reports and Report emails are settings and report screens, not lists.

**Reports and photos in a booking** are medical files, so they are not kept with the public images. They are stored in `backend/private/consultations` (nothing serves that folder; back it up with the database) and handed out only by `backend/src/modules/consultation-files.routes.ts` after checking who asks: the patient, the doctor of a paid booking, or staff who may see consultations (each opening by staff is written to the audit log). A file uploaded but never booked with is removed after a day.

The three panels, each with its own sign-in: `/admin` (staff), `/doctor` (doctors) and `/patient` (customers: consultations, guided booking, prescriptions, ordering medicines from the shop or from a prescription, orders and returns, addresses, details). A shopper and a patient are the same account: whoever orders on the public website signs in with their mobile number and a code (a new number gets an account on the spot), and sees those orders in this panel. The shop pages are shared (`frontend/components/shop/`): doctors get them at wholesale prices under `/doctor/wholesale`, customers at retail prices under `/patient/shop`. The three sign-ins are independent (cookies `dh_session`, `dh_doctor`, `dh_user`): one browser can be signed in to all three at once, each as a different person, and signing out of one leaves the others. While developing, each sign-in page is filled in with its own demo account (doctor 9000000001, patient 9000000002).

Useful commands in `backend/`: `npm run db:demo-doctor` (a demo doctor with six months of made-up data; `-- --remove` deletes it), `npm run db:demo-patient` (a demo patient with made-up consultations, prescriptions and orders; needs the demo doctor), `npm run db:starter-questions` (starter test questions for streams that have none).
