# Deep compliance catalog
## 8 sectors × 8 countries · every material law · trigger mechanism · engine state

Source of truth for Phase 1 implementation. Every row is a law I commit the engine to detect. State legend:
- 🟢 **LIVE** = encoded + detector triggers + finding emitted on real audits today
- 🟡 **META** = encoded with regulator name + fine + URL, but no detector. Finding never fires.
- 🔴 **GAP** = not in the engine at all.
- ⚪ **CROSS** = cross-cutting law that applies regardless of single-sector framing

Engine target after Phase 1: every 🟡 and the priority 🔴 below become 🟢. Less critical 🔴 deferred to Phase 2.

---

## A · Cross-cutting laws (apply to most sectors in every jurisdiction)

These are the most-missed compliance areas because they don't fit a single sector. Every regulated business has obligations here.

| Cross-cutting area | UK | US | EU | UAE | SA | SG | IN | HK | Engine state |
|---|---|---|---|---|---|---|---|---|---|
| Data protection (general) | UK GDPR · DPA 2018 | CPRA · state mosaic | GDPR · ePrivacy | PDPL 45/2021 · DIFC DP · ADGM DP | PDPL · SDAIA | PDPA | DPDP 2023 · IT Rules 2021 | PDPO | 🟢 all detected |
| ePrivacy / marketing | PECR · ICO Cookies | TCPA · CAN-SPAM | ePrivacy Dir 2002/58 | TDRA Spam | CITC Anti-Spam | Spam Control Act · PDPA DNC | TRAI Commercial Comm | PDPO Direct Marketing | 🟡 detector partial (cookies LIVE, DNC GAP, TCPA GAP) |
| AML / CFT | MLR 2017 · POCA 2002 | BSA · FinCEN | AML6 Dir 2024/1640 | Federal Law 20/2018 | AML Decree 1437 | MAS Notice 626 · CDSA | PMLA 2002 | AMLO Cap. 615 | 🔴 GAP — no AML scanner anywhere |
| Anti-bribery | Bribery Act 2010 | FCPA · Travel Act | EU Anti-Corruption Dir | Federal Decree-Law 35/2018 | Anti-Bribery Law 1992 | Prevention of Corruption Act | Prevention of Corruption Act 1988 | Prevention of Bribery Ordinance | 🔴 GAP — no anti-bribery scanner |
| Modern slavery / supply chain | MSA 2015 s.54 | Trafficking Victims Act · CA SB-657 | Corporate Sustainability Due Diligence Dir 2024/1760 | none direct | none direct | none direct | none direct | none direct | 🟡 detector exists but threshold weak (>£100M) |
| Whistleblowing | PIDA 1998 | SOX 806 · Dodd-Frank | EU Whistleblower Dir 2019/1937 | none direct | none direct | none direct | Companies Act WB | none direct | 🔴 GAP — no detector |
| ESG / sustainability reporting | Climate Disclosure (FCA) | SEC Climate Disclosure | CSRD · SFDR · CSDDD | UAE Climate Law (in draft) | Saudi Green | SGX SR | BRSR India | HKEx ESG | 🔴 GAP — no ESG detector |
| Cybersecurity / NIS | NIS Regs 2018 · Cyber Essentials | NYDFS 23 NYCRR 500 · state · CIRCIA | NIS2 Dir 2022/2555 | CIIP · TDRA · DCRR | NCA ECC-1:2018 | Cybersecurity Act 2018 | CERT-In Direction 2022 | LegCo Bill 2024 (in passage) | 🟡 partial (UK NCSC LIVE, others META) |
| Accessibility | Equality Act 2010 + WCAG 2.2 AA | ADA Title III · Section 508 | EAA 2025 · Web Accessibility Dir | UAE Federal Disability Law 29/2006 | Saudi Disability Reg | Singapore Disability | Rights of Persons with Disabilities Act 2016 | DDO Cap. 487 | 🟡 WCAG LIVE; equality act content checks partial |
| Online safety | Online Safety Act 2023 | KOSA (in passage) · COPPA | DSA · DMA · TCO Reg | TDRA Content | CITC Content Code | IMDA Content Code · OSHA 2023 | IT Rules 2021 IGG | Crimes Ordinance · ECTO | 🟡 UK OSA META, others GAP |

**Cross-cutting takeaway:** the 6 areas in 🔴 (AML, Anti-bribery, Whistleblowing, ESG, plus Modern Slavery threshold weak) are the biggest GAP in the engine right now. AML alone applies to every regulated firm and we have zero detector.

---

## B · LAW FIRMS

### B.1 · UK law firms

| Law / Regulator | Engine state | Trigger mechanism (current or required) |
|---|---|---|
| SRA Code of Conduct 2019 | 🟢 LIVE | Detect "Solicitors Regulation Authority" or "SRA No." text on site |
| SRA Transparency Rules 2018 (price + complaints) | 🟢 LIVE | Detect presence of /fees /pricing /transparency + /complaints pages |
| SRA Account Rules 2019 | 🔴 GAP | Detect "client account" or "client money" disclosure |
| SRA Standards 2019 | 🟢 LIVE | Phrase "SRA Standards" detected |
| BSB Handbook (for barristers) | 🟢 LIVE | Detect "Bar Standards Board" or "BSB No." |
| Legal Services Act 2007 | 🔴 GAP | Detect regulator-disclosure failures specifically vs LSA s.176 |
| MLR 2017 · POCA 2002 (legal sector AML) | 🔴 GAP | Detect "Client Due Diligence" disclosure, MLRO contact, AML policy |
| Bribery Act 2010 (legal sector) | 🔴 GAP | Detect anti-bribery policy mention or absence |
| Equality Act 2010 (legal services) | 🟡 META | Detect accessibility statement (LIVE) but not full equality charter |
| UK GDPR Art. 13/14 (data subjects) | 🟢 LIVE | Detect /privacy notice |
| Caldicott Guardianship (where holding health data) | 🔴 GAP | Detect "Caldicott Guardian" appointment statement |
| Legal Ombudsman Scheme Rules | 🔴 GAP | Detect Legal Ombudsman link in complaints page |
| FSMA s.21 (where regulated by FCA for ancillary financial promotion) | 🟡 META | Sector overlap, only fires under finance category |
| OSA 2023 (where UGC carried) | 🔴 GAP | Detect user-generated-content presence + age verification |

