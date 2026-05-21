# Phase 3 · 9 Scale Gaps Closed Pre-emptively
**Context**: Aman set the bar at "50 clients running on autopilot". The Phase 3 spec as written is sound but assumes 1 client. These 9 additions land in the same Phase 3 session so the system doesn't have to be retrofitted at scale.

## G1 · Multi-tenant workspace_id on every new table
Every Phase 3 table gets a `workspace_id` column (nullable for now, default 1 = "tamazia-internal"). When the first commercial client is added in Phase 14, the column is already there. No retrospective migration needed under load.

Tables affected: `template_variants`, `reply_classifications`, `response_drafts`, `subject_variants`, `sourcing_attribution`, `send_aborts`, `classifier_audit_log`, `dead_letter_queue`, `send_throttle_state`. Plus an index on `(workspace_id, ...)` for fast tenant filter.

## G2 · Classifier audit log
Every S012 invocation writes one row to `classifier_audit_log`: input message_id, message_hash (SHA-256 of normalised text), classifier_version, llm_used, llm_latency_ms, tokens_in, tokens_out, output_category, output_confidence, output_reasoning, fallback_chain_used. Purpose: legal defensibility + regression analysis + cost tracking.

Retention: 7 years (matches ICO data-retention guidance for marketing audit trails).

## G3 · Idempotent classifier via message_hash dedupe
Same reply can reach W3 twice (mail forwarders, n8n retries). The classifier computes SHA-256 of normalised reply text + lead_id and looks up `classifier_audit_log`. If found within 24 hours, return cached classification; do not re-spend LLM tokens.

## G4 · Dead-letter queue for classifier + draft failures
`dead_letter_queue` table captures: failure_type (classifier_timeout / classifier_quota / draft_timeout / approval_timeout), payload, attempt_count, first_seen, last_seen, status (open / in_review / resolved). Telegram P0 fires at attempt_count ≥ 3. Manual review SLA = 4 working hours.

## G5 · Per-client send throttle
`send_throttle_state` table tracks workspace_id × hour bucket × relay_name × sent_count. W2 cron node checks before each send: if workspace's hourly throttle is exceeded on every relay, postpone. Protects one client's deliverability from another client's high-volume day.

Default caps: 50/hour per relay per workspace, 500/day per workspace. Configurable per-row.

## G6 · Notification batching
At 50 clients we will exceed Slack's 1 message/second per-channel rate limit. Slack notifier collects messages within a 5-second sliding window and batches them into one rich-text Slack message with section blocks. Telegram is more forgiving but we batch the same way for consistency.

## G7 · Immutable template version history
`template_variants` rows are NEVER deleted. Status flips `active → archived` (set archived_at). When a reply comes in 6 months after a send, we can still retrieve the exact variant text that was sent.

## G8 · Subject deduplication across clients
Single subject line can't be sent to the same recipient_domain within 90 days, even if from a different workspace_id. Prevents the same email signature pattern triggering spam filters on the recipient's side.

## G9 · Backtest harness with regression fixtures
`tests/regression-fixtures/` holds 100 hand-classified reply fixtures (the seed set Aman pre-classified). Every change to S012 patterns or prompts runs `bash tests/run-classifier-regression.sh` first. Precision and recall reported. Refuse to ship if either drops below baseline.

End of scale-gap manifest. All 9 land within Phase 3.
