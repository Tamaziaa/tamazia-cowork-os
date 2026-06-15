# NocoDB Layers 2-4 — turnkey setup (P3-2)

> Layer 1 (the read-only NocoDB grid + the **Pipeline by stage** funnel view) is already **live** on the
> `Tamazia Pipeline` base over the `tamazia_ro` Neon role — see `Tamazia-Remix/ops/nocodb-connection.md`.
> This doc finishes Layers 2-4. The database side is `ops/nocodb-layers-2-4.sql` (validated read-only vs live
> Neon 2026-06-15). The steps below are the **founder/coordinator clicks** — there is no code to deploy.

Two ways to build Layers 2-3, pick one:

- **Path A (recommended, least fiddly): use the SQL views.** The coordinator runs `ops/nocodb-layers-2-4.sql`
  once (`psql "$NEON_URL" -f ops/nocodb-layers-2-4.sql`). That creates six read-only `v_nocodb_*` views in
  Neon. They then appear in the NocoDB base automatically (or after **Reload schema** / re-sync the source) as
  ready-made grids — no per-view filter/group building by hand. This is also exactly what a cloud Metabase
  question can point at.
- **Path B: native NocoDB saved views** (filters/groups in the UI, no DB change). Use this if you would rather
  not add views to Neon. The recipes are below and match the SQL one-for-one.

Whichever path, the **off-limits rule stands**: never enable write-back on `audit_* / compliance_* /
framework_* / classifier_* / pointer_* / scanner_*`. Read-only stays the posture for every agency view too,
until the deliberate Layer-4 step at the end.

---

## Prereqs (already true)

- NocoDB Cloud workspace **Realfamemedia** (free), base **Tamazia Pipeline**, integration **"Tamazia Neon"**
  Connected, whitelist IP `52.15.226.51` allow-listed. (All from `nocodb-connection.md`.)
- The connection role is read-only `tamazia_ro`. "Allow Data Write/Edit" and "Allow Schema Change" are OFF.

---

## Path A — surface the six SQL views (after the coordinator runs the .sql)

1. Coordinator: `psql "$NEON_URL" -f ops/nocodb-layers-2-4.sql` (creates the views + grants SELECT to
   `tamazia_ro`).
2. In NocoDB: open the **Tamazia Pipeline** base → the data source **`neon`** → **Reload / Sync schema**
   (three-dot menu on the source, or re-open the base). The six views appear as new tables:
   - `v_nocodb_fit_email_ready` — Layer 2a (send-ready queue; ~32 rows today)
   - `v_nocodb_fit_by_sector` — Layer 2b (FIT + email-ready per sector)
   - `v_nocodb_bookings_this_week` — Layer 2c (0 rows until the cal webhook writes Neon)
   - `v_nocodb_scraper_scorecard` — Layer 3a (per-source run activity, last 7d)
   - `v_nocodb_source_yield` — Layer 3a' (FIT leads produced per source, all-time)
   - `v_nocodb_bookings_all` — Layer 3b (full booking log; 0 today)
3. Optional: pin these six in the sidebar; hide raw tables you don't need. Done — Layers 2-3 are live.

---

## Path B — native NocoDB saved views (no DB change)

All Layer-2 views are filtered lenses on the `leads` table; Layer-3 lives on `sourcing_runs` and
`cal_bookings`. Saved views copy no rows and cost nothing.

### Layer 2a — `FIT: email-ready` (Grid on `leads`)
- New view: hover `leads` in the sidebar → **+** (Create a View) → **Grid** → name `FIT: email-ready` → Create.
- **Filter:** `status` *is like* `touch_%_queued`  **AND**  ( `email` *is not empty* **OR** `contact_email`
  *is not empty* **OR** `primary_email` *is not empty* ). If the builder has no wildcard "is like", use two
  filters: `status` *starts with* `touch_` **AND** `status` *ends with* `_queued`.
- **Sort:** `quality_score` descending. **Fields:** `company, sector, icp_tier, email, contact_email,
  audit_url, status, quality_score`. Freeze `company`.