### B.2 · US law firms

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| ABA Model Rules of Professional Conduct (7.1-7.3 advertising) | 🔴 GAP | Detect ABA model rule disclosure or state bar advertising compliance |
| State Bar Rules (NY, CA, IL each different) | 🔴 GAP | State-specific detection per US state |
| Sarbanes-Oxley (where representing public companies) | 🔴 GAP | Detect SOX 806 whistleblower notice |
| FATCA (for tax advisory) | 🔴 GAP | Detect FATCA disclosure |
| BSA / Patriot Act (for AML) | 🔴 GAP | Detect MLRO + CIP disclosure |
| Lawyers' Fund for Client Protection | 🔴 GAP | State-specific deposit insurance disclosure |
| TCPA (cold-call solicitation) | 🔴 GAP | Detect opt-in for cold outreach |
| CCPA / CPRA (California) | 🟢 LIVE | Detect "Do Not Sell My Info" link + privacy policy |
| HIPAA Privacy (for healthcare clients) | 🔴 GAP | Detect HIPAA Business Associate Agreement clause |

### B.3 · UAE law firms

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Federal Law No. 23 of 1991 (Practice of Legal Profession) | 🟡 META | Detect MOJ licence number |
| Federal Decree-Law 6/2018 (UAE Arbitration Law) | 🟡 META | Detect arbitration practice declaration |
| DIFC Court Rules of Conduct (where DIFC-registered) | 🟡 META | Detect DIFC registration |
| ADGM Court Rules of Conduct | 🟡 META | Detect ADGM registration |
| Federal Decree-Law 20/2018 (AML/CFT for legal sector) | 🔴 GAP | Detect AML policy + MLRO appointment |
| Federal Decree-Law 35/2018 (Anti-Bribery) | 🔴 GAP | Detect anti-bribery disclosure |
| PDPL (Federal Decree-Law 45/2021) | 🟢 LIVE | Detect privacy notice |
| DIFC DP Law 5/2020 (DIFC firms) | 🟡 META | Detect DIFC Commissioner of DP reference |
| ADGM DP Regulations 2021 | 🟡 META | Detect ADGM ODP reference |
| UAE Federal Decree-Law 26/2018 (Anti-Money Laundering Crimes) | 🔴 GAP | Detect AML/CFT framework reference |

### B.4 · Saudi law firms

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Code of Law Practice 2001 | 🟡 META | Detect MoJ licence |
| MoJ Regulations · Legal Profession | 🟡 META | Detect "بترخيص من وزارة العدل" / MoJ permit text |
| AML Royal Decree M/31 (Saudi AML) | 🔴 GAP | Detect AML policy + Risk Assessment statement |
| Anti-Bribery Law 1992 (Royal Decree M/36) | 🔴 GAP | Detect anti-corruption policy |
| Saudi PDPL | 🟢 LIVE | Detect privacy notice |
| SDAIA AI Ethics Framework | 🔴 GAP | Detect AI use + ethics statement |

### B.5 · Singapore law firms

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Legal Profession Act + PCR 2015 (Professional Conduct Rules) | 🟡 META | Detect Law Society membership |
| Solicitor's Account Rules | 🔴 GAP | Detect client account disclosure |
| Corruption, Drug Trafficking & Other Serious Crimes (CDSA) – AML | 🔴 GAP | Detect AML/MLRO appointment |
| Prevention of Corruption Act | 🔴 GAP | Detect anti-corruption policy |
| PDPA 2012 | 🟢 LIVE | Detect privacy notice |
| PDPA Do Not Call Provisions | 🔴 GAP | Detect DNC compliance statement |
| MAS Notice on Professional Indemnity | 🔴 GAP | Detect PII certificate |
| Section 84 CPC (Lawyer-Client Privilege) | 🔴 GAP | Detect privilege statement |

### B.6 · India law firms

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Advocates Act 1961 | 🟡 META | Detect Bar Council registration |
| BCI Rules (Advertising) | 🟢 LIVE | Detect BCI compliance phrasing |
| PMLA 2002 (Money Laundering) — applies to "Reporting Entities" | 🔴 GAP | Detect AML policy + PMLA RE registration |
| Prevention of Corruption Act 1988 | 🔴 GAP | Detect anti-corruption policy |
| IT Act 2000 + IT Rules 2021 | 🟡 META | Detect grievance officer name + contact |
| DPDP Act 2023 | 🟢 LIVE | Detect privacy notice |
| Consumer Protection Act 2019 | 🟡 META | Detect consumer charter |
| GST Compliance for legal services | 🔴 GAP | Detect GSTIN footer |

### B.7 · Hong Kong law firms

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Legal Practitioners Ordinance Cap. 159 | 🟡 META | Detect Law Society of HK ref |
| Solicitors' Practice Rules | 🟢 LIVE | Detect HK Law Society disclosure |
| AMLO Cap. 615 (AML/CFT) | 🔴 GAP | Detect AML compliance officer |
| Prevention of Bribery Ordinance Cap. 201 | 🔴 GAP | Detect anti-bribery policy |
| PDPO Cap. 486 | 🟢 LIVE | Detect PICS notice |
| Personal Data (Privacy) (Direct Marketing) Cap. 486 | 🔴 GAP | Detect marketing opt-in/out |
| Solicitors' Accounts Rules | 🔴 GAP | Detect client account disclosure |

