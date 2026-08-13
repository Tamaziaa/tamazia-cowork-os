// =============================================================================
// COMPLIANCE RULE PACKS · Phase 1 v24
// =============================================================================
// Master declarative rule library for the audit engine. Each rule is a
// self-contained object with: id, framework, jurisdiction, sector_gate,
// city_gate, severity, trigger(intel), evidence, fix, uplift, regulator,
// fine_label, category.
//
// The runner (rule-runner.js) walks every rule, calls trigger(intel) on each,
// and emits a finding for every non-null return. Triggers return:
//   - null  ............... rule passed cleanly (signal present and correct)
//   - { snippet, url, structural_fact, methods } ... finding fires
//
// Jurisdiction filtering happens at runner level (only rules whose
// jurisdiction is in the audit's countries[] are evaluated).
// Sector gate is an optional list ('professional-services' is the catch-all).
// City gate (optional) further narrows to specific cities (Dubai for Trakheesi).
//
// CROSS-CUTTING rules have jurisdiction='*' and apply globally per country.
//
// Adding a new rule = add an entry. No worker edits, no resolver edits.
// =============================================================================

const RULES = [

  // =======================================================================
  // GROUP A · CROSS-CUTTING (AML · Bribery · Modern Slavery · Whistleblowing · ESG)
  // =======================================================================

  // UK · Money Laundering Regulations 2017 (legal sector, finance, real estate, accountancy)
  {
    id: 'UK_AML_MLR_2017_MLRO',
    framework: 'UK_MLR_2017', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'UK', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate', 'accounting'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasMlro = /MLRO|Money Laundering Reporting Officer|nominated officer|AML compliance officer/i.test(t);
      if (hasMlro) return null;
      return { structural_fact: 'no MLRO / Money Laundering Reporting Officer disclosure detected on the site', methods: ['phrase'] };
    },
    regulator: 'HMRC AML Supervision',
    regulator_url: 'https://www.gov.uk/anti-money-laundering-registration',
    clause: 'Reg. 21 (Customer due diligence) + Reg. 27 (Nominated officer)',
    fine_label: 'Up to £1M + 2-yr prison + criminal sanctions (POCA 2002)',
    fine_high: 1000000,
    evidence: 'UK Money Laundering Regulations 2017 + POCA 2002 require relevant persons (legal sector, financial services, real estate, accountancy) to publish an AML policy, appoint a Money Laundering Reporting Officer and document Customer Due Diligence procedures. No MLRO disclosure detected.',
    fix: 'Publish AML policy + designate and disclose MLRO + document CDD procedures and Risk Assessment. Tamazia drafts to HMRC standard.',
    uplift: 'Closes the MLR 2017 + POCA 2002 supervisory exposure. Removes a direct enforcement trigger.'
  },

  // EU · AMLD6 (Directive 2024/1640 + AMLR)
  {
    id: 'EU_AML6_MLRO_DISCLOSURE',
    framework: 'EU_AML6', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'EU', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate', 'accounting'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasMlro = /MLRO|Money Laundering Reporting Officer|nominated officer|AML compliance officer|responsable LCB-FT|Geldwäschebeauftragter/i.test(t);
      if (hasMlro) return null;
      return { structural_fact: 'no MLRO disclosure detected', methods: ['phrase'] };
    },
    regulator: 'EU National FIUs + AMLA (from 2027)',
    regulator_url: 'https://eur-lex.europa.eu/eli/dir/2024/1640/oj',
    clause: 'Art. 11 (CDD) + Art. 18 (Compliance officer)',
    fine_label: 'Up to €10M or 5% turnover (national FIU)',
    fine_high: 8000000,
    evidence: 'EU AMLD6 (Dir 2024/1640) applies to obliged entities in the financial, legal and real estate sectors and requires CDD, suspicious transaction reporting and a dedicated AML/CFT officer.',
    fix: 'Publish AML policy, designate AMLA Compliance Officer, document CDD framework.',
    uplift: 'Closes the AMLD6 + national FIU supervisory exposure.'
  },

  // US · Bank Secrecy Act / FinCEN
  {
    id: 'US_AML_BSA_FINCEN',
    framework: 'US_BSA', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'US', sector_gate: ['finance', 'fintech', 'real-estate', 'law-firms'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /BSA Officer|Bank Secrecy Act|AML Compliance Officer|FinCEN|MSB registration/i.test(t);
      if (has) return null;
      return { structural_fact: 'no BSA / FinCEN AML disclosure detected', methods: ['phrase'] };
    },
    regulator: 'FinCEN',
    regulator_url: 'https://www.fincen.gov/',
    clause: '31 U.S.C. 5318(h) + 31 CFR 1010',
    fine_label: 'Civil $25k per violation + criminal up to $500k + 10 years (31 USC 5322)',
    fine_high: 20000,
    evidence: 'US Bank Secrecy Act requires financial institutions, fintech MSBs, legal sector and real estate (where applicable) to maintain an AML program including a designated BSA Compliance Officer.',
    fix: 'Publish AML program, designate BSA Officer, register with FinCEN if MSB.',
    uplift: 'Closes FinCEN civil + criminal exposure under 31 USC 5318(h).'
  },

  // UAE · Federal Decree-Law 20/2018 AML
  {
    id: 'UAE_AML_FDL_20_2018',
    framework: 'UAE_AML_FDL_20', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'AE', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate', 'accounting'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /AML compliance officer|Money Laundering Reporting Officer|MLRO|مسؤول مكافحة غسل الأموال|goAML/i.test(t);
      if (has) return null;
      return { structural_fact: 'no UAE AML compliance officer / goAML registration disclosure detected', methods: ['phrase'] };
    },
    regulator: 'UAE Financial Intelligence Unit (FIU)',
    regulator_url: 'https://www.uaefiu.gov.ae/',
    clause: 'Art. 16 + Art. 22 (Suspicious transactions)',
    fine_label: 'AED 50,000 to AED 5,000,000 per violation + closure',
    fine_high: 1000000,
    evidence: 'UAE Federal Decree-Law 20/2018 requires DNFBPs (Designated Non-Financial Businesses and Professions including law, real estate, accountancy) and financial institutions to appoint an AML Compliance Officer and register on goAML.',
    fix: 'Publish AML/CFT policy, designate Compliance Officer, register with goAML system, document Risk-Based Approach.',
    uplift: 'Closes UAE FIU + Central Bank enforcement exposure.'
  },

  // Saudi · AML Royal Decree M/31
  {
    id: 'SA_AML_RD_M31',
    framework: 'SA_AML_RD_M31', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'SA', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate', 'accounting'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /AML compliance officer|Money Laundering Reporting Officer|MLRO|مسؤول مكافحة غسل الأموال/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Saudi AML Compliance Officer disclosure detected', methods: ['phrase'] };
    },
    regulator: 'Saudi Arabia Financial Investigation Unit (SAFIU)',
    regulator_url: 'https://www.spa.gov.sa/',
    clause: 'Royal Decree M/31 + SAMA Rules + DNFBP Rules',
    fine_label: 'SAR 5,000,000 + criminal sanctions',
    fine_high: 1000000,
    evidence: 'Saudi AML Law (Royal Decree M/31) imposes obligations on financial institutions and DNFBPs including a designated Compliance Officer.',
    fix: 'Publish AML/CFT policy + designate Saudi AML Compliance Officer.',
    uplift: 'Closes SAFIU + SAMA / sector regulator exposure.'
  },

  // Singapore · CDSA (Corruption Drug Trafficking and Other Serious Crimes Act)
  {
    id: 'SG_AML_CDSA',
    framework: 'SG_CDSA', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'SG', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /AML compliance officer|MLRO|Money Laundering Reporting Officer|CDSA|MAS Notice 626/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Singapore AML/CFT compliance officer disclosure detected', methods: ['phrase'] };
    },
    regulator: 'Suspicious Transaction Reporting Office (STRO) · MAS · Law Society',
    regulator_url: 'https://www.police.gov.sg/STRO',
    clause: 'CDSA s.39 (Reporting) + MAS Notice 626',
    fine_label: 'SGD 1M per breach + criminal sanctions',
    fine_high: 600000,
    evidence: 'Singapore CDSA + MAS Notice 626 require financial institutions and DNFBPs to maintain AML/CFT programmes and designate a compliance officer.',
    fix: 'Publish AML/CFT policy + designate compliance officer + register with STRO where required.',
    uplift: 'Closes STRO + MAS enforcement exposure.'
  },

  // India · PMLA 2002
  {
    id: 'IN_AML_PMLA_2002',
    framework: 'IN_PMLA_2002', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'IN', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Principal Officer|PMLA|Prevention of Money Laundering|FIU.?IND|AML Compliance/i.test(t);
      if (has) return null;
      return { structural_fact: 'no PMLA Principal Officer or FIU-IND registration disclosure detected', methods: ['phrase'] };
    },
    regulator: 'FIU-IND',
    regulator_url: 'https://fiuindia.gov.in/',
    clause: 'PMLA s.12 + PMLA Rules 2005',
    fine_label: 'Unlimited monetary + criminal exposure under PMLA',
    fine_high: 0,
    evidence: 'India PMLA 2002 requires Reporting Entities including financial institutions, intermediaries, DNFBPs (lawyers, accountants, real estate professionals) to register on FIU-IND, designate a Principal Officer and report suspicious transactions.',
    fix: 'Register with FIU-IND, designate Principal Officer, publish AML policy.',
    uplift: 'Closes FIU-IND and sector regulator (RBI/SEBI/Bar Council) exposure.'
  },

  // HK · AMLO Cap. 615
  {
    id: 'HK_AML_AMLO_CAP_615',
    framework: 'HK_AMLO_615', category: 'aml_mlro_disclosure_missing',
    jurisdiction: 'HK', sector_gate: ['law-firms', 'finance', 'fintech', 'real-estate', 'accounting'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Compliance Officer|AMLO|Anti-Money Laundering Ordinance|MLRO/i.test(t);
      if (has) return null;
      return { structural_fact: 'no HK AMLO Compliance Officer disclosure detected', methods: ['phrase'] };
    },
    regulator: 'HKMA · SFC · IA · Law Society of HK · Estate Agents Authority',
    regulator_url: 'https://www.elegislation.gov.hk/hk/cap615',
    clause: 'AMLO s.5 + Sched. 2 (CDD)',
    fine_label: 'HKD 1M + 2 years imprisonment per breach',
    fine_high: 100000,
    evidence: 'HK Anti-Money Laundering Ordinance Cap. 615 requires financial institutions and DNFBPs to perform Customer Due Diligence and maintain records, supervised by HKMA / SFC / IA / Law Society / EAA.',
    fix: 'Publish AML policy + designate Compliance Officer + document CDD procedures.',
    uplift: 'Closes HKMA/SFC/sector regulator exposure under AMLO.'
  },

  // -----------------------------------------------------------------------
  // ANTI-BRIBERY (UK Bribery Act, US FCPA, UAE FDL 35/2018, India PCA 1988, Singapore PCA, HK POBO)
  // -----------------------------------------------------------------------
  {
    id: 'UK_BRIBERY_ACT_2010',
    framework: 'UK_BRIBERY_ACT_2010', category: 'anti_bribery_policy_missing',
    jurisdiction: 'UK', sector_gate: null,
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /anti-bribery|anti.?corruption policy|Bribery Act 2010|adequate procedures|gifts and hospitality policy/i.test(t);
      if (has) return null;
      return { structural_fact: 'no anti-bribery policy or "adequate procedures" disclosure detected', methods: ['phrase'] };
    },
    regulator: 'Serious Fraud Office (SFO) + CPS',
    regulator_url: 'https://www.legislation.gov.uk/ukpga/2010/23',
    clause: 's.7 (Failure of commercial organisations to prevent bribery)',
    fine_label: 'Unlimited fine + 10-year prison + DPA',
    fine_high: 0,
    evidence: 'UK Bribery Act 2010 s.7 creates strict liability for commercial organisations failing to prevent bribery. The only defence is "adequate procedures" which must be documented and publicly visible to weight properly.',
    fix: 'Publish anti-bribery + anti-corruption policy + gifts and hospitality register + speak-up channel.',
    uplift: 'Closes SFO / DPA exposure under s.7.'
  },

  {
    id: 'US_FCPA_ANTI_BRIBERY',
    framework: 'US_FCPA', category: 'anti_bribery_policy_missing',
    jurisdiction: 'US', sector_gate: null,
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /FCPA|Foreign Corrupt Practices|anti-bribery|anti.?corruption policy/i.test(t);
      if (has) return null;
      return { structural_fact: 'no FCPA / anti-bribery policy detected', methods: ['phrase'] };
    },
    regulator: 'DOJ + SEC',
    regulator_url: 'https://www.justice.gov/criminal-fraud/foreign-corrupt-practices-act',
    clause: 'FCPA 15 USC §78dd-1',
    fine_label: 'Criminal up to $2M + civil + disgorgement',
    fine_high: 1600000,
    evidence: 'US Foreign Corrupt Practices Act prohibits bribery of foreign officials and requires accounting controls. Issuers and domestic concerns are within scope.',
    fix: 'Publish FCPA compliance program + anti-bribery policy + accounting controls statement.',
    uplift: 'Closes DOJ + SEC enforcement exposure.'
  },

  {
    id: 'UAE_FDL_35_2018_ANTI_BRIBERY',
    framework: 'UAE_FDL_35_2018', category: 'anti_bribery_policy_missing',
    jurisdiction: 'AE', sector_gate: null,
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /anti-bribery|anti.?corruption|Federal Decree-Law 35/i.test(t);
      if (has) return null;
      return { structural_fact: 'no anti-bribery / Federal Decree-Law 35/2018 disclosure detected', methods: ['phrase'] };
    },
    regulator: 'UAE Public Prosecution + State Audit Institution',
    regulator_url: 'https://u.ae/en/about-the-uae/the-uae-government/government-of-future/innovation-in-the-uae/laws-and-regulations',
    clause: 'Art. 234 to 239 of Federal Penal Code + FDL 35/2018',
    fine_label: 'AED 5M + imprisonment',
    fine_high: 1000000,
    evidence: 'UAE Federal Decree-Law 35/2018 + Federal Penal Code articles 234-239 criminalise bribery of public and private sector officials. International firms operating in UAE are expected to publish anti-bribery procedures.',
    fix: 'Publish anti-bribery + anti-corruption policy + facilitation payments stance + reporting channel.',
    uplift: 'Closes UAE Public Prosecution + sector regulator exposure.'
  },

  {
    id: 'IN_PCA_1988_ANTI_BRIBERY',
    framework: 'IN_PCA_1988', category: 'anti_bribery_policy_missing',
    jurisdiction: 'IN', sector_gate: null,
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Prevention of Corruption|anti-bribery|anti.?corruption policy|भ्रष्टाचार/i.test(t);
      if (has) return null;
      return { structural_fact: 'no anti-bribery / Prevention of Corruption Act disclosure detected', methods: ['phrase'] };
    },
    regulator: 'CBI + ED + state Anti-Corruption Bureaus',
    regulator_url: 'https://www.indiacode.nic.in/handle/123456789/1828',
    clause: 'PCA 1988 s.7-9 + PCA Amendment 2018 s.9 (commercial organisation liability)',
    fine_label: 'Unlimited fine + criminal up to 7 years',
    fine_high: 0,
    evidence: 'India Prevention of Corruption Act 1988 (Amendment 2018) Section 9 creates corporate criminal liability for commercial organisations whose persons commit bribery. Adequate procedures defence available with documented policy.',
    fix: 'Publish anti-bribery policy + speak-up channel + gifts register + training acknowledgement statement.',
    uplift: 'Closes CBI + ED enforcement exposure.'
  },

  // -----------------------------------------------------------------------
  // MODERN SLAVERY (UK Modern Slavery Act 2015, Australia, Norway, France Vigilance Law)
  // -----------------------------------------------------------------------
  // Note: existing modern-slavery-detector.js handles UK MSA. This is an
  // additional cross-jurisdiction surface for non-UK firms that have UK operations.
  {
    id: 'UK_MSA_S54_STATEMENT',
    framework: 'UK_MODERN_SLAVERY', category: 'modern_slavery_statement_missing',
    jurisdiction: 'UK', sector_gate: null,
    severity: 'P1',
    trigger: (intel) => {
      // Skipped here; existing modern-slavery-detector.js handles this with revenue threshold.
      return null;
    },
    regulator: 'Home Office', regulator_url: 'https://www.gov.uk/government/publications/modern-slavery-act-2015',
    clause: 's.54 Transparency in Supply Chains',
    fine_label: 'Injunctive relief + reputational + supply-chain ban',
    fine_high: 0,
    evidence: 'placeholder',
    fix: 'Publish a Section 54 statement signed by a director.',
    uplift: 'placeholder'
  },

  // -----------------------------------------------------------------------
  // WHISTLEBLOWING (EU Directive 2019/1937, UK PIDA, US SOX 806)
  // -----------------------------------------------------------------------
  {
    id: 'EU_WHISTLEBLOWER_DIR_2019_1937',
    framework: 'EU_WHISTLEBLOWER', category: 'whistleblowing_channel_missing',
    jurisdiction: 'EU', sector_gate: null,
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /whistleblow|speak.?up|whistleblower|signaleur|Hinweisgeber|denuncia/i.test(t);
      if (has) return null;
      return { structural_fact: 'no whistleblowing / speak-up channel disclosed', methods: ['phrase'] };
    },
    regulator: 'National competent authorities + EU AMLA from 2027',
    regulator_url: 'https://eur-lex.europa.eu/eli/dir/2019/1937/oj',
    clause: 'Art. 8 (Internal reporting channels)',
    fine_label: 'Penalties up to national authority maximum + civil damages',
    fine_high: 0,
    evidence: 'EU Whistleblower Directive 2019/1937 requires private employers with 50+ workers (or in financial services regardless of size) to establish secure internal reporting channels for breaches of EU law.',
    fix: 'Implement a confidential whistleblowing channel + publish a speak-up policy + designate a recipient of reports.',
    uplift: 'Closes the WBD Art. 8 exposure and protects against retaliation claims.'
  },

  {
    id: 'UK_PIDA_1998_WHISTLEBLOWING',
    framework: 'UK_PIDA_1998', category: 'whistleblowing_channel_missing',
    jurisdiction: 'UK', sector_gate: null,
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /whistleblow|public interest disclosure|speak.?up policy|protected disclosure/i.test(t);
      if (has) return null;
      return { structural_fact: 'no public interest disclosure / whistleblowing policy detected', methods: ['phrase'] };
    },
    regulator: 'Employment Tribunals + sector regulator', regulator_url: 'https://www.legislation.gov.uk/ukpga/1998/23',
    clause: 'PIDA 1998 (worker protection)',
    fine_label: 'Uncapped employment tribunal compensation',
    fine_high: 0,
    evidence: 'UK Public Interest Disclosure Act 1998 protects workers who make protected disclosures. Best practice is to publish a speak-up policy and designate a recipient.',
    fix: 'Publish whistleblowing policy + designate confidential reporting channel.',
    uplift: 'Reduces uncapped tribunal compensation exposure + protects from regulator referrals.'
  },

  // -----------------------------------------------------------------------
  // ESG / SUSTAINABILITY REPORTING (EU CSRD, EU SFDR, UK Climate, SEC Climate, HK ESG, India BRSR)
  // -----------------------------------------------------------------------
  {
    id: 'EU_CSRD_SUSTAINABILITY_REPORT',
    framework: 'EU_CSRD', category: 'esg_sustainability_report_missing',
    jurisdiction: 'EU', sector_gate: null,
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /sustainability report|CSRD|ESG report|non-financial statement|ESRS/i.test(t);
      // Only emit if firm is in-scope (large undertaking signal: revenue > €40M heuristic)
      const inScope = /€\s*\d+[,.]?\d*\s*(million|billion|bn|mn)|\b(?:large undertaking|publicly listed|SE plc|AG|SA )\b/i.test(t);
      if (!inScope) return null;
      if (has) return null;
      return { structural_fact: 'in-scope EU large undertaking with no CSRD sustainability report or ESRS link detected', methods: ['phrase', 'revenue_heuristic'] };
    },
    regulator: 'National competent authorities + EFRAG (standards)',
    regulator_url: 'https://eur-lex.europa.eu/eli/dir/2022/2464/oj',
    clause: 'CSRD Art. 19a (sustainability reporting)',
    fine_label: 'National authority sanctions + investor litigation risk',
    fine_high: 0,
    evidence: 'EU Corporate Sustainability Reporting Directive (CSRD) requires large undertakings (revenue > €40M, balance sheet > €20M, or 250+ employees) to publish sustainability reports aligned with ESRS standards.',
    fix: 'Publish CSRD-aligned sustainability statement + commit to ESRS reporting cycle.',
    uplift: 'Removes investor litigation risk and prepares for double-materiality scrutiny.'
  },

  {
    id: 'UK_FCA_TCFD_CLIMATE_DISCLOSURE',
    framework: 'UK_FCA_TCFD', category: 'esg_climate_disclosure_missing',
    jurisdiction: 'UK', sector_gate: ['finance', 'fintech', 'insurance'],
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /climate.?related disclosure|TCFD|Task Force on Climate|ISSB|sustainability report/i.test(t);
      if (has) return null;
      return { structural_fact: 'no TCFD / climate-related disclosure detected', methods: ['phrase'] };
    },
    regulator: 'FCA', regulator_url: 'https://www.fca.org.uk/firms/climate-change-sustainable-finance',
    clause: 'FCA ESG Sourcebook + Listing Rules',
    fine_label: 'FCA enforcement + listing penalties',
    fine_high: 0,
    evidence: 'FCA requires premium listed companies and certain asset managers / insurers to publish TCFD-aligned climate disclosures on a comply-or-explain basis.',
    fix: 'Publish TCFD-aligned climate disclosure + transition plan.',
    uplift: 'Closes FCA ESG Sourcebook exposure and meets investor expectations.'
  },

  {
    id: 'IN_BRSR_SEBI_ESG',
    framework: 'IN_SEBI_BRSR', category: 'esg_sustainability_report_missing',
    jurisdiction: 'IN', sector_gate: ['finance', 'fintech'],
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /BRSR|Business Responsibility|Sustainability Report|ESG report/i.test(t);
      // Only fires for listed entities (NSE/BSE)
      const listed = /NSE|BSE|listed entity|public limited/i.test(t);
      if (!listed) return null;
      if (has) return null;
      return { structural_fact: 'listed entity with no BRSR / Business Responsibility & Sustainability Report detected', methods: ['phrase'] };
    },
    regulator: 'SEBI', regulator_url: 'https://www.sebi.gov.in/',
    clause: 'SEBI LODR Reg. 34(2)(f) + BRSR Framework',
    fine_label: 'SEBI listing penalty + investor exposure',
    fine_high: 0,
    evidence: 'SEBI requires the top 1000 listed entities (by market cap) to publish BRSR (Business Responsibility & Sustainability Report) under LODR Reg. 34(2)(f).',
    fix: 'Publish BRSR aligned with SEBI framework + ESG KPIs.',
    uplift: 'Closes SEBI listing exposure + investor disclosure expectation.'
  },

  // =======================================================================
  // GROUP B · LAW FIRMS sector-specific (per jurisdiction)
  // =======================================================================

  {
    id: 'UK_LEGAL_OMBUDSMAN_LINK',
    framework: 'UK_SRA_COC', category: 'legal_ombudsman_link_missing',
    jurisdiction: 'UK', sector_gate: ['law-firms', 'barristers'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Legal Ombudsman|legalombudsman\.org\.uk/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Legal Ombudsman link / reference detected in complaints section', methods: ['phrase'] };
    },
    regulator: 'Legal Ombudsman', regulator_url: 'https://www.legalombudsman.org.uk/',
    clause: 'SRA Transparency Rules + LSA 2007',
    fine_label: 'SRA enforcement + LSA complaints', fine_high: 0,
    evidence: 'SRA Transparency Rules require firms to publish the Legal Ombudsman escalation route in their complaints procedure. The Legal Ombudsman web reference must be clearly accessible.',
    fix: 'Add a clear link to legalombudsman.org.uk in the complaints procedure + escalation timeline.',
    uplift: 'Closes the SRA Transparency complaints-route requirement.'
  },

  {
    id: 'UK_LEGAL_CLIENT_ACCOUNT_RULES',
    framework: 'UK_SRA_COC', category: 'legal_client_account_disclosure_missing',
    jurisdiction: 'UK', sector_gate: ['law-firms'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /client account|client money|SRA Accounts Rules/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Client Account / client money handling disclosure detected', methods: ['phrase'] };
    },
    regulator: 'SRA', regulator_url: 'https://www.sra.org.uk/solicitors/standards-regulations/accounts-rules/',
    clause: 'SRA Accounts Rules 2019',
    fine_label: 'Unlimited regulatory action + strike-off', fine_high: 0,
    evidence: 'SRA Accounts Rules 2019 require firms holding client money to maintain segregated client accounts. Public-facing disclosure of client account handling is a transparency expectation.',
    fix: 'Publish client account handling statement on /terms or /complaints page.',
    uplift: 'Closes SRA Accounts Rules exposure.'
  },

  {
    id: 'UK_LEGAL_PII_DISCLOSURE',
    framework: 'UK_SRA_COC', category: 'legal_pii_disclosure_missing',
    jurisdiction: 'UK', sector_gate: ['law-firms', 'barristers'],
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Professional Indemnity Insurance|PII certificate|insurer/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Professional Indemnity Insurance disclosure detected', methods: ['phrase'] };
    },
    regulator: 'SRA / BSB',
    regulator_url: 'https://www.sra.org.uk/solicitors/standards-regulations/indemnity-insurance-rules/',
    clause: 'SRA Indemnity Insurance Rules',
    fine_label: 'Cover suspension + client damages', fine_high: 0,
    evidence: 'SRA Indemnity Insurance Rules require firms to hold PII at prescribed minimum cover. Best practice: name the insurer + territory of cover in the footer or About page.',
    fix: 'Add PII insurer + minimum cover + territory to the footer or terms.',
    uplift: 'Builds client-trust signal + meets disclosure expectation.'
  },

  // =======================================================================
  // GROUP C · HEALTHCARE sector-specific
  // =======================================================================

  {
    id: 'UK_HC_CALDICOTT_GUARDIAN',
    framework: 'UK_CALDICOTT', category: 'hc_caldicott_guardian_missing',
    jurisdiction: 'UK', sector_gate: ['healthcare', 'dental'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Caldicott Guardian|Caldicott Principles/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Caldicott Guardian appointment or Caldicott Principles compliance statement detected', methods: ['phrase'] };
    },
    regulator: 'NHS / DHSC', regulator_url: 'https://www.gov.uk/government/publications/the-caldicott-principles',
    clause: 'Caldicott Principles (1997, 2013, 2020) + Common Law confidentiality',
    fine_label: 'NHS contract sanctions + GMC/NMC referrals', fine_high: 0,
    evidence: 'Caldicott Principles govern the use of patient-identifiable data by NHS and connected providers. Best practice is to name a Caldicott Guardian and publish a confidentiality charter.',
    fix: 'Appoint a Caldicott Guardian + publish confidentiality charter referencing the 8 Caldicott Principles.',
    uplift: 'Closes NHS contract exposure + meets GMC/NMC confidentiality expectations.'
  },

  {
    id: 'UK_HC_SAFEGUARDING_POLICY',
    framework: 'UK_CQC', category: 'hc_safeguarding_policy_missing',
    jurisdiction: 'UK', sector_gate: ['healthcare', 'dental'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /safeguarding (?:adults|children) policy|safeguarding lead|DSL/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Safeguarding Adults / Children policy or designated safeguarding lead detected', methods: ['phrase'] };
    },
    regulator: 'CQC + Local Safeguarding Board',
    regulator_url: 'https://www.cqc.org.uk/guidance-providers/regulations/regulation-13-safeguarding-service-users-abuse-improper',
    clause: 'CQC Fundamental Standards Reg. 13',
    fine_label: 'CQC rating downgrade + closure powers', fine_high: 0,
    evidence: 'CQC Fundamental Standards Regulation 13 requires registered providers to safeguard service users. A documented safeguarding policy with a named safeguarding lead is a public-facing expectation.',
    fix: 'Publish safeguarding policy + name designated safeguarding lead + escalation path.',
    uplift: 'Closes CQC rating-downgrade risk.'
  },

  {
    id: 'US_HC_HIPAA_PRIVACY_NOTICE',
    framework: 'US_HIPAA', category: 'hc_hipaa_notice_missing',
    jurisdiction: 'US', sector_gate: ['healthcare', 'dental'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /HIPAA|Notice of Privacy Practices|NPP|45 CFR 164/i.test(t);
      if (has) return null;
      return { structural_fact: 'no HIPAA Notice of Privacy Practices detected on site', methods: ['phrase'] };
    },
    regulator: 'HHS Office for Civil Rights', regulator_url: 'https://www.hhs.gov/hipaa/',
    clause: 'HIPAA Privacy Rule 45 CFR 164.520',
    fine_label: 'Up to $50,000 per violation + criminal up to $250,000 + 10 years',
    fine_high: 40000,
    evidence: 'HIPAA Privacy Rule requires Covered Entities to provide a Notice of Privacy Practices describing how PHI may be used and disclosed and patients\' rights.',
    fix: 'Publish HIPAA Notice of Privacy Practices + designate Privacy Officer + post breach-notification policy.',
    uplift: 'Closes HHS OCR enforcement exposure.'
  },

  {
    id: 'UAE_HC_DOH_ABU_DHABI',
    framework: 'UAE_DOH_ABU_DHABI', category: 'healthcare_regulator_disclosure_missing',
    jurisdiction: 'AE', sector_gate: ['healthcare'], city_gate: ['Abu Dhabi'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /DOH (?:Abu Dhabi|approval|licence)|Department of Health Abu Dhabi/i.test(t);
      if (has) return null;
      return { structural_fact: 'no DOH Abu Dhabi licence disclosure detected for Abu Dhabi facility', methods: ['phrase'] };
    },
    regulator: 'DOH Abu Dhabi', regulator_url: 'https://www.doh.gov.ae/',
    clause: 'DOH Policies and Standards', fine_label: 'Licence suspension', fine_high: 0,
    evidence: 'Healthcare facilities operating in Abu Dhabi require DOH Abu Dhabi licensure. Public-facing disclosure of facility licence is expected.',
    fix: 'Display DOH Abu Dhabi facility licence number on About / Contact page.',
    uplift: 'Closes DOH licensure exposure.'
  },

  // =======================================================================
  // GROUP D · FINANCE sector-specific
  // =======================================================================

  {
    id: 'UK_FCA_CONSUMER_DUTY_2023',
    framework: 'UK_FCA_CONSUMER_DUTY', category: 'fin_consumer_duty_missing',
    jurisdiction: 'UK', sector_gate: ['finance', 'fintech', 'insurance'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Consumer Duty|Fair Value Assessment|Good Outcomes|FCA PS22\/9/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Consumer Duty / Fair Value Assessment disclosure detected', methods: ['phrase'] };
    },
    regulator: 'FCA', regulator_url: 'https://www.fca.org.uk/firms/consumer-duty',
    clause: 'FCA PS22/9 (Consumer Duty)', fine_label: 'Unlimited FCA fines + S166 review', fine_high: 0,
    evidence: 'FCA Consumer Duty (PS22/9) in force since July 2023 requires retail financial firms to deliver good outcomes including Fair Value Assessments, Products and Services, Price and Value, Consumer Understanding, and Consumer Support.',
    fix: 'Publish Consumer Duty statement + Fair Value Assessment summary + customer outcomes monitoring.',
    uplift: 'Closes Consumer Duty exposure (the active FCA enforcement priority since 2024).'
  },

  {
    id: 'UK_FOS_FSCS_LINKS',
    framework: 'UK_FCA_CONC25', category: 'fin_fos_fscs_links_missing',
    jurisdiction: 'UK', sector_gate: ['finance', 'fintech', 'insurance'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasFos = /Financial Ombudsman Service|FOS|financial-ombudsman\.org\.uk/i.test(t);
      const hasFscs = /Financial Services Compensation Scheme|FSCS|fscs\.org\.uk/i.test(t);
      if (hasFos && hasFscs) return null;
      const missing = [];
      if (!hasFos) missing.push('FOS');
      if (!hasFscs) missing.push('FSCS');
      return { structural_fact: `missing ${missing.join(' + ')} disclosure links`, methods: ['phrase'] };
    },
    regulator: 'FCA', regulator_url: 'https://www.fca.org.uk/firms/disclosure',
    clause: 'FCA DISP + COMP rules', fine_label: 'FCA disclosure breach + customer detriment', fine_high: 0,
    evidence: 'Retail financial firms must reference the Financial Ombudsman Service and the Financial Services Compensation Scheme on customer-facing pages.',
    fix: 'Add FOS + FSCS links to footer + complaints page.',
    uplift: 'Removes FCA disclosure exposure + meets customer-information expectation.'
  },

  {
    id: 'UK_SMCR_REGIME',
    framework: 'UK_SMCR', category: 'fin_smcr_missing',
    jurisdiction: 'UK', sector_gate: ['finance', 'fintech', 'insurance'],
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /SMCR|Senior Managers (?:and|&) Certification Regime|SM&CR/i.test(t);
      if (has) return null;
      return { structural_fact: 'no SMCR governance statement detected', methods: ['phrase'] };
    },
    regulator: 'FCA + PRA', regulator_url: 'https://www.fca.org.uk/firms/senior-managers-certification-regime',
    clause: 'FSMA 2000 (as amended)', fine_label: 'Individual + firm enforcement', fine_high: 0,
    evidence: 'Senior Managers and Certification Regime applies to most FCA-regulated firms. Public governance disclosure expected.',
    fix: 'Publish SMCR governance statement naming Senior Manager Functions and accountabilities.',
    uplift: 'Removes SMCR individual + firm enforcement exposure.'
  },

  {
    id: 'US_NYDFS_CYBER_23_NYCRR_500',
    framework: 'US_NYDFS_500', category: 'fin_nydfs_cyber_missing',
    jurisdiction: 'US', sector_gate: ['finance', 'fintech', 'insurance'],
    city_gate: ['New York'], severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /NYDFS|23 NYCRR 500|Cybersecurity Program/i.test(t);
      if (has) return null;
      return { structural_fact: 'no NYDFS 23 NYCRR 500 Cybersecurity Program disclosure detected for NY-licensed firm', methods: ['phrase'] };
    },
    regulator: 'NYDFS', regulator_url: 'https://www.dfs.ny.gov/industry_guidance/cybersecurity',
    clause: '23 NYCRR 500.02 (Program) + 500.04 (CISO)',
    fine_label: 'Per-violation civil penalty + licence action', fine_high: 100000,
    evidence: 'NY-licensed financial entities must maintain a written Cybersecurity Program, designate a CISO, and certify annually.',
    fix: 'Publish Cybersecurity Program summary + designate CISO + annual certification.',
    uplift: 'Closes NYDFS supervisory exposure.'
  },

  {
    id: 'US_FIN_GLBA_PRIVACY',
    framework: 'US_GLBA', category: 'fin_glba_privacy_missing',
    jurisdiction: 'US', sector_gate: ['finance', 'fintech', 'insurance'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Gramm.?Leach.?Bliley|GLBA|Financial Privacy Notice/i.test(t);
      if (has) return null;
      return { structural_fact: 'no GLBA Financial Privacy Notice detected', methods: ['phrase'] };
    },
    regulator: 'FTC + functional regulators',
    regulator_url: 'https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act',
    clause: 'GLBA Title V (Privacy)', fine_label: 'FTC enforcement + civil', fine_high: 100000,
    evidence: 'Gramm-Leach-Bliley Act requires financial institutions to provide a privacy notice to customers describing information-sharing practices.',
    fix: 'Publish a GLBA-compliant Financial Privacy Notice + opt-out mechanism.',
    uplift: 'Closes FTC + functional regulator exposure.'
  },

  {
    id: 'IN_RBI_DIGITAL_LENDING_2022',
    framework: 'IN_RBI_DLG_2022', category: 'fin_rbi_digital_lending_missing',
    jurisdiction: 'IN', sector_gate: ['fintech'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Digital Lending Guidelines|Key Fact Statement|KFS|RBI Master Direction.*Digital/i.test(t);
      // Only for fintech firms doing lending
      const isLender = /loan|lending|EMI|credit line|personal loan|business loan/i.test(t);
      if (!isLender) return null;
      if (has) return null;
      return { structural_fact: 'digital lending firm with no RBI Digital Lending Guidelines / KFS disclosure detected', methods: ['phrase'] };
    },
    regulator: 'RBI', regulator_url: 'https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12382',
    clause: 'RBI DLG 2022 (Digital Lending Guidelines)', fine_label: 'Unlimited prudential + licence action', fine_high: 0,
    evidence: 'RBI Digital Lending Guidelines 2022 require regulated entities to publish Key Fact Statement, disclose all charges upfront, and use designated SRO for grievance redressal.',
    fix: 'Publish Key Fact Statement template + grievance officer details + Annual Percentage Rate disclosure.',
    uplift: 'Closes RBI supervisory exposure.'
  },

  {
    id: 'HK_HKMA_BANKING_CONDUCT',
    framework: 'HK_HKMA_CONDUCT', category: 'fin_hkma_conduct_missing',
    jurisdiction: 'HK', sector_gate: ['finance', 'fintech'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /HKMA|Code of Banking Practice|HKMA Code/i.test(t);
      if (has) return null;
      return { structural_fact: 'no HKMA Code of Banking Practice / conduct disclosure detected', methods: ['phrase'] };
    },
    regulator: 'HKMA', regulator_url: 'https://www.hkma.gov.hk/eng/regulatory-resources/code-of-banking-practice/',
    clause: 'HKMA Code of Banking Practice', fine_label: 'Unlimited regulatory action', fine_high: 0,
    evidence: 'HKMA Code of Banking Practice sets out the standard for the relationship between authorised institutions and their personal customers.',
    fix: 'Publish HKMA Code of Banking Practice adherence statement + complaints procedure.',
    uplift: 'Closes HKMA supervisory exposure.'
  },

  // =======================================================================
  // GROUP E · REAL ESTATE sector-specific
  // =======================================================================

  {
    id: 'UK_RE_MLR_2017_ESTATE_AGENCY',
    framework: 'UK_MLR_2017', category: 'aml_estate_agency_missing',
    jurisdiction: 'UK', sector_gate: ['real-estate'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /HMRC AML|MLRO|Money Laundering Reporting Officer|AML Supervisor/i.test(t);
      if (has) return null;
      return { structural_fact: 'no HMRC AML supervision / MLRO disclosure for estate agency detected', methods: ['phrase'] };
    },
    regulator: 'HMRC', regulator_url: 'https://www.gov.uk/guidance/money-laundering-regulations-estate-agency-business-registration',
    clause: 'MLR 2017 Reg. 8(2)(d) (Estate Agency Business)',
    fine_label: 'Unlimited HMRC civil + criminal', fine_high: 1000000,
    evidence: 'Estate Agency Businesses are within scope of MLR 2017 and must be registered with HMRC for AML supervision and appoint an MLRO.',
    fix: 'Register with HMRC AML + appoint MLRO + publish AML policy + train staff.',
    uplift: 'Closes HMRC AML supervisory exposure.'
  },

  {
    id: 'UK_RE_TPO_REDRESS',
    framework: 'UK_TPO', category: 're_tpo_redress_missing',
    jurisdiction: 'UK', sector_gate: ['real-estate'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Property Ombudsman|TPO|Property Redress Scheme|PRS|tpos\.co\.uk/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Property Ombudsman / redress scheme membership disclosed', methods: ['phrase'] };
    },
    regulator: 'TPO + Property Redress Scheme', regulator_url: 'https://www.tpos.co.uk/',
    clause: 'Enterprise & Regulatory Reform Act 2013 s.83',
    fine_label: 'Banning order + fines', fine_high: 0,
    evidence: 'Estate agents must belong to a government-approved redress scheme (TPO or PRS) and disclose membership.',
    fix: 'Display TPO / PRS membership badge + complaints escalation route.',
    uplift: 'Closes ERR Act 2013 s.83 exposure.'
  },

  {
    id: 'UAE_RE_ADRA_ABU_DHABI',
    framework: 'UAE_ADRA', category: 'real_estate_regulator_disclosure_missing',
    jurisdiction: 'AE', sector_gate: ['real-estate'], city_gate: ['Abu Dhabi'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /ADRA|Abu Dhabi Real Estate Authority|TAMM/i.test(t);
      if (has) return null;
      return { structural_fact: 'no ADRA Abu Dhabi Real Estate Authority registration detected for Abu Dhabi firm', methods: ['phrase'] };
    },
    regulator: 'ADRA', regulator_url: 'https://www.tamm.abudhabi/',
    clause: 'Abu Dhabi Law 3/2015 (Real Estate Sector Regulation)', fine_label: 'Licence suspension', fine_high: 0,
    evidence: 'Abu Dhabi real estate firms require ADRA registration. ADRA + TAMM portal registration is a public-facing requirement.',
    fix: 'Display ADRA registration / TAMM permit on the site footer.',
    uplift: 'Closes Abu Dhabi licensure exposure.'
  },

  {
    id: 'IN_RE_STATE_RERA_BREADTH',
    framework: 'IN_RERA_STATE', category: 're_state_rera_missing',
    jurisdiction: 'IN', sector_gate: ['real-estate'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const states = ['MahaRERA', 'K-?RERA', 'TN-?RERA', 'UP-?RERA', 'HRERA', 'HPRERA', 'GujRERA', 'WBHIRA', 'DelhiRERA'];
      const has = new RegExp(states.join('|'), 'i').test(t);
      if (has) return null;
      return { structural_fact: 'no state-specific RERA registration detected (project must be registered with the relevant state RERA)', methods: ['phrase'] };
    },
    regulator: 'State RERA Authorities', regulator_url: 'https://rera.gov.in/',
    clause: 'RERA Act 2016 s.4', fine_label: '10% project cost + criminal sanctions', fine_high: 1000000,
    evidence: 'Every project ≥ 500 m² or 8 apartments must be registered with the relevant state RERA before any advertisement, marketing or booking. State RERA project number is mandatory on all marketing materials.',
    fix: 'Display the relevant state RERA project number on every property listing + marketing creative.',
    uplift: 'Closes state RERA enforcement exposure.'
  },

  // =======================================================================
  // GROUP F · E-COMMERCE sector-specific
  // =======================================================================

  {
    id: 'UK_EC_CCRS_CANCELLATION',
    framework: 'UK_CCR_2013', category: 'ec_ccrs_cancellation_missing',
    jurisdiction: 'UK', sector_gate: ['ecommerce', 'retail'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /14.?day cancellation|right to cancel|right of withdrawal|Consumer Contracts Regulations/i.test(t);
      if (has) return null;
      return { structural_fact: 'no 14-day cancellation right / Consumer Contracts Regulations 2013 disclosure detected', methods: ['phrase'] };
    },
    regulator: 'CMA + Trading Standards',
    regulator_url: 'https://www.gov.uk/government/publications/consumer-contracts-information-cancellation-and-additional-charges-regulations-2013',
    clause: 'Consumer Contracts Regulations 2013 Reg. 29',
    fine_label: 'Unlimited fine on summary conviction', fine_high: 0,
    evidence: 'Consumer Contracts Regulations 2013 require online sellers to inform consumers of their 14-day right to cancel before purchase.',
    fix: 'Add 14-day cancellation right disclosure to product pages and checkout flow + cancellation form template.',
    uplift: 'Closes CMA + Trading Standards exposure.'
  },

  {
    id: 'US_EC_FTC_ENDORSEMENT_GUIDES',
    framework: 'US_FTC_ENDORSE', category: 'ec_ftc_endorsement_missing',
    jurisdiction: 'US', sector_gate: ['ecommerce', 'retail', 'marketing'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasInfluencerContent = /influencer|partner.*post|sponsored|brand ambassador/i.test(t);
      if (!hasInfluencerContent) return null;
      const hasDisclosure = /#ad|#sponsored|paid partnership|material connection/i.test(t);
      if (hasDisclosure) return null;
      return { structural_fact: 'influencer / partner content detected without #ad / material connection disclosure', methods: ['phrase'] };
    },
    regulator: 'FTC', regulator_url: 'https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers',
    clause: 'FTC Act §5 + Endorsement Guides 2023',
    fine_label: '$51,744 per violation + redress', fine_high: 40000,
    evidence: 'FTC Endorsement Guides 2023 require clear and conspicuous disclosure of material connections (#ad, #sponsored, "paid partnership") in influencer and partner content.',
    fix: 'Implement disclosure policy + audit existing influencer posts + add disclosure templates to brand guidelines.',
    uplift: 'Closes FTC §5 enforcement exposure.'
  },

  {
    id: 'US_EC_CAN_SPAM',
    framework: 'US_CAN_SPAM', category: 'ec_can_spam_missing',
    jurisdiction: 'US', sector_gate: ['ecommerce', 'retail', 'marketing'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasNewsletter = /newsletter|email signup|subscribe/i.test(t);
      if (!hasNewsletter) return null;
      const hasOptOut = /unsubscribe|opt.?out|preferences centre/i.test(t);
      if (hasOptOut) return null;
      return { structural_fact: 'email signup detected without visible unsubscribe / opt-out mechanism', methods: ['phrase'] };
    },
    regulator: 'FTC', regulator_url: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
    clause: '15 USC 7704 (CAN-SPAM)', fine_label: 'Up to $51,744 per email', fine_high: 40000,
    evidence: 'CAN-SPAM Act requires commercial emails to include unsubscribe mechanism, sender postal address, accurate header information, and clear identification as commercial.',
    fix: 'Add unsubscribe link to every commercial email template + physical postal address in footer + identify commercial emails as such.',
    uplift: 'Closes FTC CAN-SPAM exposure.'
  },

  {
    id: 'US_EC_TCPA_SMS_OPT_IN',
    framework: 'US_TCPA', category: 'ec_tcpa_sms_consent_missing',
    jurisdiction: 'US', sector_gate: ['ecommerce', 'retail', 'finance', 'fintech'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasSms = /SMS|text message|text alerts|text-?message updates/i.test(t);
      if (!hasSms) return null;
      const hasConsent = /express written consent|opt.?in|STOP to unsubscribe|consent to receive/i.test(t);
      if (hasConsent) return null;
      return { structural_fact: 'SMS / text marketing detected without express written consent disclosure', methods: ['phrase'] };
    },
    regulator: 'FCC + class action plaintiffs', regulator_url: 'https://www.fcc.gov/general/telemarketing-and-robocalls',
    clause: 'TCPA 47 USC 227(b)', fine_label: '$500 to $1,500 per text + class action exposure', fine_high: 1500,
    evidence: 'TCPA requires "prior express written consent" before sending marketing text messages. Class action exposure is substantial ($500-$1,500 per message).',
    fix: 'Implement double opt-in for SMS marketing + STOP-to-unsubscribe handling + consent log.',
    uplift: 'Closes TCPA class action exposure (typical claims $1M+).'
  },

  {
    id: 'US_EC_BIPA_ILLINOIS',
    framework: 'US_BIPA', category: 'ec_bipa_biometric_missing',
    jurisdiction: 'US', sector_gate: ['ecommerce', 'retail', 'tech', 'saas'],
    city_gate: ['Illinois', 'Chicago'],
    severity: 'P0',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasBiometric = /face recognition|fingerprint|biometric|retina scan|voice print/i.test(t);
      if (!hasBiometric) return null;
      const hasNotice = /BIPA|biometric information privacy|written consent|biometric policy/i.test(t);
      if (hasNotice) return null;
      return { structural_fact: 'biometric processing detected on IL-facing service without BIPA notice + written consent', methods: ['phrase'] };
    },
    regulator: 'Illinois courts (private right of action)',
    regulator_url: 'https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004',
    clause: '740 ILCS 14/15', fine_label: '$1,000 (negligent) to $5,000 (intentional) per violation + statutory damages', fine_high: 5000,
    evidence: 'Illinois Biometric Information Privacy Act (BIPA) requires written notice + written consent before collecting biometric identifiers. Strong private right of action.',
    fix: 'Publish BIPA policy + obtain written consent before biometric collection + 3-year retention schedule.',
    uplift: 'Closes BIPA class action exposure (verdicts can reach $100M+).'
  },

  {
    id: 'EU_EC_GREEN_TRANSITION_2024',
    framework: 'EU_GREEN_CLAIMS', category: 'ec_green_claims_missing',
    jurisdiction: 'EU', sector_gate: ['ecommerce', 'retail'],
    severity: 'P2',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const hasGreen = /eco.?friendly|sustainable|carbon.?neutral|climate.?neutral|biodegradable|green/i.test(t);
      if (!hasGreen) return null;
      const hasSubstantiation = /verified by|certified|methodology|carbon offset registry|ISO 14064|life cycle assessment/i.test(t);
      if (hasSubstantiation) return null;
      return { structural_fact: 'green / sustainability claims detected without verifiable substantiation', methods: ['phrase'] };
    },
    regulator: 'National consumer protection authorities + European Commission',
    regulator_url: 'https://eur-lex.europa.eu/eli/dir/2024/825/oj',
    clause: 'Directive 2024/825 (Empowering Consumers for the Green Transition)',
    fine_label: 'National penalties (up to 4% turnover in some states)', fine_high: 0,
    evidence: 'EU Directive 2024/825 prohibits generic environmental claims and requires substantiation. National implementation by 2026.',
    fix: 'Substantiate every environmental claim with a verifiable methodology + remove generic green claims.',
    uplift: 'Removes greenwashing enforcement exposure.'
  },

  {
    id: 'UAE_EC_FDL_14_2024',
    framework: 'UAE_FDL_14_2024_EC', category: 'ec_uae_modern_ec_missing',
    jurisdiction: 'AE', sector_gate: ['ecommerce', 'retail'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /Federal Decree-Law 14\/2024|UAE Electronic Commerce|VAT.*TRN/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Federal Decree-Law 14/2024 e-commerce compliance / TRN disclosure detected', methods: ['phrase'] };
    },
    regulator: 'UAE Ministry of Economy + ESCA',
    regulator_url: 'https://u.ae/en/about-the-uae/digital-uae/data/digital-trade',
    clause: 'Federal Decree-Law 14/2024 + VAT FDL 8/2017',
    fine_label: 'AED 1M per violation', fine_high: 200000,
    evidence: 'UAE Federal Decree-Law 14/2024 governs digital trade. VAT TRN must be displayed by VAT-registered e-commerce operators.',
    fix: 'Display VAT TRN in checkout + publish digital trade disclosure aligned with FDL 14/2024.',
    uplift: 'Closes Ministry of Economy + ESCA exposure.'
  },

  {
    id: 'IN_EC_LEGAL_METROLOGY',
    framework: 'IN_LEGAL_METROLOGY', category: 'ec_in_legal_metrology_missing',
    jurisdiction: 'IN', sector_gate: ['ecommerce', 'retail'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /MRP|maximum retail price|country of origin|net weight|importer name/i.test(t);
      if (has) return null;
      return { structural_fact: 'no Legal Metrology pre-packaged commodity disclosure (MRP, country of origin, importer) detected', methods: ['phrase'] };
    },
    regulator: 'Controller of Legal Metrology (state)',
    regulator_url: 'https://consumeraffairs.nic.in/organisation-and-units/division/legal-metrology',
    clause: 'Legal Metrology (Packaged Commodities) Rules 2011 + 2017 Amendment',
    fine_label: 'INR 25,000 to 1 lakh per violation', fine_high: 100000,
    evidence: 'India Legal Metrology rules require e-commerce platforms to display MRP, country of origin, net weight, importer name, customer care details on every pre-packaged commodity listing.',
    fix: 'Audit every product listing + ensure MRP, country of origin, importer details, customer care in listing.',
    uplift: 'Closes Legal Metrology enforcement exposure.'
  },

  {
    id: 'IN_EC_GSTIN_DISPLAY',
    framework: 'IN_GST', category: 'ec_in_gstin_missing',
    jurisdiction: 'IN', sector_gate: ['ecommerce', 'retail'],
    severity: 'P1',
    trigger: (intel) => {
      const t = intel.fullText || '';
      const has = /GSTIN|GST Registration Number|GST Number/i.test(t);
      if (has) return null;
      return { structural_fact: 'no GSTIN / GST registration disclosure detected on the website', methods: ['phrase'] };
    },
    regulator: 'CBIC + State GST', regulator_url: 'https://www.cbic.gov.in/',
    clause: 'CGST Act 2017 s.25 + Rule 18',
    fine_label: 'Penalty 10% of tax due', fine_high: 50000,
    evidence: 'GST-registered e-commerce operators must display GSTIN on every invoice and on the website footer.',
    fix: 'Add GSTIN to the website footer + invoice templates.',
    uplift: 'Closes CGST disclosure exposure.'
  },

  // =======================================================================
  // BATCH 2 · UK FCA sub-rulebooks + PRA + UK Equality detail + UK OSA
  // =======================================================================
  ...batchRules([
    ['UK_FCA_COBS', 'UK_FCA_COBS', 'fin_cobs_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P1',
      'FCA', 'https://www.handbook.fca.org.uk/handbook/COBS/', 'COBS (Conduct of Business)',
      'FCA disclosure breach + customer detriment', 0,
      /\bCOBS\b|Conduct of Business Sourcebook/i,
      'FCA COBS sets conduct standards for designated investment business including suitability, appropriateness, best execution and disclosures.',
      'Publish COBS-aligned disclosures including key features documents and risk warnings.',
      'Closes FCA conduct exposure under COBS.'],
    ['UK_FCA_SYSC', 'UK_FCA_SYSC', 'fin_sysc_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P1',
      'FCA + PRA', 'https://www.handbook.fca.org.uk/handbook/SYSC/', 'SYSC (Systems & Controls)',
      'FCA enforcement + s166 Skilled Person review', 0,
      /\bSYSC\b|Systems and Controls|governance arrangements/i,
      'FCA SYSC mandates governance, risk management and internal-control systems for regulated firms.',
      'Publish SYSC governance summary + senior-management responsibilities map.',
      'Closes SYSC governance exposure.'],
    ['UK_FCA_CASS', 'UK_FCA_CASS', 'fin_cass_missing', 'UK', ['finance', 'fintech'], 'P0',
      'FCA', 'https://www.handbook.fca.org.uk/handbook/CASS/', 'CASS (Client Assets)',
      'Unlimited FCA fine + s166 review', 0,
      /\bCASS\b|Client Assets|client money segregation/i,
      'CASS rules require strict segregation, reconciliation and disclosure of client money and assets.',
      'Publish CASS client-money handling statement + auditor confirmation.',
      'Closes CASS exposure (active FCA enforcement priority).'],
    ['UK_FCA_MAR', 'UK_FCA_MAR', 'fin_mar_missing', 'UK', ['finance', 'fintech'], 'P0',
      'FCA', 'https://www.handbook.fca.org.uk/handbook/MAR/', 'MAR (Market Abuse) + UK MAR',
      'Unlimited fine + criminal under UK MAR', 0,
      /\bMAR\b|Market Abuse Regulation|insider lists|STOR/i,
      'UK MAR criminalises insider dealing and market manipulation. Firms must maintain insider lists, STORs and trade-surveillance.',
      'Publish MAR compliance summary + insider-list policy + STOR reporting channel.',
      'Closes UK MAR enforcement exposure.'],
    ['UK_FCA_ICOBS', 'UK_FCA_ICOBS', 'fin_icobs_missing', 'UK', ['insurance'], 'P1',
      'FCA', 'https://www.handbook.fca.org.uk/handbook/ICOBS/', 'ICOBS (Insurance Conduct of Business)',
      'FCA conduct enforcement', 0,
      /\bICOBS\b|Insurance Conduct of Business|IDD Insurance Distribution/i,
      'ICOBS covers selling, administering and claims handling for insurance products including IDD requirements.',
      'Publish ICOBS-aligned policy documents + IPID summary + complaints handling.',
      'Closes ICOBS exposure.'],
    ['UK_PRA_RULEBOOK', 'UK_PRA', 'fin_pra_missing', 'UK', ['finance', 'insurance'], 'P1',
      'PRA', 'https://www.prarulebook.co.uk/', 'PRA Rulebook + SS3/19',
      'PRA prudential enforcement + capital add-ons', 0,
      /\bPRA\b|Prudential Regulation Authority|capital adequacy/i,
      'PRA Rulebook sets prudential standards for banks, building societies, credit unions and insurers.',
      'Publish PRA prudential disclosures + capital position summary.',
      'Closes PRA exposure for dual-regulated firms.'],
    ['UK_NCSC_CYBER_ESSENTIALS', 'UK_NCSC_CE', 'cyber_essentials_missing', 'UK', ['finance', 'fintech', 'saas', 'tech', 'healthcare'], 'P2',
      'NCSC', 'https://www.ncsc.gov.uk/cyberessentials/', 'Cyber Essentials + Cyber Essentials Plus',
      'Disqualification from government contracts + cyber insurance impact', 0,
      /Cyber Essentials|NCSC Cyber|ISO 27001/i,
      'NCSC Cyber Essentials is a government-backed baseline cybersecurity certification. Premium clients increasingly require it.',
      'Achieve Cyber Essentials certification + display the badge in the footer.',
      'Opens government and enterprise procurement.'],
    ['UK_OSA_2023_AGE_VERIFICATION', 'UK_OSA_2023', 'osa_ugc_missing', 'UK', ['saas', 'tech', 'media', 'ecommerce'], 'P1',
      'Ofcom', 'https://www.ofcom.org.uk/online-safety', 'OSA 2023 (User-to-User and Search Services)',
      'Up to £18M or 10% global turnover (Ofcom)', 18000000,
      /Online Safety Act|OSA 2023|age verification|content moderation policy|trusted flagger/i,
      'Online Safety Act 2023 imposes duties on user-to-user services including age verification, illegal-content removal and risk assessment.',
      'Publish OSA risk assessment + content moderation policy + age verification statement.',
      'Closes Ofcom OSA exposure.'],
    // UK Healthcare detail
    ['UK_HC_GPHC_PHARMACIST', 'UK_GPHC', 'hc_gphc_missing', 'UK', ['pharma', 'healthcare'], 'P1',
      'GPhC', 'https://www.pharmacyregulation.org/', 'GPhC Standards for Pharmacy Professionals',
      'Removal from register + closure', 0,
      /GPhC|General Pharmaceutical Council|registered pharmacist/i,
      'UK pharmacies and pharmacists must be GPhC registered and display registration on premises and online.',
      'Display GPhC registration number on About / Contact page.',
      'Closes GPhC supervisory exposure.'],
    ['UK_HC_HCPC', 'UK_HCPC', 'hc_hcpc_missing', 'UK', ['healthcare'], 'P1',
      'HCPC', 'https://www.hcpc-uk.org/', 'HCPC Standards (allied health professions)',
      'Removal from register', 0,
      /HCPC|Health and Care Professions Council/i,
      'Allied health professionals (physio, OT, paramedic, etc.) must be HCPC registered.',
      'Display HCPC registration number.', 'Closes HCPC supervisory exposure.'],
    ['UK_HC_NICE_GUIDANCE', 'UK_NICE', 'hc_nice_missing', 'UK', ['healthcare'], 'P2',
      'NICE', 'https://www.nice.org.uk/', 'NICE Clinical Guidelines',
      'NHS contract sanctions + clinical negligence exposure', 0,
      /NICE Guidance|NICE Guideline|NICE Clinical|evidence-based care/i,
      'NICE issues clinical guidelines that NHS providers must follow on a "comply or explain" basis.',
      'Publish NICE adherence statement on clinical service pages.', 'Closes NHS contract exposure.'],
    ['UK_HC_MCA_2005', 'UK_MCA_2005', 'hc_mca_missing', 'UK', ['healthcare'], 'P1',
      'CQC + Mental Capacity Act', 'https://www.legislation.gov.uk/ukpga/2005/9/contents', 'Mental Capacity Act 2005',
      'CQC enforcement + criminal under s.44 (ill-treatment)', 0,
      /Mental Capacity Act|MCA assessment|Deprivation of Liberty|DOLS/i,
      'MCA 2005 mandates capacity assessment processes and best-interests decisions for vulnerable patients.',
      'Publish MCA capacity-assessment process + DoLS framework.', 'Closes CQC and criminal exposure.'],
    ['UK_HC_CARE_ACT_2014', 'UK_CARE_ACT', 'hc_care_act_missing', 'UK', ['healthcare'], 'P1',
      'CQC + Local Authority', 'https://www.legislation.gov.uk/ukpga/2014/23', 'Care Act 2014',
      'Local authority sanctions + safeguarding referrals', 0,
      /Care Act 2014|Section 42 safeguarding|adult safeguarding/i,
      'Care Act 2014 imposes safeguarding duties and integrated-care obligations on adult social care providers.',
      'Publish Care Act safeguarding policy + s.42 enquiry process.', 'Closes Care Act exposure.'],
    ['UK_HC_CHILDREN_ACT', 'UK_CHILDREN_ACT', 'hc_children_act_missing', 'UK', ['healthcare', 'education'], 'P1',
      'Local Authority + LADO', 'https://www.legislation.gov.uk/ukpga/1989/41', 'Children Act 1989 + 2004',
      'Local authority enforcement + Ofsted/CQC referrals', 0,
      /Children Act|child safeguarding|LADO|Designated Safeguarding Lead/i,
      'Children Act 1989/2004 imposes safeguarding duties on services working with children.',
      'Publish child safeguarding policy + name DSL + LADO escalation route.', 'Closes children-safeguarding exposure.'],
    // UK Real Estate detail
    ['UK_RE_CPRS_MATERIAL_INFO', 'UK_CPRS_2008', 're_cprs_material_info_missing', 'UK', ['real-estate'], 'P1',
      'CMA + Trading Standards', 'https://www.gov.uk/government/publications/property-marketing-material-information-for-listings', 'Consumer Protection from Unfair Trading Regulations 2008 (Reg. 6)',
      'Unlimited fine + 2-yr prison', 0,
      /material information|CPRs Material Information|tenure|council tax band|annual ground rent/i,
      'CMA guidance (2023-24) requires estate agents to publish Material Information Parts A, B and C on every property listing.',
      'Audit listings + add tenure, council tax band, ground rent, EPC, accessibility info per CMA Parts A/B/C.',
      'Closes CMA enforcement exposure (active priority).'],
    ['UK_RE_EPC_DISCLOSURE', 'UK_EPC', 're_epc_missing', 'UK', ['real-estate'], 'P1',
      'Trading Standards', 'https://www.gov.uk/buy-sell-your-home/energy-performance-certificates', 'Energy Performance of Buildings Regulations 2012',
      '£200 per dwelling penalty', 200,
      /EPC|Energy Performance Certificate|EPC rating/i,
      'Every property marketed for sale or rent must have a valid EPC and the rating must appear in the advertisement.',
      'Display EPC rating on every property listing card.', 'Closes EPC enforcement exposure.'],
    ['UK_RE_LANDLORD_TENANT_S21', 'UK_LTA_1985', 're_landlord_tenant_missing', 'UK', ['real-estate'], 'P2',
      'First-tier Tribunal (Property Chamber)', 'https://www.legislation.gov.uk/ukpga/1985/70', 'Landlord and Tenant Act 1985 + Deregulation Act 2015',
      'Section 21 notice invalidity + rent repayment orders', 0,
      /tenancy deposit|deposit protection|prescribed information|How to Rent/i,
      'Landlords must protect deposits in a government-approved scheme, serve prescribed information and How to Rent guide.',
      'Add deposit protection statement + How to Rent guide reference to tenant communications.', 'Closes s.21 invalidity risk.'],
    // UK Ecommerce detail
    ['UK_EC_UCPD', 'UK_DMCC_2024', 'ec_unfair_practice_missing', 'UK', ['ecommerce', 'retail', 'marketing'], 'P1',
      'CMA', 'https://www.gov.uk/government/collections/digital-markets-competition-and-consumers-act-2024', 'DMCC Act 2024 (Subpart 1 unfair commercial practices)',
      'Up to 10% global turnover (CMA direct fining power)', 10000000,
      /price transparency|fake reviews policy|drip pricing/i,
      'DMCC Act 2024 grants CMA direct civil-fining powers including for drip pricing, fake reviews and unfair contract terms. In force April 2025.',
      'Audit pricing display for drip pricing, remove fake-review templates, publish reviews policy.', 'Closes DMCC enforcement exposure (active CMA priority).'],
    ['UK_EC_RETURNS_POLICY', 'UK_CCR_2013', 'ec_returns_policy_missing', 'UK', ['ecommerce', 'retail'], 'P2',
      'CMA + Trading Standards', 'https://www.gov.uk/accepting-returns-and-giving-refunds', 'Consumer Contracts Regulations 2013 + Consumer Rights Act 2015',
      'Trading Standards enforcement', 0,
      /returns policy|refund policy|14.?day return/i,
      'Online retailers must publish a clear returns policy aligned with 14-day right of withdrawal under CCRs 2013.',
      'Publish returns + refund policy page linked from footer.', 'Closes consumer-rights exposure.'],
    // UK Charity sector
    ['UK_CHARITY_COMMISSION_REG', 'UK_CHARITY_COMMISSION', 'charity_reg_missing', 'UK', ['charity'], 'P0',
      'Charity Commission', 'https://www.gov.uk/government/organisations/charity-commission', 'Charities Act 2011 s.39 + Charity Commission Guidance',
      'De-registration + trustee disqualification', 0,
      /Charity (?:Registration|No|Number)|charity commission|registered charity/i,
      'Charities with income > £5,000 must register with Charity Commission and display registration on all materials.',
      'Display charity number in footer of every page.', 'Closes Charity Commission disclosure exposure.'],
    ['UK_FUNDRAISING_REG', 'UK_FUNDRAISING_REG', 'charity_fundraising_reg_missing', 'UK', ['charity'], 'P1',
      'Fundraising Regulator', 'https://www.fundraisingregulator.org.uk/', 'Code of Fundraising Practice',
      'Public censure + complaints jurisdiction', 0,
      /Fundraising Regulator|Code of Fundraising Practice|fundraising promise/i,
      'Charities raising > £100,000 should register with Fundraising Regulator and display the badge.',
      'Register and display Fundraising Regulator badge.', 'Lifts donor-trust signal.'],
    ['UK_HMRC_GIFT_AID', 'UK_GIFT_AID', 'charity_gift_aid_missing', 'UK', ['charity'], 'P2',
      'HMRC', 'https://www.gov.uk/claim-gift-aid', 'HMRC Gift Aid scheme',
      'HMRC repayment + interest', 0,
      /Gift Aid|gift aid declaration|HMRC Gift Aid/i,
      'Charities accepting donations should offer Gift Aid declarations to claim the additional 25%.',
      'Add Gift Aid declaration to donation flow.', 'Increases donation value by 25% at zero cost to donor.'],
    // UK ESG
    ['UK_SECR_STREAMLINED', 'UK_SECR', 'esg_secr_missing', 'UK', ['finance', 'manufacturing', 'energy', 'transport'], 'P2',
      'BEIS + Companies House', 'https://www.gov.uk/government/publications/streamlined-energy-and-carbon-reporting', 'Streamlined Energy and Carbon Reporting (SECR)',
      'Companies House filing reject + investor exposure', 0,
      /SECR|Streamlined Energy and Carbon Reporting|Scope 1.*emissions|kWh consumed/i,
      'SECR requires large companies and LLPs (turnover > £36M, balance > £18M, 250+ employees) to disclose energy use and carbon emissions in annual reports.',
      'Publish SECR disclosure in annual report + on sustainability page.', 'Closes SECR filing exposure.']
  ]),

  // =======================================================================
  // BATCH 2b · EU advanced (DORA, PSD2, NIS2, DSA, DMA, MiFID II, EMIR, CSDDD, SFDR)
  // =======================================================================
  ...batchRules([
    ['EU_DORA_2025', 'EU_DORA', 'fin_dora_missing', 'EU', ['finance', 'fintech', 'insurance'], 'P0',
      'ESAs (EBA, EIOPA, ESMA)', 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj', 'DORA (Reg 2022/2554)',
      'Up to 2% annual turnover + criminal', 2000000,
      /DORA|Digital Operational Resilience Act|ICT risk management framework/i,
      'EU DORA (in force Jan 2025) imposes ICT risk management, incident reporting and third-party-risk oversight on financial entities.',
      'Publish DORA compliance summary + ICT risk framework + critical third-party register.', 'Closes ESA enforcement exposure.'],
    ['EU_PSD2_PISP_AISP', 'EU_PSD2', 'fin_psd2_missing', 'EU', ['fintech', 'finance'], 'P0',
      'National Competent Authorities + EBA', 'https://eur-lex.europa.eu/eli/dir/2015/2366/oj', 'PSD2 (Dir 2015/2366) + PSD3 (in passage)',
      'Up to €5M or 10% turnover', 4000000,
      /PSD2|Payment Services Directive|SCA|Strong Customer Authentication/i,
      'PSD2 sets conduct, SCA and open-banking standards for payment service providers.',
      'Publish PSD2-compliant SCA implementation + open-banking API documentation.', 'Closes PSD2 NCA exposure.'],
    ['EU_NIS2_DIRECTIVE', 'EU_NIS2', 'cyber_nis2_missing', 'EU', ['saas', 'tech', 'finance', 'fintech', 'energy', 'transport', 'healthcare'], 'P0',
      'ENISA + National Cybersecurity Authorities', 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj', 'NIS2 (Dir 2022/2555)',
      'Up to €10M or 2% turnover + management liability', 8000000,
      /NIS2|Network and Information Security|cybersecurity risk management measures/i,
      'EU NIS2 expands cybersecurity obligations to essential and important entities including registration, risk management and 24-hour incident reporting.',
      'Publish NIS2 compliance summary + designated NIS2 contact + incident reporting channel.', 'Closes NIS2 NCA + management-liability exposure.'],
    ['EU_DSA_TRANSPARENCY', 'EU_DSA', 'ec_dsa_transparency_missing', 'EU', ['ecommerce', 'retail', 'media', 'marketing'], 'P1',
      'European Commission + DSCs', 'https://eur-lex.europa.eu/eli/reg/2022/2065/oj', 'DSA (Reg 2022/2065)',
      'Up to 6% global turnover', 6000000,
      /DSA contact point|Digital Services Act|content moderation transparency|notice and action/i,
      'EU DSA requires online platforms to publish a single contact point, statement of reasons for content decisions, transparency reports.',
      'Publish DSA point of contact + content moderation policy + statement-of-reasons template.', 'Closes EC + DSC enforcement exposure.'],
    ['EU_DMA_GATEKEEPER', 'EU_DMA', 'ec_dma_missing', 'EU', ['saas', 'tech', 'ecommerce'], 'P2',
      'European Commission', 'https://eur-lex.europa.eu/eli/reg/2022/1925/oj', 'DMA (Reg 2022/1925)',
      'Up to 10% global turnover + 20% for repeats', 10000000,
      /DMA|Digital Markets Act|gatekeeper compliance/i,
      'DMA targets designated gatekeepers (45M+ EU users / €7.5B+ turnover); compliance obligations on interoperability, self-preferencing, data portability.',
      'Assess gatekeeper status + publish DMA compliance commitments if designated.', 'Closes DMA exposure for in-scope firms.'],
    ['EU_MIFID_II_DISCLOSURE', 'EU_MIFID_II', 'fin_mifid2_missing', 'EU', ['finance', 'fintech'], 'P0',
      'ESMA + NCAs', 'https://eur-lex.europa.eu/eli/dir/2014/65/oj', 'MiFID II (Dir 2014/65)',
      'NCA fines + retrocession ban', 0,
      /MiFID II|MiFID|Best Execution Policy|target market assessment/i,
      'MiFID II governs investment firms and trading venues including best execution, conflicts disclosure, suitability, target market.',
      'Publish best execution policy + target market documentation + conflicts of interest disclosure.', 'Closes MiFID II conduct exposure.'],
    ['EU_EMIR_DERIVATIVES', 'EU_EMIR', 'fin_emir_missing', 'EU', ['finance', 'fintech'], 'P1',
      'ESMA + NCAs', 'https://eur-lex.europa.eu/eli/reg/2012/648/oj', 'EMIR (Reg 648/2012) + Refit',
      'NCA fines + clearing-house liability', 0,
      /EMIR|European Market Infrastructure Regulation|trade repository|central clearing/i,
      'EMIR imposes derivative-reporting, central-clearing and risk-mitigation requirements on financial and non-financial counterparties.',
      'Publish EMIR compliance summary + LEI + trade repository statement.', 'Closes EMIR exposure.'],
    ['EU_CSDDD_DUE_DILIGENCE', 'EU_CSDDD', 'esg_csddd_missing', 'EU', ['retail', 'ecommerce', 'manufacturing', 'finance'], 'P2',
      'National competent authorities + ELI', 'https://eur-lex.europa.eu/eli/dir/2024/1760/oj', 'CSDDD (Dir 2024/1760)',
      'Up to 5% global net turnover', 5000000,
      /CSDDD|Corporate Sustainability Due Diligence|human rights due diligence|supply chain due diligence/i,
      'EU CSDDD (in force 2024, phased application from 2027) requires very large companies to conduct human rights and environmental due diligence across their value chains.',
      'Publish CSDDD compliance plan + supply-chain due diligence statement.', 'Removes CSDDD national-authority exposure.'],
    ['EU_SFDR_DISCLOSURE', 'EU_SFDR', 'esg_sfdr_missing', 'EU', ['finance', 'fintech'], 'P1',
      'ESAs', 'https://eur-lex.europa.eu/eli/reg/2019/2088/oj', 'SFDR (Reg 2019/2088)',
      'NCA enforcement + greenwashing claims', 0,
      /SFDR|Sustainable Finance Disclosure Regulation|Article 8 fund|Article 9 fund|PAI Statement/i,
      'SFDR requires asset managers and financial advisers to disclose sustainability risks, principal adverse impacts and product-level classifications.',
      'Publish SFDR Article 3/4/5 disclosures + product-level Article 8/9 classifications + PAI Statement.', 'Closes ESA + greenwashing exposure.'],
    ['EU_EAA_2025_ACCESSIBILITY', 'EU_EAA_2025', 'accessibility_eaa_missing', 'EU', null, 'P1',
      'National competent authorities', 'https://eur-lex.europa.eu/eli/dir/2019/882/oj', 'EAA (Dir 2019/882) in force June 2025',
      'National penalties + withdrawal from market', 0,
      /European Accessibility Act|EAA|WCAG 2\.1 AA|EN 301 549/i,
      'EAA requires accessibility for products and services placed on the EU market including websites and mobile apps of e-commerce, banking, transport, e-books, and audiovisual media services.',
      'Publish EAA / EN 301 549 conformance statement + WCAG 2.1 AA audit summary.', 'Closes EAA enforcement exposure.']
  ]),

  // =======================================================================
  // BATCH 2c · US deeper (COPPA, FERPA, ADA, Section 508, state mosaic, FCRA, FERC)
  // =======================================================================
  ...batchRules([
    ['US_COPPA_KIDS_EDU', 'US_COPPA', 'edu_coppa_missing', 'US', ['education', 'saas'], 'P0',
      'FTC', 'https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa', "COPPA (Children's Online Privacy Protection Act)",
      'Up to $51,744 per violation', 40000,
      /COPPA|Children'?s Online Privacy|verifiable parental consent|under 13/i,
      'COPPA requires verifiable parental consent before collecting personal information from children under 13.',
      'Publish COPPA-compliant privacy notice + verifiable parental consent mechanism.', 'Closes FTC COPPA exposure.'],
    ['US_FERPA_STUDENT_RECORDS', 'US_FERPA', 'edu_ferpa_missing', 'US', ['education', 'higher-education'], 'P0',
      'US Department of Education', 'https://studentprivacy.ed.gov/', 'FERPA (Family Educational Rights and Privacy Act)',
      'Loss of federal funding', 0,
      /FERPA|Family Educational Rights|directory information|education records/i,
      'FERPA protects student education records and requires annual notification of rights to parents and eligible students.',
      'Publish FERPA Annual Notice of Rights + directory information opt-out form.', 'Closes ED OCR exposure.'],
    ['US_ADA_TITLE_III_DIGITAL', 'US_ADA', 'accessibility_ada_missing', 'US', ['ecommerce', 'retail', 'finance', 'healthcare', 'hospitality'], 'P1',
      'DOJ + private plaintiffs', 'https://www.ada.gov/', 'ADA Title III (Public Accommodations)',
      '$75k first violation + $150k subsequent + private suits', 75000,
      /ADA|Americans with Disabilities Act|WCAG 2\.1 AA|accessibility statement/i,
      'ADA Title III applies to public accommodations. DOJ + courts have held this extends to commercial websites.',
      'Publish ADA accessibility statement + commit to WCAG 2.1 AA + accessibility feedback channel.', 'Closes DOJ + private litigation exposure.'],
    ['US_SECTION_508', 'US_SECTION_508', 'accessibility_508_missing', 'US', ['saas', 'tech', 'education'], 'P2',
      'Access Board + GSA', 'https://www.section508.gov/', 'Section 508 of Rehabilitation Act',
      'Federal contract bar', 0,
      /Section 508|Voluntary Product Accessibility Template|VPAT/i,
      'Section 508 applies to federal agencies and contractors. VPAT publication is the de-facto requirement for federal procurement.',
      'Publish a current VPAT (WCAG 2.0 AA Revised 508 Standards).', 'Opens federal procurement.'],
    ['US_TDPSA_TEXAS', 'US_TDPSA', 'privacy_tdpsa_missing', 'US', ['ecommerce', 'retail', 'saas', 'tech', 'finance'], 'P1',
      'Texas Attorney General', 'https://www.texasattorneygeneral.gov/consumer-protection/data-privacy', 'Texas Data Privacy and Security Act',
      '$7,500 per violation + injunctive', 7500,
      /Texas Data Privacy|TDPSA|opt out of sale|sensitive data consent|Texas consumer rights/i,
      'TDPSA (in force July 2024) gives Texas residents rights to access, correct, delete and opt out of data sales.',
      'Publish Texas-specific privacy notice + opt-out mechanism + sensitive data consent.', 'Closes Texas AG exposure.'],
    ['US_VCDPA_VIRGINIA', 'US_VCDPA', 'privacy_vcdpa_missing', 'US', ['ecommerce', 'retail', 'saas', 'tech', 'finance'], 'P1',
      'Virginia Attorney General', 'https://www.oag.state.va.us/consumer-protection/index.php/privacy-laws', 'Virginia Consumer Data Protection Act',
      '$7,500 per violation', 7500,
      /Virginia Consumer Data Protection|VCDPA|opt out of targeted advertising/i,
      'VCDPA gives Virginia residents rights to access, correct, delete and opt out of sale / targeted ads.',
      'Publish Virginia-specific privacy notice + opt-out mechanism.', 'Closes Virginia AG exposure.'],
    ['US_CTDPA_CONNECTICUT', 'US_CTDPA', 'privacy_ctdpa_missing', 'US', ['ecommerce', 'retail', 'saas', 'tech'], 'P2',
      'Connecticut Attorney General', 'https://portal.ct.gov/AG/Sections/Privacy/The-Connecticut-Data-Privacy-Act',
      'Connecticut Data Privacy Act',
      'Up to $5,000 per violation', 5000,
      /Connecticut Data Privacy|CTDPA|universal opt-out signal/i,
      'CTDPA grants similar rights to CPRA and recognises universal opt-out signals (Global Privacy Control).',
      'Publish CTDPA-compliant notice + honour GPC signal.', 'Closes Connecticut AG exposure.'],
    ['US_FCRA_CONSUMER_CREDIT', 'US_FCRA', 'fin_fcra_missing', 'US', ['finance', 'fintech'], 'P1',
      'FTC + CFPB', 'https://www.ftc.gov/legal-library/browse/statutes/fair-credit-reporting-act', 'Fair Credit Reporting Act',
      'Up to $1,000 per violation + actual + punitive', 1000,
      /FCRA|Fair Credit Reporting Act|adverse action notice|credit dispute/i,
      'FCRA governs consumer credit reporting including adverse action notices and dispute rights.',
      'Publish FCRA Summary of Rights + adverse action notice templates.', 'Closes FTC + CFPB exposure.'],
    ['US_OCC_HEIGHTENED_STANDARDS', 'US_OCC', 'fin_occ_missing', 'US', ['finance'], 'P2',
      'OCC', 'https://www.occ.treas.gov/', 'OCC Heightened Standards (12 CFR Part 30 App D)',
      'OCC enforcement + capital add-ons', 0,
      /OCC|Office of the Comptroller|Heightened Standards|national bank charter/i,
      'OCC supervises national banks and federal savings associations including governance and risk standards.',
      'Publish OCC charter status + risk governance framework summary.', 'Closes OCC supervisory exposure.'],
    ['US_FRB_REG_E', 'US_FRB_REG_E', 'fin_reg_e_missing', 'US', ['finance', 'fintech'], 'P1',
      'Federal Reserve + CFPB', 'https://www.consumerfinance.gov/rules-policy/regulations/1005/', 'Regulation E (Electronic Fund Transfers)',
      'Per-violation civil + class actions', 0,
      /Regulation E|Reg E|Electronic Fund Transfer|error resolution/i,
      'Reg E governs consumer rights for electronic fund transfers including pre-acquisition disclosures and error resolution.',
      'Publish Reg E disclosures + error resolution policy.', 'Closes CFPB + Fed exposure.'],
    ['US_FERC_ENERGY', 'US_FERC', 'energy_ferc_missing', 'US', ['energy'], 'P1',
      'FERC', 'https://www.ferc.gov/', 'FERC Standards of Conduct + NERC CIP',
      'Civil penalties up to $1.4M per day per violation', 1000000,
      /FERC|Federal Energy Regulatory Commission|NERC CIP|Standards of Conduct/i,
      'FERC oversees interstate transmission of electricity, natural gas, and oil; NERC CIP imposes cybersecurity standards.',
      'Publish FERC compliance status + NERC CIP cybersecurity statement.', 'Closes FERC + NERC exposure.'],
    ['US_FCC_TCPA_ROBOCALL', 'US_FCC_TCPA_BIS', 'fin_tcpa_robocall_missing', 'US', ['finance', 'fintech', 'marketing'], 'P1',
      'FCC + class actions', 'https://www.fcc.gov/general/telemarketing-and-robocalls', 'FCC TCPA Robocall Rules (2023 amendments)',
      '$500 to $1,500 per call', 1500,
      /TCPA|prior express written consent|STIR\/SHAKEN|robocall mitigation/i,
      'FCC TCPA + 2023 amendments require enhanced consent for marketing calls + STIR/SHAKEN call authentication.',
      'Audit outbound calling + implement STIR/SHAKEN + express written consent capture.', 'Closes FCC + class action exposure.']
  ]),

  // =======================================================================
  // BATCH 2d · UAE deeper (DFSA, FSRA, SCA, VARA, DTCM, ESCA, ZATCA-equivalent, DOH, DHA detail)
  // =======================================================================
  ...batchRules([
    ['UAE_DFSA_COB', 'UAE_DFSA_COB', 'fin_dfsa_cob_missing', 'AE', ['finance', 'fintech'], 'P0',
      'DFSA', 'https://www.dfsa.ae/rulebook/cob/', 'DFSA Conduct of Business Module (COB)',
      'DFSA unlimited fines + licence revocation', 1400000,
      /DFSA COB|DFSA Conduct of Business|DIFC authorised/i,
      'DFSA Conduct of Business module governs authorised firms in DIFC including suitability, best execution, disclosures.',
      'Publish DFSA COB-compliant disclosures + best-execution policy.', 'Closes DFSA exposure.'],
    ['UAE_FSRA_CONDUCT', 'UAE_FSRA_COBS', 'fin_fsra_cob_missing', 'AE', ['finance', 'fintech'], 'P0',
      'FSRA ADGM', 'https://www.adgm.com/operating-in-adgm/obligations-of-regulated-entities/fsra', 'FSRA COBS',
      'FSRA fines + suspension', 1400000,
      /FSRA|ADGM authorised|FSRA COBS/i,
      'ADGM FSRA conducts business rules apply to authorised entities in ADGM.',
      'Publish FSRA COBS-compliant disclosures.', 'Closes FSRA exposure.'],
    ['UAE_SCA_LICENCE', 'UAE_SCA', 'fin_sca_missing', 'AE', ['finance', 'fintech'], 'P0',
      'UAE SCA', 'https://www.sca.gov.ae/', 'UAE Securities and Commodities Authority Rules',
      'AED 10M per breach', 2000000,
      /SCA UAE|UAE Securities and Commodities|SCA licence|SCA approved/i,
      'UAE SCA regulates securities firms operating outside DIFC/ADGM. SCA licence reference must be disclosed.',
      'Display SCA licence number + classification on firm details page.', 'Closes UAE SCA exposure.'],
    ['UAE_VARA_VIRTUAL_ASSETS', 'UAE_VARA', 'fin_vara_missing', 'AE', ['fintech'], 'P0',
      'VARA Dubai', 'https://www.vara.ae/', 'VARA Virtual Asset Regulations',
      'AED 50M + criminal sanctions', 10000000,
      /VARA|Virtual Asset Regulatory Authority|Dubai virtual asset/i,
      'Dubai VARA licenses Virtual Asset Service Providers (VASPs) operating from or marketing to Dubai. Mandatory licence + AML compliance.',
      'Display VARA licence + classification. Confirm AML/CFT alignment.', 'Closes VARA exposure (active enforcement priority).'],
    ['UAE_ADGM_SPOT_CRYPTO', 'UAE_ADGM_CRYPTO', 'fin_adgm_crypto_missing', 'AE', ['fintech'], 'P0',
      'FSRA ADGM', 'https://www.adgm.com/operating-in-adgm/obligations-of-regulated-entities/fsra/virtual-asset-activities',
      'ADGM Spot Crypto Asset Framework',
      'FSRA enforcement + criminal', 0,
      /ADGM crypto|ADGM virtual asset|Accepted Virtual Asset/i,
      'ADGM is the leading global hub for regulated virtual asset firms. Spot Crypto Asset Framework requires FSRA licence + custody standards.',
      'Display FSRA Accepted Virtual Asset Operator status.', 'Closes ADGM crypto exposure.'],
    ['UAE_CIIP_2018', 'UAE_CIIP', 'cyber_uae_ciip_missing', 'AE', ['finance', 'energy', 'transport', 'tech'], 'P1',
      'TDRA + NESA', 'https://tdra.gov.ae/', 'Critical Information Infrastructure Protection Policy',
      'Federal cybersecurity sanctions', 0,
      /CIIP|Critical Information Infrastructure|TDRA cybersecurity|NESA framework/i,
      'CIIP designates and protects UAE critical information infrastructure (finance, energy, transport, telecom).',
      'Publish CIIP compliance statement if designated critical operator.', 'Closes TDRA / NESA exposure.'],
    ['UAE_FTA_VAT_TRN', 'UAE_FTA_VAT', 'ec_uae_vat_trn_missing', 'AE', ['ecommerce', 'retail', 'hospitality'], 'P1',
      'UAE Federal Tax Authority', 'https://tax.gov.ae/', 'Federal Decree-Law 8/2017 (VAT)',
      'AED 10,000 to AED 1M per violation', 200000,
      /TRN|Tax Registration Number|VAT registration UAE|UAE VAT/i,
      'VAT-registered UAE businesses must display TRN on invoices and on the website.',
      'Display TRN in website footer + invoice template.', 'Closes FTA VAT exposure.']
  ]),

  // =======================================================================
  // BATCH 2e · Saudi deeper (NCA Cyber, SDAIA AI Ethics, ZATCA, MHRSD, GIA charity)
  // =======================================================================
  ...batchRules([
    ['SA_NCA_ECC_2018', 'SA_NCA_ECC', 'cyber_sa_ecc_missing', 'SA', ['finance', 'fintech', 'saas', 'tech', 'healthcare', 'energy'], 'P0',
      'NCA Saudi Arabia', 'https://nca.gov.sa/', 'Essential Cybersecurity Controls (ECC-1:2018)',
      'NCA enforcement + Vision 2030 contract sanctions', 0,
      /NCA Saudi|National Cybersecurity Authority|ECC-?1|Essential Cybersecurity Controls/i,
      'NCA ECC-1:2018 mandates baseline cybersecurity controls for Saudi government and critical operators. Increasingly required of private-sector counterparties.',
      'Publish NCA ECC alignment statement.', 'Opens Saudi government and Aramco-tier procurement.'],
    ['SA_SDAIA_AI_ETHICS', 'SA_SDAIA_AI', 'ai_sdaia_missing', 'SA', null, 'P1',
      'SDAIA', 'https://sdaia.gov.sa/en/SDAIA/about/Pages/AboutAIEthics.aspx', 'SDAIA AI Ethics Framework',
      'SDAIA enforcement + reputational', 0,
      /SDAIA|Saudi Data and AI Authority|AI Ethics Framework/i,
      'SDAIA AI Ethics Framework governs the use of AI by entities operating in Saudi Arabia, including transparency, fairness and human oversight.',
      'Publish SDAIA AI Ethics compliance statement if AI features used.', 'Closes SDAIA reputational + supervisory exposure.'],
    ['SA_ZATCA_VAT_NUMBER', 'SA_ZATCA', 'ec_sa_vat_missing', 'SA', ['ecommerce', 'retail', 'hospitality'], 'P1',
      'ZATCA', 'https://zatca.gov.sa/', 'ZATCA VAT + E-Invoicing',
      'SAR 25,000 to SAR 50,000 per violation', 10000,
      /ZATCA|Saudi VAT|تسجيل ضريبة القيمة المضافة|VAT Saudi/i,
      'ZATCA requires Saudi VAT-registered firms to display VAT number + transition to e-invoicing (Phase 2 Fatoora).',
      'Display ZATCA VAT number in footer + ensure Fatoora-compliant e-invoicing.', 'Closes ZATCA exposure.'],
    ['SA_MHRSD_LABOUR', 'SA_MHRSD', 'hr_sa_labour_missing', 'SA', null, 'P2',
      'MHRSD', 'https://www.hrsd.gov.sa/', 'MHRSD Saudization + Wage Protection',
      'Suspension of services + Saudization fines', 0,
      /MHRSD|Ministry of Human Resources Saudi|Saudization|نطاقات/i,
      'MHRSD enforces Saudization (Nitaqat) and Wage Protection System (WPS) obligations on employers.',
      'Publish Saudization compliance statement + workforce nationality breakdown.', 'Closes MHRSD exposure.']
  ]),

  // =======================================================================
  // BATCH 2f · Singapore deeper (CSA, MAS TRM, IMDA, IRAS, HDB, URA, BCA)
  // =======================================================================
  ...batchRules([
    ['SG_CSA_CYBERSECURITY_2018', 'SG_CYBERSECURITY_2018', 'cyber_sg_csa_missing', 'SG', ['saas', 'tech', 'finance', 'fintech', 'energy', 'transport', 'healthcare'], 'P1',
      'CSA Singapore', 'https://www.csa.gov.sa/', 'Singapore Cybersecurity Act 2018',
      'SGD 100,000 + 2-yr prison', 60000,
      /CSA Singapore|Cybersecurity Act 2018|CIIO|Critical Information Infrastructure Owner/i,
      'CSA Singapore Cybersecurity Act 2018 designates Critical Information Infrastructure Owners and imposes incident-reporting + audit obligations.',
      'Publish CIIO status (if designated) + cybersecurity program summary.', 'Closes CSA exposure.'],
    ['SG_MAS_TRM_GUIDELINES', 'SG_MAS_TRM', 'fin_sg_mas_trm_missing', 'SG', ['finance', 'fintech'], 'P1',
      'MAS Singapore', 'https://www.mas.gov.sg/regulation/guidelines/technology-risk-management-guidelines', 'MAS Technology Risk Management Guidelines',
      'MAS conduct enforcement', 0,
      /MAS TRM|Technology Risk Management|MAS Notice on Cyber Hygiene/i,
      'MAS TRM Guidelines (2021) set technology risk management expectations for financial institutions including third-party risk + cloud.',
      'Publish MAS TRM alignment statement + cloud-risk framework.', 'Closes MAS technology risk exposure.'],
    ['SG_IMDA_SPAM_CONTROL', 'SG_SPAM_CONTROL', 'ec_sg_spam_missing', 'SG', null, 'P1',
      'IMDA', 'https://www.imda.gov.sg/regulations-and-licensing-listing/spam-control-act', 'Spam Control Act',
      'SGD 25 per spam message + civil action', 15000,
      /Spam Control Act|unsubscribe instruction|sender information|IMDA spam/i,
      'Singapore Spam Control Act prohibits unsolicited commercial electronic messages without unsubscribe + accurate sender info.',
      'Add unsubscribe link + accurate sender information to every commercial email and SMS.', 'Closes IMDA exposure.'],
    ['SG_IRAS_GST_DISPLAY', 'SG_IRAS_GST', 'ec_sg_gst_missing', 'SG', ['ecommerce', 'retail', 'hospitality'], 'P1',
      'IRAS', 'https://www.iras.gov.sa/', 'GST Act (Singapore)',
      'Penalty + late payment interest', 50000,
      /GST Reg(?:istration)? No|GST Number Singapore|IRAS GST/i,
      'GST-registered Singapore businesses must display GST number on invoices and on the website footer.',
      'Display IRAS GST number in footer.', 'Closes IRAS exposure.'],
    ['SG_ACRA_UEN_DISPLAY', 'SG_ACRA', 'company_sg_uen_missing', 'SG', null, 'P2',
      'ACRA', 'https://www.acra.gov.sg/', 'ACRA Business Registration',
      'Companies Act enforcement', 0,
      /UEN|Unique Entity Number|ACRA registration/i,
      'Singapore companies must display UEN on official documents and online materials.',
      'Display ACRA UEN in website footer.', 'Closes ACRA exposure.']
  ]),

  // =======================================================================
  // BATCH 2g · India deeper (FEMA, FCRA, NPCI, SEBI LODR, IRDAI, PFRDA, CERT-In, TRAI, FSSAI)
  // =======================================================================
  ...batchRules([
    ['IN_FEMA_FOREIGN_EXCHANGE', 'IN_FEMA_1999', 'fin_in_fema_missing', 'IN', ['finance', 'fintech'], 'P1',
      'RBI + Enforcement Directorate', 'https://www.rbi.org.in/Scripts/BS_FemaNotifications.aspx', 'FEMA 1999',
      'Up to 3x amount + INR 2 lakh penalty', 500000,
      /FEMA|Foreign Exchange Management Act|inbound remittance|outbound remittance/i,
      'FEMA 1999 governs foreign exchange transactions in India and applies to AD banks and forex dealers.',
      'Publish FEMA compliance statement + LRS scheme disclosure if applicable.', 'Closes RBI + ED exposure.'],
    ['IN_FCRA_FOREIGN_DONATION', 'IN_FCRA_2010', 'charity_in_fcra_missing', 'IN', ['charity'], 'P0',
      'Ministry of Home Affairs', 'https://fcraonline.nic.in/', 'FCRA 2010',
      'Up to 5x amount + criminal', 0,
      /FCRA|Foreign Contribution Regulation Act|FCRA registration/i,
      'FCRA 2010 governs receipt and use of foreign contributions by Indian charities and NGOs.',
      'Publish FCRA registration number + foreign contribution policy.', 'Closes MHA enforcement exposure.'],
    ['IN_NPCI_UPI_GUIDELINES', 'IN_NPCI', 'fin_in_npci_missing', 'IN', ['fintech'], 'P1',
      'NPCI', 'https://www.npci.org.in/', 'NPCI UPI Procedural Guidelines',
      'NPCI suspension + RBI sanctions', 0,
      /NPCI|UPI Procedural Guidelines|Unified Payments Interface/i,
      'NPCI Guidelines set technical and conduct standards for UPI participants including dispute resolution.',
      'Publish NPCI UPI compliance statement + dispute resolution framework.', 'Closes NPCI suspension exposure.'],
    ['IN_SEBI_LODR_LISTED', 'IN_SEBI_LODR', 'fin_in_sebi_lodr_missing', 'IN', ['finance'], 'P0',
      'SEBI', 'https://www.sebi.gov.in/legal/regulations/jul-2015/sebi-listing-obligations-and-disclosure-requirements-regulations-2015_29852.html',
      'SEBI LODR Regulations 2015',
      'SEBI listing penalty + monetary fines', 100000,
      /SEBI LODR|Listing Obligations|Corporate Governance Report/i,
      'SEBI LODR governs continuous disclosure obligations for listed entities including corporate governance.',
      'Publish SEBI LODR-compliant corporate governance report + related party transactions policy.', 'Closes SEBI listing exposure.'],
    ['IN_IRDAI_INSURER_DISCLOSURE', 'IN_IRDAI', 'fin_in_irdai_missing', 'IN', ['insurance'], 'P0',
      'IRDAI', 'https://www.irdai.gov.in/', 'IRDAI Conduct of Business Regulations',
      'IRDAI fines + licence action', 0,
      /IRDAI|Insurance Regulatory and Development Authority|IRDAI registration/i,
      'IRDAI governs Indian insurers and intermediaries with extensive conduct, solvency and grievance obligations.',
      'Display IRDAI registration number + grievance officer details.', 'Closes IRDAI exposure.'],
    ['IN_PFRDA_PENSION', 'IN_PFRDA', 'fin_in_pfrda_missing', 'IN', ['finance'], 'P1',
      'PFRDA', 'https://www.pfrda.org.in/', 'PFRDA NPS Regulations',
      'PFRDA enforcement', 0,
      /PFRDA|Pension Fund Regulatory|NPS|National Pension System/i,
      'PFRDA governs National Pension System intermediaries (POPs, CRA, TBs, AMCs).',
      'Display PFRDA registration + scheme disclosures.', 'Closes PFRDA exposure.'],
    ['IN_CERT_IN_DIRECTION_2022', 'IN_CERT_IN', 'cyber_in_cert_in_missing', 'IN', ['saas', 'tech', 'finance', 'fintech'], 'P0',
      'CERT-In', 'https://www.cert-in.org.in/', 'CERT-In Directions April 2022',
      'INR 1 crore + criminal exposure', 100000,
      /CERT.?In|Indian Computer Emergency Response Team|6.?hour incident notification|180.?day log/i,
      'CERT-In April 2022 directions require 6-hour incident reporting + 180-day log retention + customer KYC for VPN/cloud providers.',
      'Publish CERT-In compliance statement + incident reporting channel + log retention policy.', 'Closes CERT-In exposure.'],
    ['IN_TRAI_COMMERCIAL_COMM', 'IN_TRAI', 'ec_in_trai_missing', 'IN', null, 'P1',
      'TRAI', 'https://www.trai.gov.in/', 'TRAI Commercial Communications Customer Preference Regulations',
      'INR 2 crore + service suspension', 200000,
      /TRAI|National Customer Preference Register|DND|TCCCPR|principal entity registration/i,
      'TRAI rules require Principal Entity registration + Header / Content Template approval for transactional + promotional SMS / RCS.',
      'Register as Principal Entity + maintain header + template approval log.', 'Closes TRAI exposure.'],
    ['IN_FSSAI_FOOD_BUSINESS', 'IN_FSSAI', 'food_in_fssai_missing', 'IN', ['hospitality', 'food', 'ecommerce'], 'P1',
      'FSSAI', 'https://www.fssai.gov.in/', 'FSSAI Act 2006',
      'INR 10 lakh + product seizure', 100000,
      /FSSAI|Food Safety and Standards Authority|licence (?:no|number) FSSAI/i,
      'Food businesses + e-commerce platforms selling food must display 14-digit FSSAI licence.',
      'Display FSSAI licence on every food listing + premises page.', 'Closes FSSAI exposure.']
  ]),

  // =======================================================================
  // BATCH 2h · HK deeper (IA, MPFA, SVF Ord, MLO, Customs, Companies Reg)
  // =======================================================================
  ...batchRules([
    ['HK_IA_INSURANCE', 'HK_IA', 'fin_hk_ia_missing', 'HK', ['insurance'], 'P0',
      'IA Hong Kong', 'https://www.ia.org.hk/', 'Insurance Ordinance Cap. 41',
      'IA fines + licence revocation', 0,
      /Insurance Authority Hong Kong|IA Hong Kong|HK Insurance Ordinance/i,
      'IA Hong Kong supervises authorised insurers and licensed intermediaries.',
      'Display IA authorisation + scheme classification.', 'Closes IA Hong Kong exposure.'],
    ['HK_MPFA_PENSION', 'HK_MPFA', 'fin_hk_mpfa_missing', 'HK', ['finance'], 'P1',
      'MPFA', 'https://www.mpfa.org.hk/', 'Mandatory Provident Fund Schemes Ordinance Cap. 485',
      'MPFA enforcement', 0,
      /MPFA|Mandatory Provident Fund|MPF Scheme/i,
      'MPFA supervises MPF schemes; trustees, sponsors and investment managers are within scope.',
      'Display MPFA registration + scheme particulars.', 'Closes MPFA exposure.'],
    ['HK_SVF_PSSVFO', 'HK_PSSVFO', 'fin_hk_svf_missing', 'HK', ['fintech'], 'P0',
      'HKMA', 'https://www.hkma.gov.hk/eng/key-functions/international-financial-centre/regulatory-regime-for-stored-value-facilities/',
      'Payment Systems and Stored Value Facilities Ordinance Cap. 584',
      'HKD 1M + 5-yr prison', 100000,
      /Stored Value Facility|SVF licence|PSSVFO|HKMA SVF/i,
      'HKMA licenses SVF issuers (digital wallets, prepaid cards) under PSSVFO.',
      'Display HKMA SVF licence + scheme disclosures.', 'Closes HKMA SVF exposure.'],
    ['HK_MLO_MONEY_LENDER', 'HK_MLO', 'fin_hk_mlo_missing', 'HK', ['finance', 'fintech'], 'P1',
      'Licensing Court + Customs', 'https://www.elegislation.gov.hk/hk/cap163', 'Money Lenders Ordinance Cap. 163',
      'HKD 100,000 + 2-yr prison + licence suspension', 13000,
      /Money Lenders Ordinance|MLO licence|HK money lender/i,
      'HK money lenders must hold MLO licence and disclose APR + fees.',
      'Display MLO licence + APR + fees on lending product page.', 'Closes MLO exposure.'],
    ['HK_CUSTOMS_TDO_GOODS', 'HK_TDO_TRADE_DESCRIPTION', 'ec_hk_tdo_misleading_missing', 'HK', ['ecommerce', 'retail'], 'P1',
      'HK Customs', 'https://www.customs.gov.hk/en/trade_facilitation/tdo/', 'Trade Descriptions Ordinance Cap. 362 + 2013 Amendment',
      'HKD 500,000 + 5-yr prison', 50000,
      /Trade Descriptions Ordinance|misleading omission policy|aggressive commercial practice/i,
      'TDO 2013 Amendment prohibits misleading omissions, aggressive commercial practices, bait advertising.',
      'Audit advertising + remove misleading or aggressive language + publish TDO compliance statement.', 'Closes HK Customs exposure.']
  ]),

  // =======================================================================
  // BATCH 2i · Cross-cutting extensions (UN Global Compact + global sanctions)
  // =======================================================================
  ...batchRules([
    ['GLOBAL_SANCTIONS_SCREENING', 'GLOBAL_SANCTIONS', 'sanctions_screening_missing', '*', ['finance', 'fintech', 'real-estate'], 'P0',
      'OFAC + OFSI + EU + UN', 'https://home.treasury.gov/policy-issues/financial-sanctions/sanctions-programs-and-country-information',
      'OFAC + OFSI + EU + UN sanctions lists',
      'Strict liability + criminal sanctions', 0,
      /sanctions screening|OFAC|OFSI|UN sanctions|EU sanctions|consolidated sanctions list/i,
      'Financial sector + real-estate firms operating across borders must screen counterparties against sanctions lists (OFAC, OFSI, EU, UN).',
      'Publish sanctions screening policy + designated officer + screening provider.', 'Closes OFAC strict-liability exposure.'],
    ['UN_GLOBAL_COMPACT', 'UN_GLOBAL_COMPACT', 'esg_un_global_compact_missing', '*', null, 'P2',
      'UN Global Compact', 'https://www.unglobalcompact.org/', 'UN Global Compact 10 Principles',
      'Reputational + procurement exposure', 0,
      /UN Global Compact|Communication on Progress|UNGC participant/i,
      'Voluntary corporate sustainability initiative. Increasingly a procurement expectation among large enterprise + government buyers.',
      'Join UN Global Compact + publish Communication on Progress.', 'Opens enterprise procurement.']
  ]),

  // =======================================================================
  // BATCH 3 · NICHE SECTORS (energy, transport, manufacturing, education, hospitality detail)
  // =======================================================================
  ...batchRules([
    // ENERGY
    ['UK_OFGEM_ENERGY_LICENCE', 'UK_OFGEM', 'energy_uk_ofgem_missing', 'UK', ['energy'], 'P0',
      'Ofgem', 'https://www.ofgem.gov.uk/licences-codes-and-standards', 'Electricity Act 1989 + Gas Act 1986',
      'Licence revocation + criminal sanctions', 0,
      /Ofgem (?:licence|license|registered)|electricity supply licence|gas supply licence/i,
      'UK energy suppliers and generators must hold Ofgem licences and display licence details.',
      'Display Ofgem licence number + licence class.', 'Closes Ofgem exposure.'],
    ['UK_HSE_ENERGY_SAFETY', 'UK_HSE_ENERGY', 'energy_uk_hse_missing', 'UK', ['energy', 'manufacturing', 'construction'], 'P1',
      'HSE', 'https://www.hse.gov.uk/energy/', 'Health and Safety at Work Act 1974 + COMAH',
      'Unlimited fine + 2-yr prison', 0,
      /HSE|Health and Safety Executive|COMAH|Control of Major Accident Hazards/i,
      'Energy and major-hazard operators must publish HSE compliance + COMAH safety report.',
      'Publish HSE compliance summary + COMAH safety report.', 'Closes HSE / COMAH exposure.'],
    ['US_FERC_NERC_CIP', 'US_NERC_CIP', 'energy_us_nerc_missing', 'US', ['energy'], 'P1',
      'NERC + FERC', 'https://www.nerc.com/pa/Stand/Pages/CIPStandards.aspx', 'NERC CIP-002 to CIP-014',
      'Up to $1.4M per day per violation', 1000000,
      /NERC CIP|Critical Infrastructure Protection|bulk electric system/i,
      'NERC CIP standards apply to entities owning or operating the Bulk Electric System.',
      'Publish NERC CIP compliance program summary.', 'Closes FERC + NERC exposure.'],
    ['EU_ENERGY_EFFICIENCY_2023', 'EU_EED_2023', 'energy_eu_eed_missing', 'EU', ['energy', 'manufacturing'], 'P2',
      'European Commission', 'https://eur-lex.europa.eu/eli/dir/2023/1791/oj', 'Energy Efficiency Directive (Dir 2023/1791)',
      'National penalties', 0,
      /Energy Efficiency Directive|EED 2023|energy management system|ISO 50001/i,
      'EU EED 2023 imposes energy audit + efficiency obligations on large enterprises.',
      'Publish EED compliance summary + ISO 50001 energy management certificate.', 'Closes EED exposure.'],
    // TRANSPORT
    ['UK_CAA_AVIATION_LICENCE', 'UK_CAA', 'transport_uk_caa_missing', 'UK', ['aviation', 'transport'], 'P0',
      'CAA UK', 'https://www.caa.co.uk/', 'Air Navigation Order 2016 + EASA',
      'CAA enforcement + licence suspension', 0,
      /CAA UK|Civil Aviation Authority|Air Operator Certificate|AOC/i,
      'UK aviation operators must hold CAA Air Operator Certificate and display licence details.',
      'Display CAA AOC number + operations specifications.', 'Closes CAA exposure.'],
    ['UK_ORR_RAIL_LICENCE', 'UK_ORR', 'transport_uk_orr_missing', 'UK', ['transport'], 'P1',
      'ORR', 'https://www.orr.gov.uk/', 'Railways Act 1993',
      'Licence revocation + enforcement orders', 0,
      /ORR|Office of Rail and Road|train operator licence/i,
      'UK rail operators must hold ORR licence + Safety Authorisation.',
      'Display ORR licence + Safety Authorisation status.', 'Closes ORR exposure.'],
    ['UK_DVSA_O_LICENCE', 'UK_DVSA', 'transport_uk_dvsa_missing', 'UK', ['transport'], 'P1',
      'DVSA + Traffic Commissioner', 'https://www.gov.uk/being-a-goods-vehicle-operator', 'Goods Vehicles Act 1995',
      'Operator licence revocation', 0,
      /Operator (?:Licence|License|O.?Licence)|DVSA|Traffic Commissioner/i,
      'UK goods vehicle operators must hold Operator Licence (O Licence) from Traffic Commissioner.',
      'Display Operator Licence number + Class (Standard/Restricted/International).', 'Closes DVSA exposure.'],
    ['US_FAA_AIR_CARRIER', 'US_FAA', 'transport_us_faa_missing', 'US', ['aviation', 'transport'], 'P0',
      'FAA', 'https://www.faa.gov/', '14 CFR Part 121 (Air Carrier Certification)',
      'Certificate revocation + civil penalty', 0,
      /FAA Part 121|Air Carrier Certificate|FAA Type Certificate/i,
      'US air carriers must hold FAA Air Carrier Certificate and display operating authority.',
      'Display FAA certificate number + operations specifications.', 'Closes FAA exposure.'],
    ['US_FMCSA_DOT_NUMBER', 'US_FMCSA', 'transport_us_fmcsa_missing', 'US', ['transport'], 'P0',
      'FMCSA', 'https://www.fmcsa.dot.gov/', 'FMCSR + 49 CFR',
      'Operating authority suspension + civil penalty', 25000,
      /USDOT|US DOT|MC Number|FMCSA|Motor Carrier Number/i,
      'US interstate motor carriers must display USDOT number + MC Number on vehicles and on web materials.',
      'Display USDOT + MC numbers on website and on vehicles.', 'Closes FMCSA exposure.'],
    // MANUFACTURING + CONSTRUCTION
    ['UK_UKCA_PRODUCT_MARKING', 'UK_UKCA', 'mfg_uk_ukca_missing', 'UK', ['manufacturing', 'retail'], 'P1',
      'OPSS', 'https://www.gov.uk/guidance/using-the-ukca-marking', 'Product Safety Regulations 2008 + UKCA Marking',
      'Unlimited fine + product withdrawal', 0,
      /UKCA|UK Conformity Assessed|UKCA marking/i,
      'UK manufacturers must apply UKCA marking to products placed on the GB market (replacing CE for many product categories).',
      'Apply UKCA marking + display conformity assessment summary on product pages.', 'Closes OPSS exposure.'],
    ['EU_CE_MARKING', 'EU_CE', 'mfg_eu_ce_missing', 'EU', ['manufacturing', 'retail'], 'P1',
      'European Commission + Member State Authorities', 'https://single-market-economy.ec.europa.eu/single-market/ce-marking_en',
      'CE Marking + Product Liability Directive 85/374',
      'Withdrawal from market + product liability claims', 0,
      /CE marking|CE Declaration of Conformity|EU Declaration of Conformity/i,
      'Products placed on the EU market must carry CE marking + Declaration of Conformity for applicable directives.',
      'Apply CE marking + publish Declaration of Conformity.', 'Closes EU market access exposure.'],
    ['UK_CITB_CONSTRUCTION', 'UK_CITB', 'construction_uk_citb_missing', 'UK', ['construction'], 'P2',
      'CITB', 'https://www.citb.co.uk/', 'CITB Levy + CSCS Card',
      'CITB Levy demand + procurement bar', 0,
      /CITB|CSCS|Construction Skills Certification Scheme|Site Safety/i,
      'UK construction firms should display CITB registration + CSCS card status.',
      'Display CITB registration + CSCS card requirements for site workers.', 'Closes CITB + procurement exposure.'],
    // EDUCATION
    ['UK_OFSTED_REGISTRATION', 'UK_OFSTED', 'edu_uk_ofsted_missing', 'UK', ['education'], 'P0',
      'Ofsted', 'https://www.gov.uk/government/organisations/ofsted', 'Education and Inspections Act 2006',
      'Closure + criminal sanctions', 0,
      /Ofsted (?:registration|registered|inspected)|URN [0-9]+/i,
      'UK schools and childcare providers must be Ofsted registered and display URN.',
      'Display Ofsted URN + latest inspection grade.', 'Closes Ofsted exposure + parent trust.'],
    ['UK_OFS_HIGHER_ED', 'UK_OFS', 'edu_uk_ofs_missing', 'UK', ['higher-education'], 'P1',
      'Office for Students', 'https://www.officeforstudents.org.uk/', 'OfS Register + Access and Participation Plan',
      'Removal from OfS Register + degree-awarding powers loss', 0,
      /Office for Students|OfS Register|Access and Participation Plan/i,
      'UK higher education providers must be on OfS Register + publish Access and Participation Plan.',
      'Display OfS Register status + Access and Participation Plan link.', 'Closes OfS exposure.'],
    ['UAE_KHDA_DUBAI_SCHOOL', 'UAE_KHDA', 'edu_uae_khda_missing', 'AE', ['education'], 'P0',
      'KHDA', 'https://www.khda.gov.ae/', 'KHDA Dubai Schools Inspection Bureau',
      'Closure + licence revocation', 0,
      /KHDA|Knowledge and Human Development Authority/i,
      'Dubai schools must be KHDA-licensed and display KHDA rating + inspection report.', 'Display KHDA rating + DSIB inspection report link.', 'Closes KHDA exposure.',
      { city_gate: ['Dubai'] }],
    ['UAE_ADEK_ABU_DHABI_SCHOOL', 'UAE_ADEK', 'edu_uae_adek_missing', 'AE', ['education'], 'P0',
      'ADEK', 'https://www.adek.gov.ae/', 'ADEK Private School Policy and Regulations Manual',
      'Closure + licence revocation', 0,
      /ADEK|Abu Dhabi Department of Education/i,
      'Abu Dhabi schools must be ADEK-licensed and display ADEK rating.', 'Display ADEK rating + inspection report link.', 'Closes ADEK exposure.',
      { city_gate: ['Abu Dhabi'] }],
    // HOSPITALITY DETAIL
    ['UK_HOSP_LICENSING_ACT_2003', 'UK_LICENSING_ACT', 'hosp_uk_licensing_missing', 'UK', ['hospitality', 'food'], 'P1',
      'Local Licensing Authority', 'https://www.gov.uk/government/publications/revised-guidance-issued-under-section-182-of-licensing-act-2003',
      'Licensing Act 2003 (premises + personal licences)',
      'Premises licence revocation + criminal', 0,
      /Premises Licence|Personal Licence|Designated Premises Supervisor|DPS/i,
      'UK premises serving alcohol or providing late-night refreshment require a Premises Licence + DPS.',
      'Display Premises Licence number + DPS name on alcohol-serving pages.', 'Closes Licensing Act exposure.'],
    ['UK_HOSP_FOOD_INFO_2014', 'UK_FOOD_INFO_2014', 'hosp_uk_food_info_missing', 'UK', ['hospitality', 'food', 'ecommerce'], 'P1',
      'FSA + Trading Standards', 'https://www.food.gov.uk/business-guidance/allergen-guidance-for-food-businesses',
      'Food Information Regulations 2014 + Natasha\'s Law',
      'Unlimited fine + criminal under Food Safety Act 1990', 0,
      /14 allergens|allergen information|Natasha'?s Law|allergen menu/i,
      'UK hospitality businesses must provide 14 allergen information + PPDS labelling for pre-packed food (Natasha\'s Law).',
      'Publish allergen menu + PPDS labelling policy.', 'Closes FSA + Trading Standards exposure.'],
    ['UAE_HOSP_DM_FOOD_CODE', 'UAE_DM_FOOD_CODE', 'hosp_uae_dm_food_missing', 'AE', ['hospitality', 'food'], 'P1',
      'Dubai Municipality', 'https://www.dm.gov.ae/', 'Dubai Municipality Food Code',
      'Closure + fines', 0,
      /Dubai Municipality|DM Food Code|HACCP|food safety Dubai/i,
      'Dubai food businesses must comply with DM Food Code and display HACCP / food safety certification.',
      'Display Dubai Municipality food permit + HACCP certification.', 'Closes DM exposure.',
      { city_gate: ['Dubai'] }],
    // SAAS / TECH DETAIL
    ['US_SAAS_SOC2_TYPE_II', 'US_SOC2', 'saas_us_soc2_missing', 'US', ['saas', 'tech'], 'P2',
      'AICPA + customers', 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2',
      'SOC 2 Type II Audit',
      'Enterprise procurement bar', 0,
      /SOC 2|SOC2|System and Organization Controls|Trust Services Criteria/i,
      'Enterprise SaaS buyers increasingly require SOC 2 Type II reports covering Security, Availability, Confidentiality.',
      'Achieve SOC 2 Type II + publish public Security overview page.', 'Opens enterprise procurement.'],
    ['EU_SAAS_ISO_27001', 'EU_ISO_27001', 'saas_iso_27001_missing', '*', ['saas', 'tech', 'finance', 'fintech', 'healthcare'], 'P2',
      'ISO + national accreditation bodies', 'https://www.iso.org/standard/27001', 'ISO/IEC 27001:2022',
      'Procurement + enterprise sales bar', 0,
      /ISO 27001|ISO\/IEC 27001|Information Security Management System|ISMS/i,
      'ISO 27001 is the global standard for information security management. Required by most enterprise procurement and increasingly by regulators.',
      'Achieve ISO 27001 certification + publish ISMS statement of applicability summary.', 'Opens enterprise procurement.'],
    // MARKETING / AD SECTOR
    ['UK_ASA_CAP_CODE', 'UK_ASA_CAP', 'ad_uk_asa_missing', 'UK', ['marketing', 'media', 'ecommerce', 'retail'], 'P1',
      'ASA', 'https://www.asa.org.uk/codes-and-rulings/advertising-codes.html', 'CAP Code (Non-broadcast)',
      'Ad takedown + active monitoring referral', 0,
      /ASA|CAP Code|Advertising Standards Authority|Committee of Advertising Practice/i,
      'UK marketers must comply with CAP Code; ASA can require takedown and refer to Trading Standards.',
      'Publish ad compliance policy + CAP Code adherence statement.', 'Closes ASA exposure.'],
    ['UK_IPSO_PRESS', 'UK_IPSO', 'media_uk_ipso_missing', 'UK', ['media'], 'P2',
      'IPSO', 'https://www.ipso.co.uk/', 'Editors\' Code of Practice',
      'Public censure + corrections', 0,
      /IPSO|Independent Press Standards|Editors'? Code/i,
      'UK news + magazine publishers should be IPSO members and display the badge.',
      'Display IPSO membership + complaints route.', 'Closes IPSO complaints exposure.']
  ]),

  // =======================================================================
  // BATCH 4 · DEEPER PRIVACY + AML across remaining jurisdictions
  // =======================================================================
  ...batchRules([
    ['UK_DPA_ENFORCEMENT_NOTICE', 'UK_DPA_2018', 'privacy_uk_dpia_missing', 'UK', null, 'P2',
      'ICO', 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/',
      'UK GDPR Art. 35 (DPIA)',
      'ICO enforcement + civil claims', 0,
      /DPIA|Data Protection Impact Assessment|prior consultation/i,
      'High-risk processing requires a DPIA under UK GDPR Art. 35.',
      'Publish DPIA framework + completed-DPIA summaries for high-risk processing.', 'Closes ICO Art. 35 exposure.'],
    ['UK_DPO_APPOINTMENT', 'UK_GDPR_A37', 'privacy_uk_dpo_missing', 'UK', null, 'P1',
      'ICO', 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-officers/',
      'UK GDPR Art. 37-39 (DPO)',
      'ICO enforcement', 0,
      /Data Protection Officer|DPO|dpo@|dpo\./i,
      'Public authorities + firms doing large-scale systematic monitoring or processing of special category data must appoint a DPO.',
      'Appoint DPO + publish DPO contact details.', 'Closes ICO Art. 37 exposure.'],
    ['EU_DPO_APPOINTMENT', 'EU_GDPR_A37', 'privacy_eu_dpo_missing', 'EU', null, 'P1',
      'National DPAs', 'https://gdpr-info.eu/art-37-gdpr/', 'GDPR Art. 37-39 (DPO)',
      'National DPA enforcement', 0,
      /Data Protection Officer|DPO|dpo@|dpo\.|D[ée]l[ée]gu[ée]\s+[àa]\s+la\s+Protection|Datenschutzbeauftragte/i,
      'EU GDPR mandates DPO appointment for public authorities and certain private firms.',
      'Appoint DPO + publish DPO contact details.', 'Closes EU DPA Art. 37 exposure.'],
    ['EU_GDPR_RECORD_OF_PROCESSING', 'EU_GDPR_A30', 'privacy_eu_ropa_missing', 'EU', null, 'P2',
      'National DPAs', 'https://gdpr-info.eu/art-30-gdpr/', 'GDPR Art. 30 (Records of Processing)',
      'National DPA fines + investigations', 0,
      /Record of Processing Activities|ROPA|RoPA|Article 30/i,
      'Organisations with 250+ employees must maintain Records of Processing Activities.',
      'Publish ROPA summary + processor inventory.', 'Closes Art. 30 exposure.'],
    ['US_HIPAA_BAA', 'US_HIPAA_BAA', 'hc_us_hipaa_baa_missing', 'US', ['healthcare', 'saas', 'tech'], 'P0',
      'HHS OCR', 'https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html',
      'HIPAA Business Associate Agreement',
      'Per-violation civil up to $1.5M annual cap', 50000,
      /Business Associate Agreement|BAA|HIPAA BAA|HIPAA business associate/i,
      'Vendors handling PHI on behalf of Covered Entities must execute a BAA. SaaS vendors selling to healthcare must offer BAA.',
      'Publish BAA availability statement + standard BAA template.', 'Closes HHS OCR exposure.'],
    ['US_HIPAA_BREACH_NOTIFICATION', 'US_HIPAA_BREACH', 'hc_us_hipaa_breach_missing', 'US', ['healthcare'], 'P0',
      'HHS OCR', 'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html',
      'HIPAA Breach Notification Rule 45 CFR 164.400',
      'OCR civil penalty per violation + state AG suits', 40000,
      /Breach Notification|breach notification policy|HIPAA breach/i,
      'HIPAA Covered Entities must notify HHS and affected individuals of breaches affecting > 500 individuals within 60 days.',
      'Publish breach notification policy + designated Privacy Officer.', 'Closes HHS OCR exposure.'],
    ['UAE_CONSUMER_PROTECTION_2020', 'UAE_FED_CONSUMER_2006', 'ec_uae_consumer_missing', 'AE', ['ecommerce', 'retail', 'hospitality'], 'P1',
      'UAE Ministry of Economy', 'https://www.moec.gov.ae/en/consumer-protection',
      'Federal Consumer Protection Law 15/2020',
      'AED 2M per violation + closure', 400000,
      /Consumer Protection Law 15\/2020|UAE consumer protection|consumer rights UAE/i,
      'UAE Federal Consumer Protection Law 15/2020 requires clear pricing, return rights, and dispute resolution.',
      'Publish consumer charter + return policy + complaints handling per FCPL 15/2020.', 'Closes Ministry of Economy exposure.'],
    ['SG_PDPA_DNC_REGISTRY', 'SG_PDPA_DNC', 'ec_sg_dnc_missing', 'SG', null, 'P1',
      'PDPC', 'https://www.pdpc.gov.sg/Overview-of-PDPA/Do-Not-Call-Provisions/Information-for-Organisations',
      'PDPA Do Not Call Provisions',
      'SGD 200,000 per violation + class actions', 120000,
      /Do Not Call|DNC Registry|PDPA DNC|telemarketing consent/i,
      'Singapore PDPA DNC provisions require checking DNC registry before sending marketing calls / SMS.',
      'Publish DNC compliance policy + 21-day filter cycle.', 'Closes PDPC DNC exposure.'],
    ['HK_PDPO_DIRECT_MARKETING', 'HK_PDPO_DM', 'ec_hk_pdpo_dm_missing', 'HK', null, 'P1',
      'PCPD', 'https://www.pcpd.org.hk/english/data_privacy_law/ordinance_at_a_Glance/ordinance.html',
      'PDPO Cap. 486 Part VIA (Direct Marketing)',
      'HKD 500,000 + 3-yr prison', 50000,
      /PDPO Direct Marketing|direct marketing consent|opt.?out marketing HK/i,
      'PDPO Part VIA requires explicit consent before direct marketing and a free unsubscribe channel.',
      'Implement opt-in for direct marketing + free unsubscribe.', 'Closes PCPD exposure.'],
    ['IN_DPDP_NOTICE_CONSENT', 'IN_DPDP_2023', 'privacy_in_dpdp_consent_missing', 'IN', null, 'P0',
      'India Data Protection Board', 'https://www.meity.gov.in/data-protection-framework',
      'DPDP Act 2023 s.5 (Notice) + s.6 (Consent)',
      'Up to INR 250 crore per breach', 24000000,
      /DPDP|Digital Personal Data Protection|consent manager|data fiduciary notice/i,
      'DPDP Act 2023 requires clear notice + consent at collection from a Consent Manager.',
      'Publish DPDP-compliant notice + integrate with Consent Manager.', 'Closes DPB exposure.']
  ]),

  // =======================================================================
  // BATCH 5 · MORE CROSS-CUTTING + finance niche + insurance + REIT
  // =======================================================================
  ...batchRules([
    ['UK_TAX_STRATEGY_FA_2016', 'UK_TAX_STRATEGY', 'tax_uk_strategy_missing', 'UK', null, 'P2',
      'HMRC', 'https://www.gov.uk/guidance/large-businesses-publish-your-tax-strategy', 'Finance Act 2016 Sch. 19',
      'HMRC penalty + reputational', 7500,
      /Tax Strategy|publication of tax strategy|UK Tax Strategy/i,
      'Large UK businesses (turnover > £200M or balance > £2B) must publish annual UK Tax Strategy under FA 2016 Sch. 19.',
      'Publish UK Tax Strategy on website + link from sustainability page.', 'Closes HMRC + ESG investor exposure.'],
    ['UK_PAYMENT_PRACTICES_REPORTING', 'UK_PPR_2017', 'payment_uk_ppr_missing', 'UK', null, 'P2',
      'Small Business Commissioner', 'https://www.gov.uk/government/publications/business-payment-practices-and-performance-reporting-requirements',
      'Payment Practices Reporting Regulations 2017',
      'Criminal offence + Companies House sanctions', 0,
      /Payment Practices Reporting|PPR 2017|paid within 60 days|payment practices statement/i,
      'Large companies + LLPs (turnover > £36M or balance > £18M or 250+ employees) must report payment practices to suppliers semi-annually.',
      'Publish Payment Practices Statement aligned with PPR 2017.', 'Closes Small Business Commissioner exposure.'],
    ['UK_GENDER_PAY_GAP', 'UK_GENDER_PAY_GAP', 'hr_uk_gpg_missing', 'UK', null, 'P2',
      'EHRC', 'https://www.gov.uk/government/collections/gender-pay-gap-reporting', 'Equality Act 2010 (Gender Pay Gap Information) Regs 2017',
      'EHRC enforcement order + reputational', 0,
      /Gender Pay Gap|GPG report|mean gender pay gap|median gender pay gap/i,
      'Employers with 250+ employees must publish Gender Pay Gap Report annually.',
      'Publish Gender Pay Gap Report + narrative explanation.', 'Closes EHRC exposure.'],
    ['UK_DIRECTORS_REMUNERATION', 'UK_DIRECTORS_REM', 'gov_uk_directors_rem_missing', 'UK', ['finance'], 'P2',
      'BEIS + FRC', 'https://www.gov.uk/government/publications/uk-corporate-governance-code',
      'Companies Act 2006 + UK Corporate Governance Code',
      'Companies House filing reject + shareholder advisory vote', 0,
      /Directors'? Remuneration Report|DRR|UK Corporate Governance Code/i,
      'Listed UK companies must publish Directors\' Remuneration Report aligned with UK Corporate Governance Code.',
      'Publish DRR + governance compliance statement.', 'Closes UK Corporate Governance exposure.'],
    ['US_SOX_404_INTERNAL_CONTROLS', 'US_SOX_404', 'fin_us_sox_missing', 'US', ['finance'], 'P1',
      'SEC + PCAOB', 'https://www.sec.gov/rules/final/33-8238.htm', 'Sarbanes-Oxley Act s.404',
      'SEC enforcement + CEO/CFO personal liability', 0,
      /Sarbanes-Oxley|SOX 404|internal control over financial reporting|ICFR/i,
      'US-listed companies must publish management assessment of internal controls over financial reporting (ICFR).',
      'Publish SOX 404 management assessment in 10-K + auditor attestation.', 'Closes SEC + PCAOB exposure.'],
    ['US_DODD_FRANK_CONFLICT_MINERALS', 'US_DODD_FRANK_1502', 'esg_us_conflict_minerals_missing', 'US', ['manufacturing', 'retail'], 'P2',
      'SEC', 'https://www.sec.gov/page/specialized-disclosure-section', 'Dodd-Frank Act s.1502 (Conflict Minerals)',
      'SEC enforcement + investor litigation', 0,
      /Conflict Minerals|Form SD|3TG|tin tantalum tungsten gold|DRC/i,
      'US-listed manufacturers using 3TG (tin, tantalum, tungsten, gold) must file Form SD and conflict minerals report.',
      'File Form SD + publish Conflict Minerals Report.', 'Closes SEC exposure.'],
    ['EU_BATTERY_REG_2023', 'EU_BATTERY_REG', 'mfg_eu_battery_missing', 'EU', ['manufacturing', 'retail'], 'P2',
      'European Commission', 'https://eur-lex.europa.eu/eli/reg/2023/1542/oj', 'Battery Regulation 2023/1542',
      'Withdrawal from market + civil', 0,
      /Battery Regulation|battery passport|EU 2023\/1542/i,
      'EU Battery Regulation 2023 requires due diligence and battery passport for industrial + EV batteries.',
      'Publish battery passport + due diligence policy.', 'Closes EU market access exposure.'],
    ['EU_DEFORESTATION_REG_2023', 'EU_EUDR', 'esg_eu_eudr_missing', 'EU', ['retail', 'manufacturing', 'food'], 'P2',
      'European Commission', 'https://eur-lex.europa.eu/eli/reg/2023/1115/oj', 'EU Deforestation Regulation (Reg 2023/1115)',
      'Up to 4% turnover + product confiscation', 4000000,
      /EUDR|Deforestation Regulation|due diligence statement|geolocation polygons/i,
      'EU EUDR (in force Dec 2024) requires due diligence + geolocation data for cattle, cocoa, coffee, oil palm, rubber, soya, wood + derivatives placed on EU market.',
      'Publish EUDR due diligence statement + geolocation evidence framework.', 'Closes EUDR market exposure.'],
    // ARBITRATION (Aman's core LexQuity adjacency)
    ['UK_ARBITRATION_ACT_1996', 'UK_ARBITRATION', 'arbitration_uk_missing', 'UK', ['law-firms'], 'P2',
      'Commercial Court + LCIA', 'https://www.legislation.gov.uk/ukpga/1996/23/contents', 'Arbitration Act 1996',
      'Award annulment + jurisdictional challenge', 0,
      /Arbitration Act 1996|LCIA|London Court of International Arbitration/i,
      'UK arbitration practice governed by Arbitration Act 1996; LCIA institution-driven.',
      'Publish arbitration practice statement + LCIA panel adherence.', 'Closes arbitration jurisdictional risk.'],
    ['ICC_ARBITRATION_PRACTICE', 'ICC_ARBITRATION', 'arbitration_icc_missing', '*', ['law-firms'], 'P2',
      'ICC International Court of Arbitration', 'https://iccwbo.org/dispute-resolution/dispute-resolution-services/arbitration/',
      'ICC Arbitration Rules 2021',
      'Award challenge + cost exposure', 0,
      /ICC Arbitration|ICC Rules|International Chamber of Commerce arbitration/i,
      'ICC is the global gold-standard institutional arbitration provider for cross-border commercial disputes.',
      'Publish ICC panel membership + arbitration capability statement.', 'Lifts cross-border arbitration credibility.']
  ]),

  // =======================================================================
  // BATCH 6 · 80+ MORE RULES · UK detail · US state mosaic · EU member states · India · HK · SG · charities/education/transport
  // =======================================================================
  ...batchRules([
    // UK additional
    ['UK_VAT_DISPLAY', 'UK_VAT_REG', 'tax_uk_vat_missing', 'UK', null, 'P2',
      'HMRC', 'https://www.gov.uk/vat-registration', 'VAT Act 1994',
      'HMRC penalty', 5000,
      /VAT (?:Reg|Number|No)|VAT registration number|GB[0-9]{9}/i,
      'VAT-registered UK businesses must display VAT number on invoices and the website.',
      'Add VAT number to website footer.', 'Closes HMRC disclosure exposure.'],
    ['UK_CCPA_2017_CASH_DISPLAY', 'UK_CRA_2015_PRICE', 'ec_uk_price_display_missing', 'UK', ['ecommerce', 'retail'], 'P2',
      'Trading Standards', 'https://www.gov.uk/government/publications/price-marking-order-2004', 'Price Marking Order 2004',
      'Trading Standards enforcement', 5000,
      /price (?:inclusive|including) (?:of )?VAT|unit price|kg|litre/i,
      'UK Price Marking Order 2004 requires VAT-inclusive prices + unit prices for relevant pre-packed goods.',
      'Display VAT-inclusive prices + unit prices on every product card.', 'Closes Price Marking exposure.'],
    ['UK_AGE_VERIFICATION_2023', 'UK_OSA_2023_AV', 'osa_uk_age_verification_missing', 'UK', ['ecommerce', 'media'], 'P1',
      'Ofcom', 'https://www.ofcom.org.uk/online-safety', 'OSA 2023 Pt 5 (Adult content)',
      'Up to £18M or 10% turnover', 18000000,
      /highly effective age (?:assurance|verification)|age verification HEAA|age estimation/i,
      'OSA 2023 requires highly effective age assurance for services hosting adult content.',
      'Publish HEAA age assurance method (e.g. ID verification, age estimation).', 'Closes Ofcom OSA Pt 5 exposure.'],
    ['UK_FCA_VULNERABLE_CUSTOMERS', 'UK_FCA_VC_2021', 'fin_uk_vulnerable_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P1',
      'FCA', 'https://www.fca.org.uk/firms/treating-vulnerable-consumers-fairly', 'FCA FG21/1 (Vulnerable Customers)',
      'FCA enforcement + Consumer Duty failure', 0,
      /vulnerable customers? policy|vulnerable consumer guide|FG21\/1/i,
      'FCA FG21/1 requires firms to identify and support vulnerable customers.',
      'Publish vulnerable customer policy + identification framework.', 'Closes FCA + Consumer Duty exposure.'],
    ['UK_SENIOR_MANAGERS_FIT_PROPER', 'UK_FIT_PROPER', 'gov_uk_fitness_propriety_missing', 'UK', ['finance', 'insurance'], 'P1',
      'FCA + PRA', 'https://www.handbook.fca.org.uk/handbook/FIT/', 'FIT (Fit and Proper Test)',
      'Individual prohibition + firm enforcement', 0,
      /Fit and Proper|FIT 2|conduct rules|certification regime/i,
      'Senior Manager Functions must satisfy FIT (honesty, competence, financial soundness).',
      'Publish certification regime summary + governance accountabilities.', 'Closes FCA + PRA FIT exposure.'],
    ['UK_OPERATIONAL_RESILIENCE', 'UK_OP_RES_2022', 'fin_uk_op_res_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P1',
      'FCA + PRA', 'https://www.fca.org.uk/publications/policy-statements/ps21-3-building-operational-resilience',
      'PS21/3 (Operational Resilience)',
      'FCA enforcement + s166', 0,
      /Operational Resilience|important business service|impact tolerance/i,
      'PS21/3 requires firms to identify Important Business Services + impact tolerances + scenario testing by March 2025.',
      'Publish Operational Resilience framework + IBS list + impact tolerances.', 'Closes PS21/3 exposure.'],
    ['UK_PRA_REMUNERATION_CODE', 'UK_PRA_REM', 'fin_uk_prarem_missing', 'UK', ['finance'], 'P2',
      'PRA', 'https://www.bankofengland.co.uk/prudential-regulation/publication/2015/strengthening-individual-accountability-in-banking',
      'PRA Remuneration Code',
      'Capital add-ons + governance enforcement', 0,
      /Remuneration Code|Material Risk Taker|MRT|Identified Staff/i,
      'PRA Remuneration Code applies bonus deferral + clawback to Material Risk Takers.',
      'Publish Remuneration Code statement + MRT list summary.', 'Closes PRA Remuneration exposure.'],
    ['UK_FCA_APPOINTED_REPRESENTATIVE', 'UK_AR_PS22_11', 'fin_uk_ar_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P1',
      'FCA', 'https://www.fca.org.uk/publications/policy-statements/ps22-11-improving-appointed-representatives-regime',
      'PS22/11 (Appointed Representatives Regime)',
      'FCA enforcement on principal firm', 0,
      /Appointed Representative|AR regime|principal firm|introducer appointed representative/i,
      'PS22/11 sets tighter oversight requirements on principal firms with Appointed Representatives.',
      'Publish AR oversight framework + AR list.', 'Closes FCA AR exposure.'],
    // US state mosaic completion
    ['US_OREGON_OCPA', 'US_OCPA', 'privacy_us_ocpa_missing', 'US', ['ecommerce', 'retail', 'saas', 'tech'], 'P2',
      'Oregon Attorney General', 'https://www.doj.state.or.us/consumer-protection/privacy-and-data/',
      'Oregon Consumer Privacy Act',
      'Civil penalty up to $7,500', 7500,
      /Oregon Consumer Privacy|OCPA/i,
      'Oregon CPA (in force July 2024) grants similar rights to CPRA.',
      'Publish OR-specific privacy notice + opt-out.', 'Closes Oregon AG exposure.'],
    ['US_MARYLAND_MDPA', 'US_MDPA', 'privacy_us_mdpa_missing', 'US', ['ecommerce', 'retail', 'saas'], 'P2',
      'Maryland Attorney General', 'https://www.marylandattorneygeneral.gov/Pages/CPD/default.aspx',
      'Maryland Online Data Privacy Act',
      'Civil penalty up to $10k per violation', 10000,
      /Maryland Online Data Privacy|MDPA|MD privacy/i,
      'MDPA (effective Oct 2025) gives Maryland residents privacy rights similar to CPRA.',
      'Publish MD-specific privacy notice.', 'Closes Maryland AG exposure.'],
    ['US_CALIFORNIA_CCPA_DNSI', 'US_CCPA_DNSI', 'privacy_us_ccpa_dnsi_missing', 'US', ['ecommerce', 'retail', 'saas'], 'P0',
      'California Attorney General + CPPA', 'https://oag.ca.gov/privacy/ccpa', 'CCPA Do Not Sell or Share My Personal Information',
      '$2,500 per violation + $7,500 for intentional', 7500,
      /Do Not Sell|Do Not Sell or Share|DNSMPI|opt out of sale/i,
      'California businesses processing personal information must display "Do Not Sell or Share" link.',
      'Add "Do Not Sell or Share My Personal Information" link to footer.', 'Closes CCPA + CPPA exposure.'],
    ['US_FTC_SAFEGUARDS_RULE', 'US_FTC_SAFEGUARDS', 'fin_us_safeguards_missing', 'US', ['finance', 'fintech'], 'P0',
      'FTC', 'https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know',
      'FTC Safeguards Rule (16 CFR Part 314)',
      'FTC civil penalty', 50000,
      /Safeguards Rule|Information Security Program|Qualified Individual|FTC 314/i,
      'FTC Safeguards Rule requires non-bank financial institutions to maintain comprehensive Information Security Program with Qualified Individual.',
      'Publish FTC Safeguards-compliant Information Security Program summary.', 'Closes FTC exposure.'],
    ['US_FCC_NET_NEUTRALITY', 'US_FCC_BIAS', 'fcc_us_bias_missing', 'US', ['saas', 'tech', 'media'], 'P2',
      'FCC', 'https://www.fcc.gov/openinternet',
      'Restoring Open Internet Order 2024',
      'FCC enforcement', 0,
      /Net Neutrality|Open Internet|broadband internet access service/i,
      'FCC 2024 Order restored net neutrality classifying BIAS as Title II service.',
      'Publish Net Neutrality transparency statement if BIAS provider.', 'Closes FCC exposure.'],
    // EU member states
    ['FR_CNIL_RGPD', 'FR_CNIL_RGPD', 'privacy_fr_cnil_missing', 'FR', null, 'P0',
      'CNIL', 'https://www.cnil.fr/', 'Loi Informatique et Libertés + RGPD',
      'CNIL up to €20M or 4% turnover', 20000000,
      /CNIL|Commission Nationale de l'Informatique|d[ée]l[ée]gu[ée] [àa] la protection|RGPD/i,
      'France CNIL enforces RGPD + national specifications including 2025 cookie guidelines.',
      'Publish CNIL-aligned RGPD notice + DPO contact + cookie banner with French-language UI.', 'Closes CNIL exposure.'],
    ['FR_LOI_VIGILANCE_2017', 'FR_VIGILANCE', 'esg_fr_vigilance_missing', 'FR', null, 'P1',
      'French civil courts', 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000034290626/', 'Loi sur le devoir de vigilance',
      'Up to €10M + civil liability', 10000000,
      /Plan de Vigilance|Loi 2017-399|duty of vigilance France/i,
      'French Loi Vigilance applies to large parent companies (5,000+ FR employees / 10,000+ global) requiring annual vigilance plan.',
      'Publish annual Plan de Vigilance covering human rights + environment.', 'Closes French civil liability exposure.'],
    ['DE_BDSG_GERMANY', 'DE_BDSG', 'privacy_de_bdsg_missing', 'DE', null, 'P0',
      'BfDI + Landesdatenschutzbehörden', 'https://www.bfdi.bund.de/', 'BDSG (Bundesdatenschutzgesetz)',
      'BfDI up to €20M or 4% turnover', 20000000,
      /Datenschutzerkl[äa]rung|BfDI|Datenschutzbeauftragte|BDSG|Bundesdatenschutzgesetz/i,
      'Germany BDSG + GDPR with strict national requirements including employee data protection.',
      'Publish BDSG-aligned Datenschutzerklärung + Datenschutzbeauftragte contact.', 'Closes BfDI exposure.'],
    ['DE_LIEFERKETTENGESETZ', 'DE_LKSG', 'esg_de_lksg_missing', 'DE', null, 'P1',
      'BAFA', 'https://www.bafa.de/EN/Supply_Chain_Act/supply_chain_act_node.html', 'Lieferkettensorgfaltspflichtengesetz (LkSG)',
      'Up to €8M or 2% global turnover', 8000000,
      /Lieferkettensorgfaltspflichten|LkSG|supply chain due diligence Germany|Lieferkettengesetz/i,
      'German LkSG (effective 2023 for 3000+ employees, 2024 for 1000+) requires human rights + environmental due diligence in supply chains.',
      'Publish LkSG policy statement + annual report to BAFA.', 'Closes BAFA enforcement exposure.'],
    ['IT_GARANTE_PRIVACY', 'IT_GARANTE', 'privacy_it_garante_missing', 'IT', null, 'P0',
      'Garante per la protezione dei dati personali', 'https://www.garanteprivacy.it/',
      'Codice Privacy + GDPR',
      'Garante up to €20M or 4% turnover', 20000000,
      /Garante|informativa privacy|Codice Privacy|RPD/i,
      'Italy Garante enforces Codice Privacy + GDPR + national specifications.',
      'Publish Italian-language informativa privacy + RPD contact.', 'Closes Garante exposure.'],
    ['ES_AEPD_LOPDGDD', 'ES_AEPD', 'privacy_es_aepd_missing', 'ES', null, 'P0',
      'AEPD', 'https://www.aepd.es/', 'LOPDGDD + RGPD',
      'AEPD up to €20M or 4% turnover', 20000000,
      /AEPD|Agencia Espa[ñn]ola|LOPDGDD|pol[ií]tica de privacidad/i,
      'Spain AEPD enforces LOPDGDD + GDPR + national specifications including digital rights.',
      'Publish AEPD-aligned política de privacidad + DPD contact.', 'Closes AEPD exposure.'],
    ['NL_AP_DUTCH', 'NL_AP', 'privacy_nl_ap_missing', 'NL', null, 'P0',
      'Autoriteit Persoonsgegevens', 'https://www.autoriteitpersoonsgegevens.nl/',
      'Uitvoeringswet AVG + AVG',
      'AP up to €20M or 4% turnover', 20000000,
      /Autoriteit Persoonsgegevens|privacyverklaring|FG functionaris/i,
      'Netherlands AP enforces AVG + Uitvoeringswet AVG.',
      'Publish Dutch-language privacyverklaring + FG contact.', 'Closes AP exposure.'],
    ['IE_DPC_IRELAND', 'IE_DPC', 'privacy_ie_dpc_missing', 'IE', null, 'P0',
      'Data Protection Commission', 'https://www.dataprotection.ie/',
      'Data Protection Act 2018 + GDPR',
      'DPC up to €20M or 4% turnover', 20000000,
      /Data Protection Commission|DPC Ireland|Irish Data Protection/i,
      'Ireland DPC is the lead supervisory authority for many US tech firms with EU HQ in Dublin.',
      'Publish DPC-aligned privacy notice + DPO contact.', 'Closes DPC exposure.'],
    // UAE additional
    ['UAE_DCRR_2024', 'UAE_DCRR', 'cyber_uae_dcrr_missing', 'AE', ['saas', 'tech', 'finance', 'fintech'], 'P1',
      'TDRA + Central Bank', 'https://tdra.gov.ae/', 'Digital Cybersecurity Regulatory Requirements',
      'TDRA + sector regulator enforcement', 0,
      /DCRR|Digital Cybersecurity Regulatory Requirements/i,
      'UAE DCRR sets baseline cybersecurity controls for designated entities.',
      'Publish DCRR compliance summary.', 'Closes TDRA exposure.'],
    ['UAE_FED_LABOUR_LAW', 'UAE_FED_LABOUR', 'hr_uae_labour_missing', 'AE', null, 'P2',
      'MOHRE', 'https://www.mohre.gov.ae/', 'Federal Decree-Law 33/2021 (Labour Law)',
      'MOHRE fines + WPS suspension', 0,
      /MOHRE|Ministry of Human Resources|UAE Labour Law|Federal Decree-Law 33\/2021|WPS/i,
      'UAE Labour Law 33/2021 governs employment rights including WPS (Wage Protection System).',
      'Publish MOHRE compliance statement + WPS adherence.', 'Closes MOHRE exposure.'],
    ['UAE_GOLDEN_VISA_INCENTIVE', 'UAE_GV', 'hr_uae_gv_missing', 'AE', null, 'P2',
      'GDRFA + ICA', 'https://u.ae/en/information-and-services/visa-and-emirates-id/golden-visa', 'Golden Visa Federal Decree',
      'No direct fine', 0,
      /Golden Visa|10.?year visa|Federal Decree-Law 29\/2021/i,
      'UAE Golden Visa incentive applies to investors, founders, specialists. Optional disclosure but lifts talent attraction.',
      'Highlight Golden Visa eligibility for senior hires.', 'Talent attraction signal.'],
    // Saudi additional
    ['SA_NITAQAT_SAUDIZATION', 'SA_NITAQAT', 'hr_sa_nitaqat_missing', 'SA', null, 'P1',
      'MHRSD + GAZT', 'https://www.hrsd.gov.sa/en/services/nitaqat', 'Nitaqat (Saudization)',
      'MHRSD penalties + visa restrictions', 0,
      /Nitaqat|نطاقات|Saudization rate|Platinum Nitaqat|Green Nitaqat/i,
      'Saudi Nitaqat program classifies firms (Platinum/Green/Yellow/Red) by Saudi national employment rate.',
      'Publish Nitaqat status + Saudization rate.', 'Closes MHRSD exposure + talent attraction.'],
    ['SA_VISION_2030_LOCAL_CONTENT', 'SA_VISION_2030_LC', 'esg_sa_local_content_missing', 'SA', null, 'P2',
      'Local Content and Government Procurement Authority', 'https://www.lcgpa.gov.sa/',
      'Local Content (LC) Requirements',
      'Procurement bar + bid disadvantage', 0,
      /Local Content|LCGPA|Vision 2030 local content|Saudi Made/i,
      'Saudi Vision 2030 prioritises local content; LCGPA score affects government procurement weighting.',
      'Publish LC score + Saudi Made certification if applicable.', 'Opens Saudi government procurement.'],
    // Singapore additional
    ['SG_CCCS_FAIR_TRADING', 'SG_CCCS', 'ec_sg_cccs_missing', 'SG', ['ecommerce', 'retail', 'marketing'], 'P1',
      'CCCS', 'https://www.cccs.gov.sg/', 'Competition Act + CPFTA',
      'SGD 1M per violation', 600000,
      /CCCS|Competition and Consumer Commission Singapore|CPFTA|unfair practice Singapore/i,
      'CCCS enforces both competition + consumer protection including price guarantee + drip pricing.',
      'Publish CPFTA-aligned consumer notice + complaints handling.', 'Closes CCCS exposure.'],
    ['SG_GENDER_EQUALITY_LAW', 'SG_WSG_TWG', 'hr_sg_gender_missing', 'SG', null, 'P2',
      'TAFEP + Workplace Fairness Tribunal', 'https://www.tafep.sg/',
      'Tripartite Guidelines on Fair Employment',
      'TAFEP enforcement + tribunal exposure', 0,
      /TAFEP|Tripartite Alliance for Fair|workplace fairness|Singapore fair employment/i,
      'Singapore Workplace Fairness Legislation (in passage 2025) + TAFEP guidelines mandate fair employment practices.',
      'Publish TAFEP-aligned fair employment policy.', 'Closes TAFEP exposure.'],
    // India additional
    ['IN_COMPANIES_ACT_CIN', 'IN_COMPANIES_2013', 'company_in_cin_missing', 'IN', null, 'P1',
      'Ministry of Corporate Affairs', 'https://www.mca.gov.in/', 'Companies Act 2013 s.12',
      'INR 1,000 per day + director liability', 100000,
      /CIN|Corporate Identification Number|company registration India|U[0-9]{5}[A-Z]{2}/i,
      'Indian companies must display CIN on official documents and website per s.12 Companies Act 2013.',
      'Display CIN in website footer.', 'Closes MCA exposure.'],
    ['IN_CSR_SCHEDULE_VII', 'IN_CSR', 'esg_in_csr_missing', 'IN', null, 'P1',
      'Ministry of Corporate Affairs', 'https://www.mca.gov.in/MinistryV2/csr.html',
      'Companies Act 2013 s.135 + Schedule VII (CSR)',
      'MCA enforcement + class actions', 0,
      /Corporate Social Responsibility India|CSR Policy|Schedule VII|2%.*CSR/i,
      'Indian companies with net worth ≥ ₹500 crore / turnover ≥ ₹1000 crore / net profit ≥ ₹5 crore must spend 2% of avg net profit on CSR.',
      'Publish CSR Policy + Annual Report on CSR.', 'Closes MCA CSR exposure.'],
    ['IN_DPDP_DATA_PRINCIPAL_RIGHTS', 'IN_DPDP_RIGHTS', 'privacy_in_dpdp_rights_missing', 'IN', null, 'P1',
      'India Data Protection Board', 'https://www.meity.gov.in/data-protection-framework',
      'DPDP Act 2023 s.11-15 (Rights)',
      'Up to INR 250 crore per breach', 24000000,
      /Data Principal Rights|right to access|right to correction|right to erasure|right to grievance redressal/i,
      'DPDP grants Data Principals rights of access, correction, erasure, grievance redressal.',
      'Publish DPDP rights notice + grievance officer + Consent Manager flow.', 'Closes DPB exposure.'],
    ['IN_IT_RULES_2021_GRIEVANCE', 'IN_IT_RULES_2021_GO', 'cyber_in_grievance_officer_missing', 'IN', ['saas', 'tech', 'media', 'ecommerce'], 'P1',
      'MeitY', 'https://www.meity.gov.in/content/notification-dated-25th-february-2021-gsr-139e-information-technology-intermediary',
      'IT Rules 2021 Rule 3 (Grievance Officer)',
      'Loss of intermediary safe harbour', 0,
      /Grievance Officer|grievance@|Resident Grievance Officer|Chief Compliance Officer/i,
      'IT Rules 2021 require intermediaries to publish a Grievance Officer + Resident Grievance Officer (significant intermediaries).',
      'Publish Grievance Officer + RGO contact + acknowledgement timeline.', 'Preserves intermediary safe harbour.'],
    // HK additional
    ['HK_STAMP_DUTY_RE', 'HK_STAMP_DUTY', 're_hk_stamp_missing', 'HK', ['real-estate'], 'P2',
      'IRD Hong Kong', 'https://www.ird.gov.hk/eng/tax/sd_index.htm', 'Stamp Duty Ordinance Cap. 117',
      'IRD penalty + late payment', 0,
      /Stamp Duty Ordinance|HK stamp duty|AVD ad valorem|BSD buyer.?s stamp/i,
      'HK property transactions require AVD (ad valorem duty) + BSD (Buyer\'s Stamp Duty) + SSD (Special Stamp Duty).',
      'Publish HK stamp duty calculator + disclosure.', 'Closes IRD exposure.'],
    ['HK_INLAND_REVENUE_BR', 'HK_BR', 'company_hk_br_missing', 'HK', null, 'P1',
      'IRD Hong Kong', 'https://www.ird.gov.hk/eng/tax/bre.htm', 'Business Registration Ordinance Cap. 310',
      'HKD 5,000 per missing registration', 5000,
      /Business Registration|BR Certificate|HK BR No/i,
      'HK businesses must hold valid BR Certificate and display BR number.',
      'Display HK BR number in website footer.', 'Closes IRD BR exposure.'],
    ['HK_COMPETITION_ORDINANCE', 'HK_COMP_ORD', 'comp_hk_competition_missing', 'HK', null, 'P2',
      'Competition Commission HK', 'https://www.compcomm.hk/', 'Competition Ordinance Cap. 619',
      'Tribunal up to 10% turnover', 0,
      /Competition Ordinance|Competition Commission Hong Kong|First Conduct Rule|Second Conduct Rule/i,
      'HK Competition Ordinance prohibits anti-competitive agreements + abuse of substantial market power.',
      'Publish competition compliance policy + employee training reference.', 'Closes Competition Commission exposure.'],
    // Charity additional jurisdictions
    ['US_IRS_501C3', 'US_501C3', 'charity_us_501c3_missing', 'US', ['charity'], 'P0',
      'IRS + state AGs', 'https://www.irs.gov/charities-non-profits',
      'IRC 501(c)(3) + state charitable registration',
      'Loss of tax-exempt status + state enforcement', 0,
      /501\(c\)\(3\)|tax.?exempt status|IRS Form 990|state charity registration/i,
      'US charities must maintain 501(c)(3) status + register in states for fundraising.',
      'Publish 501(c)(3) determination letter + state charity registrations.', 'Closes IRS + state AG exposure.'],
    ['SG_COC_CHARITY', 'SG_COC', 'charity_sg_coc_missing', 'SG', ['charity'], 'P1',
      'Commissioner of Charities', 'https://www.charities.gov.sg/',
      'Charities Act',
      'COC enforcement + deregistration', 0,
      /Commissioner of Charities|IPC status|Code of Governance for Charities/i,
      'Singapore charities must register with COC + IPC status for tax-deductible donations.',
      'Display COC registration + IPC status.', 'Closes COC exposure.'],
    ['UAE_ICA_CHARITY', 'UAE_ICA_CHARITY', 'charity_uae_ica_missing', 'AE', ['charity'], 'P1',
      'Islamic Affairs + MoCD', 'https://www.icp.gov.ae/',
      'UAE Charitable Work Law',
      'ICA enforcement + closure', 0,
      /ICA|Islamic Affairs|Ministry of Community Development|charity licence UAE/i,
      'UAE charities require licensing from Islamic Affairs (Awqaf) or MoCD.',
      'Display licence + reporting compliance.', 'Closes ICA / MoCD exposure.'],
    // Education additional
    ['US_TITLE_IX', 'US_TITLE_IX', 'edu_us_title_ix_missing', 'US', ['education', 'higher-education'], 'P0',
      'US Department of Education OCR', 'https://www2.ed.gov/about/offices/list/ocr/docs/tix_dis.html',
      'Title IX of Education Amendments 1972',
      'Loss of federal funding', 0,
      /Title IX|sex.?based discrimination|Title IX Coordinator/i,
      'Federally funded education programs must comply with Title IX (sex discrimination) + designate Title IX Coordinator.',
      'Publish Title IX policy + Coordinator contact.', 'Closes ED OCR exposure.'],
    ['UK_HE_TEF_GOLD', 'UK_HE_TEF', 'edu_uk_tef_missing', 'UK', ['higher-education'], 'P2',
      'Office for Students', 'https://www.officeforstudents.org.uk/advice-and-guidance/teaching/about-the-teaching-excellence-framework-tef/',
      'Teaching Excellence Framework',
      'Reputational + recruitment exposure', 0,
      /Teaching Excellence Framework|TEF Gold|TEF Silver|TEF Bronze/i,
      'UK Higher Education Providers receive TEF Gold/Silver/Bronze ratings affecting recruitment.',
      'Display TEF rating prominently.', 'Recruitment + reputation signal.'],
    // Transport additional
    ['EU_FAA_MAINTENANCE', 'EU_EASA', 'transport_eu_easa_missing', 'EU', ['aviation', 'transport'], 'P0',
      'EASA', 'https://www.easa.europa.eu/', 'EASA Part-145',
      'AOC suspension + safety enforcement', 0,
      /EASA Part.?145|Air Operator Certificate|EU.OPS|EASA approved/i,
      'EU aviation operators + maintenance organisations need EASA approvals.',
      'Display EASA approval reference + AOC.', 'Closes EASA exposure.'],
    // Insurance additional
    ['UK_INSURANCE_DISTRIBUTION_DIRECTIVE', 'UK_IDD', 'insurance_uk_idd_missing', 'UK', ['insurance'], 'P1',
      'FCA', 'https://www.handbook.fca.org.uk/handbook/ICOBS/4/', 'IDD (Insurance Distribution Directive)',
      'FCA enforcement', 0,
      /Insurance Distribution|IDD|IPID|Insurance Product Information Document/i,
      'IDD requires IPID for non-life insurance products + demands and needs assessment.',
      'Publish IPID for every insurance product + demands and needs framework.', 'Closes IDD exposure.'],
    ['EU_SOLVENCY_II', 'EU_SOLVENCY_II', 'insurance_eu_solvency_missing', 'EU', ['insurance'], 'P0',
      'EIOPA + NCAs', 'https://www.eiopa.europa.eu/browse/solvency-ii_en', 'Solvency II Directive 2009/138',
      'Capital add-ons + licence action', 0,
      /Solvency II|SCR|Solvency Capital Requirement|MCR|Minimum Capital Requirement/i,
      'EU insurers must publish Solvency and Financial Condition Report annually + maintain SCR/MCR.',
      'Publish SFCR annually + capital position summary.', 'Closes EIOPA + NCA exposure.'],
    // SaaS / tech
    ['US_HIPAA_HITECH_SAAS', 'US_HITECH', 'hc_us_hitech_missing', 'US', ['saas', 'tech'], 'P1',
      'HHS OCR', 'https://www.hhs.gov/hipaa/for-professionals/special-topics/hitech-act-enforcement-interim-final-rule/index.html',
      'HITECH Act',
      'OCR civil up to $1.5M annual cap', 50000,
      /HITECH|breach notification|encryption at rest|encryption in transit/i,
      'HITECH Act strengthens HIPAA enforcement + requires encryption + breach notification by Business Associates.',
      'Publish HITECH-compliant encryption + breach notification statement.', 'Closes OCR HITECH exposure.'],
    // Sustainability + climate additional
    ['UK_TCFD_PREMIUM_LIST', 'UK_TCFD_PL', 'esg_uk_tcfd_pl_missing', 'UK', ['finance', 'manufacturing'], 'P2',
      'FCA + FRC', 'https://www.fca.org.uk/publication/policy/ps20-17.pdf', 'FCA LR 9.8.6R (Climate-related Disclosures)',
      'FCA listing penalty + investor exposure', 0,
      /TCFD aligned|Task Force on Climate-related|premium listed/i,
      'UK premium-listed companies must publish TCFD-aligned disclosures comply-or-explain.',
      'Publish TCFD-aligned disclosure + climate scenario analysis.', 'Closes FCA listing exposure.'],
    ['EU_TAXONOMY_ART_8', 'EU_TAXONOMY', 'esg_eu_taxonomy_missing', 'EU', ['finance', 'fintech'], 'P1',
      'European Commission', 'https://eur-lex.europa.eu/eli/reg/2020/852/oj', 'EU Taxonomy Regulation 2020/852',
      'Investor exposure + greenwashing claims', 0,
      /EU Taxonomy|Article 8 Taxonomy|environmentally sustainable activity/i,
      'EU Taxonomy Regulation Art. 8 requires CSRD entities to disclose taxonomy-aligned activities.',
      'Publish Taxonomy-aligned KPIs in management report.', 'Closes EC + greenwashing exposure.'],
    // Whistleblowing extensions
    ['US_SOX_806_WHISTLEBLOWER', 'US_SOX_806', 'whistleblowing_us_sox_missing', 'US', ['finance'], 'P1',
      'SEC + OSHA', 'https://www.whistleblowers.gov/whistleblower_acts-desk_aid', 'Sarbanes-Oxley s.806 (Whistleblower)',
      'Reinstatement + back pay + special damages', 0,
      /SOX whistleblower|Sarbanes-Oxley whistleblower|protected disclosure/i,
      'SOX 806 protects public-company employees who report fraud against retaliation.',
      'Publish SOX whistleblower policy + OSHA referral route.', 'Closes SEC + OSHA exposure.'],
    ['US_DODD_FRANK_WHISTLEBLOWER', 'US_DFR_WB', 'whistleblowing_us_dfr_missing', 'US', ['finance'], 'P2',
      'SEC', 'https://www.sec.gov/whistleblower', 'Dodd-Frank Whistleblower (15 USC 78u-6)',
      'SEC retaliation enforcement + tribunal', 0,
      /SEC whistleblower|TCR|tip complaint referral|whistleblower reward/i,
      'Dodd-Frank establishes SEC whistleblower program with monetary awards + anti-retaliation protections.',
      'Publish whistleblower policy referencing SEC TCR system.', 'Closes SEC + anti-retaliation exposure.'],
    // Cross-cutting deeper
    ['UK_COMPANY_TURNOVER_PSC', 'UK_PSC', 'gov_uk_psc_missing', 'UK', null, 'P2',
      'Companies House', 'https://www.gov.uk/government/publications/guidance-to-the-people-with-significant-control-requirements-for-companies-and-limited-liability-partnerships',
      'PSC Register (People with Significant Control)',
      'Criminal offence + £500-£5,000 fine', 5000,
      /PSC Register|People with Significant Control|PSC1 form/i,
      'UK companies must maintain PSC Register identifying beneficial owners.',
      'Publish beneficial ownership statement aligned with PSC Register.', 'Closes Companies House exposure.'],
    ['GLOBAL_GLOBAL_REPORTING_INITIATIVE', 'GRI_STANDARDS', 'esg_gri_missing', '*', null, 'P2',
      'Global Reporting Initiative', 'https://www.globalreporting.org/', 'GRI Standards (2021)',
      'Procurement + investor exposure', 0,
      /GRI Standards|GRI Universal|sustainability report aligned with GRI/i,
      'GRI is the most widely adopted sustainability reporting framework globally.',
      'Publish GRI-aligned sustainability report.', 'Lifts investor + procurement signal.'],
    ['GLOBAL_TCFD_TASK_FORCE', 'TCFD_GLOBAL', 'esg_global_tcfd_missing', '*', ['finance', 'fintech', 'insurance'], 'P2',
      'IFRS Foundation (post 2023)', 'https://www.fsb-tcfd.org/', 'TCFD Recommendations (now ISSB)',
      'Investor exposure', 0,
      /TCFD|Task Force on Climate-related Financial|ISSB|IFRS S1 S2/i,
      'TCFD recommendations (now under ISSB IFRS S1/S2) are the global baseline for climate-related financial disclosure.',
      'Publish ISSB-aligned climate disclosure.', 'Lifts global investor signal.'],
    ['GLOBAL_CDP_DISCLOSURE', 'CDP_DISCLOSURE', 'esg_cdp_missing', '*', null, 'P2',
      'CDP (formerly Carbon Disclosure Project)', 'https://www.cdp.net/',
      'CDP Climate + Water + Forests Questionnaires',
      'Investor + procurement scoring exposure', 0,
      /CDP|Carbon Disclosure|CDP A list|CDP score/i,
      'CDP is the largest environmental disclosure platform; investors and procurement teams use CDP scores.',
      'Disclose to CDP Climate Change + score in sustainability report.', 'Lifts investor signal.']
  ]),

  // =============================================================================
  // BATCH 7 · GLOBAL PRIVACY MOSAIC + SANCTIONS + MODERN SLAVERY + NIS2 + ESG DEEP
  // =============================================================================
  ...batchRules([
    // ---- US ADDITIONAL STATE PRIVACY (post-CCPA wave) ----
    ['US_NJ_DATA_PRIVACY_ACT', 'NJ_DPA_2024', 'us_nj_privacy_missing', 'US', null, 'P1',
      'NJ Attorney General · Division of Consumer Affairs', 'https://www.njoag.gov/',
      'New Jersey Data Privacy Act (S332) · effective Jan 2025',
      'Up to $10,000 per violation', 10000,
      /New Jersey Data Privacy Act|NJ DPA|NJ privacy rights/i,
      'NJ Data Privacy Act applies to controllers processing 100,000+ NJ residents or 25,000 + 25% revenue from sale.',
      'Add NJ residents to privacy notice + opt-out mechanism.', 'Adds NJ to multi-state privacy posture.'],
    ['US_CT_DATA_PRIVACY_ACT', 'CT_DPA_2023', 'us_ct_privacy_missing', 'US', null, 'P1',
      'Connecticut Attorney General', 'https://portal.ct.gov/AG',
      'Connecticut Data Privacy Act (CTDPA) · effective Jul 2023',
      'Up to $5,000 per violation', 5000,
      /Connecticut Data Privacy Act|CTDPA|CT privacy rights/i,
      'CTDPA applies to controllers processing 100,000+ CT consumers or 25,000+ with 25% revenue from sale.',
      'Add CT residents to privacy notice + UOOM signal honoring.', 'Adds CT to multi-state privacy posture.'],
    ['US_UT_CONSUMER_PRIVACY_ACT', 'UT_UCPA_2023', 'us_ut_privacy_missing', 'US', null, 'P2',
      'Utah Attorney General · Division of Consumer Protection', 'https://attorneygeneral.utah.gov/',
      'Utah Consumer Privacy Act (UCPA) · effective Dec 2023',
      'Up to $7,500 per violation', 7500,
      /Utah Consumer Privacy Act|UCPA|UT privacy rights/i,
      'UCPA applies to entities with $25M+ revenue processing 100,000+ Utah consumers.',
      'Add UT residents to privacy notice with opt-out for sale + targeted ads.', 'Adds UT to multi-state privacy posture.'],
    ['US_IA_CONSUMER_DATA_PROTECTION_ACT', 'IA_CDPA_2025', 'us_ia_privacy_missing', 'US', null, 'P2',
      'Iowa Attorney General', 'https://www.iowaattorneygeneral.gov/',
      'Iowa Consumer Data Protection Act (SF262) · effective Jan 2025',
      'Up to $7,500 per violation', 7500,
      /Iowa Consumer Data Protection Act|Iowa CDPA|IA privacy rights/i,
      'Iowa CDPA applies to controllers processing 100,000+ Iowa consumers.',
      'Add IA residents to privacy notice with sensitive-data opt-in.', 'Adds IA to multi-state privacy posture.'],
    ['US_TN_INFORMATION_PROTECTION_ACT', 'TN_TIPA_2025', 'us_tn_privacy_missing', 'US', null, 'P2',
      'Tennessee Attorney General', 'https://www.tn.gov/attorneygeneral.html',
      'Tennessee Information Protection Act (TIPA) · effective Jul 2025',
      'Up to $7,500 per violation', 7500,
      /Tennessee Information Protection Act|TIPA|TN privacy rights/i,
      'TIPA applies to controllers exceeding $25M revenue processing 175,000+ TN consumers.',
      'Add TN residents to privacy notice with NIST Privacy Framework alignment.', 'Adds TN to multi-state privacy posture.'],
    ['US_DE_PERSONAL_DATA_PRIVACY_ACT', 'DE_DPDPA_2025', 'us_de_privacy_missing', 'US', null, 'P2',
      'Delaware Attorney General', 'https://attorneygeneral.delaware.gov/',
      'Delaware Personal Data Privacy Act · effective Jan 2025',
      'Up to $10,000 per violation', 10000,
      /Delaware Personal Data Privacy Act|DPDPA|DE privacy rights/i,
      'Delaware PDPA applies to controllers processing 35,000+ DE consumers.',
      'Add DE residents to privacy notice with sensitive-data opt-in.', 'Adds DE to multi-state privacy posture.'],
    ['US_MT_CONSUMER_DATA_PRIVACY_ACT', 'MT_MCDPA_2024', 'us_mt_privacy_missing', 'US', null, 'P2',
      'Montana Department of Justice', 'https://dojmt.gov/',
      'Montana Consumer Data Privacy Act (MCDPA) · effective Oct 2024',
      'Up to $7,500 per violation', 7500,
      /Montana Consumer Data Privacy Act|MCDPA|MT privacy rights/i,
      'Montana MCDPA applies to controllers processing 50,000+ Montana consumers.',
      'Add MT residents to privacy notice.', 'Adds MT to multi-state privacy posture.'],
    ['US_NH_PRIVACY_ACT', 'NH_SB255_2025', 'us_nh_privacy_missing', 'US', null, 'P2',
      'New Hampshire Attorney General', 'https://www.doj.nh.gov/',
      'New Hampshire SB 255 Privacy Act · effective Jan 2025',
      'Up to $10,000 per violation', 10000,
      /New Hampshire Privacy Act|NH SB 255|NH privacy rights/i,
      'NH Privacy Act applies to controllers processing 35,000+ NH consumers.',
      'Add NH residents to privacy notice.', 'Adds NH to multi-state privacy posture.'],

    // ---- US FEDERAL ADDITIONAL ----
    ['US_TCPA_TELEPHONE_CONSUMER', 'US_TCPA_1991', 'us_tcpa_missing', 'US', null, 'P1',
      'FCC + private plaintiffs', 'https://www.fcc.gov/general/telemarketing-and-robocalls',
      'Telephone Consumer Protection Act 1991 + 2024 amendments',
      '$500 to $1,500 per call/text', 1500,
      /TCPA|Telephone Consumer Protection|express written consent|SMS opt-?in|robocall/i,
      'TCPA requires prior express written consent for marketing calls + texts; class actions are common.',
      'Add TCPA-compliant SMS opt-in + DNC scrub before any marketing call/text.', 'Avoids class-action exposure.'],
    ['US_CAN_SPAM_ACT', 'US_CAN_SPAM_2003', 'us_canspam_missing', 'US', null, 'P2',
      'FTC + DOJ', 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
      'CAN-SPAM Act 2003',
      'Up to $51,744 per email', 51744,
      /CAN-SPAM|unsubscribe link|physical address|sender identification/i,
      'CAN-SPAM requires clear sender ID, unsubscribe mechanism, physical address in every commercial email.',
      'Add unsubscribe + physical address to all marketing emails.', 'Closes FTC exposure.'],
    ['US_FCRA_FAIR_CREDIT', 'US_FCRA_1970', 'us_fcra_missing', 'US', ['fintech', 'finance'], 'P1',
      'CFPB + FTC', 'https://www.consumer.ftc.gov/articles/fair-credit-reporting-act',
      'Fair Credit Reporting Act (FCRA)',
      'Statutory damages + class actions', 0,
      /Fair Credit Reporting|FCRA|adverse action notice|consumer report disclosure/i,
      'FCRA governs use of consumer reports; adverse action notices and permissible purpose are mandatory.',
      'Add FCRA-compliant adverse action + dispute process.', 'Closes CFPB exposure.'],
    ['US_GLBA_GRAMM_LEACH_BLILEY', 'US_GLBA_1999', 'us_glba_missing', 'US', ['fintech', 'finance', 'insurance'], 'P0',
      'FTC + CFPB + functional regulator', 'https://www.ftc.gov/business-guidance/privacy-security/gramm-leach-bliley-act',
      'Gramm-Leach-Bliley Act + Safeguards Rule',
      'Significant civil + criminal penalties', 0,
      /Gramm-Leach-Bliley|GLBA|financial privacy notice|Safeguards Rule/i,
      'GLBA mandates financial privacy notices + Safeguards Rule security program for financial institutions.',
      'Publish GLBA privacy notice + implement Safeguards Rule program.', 'Closes federal financial-services exposure.'],

    // ---- EU MEMBER STATES ADDITIONAL ----
    ['EU_PL_UODO_GDPR', 'PL_UODO', 'eu_pl_privacy_missing', 'EU', null, 'P1',
      'UODO (Polish DPA)', 'https://uodo.gov.pl/',
      'Polish Data Protection Act (1 May 2018)',
      'Up to 4% global turnover under GDPR', 0,
      /UODO|Polish Data Protection|polski jezyk privacy notice|Polska RODO/i,
      'Polish UODO enforces GDPR + national derogations for HR, journalism, scientific research.',
      'Publish Polish-language privacy notice for PL data subjects.', 'Closes PL exposure.'],
    ['EU_SE_IMY_GDPR', 'SE_IMY', 'eu_se_privacy_missing', 'EU', null, 'P2',
      'IMY (Swedish DPA)', 'https://www.imy.se/',
      'Swedish Data Protection Act (2018:218)',
      'Up to 4% global turnover under GDPR', 0,
      /IMY|Datainspektionen|Svenska dataskyddsmyndigheten|svenska privacy notice/i,
      'IMY enforces GDPR in Sweden + national rules for personal IDs (personnummer).',
      'Add Swedish-language privacy notice + personnummer-specific safeguards.', 'Closes SE exposure.'],
    ['EU_FI_OFFICE_DPO', 'FI_TIETOSUOJAVALTUUTETTU', 'eu_fi_privacy_missing', 'EU', null, 'P2',
      'Tietosuojavaltuutettu (Finnish DPA)', 'https://tietosuoja.fi/',
      'Finnish Data Protection Act (1050/2018)',
      'Up to 4% global turnover under GDPR', 0,
      /Tietosuojavaltuutettu|Finnish Data Protection|suomeksi privacy|suomenkielinen tietosuoja/i,
      'Finnish DPA enforces GDPR + Finnish-specific rules on credit data and HR.',
      'Add Finnish-language privacy notice.', 'Closes FI exposure.'],
    ['EU_DK_DATATILSYNET_GDPR', 'DK_DATATILSYNET', 'eu_dk_privacy_missing', 'EU', null, 'P2',
      'Datatilsynet (Danish DPA)', 'https://www.datatilsynet.dk/',
      'Danish Data Protection Act (Act No 502 of 23 May 2018)',
      'Up to 4% global turnover under GDPR', 0,
      /Datatilsynet|Danish Data Protection|dansk privacy|på dansk databeskyttelse/i,
      'Datatilsynet enforces GDPR in Denmark + national derogations.',
      'Add Danish-language privacy notice.', 'Closes DK exposure.'],
    ['EU_AT_DSB_GDPR', 'AT_DSB', 'eu_at_privacy_missing', 'EU', null, 'P2',
      'DSB (Austrian DPA)', 'https://www.dsb.gv.at/',
      'Austrian Data Protection Act (DSG)',
      'Up to 4% global turnover under GDPR', 0,
      /Datenschutzbehörde|Austrian Data Protection|österreichisch Datenschutz|DSG Österreich/i,
      'DSB enforces GDPR in Austria + DSG national rules on image processing and scientific research.',
      'Add German-language privacy notice + Austrian addendum if processing in AT.', 'Closes AT exposure.'],
    ['EU_BE_APD_GDPR', 'BE_APD', 'eu_be_privacy_missing', 'EU', null, 'P2',
      'APD/GBA (Belgian DPA)', 'https://www.dataprotectionauthority.be/',
      'Belgian Data Protection Act (30 July 2018)',
      'Up to 4% global turnover under GDPR', 0,
      /APD|Belgian Data Protection|gegevensbeschermingsautoriteit|Belgische privacy/i,
      'Belgian APD/GBA enforces GDPR + national rules on HR, marketing, biometrics.',
      'Add NL/FR-language privacy notice for BE data subjects.', 'Closes BE exposure.'],
    ['EU_PT_CNPD_GDPR', 'PT_CNPD', 'eu_pt_privacy_missing', 'EU', null, 'P2',
      'CNPD (Portuguese DPA)', 'https://www.cnpd.pt/',
      'Portuguese Data Protection Law (Lei 58/2019)',
      'Up to 4% global turnover under GDPR', 0,
      /CNPD|Portuguese Data Protection|comissão nacional|português privacy/i,
      'CNPD enforces GDPR in Portugal + Lei 58/2019 derogations.',
      'Add Portuguese-language privacy notice for PT data subjects.', 'Closes PT exposure.'],
    ['EU_GR_HDPA_GDPR', 'GR_HDPA', 'eu_gr_privacy_missing', 'EU', null, 'P2',
      'HDPA (Hellenic DPA)', 'https://www.dpa.gr/',
      'Greek Law 4624/2019 transposing GDPR',
      'Up to 4% global turnover under GDPR', 0,
      /HDPA|Hellenic Data Protection|ελληνικά privacy|Greek privacy notice/i,
      'HDPA enforces GDPR in Greece + Law 4624/2019 employment + telemedicine derogations.',
      'Add Greek-language privacy notice for GR data subjects.', 'Closes GR exposure.'],
    ['EU_CZ_UOOU_GDPR', 'CZ_UOOU', 'eu_cz_privacy_missing', 'EU', null, 'P2',
      'ÚOOÚ (Czech DPA)', 'https://www.uoou.cz/',
      'Czech Personal Data Processing Act 110/2019',
      'Up to 4% global turnover under GDPR', 0,
      /ÚOOÚ|UOOU|Czech Data Protection|česky privacy|českém jazyce zpracování/i,
      'Czech ÚOOÚ enforces GDPR + Act 110/2019 national derogations.',
      'Add Czech-language privacy notice.', 'Closes CZ exposure.'],
    ['EU_RO_ANSPDCP_GDPR', 'RO_ANSPDCP', 'eu_ro_privacy_missing', 'EU', null, 'P2',
      'ANSPDCP (Romanian DPA)', 'https://www.dataprotection.ro/',
      'Romanian Law 190/2018 implementing GDPR',
      'Up to 4% global turnover under GDPR', 0,
      /ANSPDCP|Romanian Data Protection|romana privacy|în limba română prelucrare/i,
      'Romanian ANSPDCP enforces GDPR + Law 190/2018 national derogations.',
      'Add Romanian-language privacy notice.', 'Closes RO exposure.'],
    ['EU_HU_NAIH_GDPR', 'HU_NAIH', 'eu_hu_privacy_missing', 'EU', null, 'P2',
      'NAIH (Hungarian DPA)', 'https://www.naih.hu/',
      'Hungarian Privacy Act CXII/2011 (Infotv)',
      'Up to 4% global turnover under GDPR', 0,
      /NAIH|Hungarian Data Protection|magyar privacy|magyarul adatvédelem/i,
      'NAIH enforces GDPR in Hungary + Infotv national rules on employment + biometrics.',
      'Add Hungarian-language privacy notice.', 'Closes HU exposure.'],

    // ---- ASIA PACIFIC PRIVACY ----
    ['APAC_AU_PRIVACY_ACT', 'AU_PRIVACY_ACT_1988', 'apac_au_privacy_missing', 'AU', null, 'P1',
      'OAIC (Australian Information Commissioner)', 'https://www.oaic.gov.au/',
      'Australian Privacy Act 1988 + APP',
      'Up to AUD 50M or 30% adjusted turnover', 50000000,
      /Australian Privacy Act|APP|OAIC|Australia privacy policy/i,
      'AU Privacy Act applies to entities with AUD 3M+ turnover trading with Australia + health providers regardless of size.',
      'Publish APP-compliant privacy policy + notify OAIC for breaches.', 'Closes AU exposure.'],
    ['APAC_NZ_PRIVACY_ACT', 'NZ_PRIVACY_ACT_2020', 'apac_nz_privacy_missing', 'NZ', null, 'P2',
      'Office of the Privacy Commissioner NZ', 'https://www.privacy.org.nz/',
      'New Zealand Privacy Act 2020',
      'Up to NZD 10,000 per breach + civil', 10000,
      /New Zealand Privacy Act|NZ Privacy|Privacy Commissioner NZ|NZ privacy policy/i,
      'NZ Privacy Act 2020 imposes mandatory breach notification + IPP compliance for any entity processing NZ resident data.',
      'Publish NZ Privacy Act-compliant policy + OPC notification procedure.', 'Closes NZ exposure.'],
    ['APAC_JP_APPI', 'JP_APPI_2003_AMENDED', 'apac_jp_privacy_missing', 'JP', null, 'P1',
      'PPC (Personal Information Protection Commission Japan)', 'https://www.ppc.go.jp/',
      'Act on the Protection of Personal Information (APPI) · 2022 amendments',
      'Up to JPY 100M corporate fine', 100000000,
      /APPI|Personal Information Protection|個人情報保護|Japanese privacy policy/i,
      'APPI applies to any entity processing personal information of Japanese residents; cross-border transfer requires consent.',
      'Publish Japanese-language privacy policy + appoint local representative if no JP office.', 'Closes JP exposure.'],
    ['APAC_KR_PIPA', 'KR_PIPA_2011', 'apac_kr_privacy_missing', 'KR', null, 'P1',
      'PIPC (Personal Information Protection Commission Korea)', 'https://www.pipc.go.kr/',
      'Personal Information Protection Act (PIPA)',
      'Up to 3% of revenue + criminal sanctions', 0,
      /PIPA|Personal Information Protection Act|개인정보보호법|Korean privacy policy/i,
      'PIPA is one of the strictest privacy laws globally; opt-in consent + breach notification required.',
      'Publish Korean-language privacy policy + designate domestic agent.', 'Closes KR exposure.'],
    ['APAC_TH_PDPA', 'TH_PDPA_2019', 'apac_th_privacy_missing', 'TH', null, 'P2',
      'PDPC (Personal Data Protection Committee Thailand)', 'https://www.pdpc.or.th/',
      'Thai Personal Data Protection Act (PDPA) · effective Jun 2022',
      'Up to THB 5M + criminal sanctions', 5000000,
      /Thai PDPA|Thailand Personal Data Protection|PDPC|Thai privacy policy/i,
      'TH PDPA applies extraterritorially; consent + DPO + breach notification required.',
      'Publish Thai-language privacy policy + designate DPO if processing TH data at scale.', 'Closes TH exposure.'],
    ['APAC_MY_PDPA', 'MY_PDPA_2010', 'apac_my_privacy_missing', 'MY', null, 'P2',
      'Department of Personal Data Protection Malaysia', 'https://www.pdp.gov.my/',
      'Personal Data Protection Act 2010 (Malaysia)',
      'Up to MYR 500,000 + 3 years imprisonment', 500000,
      /Malaysia PDPA|Malaysian Personal Data Protection|JPDP|Malaysian privacy/i,
      'MY PDPA requires written consent + class registration for certain data users.',
      'Publish PDPA-compliant notice + register if processing as data user class.', 'Closes MY exposure.'],
    ['APAC_ID_PDP_LAW', 'ID_PDP_LAW_2022', 'apac_id_privacy_missing', 'ID', null, 'P2',
      'Personal Data Protection Authority (Indonesia)', 'https://www.kominfo.go.id/',
      'Indonesia Personal Data Protection Law (UU 27/2022)',
      'Up to IDR 50B + 2% revenue', 50000000000,
      /Indonesia PDP Law|UU PDP|Indonesia Personal Data Protection|Indonesian privacy/i,
      'ID PDP Law (effective Oct 2024) applies extraterritorially with GDPR-style penalties.',
      'Publish Indonesian-language privacy policy + appoint DPO.', 'Closes ID exposure.'],
    ['APAC_PH_DPA', 'PH_DPA_2012', 'apac_ph_privacy_missing', 'PH', null, 'P2',
      'National Privacy Commission Philippines', 'https://www.privacy.gov.ph/',
      'Data Privacy Act of 2012 (Republic Act 10173)',
      'Up to PHP 5M + 6 years imprisonment', 5000000,
      /Data Privacy Act 2012|RA 10173|NPC Philippines|Filipino privacy policy/i,
      'PH DPA applies to controllers processing PH resident data; DPO appointment + NPC registration required.',
      'Publish DPA-compliant privacy policy + appoint DPO + NPC registration.', 'Closes PH exposure.'],
    ['LATAM_BR_LGPD', 'BR_LGPD_2018', 'latam_br_privacy_missing', 'BR', null, 'P1',
      'ANPD (Brazilian DPA)', 'https://www.gov.br/anpd/',
      'Lei Geral de Proteção de Dados (LGPD)',
      'Up to BRL 50M per violation', 50000000,
      /LGPD|Lei Geral de Proteção de Dados|ANPD|Brazilian privacy policy|português privacidade/i,
      'LGPD is the Brazilian GDPR-equivalent; DPO + lawful basis + breach notification required.',
      'Publish Portuguese-language privacy notice + appoint DPO if processing BR data.', 'Closes BR exposure.'],
    ['LATAM_MX_LFPDPPP', 'MX_LFPDPPP_2010', 'latam_mx_privacy_missing', 'MX', null, 'P2',
      'INAI (Mexican DPA)', 'https://home.inai.org.mx/',
      'Ley Federal de Protección de Datos Personales',
      'Up to MXN 30M + criminal sanctions', 30000000,
      /LFPDPPP|INAI|Mexican Data Protection|aviso de privacidad|en español privacidad/i,
      'MX LFPDPPP requires Spanish-language "aviso de privacidad" + ARCO rights mechanism.',
      'Publish Spanish-language aviso de privacidad + ARCO request mechanism.', 'Closes MX exposure.'],
    ['LATAM_AR_PDPA', 'AR_PDPA_2000', 'latam_ar_privacy_missing', 'AR', null, 'P2',
      'AAIP (Argentina DPA)', 'https://www.argentina.gob.ar/aaip',
      'Argentine Personal Data Protection Act 25.326',
      'Up to ARS 5M per violation', 5000000,
      /AAIP|Argentine Data Protection|ley 25.326|aviso de privacidad argentina/i,
      'AR PDPA is one of Latin America\'s oldest privacy laws; database registration required.',
      'Register databases with AAIP + publish Spanish-language privacy notice.', 'Closes AR exposure.'],
    ['AFR_ZA_POPIA', 'ZA_POPIA_2013', 'afr_za_privacy_missing', 'ZA', null, 'P1',
      'Information Regulator (South Africa)', 'https://inforegulator.org.za/',
      'Protection of Personal Information Act (POPIA)',
      'Up to ZAR 10M + criminal sanctions', 10000000,
      /POPIA|Protection of Personal Information|South Africa privacy|Information Regulator ZA/i,
      'POPIA applies extraterritorially; Information Officer registration + breach notification required.',
      'Register Information Officer with Information Regulator + publish POPIA notice.', 'Closes ZA exposure.'],
    ['AFR_NG_NDPA', 'NG_NDPA_2023', 'afr_ng_privacy_missing', 'NG', null, 'P2',
      'NDPC (Nigeria Data Protection Commission)', 'https://ndpc.gov.ng/',
      'Nigeria Data Protection Act 2023',
      'Up to 2% revenue or NGN 10M', 10000000,
      /Nigeria Data Protection Act|NDPA 2023|NDPC|Nigerian privacy/i,
      'Nigeria DPA 2023 mandates DPO + annual filing for major data controllers.',
      'Publish Nigeria DPA-compliant notice + appoint DPO if processing NG data at scale.', 'Closes NG exposure.'],
    ['MENA_TR_KVKK', 'TR_KVKK_2016', 'mena_tr_privacy_missing', 'TR', null, 'P2',
      'KVKK (Turkish DPA)', 'https://www.kvkk.gov.tr/',
      'Turkish Personal Data Protection Law (KVKK)',
      'Up to TRY 1.8M per violation', 1800000,
      /KVKK|Turkish Data Protection|kişisel veri|Turkish privacy notice/i,
      'KVKK requires data controller registry (VERBIS) registration + explicit consent for sensitive data.',
      'Register with VERBIS + publish Turkish-language privacy notice.', 'Closes TR exposure.'],

    // ---- SANCTIONS + EXPORT CONTROLS ----
    ['GLOBAL_OFAC_SANCTIONS', 'US_OFAC_SDN', 'sanctions_ofac_screening_missing', '*', null, 'P0',
      'OFAC (US Treasury)', 'https://ofac.treasury.gov/',
      'OFAC Sanctions Regulations (50 USC 1701 et seq)',
      'Up to $1M per violation + criminal', 1000000,
      /OFAC|SDN list|sanctions screening|denied parties|sanctions compliance program/i,
      'OFAC enforces US sanctions extraterritorially against any entity transacting in USD or with US persons.',
      'Implement OFAC SDN screening for customers, vendors, and counterparties.', 'Closes OFAC exposure.'],
    ['GLOBAL_UK_OFSI_SANCTIONS', 'UK_OFSI', 'sanctions_uk_ofsi_missing', '*', null, 'P0',
      'OFSI (HM Treasury)', 'https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation',
      'Sanctions and Anti-Money Laundering Act 2018',
      'Unlimited fines + 7 years imprisonment', 0,
      /OFSI|UK sanctions|consolidated list|sanctions screening|asset freeze/i,
      'UK OFSI maintains the UK consolidated sanctions list; reporting obligations apply to all UK persons.',
      'Implement OFSI consolidated list screening + reporting procedure.', 'Closes OFSI exposure.'],
    ['GLOBAL_EU_SANCTIONS', 'EU_SANCTIONS_MAP', 'sanctions_eu_screening_missing', 'EU', null, 'P0',
      'European Council + Member State competent authorities', 'https://www.sanctionsmap.eu/',
      'EU Sanctions Regulations',
      'Member state criminal + civil sanctions', 0,
      /EU sanctions|consolidated list|EU restrictive measures|sanctions screening EU/i,
      'EU sanctions apply to all EU persons + entities; member states enforce via national criminal law.',
      'Implement EU consolidated list screening across all EU operations.', 'Closes EU sanctions exposure.'],
    ['GLOBAL_US_EAR_EXPORT', 'US_EAR_2024', 'us_ear_export_missing', 'US', ['saas', 'enterprise-saas', 'manufacturing'], 'P1',
      'BIS (US Commerce Department)', 'https://www.bis.doc.gov/',
      'Export Administration Regulations (15 CFR 730-774)',
      'Up to $1M per violation + criminal', 1000000,
      /EAR|Export Administration|BIS|ECCN|export classification/i,
      'EAR controls export of US-origin technology including software, encryption, dual-use items.',
      'Classify products under ECCN + implement BIS-compliant export control program.', 'Closes BIS exposure.'],

    // ---- MODERN SLAVERY + SUPPLY CHAIN ----
    ['GLOBAL_UK_MODERN_SLAVERY', 'UK_MSA_2015', 'uk_modern_slavery_missing', 'UK', null, 'P1',
      'Home Office + Independent Anti-Slavery Commissioner', 'https://www.gov.uk/government/collections/modern-slavery',
      'Modern Slavery Act 2015 · Section 54',
      'Reputational + procurement exclusion', 0,
      /Modern Slavery Statement|Section 54 Modern Slavery|MSA 2015 statement|slavery and human trafficking statement/i,
      'UK MSA s54 requires turnover £36M+ commercial organisations to publish annual slavery statement.',
      'Publish Modern Slavery Statement on homepage with board approval.', 'Closes UK MSA exposure.'],
    ['GLOBAL_AU_MODERN_SLAVERY', 'AU_MSA_2018', 'au_modern_slavery_missing', 'AU', null, 'P1',
      'Australian Border Force + Modern Slavery Business Engagement Unit', 'https://modernslaveryregister.gov.au/',
      'Australian Modern Slavery Act 2018',
      'Public register naming + procurement', 0,
      /Australian Modern Slavery Statement|AU MSA 2018|modern slavery register Australia/i,
      'AU MSA applies to entities with AUD 100M+ consolidated revenue trading in Australia.',
      'Publish AU Modern Slavery Statement on the Modern Slavery Register.', 'Closes AU MSA exposure.'],
    ['GLOBAL_CA_S211_SUPPLY_CHAIN', 'CA_S211_2023', 'ca_supply_chain_missing', 'CA', null, 'P1',
      'Public Safety Canada', 'https://www.publicsafety.gc.ca/',
      'Fighting Against Forced Labour and Child Labour in Supply Chains Act (Bill S-211)',
      'Up to CAD 250K per violation + criminal', 250000,
      /Bill S-211|Fighting Against Forced Labour|Canadian supply chain report|forced labour Canada/i,
      'CA S-211 (effective Jan 2024) requires annual supply chain report by 31 May for qualifying entities.',
      'Publish CA S-211 supply chain report by 31 May annually.', 'Closes CA exposure.'],
    ['GLOBAL_US_TARIFF_307', 'US_TARIFF_ACT_1930', 'us_forced_labor_missing', 'US', ['ecommerce', 'manufacturing', 'retail'], 'P1',
      'US Customs and Border Protection', 'https://www.cbp.gov/trade/forced-labor',
      'Tariff Act 1930 §307 + UFLPA 2022',
      'Goods seizure + entry denial', 0,
      /forced labor|UFLPA|Tariff Act 307|forced labor compliance|Xinjiang Uyghur/i,
      'US Tariff Act 307 + UFLPA bans import of goods made with forced labor; rebuttable presumption for Xinjiang-origin.',
      'Implement UFLPA-compliant supply chain due diligence + documentation.', 'Closes CBP exposure.'],
    ['GLOBAL_DE_LIEFERKETTEN', 'DE_LkSG_2023', 'de_supply_chain_missing', 'EU', null, 'P1',
      'BAFA (German Federal Office for Economic Affairs)', 'https://www.bafa.de/',
      'German Supply Chain Due Diligence Act (Lieferkettensorgfaltspflichtengesetz)',
      'Up to 2% global turnover + 3 years exclusion', 0,
      /Lieferkettengesetz|LkSG|German Supply Chain Due Diligence|supply chain Germany|Sorgfaltspflichtengesetz/i,
      'DE LkSG applies to companies with 1,000+ employees in Germany; supply chain due diligence + annual report mandatory.',
      'Publish LkSG-compliant due diligence report annually to BAFA.', 'Closes DE supply chain exposure.'],

    // ---- CYBERSECURITY + INCIDENT RESPONSE ----
    ['EU_NIS2_DIRECTIVE', 'EU_NIS2_2022', 'eu_nis2_missing', 'EU', null, 'P0',
      'ENISA + Member State competent authorities', 'https://digital-strategy.ec.europa.eu/en/policies/nis2-directive',
      'EU NIS2 Directive (Directive 2022/2555)',
      'Up to €10M or 2% global turnover', 10000000,
      /NIS2|NIS 2|Network and Information Security 2|cybersecurity risk management|24-hour notification/i,
      'NIS2 (transposition deadline 17 Oct 2024) covers essential and important entities across 18 sectors.',
      'Implement NIS2-aligned ISMS + 24h incident notification + register with national CSIRT.', 'Closes NIS2 exposure.'],
    ['US_CIRCIA_CYBER', 'US_CIRCIA_2022', 'us_circia_missing', 'US', null, 'P1',
      'CISA (Cybersecurity and Infrastructure Security Agency)', 'https://www.cisa.gov/circia',
      'Cyber Incident Reporting for Critical Infrastructure Act (CIRCIA)',
      'Subpoena + civil contempt', 0,
      /CIRCIA|Cyber Incident Reporting Critical Infrastructure|72-hour incident report|CISA cyber incident/i,
      'CIRCIA requires covered entities to report substantial cyber incidents to CISA within 72 hours.',
      'Implement CIRCIA-compliant 72h incident reporting workflow.', 'Closes CISA exposure.'],
    ['US_SEC_CYBER_DISCLOSURE', 'US_SEC_CYBER_2023', 'us_sec_cyber_missing', 'US', null, 'P0',
      'US Securities and Exchange Commission', 'https://www.sec.gov/news/press-release/2023-139',
      'SEC Cybersecurity Risk Management Rules (17 CFR 229.106)',
      'Material misstatement liability + class actions', 0,
      /SEC cybersecurity disclosure|Item 1.05|4-day cyber disclosure|Form 8-K cyber/i,
      'SEC requires public companies to disclose material cyber incidents within 4 business days on Form 8-K Item 1.05.',
      'Implement SEC-compliant cyber incident materiality assessment + 8-K disclosure workflow.', 'Closes SEC cyber exposure.'],

    // ---- EU PAY TRANSPARENCY + DIVERSITY ----
    ['EU_PAY_TRANSPARENCY', 'EU_2023_970', 'eu_pay_transparency_missing', 'EU', null, 'P1',
      'European Commission + Member State labour ministries', 'https://eur-lex.europa.eu/eli/dir/2023/970/oj',
      'Pay Transparency Directive (Directive 2023/970)',
      'Member state penalties + back-pay', 0,
      /Pay Transparency Directive|EU 2023\/970|gender pay gap reporting|pay disclosure|equal pay reporting/i,
      'EU Pay Transparency Directive (transposition deadline 7 Jun 2026) requires gender pay gap reporting + candidate pay disclosure.',
      'Prepare pay structure mapping + gender pay gap reporting by transposition deadline.', 'Closes EU pay transparency exposure.'],
    ['US_CA_PAY_TRANSPARENCY', 'CA_SB1162_2023', 'us_ca_pay_transparency_missing', 'US', null, 'P1',
      'California Labor Commissioner', 'https://www.dir.ca.gov/dlse/',
      'California SB 1162 Pay Transparency',
      'Up to $10,000 per violation', 10000,
      /California pay transparency|SB 1162|pay scale California|salary range California/i,
      'CA SB 1162 requires salary range in all job postings + pay data reporting for 100+ employee firms.',
      'Add salary ranges to all job postings + file annual pay data report.', 'Closes CA Labor exposure.'],

    // ---- WHISTLEBLOWING ADDITIONAL ----
    ['EU_WHISTLEBLOWER_DIRECTIVE', 'EU_2019_1937', 'eu_whistleblower_missing', 'EU', null, 'P1',
      'European Commission + Member State competent authorities', 'https://eur-lex.europa.eu/eli/dir/2019/1937/oj',
      'EU Whistleblower Directive (Directive 2019/1937)',
      'Member state penalties + retaliation damages', 0,
      /EU Whistleblower Directive|2019\/1937|internal reporting channel|whistleblower protection|whistleblowing policy/i,
      'EU Whistleblower Directive (transposed 17 Dec 2021/2023) requires 50+ employee firms to operate internal reporting channels.',
      'Implement EU Whistleblower Directive-compliant internal reporting channel + 3-month feedback.', 'Closes EU whistleblower exposure.'],

    // ---- HOSPITALITY + FIRE SAFETY ----
    ['UK_FIRE_SAFETY_ORDER_2005', 'UK_FSO_2005', 'uk_fso_missing', 'UK', ['hospitality', 'real-estate'], 'P0',
      'Fire and Rescue Authorities + Health and Safety Executive', 'https://www.gov.uk/workplace-fire-safety-your-responsibilities',
      'Regulatory Reform (Fire Safety) Order 2005 + Fire Safety Act 2021',
      'Unlimited fines + 2 years imprisonment', 0,
      /Fire Safety Order|FSO 2005|Fire Risk Assessment|Responsible Person fire|fire safety policy/i,
      'UK FSO 2005 requires a Responsible Person to conduct fire risk assessment + maintain fire safety provisions.',
      'Publish fire safety policy + ensure Fire Risk Assessment is current.', 'Closes FSO exposure.'],
    ['EU_TOBACCO_PRODUCTS_DIRECTIVE', 'EU_TPD_2014_40', 'eu_tpd_missing', 'EU', ['hospitality', 'ecommerce'], 'P2',
      'European Commission DG SANTE', 'https://health.ec.europa.eu/tobacco_en',
      'EU Tobacco Products Directive (2014/40/EU)',
      'Member state penalties', 0,
      /Tobacco Products Directive|TPD|EU tobacco|nicotine warning|vape compliance/i,
      'EU TPD imposes tobacco + vape product warnings, registration, and cross-border sales rules.',
      'Add TPD-compliant warnings + EU-CEG product registration.', 'Closes TPD exposure.'],

    // ---- TRANSPORT + LOGISTICS ----
    ['UK_DVSA_OPERATOR_LICENSE', 'UK_DVSA_OPLIC', 'uk_dvsa_missing', 'UK', ['transport', 'logistics'], 'P0',
      'DVSA (Driver and Vehicle Standards Agency)', 'https://www.gov.uk/dvsa-services-and-information',
      'Goods Vehicles (Licensing of Operators) Act 1995',
      'Operator license revocation + criminal', 0,
      /Operator Licence|O-Licence|DVSA|Transport Manager CPC|operator licensing/i,
      'UK DVSA requires Operator Licence + Transport Manager CPC for commercial vehicle operators above 3.5T.',
      'Publish Operator Licence number + Transport Manager CPC details.', 'Closes DVSA exposure.'],
    ['EU_ADR_DANGEROUS_GOODS', 'EU_ADR_2023', 'eu_adr_missing', 'EU', ['transport', 'logistics', 'manufacturing'], 'P1',
      'UNECE + Member State competent authorities', 'https://unece.org/transport/dangerous-goods',
      'European Agreement on International Carriage of Dangerous Goods by Road (ADR)',
      'Member state criminal penalties', 0,
      /ADR|dangerous goods|DGSA|hazardous transport|ADR 2023/i,
      'ADR governs international road carriage of dangerous goods; DGSA (Dangerous Goods Safety Adviser) mandatory.',
      'Appoint DGSA + implement ADR-compliant packaging, labelling and documentation.', 'Closes ADR exposure.'],

    // ---- ESG DEEP ----
    ['UK_TPT_TRANSITION_PLAN', 'UK_TPT_2023', 'uk_tpt_missing', 'UK', null, 'P2',
      'HM Treasury + FCA', 'https://transitiontaskforce.net/',
      'UK Transition Plan Taskforce Disclosure Framework',
      'Investor + procurement signal', 0,
      /Transition Plan Taskforce|TPT|UK transition plan|net-zero transition plan/i,
      'UK TPT framework is the emerging standard for climate transition plan disclosure; FCA expected to mandate for premium listings.',
      'Publish TPT-aligned climate transition plan.', 'Lifts investor signal.'],
    ['GLOBAL_SBTI_SCIENCE_TARGETS', 'SBTI_NETZERO', 'global_sbti_missing', '*', null, 'P2',
      'Science Based Targets initiative', 'https://sciencebasedtargets.org/',
      'SBTi Corporate Net-Zero Standard',
      'Investor + procurement scoring exposure', 0,
      /Science Based Targets|SBTi|SBT validation|net-zero target validation|1\.5°C aligned/i,
      'SBTi validates corporate climate targets against 1.5°C pathway; required for credible net-zero claims.',
      'Submit SBTi target submission + publish validation status.', 'Lifts investor + customer signal.'],
    ['EU_CBAM_CARBON_BORDER', 'EU_CBAM_2023', 'eu_cbam_missing', 'EU', ['manufacturing', 'logistics', 'ecommerce'], 'P1',
      'European Commission DG TAXUD', 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en',
      'EU Carbon Border Adjustment Mechanism (Regulation 2023/956)',
      'CBAM penalties + import friction', 0,
      /CBAM|Carbon Border Adjustment Mechanism|CBAM report|carbon import declaration/i,
      'EU CBAM (transitional from Oct 2023, full from Jan 2026) requires quarterly emissions reporting for steel, cement, fertilisers, aluminium, hydrogen, electricity.',
      'Implement CBAM reporting workflow for imports of covered goods.', 'Closes CBAM exposure.'],
    ['UK_SECR_STREAMLINED', 'UK_SECR_2019', 'uk_secr_missing', 'UK', null, 'P2',
      'BEIS + Companies House', 'https://www.gov.uk/government/publications/academic-technology-approval-scheme',
      'Streamlined Energy and Carbon Reporting (SECR) Regulations 2018',
      'Companies Act offences', 0,
      /SECR|Streamlined Energy and Carbon Reporting|UK GHG|directors report energy/i,
      'UK SECR requires large companies + LLPs to report energy, GHG emissions, and intensity ratio in Directors\' Report.',
      'Include SECR disclosure in Directors\' Report.', 'Closes Companies House exposure.'],

    // ---- INSURANCE + FINANCIAL DEEP ----
    ['UK_FCA_SMCR', 'UK_FCA_SMCR_2019', 'uk_smcr_missing', 'UK', ['fintech', 'finance', 'insurance'], 'P0',
      'FCA + PRA', 'https://www.fca.org.uk/firms/senior-managers-certification-regime',
      'Senior Managers and Certification Regime',
      'Up to unlimited + criminal', 0,
      /SMCR|Senior Managers Certification|conduct rules|certification regime|senior manager function/i,
      'SMCR holds senior managers individually accountable; conduct rules apply to almost all staff.',
      'Map SMFs + implement SMCR-compliant governance + conduct rules training.', 'Closes FCA SMCR exposure.'],
    ['EU_SOLVENCY_II_PILLAR_3', 'EU_SOLVENCY_II_PILLAR3', 'eu_solvency_ii_pillar3_missing', 'EU', ['insurance'], 'P1',
      'EIOPA + national competent authorities', 'https://www.eiopa.europa.eu/',
      'Solvency II Directive 2009/138/EC · Pillar 3',
      'Authorisation revocation + supervisory measures', 0,
      /Solvency II|SFCR|Solvency and Financial Condition Report|RSR Pillar 3/i,
      'Solvency II Pillar 3 mandates SFCR public disclosure + RSR supervisory report annually.',
      'Publish SFCR + file RSR annually.', 'Closes EIOPA exposure.'],

    // ---- ONLINE SAFETY DEEP ----
    ['UK_OSA_ILLEGAL_CONTENT', 'UK_OSA_2023_ILLEGAL', 'uk_osa_illegal_missing', 'UK', ['saas', 'ecommerce'], 'P0',
      'Ofcom', 'https://www.ofcom.org.uk/online-safety',
      'Online Safety Act 2023 · Illegal Content Duties',
      'Up to £18M or 10% global turnover', 18000000,
      /illegal content risk assessment|OSA illegal harms|Ofcom illegal content|user-to-user illegal/i,
      'OSA imposes illegal content risk assessment + proactive technology duties for user-to-user services.',
      'Conduct + publish OSA illegal content risk assessment.', 'Closes Ofcom exposure.'],
    ['EU_DSA_DIGITAL_SERVICES', 'EU_DSA_2022_2065', 'eu_dsa_deeper_missing', 'EU', ['saas', 'ecommerce'], 'P1',
      'European Commission + Digital Services Coordinators', 'https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package',
      'Digital Services Act (Regulation EU 2022/2065) · Transparency reports',
      'Up to 6% global turnover', 0,
      /DSA transparency report|notice-and-action|trusted flagger|DSA compliance officer/i,
      'DSA requires annual transparency reports + notice-and-action mechanism for all intermediary services.',
      'Publish DSA-compliant transparency report + appoint compliance officer.', 'Closes DSA exposure.']
  ]),

  // =============================================================================
  // BATCH 8 · SECTOR DEEP (oil/gas, telco, maritime, aviation, food, energy, mining)
  //            + EU mosaic (LU/CY/MT/BG/SK/SI/HR) · APAC depth (CN/JP/SG/AU additional)
  //            + payments (PSD2 SCA/PSD3/PSR) · construction · biometrics · charity
  // =============================================================================
  ...batchRules([
    // ---- OIL, GAS, ENERGY ----
    ['UK_OPRED_OFFSHORE', 'UK_OPRED', 'uk_opred_missing', 'UK', ['energy'], 'P0',
      'OPRED (BEIS Offshore Petroleum Regulator for Environment and Decommissioning)', 'https://www.gov.uk/government/organisations/oil-and-gas-authority',
      'Offshore Petroleum Activities Regulations 2002',
      'Unlimited environmental fines + criminal', 0,
      /OPRED|Offshore Petroleum|EEMS|offshore environmental statement|OSPAR compliance/i,
      'OPRED regulates environmental impacts of offshore oil and gas activities under OPA 2002.',
      'Publish OPRED-compliant offshore environmental statement + EEMS data.', 'Closes OPRED exposure.'],
    ['UK_NSTA_OFFSHORE_LICENCE', 'UK_NSTA', 'uk_nsta_missing', 'UK', ['energy'], 'P0',
      'North Sea Transition Authority (NSTA, formerly OGA)', 'https://www.nstauthority.co.uk/',
      'Petroleum Act 1998 + Energy Act 2016',
      'Licence revocation + unlimited fines', 0,
      /North Sea Transition Authority|NSTA|petroleum licence UK|NSTA Stewardship/i,
      'NSTA regulates upstream oil + gas licensing + decommissioning + emissions reduction targets.',
      'Publish NSTA Stewardship Expectations compliance + emissions reduction plan.', 'Closes NSTA exposure.'],
    ['US_FERC_PIPELINE', 'US_FERC', 'us_ferc_missing', 'US', ['energy'], 'P0',
      'Federal Energy Regulatory Commission', 'https://www.ferc.gov/',
      'Federal Power Act + Natural Gas Act',
      'Up to $1M per day per violation', 1000000,
      /FERC|Federal Energy Regulatory|FERC Order 2222|interstate transmission/i,
      'FERC regulates interstate electricity and natural gas markets, transmission, and pipelines.',
      'Publish FERC-compliant tariffs + Order 2222 DER participation if applicable.', 'Closes FERC exposure.'],
    ['US_EPA_RCRA_HAZARDOUS', 'US_EPA_RCRA', 'us_epa_rcra_missing', 'US', ['energy', 'manufacturing', 'healthcare'], 'P0',
      'US Environmental Protection Agency', 'https://www.epa.gov/rcra',
      'Resource Conservation and Recovery Act (RCRA)',
      'Up to $109,024 per day per violation', 109024,
      /RCRA|hazardous waste manifest|EPA Generator|cradle-to-grave waste/i,
      'RCRA governs hazardous waste from cradle to grave; generators must obtain EPA ID + use manifest.',
      'Obtain EPA Generator ID + implement RCRA-compliant waste manifest.', 'Closes EPA exposure.'],
    ['EU_ETS_EMISSIONS_TRADING', 'EU_ETS_2003_87', 'eu_ets_missing', 'EU', ['energy', 'manufacturing'], 'P0',
      'European Commission + Member State competent authorities', 'https://climate.ec.europa.eu/eu-action/eu-emissions-trading-system-eu-ets_en',
      'EU Emissions Trading System (Directive 2003/87/EC)',
      '€100 per excess tonne CO2', 0,
      /EU ETS|Emissions Trading System|EUA allowances|EU ETS verification/i,
      'EU ETS covers power, industry, intra-EEA aviation + maritime from 2024; annual monitoring + surrender.',
      'Publish EU ETS verified emissions report + surrender allowances by 30 Sep.', 'Closes EU ETS exposure.'],

    // ---- TELECOMS ----
    ['UK_OFCOM_GC_GENERAL', 'UK_OFCOM_GC', 'uk_ofcom_gc_missing', 'UK', ['telco', 'saas'], 'P1',
      'Ofcom', 'https://www.ofcom.org.uk/telecoms',
      'Ofcom General Conditions of Entitlement',
      'Up to £2M or 10% turnover', 2000000,
      /Ofcom General Conditions|GC C1|GC C3|Ofcom compliance statement|telecoms code/i,
      'Ofcom General Conditions cover billing, customer contracts, vulnerable customers, switching, emergency calls.',
      'Publish Ofcom GC compliance statement + customer terms.', 'Closes Ofcom exposure.'],
    ['EU_EECC_ELECTRONIC_COMMS', 'EU_EECC_2018_1972', 'eu_eecc_missing', 'EU', ['telco', 'saas'], 'P1',
      'BEREC + Member State NRAs', 'https://www.berec.europa.eu/',
      'European Electronic Communications Code (Directive 2018/1972)',
      'Member state administrative penalties', 0,
      /EECC|Electronic Communications Code|number-independent interpersonal|EU electronic communications/i,
      'EECC applies to providers of electronic communications services including OTT messaging + voice.',
      'Register with NRAs + publish EECC-compliant customer information.', 'Closes EECC exposure.'],
    ['US_FCC_TCPA_ROBOCALL', 'US_FCC_TCPA', 'us_fcc_robocall_missing', 'US', ['telco', 'saas'], 'P0',
      'FCC + DOJ + State AGs', 'https://www.fcc.gov/general/telemarketing-and-robocalls',
      'TCPA + STIR/SHAKEN Rules',
      'Up to $23,727 per call', 23727,
      /STIR\/SHAKEN|robocall mitigation|FCC TCPA|caller ID authentication|RMD certification/i,
      'FCC STIR/SHAKEN rules require caller ID authentication + Robocall Mitigation Database entry.',
      'Register in Robocall Mitigation Database + implement STIR/SHAKEN.', 'Closes FCC exposure.'],

    // ---- MARITIME ----
    ['GLOBAL_IMO_MARPOL', 'IMO_MARPOL_73_78', 'global_marpol_missing', '*', ['transport', 'logistics'], 'P0',
      'IMO + Flag State Administrations', 'https://www.imo.org/en/About/Conventions/Pages/International-Convention-for-the-Prevention-of-Pollution-from-Ships-(MARPOL).aspx',
      'International Convention for the Prevention of Pollution from Ships (MARPOL 73/78)',
      'Flag state detention + civil', 0,
      /MARPOL|IMO MEPC|sulphur cap|EEXI|CII rating|maritime pollution/i,
      'MARPOL Annexes I-VI govern oil, chemicals, sewage, garbage, air pollution; CII + EEXI from 2023.',
      'Publish MARPOL Annex VI compliance + CII rating + EEXI value.', 'Closes flag state exposure.'],
    ['GLOBAL_IMO_SOLAS', 'IMO_SOLAS_74', 'global_solas_missing', '*', ['transport', 'logistics'], 'P0',
      'IMO + Flag State Administrations', 'https://www.imo.org/en/About/Conventions/Pages/International-Convention-for-the-Safety-of-Life-at-Sea-(SOLAS),-1974.aspx',
      'International Convention for the Safety of Life at Sea (SOLAS) 1974',
      'Flag state detention + criminal', 0,
      /SOLAS|ISM Code|ISPS Code|safety management|maritime safety certificate/i,
      'SOLAS imposes ISM Code safety management + ISPS Code security on commercial vessels.',
      'Publish ISM SMC + DOC + ISPS compliance.', 'Closes flag state exposure.'],

    // ---- AVIATION ----
    ['US_FAA_PART_135', 'US_FAA_PART_135', 'us_faa_135_missing', 'US', ['transport'], 'P0',
      'Federal Aviation Administration', 'https://www.faa.gov/regulations_policies/faa_regulations',
      'FAA 14 CFR Part 135 Air Carrier Certification',
      'Certificate revocation + civil', 0,
      /FAA Part 135|Air Carrier Certificate|FAA OpSpecs|14 CFR 135/i,
      'FAA Part 135 governs on-demand and commuter operations; OpSpecs and certificate required.',
      'Publish FAA Air Carrier Certificate + OpSpecs status.', 'Closes FAA exposure.'],
    ['EU_EASA_PART_OPS', 'EU_EASA_PART_ORO', 'eu_easa_oro_missing', 'EU', ['transport'], 'P0',
      'EASA + Member State NAAs', 'https://www.easa.europa.eu/',
      'EASA Part-ORO Air Operations',
      'AOC suspension + civil', 0,
      /EASA Part-ORO|Part-ORO|EASA AOC|EU air operator certificate/i,
      'EASA Part-ORO governs EU air operations + Air Operator Certificate.',
      'Publish EASA AOC + Part-ORO compliance.', 'Closes EASA exposure.'],

    // ---- FOOD SAFETY ----
    ['US_FDA_FSMA', 'US_FDA_FSMA_2011', 'us_fsma_missing', 'US', ['hospitality', 'ecommerce'], 'P1',
      'FDA + State Public Health Departments', 'https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements/food-safety-modernization-act-fsma',
      'Food Safety Modernization Act (FSMA)',
      'Up to $500K per violation + criminal', 500000,
      /FSMA|Food Safety Modernization|preventive controls|HACCP food|FDA food facility registration/i,
      'FSMA shifts focus from response to prevention; food facility registration + preventive controls + supplier verification required.',
      'Register food facility with FDA + implement FSMA preventive controls.', 'Closes FDA exposure.'],
    ['EU_FIC_FOOD_INFO', 'EU_FIC_1169_2011', 'eu_fic_missing', 'EU', ['hospitality', 'ecommerce'], 'P1',
      'European Commission DG SANTE + Member State competent authorities', 'https://food.ec.europa.eu/safety/labelling-and-nutrition_en',
      'EU Food Information to Consumers Regulation (Regulation 1169/2011)',
      'Member state criminal + civil', 0,
      /FIC Regulation|Regulation 1169\/2011|allergen labelling EU|EU food labelling/i,
      'EU FIC mandates allergen labelling, nutrition declaration, and country of origin on food sold in EU.',
      'Publish EU FIC-compliant allergen + nutrition labelling.', 'Closes Member State exposure.'],
    ['GLOBAL_HACCP_CODEX', 'CODEX_HACCP', 'global_haccp_missing', '*', ['hospitality'], 'P1',
      'Codex Alimentarius + national food safety regulators', 'https://www.fao.org/fao-who-codexalimentarius/codex-texts/list-standards/en/',
      'Codex Alimentarius HACCP Principles',
      'Operating licence loss + criminal', 0,
      /HACCP|Hazard Analysis Critical Control|food safety management system|HACCP plan/i,
      'HACCP is the global baseline for food safety; required by most national regulators for food businesses.',
      'Implement HACCP-based food safety management system.', 'Closes food safety exposure.'],

    // ---- CONSTRUCTION ----
    ['UK_CDM_2015', 'UK_CDM_2015', 'uk_cdm_missing', 'UK', ['real-estate'], 'P0',
      'HSE', 'https://www.hse.gov.uk/construction/cdm/2015/',
      'Construction (Design and Management) Regulations 2015',
      'Unlimited fines + 2 years imprisonment', 0,
      /CDM 2015|Construction Design Management|principal designer|principal contractor|F10 notification/i,
      'CDM 2015 requires Principal Designer + Principal Contractor + F10 notification for notifiable projects.',
      'Publish CDM 2015 compliance + F10 notifications status.', 'Closes HSE exposure.'],
    ['US_OSHA_CONSTRUCTION', 'US_OSHA_29_CFR_1926', 'us_osha_construction_missing', 'US', ['real-estate'], 'P0',
      'OSHA', 'https://www.osha.gov/construction',
      'OSHA Construction Standards (29 CFR 1926)',
      'Up to $156,259 per willful violation', 156259,
      /OSHA 1926|OSHA construction standard|OSHA 10|OSHA 30|fall protection plan/i,
      'OSHA 29 CFR 1926 covers fall protection, scaffolding, excavations, electrical for construction.',
      'Implement OSHA 1926-compliant safety program + OSHA 30 training for supervisors.', 'Closes OSHA exposure.'],

    // ---- PAYMENTS ----
    ['EU_PSD2_SCA', 'EU_PSD2_2015_2366', 'eu_psd2_sca_missing', 'EU', ['fintech', 'ecommerce'], 'P0',
      'EBA + Member State competent authorities', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015L2366',
      'PSD2 Strong Customer Authentication (Directive EU 2015/2366)',
      'Member state supervisory penalties', 0,
      /PSD2|Strong Customer Authentication|SCA|PSD2 RTS|two-factor PSD2/i,
      'PSD2 requires SCA (two-factor) for in-scope electronic payments + open banking APIs.',
      'Implement PSD2 SCA + publish exemption strategy.', 'Closes EBA exposure.'],
    ['EU_PSD3_PSR', 'EU_PSD3_2023', 'eu_psd3_missing', 'EU', ['fintech'], 'P1',
      'European Commission + EBA', 'https://finance.ec.europa.eu/regulation-and-supervision/financial-services-legislation/implementing-and-delegated-acts/payment-services-directive_en',
      'PSD3 + Payment Services Regulation (proposed)',
      'Member state penalties', 0,
      /PSD3|Payment Services Regulation|PSR EU|PSD3 readiness/i,
      'PSD3 + PSR (in legislative process, expected 2026) will tighten SCA, fraud liability, and open banking.',
      'Publish PSD3/PSR readiness statement.', 'Closes EBA exposure.'],
    ['UK_FCA_PAYMENT_SERVICES', 'UK_FCA_PSR_2017', 'uk_fca_psr_missing', 'UK', ['fintech'], 'P0',
      'FCA + Payment Systems Regulator', 'https://www.fca.org.uk/firms/payment-services-regulations',
      'Payment Services Regulations 2017 + APP Fraud Reimbursement',
      'Up to unlimited + authorisation withdrawal', 0,
      /PSR 2017|Payment Services Regulations|PSP authorisation|APP fraud reimbursement|FCA payment services/i,
      'UK PSR 2017 + 2024 APP fraud rules require mandatory reimbursement for authorised push payment fraud (£415K cap).',
      'Publish PSR authorisation + APP fraud reimbursement policy.', 'Closes FCA exposure.'],

    // ---- BIOMETRIC PRIVACY ----
    ['US_TX_CUBI_BIOMETRIC', 'US_TX_CUBI_2009', 'us_tx_cubi_missing', 'US', null, 'P1',
      'Texas Attorney General', 'https://www.texasattorneygeneral.gov/',
      'Texas Capture or Use of Biometric Identifier Act (CUBI)',
      'Up to $25,000 per violation', 25000,
      /Texas CUBI|capture or use of biometric|TX biometric|Texas biometric notice/i,
      'TX CUBI requires informed consent before capturing biometric identifiers (fingerprint, retina, voice, face).',
      'Publish TX biometric notice + consent mechanism.', 'Closes TX AG exposure.'],
    ['US_WA_MY_HEALTH_DATA', 'US_WA_MHMDA_2024', 'us_wa_mhmda_missing', 'US', null, 'P0',
      'Washington Attorney General', 'https://www.atg.wa.gov/',
      'Washington My Health My Data Act',
      'Up to $7,500 + private right of action', 7500,
      /My Health My Data|MHMDA|Washington consumer health|WA health privacy/i,
      'WA MHMDA imposes opt-in consent + privacy policy + ban on geofencing health facilities.',
      'Publish WA MHMDA-compliant consumer health data notice.', 'Closes WA AG exposure.'],

    // ---- ACCESSIBILITY ----
    ['US_SECTION_508', 'US_SECTION_508', 'us_section_508_missing', 'US', null, 'P1',
      'US Access Board + Federal Procurement', 'https://www.section508.gov/',
      'Section 508 of the Rehabilitation Act',
      'Federal contract loss', 0,
      /Section 508|Rehabilitation Act 508|ICT accessibility|VPAT|Voluntary Product Accessibility/i,
      'Section 508 requires federal agencies + vendors to ensure ICT accessibility (WCAG 2.0 AA equivalent).',
      'Publish VPAT/ACR conformance report.', 'Closes federal procurement exposure.'],
    ['EU_EAA_ACCESSIBILITY', 'EU_EAA_2019_882', 'eu_eaa_missing', 'EU', ['ecommerce', 'saas', 'fintech'], 'P0',
      'European Commission + Member State market surveillance', 'https://employment-social-affairs.ec.europa.eu/policies-and-activities/social-protection-social-inclusion/persons-disabilities/union-equality-strategy-rights-persons-disabilities-2021-2030/european-accessibility-act_en',
      'European Accessibility Act (Directive 2019/882)',
      'Up to €1M per Member State', 1000000,
      /European Accessibility Act|EAA 2025|EN 301 549|EU accessibility statement/i,
      'EAA (in force 28 Jun 2025) covers ecommerce, banking, ebooks, ticketing, transport ticketing services.',
      'Publish EAA-compliant accessibility statement + remediation plan.', 'Closes Member State market surveillance exposure.'],
    ['CA_AODA_ONTARIO', 'CA_AODA_2005', 'ca_aoda_missing', 'CA', null, 'P2',
      'Ontario Ministry for Seniors and Accessibility', 'https://www.ontario.ca/page/accessibility-laws',
      'Accessibility for Ontarians with Disabilities Act (AODA)',
      'Up to CAD 100K per day for corporations', 100000,
      /AODA|Accessibility Ontarians Disabilities|Ontario accessibility|WCAG 2.0 AODA/i,
      'AODA requires WCAG 2.0 AA compliance for Ontario private orgs with 50+ employees.',
      'Publish AODA WCAG 2.0 AA conformance + multi-year accessibility plan.', 'Closes Ontario exposure.'],

    // ---- ADDITIONAL EU MOSAIC ----
    ['EU_LU_CNPD', 'LU_CNPD', 'eu_lu_privacy_missing', 'EU', null, 'P2',
      'CNPD (Luxembourg DPA)', 'https://cnpd.public.lu/',
      'Luxembourg Data Protection Act (1 August 2018)',
      'Up to 4% global turnover under GDPR', 0,
      /CNPD|Luxembourg Data Protection|luxembourgish privacy|en luxembourgeois données/i,
      'CNPD enforces GDPR in Luxembourg with sector-specific rules for banking + insurance.',
      'Add LU-language privacy notice (FR/DE/LU).', 'Closes LU exposure.'],
    ['EU_AT_TKG_TELECOM', 'AT_TKG_2021', 'eu_at_tkg_missing', 'EU', ['telco'], 'P2',
      'RTR (Austrian Telecom Regulator)', 'https://www.rtr.at/',
      'Austrian Telecommunications Act (TKG 2021)',
      'Up to €1M per violation', 1000000,
      /TKG 2021|RTR Austria|austrian telecommunications|Telekommunikationsgesetz/i,
      'TKG 2021 transposes EECC into Austrian law + cookie consent rules.',
      'Register with RTR + publish TKG-compliant terms.', 'Closes RTR exposure.'],
    ['EU_BG_CPDP_GDPR', 'BG_CPDP', 'eu_bg_privacy_missing', 'EU', null, 'P2',
      'CPDP (Bulgarian DPA)', 'https://www.cpdp.bg/',
      'Bulgarian Personal Data Protection Act',
      'Up to 4% global turnover under GDPR', 0,
      /CPDP|Bulgarian Data Protection|български privacy|Bulgarian privacy notice/i,
      'CPDP enforces GDPR in Bulgaria + national derogations.',
      'Add Bulgarian-language privacy notice.', 'Closes BG exposure.'],
    ['EU_HR_AZOP_GDPR', 'HR_AZOP', 'eu_hr_privacy_missing', 'EU', null, 'P2',
      'AZOP (Croatian DPA)', 'https://azop.hr/',
      'Croatian Data Protection Implementing Act',
      'Up to 4% global turnover under GDPR', 0,
      /AZOP|Croatian Data Protection|hrvatski privacy|Croatian privacy notice/i,
      'AZOP enforces GDPR in Croatia.',
      'Add Croatian-language privacy notice.', 'Closes HR exposure.'],
    ['EU_SK_UOOU_GDPR', 'SK_UOOU', 'eu_sk_privacy_missing', 'EU', null, 'P2',
      'ÚOOÚ SR (Slovak DPA)', 'https://dataprotection.gov.sk/',
      'Slovak Data Protection Act 18/2018',
      'Up to 4% global turnover under GDPR', 0,
      /ÚOOÚ SR|Slovak Data Protection|slovensky privacy|Slovak privacy notice/i,
      'Slovak ÚOOÚ enforces GDPR + Act 18/2018 derogations.',
      'Add Slovak-language privacy notice.', 'Closes SK exposure.'],
    ['EU_SI_IP_GDPR', 'SI_IP', 'eu_si_privacy_missing', 'EU', null, 'P2',
      'IP (Slovenian Information Commissioner)', 'https://www.ip-rs.si/',
      'Slovenian Personal Data Protection Act ZVOP-2',
      'Up to 4% global turnover under GDPR', 0,
      /IP-RS|Slovenian Data Protection|slovensko privacy|Slovenian privacy notice|ZVOP-2/i,
      'Slovenian IP enforces GDPR + ZVOP-2.',
      'Add Slovenian-language privacy notice.', 'Closes SI exposure.'],
    ['EU_MT_IDPC_GDPR', 'MT_IDPC', 'eu_mt_privacy_missing', 'EU', null, 'P2',
      'IDPC (Maltese DPA)', 'https://idpc.org.mt/',
      'Maltese Data Protection Act (Chapter 586)',
      'Up to 4% global turnover under GDPR', 0,
      /IDPC|Maltese Data Protection|Malta privacy|Maltese privacy notice/i,
      'IDPC enforces GDPR in Malta + sector-specific rules for gaming + e-commerce.',
      'Add English/Maltese privacy notice for MT data subjects.', 'Closes MT exposure.'],
    ['EU_CY_OFFICE_DPO', 'CY_DPO', 'eu_cy_privacy_missing', 'EU', null, 'P2',
      'OPD (Cyprus DPA)', 'https://www.dataprotection.gov.cy/',
      'Cypriot Data Protection Law 125(I)/2018',
      'Up to 4% global turnover under GDPR', 0,
      /OPD Cyprus|Cyprus Data Protection|ελληνικά Κύπρος|Cypriot privacy notice/i,
      'OPD enforces GDPR in Cyprus.',
      'Add English/Greek privacy notice for CY data subjects.', 'Closes CY exposure.'],

    // ---- ASIA DEPTH ----
    ['APAC_SG_MAS_TRM', 'SG_MAS_TRM_2021', 'apac_sg_mas_trm_missing', 'SG', ['fintech', 'finance'], 'P0',
      'MAS', 'https://www.mas.gov.sg/regulation/guidelines/technology-risk-management-guidelines',
      'MAS Technology Risk Management Guidelines (Jan 2021)',
      'Authorisation withdrawal + supervisory action', 0,
      /MAS TRM|Technology Risk Management|MAS cybersecurity|MAS notice on cyber/i,
      'MAS TRM Guidelines + Notice on Cyber Hygiene mandate cyber security controls for FIs.',
      'Publish MAS TRM + Cyber Hygiene Notice compliance.', 'Closes MAS exposure.'],
    ['APAC_SG_FINANCIAL_ADVISERS', 'SG_FAA_2001', 'apac_sg_faa_missing', 'SG', ['finance'], 'P1',
      'MAS', 'https://www.mas.gov.sg/regulation/acts/financial-advisers-act',
      'Financial Advisers Act (Singapore)',
      'Up to SGD 250K + 5 years', 250000,
      /Financial Advisers Act|FAA Singapore|MAS FAR|fair dealing guidelines/i,
      'FAA + Fair Dealing Guidelines regulate licensed financial advisers + product advisers.',
      'Publish FAA licence + Fair Dealing compliance.', 'Closes MAS exposure.'],
    ['APAC_AU_ASIC_RG271', 'AU_ASIC_RG271', 'apac_au_asic_idr_missing', 'AU', ['finance', 'fintech', 'insurance'], 'P1',
      'ASIC', 'https://asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-271-internal-dispute-resolution/',
      'ASIC RG271 Internal Dispute Resolution',
      'Civil penalties + AFCA escalation', 0,
      /RG271|ASIC dispute resolution|internal dispute resolution|AFCA Australia/i,
      'AU ASIC RG271 (in force Oct 2021) requires standardised IDR for financial firms.',
      'Publish RG271-compliant IDR procedure + AFCA membership.', 'Closes ASIC exposure.'],
    ['APAC_JP_FSA_FUNDS', 'JP_FSA_FIEA', 'apac_jp_fsa_missing', 'JP', ['fintech', 'finance'], 'P1',
      'JP Financial Services Agency', 'https://www.fsa.go.jp/en/',
      'Japan Financial Instruments and Exchange Act (FIEA)',
      'Up to JPY 700M + criminal', 700000000,
      /FIEA|Financial Instruments and Exchange Act|FSA Japan|Type I\/II financial instruments business/i,
      'JP FIEA governs financial instruments business + crypto exchanges; FSA registration required.',
      'Publish FSA registration + FIEA compliance statement.', 'Closes FSA exposure.'],
    ['APAC_HK_SFC_TYPE_1', 'HK_SFO_TYPE_1', 'apac_hk_sfo_missing', 'HK', ['finance', 'fintech'], 'P0',
      'SFC (Securities and Futures Commission)', 'https://www.sfc.hk/',
      'Securities and Futures Ordinance · Type 1-12 Regulated Activities',
      'Up to HKD 10M + criminal', 10000000,
      /SFC Type 1|Securities Futures Ordinance|SFC licensed|HK SFO|Type 9 asset management/i,
      'HK SFO requires SFC licence for regulated activities (Type 1 dealing, Type 9 asset management, etc.).',
      'Publish SFC licence + Type designation.', 'Closes SFC exposure.'],
    ['APAC_HK_HKMA_AUTHORIZED', 'HK_HKMA_BO', 'apac_hk_hkma_missing', 'HK', ['fintech', 'finance'], 'P0',
      'HKMA (Hong Kong Monetary Authority)', 'https://www.hkma.gov.hk/',
      'HK Banking Ordinance + Stored Value Facilities (Payment Systems) Ordinance',
      'Up to HKD 5M + criminal', 5000000,
      /HKMA Authorized Institution|Banking Ordinance|SVF licence|HKMA banking/i,
      'HKMA regulates Authorized Institutions (banks, restricted licence banks, deposit-taking companies) + SVF licensees.',
      'Publish HKMA AI/SVF licence + Banking Ordinance compliance.', 'Closes HKMA exposure.'],

    // ---- ADDITIONAL CHARITY ----
    ['UK_CHARITY_COMMISSION', 'UK_CC_CHARITIES_ACT_2011', 'uk_charity_register_missing', 'UK', null, 'P1',
      'Charity Commission for England and Wales', 'https://www.gov.uk/government/organisations/charity-commission',
      'Charities Act 2011',
      'Registration deregistration + fines', 0,
      /Charity Commission|Charities Act 2011|UK charity number|registered charity England/i,
      'Charities Act 2011 requires registration for charities with income £5K+ + annual return + accounts.',
      'Publish Charity Commission number + annual return status.', 'Closes Charity Commission exposure.'],

    // ---- ADDITIONAL ESG ----
    ['GLOBAL_GRI_305_EMISSIONS', 'GRI_305', 'global_gri_305_missing', '*', null, 'P2',
      'GRI', 'https://www.globalreporting.org/standards/standards-development/topic-standard-project-for-climate-change/',
      'GRI 305: Emissions 2016 + 2024 Climate Change update',
      'Investor signal', 0,
      /GRI 305|Scope 1 emissions|Scope 2 emissions|Scope 3 emissions|GHG inventory/i,
      'GRI 305 (and the 2024 Climate Change update) is the GRI topic standard for Scope 1/2/3 emissions disclosure.',
      'Publish GRI 305-aligned Scope 1/2/3 emissions inventory.', 'Lifts investor signal.'],
    ['GLOBAL_GRI_302_ENERGY', 'GRI_302', 'global_gri_302_missing', '*', null, 'P2',
      'GRI', 'https://www.globalreporting.org/standards/',
      'GRI 302: Energy 2016',
      'Investor signal', 0,
      /GRI 302|energy consumption|energy intensity|renewable energy disclosure/i,
      'GRI 302 covers organizational energy consumption, intensity, and reductions.',
      'Publish GRI 302-aligned energy disclosure.', 'Lifts investor signal.'],
    ['GLOBAL_GRI_303_WATER', 'GRI_303', 'global_gri_303_missing', '*', null, 'P2',
      'GRI', 'https://www.globalreporting.org/standards/',
      'GRI 303: Water and Effluents 2018',
      'Investor + procurement signal', 0,
      /GRI 303|water withdrawal|water-related impacts|water discharge|water stress/i,
      'GRI 303 covers water-related impacts including withdrawal, discharge, and water stress.',
      'Publish GRI 303-aligned water disclosure.', 'Lifts investor signal.'],
    ['UK_GREEN_TAXONOMY', 'UK_GREEN_TAXONOMY_2024', 'uk_green_tax_missing', 'UK', null, 'P2',
      'HM Treasury + FCA', 'https://www.gov.uk/government/consultations/consultation-on-the-value-case-for-a-uk-green-taxonomy',
      'UK Green Taxonomy (in development)',
      'Investor signal', 0,
      /UK Green Taxonomy|green taxonomy UK|Sustainable Disclosure Requirements|SDR FCA/i,
      'UK Green Taxonomy + FCA SDR establish disclosure requirements for sustainable investment claims.',
      'Publish FCA SDR-aligned sustainability disclosures.', 'Lifts UK retail investor signal.'],

    // ---- ANTI-BRIBERY ADDITIONAL ----
    ['EU_FR_SAPIN_II', 'FR_SAPIN_II_2016', 'eu_fr_sapin_ii_missing', 'EU', null, 'P0',
      'AFA (Agence Française Anticorruption)', 'https://www.agence-francaise-anticorruption.gouv.fr/',
      'Loi Sapin II (Loi 2016-1691)',
      'Up to €1M (corp) or €200K (individual)', 1000000,
      /Sapin II|Loi Sapin II|AFA Anticorruption|programme anticorruption français/i,
      'FR Sapin II applies to firms 500+ employees or €100M turnover with French nexus; AFA enforces.',
      'Publish Sapin II-compliant anti-corruption programme + risk mapping.', 'Closes AFA exposure.'],
    ['APAC_AU_FOREIGN_BRIBERY', 'AU_CRIM_CODE_70', 'apac_au_foreign_bribery_missing', 'AU', null, 'P1',
      'AFP + CDPP', 'https://www.afp.gov.au/',
      'Australian Criminal Code Act 1995 Division 70',
      'Up to AUD 31.3M corp + 10 years individual', 31300000,
      /Australian foreign bribery|Criminal Code 70|AFP anti-bribery|AU anti-bribery policy/i,
      'AU Criminal Code Div 70 criminalises foreign bribery; corporate liability via failure to prevent offences.',
      'Publish anti-bribery policy + Aus foreign bribery compliance.', 'Closes AFP exposure.'],
    ['NA_CA_CFPOA', 'CA_CFPOA_1998', 'na_ca_cfpoa_missing', 'CA', null, 'P2',
      'RCMP', 'https://www.rcmp-grc.gc.ca/',
      'Corruption of Foreign Public Officials Act (CFPOA)',
      'Unlimited fines + 14 years imprisonment', 0,
      /CFPOA|Corruption Foreign Public Officials|Canadian anti-corruption|RCMP corruption/i,
      'CA CFPOA criminalises bribery of foreign officials with extraterritorial reach for Canadian persons.',
      'Publish CFPOA-compliant anti-bribery programme.', 'Closes RCMP exposure.'],

    // ---- CRYPTO/DASP ----
    ['EU_MICA_CRYPTO', 'EU_MICA_2023_1114', 'eu_mica_missing', 'EU', ['fintech'], 'P0',
      'EBA + ESMA + Member State NCAs', 'https://eur-lex.europa.eu/eli/reg/2023/1114/oj',
      'Markets in Crypto-Assets Regulation (Regulation EU 2023/1114)',
      'Up to 5% turnover or €5M', 5000000,
      /MiCA|Markets in Crypto-Assets|crypto-asset white paper|CASP authorisation|MiCA compliance/i,
      'MiCA (Asset-referenced + e-money tokens from 30 Jun 2024, CASP from 30 Dec 2024) sets EU-wide crypto regime.',
      'Publish MiCA white paper + CASP authorisation status.', 'Closes EU crypto exposure.'],
    ['UK_FCA_CRYPTOASSET_PROMO', 'UK_FCA_CAPR_2023', 'uk_fca_cryptopromo_missing', 'UK', ['fintech'], 'P0',
      'FCA', 'https://www.fca.org.uk/firms/cryptoassets',
      'UK Cryptoasset Financial Promotion Regime',
      'Up to unlimited fines + criminal', 0,
      /Cryptoasset Financial Promotion|FCA crypto promo|S21 FSMA crypto|cooling-off period crypto/i,
      'UK FCA Cryptoasset Promotion regime (8 Oct 2023) requires authorised approval + 24-hour cooling-off.',
      'Publish FCA cryptoasset promotion compliance + risk warnings.', 'Closes FCA exposure.'],
    ['US_FINCEN_CVC_MSB', 'US_FINCEN_MSB_CVC', 'us_fincen_msb_missing', 'US', ['fintech'], 'P0',
      'FinCEN', 'https://www.fincen.gov/resources/statutes-and-regulations/guidance/application-fincens-regulations-persons-administering',
      'FinCEN MSB Registration + CVC Travel Rule',
      'Up to $250K + criminal', 250000,
      /FinCEN MSB|Money Services Business|CVC Travel Rule|FinCEN crypto guidance|virtual currency MSB/i,
      'FinCEN treats most crypto exchangers as MSBs; registration + AML programme + Travel Rule (>$3K) required.',
      'Register as FinCEN MSB + publish AML + Travel Rule compliance.', 'Closes FinCEN exposure.'],

    // ---- ADDITIONAL FINTECH ----
    ['UK_FCA_CASS_CLIENT_MONEY', 'UK_FCA_CASS', 'uk_fca_cass_missing', 'UK', ['finance', 'fintech'], 'P0',
      'FCA', 'https://www.handbook.fca.org.uk/handbook/CASS/',
      'FCA CASS (Client Assets Sourcebook)',
      'Up to unlimited + criminal', 0,
      /CASS rules|FCA Client Assets|client money rules|CASS audit|FCA CASS oversight/i,
      'FCA CASS imposes segregation, reconciliation, and disclosure for client money + assets.',
      'Publish CASS compliance + audit attestation.', 'Closes FCA exposure.'],

    // ---- CHINA (limited applicability but rules exist for global brands) ----
    ['APAC_CN_PIPL', 'CN_PIPL_2021', 'apac_cn_pipl_missing', 'CN', null, 'P1',
      'CAC (Cyberspace Administration of China)', 'http://www.cac.gov.cn/',
      'Personal Information Protection Law (PIPL)',
      'Up to CNY 50M or 5% turnover', 50000000,
      /PIPL|Personal Information Protection Law|CAC China|cross-border data China|中国个人信息保护法/i,
      'PIPL applies extraterritorially to processing of PRC residents\' data; SCC/security assessment for cross-border transfer.',
      'Publish PIPL-compliant Chinese-language privacy notice + cross-border data mechanism.', 'Closes CAC exposure.'],
    ['APAC_CN_DSL_DATA_SECURITY', 'CN_DSL_2021', 'apac_cn_dsl_missing', 'CN', null, 'P2',
      'CAC + MIIT', 'http://www.cac.gov.cn/',
      'Data Security Law of the PRC',
      'Up to CNY 10M + criminal', 10000000,
      /China DSL|Data Security Law PRC|data classification China|important data China/i,
      'PRC DSL governs data classification, security obligations, and important data handling.',
      'Publish PRC DSL data classification mapping if processing CN data.', 'Closes CAC exposure.'],

    // ---- ADDITIONAL US ----
    ['US_NLRA_LABOR', 'US_NLRA_1935', 'us_nlra_missing', 'US', null, 'P2',
      'NLRB', 'https://www.nlrb.gov/',
      'National Labor Relations Act',
      'Posting + reinstatement + back-pay', 0,
      /NLRA|National Labor Relations|NLRB|protected concerted activity|Section 7 NLRA/i,
      'NLRA protects employees\' Section 7 rights to engage in concerted activity; overly broad social media policies are unlawful.',
      'Publish NLRA-compliant social media + handbook policies.', 'Closes NLRB exposure.'],
    ['US_FLSA_OVERTIME', 'US_FLSA_1938', 'us_flsa_missing', 'US', null, 'P1',
      'DOL Wage and Hour Division', 'https://www.dol.gov/agencies/whd/flsa',
      'Fair Labor Standards Act',
      'Liquidated damages + class actions', 0,
      /FLSA|Fair Labor Standards|overtime rule|exempt vs non-exempt|FLSA classification/i,
      'FLSA mandates federal minimum wage + overtime + classification rules; misclassification is the most common claim.',
      'Publish FLSA classification policy + audit.', 'Closes DOL exposure.'],
    ['US_EEOC_TITLE_VII', 'US_TITLE_VII_1964', 'us_eeoc_title_vii_missing', 'US', null, 'P0',
      'EEOC', 'https://www.eeoc.gov/',
      'Title VII Civil Rights Act 1964',
      'Up to $300K compensatory + class', 300000,
      /Title VII|Civil Rights Act 1964|EEOC compliance|EEO statement|equal employment opportunity/i,
      'Title VII bars employment discrimination on race, color, religion, sex, national origin.',
      'Publish EEO statement + Title VII-compliant handbook + harassment policy.', 'Closes EEOC exposure.'],
    ['US_ADEA_AGE_DISCRIM', 'US_ADEA_1967', 'us_adea_missing', 'US', null, 'P1',
      'EEOC', 'https://www.eeoc.gov/age-discrimination',
      'Age Discrimination in Employment Act',
      'Liquidated damages + class actions', 0,
      /ADEA|Age Discrimination Employment|EEOC age|age 40 protected/i,
      'ADEA bars discrimination against 40+ employees; applies to firms 20+ employees.',
      'Publish ADEA-compliant hiring + performance management procedures.', 'Closes EEOC exposure.'],

    // ---- ADDITIONAL UK ----
    ['UK_TUPE_2006', 'UK_TUPE_2006', 'uk_tupe_missing', 'UK', null, 'P1',
      'BEIS + Employment Tribunals', 'https://www.gov.uk/transfers-takeovers',
      'Transfer of Undertakings (Protection of Employment) Regulations 2006',
      'Punitive ET awards + protective awards', 0,
      /TUPE|Transfer Undertakings Protection Employment|TUPE consultation|TUPE transfer rights/i,
      'TUPE protects employees on business + service-provision change transfers; consultation + information mandatory.',
      'Publish TUPE compliance + consultation procedure.', 'Closes ET exposure.'],
    ['UK_RTW_RIGHT_TO_WORK', 'UK_IRWA_2014', 'uk_rtw_missing', 'UK', null, 'P0',
      'Home Office UKVI', 'https://www.gov.uk/check-job-applicant-right-to-work',
      'Immigration, Asylum and Nationality Act 2006 + 2022 amendments',
      'Up to £45K per illegal worker', 45000,
      /right to work check|UKVI RTW|share code|UKVI compliance|illegal working penalty/i,
      'UK RTW checks must be performed pre-employment via UKVI Online Right to Work service or document check.',
      'Publish RTW compliance procedure + UKVI Online check usage.', 'Closes Home Office exposure.'],
    ['UK_NMW_NLW', 'UK_NMW_1998', 'uk_nmw_missing', 'UK', null, 'P1',
      'HMRC NMW Enforcement + BEIS naming + shaming', 'https://www.gov.uk/national-minimum-wage',
      'National Minimum Wage Act 1998',
      'Up to 200% underpayment + naming', 0,
      /National Minimum Wage|National Living Wage|NMW compliance|NMW arrears|HMRC NMW/i,
      'HMRC enforces NMW + NLW; arrears + 200% penalty + naming and shaming for underpayers.',
      'Publish NMW/NLW compliance + audit procedure.', 'Closes HMRC exposure.'],

    // ---- ADDITIONAL UAE ----
    ['UAE_DUBAI_VARA', 'UAE_VARA_2022', 'uae_vara_missing', 'AE', ['fintech'], 'P0',
      'Dubai Virtual Assets Regulatory Authority (VARA)', 'https://www.vara.ae/',
      'Dubai Law No. 4 of 2022 (Virtual Assets)',
      'Up to AED 10M + licence revocation', 10000000,
      /VARA|Virtual Assets Regulatory Authority|Dubai virtual asset licence|VASP Dubai/i,
      'Dubai VARA regulates virtual asset service providers (VASPs) operating in or from Dubai (ex-DIFC).',
      'Publish VARA VASP licence + compliance statement.', 'Closes VARA exposure.', { city_gate: ['Dubai'] }],
    ['UAE_DIFC_DFSA', 'UAE_DFSA', 'uae_dfsa_missing', 'AE', ['finance', 'fintech', 'insurance'], 'P0',
      'DFSA (Dubai Financial Services Authority)', 'https://www.dfsa.ae/',
      'DFSA Rulebook',
      'Up to USD 10M + licence revocation', 10000000,
      /DFSA|Dubai Financial Services Authority|DIFC licensed|DFSA Rulebook|Authorised Firm DIFC/i,
      'DFSA regulates financial firms in DIFC free zone; authorisation + COB + AML compliance required.',
      'Publish DFSA authorisation + Rulebook compliance status.', 'Closes DFSA exposure.', { city_gate: ['Dubai'] }],
    ['UAE_ADGM_FSRA', 'UAE_FSRA_ADGM', 'uae_fsra_missing', 'AE', ['finance', 'fintech', 'insurance'], 'P0',
      'FSRA (Financial Services Regulatory Authority ADGM)', 'https://www.adgm.com/operating-in-adgm/financial-services-regulatory-authority',
      'ADGM Financial Services and Markets Regulations',
      'Substantial fines + licence revocation', 0,
      /FSRA|Financial Services Regulatory Authority ADGM|ADGM authorisation|ADGM FSMR/i,
      'FSRA regulates financial firms in ADGM free zone; authorisation + COBS + AML compliance required.',
      'Publish FSRA authorisation + FSMR compliance status.', 'Closes FSRA exposure.', { city_gate: ['Abu Dhabi'] }],

    // ---- ADDITIONAL INDIA ----
    ['IN_SEBI_LODR', 'IN_SEBI_LODR_2015', 'in_sebi_lodr_missing', 'IN', null, 'P0',
      'SEBI', 'https://www.sebi.gov.in/',
      'SEBI Listing Obligations and Disclosure Requirements Regulations 2015',
      'Up to INR 25 Cr + criminal', 250000000,
      /SEBI LODR|Listing Obligations|SEBI disclosure|BRSR|Business Responsibility Sustainability/i,
      'SEBI LODR covers listed entities + BRSR + ESG disclosures.',
      'Publish SEBI LODR + BRSR compliance.', 'Closes SEBI exposure.'],
    ['IN_FEMA_FOREIGN_EXCHANGE', 'IN_FEMA_1999', 'in_fema_missing', 'IN', null, 'P1',
      'RBI + Enforcement Directorate', 'https://www.rbi.org.in/Scripts/BS_FemaNotifications.aspx',
      'Foreign Exchange Management Act 1999',
      '3x the amount + criminal', 0,
      /FEMA|Foreign Exchange Management Act|RBI FEMA|ED FEMA/i,
      'FEMA governs all foreign exchange transactions in India; ED + RBI enforce.',
      'Publish FEMA compliance + cross-border reporting procedure.', 'Closes RBI exposure.'],

    // ---- ADDITIONAL SAUDI ----
    ['SA_ZATCA_E_INVOICING', 'SA_ZATCA_FATOORAH', 'sa_zatca_einv_missing', 'SA', null, 'P1',
      'ZATCA (Zakat, Tax and Customs Authority)', 'https://zatca.gov.sa/',
      'Saudi E-Invoicing (Fatoorah) Regulations',
      'Up to SAR 50K per violation', 50000,
      /ZATCA|Fatoorah|e-invoicing Saudi|Phase 2 integration|XML invoice Saudi/i,
      'KSA ZATCA mandates e-invoicing in XML format with QR + ZATCA integration (Phase 2 rolling out by group).',
      'Publish ZATCA Fatoorah Phase 2 compliance.', 'Closes ZATCA exposure.'],
    ['SA_CITC_TELECOM', 'SA_CITC', 'sa_citc_missing', 'SA', ['telco', 'saas'], 'P1',
      'CITC (Communications, Space and Technology Commission)', 'https://www.citc.gov.sa/',
      'CITC Telecom Act',
      'Up to SAR 5M + service blocking', 5000000,
      /CITC|Communications Space Technology Commission|CITC licence|Saudi telecom regulator/i,
      'CITC regulates telecoms + cloud computing + digital services in Saudi.',
      'Publish CITC registration + compliance status.', 'Closes CITC exposure.']
  ]),

  // =============================================================================
  // BATCH 9 · push to 400-rule target
  //   - PCI DSS · ISO 27001/27018/27701 · SOC 2 · DPIA + GDPR Art 25
  //   - Medical Devices · Pharma GMP · NHTSA · Toy Safety · Cosmetics
  //   - DMCA · Copyright Directive · Lanham Act · FTC Endorsement Guides
  //   - Gambling per jurisdiction · Cannabis state · ABC test/PAGA
  //   - HIPAA Security · CGMP · Sarbanes-Oxley deeper · CSRD ESRS
  //   - Additional country gaps · niche regulators
  // =============================================================================
  ...batchRules([
    // ---- PAYMENT CARD / SECURITY ----
    ['GLOBAL_PCI_DSS_V4', 'PCI_DSS_V4_0', 'global_pci_dss_missing', '*', ['ecommerce', 'fintech', 'hospitality'], 'P0',
      'PCI Security Standards Council + Card Brands', 'https://www.pcisecuritystandards.org/',
      'PCI DSS v4.0',
      'Up to $100K per month + card-brand fines', 100000,
      /PCI DSS|Payment Card Industry|PCI compliance|SAQ|AOC PCI|PCI ROC/i,
      'PCI DSS v4.0 (effective 31 Mar 2024, future-dated requirements by 31 Mar 2025) applies to any entity handling cardholder data.',
      'Publish PCI DSS v4.0 SAQ/AOC + RoC if Level 1.', 'Closes acquirer + card-brand exposure.'],
    ['GLOBAL_ISO_27001', 'ISO_27001_2022', 'global_iso_27001_missing', '*', ['saas', 'enterprise-saas', 'fintech'], 'P1',
      'ISO + accredited certification bodies', 'https://www.iso.org/standard/27001',
      'ISO/IEC 27001:2022',
      'Procurement loss + enterprise gate', 0,
      /ISO 27001|ISO\/IEC 27001|ISMS certification|Statement of Applicability/i,
      'ISO 27001:2022 is the global ISMS standard; enterprise customers and tenders increasingly require it.',
      'Publish ISO 27001:2022 certificate + Statement of Applicability.', 'Closes enterprise procurement gate.'],
    ['GLOBAL_ISO_27701_PIMS', 'ISO_27701_2019', 'global_iso_27701_missing', '*', ['saas'], 'P2',
      'ISO + accredited certification bodies', 'https://www.iso.org/standard/71670.html',
      'ISO/IEC 27701:2019 Privacy Information Management',
      'Procurement signal', 0,
      /ISO 27701|PIMS|Privacy Information Management|ISO 27701 certificate/i,
      'ISO 27701 extends 27001 with privacy controls aligned to GDPR + LGPD + CCPA.',
      'Publish ISO 27701 certificate.', 'Lifts privacy assurance signal.'],
    ['GLOBAL_ISO_27018_CLOUD', 'ISO_27018_2019', 'global_iso_27018_missing', '*', ['saas'], 'P2',
      'ISO + accredited certification bodies', 'https://www.iso.org/standard/76559.html',
      'ISO/IEC 27018:2019 PII in Public Cloud',
      'Cloud procurement signal', 0,
      /ISO 27018|PII in public cloud|Cloud privacy ISO/i,
      'ISO 27018 covers PII protection in public cloud computing environments.',
      'Publish ISO 27018 certificate.', 'Lifts cloud privacy signal.'],
    ['GLOBAL_SOC_2', 'AICPA_SOC_2', 'global_soc_2_missing', '*', ['saas', 'enterprise-saas'], 'P0',
      'AICPA + licensed CPA firm auditors', 'https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2',
      'AICPA SOC 2 Type II',
      'Enterprise procurement disqualification', 0,
      /SOC 2|SOC2|SOC 2 Type II|Trust Service Criteria|TSC/i,
      'SOC 2 Type II is the de facto enterprise SaaS assurance report (TSC: Security, Availability, Processing Integrity, Confidentiality, Privacy).',
      'Publish current SOC 2 Type II report under NDA.', 'Closes enterprise procurement gate.'],
    ['GLOBAL_NIST_CSF_2', 'NIST_CSF_2_0', 'global_nist_csf_missing', '*', null, 'P2',
      'NIST', 'https://www.nist.gov/cyberframework',
      'NIST Cybersecurity Framework 2.0',
      'Procurement signal', 0,
      /NIST CSF|NIST Cybersecurity Framework|CSF 2\.0|Govern Identify Protect Detect/i,
      'NIST CSF 2.0 (Feb 2024) added Govern function; widely adopted globally for cyber posture.',
      'Publish NIST CSF 2.0 alignment + profile.', 'Lifts security maturity signal.'],

    // ---- GDPR DEEP ----
    ['EU_GDPR_ART_25_BY_DESIGN', 'EU_GDPR_ART_25', 'eu_gdpr_pbd_missing', 'EU', null, 'P1',
      'EDPB + Member State DPAs', 'https://gdpr-info.eu/art-25-gdpr/',
      'GDPR Article 25 · Data Protection by Design and by Default',
      'Up to 4% global turnover', 0,
      /Privacy by Design|Data Protection by Design|GDPR Article 25|PbD attestation/i,
      'GDPR Art 25 requires technical + organisational measures embedded into processing at design time + by default.',
      'Publish PbD attestation + data minimisation evidence.', 'Closes EDPB exposure.'],
    ['EU_GDPR_ART_35_DPIA', 'EU_GDPR_ART_35', 'eu_gdpr_dpia_missing', 'EU', null, 'P0',
      'EDPB + Member State DPAs', 'https://gdpr-info.eu/art-35-gdpr/',
      'GDPR Article 35 · Data Protection Impact Assessment',
      'Up to 4% global turnover', 0,
      /DPIA|Data Protection Impact Assessment|GDPR Article 35|prior consultation Art 36/i,
      'GDPR Art 35 requires a DPIA for high-risk processing; ICO/CNIL/AEPD audit logs first.',
      'Publish DPIA register + Art 36 prior consultation procedure.', 'Closes DPA exposure.'],
    ['EU_GDPR_ART_30_ROPA', 'EU_GDPR_ART_30', 'eu_gdpr_ropa_missing', 'EU', null, 'P0',
      'EDPB + Member State DPAs', 'https://gdpr-info.eu/art-30-gdpr/',
      'GDPR Article 30 · Records of Processing Activities',
      'Up to 4% global turnover', 0,
      /ROPA|Records of Processing|GDPR Article 30|Article 30 register/i,
      'GDPR Art 30 mandates ROPA for all controllers/processors with 250+ employees + most others.',
      'Maintain GDPR Art 30 ROPA + make available to supervisory authority.', 'Closes DPA exposure.'],
    ['EU_EDPB_INTERNATIONAL_TRANSFERS', 'EU_GDPR_CHAPTER_V', 'eu_idt_missing', 'EU', null, 'P0',
      'EDPB + Member State DPAs', 'https://www.edpb.europa.eu/our-work-tools/our-documents/recommendations/edpb-recommendations-022020-european-essential_en',
      'GDPR Chapter V + EDPB Schrems II Recommendations',
      'Up to 4% global turnover + transfer ban', 0,
      /SCC|Standard Contractual Clauses|transfer impact assessment|TIA Schrems II|adequacy decision/i,
      'GDPR Chapter V requires lawful transfer mechanism + Transfer Impact Assessment post-Schrems II.',
      'Publish SCC + TIA + supplementary measures for non-adequate third country transfers.', 'Closes EDPB exposure.'],

    // ---- HEALTHCARE / PHARMA / MEDICAL DEVICES ----
    ['EU_MDR_MEDICAL_DEVICES', 'EU_MDR_2017_745', 'eu_mdr_missing', 'EU', ['healthcare', 'manufacturing'], 'P0',
      'European Commission + Member State competent authorities', 'https://health.ec.europa.eu/medical-devices-sector_en',
      'EU Medical Device Regulation (Regulation EU 2017/745)',
      'Withdrawal + Member State criminal', 0,
      /MDR 2017\/745|EU Medical Device Regulation|UDI medical device|EUDAMED|MDR class III/i,
      'EU MDR replaces MDD; UDI + EUDAMED + class-based conformity assessment mandatory.',
      'Publish EU MDR conformity status + UDI + EUDAMED registration.', 'Closes CA + Notified Body exposure.'],
    ['EU_IVDR_IN_VITRO', 'EU_IVDR_2017_746', 'eu_ivdr_missing', 'EU', ['healthcare', 'manufacturing'], 'P0',
      'European Commission + Member State competent authorities', 'https://health.ec.europa.eu/medical-devices-sector_en',
      'EU In Vitro Diagnostic Regulation (Regulation EU 2017/746)',
      'Withdrawal + Member State criminal', 0,
      /IVDR|In Vitro Diagnostic Regulation|IVDR class B C D|EUDAMED IVD/i,
      'EU IVDR replaces IVDD; risk-classed conformity assessment + EUDAMED registration required.',
      'Publish IVDR conformity + EUDAMED + UDI evidence.', 'Closes Notified Body exposure.'],
    ['US_FDA_510K', 'US_FDA_510K', 'us_fda_510k_missing', 'US', ['healthcare'], 'P0',
      'FDA CDRH', 'https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/premarket-notification-510k',
      'FDA 510(k) Premarket Notification',
      'Withdrawal + civil + criminal', 0,
      /FDA 510\(k\)|510k clearance|FDA medical device clearance|PMA submission/i,
      'FDA 510(k) is the most common pathway for medical device clearance in the US.',
      'Publish 510(k) clearance numbers + PMA evidence.', 'Closes FDA exposure.'],
    ['GLOBAL_GMP_PHARMA', 'PIC_GMP', 'global_gmp_missing', '*', ['healthcare'], 'P0',
      'PIC/S + national pharma regulators', 'https://picscheme.org/',
      'PIC/S Guide to Good Manufacturing Practice',
      'Product recall + criminal', 0,
      /Good Manufacturing Practice|GMP|GMP certificate|cGMP|PIC\/S GMP/i,
      'GMP is required for pharmaceutical manufacturing globally; cGMP in US, EU GMP guidance, PIC/S harmonised.',
      'Publish GMP certificate + manufacturing site licence.', 'Closes regulator exposure.'],
    ['US_HIPAA_SECURITY_RULE', 'US_HIPAA_SECURITY', 'us_hipaa_security_missing', 'US', ['healthcare'], 'P0',
      'HHS Office for Civil Rights', 'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
      'HIPAA Security Rule (45 CFR Part 164 Subpart C)',
      'Up to $1.9M per category/year + criminal', 1900000,
      /HIPAA Security Rule|Administrative Safeguards|Physical Safeguards|Technical Safeguards HIPAA|45 CFR 164/i,
      'HIPAA Security Rule mandates administrative + physical + technical safeguards for ePHI.',
      'Publish HIPAA Security Rule compliance + risk analysis evidence.', 'Closes HHS exposure.'],
    ['GLOBAL_GxP_LIFE_SCIENCES', 'GLOBAL_GXP', 'global_gxp_missing', '*', ['healthcare'], 'P1',
      'National pharma regulators', 'https://www.ema.europa.eu/en/human-regulatory/research-development/scientific-guidelines/clinical-pharmacology-pharmacokinetics/good-clinical-practice',
      'GxP umbrella (GLP, GCP, GMP, GDP, GVP)',
      'Inspection findings + recall', 0,
      /GxP|GLP|GCP|GMP|GDP|GVP|pharmacovigilance|clinical practice/i,
      'GxP umbrella governs lab, clinical, manufacturing, distribution, pharmacovigilance for pharma + medical devices.',
      'Publish GxP framework alignment + last inspection status.', 'Closes regulator exposure.'],

    // ---- TOY + COSMETICS + PRODUCT SAFETY ----
    ['EU_TOY_SAFETY_DIRECTIVE', 'EU_TOY_2009_48', 'eu_toy_safety_missing', 'EU', ['ecommerce', 'manufacturing'], 'P1',
      'European Commission DG GROW + Member State market surveillance', 'https://single-market-economy.ec.europa.eu/sectors/toys_en',
      'Toy Safety Directive (2009/48/EC)',
      'Member state withdrawal + penalties', 0,
      /Toy Safety Directive|2009\/48\/EC|EN 71|CE marking toys|toy safety conformity/i,
      'EU Toy Safety Directive requires EN 71 conformity + CE marking for toys placed on EU market.',
      'Publish CE + EN 71 conformity for all toys.', 'Closes market surveillance exposure.'],
    ['US_CPSIA_TOY_SAFETY', 'US_CPSIA_2008', 'us_cpsia_missing', 'US', ['ecommerce', 'manufacturing'], 'P1',
      'CPSC', 'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/CPSIA',
      'Consumer Product Safety Improvement Act (CPSIA)',
      'Up to $120K per violation + criminal', 120000,
      /CPSIA|Consumer Product Safety Improvement Act|CPC certificate|children product certificate/i,
      'CPSIA requires CPSC-approved testing + CPC for children\'s products; lead + phthalate limits enforced.',
      'Publish CPC + third-party test reports.', 'Closes CPSC exposure.'],
    ['EU_COSMETICS_REGULATION', 'EU_COSMETICS_1223_2009', 'eu_cosmetics_missing', 'EU', ['ecommerce'], 'P1',
      'European Commission DG GROW + Member State competent authorities', 'https://health.ec.europa.eu/cosmetic-products_en',
      'EU Cosmetics Regulation (Regulation EC 1223/2009)',
      'Product withdrawal + civil', 0,
      /Cosmetics Regulation|1223\/2009|Responsible Person cosmetics|CPNP notification|PIF cosmetic/i,
      'EU Cosmetics Regulation requires Responsible Person + CPNP notification + Product Information File.',
      'Publish Responsible Person + CPNP notification + PIF status.', 'Closes Member State exposure.'],

    // ---- AUTOMOTIVE ----
    ['US_NHTSA_FMVSS', 'US_NHTSA_FMVSS', 'us_nhtsa_missing', 'US', ['manufacturing'], 'P0',
      'NHTSA', 'https://www.nhtsa.gov/laws-regulations/fmvss',
      'Federal Motor Vehicle Safety Standards (49 CFR Part 571)',
      'Up to $26,315 per violation + civil', 26315,
      /NHTSA|FMVSS|Federal Motor Vehicle Safety|motor vehicle compliance|FMVSS certification/i,
      'FMVSS impose mandatory safety standards on US road vehicles; NHTSA enforces with self-certification.',
      'Publish FMVSS self-certification + recall history.', 'Closes NHTSA exposure.'],
    ['EU_TYPE_APPROVAL_2018_858', 'EU_TYPE_APPROVAL_2018_858', 'eu_type_approval_missing', 'EU', ['manufacturing'], 'P0',
      'European Commission + Member State Type Approval Authorities', 'https://single-market-economy.ec.europa.eu/sectors/automotive-industry/legislation_en',
      'EU Type Approval Framework Regulation (EU 2018/858)',
      'Type approval withdrawal + recall', 0,
      /EU type approval|Regulation 2018\/858|WVTA|whole vehicle type approval/i,
      'EU 2018/858 governs vehicle type approval + market surveillance + recall.',
      'Publish WVTA + market surveillance compliance.', 'Closes type approval authority exposure.'],

    // ---- COPYRIGHT + IP ----
    ['US_DMCA_SAFE_HARBOR', 'US_DMCA_1998', 'us_dmca_missing', 'US', ['saas', 'ecommerce'], 'P1',
      'US Copyright Office + courts', 'https://www.copyright.gov/dmca/',
      'Digital Millennium Copyright Act 17 USC §512',
      'Statutory damages + injunctions', 0,
      /DMCA|Digital Millennium Copyright Act|DMCA agent|takedown notice|17 USC 512/i,
      'DMCA §512 requires designated agent registered with Copyright Office + repeat infringer policy for safe harbor.',
      'Publish DMCA agent registration + takedown procedure.', 'Closes copyright exposure.'],
    ['EU_COPYRIGHT_DIRECTIVE', 'EU_COPYRIGHT_2019_790', 'eu_copyright_2019_790_missing', 'EU', ['saas', 'ecommerce'], 'P1',
      'European Commission + Member State competent authorities', 'https://eur-lex.europa.eu/eli/dir/2019/790/oj',
      'EU Copyright in the Digital Single Market Directive (2019/790)',
      'Member state liability', 0,
      /Article 17 Copyright|EU Copyright Directive 2019\/790|content recognition|press publishers right/i,
      'EU Copyright Directive Art 17 imposes content recognition + licensing obligations on online content sharing services.',
      'Publish Art 17 compliance procedure + licensing position.', 'Closes Member State exposure.'],
    ['US_LANHAM_ACT', 'US_LANHAM_ACT_1946', 'us_lanham_missing', 'US', null, 'P1',
      'USPTO + courts', 'https://www.uspto.gov/trademarks',
      'Lanham Act (15 USC §1051 et seq)',
      'Treble damages + attorney fees', 0,
      /Lanham Act|federal trademark|USPTO registration|trademark infringement|likelihood of confusion/i,
      'Lanham Act governs federal trademarks + false advertising; treble damages possible.',
      'Publish USPTO registration + trademark enforcement procedure.', 'Closes IP litigation exposure.'],
    ['US_FTC_ENDORSEMENT_GUIDES', 'US_FTC_ENDORSEMENT_2023', 'us_ftc_endorsement_missing', 'US', ['ecommerce'], 'P1',
      'FTC Bureau of Consumer Protection', 'https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers',
      'FTC Endorsement Guides + 2023 Updates',
      'Up to $51,744 per violation', 51744,
      /FTC Endorsement|influencer disclosure|\#ad|sponsored content disclosure|FTC endorsement guides/i,
      'FTC 2023 update tightened material connection disclosures for endorsements (#ad before content, not buried).',
      'Publish FTC-compliant influencer disclosure template + training.', 'Closes FTC exposure.'],

    // ---- GAMBLING + GAMING ----
    ['UK_GAMBLING_ACT_2005', 'UK_GAMBLING_ACT_2005', 'uk_ukgc_missing', 'UK', null, 'P0',
      'UKGC (Gambling Commission)', 'https://www.gamblingcommission.gov.uk/',
      'Gambling Act 2005 + UKGC LCCP',
      'Licence revocation + unlimited fines', 0,
      /UKGC|Gambling Commission|LCCP|UK gambling licence|Section 81 gambling/i,
      'UK Gambling Act requires UKGC licence for any gambling activity targeting GB customers + LCCP compliance.',
      'Publish UKGC licence + LCCP responsible gambling evidence.', 'Closes UKGC exposure.'],
    ['EU_MT_MGA_GAMING', 'MT_MGA', 'eu_mt_mga_missing', '*', null, 'P0',
      'MGA (Malta Gaming Authority)', 'https://www.mga.org.mt/',
      'Maltese Gaming Act 2018',
      'Licence revocation + criminal', 0,
      /MGA Malta|Malta Gaming Authority|MGA B2C|MGA B2B licence/i,
      'MGA is the most-used EU gaming licence; B2C + B2B classes; AML + responsible gaming obligations.',
      'Publish MGA licence number + responsible gaming evidence.', 'Closes MGA exposure.'],

    // ---- LABOR ADDITIONAL ----
    ['US_CA_AB5_GIG_WORKERS', 'US_CA_AB5_2019', 'us_ca_ab5_missing', 'US', null, 'P1',
      'California Labor Commissioner + EDD', 'https://www.dir.ca.gov/dlse/',
      'California AB5 + ABC Test',
      'Back wages + penalties + class actions', 0,
      /AB5|California ABC test|gig worker classification|Dynamex California|independent contractor California/i,
      'CA AB5 codifies the Dynamex ABC test; misclassifying workers triggers PAGA + class actions.',
      'Publish ABC test classification + audit procedure.', 'Closes CA Labor exposure.'],
    ['US_PAGA_CALIFORNIA', 'US_CA_PAGA', 'us_ca_paga_missing', 'US', null, 'P1',
      'California Labor and Workforce Development Agency', 'https://www.dir.ca.gov/dlse/HowToFileLink.htm',
      'California Private Attorneys General Act',
      'Per-pay-period penalties × employees', 0,
      /PAGA|Private Attorneys General Act|California PAGA notice|LWDA PAGA/i,
      'PAGA allows employees to sue on behalf of state for Labor Code violations; substantial per-period penalties.',
      'Publish PAGA-compliant pay practices + audit.', 'Closes LWDA exposure.'],
    ['GLOBAL_ILO_CORE_CONVENTIONS', 'ILO_CORE_8', 'global_ilo_missing', '*', ['manufacturing'], 'P2',
      'ILO + national labour ministries', 'https://www.ilo.org/global/standards/introduction-to-international-labour-standards/conventions-and-recommendations/lang--en/index.htm',
      'ILO Core Conventions (forced labour, child labour, FoA, equal remuneration, non-discrim)',
      'Procurement + reputational', 0,
      /ILO Core Conventions|ILO 87|ILO 98|ILO 138|ILO 182|forced labour ILO/i,
      'ILO Core Conventions are the global baseline for labour rights; procurement audits flag non-alignment.',
      'Publish ILO Core Conventions alignment statement.', 'Lifts procurement signal.'],

    // ---- ADDITIONAL US STATE PRIVACY ----
    ['US_MN_CONSUMER_DATA_PRIVACY_ACT', 'US_MN_MCDPA_2025', 'us_mn_privacy_missing', 'US', null, 'P2',
      'Minnesota Attorney General', 'https://www.ag.state.mn.us/',
      'Minnesota Consumer Data Privacy Act · effective Jul 2025',
      'Up to $7,500 per violation', 7500,
      /Minnesota Consumer Data Privacy|MN MCDPA|MN privacy rights/i,
      'MN MCDPA applies to controllers processing 100,000+ MN consumers.',
      'Add MN residents to privacy notice with profiling opt-out.', 'Adds MN to multi-state privacy posture.'],
    ['US_RI_DATA_TRANSPARENCY', 'US_RI_DTPPA_2026', 'us_ri_privacy_missing', 'US', null, 'P2',
      'Rhode Island Attorney General', 'https://riag.ri.gov/',
      'Rhode Island Data Transparency and Privacy Protection Act · effective Jan 2026',
      'Up to $10,000 per violation', 10000,
      /Rhode Island Data Transparency|RI DTPPA|RI privacy rights/i,
      'RI DTPPA applies to controllers processing 35,000+ RI consumers.',
      'Add RI residents to privacy notice.', 'Adds RI to multi-state privacy posture.'],

    // ---- CSRD ESRS DEEPER ----
    ['EU_ESRS_E1_CLIMATE', 'EU_ESRS_E1', 'eu_esrs_e1_missing', 'EU', null, 'P1',
      'European Commission + EFRAG + EU Member State competent authorities', 'https://www.efrag.org/lab6',
      'EU CSRD ESRS E1 Climate Change',
      'Member state penalties', 0,
      /ESRS E1|ESRS climate|CSRD climate disclosure|EU Sustainability Reporting Standards/i,
      'ESRS E1 mandates detailed climate disclosure incl. transition plan + Scope 1/2/3 + financial effects.',
      'Publish ESRS E1-aligned climate disclosure.', 'Closes CSRD exposure.'],
    ['EU_ESRS_S1_OWN_WORKFORCE', 'EU_ESRS_S1', 'eu_esrs_s1_missing', 'EU', null, 'P1',
      'European Commission + EFRAG', 'https://www.efrag.org/lab6',
      'EU CSRD ESRS S1 Own Workforce',
      'Member state penalties', 0,
      /ESRS S1|own workforce ESRS|CSRD workforce disclosure|wages collective bargaining ESRS/i,
      'ESRS S1 requires disclosure on own workforce: working conditions, equal treatment, social dialogue.',
      'Publish ESRS S1-aligned workforce disclosure.', 'Closes CSRD exposure.'],
    ['EU_ESRS_G1_BUSINESS_CONDUCT', 'EU_ESRS_G1', 'eu_esrs_g1_missing', 'EU', null, 'P1',
      'European Commission + EFRAG', 'https://www.efrag.org/lab6',
      'EU CSRD ESRS G1 Business Conduct',
      'Member state penalties', 0,
      /ESRS G1|business conduct ESRS|CSRD governance|corruption bribery ESRS/i,
      'ESRS G1 covers corruption + bribery prevention, political engagement, payment practices, whistleblowing.',
      'Publish ESRS G1-aligned business conduct disclosure.', 'Closes CSRD exposure.'],

    // ---- TAX + COMPLIANCE ADDITIONAL ----
    ['UK_CCO_CORPORATE_OFFENCES', 'UK_CFA_2017', 'uk_cco_missing', 'UK', null, 'P0',
      'HMRC + SFO', 'https://www.gov.uk/government/publications/corporate-offences-for-failing-to-prevent-criminal-facilitation-of-tax-evasion',
      'Corporate Criminal Offences (CCO) · Criminal Finances Act 2017',
      'Unlimited fines + DPAs', 0,
      /Corporate Criminal Offences|CCO|Criminal Finances Act 2017|failure to prevent tax evasion/i,
      'UK CCO creates corporate liability for failure to prevent facilitation of tax evasion.',
      'Publish CCO risk assessment + reasonable procedures evidence.', 'Closes HMRC exposure.'],
    ['UK_FAILURE_TO_PREVENT_FRAUD', 'UK_ECCTA_2023', 'uk_ftpf_missing', 'UK', null, 'P0',
      'SFO + CPS', 'https://www.gov.uk/government/publications/economic-crime-and-corporate-transparency-act-2023-failure-to-prevent-fraud-offence-guidance',
      'Economic Crime and Corporate Transparency Act 2023 · Failure to Prevent Fraud',
      'Unlimited fines + DPAs', 0,
      /Failure to Prevent Fraud|ECCTA 2023|reasonable procedures fraud|FTPF UK/i,
      'UK FTPF (effective 1 Sep 2025) creates corporate liability for failure to prevent fraud by associated persons.',
      'Publish FTPF reasonable procedures + fraud risk assessment.', 'Closes SFO exposure.'],

    // ---- ADDITIONAL SECTOR ----
    ['UK_FCA_MIFID_II_TRANSACTION', 'UK_MIFIR', 'uk_mifid_ii_missing', 'UK', ['finance'], 'P0',
      'FCA', 'https://www.fca.org.uk/markets/mifid-ii',
      'UK MIFID II + MiFIR Transaction Reporting',
      'Up to unlimited + criminal', 0,
      /MiFID II|MiFIR|transaction reporting|ARM MiFIR|FCA MIS/i,
      'UK MiFID II / MiFIR requires near-real-time transaction reporting to FCA via Authorised Reporting Mechanism.',
      'Publish MiFIR transaction reporting + ARM compliance.', 'Closes FCA exposure.'],
    ['EU_EMIR_DERIVATIVES', 'EU_EMIR_648_2012', 'eu_emir_missing', 'EU', ['finance'], 'P0',
      'ESMA + Member State competent authorities', 'https://www.esma.europa.eu/policy-rules/post-trading/emir-refit',
      'EU EMIR (Regulation 648/2012) + EMIR REFIT',
      'Member state administrative penalties', 0,
      /EMIR|EMIR REFIT|trade repository|TR reporting|derivative reporting EU/i,
      'EU EMIR requires reporting of derivatives to a trade repository + clearing + risk mitigation.',
      'Publish EMIR trade repository reporting evidence.', 'Closes ESMA exposure.'],

    // ---- DATA TRANSFERS / BREACH ----
    ['GLOBAL_BREACH_72H_NOTIFICATION', 'BREACH_NOTIF_72H', 'global_breach_notif_missing', '*', null, 'P0',
      'Multiple regulators · GDPR · UK DPA · CCPA · UAE PDPL · etc.', 'https://gdpr-info.eu/art-33-gdpr/',
      'Breach notification (72-hour rule)',
      'Up to 4% global turnover + class actions', 0,
      /breach notification|72-hour notification|incident response plan|data breach response/i,
      'Most major privacy regimes (GDPR, UAE PDPL, KSA PDPL, AU Privacy Act amendment) mandate 72-hour breach notice to regulator + affected individuals.',
      'Publish incident response plan with regulator + individual notification workflow.', 'Closes multi-regulator exposure.'],

    // ---- ADDITIONAL CYBERSECURITY ----
    ['EU_DORA_DIGITAL_OPS_RESILIENCE', 'EU_DORA_2022_2554', 'eu_dora_missing', 'EU', ['finance', 'fintech', 'insurance'], 'P0',
      'EBA + ESMA + EIOPA + Member State NCAs', 'https://www.eiopa.europa.eu/browse/regulation-and-policy/digital-operational-resilience-act-dora_en',
      'Digital Operational Resilience Act (Regulation EU 2022/2554)',
      'Up to 2% global turnover or €10M', 10000000,
      /DORA|Digital Operational Resilience|ICT risk management|TLPT|threat-led penetration test/i,
      'EU DORA (applicable 17 Jan 2025) mandates ICT risk management + TLPT + third-party risk for financial entities.',
      'Publish DORA-compliant ICT risk register + TLPT plan.', 'Closes EBA/ESMA/EIOPA exposure.'],
    ['UK_FCA_OPERATIONAL_RESILIENCE', 'UK_FCA_PS21_3', 'uk_fca_or_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P0',
      'FCA + PRA + Bank of England', 'https://www.fca.org.uk/publication/policy/ps21-3-operational-resilience.pdf',
      'FCA PS21/3 Operational Resilience',
      'Up to unlimited + criminal', 0,
      /PS21\/3|Operational Resilience|important business service|impact tolerance|FCA operational resilience/i,
      'FCA PS21/3 requires identification of IBSs + impact tolerances + scenario testing (compliance by Mar 2025).',
      'Publish PS21/3-compliant IBS map + impact tolerances + scenario testing evidence.', 'Closes FCA + PRA exposure.'],

    // ---- ADDITIONAL EU EU ADDITIONAL ----
    ['EU_AI_ACT_REGULATION', 'EU_AI_ACT_2024_1689', 'eu_ai_act_deeper_missing', 'EU', ['saas', 'fintech', 'healthcare'], 'P0',
      'European Commission AI Office + Member State competent authorities', 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
      'EU AI Act (Regulation EU 2024/1689)',
      'Up to 7% global turnover or €35M', 35000000,
      /EU AI Act|AI Act 2024\/1689|high-risk AI system|prohibited AI|GPAI obligations/i,
      'EU AI Act (in force Aug 2024, phased application from Feb 2025) imposes risk-based obligations on AI systems.',
      'Publish AI Act risk classification + conformity assessment + GPAI documentation.', 'Closes AI Office exposure.'],
    ['UK_AI_PRO_INNOVATION', 'UK_AI_WHITE_PAPER_2023', 'uk_ai_principles_missing', 'UK', ['saas', 'fintech', 'healthcare'], 'P1',
      'CMA + ICO + FCA + Ofcom (regulator-led)', 'https://www.gov.uk/government/publications/ai-regulation-a-pro-innovation-approach',
      'UK Pro-Innovation Approach to AI Regulation (2023)',
      'Sector regulator enforcement', 0,
      /UK AI principles|pro-innovation AI|UK AI white paper|safety transparency fairness AI/i,
      'UK applies five cross-sector AI principles (safety, transparency, fairness, accountability, contestability) via existing regulators.',
      'Publish AI principles alignment + regulator-specific compliance.', 'Closes regulator exposure.'],

    // ---- FINAL FILL ----
    ['GLOBAL_GLOBAL_CLOUD_ACT', 'US_CLOUD_ACT_2018', 'us_cloud_act_missing', '*', ['saas'], 'P2',
      'DOJ + International Treaties', 'https://www.justice.gov/dag/cloudact',
      'Clarifying Lawful Overseas Use of Data Act (CLOUD Act)',
      'Customer trust + EU transfer risk', 0,
      /CLOUD Act|US CLOUD Act|government access cloud|US data access cloud|transparency report CLOUD/i,
      'CLOUD Act allows US authorities to compel access to data held by US providers worldwide; affects EU transfers + customer trust.',
      'Publish CLOUD Act transparency policy + government access procedure.', 'Lifts EU customer trust signal.'],
    ['EU_DSA_TRUSTED_FLAGGER', 'EU_DSA_TRUSTED_FLAG', 'eu_dsa_trusted_flagger_missing', 'EU', ['saas'], 'P2',
      'Digital Services Coordinators + European Commission', 'https://digital-strategy.ec.europa.eu/en/policies/dsa-coordinators',
      'EU DSA · Trusted Flagger Mechanism (Art 22)',
      'Member state penalties', 0,
      /trusted flagger|DSA Article 22|Out-of-court dispute settlement DSA|DSA appeals/i,
      'DSA Art 22 + 21 require priority handling of trusted flagger notices + out-of-court dispute settlement.',
      'Publish DSA trusted flagger + ODS procedure.', 'Closes DSA exposure.'],
    ['UK_FCA_CONSUMER_VULNERABLE', 'UK_FCA_FG21_1', 'uk_fca_vulnerable_missing', 'UK', ['finance', 'fintech', 'insurance'], 'P1',
      'FCA', 'https://www.fca.org.uk/publications/finalised-guidance/fg21-1-guidance-firms-fair-treatment-vulnerable-customers',
      'FCA FG21/1 · Fair Treatment of Vulnerable Customers',
      'Enforcement + remediation', 0,
      /vulnerable customers|FG21\/1|FCA fair treatment vulnerable|consumer vulnerability/i,
      'FCA FG21/1 sets expectations for fair treatment of vulnerable customers across the customer journey.',
      'Publish vulnerable customer policy + staff training + MI evidence.', 'Closes FCA exposure.'],
    ['UK_ICO_AGE_APPROPRIATE_DESIGN', 'UK_ICO_AADC', 'uk_aadc_missing', 'UK', ['saas', 'ecommerce'], 'P0',
      'ICO', 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/',
      'ICO Age Appropriate Design Code (Children\'s Code)',
      'Up to £17.5M or 4% turnover', 17500000,
      /Age Appropriate Design Code|Children\'s Code ICO|AADC|UK children's code/i,
      'ICO AADC (since 2 Sep 2021) requires conformance to 15 standards for any online service likely to be accessed by children.',
      'Publish AADC conformance + DPIA for children\'s services.', 'Closes ICO exposure.'],
    ['US_COPPA_DETAIL', 'US_COPPA_1998_DETAIL', 'us_coppa_detail_missing', 'US', ['saas', 'ecommerce'], 'P0',
      'FTC', 'https://www.ftc.gov/business-guidance/privacy-security/childrens-online-privacy-protection-rule-coppa',
      'Children\'s Online Privacy Protection Act',
      'Up to $51,744 per violation', 51744,
      /COPPA|Children Online Privacy Protection|verifiable parental consent|under 13/i,
      'COPPA imposes verifiable parental consent + privacy notice for online services directed to under-13s or that have actual knowledge.',
      'Publish COPPA notice + verifiable parental consent procedure.', 'Closes FTC exposure.'],

    // ---- ADDITIONAL EU SPECIFIC FOR FINAL FILL ----
    ['EU_CRA_CYBER_RESILIENCE', 'EU_CRA_2024', 'eu_cra_missing', 'EU', ['saas', 'manufacturing'], 'P0',
      'European Commission + Member State market surveillance', 'https://digital-strategy.ec.europa.eu/en/library/cyber-resilience-act',
      'EU Cyber Resilience Act',
      'Up to €15M or 2.5% global turnover', 15000000,
      /Cyber Resilience Act|CRA EU|PDEs cybersecurity|products digital elements/i,
      'EU CRA (adopted Oct 2024, applicable from Dec 2027) imposes cybersecurity requirements on products with digital elements.',
      'Publish CRA conformity assessment + SBOM + vulnerability disclosure.', 'Closes CRA exposure.'],
    ['EU_DATA_ACT_2023_2854', 'EU_DATA_ACT_2023_2854', 'eu_data_act_missing', 'EU', ['saas', 'fintech', 'manufacturing'], 'P1',
      'European Commission', 'https://digital-strategy.ec.europa.eu/en/policies/data-act',
      'EU Data Act (Regulation EU 2023/2854)',
      'Up to 4% turnover (B2B) + class actions', 0,
      /EU Data Act|2023\/2854|data sharing IoT|cloud switching|interoperability data spaces/i,
      'EU Data Act (applicable 12 Sep 2025) mandates data sharing for IoT + cloud switching + protects SME bargaining.',
      'Publish Data Act access + switching + interoperability statement.', 'Closes EU Data Act exposure.'],
    ['GLOBAL_RESPONSIBLE_BUSINESS_DUE_DIL', 'OECD_RBC', 'global_oecd_rbc_missing', '*', null, 'P2',
      'OECD National Contact Points', 'https://www.oecd.org/corporate/mne/',
      'OECD Guidelines for Multinational Enterprises (2023 update)',
      'NCP specific instance + reputational', 0,
      /OECD Guidelines|MNE Guidelines|National Contact Point|RBC due diligence|OECD due diligence/i,
      'OECD MNE Guidelines (2023 update) are the global baseline for responsible business conduct + RBC due diligence.',
      'Publish OECD RBC due diligence statement.', 'Lifts NCP + investor signal.']
  ])

];

