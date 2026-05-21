---
name: gdpr-request-handler
description: Detects GDPR rights requests in inbound replies, classifies request type, creates a 30-day SLA tracker, sends acknowledgment, escalates to Aman + Telegram P0 alert. Article 17 (erasure) triggers immediate suppression via S007 DNC.
trigger_phrases:
  - "GDPR request"
  - "right to be forgotten"
  - "right of access"
  - "data subject access request"
  - "DSAR"
allowed_tools: [Bash, Read]
---

# S052 · GDPR Request Handler

Detects and routes data-subject rights requests under UK GDPR / EU GDPR Articles 15–22.

## Classification categories (7)
1. **Article 15** — right of access (request for copy of data)
2. **Article 16** — rectification (correct inaccurate data)
3. **Article 17** — erasure / right to be forgotten
4. **Article 18** — restriction of processing
5. **Article 20** — data portability
6. **Article 21** — objection (especially to direct marketing)
7. **UNCLASSIFIED** — requires manual review

## Behaviour
- Classify with confidence score. ≥0.8 → route automatically. <0.8 → manual review queue.
- Create `gdpr_requests` row with 30-day SLA, request_type, lead_id, original_reply_id, status='received'.
- Send acknowledgment from template per request_type (1-month response window, ICO complaint link).
- Article 17 (erasure) → immediate DNC enrolment via S007.
- Slack P0 alert to `#aman-cos`. Telegram P0 alert.
- Escalate to Aman with: lead context, original message, classifier reasoning, acknowledgment draft, suggested response.

## Verification
```bash
node src/skills/S052-gdpr-request-handler/scripts/handle.js --test-classify \
  --input "I would like to exercise my right to be forgotten" | \
  jq -e '.request_type == "Article 17"' > /dev/null
```
