# TAMAZIA COCKPIT — complete admin dashboard spec & build prompt
The single end-to-end file. Every pipeline we run, every element to track, every section/widget/graph/button, and a ready build prompt. Built from current dashboard best practice (AgencyAnalytics, Improvado, Whatagraph, Prospeo, DigitalApplied, 2026) + the full Tamazia pipeline. Honesty: I researched authoritative sources and read our entire pipeline; I did not literally view 100 dashboards.

---

## PART 1 · DESIGN PRINCIPLES (the rules this dashboard obeys)
1. Tiered KPIs: 3-5 headline numbers up top, 10-15 diagnostic metrics below that explain movement. Never a flat wall of numbers.
2. Funnel-stage, not flat: TOFU (sourced/qualified) / MOFU (contacted/replied) / BOFU (booked/won) get distinct views; they move on different timelines.
3. Real over vanity, and REAL over TEST: every count excludes test/seed/investor leads by default, with a test toggle. The headline truth is always "real prospects / real sent / real replies."
4. Time-to-answer < 30s: any screen answers its question in one glance. F-pattern: most important top-left, biggest font, highest contrast.
5. Outbound weekly cadence, inbound monthly cadence framing on trend charts.
6. Actionable: every anomaly has a one-click action or drill-down; nothing is read-only that could be a button.
7. Claude light theme: warm off-white (#faf9f5), serif headings, clay accent (#c96442), soft cards, generous whitespace, inline SVG charts.
8. Self-diagnosing: the board tells you what is broken and what is about to break (health probes), not just what happened.

---

## PART 2 · THE FULL TAMAZIA PIPELINE (what the dashboard must mirror)
Each pipeline = its data source(s) + the workflow + what to surface.

1. **Sourcing** — `serp-engine.js` + `query-calendar.js` (14,400-query rotation, 10 sectors × geo, sponsored + organic streams) → `leads`, `scrape_runs`. Surface: leads/day, by sector/geo/stream, aggregators rejected, dupes skipped, query yield.
2. **Enrichment** — `waterfall.js` + `enrich-and-queue-channels.js` (Hunter emails, all socials, website) → `leads.contact_email/all_emails/all_socials/website`. Surface: % enriched, contacts found, channels per lead.
3. **Verification** — `free-verify.js` + `verify-contacts.js` (Hunter + DIY syntax/MX/disposable/role/SMTP/catch-all/greylisting) → `leads.verify_status/contact_confidence`. Surface: valid/risky/invalid split.
4. **Quality gate** — `lead-quality.js` (10 layers, PASS≥35, FIT flag) → `leads.quality_score/quality_fit/quality_layers`. Surface: score distribution, pass rate, FIT count, layer breakdown per lead.
5. **Personalisation** — `S063 deep-research` (news + sector intel + brand pointers + Touch 0) → `outreach_drafts` (touch 0 personalised; touches 1-3 S064 locked templates). Surface: drafts ready, placeholder/blocked count, personalisation pointers per lead.
6. **Audit micro-site** — audit-worker + `audit_*` tables → `leads.audit_url`. Surface: audits minted, Touch-1 coverage, audit views.
7. **Send & cadence** — `send-due.js` (Touch 0 →+5d→+10d→+20d), relay-router, alias-rotator → `sends`, `outreach_drafts`. Surface: sends/day, by touch, by relay, by alias, queue depth, due today, halted (bounce auto-pause).
8. **Deliverability** — relay caps, `bounce_events`, alias health (S016) → `aliases`, `bounce_events`. Surface: bounce rate, relay usage vs caps, alias health/warmup, send-volume trend.
9. **Replies & journey** — Gmail IMAP poller + S012 14-cat classifier → `inbound_emails`, `email_sequence_state`, `client_journey`. Surface: replies, classification mix, reply rate, lifecycle stages, opt-outs honored.
10. **Multi-channel** — LinkedIn/Instagram manual windows → `channel_sends`. Surface: pending LinkedIn/Insta, mark-sent → advance.
11. **Bookings** — Cal.com → `cal_bookings`. Surface: calls booked, show rate.
12. **Website forms** — `/api/audit|contact|briefings` → (KV today; `leads` after sync) → `leads (acquisition_channel='website_form_*')`. Surface: form submissions by type, inbound warm leads.
13. **External SEO/analytics** — GSC (clicks/queries/positions), GA4 (sessions/conversions), GBP (views/calls/directions). Surface: organic visibility, traffic→lead, local actions.
14. **Compliance** — opt-outs, suppression, framework versions, audit trail → `email_sequence_state`, `inbound_emails`. Surface: opt-outs honored, suppression list, test/investor exclusion.
15. **Health & intelligence** — `health-check.js` (32 probes) → `system_health`; `intel-pulse.js` (hourly PhD brief) → Slack/Telegram. Surface: health score + checks, hourly improvements + critical flags.

---

## PART 3 · EVERY ELEMENT TO TRACK (data model → dashboard fields)
- **leads**: id, company, domain, sector, jurisdiction, contact_email/contact_first, all_emails, all_socials, website, acquisition_channel, scrape_stream, lead_type, lifecycle_stage, status, quality_score, quality_fit, quality_layers, verify_status, contact_confidence, audit_url, next_touch_date, replied, last_reply_received_at, aggressive_source/selected, duplicate_of, created_at.
- **sends**: lead_id, alias_id, recipient, subject_used, message_id, relay_used, sent_at, status, touch_number, opened_at, replied_at, bounced_at.
- **outreach_drafts**: lead_id, channel, draft_subject, draft_body, send_status, draft_metadata{touch, relay_provider, rfc_message_id, from_alias}.
- **inbound_emails**: from/to_email, subject, classification, classification_confidence, matched_lead_id, reviewed, received_at.
- **channel_sends**: lead_id, channel, touch, message_text, status.
- **aliases**: email, persona_name, status, day_quota, sent_today, relay, domain.
- **bounce_events**: lead_id, recipient, bounce_type, smtp_code, received_at.
- **scrape_runs**: run_date, sector, stream, queries_run, leads_found, dupes_skipped, aggregators_skipped.
- **system_health**: check_key, category, status, detail, metric, checked_at.
- **cal_bookings**, **audit_events/pages**, and external: GSC (date, query, page, clicks, impressions, ctr, position), GA4 (sessions, users, conversions, source/medium), GBP (views, calls, direction_requests, reviews).

---

## PART 4 · THE DASHBOARD — section by section, widget by widget, button by button
Top bar (always visible): brand · live truth line "REAL: prospects N · sent N · replies N (incl test: …)" · health score chip · global search · test-data toggle · refresh.

### A · TODAY (default) — "what needs me now"
- 6 action cards (count + Open): New replies to action · LinkedIn due · Instagram due · Aggressive to review · Organic to verify · Audits to mint. Card turns clay when >0.
- "What needs you today" checklist (each row → Open the relevant tab; one-click resolve where possible).
- Mini funnel (sourced→qualified→contacted→replied, with conversion %).
- 14-day send sparkline.
- Hourly intel-pulse latest: summary + top-3 improvements + critical flags (read from system_health/intel store).

### B · PIPELINE & SOURCING
- Funnel (big): Sourced → Qualified → Contacted → Replied → Booked → Won, conversion % between each, REAL only.
- Quality-score distribution (bars: 70-100/50-69/35-49/0-34/unscored) + pass-rate % + FIT count.
- Sourcing: leads/day line (14d), by sector (bars), by geo, by stream (sponsored vs organic), aggregators rejected, dupes skipped, query yield (top/bottom queries). From scrape_runs.
- Drill: click a sector → its leads table (sortable, filter by score/status).
- Buttons: "Run scrape now" (trigger), "Verify organic batch", per-lead "Send to pipeline".

### C · OUTREACH & CADENCE
- Sends/day (14d line), by touch (0/1/2/3 stacked), queue depth, due-today count, halted? (bounce auto-pause banner).
- Cadence board: leads by status (touch_0/1/2/3_queued, cadence_complete, replied, quality_blocked, excluded_nonprospect).
- Drafts: ready / blocked_spam_lint / blocked_placeholder / quarantined — with counts + drill to the offending draft.
- Recent sends table: company, subject, relay, touch, when, opened?, replied?.
- Buttons: per-draft "view/edit", "regenerate Touch 0", "approve→send" (with the in-chat confirm gate), pause/resume a lead.

### D · DELIVERABILITY & SENDERS
- Headline: bounce rate % (warn 3/fail 8), real sent (all-time + 24h), reply rate %.
- Relay usage vs daily caps (bars per relay), failover events.
- Alias health: status mix (healthy/warmup/demoted/blocked), warmup ramp, sent_today/quota per alias, demotions on bounce/complaint.
- Bounce log: recipient, type, smtp_code, when.
- Send-volume + open/reply trend (when open tracking lands).

### E · REPLIES / INBOX COMMAND CENTER
- Reply list: from, matched lead, classification pill (interest/meeting/question/OOO/bounce/opt-out), confidence, body preview, drafted response.
- One-click: approve→send (in-chat confirm), send-audit, edit, close/handled, mark opt-out.
- Reply rate %, classification mix, time-to-first-reply, unmatched replies, opt-outs honored (must be 0 still-queued).

### F · SEO / SEARCH CONSOLE (GSC)
- Organic clicks/impressions/CTR/avg position (28d trend) · top queries (clicks, position, CTR) · top pages · query movers (up/down) · non-branded rankings · indexation/coverage. From GSC API (after credential).
- Per-prospect angle: which prospects rank/don't (ties SEO to outreach).

### G · ANALYTICS (GA4) + WEBSITE FORMS + GBP
- GA4: sessions, users, conversions, source/medium split, organic→lead rate, top landing pages. (property 393591822.)
- Website forms: submissions by type (audit/contact/newsletter), trend, → inbound leads created, conversion to qualified.
- Cal.com bookings: calls booked, show rate.
- GBP: profile views, calls, direction requests, reviews (rating trend).

### H · COMPLIANCE & AUDIT
- Opt-outs honored (still-queued = 0), suppression list, test/investor exclusion count, framework versions in use, audit-trail export button (per lead / all), unsubscribe link presence.

### I · SYSTEM HEALTH (self-diagnosis)
- Overall score % + fail/warn/ok by category (infra, keys, liveness, sourcing, quality, send, alias, deliverability, reply, data). 32 probes from system_health, each with detail + the action.
- Liveness chips: sender / scraper / reply-poller / host running? last-run age.

### J · INTELLIGENCE (hourly brief archive)
- Latest + history of the hourly PhD pulse: summary, ranked improvements, critical flags. "Re-run now" button.

---

## PART 5 · TRACKING AT FINGERTIPS (how each pipeline is monitored, one line each)
Sourcing→leads/day chip · Enrichment→%enriched chip · Verify→valid% chip · Quality→pass% + distribution · Personalisation→drafts-ready vs blocked · Audit→Touch-1 coverage% · Send→due-today + sends/day · Deliverability→bounce% + relay caps · Replies→reply% + needs-action · Multi-channel→pending counts · Bookings→calls booked · Forms→submissions/day · SEO→clicks + position · GA4→organic→lead% · GBP→local actions · Compliance→opt-outs-honored=0 · Health→score% · Intelligence→critical-flags count. Every chip is clickable → its full section.

---

## PART 6 · READY BUILD PROMPT (paste into v0.dev / Claude to generate, then I match it to live data)
> Build a single-page admin cockpit for "Tamazia", a B2B marketing/SEO/compliance agency running an autonomous cold-outreach engine. Warm off-white Claude-style theme (#faf9f5 bg, #c96442 clay accent, serif headings, soft rounded cards, generous whitespace, inline SVG charts, no heavy borders).
> Top bar: brand left; center a bold "truth line" (REAL prospects / real sent / real replies, with a muted "(incl test …)"); right a health-score chip, global search, a Real/Test toggle, refresh.
> Pill-tab nav: Today · Pipeline · Outreach · Deliverability · Replies · SEO · Analytics · Compliance · Health · Intelligence.
> TODAY: 6 action cards (New replies, LinkedIn due, Instagram due, Aggressive review, Organic verify, Audits to mint) that turn clay when >0; a "needs you today" checklist with Open buttons; a horizontal funnel with conversion %; a 14-day send sparkline; the latest hourly AI brief (summary + 3 improvements + red critical flags).
> PIPELINE: big funnel Sourced→Qualified→Contacted→Replied→Booked→Won; quality-score distribution bars; leads/day line; sector + stream bars; sortable leads table with score/status filters and a per-row "Send to pipeline" button.
> OUTREACH: sends/day line, sends-by-touch stacked bars, queue-depth + due-today, cadence board by status, drafts split (ready/blocked/quarantined) with drill, recent-sends table with opened/replied flags, per-draft view/edit/regenerate/approve buttons.
> DELIVERABILITY: bounce-rate headline (green/amber/red), relay usage vs caps bars, alias-health status mix + warmup ramps, bounce log.
> REPLIES: reply list with classification pills, body preview, drafted response, and one-click approve/send-audit/edit/close/opt-out; reply-rate and classification-mix charts.
> SEO: GSC clicks/impressions/CTR/position trend, top queries + pages, movers.
> ANALYTICS: GA4 sessions/conversions + source split; website-form submissions by type; Cal.com bookings; GBP views/calls/reviews.
> COMPLIANCE: opt-outs-honored, suppression list, audit-trail export.
> HEALTH: overall score + 32 checks grouped by category with green/amber/red and the action; liveness chips for sender/scraper/poller/host.
> Every metric chip is clickable to its section; nothing is a flat number that could be a button. Show me the full HTML/CSS.

---

## PART 7 · STATUS OF THE OTHER ASKS THIS TURN
- B6 placeholder gate: DONE — a draft with any unfilled `{token}` or `[Token]` can no longer queue for send.
- Real-vs-test KPIs: DONE + deployed (the live cockpit now shows the honest truth line).
- T9 (re-sync locked touch templates to the approved copy): I need the source of the "approved" copy — point me to the file/doc/Notion with the final Touch 0-3 wording, and I re-sync the S064 locked templates to it exactly.
- Open the dashboard with no auth: I will not publish your live CRM (real + test lead data) on a public URL with all protection removed — that's a data-exposure line. Safer ways to iterate together: (a) you disable the Cloudflare Access app briefly so we both view the live one, then I re-lock on your "lock" command; (b) we iterate on this spec + local renders + your reference design. Say which.
- First real email: not started — you asked for the spec first. On your "go" I run one genuine lead end to end and paste the email here for your approval before anything sends.
