# Audit engine · full coverage matrix

Generated from a live read of the codebase + Neon DB on 2026-05-27. Source of truth is the worker (`cloudflare/audit-page-worker.js`) and the router (`src/lib/compliance/jurisdiction-router.js` + `category-catalog.js`).

This document lists every sector, every jurisdiction, every framework / regulator currently wired in, the exact mechanism that triggers each finding, and what is missing that should be there. After you read it we work the gap list top to bottom.

---

## 1 · Numbers, at a glance

| Inventory | Count | Notes |
|---|---:|---|
| Sectors supported | 27 | listed below |
| Countries first-class | 13 | UK, US, AE, SA, SG, IN, HK, FR, DE, IT, ES, NL, IE |
| EU member states routed | 27 | rolled up to EU when no member-state specialisation applies |
| Framework codes with metadata + fine ranges | 104 | every code has regulator name, regulator URL, and concrete £ exposure |
| Framework codes routed by jurisdiction-router | 86 | the subset actively assigned to (country, sector) pairs |
| Categorical findings in catalog | 38 | what the scraper actually emits |
| Languages detected (privacy, cookies, footer) | 8 | EN, AR, FR, DE, ES, IT, ZH, HI |

---

## 2 · Sectors supported (all 27)

`accounting`, `aviation`, `barristers`, `charity`, `construction`, `dental`, `ecommerce`, `education`, `energy`, `finance`, `fintech`, `food`, `healthcare`, `higher-education`, `hospitality`, `insurance`, `law-firms`, `manufacturing`, `marketing`, `media`, `pharma`, `professional-services`, `real-estate`, `retail`, `saas`, `tech`, `transport`.

---

## 3 · Sector × country framework count (depth)

This shows how many frameworks the router assigns to each sector in each country. Cells below 4 are thin and need attention. UK is the deepest coverage; AE / SA / SG / IN / HK trail.

| Sector | UK | US | AE | SA | SG | IN | HK | EU avg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| accounting | 13 | 8 | 3 | 3 | 2 | 5 | 3 | 9 |
| aviation | 10 | 5 | 3 | 3 | 2 | 5 | 3 | 6 |
| barristers | 10 | 5 | 3 | 3 | 2 | 5 | 3 | 6 |
| charity | 11 | 6 | 3 | 3 | 2 | 5 | 3 | 7 |
| construction | 11 | 6 | 3 | 3 | 2 | 5 | 3 | 7 |
| dental | 10 | 5 | 3 | 3 | 2 | 5 | 3 | 6 |
| **ecommerce** | **24** | **19** | 4 | 4 | 4 | 6 | 4 | 21 |
| education | 12 | 7 | 3 | 3 | 2 | 5 | 3 | 8 |
| energy | 12 | 7 | 3 | 3 | 2 | 5 | 3 | 8 |
| **finance** | **20** | **15** | 6 | 5 | 5 | 8 | 5 | 16 |
| **fintech** | **20** | **15** | 7 | 6 | 4 | 8 | 5 | 16 |
| food | 10 | 5 | 3 | 3 | 2 | 5 | 3 | 6 |
| healthcare | 13 | 8 | 5 | 5 | 4 | 7 | 5 | 9 |
| higher-education | 10 | 5 | 3 | 3 | 2 | 5 | 3 | 6 |
| hospitality | 11 | 7 | 4 | 4 | 3 | 6 | 4 | 8 |
| insurance | 17 | 12 | 3 | 3 | 2 | 5 | 3 | 13 |
| **law-firms** | 10 | 5 | **6** | 4 | 4 | 6 | 5 | 6 |
| manufacturing | 13 | 8 | 3 | 3 | 2 | 5 | 3 | 9 |
| marketing | 11 | 6 | 3 | 3 | 2 | 5 | 3 | 7 |
| media | 13 | 8 | 4 | 3 | 2 | 5 | 3 | 9 |
| pharma | 12 | 7 | 3 | 3 | 2 | 5 | 3 | 8 |
| professional-services | 11 | 6 | 3 | 3 | 2 | 5 | 3 | 7 |
| **real-estate** | 12 | 7 | **5** | 5 | 4 | 6 | 4 | 8 |
| retail | 21 | 16 | 3 | 3 | 2 | 5 | 3 | 18 |
| saas | 16 | 10 | 3 | 3 | 3 | 7 | 3 | 12 |
| tech | 13 | 7 | 3 | 3 | 2 | 5 | 3 | 9 |
| transport | 13 | 8 | 3 | 3 | 2 | 5 | 3 | 9 |