// =============================================================================
// BATCH RULE HELPER · compact form for high-volume additions
// =============================================================================
// batchRules() turns a positional-arg array into a full rule object. Reduces
// the 25-line full form to a single readable line per rule.
function batchRules(entries) {
  return entries.map(e => {
    const [id, framework, category, jurisdiction, sectorGate, severity,
           regulator, regulator_url, clause, fine_label, fine_high,
           triggerRe, evidence, fix, uplift, opts = {}] = e;
    return {
      id, framework, category, jurisdiction,
      sector_gate: sectorGate,
      city_gate: opts.city_gate || null,
      severity, regulator, regulator_url, clause, fine_label, fine_high,
      evidence, fix, uplift,
      trigger: (intel) => {
        const t = intel.fullText || '';
        if (opts.preGate && !opts.preGate(intel)) return null;
        if (triggerRe.test(t)) return null;
        return { structural_fact: `no ${category.replace(/_/g, ' ')} signal detected`, methods: ['phrase'] };
      }
    };
  });
}

// Note: batchRules is defined AFTER RULES because spread syntax inside the
// RULES array evaluates batchRules immediately. JS hoists function declarations
// so this works; but Node module-time evaluation order means we need to
// re-export through a small bootstrap. The RULES array references will work
// because the function is hoisted within the module scope.

