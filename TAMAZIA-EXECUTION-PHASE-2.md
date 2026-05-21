# PHASE 2 · COMPLIANCE AND LEGAL FOUNDATION
**Owner: Aman primary for procurement, Claude for drafting + system integration. Effort: 8 working days (mostly waiting on external providers). Spend: £40 ICO + ~£150 PI + €299 EU rep = ~£500 first year.**

Get Tamazia legally clean to send commercial communications at scale, protect lawyer reputation, stamp every output with reviewable signoff, build the framework version registry that makes the disclaimer auditable.

## PHASE PREREQUISITE
```bash
bash scripts/verify-phase.sh 1
```

## PHASE EXIT GATE
```bash
bash scripts/verify-phase.sh 2
```

---

### Task 2.1.1: ICO registration submitted

Files: confirmations/ico-receipt.txt, policies/ico-confirmation-email.pdf
Owner: Aman
Prerequisite: Phase 1 complete
Estimated time: 15 minutes

Verification:
```
test -f confirmations/ico-receipt.txt && \
grep -E "ZA[0-9]{6,7}" confirmations/ico-receipt.txt && \
test -f policies/ico-confirmation-email.pdf
```

Expected output:
Receipt file has ICO registration number in ZA{6-7 digits} format. Confirmation email saved as PDF.

Description:
Aman visits ico.org.uk/registration. Completes self-assessment. Selects Tier 1 (small business under £632k turnover, fewer than 11 staff). Pays £40 via direct debit. Receives confirmation email within 24 hours with registration number (format ZA + 6-7 digits). Saves number to confirmations/ico-receipt.txt. Downloads confirmation email as PDF to policies/.

Failure mode: ICO portal rejects application. Resolution: Most common cause is incorrect tier selection. Verify turnover and staff count against Tier 1 thresholds.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 2.1.2: ICO number propagated to footer

Files: src/templates/email/footer.html, src/templates/email/footer.txt, src/components/Footer.astro, signatures/aman.txt
Owner: Claude
Prerequisite: 2.1.1
Estimated time: 10 minutes

Verification:
```
ICO_NUM=$(grep -oE "ZA[0-9]+" confirmations/ico-receipt.txt | head -1)
grep -q "$ICO_NUM" src/templates/email/footer.html && \
grep -q "$ICO_NUM" src/components/Footer.astro && \
grep -q "$ICO_NUM" signatures/aman.txt
```

Expected output:
Same ICO number present in all 3 files.

Description:
Read ICO number from confirmations file. Replace placeholder `{ico_number}` with actual value across email footer, website footer (Astro component), sender signature file. Commit changes. Auto-deploy via GitHub Actions makes it live.

Failure mode: One template missed. Resolution: grep across full repo for "{ico_number}" or "ico_number_placeholder", replace all.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 2.2.1: EU Article 27 representative purchased

Files: confirmations/eu-rep-receipt.txt, policies/eu-rep-contract.pdf
Owner: Aman
Prerequisite: Phase 1 complete
Estimated time: 30 minutes (signup + setup)

Verification:
```
test -f confirmations/eu-rep-receipt.txt && \
grep -E "REP_ADDRESS:" confirmations/eu-rep-receipt.txt && \
grep -E "REP_CONTACT:" confirmations/eu-rep-receipt.txt && \
test -f policies/eu-rep-contract.pdf
```

Expected output:
Receipt has representative address and contact email. Contract PDF saved.

Description:
Aman signs up at europeanrep.com (or chosen alternative from PURCHASES.md). Pays €299/year prepaid. Provides Tamazia UK Ltd company details. Receives:
- Representative legal address (typically Ireland or Germany)
- Representative contact email (dpo@europeanrep.com or similar)
- Contract document

Saves both to file and PDF. This satisfies GDPR Article 27 requirement for UK companies processing EU residents' data.

Failure mode: Provider requires additional Tamazia documentation. Resolution: Provide Companies House extract, Tamazia T&Cs, Privacy Policy.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 2.2.2: EU rep details propagated to Privacy Policy + email footer

Files: src/pages/privacy.astro, src/templates/email/footer.html (EU recipient logic)
Owner: Claude
Prerequisite: 2.2.1
Estimated time: 20 minutes