**Reading**: UK ecommerce gets 24 frameworks reviewed; UAE saas gets 3 (data protection baseline only). The gaps are not bugs in the router, they reflect what we have actually encoded into `WORKER_SECTOR_FRAMEWORKS`. See section 7 for fix priorities.

---

## 4 · Categorical findings catalogue (38 categories)

These are what the scraper emits. The resolver maps each (category, country, sector) to one framework_short code.

### Privacy + data protection (3 categories)

| Category | Sector gate | Country resolution |
|---|---|---|
| privacy_notice_missing | all | UK→UK_GDPR_A13 · EU→EU_GDPR · US→US_CPRA · AE→UAE_PDPL · SA→SA_PDPL · SG→SG_PDPA · IN→IN_DPDP_2023 · HK→HK_PDPO |
| privacy_notice_thin | all | same as above (P1 severity instead of P0) |
| cookie_consent_missing | all | UK→UK_PECR · EU→EU_EPRIVACY · UAE→UAE_PDPL · others map to local DP law |
| cookie_reject_all_missing | all | UK→UK_ICO_COOKIES · EU→EU_EPRIVACY |
| email_marketing_consent_missing | all | UK→UK_PECR · EU→EU_EPRIVACY · UAE→UAE_TDRA · SA→SA_CITC · SG→SG_SPAM_CONTROL · IN→IN_TRAI |

### Consumer + trading (2)

| Category | Sector gate | Resolution |
|---|---|---|
| consumer_disclosure_missing | ecommerce, retail | UK→UK_DMCC_2024 · EU→EU_DSA · US→US_FTC · UAE→UAE_FED_CONSUMER_2006 · SA→SA_ECOMMERCE_2019 · SG→SG_CPFTA · IN→IN_CP_ECOMMERCE_2020 · HK→HK_TDO_TRADE_DESCRIPTION |
| unfair_practice_risk | ecommerce, retail, marketing, media | UK→UK_DMCC_2024 · US→US_FTC · SG→SG_CPFTA · HK→HK_TDO_TRADE_DESCRIPTION |

### Company law (1)

| Category | Sector gate | Resolution |
|---|---|---|
| company_registration_disclosure_missing | all | UK→UK_COMPANIES_ACT · HK→HK_COMPANIES_ORDINANCE · (others return null, finding dropped) |

### Accessibility (3)

| Category | Sector gate | Resolution |
|---|---|---|
| accessibility_statement_missing | all | UK→UK_EQUALITY_2010 · EU→EU_EAA_2025 · US→US_FTC |
| accessibility_alt_text_missing | all | UK→UK_EQUALITY_2010 · EU→EU_EAA_2025 |
| equality_compliance_missing | all | UK→UK_EQUALITY_2010 |

### Modern Slavery (1)

| Category | Sector gate | Resolution |
|---|---|---|
| modern_slavery_statement_missing | all | UK→UK_MODERN_SLAVERY (revenue-threshold gated) |

### Professional conduct (4, sector-gated)

| Category | Sector gate | Resolution |
|---|---|---|
| professional_transparency_missing | law-firms, barristers | UK→UK_SRA_COC / UK_BSB · SG→SG_LAW_SOCIETY · IN→IN_BAR_COUNCIL_RULES · HK→HK_LAW_SOCIETY / HK_BAR |
| professional_price_transparency_missing | law-firms | UK→UK_SRA_COC only (no other jurisdiction has equivalent published-cost rule) |
| professional_complaints_procedure_missing | law-firms, barristers, finance, healthcare | UK→UK_SRA_COC / UK_BSB / UK_FCA_CONC25 / UK_CQC · SG, IN, HK have law-firms + finance equivalents |
| professional_advertising_compliance_missing | law-firms, healthcare | UK→UK_SRA_COC / UK_CQC · IN→IN_BAR_COUNCIL_RULES |