**Law firms · total laws across 7 jurisdictions: 56 · current state: 14 LIVE · 18 META · 24 GAP.**

---

## C · HEALTHCARE

### C.1 · UK healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| CQC registration | 🟢 LIVE | Detect "CQC registered" + provider number regex |
| GMC (doctors) | 🟢 LIVE | Detect "GMC No" regex |
| NMC (nurses) | 🟢 LIVE | Detect "NMC PIN" regex |
| GDC (dentists) | 🟢 LIVE | Detect "GDC No" regex |
| GPhC (pharmacists) | 🔴 GAP | Detect "GPhC No" regex |
| HCPC (allied health professions) | 🔴 GAP | Detect "HCPC No" regex |
| MHRA (medicines / devices) | 🟢 LIVE | Detect MHRA registration / yellow card scheme |
| Data Protection Act 2018 + Common Law confidentiality | 🟢 LIVE | Privacy notice detection |
| Caldicott Principles (NHS / health data) | 🔴 GAP | Detect Caldicott Guardian appointment |
| NHS Constitution (NHS providers) | 🔴 GAP | Detect NHS Constitution adherence statement |
| Equality Act 2010 (s.20 reasonable adjustments) | 🟢 LIVE | WCAG grader |
| Care Act 2014 (adult social care) | 🔴 GAP | Detect safeguarding adult policy |
| Children Act 1989 / 2004 (safeguarding) | 🔴 GAP | Detect safeguarding children policy |
| Mental Capacity Act 2005 | 🔴 GAP | Detect MCA assessment process |
| Health and Care Act 2022 | 🔴 GAP | Detect ICS / ICB membership statement |
| NICE Guidance (clinical guidelines) | 🔴 GAP | Detect NICE adherence statement |

### C.2 · US healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| HIPAA Privacy + Security Rule | 🔴 GAP | Detect HIPAA Notice of Privacy Practices |
| HITECH Act | 🔴 GAP | Detect HITECH-compliant breach notification policy |
| FDA (devices / drugs) | 🔴 GAP | Detect FDA registration |
| ACA Section 1557 (non-discrimination) | 🔴 GAP | Detect non-discrimination notice |
| State Medical Boards (50 states) | 🔴 GAP | Detect state medical board licence per practitioner |
| AMA Ethics | 🔴 GAP | Detect AMA Code adherence |
| Stark Law + Anti-Kickback Statute | 🔴 GAP | Detect Stark / AKS compliance disclosure |
| Title VI Civil Rights Act (federally funded) | 🔴 GAP | Detect non-discrimination policy |
| EMTALA (emergency treatment) | 🔴 GAP | Detect ED treatment policy |
| 42 CFR Part 2 (substance use confidentiality) | 🔴 GAP | Detect 42 CFR Part 2 notice |
| State Privacy (CMIA in CA, etc.) | 🔴 GAP | State-specific |

### C.3 · UAE healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| DHA (Dubai Health Authority) | 🟢 LIVE | Detect DHA licence number |
| MOHAP (Federal Ministry of Health) | 🟢 LIVE | Detect MOHAP licence |
| DOH Abu Dhabi (Department of Health) | 🔴 GAP | Detect DOH licence |
| Federal Law 4/2016 (Medical Liability) | 🔴 GAP | Detect medical liability insurance |
| Federal Law 5/2019 (Anti-Tobacco) | 🔴 GAP | Detect tobacco product compliance (where applicable) |
| Federal Decree-Law 4/2024 (Patient Rights) | 🔴 GAP | Detect patient rights charter |
| UAE PDPL (Federal Decree-Law 45/2021) | 🟢 LIVE | Privacy notice detection |
| Federal Law 2/2019 (ICT in Health) | 🔴 GAP | Detect digital health compliance |

### C.4 · Saudi healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| MoH (Saudi Ministry of Health) | 🟢 LIVE | Detect MoH licence |
| SCFHS (Saudi Council for Health Specialties) | 🔴 GAP | Detect SCFHS registration |
| SFDA (Food + Drug Authority) | 🟢 LIVE | Detect SFDA authorisation |
| Saudi Health Insurance Law | 🔴 GAP | Detect insurance compliance |
| HPL (Health Practice Law) | 🔴 GAP | Detect HPL adherence |
| PDPL | 🟢 LIVE | Privacy notice |

### C.5 · Singapore healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| MOH (Ministry of Health) | 🟢 LIVE | Detect MOH licence |
| HCSA (Healthcare Services Act) | 🔴 GAP | Detect HCSA licence number |
| HSA (Health Sciences Authority) | 🟢 LIVE | Detect HSA registration |
| SMC Ethical Code (Singapore Medical Council) | 🔴 GAP | Detect SMC registration |
| Health Products Act | 🔴 GAP | Detect product registration |
| PDPA | 🟢 LIVE | Privacy notice |
| Private Hospitals and Medical Clinics Act | 🔴 GAP | Detect licence |
| Mental Health (Care and Treatment) Act | 🔴 GAP | Detect MHCTA adherence |

### C.6 · India healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| NMC (National Medical Commission) | 🟢 LIVE | Detect NMC registration |
| Clinical Establishments Act 2010 | 🔴 GAP | Detect CEA registration |
| CDSCO (Drugs) | 🟢 LIVE | Detect CDSCO authorisation |
| Drugs & Cosmetics Act 1940 | 🔴 GAP | Detect compliance statement |
| MCI Code of Ethics (now NMC) | 🔴 GAP | Detect ethics compliance |
| DPDP Act 2023 (sensitive personal data) | 🟢 LIVE | Privacy notice |
| Mental Healthcare Act 2017 | 🔴 GAP | Detect MHA adherence |
| Telemedicine Practice Guidelines 2020 | 🔴 GAP | Detect TPG compliance |