### Layer 2b — `By sector` (Grid on `leads`, grouped)
- New Grid view `By sector`. **Group by:** `sector`. **Filter:** `quality_fit` *is checked* (= true) to show the
  FIT book per sector (drop the filter for the whole book). Optional second group level: `lifecycle_stage`.
- **Fields:** `company, sector, icp_tier, quality_score, quality_fit, status, email`. Turn on the group footer
  **count** so each sector shows its size.

### Layer 2c — `Bookings: this week` (Grid on `cal_bookings`)
- New Grid view on **`cal_bookings`** named `Bookings: this week`. **Filter:** `start_at` *is within* the next
  7 days. **Sort:** `start_at` ascending. **Fields:** `attendee_name, attendee_company, attendee_email,
  start_at, status, lead_id, outcome`.
- *Reality:* reads 0 until the cal.com webhook writes Neon (today it writes Cloudflare KV only). The view is
  correct; the data pipe is the gap.

### Layer 3a — `Scraper scorecards` (Grid on `sourcing_runs`, grouped)
- New Grid view on **`sourcing_runs`** named `Scraper scorecards`. **Group by:** `source`. **Filter:**
  `started_at` *is within* the last 7 days. Group footer: **count** of rows + **sum** of `records_found` and
  `records_new`. **Fields:** `source, started_at, records_found, records_new, records_updated, status, sector`.
- Add a sibling Grid `Scraper failures`: filter `status` *is* `error`, sort `started_at` desc, show `error`.
- *Note:* the "how many FIT leads did this source produce" angle is a cross-table join NocoDB can't do; that is
  `v_nocodb_source_yield` (Path A) or the SQL in `observability/dashboards.md` in Metabase / the `tamazia-ops`
  MCP. NocoDB's scorecard is the single-table operational view.

### Layer 3b — `All bookings` (Grid on `cal_bookings`)
- New Grid view on `cal_bookings` named `All bookings`. **Sort:** `created_at` descending. **Fields:**
  `attendee_company, start_at, status, outcome, next_step, next_step_due`. Same KV caveat as 2c.

---

## Layer 4 — write-back (mark contacted / suppress) — DEFERRED until deliberately enabled

Editing from inside NocoDB is intentionally **off** in the read-only rollout: the connection uses `tamazia_ro`
(SELECT-only), so no view above can mutate Neon. That is the safety property — the first version cannot damage
production. Turn it on as a separate, scoped step:

1. **Coordinator runs the Editor-role GRANT** at the bottom of `ops/nocodb-layers-2-4.sql` (set a strong
   password first). It creates `nocodb_editor` with `SELECT` on `leads` plus **column-scoped UPDATE on exactly
   two columns**:
   - `status` — the **"mark contacted"** action (set to a `contacted_*` value).
   - `dnc_reason` — the **"suppress"** action (a non-NULL reason = do-not-contact; the engine's gates honour it).
   No other column and no other table is writable by this role; the OFF-LIMITS families get nothing.
2. **Add a SECOND data source in NocoDB** using `nocodb_editor` (NocoDB → base → Data Sources → New → the same
   Neon host, user `nocodb_editor`, its password, SSL required). On THIS source, leave **"Allow Data
   Write/Edit" ON** but **"Allow Schema Change" OFF**.
3. Build **only** the two edit views on the editor source: a grid where the `status` and `dnc_reason` cells are
   editable (e.g. an "Actionable" grid filtered to `lifecycle_stage = qualified`). Keep everything else on the
   read-only `tamazia_ro` source.
4. Verify the scope with the `SET ROLE nocodb_editor; …` checks in the .sql (an UPDATE of any other column, or
   any INSERT, MUST error with "permission denied"). That proves the blast radius is two cells on `leads`.
5. *Preferred hardening (optional):* write through a guarded SQL function or the engine API instead of a raw
   table UPDATE, so business rules (suppression side-effects, recycle dates) stay enforced. The column-scoped
   GRANT is the safe floor; a function is the safe ceiling.

Until step 1 is run, treat NocoDB as a live **read-only** cockpit.