### Healthcare (2)

| Category | Sector gate | Resolution |
|---|---|---|
| healthcare_regulator_disclosure_missing | healthcare, dental, pharma | UK→UK_CQC / UK_GDC / UK_MHRA · UAE→UAE_DHA · SA→SA_MOH_KSA · SG→SG_MOH_SG · IN→IN_NMC_INDIA · HK→HK_DEPT_HEALTH |
| pharma_compliance_missing | pharma | UK→UK_MHRA · EU→EU_MDR · UAE→UAE_MOHAP · SA→SA_SFDA · SG→SG_HSA · IN→IN_CDSCO |

### Finance (2)

| Category | Sector gate | Resolution |
|---|---|---|
| financial_regulator_disclosure_missing | finance, fintech, insurance | UK→UK_FCA_CONC25 · EU→EU_MIFID_II · UAE→UAE_DFSA · SA→SA_SAMA · SG→SG_MAS_NOTICE_626 · IN→IN_RBI · HK→HK_HKMA |
| financial_promotion_warning_missing | finance, fintech | UK→UK_FSMA_S21 · SA→SA_CMA_KSA · SG→SG_FAA · IN→IN_SEBI · HK→HK_SFC_CONDUCT |

### Real estate (2)

| Category | Sector gate | Resolution |
|---|---|---|
| real_estate_regulator_disclosure_missing | real-estate | UK→UK_RICS · UAE→UAE_RERA · SA→SA_REGA · SG→SG_CEA · IN→IN_RERA_2016 · HK→HK_EAA |
| marketing_permit_disclosure_missing | real-estate | UAE→UAE_TRAKHEESI only (Dubai-specific) |

### Hospitality (1)

| Category | Sector gate | Resolution |
|---|---|---|
| hospitality_regulator_disclosure_missing | hospitality | UK→UK_FSA · UAE→UAE_DET_DTCM · SA→SA_MOT_KSA · SG→SG_HCLA · IN→IN_FSSAI · HK→HK_TIA |

### Advertising / media (1)

| Category | Sector gate | Resolution |
|---|---|---|
| advertising_regulator_disclosure_missing | marketing, media, ecommerce, retail | UK→UK_ASA_CAP · EU→EU_DSA · US→US_FTC · UAE→UAE_NMC |

### AI Act (1)

| Category | Sector gate | Resolution |
|---|---|---|
| ai_disclosure_missing | all (only fires when AI features detected) | UK→EU_AI_ACT · EU→EU_AI_ACT |

### SEO / EEAT (10, universal · always GOOGLE_EEAT)

`seo_meta_description_missing`, `seo_structured_data_missing`, `seo_mobile_viewport_missing`, `seo_thin_content`, `seo_image_alt_missing`, `seo_canonical_missing`, `seo_og_metadata_missing`, `seo_blog_missing`, `seo_title_missing`, `seo_h1_missing`

### Entity / authority (3, universal · always GOOGLE_EEAT)

`entity_linkedin_missing`, `entity_schema_sameas_missing`, `entity_author_byline_missing`

### Meta (1)

`site_unreachable` — emitted when the scraper cannot reach the homepage at all (DNS, WAF, geo block).

---

## 5 · Trigger mechanisms (how each finding is actually detected)