// Phase 2 v25: normalise scraper country tags to rule-pack jurisdiction codes.
// Scraper outputs full names (UAE, Saudi, Singapore, India, HongKong, USA);
// rule pack uses ISO-style short codes (AE, SA, SG, IN, HK, US). EU member
// states normalise to 'EU' (the rule pack carries an 'EU' bucket plus the
// individual member-state codes; both fire if applicable).
const COUNTRY_NORMAL = {
  UAE: 'AE', SAUDI: 'SA', SINGAPORE: 'SG', INDIA: 'IN', HONGKONG: 'HK',
  USA: 'US', GB: 'UK', GBR: 'UK',
  AUSTRALIA: 'AU', NEWZEALAND: 'NZ', 'NEW ZEALAND': 'NZ',
  JAPAN: 'JP', KOREA: 'KR', SOUTHKOREA: 'KR', 'SOUTH KOREA': 'KR',
  THAILAND: 'TH', MALAYSIA: 'MY', INDONESIA: 'ID', PHILIPPINES: 'PH',
  CHINA: 'CN', BRAZIL: 'BR', MEXICO: 'MX', ARGENTINA: 'AR',
  SOUTHAFRICA: 'ZA', 'SOUTH AFRICA': 'ZA', NIGERIA: 'NG', TURKEY: 'TR',
  CANADA: 'CA'
};
const EU_MEMBER_SHORT_CODES = new Set(['FR', 'DE', 'IT', 'ES', 'NL', 'IE', 'PL', 'SE', 'FI', 'DK', 'AT', 'BE', 'PT', 'GR', 'CZ', 'RO', 'HU', 'LU', 'BG', 'HR', 'SK', 'SI', 'MT', 'CY']);
function normaliseCountryCode(c) {
  if (!c) return 'UK';
  const u = String(c).toUpperCase().trim();
  if (COUNTRY_NORMAL[u]) return COUNTRY_NORMAL[u];
  return u;
}