Verification:
```
REP_LINE=$(grep "REP_ADDRESS:" confirmations/eu-rep-receipt.txt | sed 's/REP_ADDRESS: //')
curl -s https://tamazia.co.uk/privacy | grep -qF "$REP_LINE"
```

Expected output:
Privacy policy live page contains EU representative address.

Description:
Update privacy.astro with EU rep section. Add to email footer with conditional logic: if recipient email ends in EU country TLD (.de/.fr/.it/.es/.nl/.be/.at/.pt/.pl/.ie/.lu/etc.) include EU rep line. JavaScript at template render time handles this.

Failure mode: Privacy page not updated visibly. Resolution: Hard refresh, check deploy succeeded.

Status: [X-OVERRIDE until 2026-05-26]

---

### Task 2.3.1: PI insurance quote secured

Files: confirmations/pi-quotes.txt (3 quotes), confirmations/pi-decision.txt (chosen quote)
Owner: Aman
Prerequisite: Phase 1 complete
Estimated time: 90 minutes (across 3 brokers)

Verification:
```
test -f confirmations/pi-quotes.txt && \
grep -c "QUOTE:" confirmations/pi-quotes.txt | xargs -I {} test {} -ge 3 && \
test -f confirmations/pi-decision.txt
```

Expected output:
At least 3 quotes captured, decision file picks one.

Description:
Aman visits Simply Business broker (15-min form, returns 4-6 quotes). Cross-quotes PolicyBee and Anansi directly. Records each in confirmations/pi-quotes.txt with format:
```
QUOTE: provider=SimplyBusiness panel_member=Hiscox cost=£185/year cover=£1M exclusions="AI content excluded unless declared"
QUOTE: provider=PolicyBee cost=£250/year cover=£1M exclusions="None for SEO/marketing claims"
QUOTE: provider=Anansi cost=£140/year cover=£1M exclusions="Lawyer-branded professional services excluded"
```

Picks cheapest meeting criteria. Writes decision to pi-decision.txt with provider, cost, policy number, start date.

Failure mode: All quotes exclude AI content or lawyer-branded services. Resolution: Use specialty broker like Caunce O'Hara who handles regulated professionals. Or accept exclusion + narrow scan scope to "signal identification only".

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 2.3.2: PI insurance purchased and policy filed

Files: policies/PI-insurance-2026.pdf, confirmations/pi-active.txt
Owner: Aman
Prerequisite: 2.3.1
Estimated time: 30 minutes

Verification:
```
test -f policies/PI-insurance-2026.pdf && \
test $(wc -c < policies/PI-insurance-2026.pdf) -gt 50000 && \
test -f confirmations/pi-active.txt && \
grep -q "POLICY_NUMBER:" confirmations/pi-active.txt
```

Expected output:
Policy PDF saved (>50KB suggests real document not just receipt). Policy number captured.

Description:
Aman completes purchase via chosen broker. Pays annual upfront (saves ~10%). Receives policy document PDF. Saves to policies/ folder. Writes summary to confirmations/pi-active.txt:
```
POLICY_NUMBER: HSX-12345678
PROVIDER: Hiscox via Simply Business
COVER: £1M per claim, £2M annual aggregate
START: 2026-05-20
END: 2027-05-19
COST: £185 paid 2026-05-17
DECLARATIONS_MADE: AI content disclosed, lawyer-branded scans disclosed
RUN_OFF: 6 years included
```

Failure mode: Policy excludes critical scenarios. Resolution: Renegotiate or escalate to Caunce O'Hara specialist.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 2.4.1: T&Cs v2026-05 drafted

Files: drafts/terms-v2026-05.md
Owner: Claude
Prerequisite: 2.1.1, 2.2.1
Estimated time: 60 minutes

Verification:
```
test -f drafts/terms-v2026-05.md && \
grep -q "Services Description" drafts/terms-v2026-05.md && \
grep -q "Fees" drafts/terms-v2026-05.md && \
grep -q "Liability Cap" drafts/terms-v2026-05.md && \
grep -q "ICO Registration:" drafts/terms-v2026-05.md && \
grep -q "EU Representative:" drafts/terms-v2026-05.md && \
wc -w drafts/terms-v2026-05.md | awk '{print $1}' | xargs -I {} test {} -ge 2000
```

