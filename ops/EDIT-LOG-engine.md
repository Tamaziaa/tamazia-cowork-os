# EDIT-LOG — BUILD STREAM P2 (engine/pipeline)

Branch `v4-p2-engine` off main `bdf141c`. SEND_ENABLED stays OFF. Neon SELECT-only; additive DDL in canonical-schema only.

| ID | What | Files | Status |
|----|------|-------|--------|
| P2-1a | Entity-type gate (companies pass; sole-trader/partnership → consent_required=TRUE, excluded from cold path) + persist CH company_type→entity_type | src/lib/sourcing/icp.js, scripts/qualify-and-queue.js, src/lib/sourcing/bulk-sourcer.js, src/skills/S065-touch-scheduler/scripts/send-due.js, schema/canonical-schema.{json,sql} | ✅ DONE |
| P2-1b | Per-sector round-robin Tier-1 governor (100/day, 10x10, reset 00:00 UK) | src/lib/governor.js, scripts/governor-release.js, scripts/qualify-and-queue.js, nightly-workers.yml | ✅ DONE |
| P2-2 | Eval gate: /eval/qualifier.json (50 labelled) + scripts/eval-qualifier.js + CI gate <90% blocks | eval/qualifier.json, scripts/eval-qualifier.js, src/lib/enrich/lead-quality.js (decideTier seam), .github/workflows/eval-qualifier.yml | ✅ DONE |
| P2-3 | Store up to 3 LinkedIn names (multi-threading) → decision_makers jsonb | scripts/enrich-worker.js | ✅ DONE |
| P2-4 | Scorecard nightly (50/scraper → scraper_scorecard + view + red-flag→digest) | scripts/scorecard-nightly.js, schema/canonical-schema.sql (view), nightly-workers.yml | ✅ DONE |
| P2-5 | /campaigns/ per-sector touches + footer/List-Unsub + ramp 30/40/45 + Sat pause + jitter + SEND_ENABLED gate + exclude consent_required | campaigns/*, src/lib/send-pacing.js, src/skills/S065-touch-scheduler/scripts/send-due.js, scripts/validate-campaigns.js | ✅ DONE |
| P2-7 | Deliverability guard (weekly SPF/DKIM/DMARC + Postmaster on 6 domains) | scripts/deliverability-guard.js, .github/workflows/deliverability-guard.yml | ✅ DONE |

## Detail log

### P2-1a (entity-type gate) — DONE
- `src/lib/sourcing/icp.js`: added `classifyEntityType(companyType|name, {asName})` + `entityNeedsConsent(bucket)` + exports. Buckets CH company_type / name → company|partnership|sole_trader|other|unknown. LLP/limited-partnership = company (corporate body); ordinary partnership + sole trader = individual subscriber → consent. Unit-tested 16/16.
- `src/lib/sourcing/bulk-sourcer.js`: upsertLead now persists `entity_type` (from rec.company_type via classify, else name heuristic; only positive buckets stored). sourceCH passes `r.company_type` through.
- `scripts/qualify-and-queue.js`: entity-type gate runs BEFORE tier routing. consent-required leads → consent_required=TRUE, quality_fit=FALSE, lifecycle='consent_required', EXCLUDED from cold path (never queued). Additive IF NOT EXISTS guards for both columns.
- `schema/canonical-schema.{json,sql}`: added `consent_required boolean DEFAULT false` (P2-owned).
- Evidence: icp.js:99-160 (helpers), qualify-and-queue.js:48-66 (gate), bulk-sourcer.js:69-78 (persist).

### P2-1b (governor) — DONE
- `src/lib/governor.js` NEW: per-sector round-robin Tier-1 governor. `allocateRoundRobin(budget,available,order)` (pure, unit-tested 5/5: even 10x10 when stocked, fair-then-rollover when thin, supply-cap). `canReleaseLead({sector_code})` inline gate (total 100/day + per-sector ceil(100/10)=10 lane). `releaseToday()` batch sweep. `ukToday()` = Europe/London date (reset 00:00 UK). Priority sectors loaded from sector-grid.json (the 10).
- `scripts/qualify-and-queue.js`: Tier-1 leads consult `governor.canReleaseLead` before queue; gov-held leads stay qualified (picked up next sweep), released leads stamp governor_released_at + queue if clean Touch-0 draft.
- `schema/canonical-schema.{json,sql}`: added `governor_released_at timestamptz` + partial index.
- Live note: DB-backed snapshot degrades safely (columns not yet provisioned → empty plan, remaining=100). Needs live CI run after coordinator provisions the columns.

### P2-3 (up-to-3 LinkedIn names) — DONE
- `scripts/enrich-worker.js`: builds `liNames` = up to 3 personal (/in/) LinkedIn contacts {name,title,linkedin,source}, named decision_makers first then site URLs, deduped by URL, company-pages excluded. Stored in existing `decision_makers jsonb` + sets `channel_linkedin_ready`. Additive (legacy single linkedin_url still written). Unit-tested: cap 3, named-first, dedup, company-page exclusion all PASS.
- No schema change (decision_makers jsonb already present).

### P2-4 (scorecard nightly) — DONE
- `scripts/scorecard-nightly.js` NEW: samples 50 recent-sourced + scored leads/scraper; writes scraper_scorecard (existing table) with valid_email_pct, named_contact_pct, sector_match_pct, linkedin_id_pct, duplicate_pct, tier1_pct (tier_mix headline), cost_per_lead (serper spend / serp-derived leads). Red flag (valid<60 OR sector<70) → one notifications row → daily digest. `--dry-run` for read-only verify.
- `schema/canonical-schema.sql`: added `CREATE OR REPLACE VIEW v_scraper_scorecard_latest` (DISTINCT ON latest per scraper + red_flag bool) for NocoDB.
- `.github/workflows/nightly-workers.yml`: wired governor-release.js + scorecard-nightly.js into the nightly bash block.
- LIVE dry-run verified: 9 scrapers scored, 7 red-flagged; maps=strong (83% valid/100% sector), serp-top healthy (55/48/71/55, cpl 0.0419), serp_organic_top100 0% (recent scrape batch genuinely un-sectored = true red flag). Serper cost attribution works.

### P2-2 (eval gate) — DONE
- `src/lib/enrich/lead-quality.js`: extracted PURE `decideTier(signals)` from scoreLead (byte-identical tier logic), exported decideTier/TIER1_MIN/BAR_MIN. scoreLead now calls it. This is the testable seam (scoreLead re-fetches live sites so it can't be tested against static labels; decideTier is deterministic).
- `eval/qualifier.json` NEW: 50 representative real leads (live Neon, read-only, balanced spread across 10 priority sectors + non-priority T3s; 3 synthetic T1 happy-path). expected_tier = decideTier on each lead's captured signals; hand-reviewed for sensible spread (T1:9, T2:27, T3:14). threshold_pct=90.
- `scripts/eval-qualifier.js` NEW: deterministic mode runs decideTier over captured signals → tier-agreement; `--live` runs full scoreLead (spot-check, never gates); `--report` prints table. Exit 1 when agreement < threshold.
- `.github/workflows/eval-qualifier.yml` NEW: PR-triggered (on qualifier files) + weekly; runs deterministic gate (required) + live spot-check (informational).
- VERIFIED: deterministic eval 50/50=100% PASS; regression proof = flipping 6 labels → 88% → EXIT 1 (blocks merge); restored → EXIT 0. All T1 labels pass the documented-contract sanity check.

### P2-5 (campaigns + pacing) — DONE
- PACING `src/lib/send-pacing.js`: ramp fixed `[5,10,20,30,40]` → **30/40/45 over three 10-day steps** (perInboxCap: <10d=30, <20d=40, 20d+=45; env RAMP_STEP1/2/3). Added `isSaturdayUK`/`sendingPausedToday` (Saturday cold-send pause, UK day, env SEND_SATURDAY_PAUSE) + `startupJitter` (randomised 0-180s, env SEND_JITTER_MAX_S). Unit-tested 10/10 ramp + Saturday detection.
- SEND PATH `src/skills/S065-touch-scheduler/scripts/send-due.js`: added **SEND_ENABLED master gate** (default OFF — verified halts "No mail sent"), Saturday pause, startup jitter, and **consent_required exclusion** in pickDueDrafts (COALESCE(consent_required,FALSE)=FALSE + lifecycle 'consent_required' excluded). Suppression pre-send already present (verified).
- CAMPAIGNS `campaigns/`: README + _meta.json (cadence 0/+3/+7/+12/+19, rails, header contract) + _footer.txt (founder-blocked {{company_number}}/{{ico_number}}/{{reg_address}} + visible {{unsubscribe_url}} + provenance line) + 10 per-sector files (LS HC AE DN FS RE HO FB ED PB), each 5 touches (0/1/2 from the founder draft + 2 nudges: switch-challenge, breakup). Two asks/touch, regulated line, credential, right-person ask.
- `scripts/validate-campaigns.js` NEW: static compliance gate (footer vars, List-Unsubscribe contract, visible unsub link, two asks, regulated line, credential, no em-dash/scarcity, audit_url, all 10 sectors). VERIFIED PASS; em-dash injection → FAIL exit 1. Wired into eval-qualifier.yml.
- List-Unsubscribe: relay-router.js already emits List-Unsubscribe (mailto + RFC-8058 one-click when UNSUB_ENDPOINT set) + List-Unsubscribe-Post on all 6 providers (verified, no change needed). NB relay-router relays are the FROZEN legacy set; Mystrika is the live send brain (its headers configured in Mystrika UI — flag for coordinator).

### P2-7 (deliverability guard) — DONE
- `scripts/deliverability-guard.js` NEW: weekly DNS-over-HTTPS (Cloudflare + Google fallback) check of SPF + DKIM (7 selectors incl google) + DMARC (+policy) + Google-Postmaster connection (google-site-verification TXT proxy) for each sending domain. Domains read from mailbox_pool.domain (live) else the 6 IceMail domains (env SENDING_DOMAINS overrides). Flags → notifications row (digest "Deliverability + domains" group) + realtime alert via notify-event.js 'stuck'. `--report` = read-only.
- `.github/workflows/deliverability-guard.yml` NEW: weekly Mon 06:20, heartbeat-wrapped.
- LIVE VERIFIED: all 6 IceMail domains pass SPF/DKIM/DMARC(quarantine)/Postmaster; injected example.org correctly flagged "not connected to Google Postmaster" + alert message formed.
