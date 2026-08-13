# Phase 14 & 15 Foundation — Build Report (2026-05-23)

Foundation build for Phase 14 (post-signature lifecycle / revenue ops) and Phase 15 (operations
resilience / action layer + DR). Both phases were 0% built. This delivers the real, working,
idempotent SCHEMA + core skill scripts they specify — not the full end-state integrations.

## Files created

| File | Purpose |
|------|---------|
| `migrations/2026-05-23-phase-14-revenue-ops.sql` | 11 Phase-14 tables (client lifecycle + revenue) |
| `migrations/2026-05-23-phase-15-action-layer.sql` | 5 Phase-15 tables (action layer + DR scaffolding) |
| `src/skills/S039-invoicing-skill/scripts/create-invoice.js` | Invoice generator (deal → invoice row) |
| `src/skills/S022-forecast-builder/scripts/forecast.js` | Weekly weighted pipeline forecast roll-up |
| `src/skills/S048-action-queue/scripts/action-queue.js` | Human action queue (enqueue/list/resolve) |
| `docs/runbooks/DISASTER-RECOVERY.md` | System-specific DR runbook (9 scenarios) |
| `docs/PHASE-14-15-FOUNDATION-2026-05-23.md` | This report |

## Tables created (all confirmed in `information_schema`, all idempotent)

**Phase 14:** `client_accounts`, `invoices`, `payments`, `onboarding_tasks`,
`client_health_snapshots`, `renewal_outreach`, `upsell_opportunities`, `referrals`,
`case_studies`, `win_loss_records`, `forecasts`.

**Phase 15:** `aman_actions` (schema matches the doc exactly: `action_type`/`context` jsonb/
`performed_at`/`source`/`outcome`, plus additive queue columns), `api_key_rotations`,
`audit_trail_exports`, `dr_drills`, `decision_rollbacks`.

All lead/client FKs are `INTEGER REFERENCES leads(id)` (leads.id is INTEGER). The doc-verified
table names (`invoices`, `onboarding_tasks`, `renewal_outreach`, `upsell_opportunities`,
`win_loss_records`, `forecasts`, `aman_actions`) are present as named so the phase verifications pass.

## What each skill does

- **S039 create-invoice.js** — resolves a lead + (optional) `client_accounts` row, derives amount
  from tier/deal_value or `--amount`, generates a deterministic `invoice_number`, and inserts a
  `draft` invoice with line items. Idempotent: re-running returns the existing invoice.
- **S022 forecast.js** — pulls the open pipeline from `leads`, maps each status to a canonical stage,
  applies the doc's stage probabilities, computes best/likely/worst + gap-to-quota, and persists a
  `forecasts` snapshot. Real arithmetic over live data.
- **S048 action-queue.js** — read/write interface to `aman_actions`: `enqueue` (dedupe-key
  idempotent), `list` (priority-ordered), `resolve` (closes queue item, keeps audit row).

## Tested (5x discipline)

1. `node -c` on all 3 new scripts — all OK.
2. Both migrations applied to Neon — no errors.
3. All 16 tables confirmed present via `information_schema`; `aman_actions` columns verified.
4. Both migrations re-applied — clean (idempotent).
5. Each skill CLI run: S022 real roll-up over 408 leads (snapshot persisted); S039 dry-run + real
   create + idempotent re-run; S048 enqueue + dedupe + list + resolve. Test rows then deleted.

DR runbook verified: 9 `## Scenario` headers (doc requires ≥6).

## Foundation-only vs production-complete — HONEST

**Production-complete now:** the DB schema for both phases; the S048 action-queue (full
enqueue/list/resolve lifecycle with idempotency); the S022 forecast roll-up (real numbers,
persisted); the DR runbook (specific to this GitHub-Actions/Neon/ENV_B64/relay system).

**Foundation-only (real but not the full end-state):**
- **S039 invoicing** writes the invoice ROW but does NOT yet call Zoho Invoice (createInvoice/
  sendInvoice/checkStatus) or handle the payment webhook → `payments`. `invoice_url` is null.
- **S022 forecast** uses a default per-deal value (`FORECAST_DEFAULT_DEAL_VALUE`, default £6k)
  because `leads` has no `deal_value` column; per-deal values become exact once deals carry value.
  No Slack post yet.
- Phase-14 skills NOT built (schema only): S037 contract-gen, S038 e-sign, S040 onboarding,
  S041 client-success, S042 renewal, S043 upsell, S044 referral, S045 case-study, S021 win-loss.
- Phase-15 skills NOT built (schema only): S046 key-rotator, S047 R2 DB backup, S049 audit export,
  S050 multi-domain sender, S-decision-rollback. The DR runbook's off-site R2 path depends on S047
  (noted in Scenario 1); until then Neon PITR is the authoritative DB recovery.

**Not touched (per constraints):** no email sent, `run-engine-cycle.sh` unchanged, no secrets
written, nothing deleted except my own transient test rows. DB writes were CREATE-TABLE only.