Expected output:
Draft exists, includes all required sections, at least 2000 words (comprehensive).

Description:
Claude drafts comprehensive T&Cs covering: Services Description (SEO + compliance scanning + implementation + advisory), Service Tiers and Fees (3 tiers from PURCHASES doc), Term and Termination (12-month minimum, 60-day notice), Intellectual Property (Tamazia retains methodology, client retains data), Confidentiality (mutual), Liability Cap (fees paid in preceding 12 months), Indemnification (mutual, narrow), Data Protection (GDPR compliance, processor terms), Force Majeure, Dispute Resolution (English law, London arbitration), Compliance Disclaimer (this is not legal advice, scans identify signals only).

Aman reviews and edits before publishing.

Failure mode: T&Cs miss something jurisdiction-specific. Resolution: Aman's review catches; if needed, get external solicitor review.

Status: [x] VERIFIED

---

### Task 2.4.2: Privacy Policy v2026-05 drafted

Files: drafts/privacy-v2026-05.md
Owner: Claude
Prerequisite: 2.1.1, 2.2.1
Estimated time: 45 minutes

Verification:
```
test -f drafts/privacy-v2026-05.md && \
for section in "Article 13" "Article 14" "Article 15" "Article 17" "Article 20" "Article 27" "Legitimate Interest" "Data Retention" "Third-Party Processors" "International Transfers" "Cookies" "Children" "Contact Us"; do
  grep -q "$section" drafts/privacy-v2026-05.md || exit 1
done
```

Expected output:
Privacy policy draft covers all required GDPR articles and topics.

Description:
Claude drafts comprehensive Privacy Policy covering: GDPR Articles 13/14 disclosures (what data, why, legal basis, retention, rights, complaint to ICO), data subject rights handling (15 access, 16 rectification, 17 erasure, 18 restriction, 20 portability, 21 objection), legitimate interest balancing test for B2B outreach, data retention schedule per data category, third-party processors list (Resend, SMTP2GO, MailerSend, Cloudflare, Neon, n8n on Pikapod, ZeptoMail, all AI services), international transfers (SCCs where applicable), cookies (functional + analytics tracking on website), children (no processing of under-13 data), contact details (Aman, ICO complaint pathway, EU representative).

Aman reviews and edits.

Failure mode: Missing one of the required disclosures. Resolution: Use ICO Privacy Notice template checklist as second pass.

Status: [x] VERIFIED

---

### Task 2.4.3: T&Cs and Privacy Policy reviewed by Aman

Files: confirmations/legal-docs-reviewed.txt
Owner: Aman
Prerequisite: 2.4.1, 2.4.2
Estimated time: 60 minutes

Verification:
```
test -f confirmations/legal-docs-reviewed.txt && \
grep -q "TERMS_REVIEWED:" confirmations/legal-docs-reviewed.txt && \
grep -q "PRIVACY_REVIEWED:" confirmations/legal-docs-reviewed.txt
```

Expected output:
Sign-off file confirms review.

Description:
Aman reads drafts/terms-v2026-05.md and drafts/privacy-v2026-05.md. Edits in place where needed. Approves. Writes to confirmations/legal-docs-reviewed.txt:
```
TERMS_REVIEWED: 2026-05-17 by Aman Pareek
PRIVACY_REVIEWED: 2026-05-17 by Aman Pareek
EXTERNAL_LEGAL_REVIEW: [optional name + date OR "self-review sufficient for current scale"]
```

Failure mode: Aman finds material issue. Resolution: Edit, re-review, re-confirm.

Status: [x] VERIFIED

---

### Task 2.4.4: T&Cs and Privacy Policy published to tamazia.co.uk

Files: src/pages/terms.astro, src/pages/privacy.astro, deployed live
Owner: Claude
Prerequisite: 2.4.3
Estimated time: 30 minutes

Verification:
```
curl -s -o /dev/null -w "%{http_code}" https://tamazia.co.uk/terms | grep -q "200" && \
curl -s -o /dev/null -w "%{http_code}" https://tamazia.co.uk/privacy | grep -q "200" && \
curl -s https://tamazia.co.uk/terms | grep -q "Last updated: 2026-05" && \
curl -s https://tamazia.co.uk/privacy | grep -q "Last updated: 2026-05"
```

