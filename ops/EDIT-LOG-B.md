# EDIT-LOG — MISSION B (adversarial audit + verify, V2)

Branch `v4-p2-engine` (worktree `_v4-p2-engine`). SEND_ENABLED stays OFF. Neon SELECT-only. Syntax-checked
before every commit (node --check + jsc; jsc `ReferenceError: require` = parse OK). Do NOT merge.

Tooling note: system `node` is absent; used the repo-local runtime at `_tools/node/bin/node` (v20.18.1) to run
the eval/validators and the adversarial unit harnesses. Read-only Neon via `scripts/psql` shim.

## BUG LIST (tagged "B")

| # | Sev | File:line | Condition | Fix / Flag |
|---|-----|-----------|-----------|------------|
| B-1 | LOW | scripts/validate-campaigns.js:29-33 | The campaign `_footer.txt` ships on EVERY touch but was only checked for required vars + the provenance line — the FORBIDDEN_DASH / FAKE_SCARCITY copy-rails were NOT applied to it, so an em/en dash or scarcity phrase in the footer would pass the gate and ship. (Footer is currently clean, so latent.) | FIXED — lint the footer copy (above the `---` maintainer note) for dashes + scarcity. |
| B-2 | MED-HIGH | scripts/requalify-all-leads.js (tier routing) | The backlog re-scorer applied NO P2-1a entity/consent gate. A sole-trader / ordinary-partnership lead re-scored here could reach Tier-1 (quality_fit=TRUE, lifecycle='qualified') and leak into the cold path that qualify-and-queue.js protects. This is the exact "consent_required leaking into the cold path" angle. Currently dormant (the `consent_required` column is not yet provisioned in live Neon, and entity_type is 100% NULL), but the code is wrong for when the coordinator provisions it. | FIXED — mirror the qualify-and-queue.js entity gate: classify entity_type (fallback name heuristic), flag consent_required=TRUE + lifecycle='consent_required' + quality_fit=FALSE before tier routing, with the same reversible backup snapshot + idempotent column guard. |

## FLAGGED (not fixed — risky / out of scope)

- **B1 done-when divergence (Stage-2 LLM qualifier).** The done-when expects Stage-2 = "Groq primary / Gemini
  Flash fallback, temperature 0, strict JSON (quality_score/tier/fit_reason/disqualify_reason)". The live
  qualifier (`src/lib/enrich/lead-quality.js`) is **fully deterministic** (10-layer + V3 4-component scorer +
  pure `decideTier`); it calls NO LLM and emits `quality_score/tier/tier_reason` (no `fit_reason`/
  `disqualify_reason`). The LLM router (`src/lib/llm/router.js`) is Cloudflare→Groq→Gemini and is wired for the
  PERSONALISATION/pointer engine (Phase 6), not for tier qualification. This is an architecture choice (the
  PRECHECK + edit-log treat the deterministic scorer as the qualifier), not a bug I can safely "fix" — wiring a
  new LLM Stage-2 into the qualify path is a major design change with its own JSON-parse / cost / fallback /
  safety surface, and the deterministic gate is what the B2 eval actually tests at 100%. Flagging for a founder
  decision rather than silently bolting on an LLM stage. See B1 status below.

- **Governor fairness model differs inline vs batch (low, by design).** `canReleaseLead` (inline, qualify path)
  caps each sector at a hard ceil(100/10)=10/day; `releaseToday` (batch sweep) uses round-robin that can roll a
  thin sector's unused slots onto another sector (so a single sector can exceed 10 when others are starved, but
  the total 100/day is always respected). Both stamp `governor_released_at` and filter `IS NULL`, so there is no
  double-release. Defensible (inline conservative, batch fills the day) — left as-is; flagging the asymmetry.