// Backwards-compatible runtime helpers
function rulesForJurisdictionAndSector({ countries = [], sector = 'professional-services', cities = [] } = {}) {
  // Normalise + expand EU member states so the broader 'EU' rules also fire.
  const normSet = new Set();
  for (const c of countries) {
    const n = normaliseCountryCode(c);
    normSet.add(n);
    if (EU_MEMBER_SHORT_CODES.has(n)) normSet.add('EU');
  }
  const norm = [...normSet];
  return RULES.filter(rule => {
    // Cross-cutting rules with jurisdiction='*' apply to every country
    const jurMatch = rule.jurisdiction === '*' || norm.includes(rule.jurisdiction);
    if (!jurMatch) return false;
    // Sector gate
    if (rule.sector_gate && rule.sector_gate.length && !rule.sector_gate.includes(sector)) return false;
    // City gate
    if (rule.city_gate && rule.city_gate.length) {
      const cityMatch = cities.some(c => rule.city_gate.includes(c));
      if (!cityMatch) return false;
    }
    return true;
  });
}

function runRules(rules, intel) {
  const findings = [];
  const telemetry = { evaluated: 0, fired: 0, passed: 0, errors: 0 };
  for (const rule of rules) {
    telemetry.evaluated++;
    let result;
    try { result = rule.trigger(intel); } catch (e) {
      telemetry.errors++;
      continue;
    }
    if (!result) { telemetry.passed++; continue; }
    telemetry.fired++;
    findings.push({
      rule_id: rule.id,
      framework: rule.framework,
      category: rule.category,
      severity: rule.severity,
      regulator: rule.regulator,
      regulator_url: rule.regulator_url,
      clause: rule.clause,
      fine_label: rule.fine_label,
      fine_high: rule.fine_high,
      jurisdiction: rule.jurisdiction === '*' ? (intel.country || 'UK') : rule.jurisdiction,
      jurisdictions: rule.jurisdiction === '*' ? (intel.countries || [intel.country || 'UK']) : [rule.jurisdiction],
      where: result.url || `Site-wide at https://${intel.domain || ''}/`,
      evidence: rule.evidence + (result.structural_fact ? ` Observed: ${result.structural_fact}.` : (result.snippet ? ` Quoted: "${result.snippet}".` : '')),
      fix: rule.fix,
      uplift: rule.uplift,
      methods: result.methods || ['structural'],
      quoted_snippet: result.snippet || null,
      structural_fact: result.structural_fact || null
    });
  }
  return { findings, telemetry };
}

module.exports = { RULES, rulesForJurisdictionAndSector, runRules };