| Category | Detector | Source file | Mechanism |
|---|---|---|---|
| privacy_notice_missing | `hasPrivacyNotice(text)` | `multilingual-signals.js` | 8-language regex library: EN privacy policy, AR سياسة الخصوصية, FR politique de confidentialité, DE Datenschutzerklärung, ES política de privacidad, IT informativa privacy, ZH 隱私政策, HI गोपनीयता नीति. Returns boolean. |
| cookie_consent_missing | `hasCookieConsent(text)` | `multilingual-signals.js` | 8-language regex for "accept / reject / manage cookies" phrasings |
| company_registration_disclosure_missing | `hasCompanyFooter(text)` | `multilingual-signals.js` + `intel.compliance.companies_house` regex | English/French/German company-number footer phrasing + numeric pattern match |
| accessibility_alt_text_missing | `gradeHtml(homepageHtml)` | `wcag-contrast-grader.js` | Extracts inline-style color/background-color pairs from the homepage HTML, computes WCAG 2.1 relative luminance, fails any pair below 4.5:1 (AA threshold) |
| accessibility_statement_missing | path scan + body text | `website-intel.js` | Looks for /accessibility, /accessibility-statement OR text "accessibility statement" / "WCAG conformance" |
| ai_disclosure_missing | `classifyAiUse(text)` | `ai-act-classifier.js` | Three-tier classifier: detects AI vendor mentions (OpenAI, Anthropic, intercom, hubspot/conversations, etc.) + LIMITED-risk triggers (chatbot, AI-powered, generated by AI) + HIGH-RISK context (recruitment, credit scoring, biometric). Emits finding only if no "AI disclosure / how we use AI" notice published. |
| modern_slavery_statement_missing | `detectModernSlavery(text, paths)` | `modern-slavery-detector.js` | Revenue regex (£X million / billion) + scale hints (FTSE 250, headcount > 1000). Only fires when in-scope signals detected AND no statement found. UK-only. |
| professional_transparency_missing | `detectLegal(text, 'law-firms')` | `sector-signal-libraries.js` | Looks for SRA No regex, "authorised and regulated by the Solicitors Regulation Authority", Law Society of Singapore / Bar Council of India / Law Society of HK phrasings |
| healthcare_regulator_disclosure_missing | `detectHealthcare(text, sector)` | `sector-signal-libraries.js` | Regex for CQC No, GDC No, GMC No, MHRA registration, DHA facility ID, MOHAP licence, MOH Saudi, SG MOH, NMC India, CDSCO, HK Medical Council |
| financial_regulator_disclosure_missing | `detectFinance(text, sector)` | `sector-signal-libraries.js` | Regex for FCA No, PRA No, DFSA firm ref, SCA UAE, CBUAE AML, FSRA ADGM, SAMA licence, CMA Saudi, MAS Singapore, RBI directives, SEBI INZ format, HKMA authorisation, SFC CE No |
| financial_promotion_warning_missing | `fsma_warning` sub-detector | `sector-signal-libraries.js` | Looks for "capital at risk", "past performance is not a reliable indicator", FCA-regulated entity phrasing. Emits if sector is finance / fintech AND no warning detected. |
| real_estate_regulator_disclosure_missing | `detectRealEstate(text, 'real-estate')` | `sector-signal-libraries.js` | Regex for RICS member, RERA permit, Trakheesi permit, DIFC registration, ADGM registration, REGA, WAFI, CEA Singapore, India state RERA, HK EAA |
| marketing_permit_disclosure_missing | Trakheesi sub-detector (UAE real-estate only) | `sector-signal-libraries.js` | `/Trakheesi\s+(?:permit\s+)?(?:no\.?|number)?\s*[:#]?\s*(\w+)/i` |
| hospitality_regulator_disclosure_missing | `detectHospitality(text, sector)` | `sector-signal-libraries.js` | Regex for FSA rating, DTCM UAE, MOT Saudi, HCLA Singapore, FSSAI India, TIA HK |
| seo_meta_description_missing | `analyzePage(html, path, domain).meta_description` | `website-intel.js` | Per-page HTML parse: looks for `<meta name="description" content="">` tag |
| seo_structured_data_missing | `analyzePage(...).has_schema` | `website-intel.js` | Looks for `application/ld+json` block |
| seo_mobile_viewport_missing | `analyzePage(...).viewport` | `website-intel.js` | Looks for `<meta name="viewport">` |
| seo_thin_content | `analyzePage(...).word_count < 250` | `website-intel.js` | strip tags, count tokens |
| seo_canonical_missing | `analyzePage(...).has_canonical` | `website-intel.js` | Looks for `<link rel="canonical">` |
| seo_og_metadata_missing | `analyzePage(...).has_og_image` | `website-intel.js` | Looks for og:image / og:title / og:description |
| seo_h1_missing | `analyzePage(...).h1.length === 0` | `website-intel.js` | Counts `<h1>` elements |
| seo_blog_missing | `intel.pages_fetched.some(p => /blog\|news\|insights/)` | `website-intel.js` | Checks if scraper crawled any blog-style path |
| entity_linkedin_missing | `intel.linkedin === null` | `website-intel.js` | LinkedIn company URL regex across all crawled pages |