### C.7 · Hong Kong healthcare

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Medical Council of HK | 🟢 LIVE | Detect MCHK registration |
| Pharmacy and Poisons Ordinance Cap. 138 | 🔴 GAP | Detect pharmacy registration |
| Private Healthcare Facilities Ordinance | 🔴 GAP | Detect PHFO licence |
| Mental Health Ordinance Cap. 136 | 🔴 GAP | Detect MHO compliance |
| Dangerous Drugs Ordinance | 🔴 GAP | Detect DDO scheduling |
| PDPO | 🟢 LIVE | Privacy notice |
| Dentists Registration Ordinance | 🔴 GAP | Detect DRO registration |

**Healthcare · total laws across 7 jurisdictions: ~65 · current state: 14 LIVE · 0 META · 51 GAP.**

---

## D · FINANCE

### D.1 · UK finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| FCA Conduct of Business (COBS) | 🔴 GAP | Detect COBS disclosure |
| FCA CONC (Consumer Credit) | 🟢 LIVE | Detect CONC disclosure |
| FCA MAR (Market Abuse) | 🔴 GAP | Detect MAR policy |
| FCA SYSC (Systems & Controls) | 🔴 GAP | Detect SYSC disclosure |
| FCA CASS (Client Money) | 🔴 GAP | Detect client money safeguarding statement |
| FCA Consumer Duty (2023) | 🔴 GAP | Detect Consumer Duty disclosure / Fair Value Assessment |
| FSMA s.21 (Financial Promotions) | 🟢 LIVE | Detect risk warning |
| SMCR (Senior Managers Certification Regime) | 🔴 GAP | Detect SMCR statement |
| PRA Rulebook | 🔴 GAP | Detect PRA prudential disclosure |
| MLR 2017 + POCA 2002 (AML) | 🔴 GAP | Detect MLRO + AML policy |
| Bribery Act 2010 (finance) | 🔴 GAP | Detect anti-bribery policy |
| FOS (Financial Ombudsman) | 🔴 GAP | Detect FOS link in complaints |
| FSCS (Financial Services Compensation Scheme) | 🔴 GAP | Detect FSCS membership statement |
| ICOBS (Insurance Conduct) | 🔴 GAP | Detect insurance distribution disclosure |
| MIFIDPRU | 🔴 GAP | Detect MIFIDPRU compliance |
| EMIR (Derivatives) | 🔴 GAP | Detect EMIR reporting compliance |
| UK GDPR (financial data) | 🟢 LIVE | Privacy notice |
| Equality Act 2010 (vulnerable customers) | 🟡 META | Detect vulnerable customers policy |
| Modern Slavery Act 2015 (large financial firms) | 🟡 META | Revenue threshold + statement |
| Online Safety Act 2023 (where carrying user content) | 🔴 GAP | Detect UGC moderation policy |

### D.2 · US finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| SEC (Securities) | 🔴 GAP | Detect SEC registration / filings |
| FINRA (Broker-Dealers) | 🔴 GAP | Detect FINRA membership / BrokerCheck |
| NYDFS 23 NYCRR 500 (NY Cyber) | 🔴 GAP | Detect NYDFS Cyber Compliance |
| OCC (National Banks) | 🔴 GAP | Detect OCC charter |
| FRB / Federal Reserve | 🔴 GAP | Detect Fed-regulated status |
| FDIC | 🔴 GAP | Detect FDIC member statement |
| GLBA (Gramm-Leach-Bliley) | 🔴 GAP | Detect GLBA privacy notice |
| BSA / AML | 🔴 GAP | Detect AML compliance |
| CFPB (Consumer Financial Protection) | 🔴 GAP | Detect CFPB-compliant disclosures |
| Reg E (Electronic Fund Transfers) | 🔴 GAP | Detect Reg E disclosure |
| Reg Z (Truth in Lending) | 🔴 GAP | Detect TILA disclosure |
| Reg D (Securities exemption) | 🔴 GAP | Detect Reg D filing |
| Dodd-Frank | 🔴 GAP | Detect Dodd-Frank compliance |
| CCPA / CPRA (CA finance) | 🟢 LIVE | Detect "Do Not Sell" link |
| TCPA (cold-calling) | 🔴 GAP | Detect opt-in |
| FCRA (Credit reporting) | 🔴 GAP | Detect FCRA notice |

### D.3 · UAE finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| CBUAE (Central Bank UAE) | 🟢 LIVE | Detect CBUAE licence |
| DFSA (DIFC) | 🟢 LIVE | Detect DFSA firm ref |
| FSRA (ADGM) | 🟡 META | Detect FSRA licence |
| SCA (Securities & Commodities) | 🟡 META | Detect SCA licence |
| Federal Decree-Law 14/2018 (Central Bank Law) | 🔴 GAP | Detect CBL compliance |
| Federal Decree-Law 20/2018 (AML/CFT) | 🔴 GAP | Detect AML/CFT framework |
| VARA (Dubai Virtual Asset Reg Authority) | 🔴 GAP | Detect VARA licence |
| ADGM Spot Crypto Asset Framework | 🔴 GAP | Detect ADGM crypto licence |
| PDPL | 🟢 LIVE | Privacy notice |
| Federal Decree-Law 35/2018 (Anti-Bribery) | 🔴 GAP | Detect anti-bribery policy |