Expected output:
Both pages return 200, both show updated date.

Description:
Convert reviewed Markdown to Astro pages with consistent styling. Add "Last updated" date. Add anchor links for major sections. Add to website footer navigation. Commit and push, triggers GitHub Actions auto-deploy.

Failure mode: Astro build fails on Markdown rendering. Resolution: Validate Markdown, fix any rendering bugs.

Status: [X-OVERRIDE until 2026-05-25]

---

### Task 2.5.1: Compliance disclaimer finalised

Files: signatures/disclaimer.txt (final version)
Owner: Both
Prerequisite: 2.1.1, 2.2.1, 2.4.4
Estimated time: 15 minutes

Verification:
```
test -f signatures/disclaimer.txt && \
grep -q "Regulatory Signal Scan" signatures/disclaimer.txt && \
grep -q "Aman Pareek, International Business Lawyer" signatures/disclaimer.txt && \
grep -q "not legal advice" signatures/disclaimer.txt && \
grep -q "Privacy Policy: tamazia.co.uk/privacy" signatures/disclaimer.txt
```

Expected output:
Disclaimer references all required elements including link to live Privacy Policy.

Description:
Finalise signatures/disclaimer.txt from Phase 0 draft. Now includes:
```
This Regulatory Signal Scan is powered by Tamazia.
Frameworks are trained on publicly available regulatory sources by AI and reviewed by Aman Pareek, International Business Lawyer.
Framework version: {framework_version} | Last reviewed: {last_review_date}

This scan identifies publicly visible signals only. It is not legal advice and is not a substitute for review by qualified counsel in your jurisdiction. Recommendations should be confirmed with your legal advisor before action.

Reply STOP to unsubscribe. We process your data under legitimate interest (GDPR Article 6(1)(f)) for B2B outreach.
Privacy Policy: tamazia.co.uk/privacy | Terms: tamazia.co.uk/terms

Tamazia, {registered_office}, United Kingdom.
Company number: {company_number} | ICO Registration: {ico_number}
{eu_rep_line_if_eu_recipient}
```

Failure mode: Disclaimer too long impacts deliverability. Resolution: Test mail-tester score with and without, optimise length.

Status: [x] VERIFIED

---

### Task 2.5.2: Framework version registry built