---

## 6 · Country-specific framework codes ENCODED but possibly under-triggered

These have regulator metadata + fine ranges defined in the worker but the SCANNER does not actively look for them. They will resolve correctly if a finding is tagged with their category, but no sector signal in our libraries actually produces them.

### UAE — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| UAE_PDPL | ✓ | ✓ | privacy_notice_missing |
| UAE_FED_CONSUMER_2006 | ✓ | ✓ | consumer_disclosure_missing (ecommerce gated) |
| UAE_FED_ARBITRATION_2018 | ✓ | ✗ | no detector — would need to scan for "Federal Arbitration Law 6/2018" / "DIFC Court / ADGM Court" appearances on law firm sites |
| DIFC_DP_LAW_2020 | ✓ | partial | scanner detects DIFC mention; doesn't emit dedicated finding |
| ADGM_DP_REGS_2021 | ✓ | partial | same |
| UAE_RERA | ✓ | ✓ | real_estate_regulator_disclosure_missing |
| UAE_TRAKHEESI | ✓ | ✓ | marketing_permit_disclosure_missing (Dubai-specific scope flagged) |
| UAE_DFSA | ✓ | ✓ | financial_regulator_disclosure_missing |
| UAE_SCA | ✓ | partial | regex exists in sector library; no finding emits if missing |
| UAE_CBUAE_AML | ✓ | ✗ | no AML-specific category in catalog |
| UAE_FSRA_ADGM | ✓ | partial | regex exists; no finding |
| UAE_DHA | ✓ | ✓ | healthcare_regulator_disclosure_missing |
| UAE_MOHAP | ✓ | ✓ | same |
| UAE_DET_DTCM | ✓ | ✓ | hospitality_regulator_disclosure_missing |
| UAE_TDRA | ✓ | ✗ | email_marketing_consent_missing resolves to this but no scanner check for TDRA opt-in proof |
| UAE_NMC | ✓ | ✗ | advertising_regulator_disclosure_missing resolves but no UAE-specific ad-content scanner |

### Saudi Arabia — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| SA_PDPL | ✓ | ✓ | privacy_notice_missing |
| SA_CITC | ✓ | partial | email consent category resolves to this; no anti-spam scanner |
| SA_MOJ_REGS | ✓ | ✗ | category mapping exists but professional_complaints_procedure not wired for SA |
| SA_SAMA | ✓ | ✓ | financial_regulator_disclosure_missing |
| SA_CMA_KSA | ✓ | ✓ | financial_promotion_warning_missing |
| SA_SDAIA_AI | ✓ | ✗ | no Saudi-specific AI scanner; classifyAiUse only resolves to EU_AI_ACT |
| SA_REGA | ✓ | ✓ | real_estate_regulator_disclosure_missing |
| SA_WAFI | ✓ | partial | regex exists; only resolves if no other RERA-equivalent found |
| SA_MOH_KSA | ✓ | ✓ | healthcare_regulator_disclosure_missing |
| SA_SFDA | ✓ | ✓ | pharma_compliance_missing |
| SA_MOT_KSA | ✓ | ✓ | hospitality_regulator_disclosure_missing |
| SA_ECOMMERCE_2019 | ✓ | ✓ | consumer_disclosure_missing |