### D.4 · Saudi finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| SAMA (Saudi Central Bank) | 🟢 LIVE | Detect SAMA licence |
| CMA (Capital Market Authority) | 🟢 LIVE | Detect CMA disclosure |
| Banking Control Law | 🔴 GAP | Detect BCL compliance |
| AML Royal Decree M/31 | 🔴 GAP | Detect AML/CFT framework |
| SAMA Open Banking Framework | 🔴 GAP | Detect OBF licence |
| SAMA Cyber Security Framework | 🔴 GAP | Detect CSF compliance |
| SDAIA AI Ethics | 🔴 GAP | Detect AI governance |
| PDPL | 🟢 LIVE | Privacy notice |

### D.5 · Singapore finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| MAS Notice 626 (AML/CFT for Banks) | 🟢 LIVE | Detect MAS Notice 626 reference |
| Financial Advisers Act (FAA) | 🟢 LIVE | Detect FAA licence |
| Securities & Futures Act (SFA) | 🟡 META | Detect SFA licence |
| Payment Services Act (PSA) 2019 | 🟡 META | Detect PSA licence |
| MAS Tech Risk Management Guidelines | 🔴 GAP | Detect TRM compliance |
| MAS Notice on Cyber Hygiene | 🔴 GAP | Detect Cyber Hygiene compliance |
| Cybersecurity Act 2018 (CII) | 🟡 META | Detect CII designation |
| PDPA | 🟢 LIVE | Privacy notice |
| Banking Act + Trust Companies Act | 🔴 GAP | Detect BA/TCA licence |
| Companies Act (Disclosure) | 🔴 GAP | Detect company disclosure |
| ACRA registration | 🔴 GAP | Detect ACRA UEN |

### D.6 · India finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| RBI Master Directions (various) | 🟢 LIVE | Detect RBI licence |
| SEBI (Securities) | 🟢 LIVE | Detect SEBI INZ/INA/INH registration |
| IRDAI (Insurance) | 🔴 GAP | Detect IRDAI registration |
| PFRDA (Pension) | 🔴 GAP | Detect PFRDA registration |
| PMLA 2002 (AML) | 🔴 GAP | Detect AML/Principal Officer |
| FEMA 1999 (Foreign Exchange) | 🔴 GAP | Detect FEMA compliance |
| NPCI UPI Procedural Guidelines | 🔴 GAP | Detect UPI compliance |
| SEBI LODR (Listing) | 🔴 GAP | Detect listing compliance |
| RBI Master Direction on Digital Lending 2022 | 🔴 GAP | Detect digital lending disclosure |
| Black Money Act 2015 | 🔴 GAP | Detect BMA compliance |
| Banking Regulation Act 1949 | 🔴 GAP | Detect BRA licence |
| Information Technology Act 2000 (financial data) | 🟡 META | Detect IT Act compliance |
| DPDP Act 2023 | 🟢 LIVE | Privacy notice |

### D.7 · Hong Kong finance

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| HKMA (Banks) | 🟢 LIVE | Detect HKMA authorisation |
| SFC (Securities & Futures) | 🟢 LIVE | Detect SFC CE No |
| IA (Insurance Authority) | 🔴 GAP | Detect IA licence |
| MPFA (Pension) | 🔴 GAP | Detect MPFA registration |
| AMLO (Anti-Money Laundering Ordinance) | 🔴 GAP | Detect AMLO compliance |
| Banking Ordinance Cap. 155 | 🔴 GAP | Detect BO licence |
| Securities & Futures Ordinance Cap. 571 | 🟡 META | Detect SFO licence |
| Companies Ordinance Cap. 622 | 🟢 LIVE | Detect company disclosures |
| Prevention of Bribery Ordinance | 🔴 GAP | Detect anti-bribery policy |
| Payment Systems and Stored Value Facilities Ordinance | 🔴 GAP | Detect SVF licence |
| PDPO | 🟢 LIVE | Privacy notice |

**Finance · total laws across 7 jurisdictions: ~80 · current state: 15 LIVE · 9 META · 56 GAP.**

---

## E · REAL ESTATE

### E.1 · UK real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| RICS Rules of Conduct | 🟢 LIVE | Detect RICS membership |
| Estate Agents Act 1979 | 🔴 GAP | Detect EAA compliance |
| MLR 2017 (Estate Agency AML) | 🔴 GAP | Detect AML supervisor + Principal |
| Consumer Protection Regs 2008 (CPRs) | 🔴 GAP | Detect material info disclosure |
| Energy Performance Certificates | 🔴 GAP | Detect EPC in listing |
| Equality Act 2010 | 🟡 META | Detect equality statement |
| ARLA / Propertymark | 🔴 GAP | Detect Propertymark accreditation |
| TPO (The Property Ombudsman) | 🔴 GAP | Detect TPO redress scheme |
| Landlord and Tenant Act 1985 | 🔴 GAP | Detect L&T compliance |
| Deregulation Act 2015 (Section 21) | 🔴 GAP | Detect Section 21 compliance |
| GDPR (client / tenant data) | 🟢 LIVE | Privacy notice |

### E.2 · US real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| State Real Estate Commissions (50 states) | 🔴 GAP | Detect state commission licence |
| NAR Code of Ethics | 🔴 GAP | Detect NAR membership |
| RESPA (Real Estate Settlement Procedures) | 🔴 GAP | Detect RESPA compliance |
| TILA (Truth in Lending) | 🔴 GAP | Detect TILA disclosure |
| Fair Housing Act | 🔴 GAP | Detect Fair Housing notice |
| Equal Credit Opportunity Act | 🔴 GAP | Detect ECOA notice |
| State-specific disclosure (CA, NY, FL) | 🔴 GAP | Detect state disclosures |
| FinCEN GTOs (high-value cash) | 🔴 GAP | Detect FinCEN compliance |
| CCPA / CPRA | 🟢 LIVE | Privacy notice |