- **Campaign-template cadence vs scheduler cadence mismatch (latent, not wired yet).** `campaigns/_meta.json` +
  the per-sector JSONs specify intervals `0/3/7/12/19`; the live scheduler `send-due.js` CADENCE_DAYS is
  `[0,5,10,20]` and advances next_touch_date from THAT, not from the campaign JSON `interval_days`. The campaign
  files are NOT yet consumed by the send path (send-due.js reads outreach_drafts from the DB; the JSONs are
  staged source-copy for P2-5). So no active bug, but whoever wires the campaign files into the draft generator
  must reconcile 3/7/12/19 (templates) vs 5/10/20 (scheduler). Flagged, not fixed (wiring doesn't exist; SEND off).

- **`_hasMX` (lead-quality.js:67) has no explicit DNS timeout (low).** Relies on c-ares defaults (~5s × retries),
  so it fails eventually rather than hanging forever, but it is the weakest timeout discipline in the qualifier
  hot path. Left as-is — adding a timeout race risks altering the MX-cache behaviour the scorer is tuned against.

## Additional adversarial checks (no bug found)

- **SQL injection / malformed lead:** scoreLead survives 8/8 malformed leads (empty, junk domain, absurd length,
  7-label, malformed jsonb fields, apostrophe email, non-numeric confidence) with 0 throws — tolerant parsers
  degrade to a tier. All qualify-and-queue / requalify UPDATEs use esc()/num(); the only raw interpolations are
  `lead.id` (bigint PK) and the hardcoded `stage` literal. No injection vector.
- **Hung-call timeouts:** LLM router (router.js) AbortSignal.timeout(30s, env LLM_TIMEOUT_MS) per provider with
  fallover; fetchSite (lead-quality) 9s via fetchWithRetry AbortController; verify-email Apify HTTP 12s
  AbortController (no raw SMTP socket); deliverability DoH 12s; send-pacing /sql 15s. No indefinite-hang path
  except the c-ares note above.
- **Double-count on re-run:** scorecard is append-only + `v_scraper_scorecard_latest` (DISTINCT ON scraper_source)
  shows freshest, so re-running adds history, never double-counts. qualify-and-queue only scores
  `quality_score IS NULL`; the governor + send claims are atomic (FOR UPDATE SKIP LOCKED / RETURNING) and filter
  on the release/sent stamp, so re-runs don't double-release or double-send.
- **consent leaking via mint/push:** enqueue-leads.js requires quality_fit=true; push-to-mystrika.js requires
  quality_fit=TRUE AND lifecycle='qualified'. A consent_required lead is set quality_fit=FALSE +
  lifecycle='consent_required', so both are excluded. The ONLY leak was the backlog re-scorer (B-2, now fixed).
- **Template footer/unsubscribe:** validate-campaigns.js FAILs when {{unsubscribe_url}} (or any required footer
  var) is removed, when a sector file is missing, on em/en dash in a body, and now (B-1) on a dash/scarcity in
  the footer. relay-router.js emits List-Unsubscribe (mailto two-click always; RFC-8058 one-click + -Post when
  UNSUB_ENDPOINT set) on all 6 relays.

## VERIFICATION RUNS

- B2 eval (deterministic): `node scripts/eval-qualifier.js` -> **50/50 = 100%**, exit 0 (PASS).
- B2 regression proof: 6 T1 labels flipped to T3 -> **44/50 = 88%** -> exit 1 (blocks merge). Fixture restored
  clean (git diff empty).
- B5 `node scripts/validate-campaigns.js` -> 10/10 sectors PASS, exit 0. Em-dash injected into a body -> exit 1.
  After B-1 fix: dash in footer COPY -> exit 1; dash only in the footer maintainer-note (below `---`) -> PASS.
- `node src/lib/sourcing/tests/icp.test.js` -> ALL PASS.
- Adversarial harness (allocateRoundRobin + classifyEntityType/entityNeedsConsent): 29/29 pass (even 10x10,
  thin-rollover, supply-cap, negative/NaN/empty budget guards, LLP=corporate vs ordinary-partnership=consent).
- Adversarial harness (send-pacing): 15/15 pass (ramp 30/40/45 at day boundaries 9/10/19/20, hardMax clamp,
  null/negative day guard, Saturday=2026-06-13 detected, Sunday not paused).
- Live Neon (read-only): `consent_required` + `governor_released_at` columns NOT yet provisioned; `entity_type`
  exists, 100% NULL (8712/8712). So the entity gate + governor are dormant in live until the coordinator
  provisions — both degrade safely (gates pass-through, governor snapshot empty/remaining=100).

## B1-B7 done-when status

- **B1 qualifier — 🟡 PARTIAL.** Governor ✅ (governor.js: 100/day total, per-sector ceil(100/10)=10 lane +
  round-robin allocator, 00:00 UK reset via Europe/London ukToday(); live snapshot degrades safely to
  remaining=100, 10 sectors in correct order). CH entity gate ✅ (icp.js classifyEntityType/entityNeedsConsent:
  LLP/LP→company cold-OK, sole-trader+ordinary-partnership→consent_required, excluded; wired in
  qualify-and-queue.js AND now requalify-all-leads.js per B-2; 29/29 adversarial unit checks pass). **Stage-2 LLM
  wiring ⛔ DIVERGENT:** the live qualifier is fully deterministic (lead-quality.js decideTier), NOT
  "Groq primary / Gemini Flash fallback, temperature 0, strict JSON" with fit_reason/disqualify_reason — those
  fields/that LLM stage do not exist; the LLM router (Cloudflare→Groq→Gemini) serves the personalisation engine.
  Flagged for a founder call (see FLAGGED) rather than bolting on an LLM stage — the deterministic gate is what
  B2 validates at 100%.
- **B2 eval gate — ✅ DONE.** `node scripts/eval-qualifier.js` = 50/50 = 100%, exit 0. Flip 6 labels → 88% → exit
  1 (blocks merge). Fixture restored clean.
- **B3 finder (3 LinkedIn names) — ✅ DONE.** enrich-worker.js liNames: cap 3, named-first then site top-up,
  case-insensitive dedup across both lists, company-page (/company/) exclusion, name fallback. 10/10 unit checks.
  Additive (legacy linkedin_url still written); only writes decision_makers when ≥1 found (no clobber).
- **B4 scorecard — ✅ DONE.** scorecard-nightly.js --dry-run live: 9 scrapers scored, real valid/named/sector/li/
  dup/tier1 metrics, serper cpl attribution (0.0426 on serp-derived, 0 elsewhere), 7 red-flagged → digest row
  (dry-run wrote nothing). Append-only + DISTINCT ON view (no double-count). Fail-open per scraper.
- **B5 /campaigns — ✅ DONE.** validate-campaigns.js: 10/10 sectors PASS. Footer + visible {{unsubscribe_url}} +
  List-Unsubscribe (relay-router, all 6 relays) ✅; ramp 30/40/45 (send-pacing, 15/15 unit) ✅; Saturday pause ✅;
  jitter ✅; SEND_ENABLED master gate ✅ (send-due halts "No mail sent"); consent_required exclusion in
  pickDueDrafts ✅. Em-dash in body → exit 1; (B-1) dash/scarcity in footer → exit 1. 5 touches/sector, two asks,
  regulated line, credential, right-person ask, no scarcity.
- **B6 — n/a in scope** (no B6 in the P2 edit-log; numbering jumps P2-5→P2-7. Nothing to verify.)
- **B7 deliverability-guard — ✅ DONE.** --report live: all 6 IceMail domains pass SPF/DKIM/DMARC(quarantine)/
  Postmaster via DoH (Cloudflare+Google fallback). Injected example.org → correctly flagged "not connected to
  Google Postmaster" + alert message formed. Read-only in report mode; weekly cron heartbeat-wrapped.

Honest count: 2 bugs fixed (B-1 footer lint, B-2 consent leak in backlog re-scorer), 4 items flagged (B1 LLM
Stage-2 divergence, governor inline/batch asymmetry, campaign/scheduler cadence mismatch, _hasMX no DNS timeout).
Done-when: B2/B3/B4/B5/B7 ✅; B1 🟡 (governor + entity gate ✅, LLM Stage-2 ⛔ divergent-by-design, flagged).
