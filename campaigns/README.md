# /campaigns/ — per-sector cold cadence (P2-5)

Compliant, per-sector cold-outreach cadence for the 10 priority sectors. **Nothing here is sent.** `SEND_ENABLED`
is OFF (master gate in `src/skills/S065-touch-scheduler/scripts/send-due.js`); these are templates the engine
renders/sends only once the founder flips the switch.

## Structure
- `_footer.txt` / `_footer.html` — pointers to the canonical footer (`src/templates/email/footer.{txt,html}`). All
  founder-blocked values are template variables filled at send time (sending is OFF, so nothing renders live):
  `{{company_number}}`, `{{ico_number}}`, `{{reg_address}}`, plus `{{unsubscribe_url}}`, `{{eu_rep_line}}`,
  `{{framework_version}}`. ⛔ = FOUNDER-BLOCKED, not filled here.
- `_meta.json` — cadence intervals, the shared compliance rails, the List-Unsubscribe header contract, and the
  "How we found you" provenance line.
- `<CODE>.json` — one file per priority sector (LS HC AE DN FS RE HO FB ED PB), each with 5 touches:
  - touch 0 — soft intro + free audit offer (leads on the soft ask)
  - touch 1 — the audit value / a specific gap (carries the minted `{{audit_url}}`)
  - touch 2 — gentle nudge + the 1:1 meeting ask
  - touch 3 — nudge: switch challenge (compare to current agency / last report)
  - touch 4 — nudge: breakup (close the file, audit stays live)

Touches 0-2 are lifted verbatim from the founder-reviewed draft
`/Users/amanigga/Desktop/TAMAZIA-REBUILD/Tamazia-Remix/campaigns/touch-copy-top10.md`. Touches 3-4 are written
here to the same compliance rails.

## Every touch carries (verified by `scripts/validate-campaigns.js`)
- Two asks: a low-friction soft ask AND the 1:1 meeting ask (the founder, never "the team").
- The line "if you market online, you are regulated" (touch 0 explicitly; woven where natural after).
- A right-person ask (polite redirect if not the decision-maker).
- The credential line: *LLM in International Business Law, King's College London*.
- The compliant footer with registered company name + number + address + ICO number (template vars), a visible
  unsubscribe link (`{{unsubscribe_url}}`), and the provenance line ("How we found you: public registers, your
  website and business directories. Details: {privacy notice}").

## Headers (set by the send path)
`List-Unsubscribe` (mailto + RFC-8058 one-click when `UNSUB_ENDPOINT` is live) and `List-Unsubscribe-Post:
List-Unsubscribe=One-Click` are emitted by `src/lib/notify/relay-router.js` for every provider. The visible
unsubscribe LINK in the body is the founder-facing belt to the header's braces.

## Compliance rails (UK)
No em dashes, no hyphen-as-pause. No fake scarcity / countdowns / invented deadlines (UK DMCCA 2024). The audit
is genuinely free to the cold recipient (the value, not bait). No client names (anonymised sector descriptors).
No invented metrics (only published regulator statistics, else omitted). Every finding shipped must be a real
detection on that prospect's own site. Sends only from warmed Mystrika inboxes, never tamazia.co.uk.