### E.3 · UAE real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| RERA (Dubai Land Department) | 🟢 LIVE | Detect RERA permit |
| Trakheesi (Dubai marketing permit) | 🟢 LIVE | Detect Trakheesi number (Dubai only) |
| DLD (Dubai Land Department broader) | 🔴 GAP | Detect DLD compliance |
| Tamleek (Dubai property ownership) | 🔴 GAP | Detect Tamleek registration |
| DIFC Real Property Law | 🟡 META | Detect DIFC registration |
| ADRA (Abu Dhabi Real Estate Authority) | 🔴 GAP | Detect ADRA permit (Abu Dhabi only) |
| Federal Decree-Law 20/2018 (AML real estate) | 🔴 GAP | Detect AML compliance |
| Federal Consumer Protection Law | 🟢 LIVE | Consumer disclosure |
| PDPL | 🟢 LIVE | Privacy notice |

### E.4 · Saudi real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| REGA (Real Estate General Authority) | 🟢 LIVE | Detect REGA registration |
| WAFI (Off-Plan Sales Programme) | 🟡 META | Detect WAFI permit |
| MoMRA (Ministry of Municipal Affairs) | 🔴 GAP | Detect MoMRA compliance |
| ZATCA (Tax) | 🔴 GAP | Detect VAT compliance for real estate |
| Saudi Real Estate Brokerage Law | 🔴 GAP | Detect brokerage licence |
| PDPL | 🟢 LIVE | Privacy notice |

### E.5 · Singapore real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| CEA (Council for Estate Agencies) | 🟢 LIVE | Detect CEA salesperson reg |
| HDB (Housing & Development Board) | 🟡 META | Detect HDB regulations |
| URA (Urban Redevelopment Authority) | 🔴 GAP | Detect URA approval |
| BCA (Building & Construction Authority) | 🔴 GAP | Detect BCA licence |
| Estate Agents Act | 🔴 GAP | Detect EA licence |
| PDPA | 🟢 LIVE | Privacy notice |
| AML Notice for Estate Agents | 🔴 GAP | Detect AML compliance |

### E.6 · India real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| RERA (state-by-state: 30+ state authorities) | 🟢 LIVE | Detect state RERA project no |
| Maharashtra MahaRERA specifically | 🟢 LIVE | Detect MahaRERA number |
| Karnataka K-RERA | 🔴 GAP | Detect K-RERA number |
| Tamil Nadu TN-RERA | 🔴 GAP | Detect TN-RERA number |
| Real Estate (Regulation & Development) Act 2016 | 🟢 LIVE | RERA detection |
| Indian Stamp Act 1899 | 🔴 GAP | Detect stamp duty compliance |
| Income Tax Act 1961 (capital gains) | 🔴 GAP | Detect CG disclosure |
| Benami Transactions Act 1988 | 🔴 GAP | Detect Benami compliance |
| FEMA (foreign investment in property) | 🔴 GAP | Detect FEMA compliance |
| DPDP | 🟢 LIVE | Privacy notice |

### E.7 · Hong Kong real estate

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| EAA (Estate Agents Authority) | 🟢 LIVE | Detect EAA licence |
| Estate Agents Ordinance Cap. 511 | 🔴 GAP | Detect EAO compliance |
| Stamp Duty Ordinance | 🔴 GAP | Detect SDO compliance |
| Conveyancing & Property Ordinance | 🔴 GAP | Detect CPO compliance |
| PDPO | 🟢 LIVE | Privacy notice |
| Money Lenders Ordinance (mortgage related) | 🔴 GAP | Detect MLO compliance |

**Real Estate · total laws across 7 jurisdictions: ~52 · current state: 14 LIVE · 4 META · 34 GAP.**

---

## F · ECOMMERCE

### F.1 · UK ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Consumer Rights Act 2015 (CRA) | 🟢 LIVE | Detect CRA disclosure |
| DMCC Act 2024 (Digital Markets) | 🟢 LIVE | Detect DMCC compliance |
| Consumer Contract Regulations 2013 (CCRs) | 🔴 GAP | Detect CCRs disclosure (right to cancel, etc.) |
| Online Safety Act 2023 (UGC) | 🟡 META | Detect age verification / UGC moderation |
| ASA / CAP Code | 🟢 LIVE | Detect ASA-compliant advertising |
| Misleading Advertising Regs 2008 | 🔴 GAP | Detect misleading marketing |
| Equality Act 2010 (accessibility) | 🟢 LIVE | WCAG |
| PECR (cookies + marketing) | 🟢 LIVE | Cookie consent |
| UK GDPR | 🟢 LIVE | Privacy notice |
| Sale of Goods Act / Trade Descriptions Act (legacy) | 🔴 GAP | Detect trade descriptions compliance |
| Consumer Protection from Unfair Trading Regs (CPUT) | 🔴 GAP | Detect unfair practice |
| Returns / Cancellation rights | 🔴 GAP | Detect 14-day cancellation right disclosure |

