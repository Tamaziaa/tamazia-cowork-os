-- Shadow-validation table: full clone of audit_pages structure for zero-production-risk mint validation.
-- The website renderer reads ONLY audit_pages, so shadow rows are never served. Reversible: DROP TABLE audit_pages_shadow.
CREATE TABLE IF NOT EXISTS audit_pages_shadow (LIKE audit_pages INCLUDING ALL);
