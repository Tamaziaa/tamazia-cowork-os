-- 2026-05-23 · domain resolver state (marks leads we tried but couldn't find a website for, so we
-- don't re-query SERP for them every cycle). Idempotent.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS domain_resolve_failed BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_leads_needs_domain ON leads (id) WHERE COALESCE(domain,'')='' AND COALESCE(domain_resolve_failed,FALSE)=FALSE;
