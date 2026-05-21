-- Phase 2 Task 2.5.2: framework_versions registry.
-- Auditable backbone — every Regulatory Signal Scan output cites a row from this table.

CREATE TABLE IF NOT EXISTS framework_versions (
  id SERIAL PRIMARY KEY,
  framework_name VARCHAR(200) NOT NULL,
  framework_short VARCHAR(50) NOT NULL UNIQUE,
  jurisdiction VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  rules_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  reviewed_by VARCHAR(200) NOT NULL DEFAULT 'Aman Pareek, International Business Lawyer',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_framework_short ON framework_versions(framework_short) WHERE status = 'active';

INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version) VALUES
  ('UK GDPR Article 13 Disclosure Requirements', 'UK_GDPR_A13', 'UK', '1.0.0'),
  ('Privacy and Electronic Communications Regulations', 'UK_PECR', 'UK', '1.0.0'),
  ('ICO Cookie and Similar Technologies Guidance', 'UK_ICO_COOKIES', 'UK', '1.0.0'),
  ('EU GDPR (Regulation 2016/679)', 'EU_GDPR', 'EU', '1.0.0'),
  ('FCA CONC 2.5 Financial Promotions', 'UK_FCA_CONC25', 'UK', '1.0.0'),
  ('Solicitors Regulation Authority Code of Conduct', 'UK_SRA_COC', 'UK', '1.0.0'),
  ('Care Quality Commission Marketing Standards', 'UK_CQC', 'UK', '1.0.0'),
  ('Medicines and Healthcare products Regulatory Agency', 'UK_MHRA', 'UK', '1.0.0'),
  ('UAE Personal Data Protection Law (Federal Decree-Law 45/2021)', 'UAE_PDPL', 'UAE', '1.0.0'),
  ('US FTC CAN-SPAM Act', 'US_FTC', 'US', '1.0.0')
ON CONFLICT (framework_short) DO NOTHING;