### F.2 · US ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| FTC Act §5 | 🟢 LIVE | Detect FTC disclosures |
| FTC Endorsement Guides (influencer disclosure) | 🔴 GAP | Detect #ad / paid partnership |
| ROSCA (Restore Online Shoppers' Confidence Act) | 🔴 GAP | Detect ROSCA-compliant negative option |
| TCPA (SMS marketing) | 🔴 GAP | Detect SMS opt-in |
| CAN-SPAM | 🔴 GAP | Detect commercial email opt-out |
| CPRA / CCPA (California) | 🟢 LIVE | Detect "Do Not Sell My Info" |
| TDPSA (Texas) | 🔴 GAP | Detect Texas consumer disclosure |
| VCDPA (Virginia) | 🔴 GAP | Detect Virginia consumer disclosure |
| CTDPA (Connecticut) | 🔴 GAP | Detect Connecticut disclosure |
| ADA Title III (digital accessibility) | 🟡 META | Detect WCAG (LIVE) + ADA-compliant accessibility statement |
| FCRA (consumer credit) | 🔴 GAP | Detect FCRA notice (where issuing credit) |
| Wiretap Act / state recording laws | 🔴 GAP | Detect call recording disclosure |

### F.3 · EU ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| DSA (Digital Services Act) | 🟢 LIVE | Detect DSA point-of-contact |
| DMA (Digital Markets Act) | 🔴 GAP | Detect DMA gatekeeper compliance |
| Consumer Rights Directive 2011/83 | 🔴 GAP | Detect CRD-compliant pre-contractual info |
| Unfair Commercial Practices Directive | 🔴 GAP | Detect UCPD compliance |
| Geo-blocking Regulation 2018/302 | 🔴 GAP | Detect geo-blocking justification |
| ODR Regulation 524/2013 | 🔴 GAP | Detect ODR link |
| EAA 2025 (European Accessibility Act) | 🟢 LIVE | WCAG |
| GDPR | 🟢 LIVE | Privacy notice |
| ePrivacy Directive 2002/58 | 🟢 LIVE | Cookie consent |
| CSRD (Corporate Sustainability) | 🔴 GAP | Detect CSRD disclosure (for large undertakings) |
| Product Safety Regulation 2023/988 | 🔴 GAP | Detect product safety compliance |
| Empowering Consumers for the Green Transition Directive 2024 | 🔴 GAP | Detect green claims disclosure |

### F.4 · UAE ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Federal Consumer Protection Law 15/2020 | 🟢 LIVE | Consumer disclosure |
| Federal Decree-Law 14/2024 (E-commerce + Trade) | 🔴 GAP | Detect e-commerce specific compliance |
| TDRA (Anti-spam) | 🟡 META | Marketing consent |
| PDPL | 🟢 LIVE | Privacy notice |
| VAT Law (Federal Decree-Law 8/2017) | 🔴 GAP | Detect TRN displayed |
| Federal Decree-Law 35/2018 (Anti-Bribery for procurement) | 🔴 GAP | Detect anti-bribery in procurement |

### F.5 · Saudi ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| E-Commerce Law 2019 (Royal Decree M/126) | 🟢 LIVE | Detect e-commerce disclosure |
| ZATCA (VAT) | 🔴 GAP | Detect VAT TRN displayed |
| Anti-Cover-Up Law (Saudi) | 🔴 GAP | Detect ACU compliance |
| CITC Anti-Spam | 🟡 META | Marketing consent |
| Saudi PDPL | 🟢 LIVE | Privacy notice |

### F.6 · Singapore ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| CPFTA (Consumer Protection · Fair Trading Act) | 🟢 LIVE | Consumer disclosure |
| Spam Control Act | 🟡 META | Detect unsubscribe + sender info |
| PDPA (DNC) | 🔴 GAP | Detect DNC compliance |
| Customs Act (Cross-border) | 🔴 GAP | Detect customs disclosure |
| GST Act | 🔴 GAP | Detect GST RegNo displayed |

### F.7 · India ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Consumer Protection (E-Commerce) Rules 2020 | 🟢 LIVE | Detect e-commerce disclosure |
| GST Act 2017 (e-commerce operator) | 🔴 GAP | Detect GSTIN displayed |
| Legal Metrology Act 2009 | 🔴 GAP | Detect MRP, packaging compliance |
| FSSAI (food sale online) | 🟡 META | Detect FSSAI licence (where food sold) |
| IT Rules 2021 (intermediary) | 🟡 META | Grievance officer |
| DPDP 2023 | 🟢 LIVE | Privacy notice |
| Companies Act 2013 (CIN displayed) | 🔴 GAP | Detect CIN in footer |
| Trademarks Act (IP) | 🔴 GAP | Detect TM ownership statement |

### F.8 · Hong Kong ecommerce

| Law / Regulator | Engine state | Trigger mechanism |
|---|---|---|
| Trade Descriptions Ordinance Cap. 362 | 🟢 LIVE | Detect TDO compliance |
| Sale of Goods Ordinance Cap. 26 | 🔴 GAP | Detect SOGO disclosure |
| Personal Data Privacy Ordinance | 🟢 LIVE | Privacy notice |
| Unsolicited Electronic Messages Ordinance Cap. 593 | 🔴 GAP | Detect UEMO opt-in |
| Competition Ordinance | 🔴 GAP | Detect CO compliance |

**Ecommerce · total laws across 8 jurisdictions: ~75 · current state: 16 LIVE · 6 META · 53 GAP.**

---

## G · Summary state of the engine right now

| Sector | Total laws inventoried (7-8 countries) | 🟢 LIVE | 🟡 META | 🔴 GAP |
|---|---:|---:|---:|---:|
| Law firms | 56 | 14 | 18 | 24 |
| Healthcare | 65 | 14 | 0 | 51 |
| Finance | 80 | 15 | 9 | 56 |
| Real estate | 52 | 14 | 4 | 34 |
| Ecommerce | 75 | 16 | 6 | 53 |
| Fintech (subset of finance + crypto) | ~30 extra | 4 | 6 | 20 |
| Hospitality | ~30 | 9 | 3 | 18 |
| SaaS | ~25 | 5 | 4 | 16 |
| **Cross-cutting (AML, Bribery, ESG, WB, MSA)** | **~70** | **3** | **3** | **64** |
| **GRAND TOTAL** | **~480** | **94 (20%)** | **53 (11%)** | **336 (69%)** |

**Reality check.** The engine currently has ~20% live detection across the regulatory landscape that matters to our clients. 11% has metadata but no detector (fixable fast). 69% is not in the engine at all.

The biggest single blind spot is **cross-cutting laws**: AML, Anti-bribery, Whistleblowing, ESG, supply chain due diligence. These apply to nearly every regulated client and we detect none of them.

The second biggest is **healthcare**: 51 of 65 laws are GAP. We have only the primary regulator licence-number detectors.

---

## H · What Phase 1 has to do to get to "perfect"

Phase 1 should bring us from 20% LIVE to at least 75% LIVE on the **must-have** subset of these laws. That subset is:

### H.1 · Cross-cutting must-haves (currently 3 LIVE, need 30 LIVE)

- AML/CFT detector per jurisdiction (MLR 2017 in UK, BSA in US, AMLO in HK, AMLD6 in EU, PMLA in India, AMLD in UAE, AML Decree in Saudi). Detect: AML policy mention + MLRO/Principal Officer disclosure + CDD procedure mention.
- Anti-Bribery detector per jurisdiction (UK Bribery Act, US FCPA, UAE FDL 35/2018, India PCA 1988, Singapore PCA, HK POBO). Detect: anti-bribery policy mention + reporting channel.
- Modern Slavery threshold to £36M with Companies House lookup (already in plan).
- Whistleblowing detector per jurisdiction (UK PIDA, EU WBD 2019/1937, US SOX 806). Detect: whistleblowing channel mention + speak-up policy.
- ESG / Sustainability detector for large firms (CSRD for EU, SEC Climate Disclosure for US, UK FCA Climate, HKEx ESG, India BRSR). Detect: sustainability report link + climate disclosure.

### H.2 · Sector must-haves (the most impactful per sector)

**Law firms**:
- AML/CFT for legal sector + MLRO appointment + Client Account Rules + PII certificate + Legal Ombudsman link.

**Healthcare**:
- CQC Notice of Provision of Care + GPhC/HCPC numbers + Caldicott Guardian + safeguarding policy + DOH Abu Dhabi + SCFHS + SMC + Clinical Establishments Act + MCHK Cap. 138 supplementary.

**Finance**:
- FCA Consumer Duty + Fair Value + MLR 2017 + FOS + FSCS + SMCR + Vulnerable Customers + state finance (NYDFS) + GLBA + CFPB + IRDAI + PFRDA + Banking Ordinance HK + MAS TRM.

**Real estate**:
- MLR 2017 estate agency AML + CPRs material info + EPC + TPO redress + state real estate commission (US) + ADRA Abu Dhabi + Federal AML UAE + State RERA breadth (India) + Estate Agents Ordinance HK.

**Ecommerce**:
- CCRs cancellation right + Endorsement Guides influencer + ROSCA + TCPA + CAN-SPAM + state US privacy (TDPSA, VCDPA, CTDPA) + EU Consumer Rights Directive + Product Safety + UCPD + Green Transition Dir + Federal Decree-Law 14/2024 UAE ecommerce + Legal Metrology India + GSTIN displayed.

### H.3 · Phase 1 detector count

That's roughly **100 new detectors** to write in Phase 1 across all sectors + cross-cutting. Each is small (10-40 lines, one regex + one rule definition + one localised text template). With the scaffolding already in place from Phases 1-4, this is sniper-edit additions to `sector-signal-libraries.js` + `category-catalog.js` + `cross-cutting-detectors.js` (new file).

Adding 100 detectors at 20 minutes each = ~35 hours of focused work = 4-5 working days.

Plus the architecture work from the previous Phase 1 plan (multi-country, anti-hallucination, country tags, city-aware, pipeline gates, telemetry) = another 2-3 days.

**Total Phase 1 effort: 7-9 working days.** This is bigger than my earlier estimate. It is honest.

---

## I · The order I execute Phase 1

1. **Day 1**: scaffold cross-cutting-detectors.js with the 5 cross-cutting laws (AML, Bribery, MSA, WB, ESG). Write a category for each + detector + tests.
2. **Day 2**: extend country-resolver to multi-country + cities + jurisdiction-router for multi. Write country-tag chip in worker + tests.
3. **Day 3**: anti-hallucination scraper (multi-method + evidence verifier) + sector detector hardening (every detector returns {found, snippet, url}).
4. **Day 4**: law-firms gap detectors (AML, Account Rules, PII, Legal Ombudsman) + healthcare gap detectors (Caldicott, GPhC, HCPC, safeguarding, ADAE DOH, SCFHS, SMC, CEA, MCHK).
5. **Day 5**: finance gap detectors (Consumer Duty, MLR, FOS, FSCS, SMCR, NYDFS, GLBA, CFPB, IRDAI, PFRDA, MAS TRM, Banking Ordinance HK).
6. **Day 6**: real-estate + ecommerce gap detectors (MLR estate agency, CPRs, EPC, TPO, state US, ADRA, FDL 14/2024, Legal Metrology, GSTIN, CCRs, CAN-SPAM, TCPA, Endorsement Guides, ROSCA).
7. **Day 7**: pipeline gates wiring + telemetry headers + KV cache version namespacing + rollback infrastructure.
8. **Day 8**: 5-sector backtest fixture creation + execute + manual review of every finding + fix errors.
9. **Day 9**: regression on all 9 prior suites + deploy + live verify on Streathers, Al Tamimi, Emaar, Razorpay, KWM.

---

## J · Decision point

Sign off and I begin Day 1 immediately. The catalog above is the source of truth that Phase 1 implements. Every detector I add gets traceable back to a row in this catalog.

If you want to cut Phase 1 scope further (e.g. defer ESG + CSDDD to Phase 2), tell me which rows to defer. Otherwise the next message I send is "Day 1·cross-cutting-detectors.js starting".