### Singapore — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| SG_PDPA | ✓ | ✓ | privacy_notice_missing |
| SG_LAW_SOCIETY | ✓ | ✓ | professional_transparency_missing |
| SG_LPA_RULES | ✓ | ✗ | no professional-rules scanner for SG law firms beyond Law Society |
| SG_MAS_NOTICE_626 | ✓ | ✓ | financial_regulator_disclosure_missing |
| SG_FAA | ✓ | ✓ | financial_promotion_warning_missing |
| SG_SFA | ✓ | ✗ | no securities-act specific scanner |
| SG_PAYMENT_SERVICES_ACT | ✓ | ✗ | fintech-only; no payment-licence scanner |
| SG_CEA | ✓ | ✓ | real_estate_regulator_disclosure_missing |
| SG_HDB_RULES | ✓ | ✗ | no HDB rule scanner |
| SG_MOH_SG | ✓ | ✓ | healthcare_regulator_disclosure_missing |
| SG_HSA | ✓ | ✓ | pharma |
| SG_HCLA | ✓ | ✓ | hospitality_regulator_disclosure_missing |
| SG_CYBERSECURITY_2018 | ✓ | ✗ | no cybersecurity-act scanner for SaaS |
| SG_CPFTA | ✓ | ✓ | consumer_disclosure_missing |
| SG_SPAM_CONTROL | ✓ | partial | email_marketing_consent resolves; no spam-act-specific consent scanner |

### India — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| IN_DPDP_2023 | ✓ | ✓ | privacy_notice_missing |
| IN_IT_2000 | ✓ | ✗ | category mapping absent for IT Act specifically |
| IN_IT_RULES_2021 | ✓ | ✗ | grievance-officer specific scanner missing |
| IN_CONSUMER_2019 | ✓ | partial | consumer_disclosure resolves but ecommerce-rule-specific check missing |
| IN_BAR_COUNCIL_RULES | ✓ | ✓ | professional_transparency_missing |
| IN_RBI | ✓ | ✓ | financial_regulator_disclosure_missing |
| IN_SEBI | ✓ | ✓ | financial_promotion_warning_missing |
| IN_PMLA_2002 | ✓ | ✗ | no AML scanner for India |
| IN_NPCI | ✓ | ✗ | UPI / payment-system scanner missing |
| IN_RERA_2016 | ✓ | ✓ | real_estate_regulator_disclosure_missing |
| IN_NMC_INDIA | ✓ | ✓ | healthcare_regulator_disclosure_missing |
| IN_CDSCO | ✓ | ✓ | pharma_compliance_missing |
| IN_FSSAI | ✓ | ✓ | hospitality_regulator_disclosure_missing |
| IN_CP_ECOMMERCE_2020 | ✓ | ✓ | consumer_disclosure_missing |
| IN_CERT_IN | ✓ | ✗ | no CERT-In direction scanner |
| IN_TRAI | ✓ | partial | email_marketing_consent resolves; no TRAI commercial-comms scanner |

### Hong Kong — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| HK_PDPO | ✓ | ✓ | privacy_notice_missing |
| HK_COMPANIES_ORDINANCE | ✓ | ✓ | company_registration_disclosure_missing |
| HK_LAW_SOCIETY | ✓ | ✓ | professional_transparency_missing |
| HK_BAR | ✓ | ✓ | same (barristers) |
| HK_HKMA | ✓ | ✓ | financial_regulator_disclosure_missing |
| HK_SFC_CONDUCT | ✓ | ✓ | financial_promotion_warning_missing |
| HK_EAA | ✓ | ✓ | real_estate_regulator_disclosure_missing |
| HK_DEPT_HEALTH | ✓ | ✓ | healthcare_regulator_disclosure_missing |
| HK_MEDICAL_COUNCIL | ✓ | partial | regex in sector library, no finding emits if missing |
| HK_TIA | ✓ | ✓ | hospitality_regulator_disclosure_missing |
| HK_TDO_TRADE_DESCRIPTION | ✓ | ✓ | consumer_disclosure_missing |

