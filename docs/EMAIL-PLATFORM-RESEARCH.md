# Email sending platform research · Google Workspace vs M365 vs alternatives
Question: is Google Workspace / Microsoft 365 / another tool better for sending ~100 emails per inbox per day? Researched across 10+ sources (Litemail, Prospeo, DitLead, PuzzleInbox, Icemail, Outboundsystem, Inframail, Leadsmonky, Maildeck, Nerdbot).

## The headline answer (honest)
**100 cold emails/day from a single inbox is unsafe on EVERY platform.** The 2026 safe ceiling is **30-50/inbox/day warmed** (15-25 is the conservative baseline). Pushing 100-200/inbox/day risks spam-foldering and temporary suspension. So the question "which platform sends 100/id/day" has no safe answer — the correct model is **many inboxes at low volume**, not high volume per inbox.

## Per-platform (cold, per inbox/day)
| Platform | Safe cold/day | Inbox placement | Cost/inbox/mo | Notes |
|---|---|---|---|---|
| Google Workspace | 30-50 (warmed) | ~94% Gmail | $7-8.40 | Tightening SMTP; OAuth only; best for Gmail recipients |
| Microsoft 365 | 30-50 (150-200 fully warmed) | 88-95% Outlook | ~$6 | Deprecating basic SMTP 2026; best for Outlook/enterprise |
| Zoho Mail | low; IMAP/SMTP paid-only | good | ~£1 (Lite) | Cheapest; our current receive host |
| Dedicated relays (SMTP2Go/Brevo/Mailjet/SendGrid) | API, not per-inbox | SMTP2Go 96%, Postmark 94%, SendGrid 82% | usage-based | **What we already run** |

## The real architecture (how volume cold is actually done)
- Formula: **daily target ÷ 40 = inbox count.** 1,000/day ≈ 25 inboxes; 5,000/day ≈ 125 inboxes.
- 1 domain hosts **2-3 inboxes** safely. So 25 inboxes ≈ 10-12 domains.
- **Never send cold from your primary domain** (tamazia.co.uk) — use secondary look-alike domains so a reputation hit can't touch founder@ / investor mail.
- Pre-warmed inboxes ($4.99) extend lifespan 3-6x vs fresh (which burn out in 8-12 weeks).
- Cheapest scale: flat-rate inbox providers — **Inframail ~$129/mo unlimited inboxes**, or Mailforge/Mailscale $3-15/inbox — far cheaper than Google Workspace at scale ($1,400+/mo for 200 inboxes).

## Recommendation for Tamazia (ranked)
1. **Founder outreach (low-volume, high-value):** keep sending Aman-signed pieces from `aman@tamazia.co.uk` via our relays. 20-40/day. No new tool needed. ✅ already wired.
2. **High-volume cold (toward 50k/mo):** do NOT use Google Workspace at 100/id/day. Use **secondary cold domains** (e.g. try-tamazia.com, tamazia-team.com — ~£8 each) × 2-3 inboxes each at 35/day, on a **flat-rate provider (Inframail ~$129/mo unlimited)** + warmup. This is the cheapest credible path to thousands/day without risking the primary domain.
3. **Relay layer:** keep SMTP2Go (96% placement, best-in-class) + the multi-relay router we built for the API-send path.
4. **Zoho Mail Lite (~£1/mo)** — only needed to unlock IMAP reply automation on founder@ (separate from sending volume). FLAGGED to do last per your instruction.

## Bottom line
Google Workspace/M365 are NOT better for 100/id/day — nothing is, because 100/id/day cold is itself the problem. The winning setup = many cheap warmed inboxes on secondary domains at ~35/day each, via a flat-rate provider, with our relay+rotation engine driving them. We already have the rotation + relay + journey layer; the missing piece for true volume is secondary-domain inboxes (a ~$129/mo decision when you're ready to scale past the free relay ceiling).
