# Zoho inbound + warmup engine · status report

Aman, two diagnoses, both grounded in live DNS + Neon data not assumptions.

## 1 · Why founder@tamazia.co.uk is not landing in Zoho

### What is actually happening

DNS for `tamazia.co.uk` resolves these MX records right now:

```
10 route3.mx.cloudflare.net.
53 route2.mx.cloudflare.net.
67 route1.mx.cloudflare.net.
```

These belong to **Cloudflare Email Routing**, not Zoho. Every message addressed to anything @tamazia.co.uk hits Cloudflare's forwarder first. Cloudflare then either forwards the message to a destination per its routing rules, or rejects it.

Your Zoho setup is in good shape for OUTBOUND: SPF includes `zohomail.eu`, the Zoho DKIM key (`zoho._domainkey`) is published, the Zoho verification TXT (`zb60522663.zmverify.zoho.eu`) is in place, DMARC is at `quarantine` with `legal@tamazia.co.uk` reporting. None of that helps inbound when MX does not point at Zoho.

So when someone emails founder@tamazia.co.uk, Cloudflare receives the message. If you have a CF Email Routing rule that forwards `founder@` to a different destination it lands there. If you have no rule, Cloudflare returns a permanent reject and Zoho never sees the message. Either way Zoho's founder@ mailbox is permanently empty.

### Two fixes, ranked

**Recommended (clean, single mailbox provider): switch MX to Zoho directly.**
Cloudflare DNS → tamazia.co.uk → DNS → MX records → delete the three `route*.mx.cloudflare.net` rows and add Zoho EU's:

```
Priority 10  mx.zoho.eu
Priority 20  mx2.zoho.eu
Priority 50  mx3.zoho.eu
```

After propagation (15 minutes to 4 hours) all @tamazia.co.uk mail flows into Zoho mailboxes. founder@ starts receiving immediately. Cloudflare Email Routing stops working for OTHER addresses you may have set up there (legal@, hello@, etc.) so before you flip the MX confirm in Cloudflare's Email Routing tab that there are no other rules you depend on. If there are, recreate them as Zoho aliases or mailboxes first.

**Alternative (keep CF as the front door, just route founder@ to Zoho): add a Cloudflare Email Routing rule.** In Cloudflare → Email → Routing → Routing rules:
- Custom address: `founder@tamazia.co.uk`
- Action: forward to `[your Zoho external address such as tamazia.founder@zohomail.eu]`
- Save, then verify the external address from the Zoho-side notification email.

This preserves whatever CF forwarding rules exist for other addresses but adds one indirection (CF → Zoho external address → Zoho inbox). Slightly slower, and the From address shown in Zoho is rewritten.

I cannot make the change for you because the Cloudflare API token in `.env` is scoped to Workers only (no DNS or Email Routing edit permission). Either option above takes you under five minutes in the Cloudflare dashboard.

---

## 2 · Warmup engine status

### State right now

| Table | Row count | Reading |
|---|---:|---|
| warmup_pairs (template library) | 50 | seeded 2026-05-19, healthy |
| warmup_log (each warmup send + reply) | 0 | engine has never run |
| warmup_daily_usage (ramp tracker) | 0 | no usage recorded |
| mailbox_pool (warmup-capable mailboxes) | 0 | no mailboxes registered |
| mailbox_daily_usage | 0 | not tracking |
| send_throttle_state | 0 | not tracking |
| sends (cold + warmup combined) | 184 | latest send 2026-05-16, dormant 10 days |

### What this means

The warmup engine was scaffolded and seeded but never started. Every supporting table that records ACTIVITY (warmup_log, warmup_daily_usage, mailbox_pool, mailbox_daily_usage, send_throttle_state) is empty. The 50 warmup_pairs templates are sitting ready in Neon and the code at `src/lib/notify/warmup-engine.js` is in place. Nothing is calling it.

Independent of warmup, the cold-send engine also went dormant on 2026-05-16 (181 sends that day, then 1 send on 2026-05-15, then nothing for ten days). Both sides of the email pipeline are paused.

### Two root causes, both fixable

(a) `mailbox_pool` is empty. The engine refuses to send if no mailboxes are registered. The cred loader in `src/lib/notify/mailbox-pool` (or the migration `2026-05-23-warmup-engine.sql`) needs to be run with the actual SMTP credentials for the warmup-eligible addresses. Without that, the engine has nothing to send through.

(b) The cron / scheduler that invokes `warmup-engine.js` is either not configured or paused. On Oracle ARM / wherever the daily runner lives, the systemd unit or n8n workflow for `warmup-cycle` is silent.

### Next move I recommend

1. Confirm via Zoho (after the inbound fix above) that you can both receive and send from at least one tamazia.co.uk address. That is the first warmup mailbox.
2. Populate `mailbox_pool` with that address plus the others on rotation (`founder@`, `aman@`, `hello@`, `legal@` etc.) via the cred loader, or via a one-off insert.
3. Start the warmup runner. Once `warmup_log` starts logging rows daily the engine is alive. Ramp caps in `S065` will keep it inside the safe deliverability band automatically.

I can prepare the Neon insert + the systemd / n8n trigger file if you confirm the mailbox list. I do not have the SMTP passwords in this environment so the activation step needs your hand on the keyboard.

---

## 3 · Coverage matrix is in a separate document

`AUDIT-ENGINE-COVERAGE-MATRIX.md` (next file) lays out every sector, every jurisdiction, every law / regulator the engine knows about, the triggering mechanism per row, and what is missing. After you read it we go fix everything in priority order.