### EU / member states — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| EU_GDPR | ✓ | ✓ | privacy_notice_missing for FR/DE/IT/ES etc. |
| EU_EPRIVACY | ✓ | ✓ | cookie_consent_missing |
| EU_AI_ACT | ✓ | ✓ | ai_disclosure_missing |
| EU_MDR | ✓ | ✓ | pharma_compliance_missing |
| EU_DSA | ✓ | ✓ | consumer_disclosure_missing |
| EU_DORA | ✓ | ✗ | encoded but no DORA-specific scanner for finance |
| EU_PSD2 | ✓ | ✗ | encoded but no payment-services scanner |
| EU_AML6 | ✓ | ✗ | encoded but no AML scanner |
| EU_MIFID_II | ✓ | ✓ | financial_regulator_disclosure_missing (EU) |
| EU_CSRD | ✓ | ✗ | no sustainability-reporting scanner |
| EU_SFDR | ✓ | ✗ | same |
| EU_EAA_2025 | ✓ | ✓ | accessibility_statement_missing |
| EU_WHISTLEBLOWER | ✓ | ✗ | no whistleblower-channel scanner |
| EU_NIS2 | ✓ | ✗ | no NIS2 scanner for SaaS / tech |
| FR_CNIL_2025 | ✓ | partial | encoded but no France-specific scanner beyond EU_GDPR |
| DE_BDSG | ✓ | partial | same |

### US — encoded, not triggered

| Framework | Encoded? | Triggered? | Comment |
|---|:-:|:-:|---|
| US_FTC | ✓ | ✓ | consumer_disclosure / accessibility / advertising |
| US_CPRA | ✓ | ✓ | privacy_notice_missing |
| US_TCPA | ✓ | ✗ | no TCPA-specific consent scanner |
| US_GLBA | ✓ | ✗ | no GLBA scanner for finance |
| US_NYDFS_500 | ✓ | ✗ | no NY DFS cybersecurity scanner |
| US_TDPSA | ✓ | ✗ | no Texas DPSA scanner |
| US_VCDPA | ✓ | ✗ | no Virginia CDPA scanner |
| US_BIPA | ✓ | ✗ | no Illinois BIPA biometric scanner |
| US_HIPAA | ✓ | ✗ | no HIPAA scanner for healthcare |
| US_COPPA | ✓ | ✗ | no COPPA scanner for education |
| US_FTC_ENDORSE | ✓ | ✗ | no influencer-disclosure scanner |

---

## 7 · Mechanism errors and gaps found during this inventory

These are bugs / blind spots in the engine, prioritised by how often they bite real clients.

### Severity-1 (fix in next pass)

1. **UAE Trakheesi is Dubai-only but treated as UAE-wide.** A UAE real-estate firm in Abu Dhabi or Sharjah gets Trakheesi as a finding when it does not apply. Fix: city-level resolution from the address scanner; only emit Trakheesi when Dubai is in the address.
2. **Modern Slavery threshold is too narrow.** Current regex needs £100M+. Many at-threshold firms (£36M to £80M) slip past. Fix: lower the trigger to £36M and add Companies House lookup for verified turnover.
3. **No multi-jurisdiction tabs.** A global law firm with London + Dubai + Singapore offices gets ONE country's findings rendered. Fix: detect multi-country signals (multiple regulator references, multiple phone codes, multiple office cities), render N separate finding sections.
4. **WCAG contrast grader only runs on homepage HTML.** Internal pages with worse contrast (the typical service or pricing page) are never graded. Fix: run grader across every fetched page and roll up.
5. **AI Act high-risk classifier needs specific keywords.** Fintech sites using AI for credit decisions that don't say "credit scoring" explicitly slip past. Fix: add "underwriting model", "automated decisioning", "risk model", "algorithmic pricing" to the high-risk-context regex.
6. **No multi-mailbox detection for the warmup engine.** mailbox_pool is empty so the engine refuses to send. Fix: populate from creds once Zoho is fixed (Section 2 of the other document).
7. **applicable_frameworks recompute reverses any S025-side localisation.** Worker recomputes ignoring the stored list to fix Al Tamimi; but if a city-specific UAE_TRAKHEESI was scoped out by the build script, the worker adds it back. Fix: add a per-row scoped-out list that the worker respects when recomputing.

### Severity-2 (Phase 5 candidates)

