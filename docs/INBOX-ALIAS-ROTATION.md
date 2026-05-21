# Inbox / alias rotation — how the 90 senders work

## The 90 at a glance
- **90 persona aliases** in the `aliases` table: 45 on `tamazia.co.uk` + 45 on `tamazia.in`.
- Each has: `persona_name`, `first_name`, `domain`, `relay` (design metadata), `warmup_day`, `day_quota`, `sent_today`, `status`, `bounce_count_7d`, `last_used_at`.
- All 90 currently `status=active`, warmup day 1, `day_quota=2`.
- All 90 are **auth-ready to send today** via SMTP2Go: both domains pass SPF (co.uk 3 lookups, .in 8 — both under the RFC limit of 10), both carry SMTP2Go DKIM (`s1._domainkey`), both have DMARC (co.uk quarantine, .in reject). Because SMTP2Go signs with `d=tamazia.co.uk` / `d=tamazia.in`, DKIM aligns and DMARC passes for **any** persona address — verified live by sending from `oscar@tamazia.co.uk` and landing in inbox.

## How rotation works (now wired into the live sender)
`src/lib/alias-rotator.js` → used by `src/skills/S065-touch-scheduler/scripts/send-due.js`.

**Selection = LRU + quota + health:**
1. **Health gate** — only `status IN (active, live, warmup_only)` and `bounce_count_7d <= 3` are eligible. S016 alias-health-monitor demotes any alias that bounces/complains; the rotator never picks a demoted one.
2. **Quota gate** — skip any alias where `sent_today >= day_quota`. Honours the warmup ramp.
3. **LRU order** — `ORDER BY last_used_at ASC NULLS FIRST`. The longest-idle healthy alias sends next, so volume spreads evenly and no single identity over-sends.

**Thread consistency:** Touch 0 picks a fresh alias. Touches 1-3 (follow-ups) reuse the *same* alias that sent Touch 0 (stored in `draft_metadata.from_alias_id`), so the prospect sees a coherent thread from one person, not four strangers.

**After each send:** `markUsed()` does `sent_today += 1, last_used_at = NOW()`.

## Warmup ramp (self-advancing)
`dailyReset()` runs once a day (cron 00:05):
- `sent_today → 0`
- `warmup_day += 1`
- `day_quota = LEAST(40, GREATEST(day_quota, 2 × (warmup_day+1)))` — ramps 2 → 4 → 6 … capped at 40/day per alias
- `warmup_phase → warm` once `warmup_day >= 21`

Wire it: add to crontab (or the W14 launchd schedule):
```
5 0 * * *  cd /Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION && node src/lib/alias-rotator.js --reset >> logs/alias-reset.log 2>&1
```

## Capacity maths (the real constraint)
- Alias side: 90 × 2/day today → ramps to 90 × 40 = 3,600/day theoretical.
- **Relay side is the bottleneck. SMTP2Go free tier = 1,000 emails/month ≈ 33/day sustained.**
- So today's effective ceiling is ~33 sends/day regardless of how many aliases have quota. Check live headroom anytime:
  ```
  node src/lib/alias-rotator.js --capacity
  ```

## Honest state of the 5-relay design
The `aliases.relay` column assigns each alias to one of 5 relays (resend 32, mailersend 18, smtp2go 16, mailjet 16, sendgrid 8) for IP/reputation diversification. **Only SMTP2Go has a live API key.** The other four (resend, mailersend, mailjet, sendgrid) have empty/missing keys. So:
- Today: the rotator sends **all** identities through SMTP2Go (the `relay` binding is ignored by the live path). This gives **identity diversification** (90 personas) but **not IP diversification** (one relay's IP pool).
- Risk (second-order): if SMTP2Go's shared IP reputation dips, all 90 personas feel it at once. Identity rotation mitigates per-sender flags and inbox-clustering, but not relay-level reputation events.

## The scaling unlock (when volume justifies it)
To activate true multi-relay diversification and lift the 33/day ceiling, sign up (all have free tiers) and paste keys into `.env`:
| Relay | Free tier/month | Env var |
|---|---|---|
| Resend | 3,000 | `RESEND_KEY` |
| MailerSend | 3,000 | `MAILERSEND_KEY` |
| Brevo | 9,000 | `BREVO_KEY` |
| Mailjet | 6,000 (200/day) | `MAILJET_KEY` / `MAILJET_SECRET` |
| SendGrid | 3,000 (100/day) | `SENDGRID_KEY` |

Combined free capacity ≈ **24,000+/month** across 5 relays + 2 domains + 90 identities. Each relay needs its domain verified + DKIM published (same pattern as SMTP2Go). Once keys are in, extend the rotator to route by `alias.relay` and add a per-relay daily cap. Flag for a developer step only if you want the multi-relay router built — the current single-relay rotation needs no code changes to keep running.

## What requires you (each tiny, optional)
1. **Wire the daily reset cron** (one line above) — otherwise warmup won't auto-advance.
2. **Add 4 relay keys** when you want >33/day — pure signups, £0.
3. **tamazia.in**: send-capable today, but I can't edit its DNS (different CF zone, my token is .co.uk-scoped). If you want me to manage .in DNS too, generate a DNS:Edit token scoped to tamazia.in.
