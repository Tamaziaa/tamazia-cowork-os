-- B: online-advertising / Google laws (jurisdiction-gated). CAN-SPAM (US) + Google E-E-A-T author signal (global). Idempotent.
INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version, rules_count, last_reviewed_at, reviewed_by, status, notes)
VALUES ('CAN-SPAM Act','US_CAN_SPAM','US','2025.1',2,'2026-06-03','Tamazia Engine','active','US commercial email marketing law (FTC); USD 53,088 per email')
ON CONFLICT (framework_short) DO NOTHING;
