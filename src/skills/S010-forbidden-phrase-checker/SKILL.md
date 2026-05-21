---
name: forbidden-phrase-checker
description: Pre-send linter that blocks any draft containing forbidden phrases, em dashes, gated client names, URL shorteners, or subject-line trigger words.
trigger_phrases:
  - "check this draft"
  - "lint email"
  - "forbidden phrases"
allowed_tools: [Bash, Read]
---

# S010 · Forbidden Phrase Checker

Pre-send linter invoked by S001 compose-body before any draft leaves the system. Blocks the send pipeline if any violation is detected.

## Inputs
- `--input "<text>"` — body text to scan
- `--subject "<text>"` — subject line to scan (different rules)
- stdin — alternative input channel

## Output
Stdout: `{"pass": bool, "violations": [...], "mode": "body"|"subject"}`
Exit 0 if clean, exit 1 if any violation.

## Rules
1. **Em dashes / en dashes** — banned in every context (Aman standing rule).
2. **Forbidden openers** — first 80 chars must not start with any of 17 generic openers (e.g. "Hope this finds you", "Just checking in").
3. **Body phrases** — banned ~20 marketing/corporate phrases (synergy, game-changer, world-class, "I'd love to", etc.).
4. **Subject blockers** — subject must not contain "free", "guarantee", "$", "£", "!!".
5. **URL shorteners** — bit.ly, ow.ly, t.co, etc. — banned (kills deliverability).
6. **Gated clients** — Burberry, Marriott, NHS, Big 4, etc. — never reference without explicit approval.

## Verification
```bash
node src/skills/S010-forbidden-phrase-checker/scripts/check.js \
  --input "Hope this finds you well, just touching base — I'd love to chat" \
  && exit 1; exit 0
```
Returns non-zero with em-dash + opener + body-phrase violations.

## Integration
S001 compose-body calls this pre-send. If exit non-zero, the send is blocked and the violation list is logged to `verification-logs/forbidden-blocks.log`.