8. **No US state-specific finders.** TCPA / GLBA / NYDFS / TDPSA / VCDPA / BIPA / COPPA / HIPAA / FTC endorsement rules are all encoded but never produce findings. Fix: write per-rule scanners.
9. **No EU DORA / PSD2 / AML6 / CSRD / SFDR / NIS2 scanners.** Same shape, all encoded with metadata + fine ranges, no detector.
10. **No Saudi SDAIA AI Ethics scanner.** Saudi clients with AI features only get EU AI Act resolved.
11. **No India TRAI / CERT-In / NPCI / PMLA scanners.** Indian fintech audits show DPDP + RBI + SEBI but miss the most-used Indian rules.
12. **No HK SFC code categories.** Only SFC firm-licence detection; the Conduct rules per CE No are not scanned.
13. **No GDPR-derived member-state specialisations.** FR_CNIL_2025 and DE_BDSG resolve as EU_GDPR currently; they should pull the member-state regulator name in localised rendering.

### Severity-3 (nice-to-have)

14. **No /sitemap.xml multi-host discovery.** Subdomains (`difc.tamimi.com` etc.) carry separate sitemaps that the current crawler misses.
15. **No PDF body scanner.** Linked privacy / terms PDFs are not fetched.
16. **No JS-shell deep-link discovery for SPAs beyond the homepage.** SPA shell render only happens for the root URL.
17. **No automated re-run.** Once an audit is generated it does not refresh; clients see stale data even after they fix things.

---

## 8 · The fix queue (ordered, ready to execute)

If you sign off, I work this list top to bottom in the same way as the previous phases: build → rigorous test → deploy → bug test.

| # | Fix | Effort | Phase tag |
|---|---|---|---|
| 1 | City-level UAE resolution (Dubai vs Abu Dhabi vs Sharjah) for Trakheesi scope | Half day | Phase 5·1 |
| 2 | Modern Slavery threshold lowered to £36M + Companies House turnover lookup | Half day | Phase 5·1 |
| 3 | Multi-jurisdiction tabs on the audit page (London + Dubai + SG = three frameworks blocks) | One day | Phase 5·2 |
| 4 | WCAG grader runs across every fetched page, roll up worst grade per page | Half day | Phase 5·1 |
| 5 | AI Act high-risk classifier vocabulary expansion | Half day | Phase 5·1 |
| 6 | Saudi SDAIA / TRAI / CERT-In / NPCI / PMLA / SFC Conduct sector scanners | One to two days each, parallelisable | Phase 5·3 |
| 7 | US state-specific scanners (CPRA already done; TCPA, BIPA, COPPA, HIPAA, NYDFS) | Three to four days | Phase 5·4 |
| 8 | EU DORA / PSD2 / AML6 / CSRD / SFDR / NIS2 scanners | Three to four days | Phase 5·4 |
| 9 | FR_CNIL_2025 + DE_BDSG member-state specialisation rendering | Half day | Phase 5·2 |
| 10 | PDF body scanner | One day | Phase 5·3 |
| 11 | Subdomain / multi-host sitemap discovery | One day | Phase 5·3 |
| 12 | SPA shell fallback for internal pages, not just homepage | Half day | Phase 5·3 |
| 13 | Automated audit re-run on cadence (weekly per active lead) | One day | Phase 5·5 |
| 14 | Per-row scope-out list respected by worker recompute (S025 sign-off override) | Half day | Phase 5·1 |
| 15 | Warmup engine activation (after Zoho fixed): populate mailbox_pool + start cron | Half day, blocked on Zoho | Operational |

---

## 9 · How you read this

The matrix in Section 3 tells you depth per (sector, country). Section 4 lists every finding category we can emit. Section 5 tells you the exact detector that produces each finding. Section 6 splits encoded frameworks into "actively triggered" vs "metadata-only" so you can see the gap between what the audit page COULD say and what it currently DOES say. Section 7 lists the 17 mechanism errors / blind spots. Section 8 is the ordered fix queue.

Once you read this, tell me which priority items to start with and I begin Phase 5·1 same rigour as Phases 1 through 4: build → test → deploy → live verify per fix.
