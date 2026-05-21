# Anti-spam / inbox-placement hardening

Research-backed against the 2026 Gmail/Yahoo/Microsoft bulk-sender rules. Goal: 90%+ inbox placement at scale.

## The 2026 rules we must satisfy
- **Spam complaint rate < 0.3%** (Google's enforcement line). Target **< 0.1%**. At/above 0.3% the domain loses Gmail delivery mitigation until 7 consecutive days back under.
- **Bounce rate < 2%.**
- **SPF + DKIM + DMARC** all required; DMARC must show active progression toward quarantine/reject.
- **RFC 8058 one-click unsubscribe** for bulk; unsubscribe in ≤2 clicks, honored within 2 days.
- **Predictable warmup**: 5-10/day on new domains ramping over 4-6 weeks.
- **Engagement-driven**: opens/clicks/replies now feed reputation in real time.

## Our system: audited, problems found, fixes applied

| Area | Status | Action |
|---|---|---|
| SPF | PASS | `v=spf1 include:zohomail.eu include:spf.smtp2go.com ~all` (3 lookups). .in 8 lookups, both under limit. |
| DKIM | PASS | SMTP2Go `s1._domainkey` + Zoho `zoho._domainkey` both published & valid. |
| DMARC | PASS | co.uk `p=quarantine`, .in `p=reject`. Meets "active progression". |
| **List-Unsubscribe** | **FIXED** | GAP: the new multi-relay router shipped without unsubscribe headers. Added `List-Unsubscribe` (mailto) to all 4 live relays (Brevo/Mailjet/SendGrid/SMTP2Go). One-click `List-Unsubscribe-Post` auto-enables once `UNSUB_ENDPOINT` env is set. |
| **Content spam-lint** | **BUILT** | New `content-linter.js` scores every draft (SpamAssassin-style: trigger phrases, ALL-CAPS, `!` density, link count, length, emoji). Wired as a pre-send gate in S065 — drafts scoring >5 are blocked (`send_status=blocked_spam_lint`) and never sent. All 13 live drafts score 0-pass. |
| Warmup ramp | PASS | Alias rotator: day_quota 2 → +2/day → 40 cap, ~3-week ramp. Matches 5-10/day start. |
| Per-alias health | PASS | S016 monitor demotes aliases on bounce ≥2% / complaint ≥0.5%; rotator skips demoted ones. |
| Domain-age penalty | TIME | Mail-Tester −0.8 FROM_FMBLA_NEWDOM28 resolves automatically when tamazia.co.uk passes 28 days (~early June). Not fixable by config. |

## Remaining hardening (flagged — needs your input or a small build)

1. **HTTPS one-click unsubscribe endpoint** (for strict bulk compliance >5k/day per provider). Add `/unsub` route to the existing CF audit-worker, then set `UNSUB_ENDPOINT=https://tamazia.co.uk/unsub` in `.env` — the router auto-adds the `List-Unsubscribe-Post: One-Click` header. Requires a Worker redeploy (developer-flagged, ~30 min).
2. **Gmail Postmaster Tools** — verify tamazia.co.uk in postmaster.google.com to monitor the live spam-rate vs the 0.3% line. Free; needs one DNS TXT (I can add via the DNS API once you confirm you want it).
3. **Recurring seed-list inbox-placement testing** across Gmail/Outlook/Yahoo. Free options researched: GlockApps (free tier, 3 tests/mo), MailReach (trial), mail-tester (1/day free). Recommend wiring a weekly seed test via n8n that sends a sample through each relay to a seed inbox set and logs placement. Builds on the n8n backbone (task 65).
4. **Per-relay bounce/complaint webhooks** — each relay posts bounces differently (Brevo/SendGrid/Mailjet webhooks → a single ingest endpoint → bounce_events). Feeds S016 + keeps complaint rate visible. Developer-flagged (webhook endpoint needed).

## Volume discipline (the single biggest lever)
At launch, hold to the warmup ramp regardless of the 50k ceiling. Sending 50k from cold infrastructure in week one guarantees spam-foldering. The rotator + per-alias quota enforces this automatically — do not override it. Realistic safe ramp: ~300/day week 1 → ~1,500/day week 4 → steady-state across the relay pool.
