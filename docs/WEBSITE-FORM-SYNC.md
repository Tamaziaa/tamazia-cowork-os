# Website form-lead sync · tamazia.co.uk → Neon pipeline
Ready-to-ship fix. Diagnosis, the exact code, the field map, and the two deploy steps. Compiled 2026-05-21.

## Diagnosis (confirmed by reading the live site + repo + DB)
- The site (Cloudflare Pages) has 3 lead forms + 1 booking CTA:
  - **Audit** → `POST /api/audit` — fields: `audit-input` (domain/keyword), `audit-email`, `audit-sector`.
  - **Contact / Briefing request** → `POST /api/contact` — fields: `name`, `email`, `company`, `sector`, `outcome`.
  - **Newsletter** → `POST /api/briefings` — fields: `email`.
  - **Book a Strategy Call** → `/book/` (Cal.com; already lands in the `cal_bookings` table).
- The handlers (`functions/api/contact.js`, `briefings.js`, shared `handleSubmission`) store each submission in **Cloudflare KV (`FORM_SUBMISSIONS`)** + send a **Resend** alert/auto-ack. They do NOT write to Neon.
- Result: **0 website-form leads in the `leads` pipeline.** They live in KV + email only, separate from the cockpit, quality gate, cadence, and hourly intel-pulse.
- The CF API tokens lack KV scope, so a non-invasive KV→Neon pull is blocked. The clean fix is a direct Neon write from the handlers (fail-open, never blocks the form).

## The fix — `functions/_lib/neon-sync.js` (new file)
```js
// Fire-and-forget sync of a website form submission into the Neon leads pipeline.
// Fail-open: any error is swallowed so the form's KV save + email are never affected.
export async function syncLeadToNeon(env, tab, body, request_id) {
  if (!env.NEON_URL) return;                       // no-op until the secret is bound
  const host = env.NEON_URL.replace(/.*@([^/]+)\/.*/, '$1');
  const email = (body.email || body['audit-email'] || '').toLowerCase().trim();
  if (!email) return;
  const company = body.company || '';
  const sector  = body.sector || body['audit-sector'] || '';
  const domain  = (body['audit-input'] || body.c_homepage_url || (email.split('@')[1] || '')).replace(/^https?:\/\//,'').replace(/\/.*$/,'');
  const name    = body.name || '';
  const note    = body.outcome || '';
  const channel = 'website_form_' + tab;           // website_form_contact / _audit / _briefings
  const sql = `INSERT INTO leads (company, domain, contact_email, sector, acquisition_channel, lead_type, lifecycle_stage, status, contact_first, personalisation_pointers, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,'inbound','inbound_lead','new',$6,$7,NOW(),NOW())
    ON CONFLICT DO NOTHING`;
  const params = [company || domain || email, domain, email, sector, channel, name,
                  JSON.stringify({ source:'website', tab, request_id, note }).slice(0,2000)];
  try {
    await fetch(`https://${host}/sql`, { method:'POST',
      headers:{ 'Neon-Connection-String': env.NEON_URL, 'Content-Type':'application/json' },
      body: JSON.stringify({ query: sql, params }) });
  } catch (_e) { /* fail-open */ }
}
```
> Note: confirm `leads` has a unique index on `contact_email` (or `domain`) for `ON CONFLICT DO NOTHING` to dedupe; if not, drop the `ON CONFLICT` clause or add `CREATE UNIQUE INDEX CONCURRENTLY ... ON leads(lower(contact_email))`.

## Wire it into the handlers (1 line each)
In `functions/api/contact.js` and `briefings.js`, inside `handleSubmission`, next to the existing `sideEffects.push(...)`:
```js
import { syncLeadToNeon } from '../_lib/neon-sync.js';
// ...after request_id is minted, alongside fireAlert/fireAutoAck:
sideEffects.push(syncLeadToNeon(env, tab, body, request_id));
```
For `functions/api/audit.js` (different shape): after it validates the submission, add the same `syncLeadToNeon(env, 'audit', body, request_id)` fire-and-forget call.

## Two deploy steps (the only things needed to go live)
1. **Bind the secret:** Cloudflare → Pages → tamazia.co.uk project → Settings → Variables and Secrets → add `NEON_URL` (the Neon connection string, mark as Secret/encrypted) for Production. Without this the sync no-ops (safe).
2. **Deploy:** commit the two file changes to `Tamaziaa/tamazia-website`. If the Pages project auto-deploys from GitHub, the push ships it. (Confirm the project's build/deploy source.)

## After deploy — it flows automatically
New form leads land in `leads` with `acquisition_channel='website_form_*'`, `lifecycle_stage='inbound_lead'`, status `new`. They then appear in the cockpit, get quality-scored, and are counted by the hourly intel-pulse (which already has the slot). Inbound website leads are warm, so consider routing them to a faster human-review lane rather than the cold cadence (they did not opt into cold outreach the same way).

## Compliance note
Website form submitters gave their details voluntarily (legitimate interest / consent for the requested service). Keep them on a service/reply track, not the cold persona cadence. The send gate already excludes non-prospect channels; tag these `lead_type='inbound'` so they are handled as warm inbound, not cold.
```