Files: migrations/2026-05-17-framework-versions.sql, applied to Neon
Owner: Claude
Prerequisite: 1.5.2
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM framework_versions" | xargs -I {} test {} -ge 1 && \
psql "$NEON_URL" -tA -c "SELECT framework_name FROM framework_versions LIMIT 10" | wc -l | xargs -I {} test {} -ge 5
```

Expected output:
Table exists with at least 5 frameworks seeded.

Description:
Migration:
```sql
CREATE TABLE IF NOT EXISTS framework_versions (
  id SERIAL PRIMARY KEY,
  framework_name VARCHAR(200) NOT NULL,
  framework_short VARCHAR(50) NOT NULL,
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

INSERT INTO framework_versions (framework_name, framework_short, jurisdiction, version) VALUES
  ('UK GDPR Article 13 Disclosure Requirements', 'UK_GDPR_A13', 'UK', '1.0.0'),
  ('Privacy and Electronic Communications Regulations', 'UK_PECR', 'UK', '1.0.0'),
  ('Information Commissioner''s Office Cookie Guidance', 'UK_ICO_COOKIES', 'UK', '1.0.0'),
  ('EU GDPR (Regulation 2016/679)', 'EU_GDPR', 'EU', '1.0.0'),
  ('FCA CONC 2.5 (Financial Promotions)', 'UK_FCA_CONC25', 'UK', '1.0.0'),
  ('Solicitors Regulation Authority Code of Conduct', 'UK_SRA_COC', 'UK', '1.0.0'),
  ('Care Quality Commission Marketing Standards', 'UK_CQC', 'UK', '1.0.0'),
  ('Medicines and Healthcare products Regulatory Agency', 'UK_MHRA', 'UK', '1.0.0'),
  ('UAE Personal Data Protection Law', 'UAE_PDPL', 'UAE', '1.0.0'),
  ('US FTC CAN-SPAM Act', 'US_CANSPAM', 'US', '1.0.0');
```

This is the auditable backbone. Every scan output cites the version.

Failure mode: Migration fails. Resolution: Drop and recreate if no production data.

Status: [x] VERIFIED

---

### Task 2.5.3: Disclaimer injection working in compose-body

Files: ~/code/tamazia-cowork-skills/S009-compliance-disclaimer-injector/scripts/inject.js, S001 integration
Owner: Claude
Prerequisite: 2.5.1, 2.5.2, 1.4.2
Estimated time: 45 minutes

Verification:
```
node -e "
const c = require('$HOME/code/tamazia-cowork-skills/S001-compose-body/scripts/compose.js');
const out = c.test({
  alias: { first_name: 'James', email: 'james@tamazia.co.uk' },
  lead: { sector: 'hospitality', first_name: 'John', firm: 'Test Hotel', country: 'UK' },
  inject_disclaimer: true
});
// Must contain disclaimer with current framework version
if (out.includes('not legal advice') && 
    out.match(/Framework version: \d+\.\d+\.\d+/) &&
    out.match(/Last reviewed: \d{4}-\d{2}-\d{2}/) &&
    out.includes('ICO Registration:') && 
    out.includes('Aman Pareek, International Business Lawyer')) {
  process.exit(0);
}
process.exit(1);
"
```

Expected output:
Test compose includes full disclaimer with version + review date + ICO number injected.

Description:
S009 reads signatures/disclaimer.txt as template. Substitutes:
- {framework_version} from MAX(version) of framework_versions WHERE status='active'
- {last_review_date} from MAX(last_reviewed_at) of framework_versions WHERE status='active'
- {registered_office} from Tamazia corporate file
- {company_number} from Tamazia corporate file
- {ico_number} from confirmations/ico-receipt.txt
- {eu_rep_line_if_eu_recipient} conditional on recipient TLD

S001 compose-body invokes S009 as post-process step before send.

Failure mode: Substitution leaves placeholder unfilled. Resolution: Tests catch unfilled tokens, fall back to defaults.

Status: [x] VERIFIED

---

### Task 2.5.4: Disclaimer in audit page

Files: src/pages/audit/[slug]/[hash].astro footer section
Owner: Claude
Prerequisite: 2.5.3
Estimated time: 20 minutes

Verification:
```
# Will be fully testable in Phase 5 when audit pages are built
# For now, ensure the partial/component exists
test -f src/components/audit/Disclaimer.astro && \
grep -q "Aman Pareek, International Business Lawyer" src/components/audit/Disclaimer.astro
```

Expected output:
Disclaimer Astro component exists with correct content.

Description:
Create reusable Disclaimer.astro component that pulls from framework_versions and renders consistently. Used by audit pages (Phase 5) but built now so Phase 5 can integrate.

Failure mode: Component renders incorrectly on mobile. Resolution: Test in mobile preview.

Status: [x] VERIFIED

---

### Task 2.5.5: Disclaimer in PDF export

Files: src/lib/pdf-renderer.ts (Playwright config)
Owner: Claude
Prerequisite: 2.5.4
Estimated time: 20 minutes

Verification:
```
# Phase 5 will fully test
# For now, ensure renderer config includes header/footer with disclaimer
grep -q "disclaimer" src/lib/pdf-renderer.ts
```

Expected output:
PDF renderer references disclaimer for footer injection.

Description:
Playwright PDF generation needs header/footer templates. Footer template includes disclaimer text. Repeated on every page of PDF. Renderer config sets `displayHeaderFooter: true` with footerTemplate pointing to disclaimer content.

Failure mode: Footer cut off on print. Resolution: Test multiple page sizes, adjust margins.

Status: [x] VERIFIED

---

### Task 2.6.1: Compliance framework rules seeded (UK GDPR + PECR)

Files: migrations/2026-05-17-seed-uk-compliance-rules.sql
Owner: Claude
Prerequisite: 2.5.2
Estimated time: 60 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM compliance_rules WHERE framework_short IN ('UK_GDPR_A13', 'UK_PECR', 'UK_ICO_COOKIES')" | xargs -I {} test {} -ge 30
```

Expected output:
At least 30 rules seeded for UK frameworks.

Description:
Create compliance_rules table and seed with UK GDPR Article 13/14 disclosure rules, PECR Regulation 6 (cookie consent), PECR Regulation 22 (electronic marketing), ICO cookie guidance rules. Each rule: regex pattern, severity (P0/P1/P2), citation URL, recent enforcement example, exception conditions.

Schema:
```sql
CREATE TABLE compliance_rules (
  id SERIAL PRIMARY KEY,
  framework_short VARCHAR(50) REFERENCES framework_versions(framework_short),
  rule_id VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  regex_pattern TEXT,
  url_check VARCHAR(500),
  severity VARCHAR(10) NOT NULL,
  citation_url VARCHAR(500),
  enforcement_example TEXT,
  exceptions TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Example rules:
- "Privacy policy must list third-party processors" (P1)
- "Cookie banner must allow rejection equally prominent to acceptance" (P0)
- "Marketing emails must include unsubscribe mechanism" (P0)

Failure mode: Regex pattern too broad, false positives. Resolution: Test on Tamazia.co.uk itself first, refine.

Status: [x] VERIFIED

---

### Task 2.6.2: EU GDPR rules seeded

Files: migrations/2026-05-17-seed-eu-compliance-rules.sql
Owner: Claude
Prerequisite: 2.6.1
Estimated time: 30 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(*) FROM compliance_rules WHERE framework_short = 'EU_GDPR'" | xargs -I {} test {} -ge 15
```

Expected output:
At least 15 EU GDPR rules seeded.

Description:
Seed EU-specific rules: Article 27 representative disclosure, SCC for international transfers, language requirements (per country), specific national implementations (e.g., German BDSG specifics, French CNIL guidance). Mostly overlap with UK GDPR but jurisdiction-specific.

Failure mode: Country-specific nuance missed. Resolution: Phase 10 sector intelligence covers in depth, this seed is foundational.

Status: [x] VERIFIED

---

### Task 2.6.3: Sector-specific regulator rules seeded (5 sectors initial)

Files: migrations/2026-05-17-seed-sector-rules.sql
Owner: Claude
Prerequisite: 2.6.2
Estimated time: 60 minutes

Verification:
```
psql "$NEON_URL" -tA -c "SELECT COUNT(DISTINCT framework_short) FROM compliance_rules WHERE framework_short IN ('UK_FCA_CONC25','UK_SRA_COC','UK_CQC','UK_MHRA','US_FTC')" | xargs -I {} test {} -ge 5
```

Expected output:
At least 5 sector regulators have rules seeded.

Description:
Seed compliance rules for FCA (financial services), SRA (legal services), CQC (healthcare), MHRA (medical devices/pharma), FTC (US, optional initial). Each gets 5-10 rules at this stage. Phase 10 expands to 20 sectors fully.

Failure mode: Sector rule conflicts with general GDPR. Resolution: Rules don't conflict, they layer. Both can flag same content for different reasons.

Status: [x] VERIFIED

---

### Task 2.6.4: check-compliance skill updated to use framework registry

Files: ~/code/tamazia-cowork-skills/S015-check-compliance/scripts/check.js
Owner: Claude
Prerequisite: 2.6.1, 2.6.2, 2.6.3
Estimated time: 45 minutes

Verification:
```
node ~/code/tamazia-cowork-skills/S015-check-compliance/scripts/check.js --domain tamazia.co.uk --output-json | \
  jq -e '.framework_version | length > 0' > /dev/null
```

Expected output:
Compliance check returns scan results with framework version stamped.

Description:
Update S015 to query compliance_rules table at scan time, using current framework_version. Output includes per-violation: rule_id, framework_short, citation_url, enforcement_example, severity. Output also includes overall framework_version stamp for audit trail.

Failure mode: Skill calls timeout on large rule sets. Resolution: Index compliance_rules on framework_short, add caching.

Status: [x] VERIFIED

---

### Task 2.7.1: GDPR request handler skill

Files: ~/code/tamazia-cowork-skills/S052-gdpr-request-handler/SKILL.md + scripts/
Owner: Claude
Prerequisite: 2.4.4
Estimated time: 60 minutes

Verification:
```
test -f $HOME/code/tamazia-cowork-skills/S052-gdpr-request-handler/SKILL.md && \
test -f $HOME/code/tamazia-cowork-skills/S052-gdpr-request-handler/scripts/handle.js && \
node $HOME/code/tamazia-cowork-skills/S052-gdpr-request-handler/scripts/handle.js --test-classify \
  --input "I would like to exercise my right to be forgotten" | \
  jq -e '.request_type == "Article 17"' > /dev/null
```

Expected output:
Skill file exists, test classification of erasure request returns Article 17.

Description:
Create S052 skill. Detects GDPR request types in inbound replies: Article 15 (access), 16 (rectification), 17 (erasure), 18 (restriction), 20 (portability), 21 (objection). Classifier prompt + keyword fallback. On detection: creates entry in gdpr_requests table with 30-day SLA, sends acknowledgment response from template, escalates to Aman + Telegram P0 alert. Article 17 (erasure) triggers immediate suppression via S007 DNC skill while data deletion process completes.

Failure mode: Legitimate inquiry misclassified as GDPR request. Resolution: Confidence threshold 0.8 required, else manual review queue.

Status: [x] VERIFIED

---

### Task 2.8.1: Cross-jurisdiction compliance variation framework

Files: src/lib/compliance/jurisdiction-router.ts
Owner: Claude
Prerequisite: 2.6.2, 2.6.3
Estimated time: 45 minutes

Verification:
```
# Test that compliance check routes UK lead through UK rules, EU lead through both UK + EU
test -f src/lib/compliance/jurisdiction-router.ts && \
node -e "
const r = require('./src/lib/compliance/jurisdiction-router.ts');
const uk = r.routeJurisdictions({country: 'UK'});
const de = r.routeJurisdictions({country: 'DE'});
if (uk.includes('UK_GDPR_A13') && !de.includes('UK_GDPR_A13') && de.includes('EU_GDPR')) process.exit(0);
process.exit(1);
"
```

Expected output:
Jurisdiction routing returns correct framework list per country.

Description:
Build router that takes lead.country and returns applicable framework list. UK leads → UK GDPR + PECR + sector regulator. EU leads → EU GDPR + national specifics + sector regulator. US leads → FTC + state laws. UAE → PDPL + DIFC/ADGM if applicable. This drives which compliance rules check-compliance applies.

Failure mode: Country code not mapped. Resolution: Default to "strictest" (apply UK + EU GDPR if uncertain).

Status: [x] VERIFIED

---

### Task 2.8.2: Localised templates per jurisdiction English

Files: src/templates/email/locale/{uk,us,uae,sg}/*.txt
Owner: Claude
Prerequisite: 2.4.4
Estimated time: 60 minutes

Verification:
```
for locale in uk us uae sg; do
  test -d src/templates/email/locale/$locale && \
  test "$(find src/templates/email/locale/$locale -name '*.txt' | wc -l)" -ge 5
done
```

Expected output:
4 locale folders exist with at least 5 template files each.

Description:
UK English vs US English vs UAE English (which has unique conventions: more formal, Arabic transliteration awareness) vs Singapore English. Each locale folder has parallel set of base templates with localised spelling (organise/organize), idioms, regulatory references, sign-off conventions.

Compose-body uses lead.country to pick locale folder, falls back to UK English default.

Failure mode: Locale-specific edge cases. Resolution: Iterate after Phase 7 sourcing produces real leads per locale.

Status: [x] VERIFIED

---

### Task 2.8.3: Holiday calendar per market

Files: src/lib/calendar/holidays.json
Owner: Claude
Prerequisite: 2.8.1
Estimated time: 30 minutes

Verification:
```
test -f src/lib/calendar/holidays.json && \
jq -e '.UK | length >= 8' src/lib/calendar/holidays.json && \
jq -e '.UAE | length >= 5' src/lib/calendar/holidays.json && \
jq -e '.US | length >= 10' src/lib/calendar/holidays.json
```

Expected output:
Holiday data for UK, UAE, US, EU, Singapore, India each populated.

Description:
JSON file with 2026-2027 holidays per target market:
- UK: Christmas, Boxing Day, New Year, Good Friday, Easter Monday, May Day, Spring Bank Holiday, Summer Bank Holiday
- US: Federal holidays (Christmas, Thanksgiving, MLK Day, Presidents Day, Memorial Day, Independence Day, Labor Day)
- UAE: Eid al-Fitr (3 days), Eid al-Adha (3 days), Islamic New Year, Prophet's Birthday, National Day, Ramadan first week (slow)
- EU: National day per country
- Singapore: Chinese New Year, Hari Raya Puasa, Vesak Day, Hari Raya Haji, National Day
- India: Diwali, Holi, Republic Day, Independence Day

Compose-body skill checks holidays before sending. If lead's country has holiday today: skip, reschedule next business day.

Failure mode: Religious holiday dates shift yearly (Eid, Diwali). Resolution: Annual refresh task in Phase 13.

Status: [x] VERIFIED

---

### Task 2.8.4: Time-zone aware sending

Files: ~/code/tamazia-cowork-skills/S008-personalisation-engine integration (timezone routing)
Owner: Claude
Prerequisite: 2.8.3
Estimated time: 30 minutes

Verification:
```
# Test scheduler routing: London lead at 08:30 GMT, NYC lead same lead-time at 08:30 EST = different absolute UTC
node -e "
const r = require('./src/lib/calendar/timezone-router.js');
const ldn = r.scheduleSend({country: 'UK', preferred_hour: 8.5});
const nyc = r.scheduleSend({country: 'US', state: 'NY', preferred_hour: 8.5});
if (ldn !== nyc) process.exit(0);
process.exit(1);
"
```

Expected output:
Same preferred local hour routes to different UTC timestamps for different countries.

Description:
Each lead has country (+ optional state). Compose-body schedules send at 08:30 local time. Router converts to UTC for cron. Test sends within +/- 30 min of preferred local hour. Respects DST.

Failure mode: City-level granularity needed for large countries. Resolution: Default to country capital timezone, refine if needed for specific cities.

Status: [x] VERIFIED

---

### Task 2.9.1: Cal.com event scheduled for framework review

Files: confirmations/framework-review-scheduled.txt
Owner: Aman
Prerequisite: 2.5.2
Estimated time: 5 minutes

Verification:
```
test -f confirmations/framework-review-scheduled.txt && \
grep -q "QUARTERLY_REVIEW:" confirmations/framework-review-scheduled.txt
```

Expected output:
File exists confirming recurring review scheduled.

Description:
Aman creates recurring Cal.com event (or Google Calendar) "Tamazia Compliance Framework Review" every 3 months. Reviews compliance_rules table updates, regulator enforcement examples added, exceptions clarified. Updates framework_versions to bump version (1.0.0 → 1.1.0), updates last_reviewed_at, signs off.

Writes confirmation:
```
QUARTERLY_REVIEW: scheduled in Google Cal, recurring every 3 months from 2026-05-17
NEXT_REVIEW: 2026-08-17
```

Failure mode: Recurring event ends after a year. Resolution: Set "no end date" or 5-year horizon.

Status: [x] VERIFIED

---

### Task 2.10.1: Phase 2 sign-off

Files: confirmations/phase-2-complete.txt
Owner: Both
Prerequisite: All 2.x.x tasks
Estimated time: 5 minutes

Verification:
```
bash scripts/verify-phase.sh 2
```

Expected output:
Phase 2 all green.

Description:
Final phase gate. All compliance + legal foundation in place. Phase 3 unlocked.

Failure mode: Outstanding items. Resolution: List, address, re-verify.

Status: [x] VERIFIED

---

## PHASE 2 EXIT GATE

```bash
bash scripts/verify-phase.sh 2
```

Returns exit 0 only when:
- ICO registration live, number on every footer
- EU Article 27 representative live, details in privacy policy
- PI insurance in place, policy document filed
- T&Cs and Privacy Policy v2026-05 reviewed and published
- Compliance disclaimer finalised, injected on every email, every audit, every PDF
- Framework versions registry built and seeded with 10 frameworks
- Compliance rules seeded (UK GDPR, PECR, ICO Cookies, 5 sector regulators)
- check-compliance skill uses registry
- GDPR request handler skill built
- Jurisdiction router built and tested
- Localised templates per UK/US/UAE/SG
- Holiday calendar per market
- Time-zone aware sending verified
- Cal.com recurring framework review scheduled

Phase 3 locked until this passes.

End of Phase 2.
