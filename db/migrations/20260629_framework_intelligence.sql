-- Phase 4.1, Curated regulatory-intelligence catalogue (ADDITIVE: new table, touches no existing audit-engine table).
-- One row per framework_short. Powers the screened/applicable regulatory-intelligence block in the audit render:
-- 5-7 key obligations the regulator assesses + the regulator's review focus + a recent legislative/guidance change.
-- recent_enforcement is filled SEPARATELY by a verified research pass (no enforcement claim is stored unverified).
-- Obligations/focus/guidance below are factual regulatory requirements stated from the regimes themselves.
CREATE TABLE IF NOT EXISTS framework_intelligence (
  framework_short        text PRIMARY KEY,
  key_obligations        text,          -- newline-separated, 5-7 concrete obligations the regulator assesses
  regulator_focus        text,          -- what the regulator reviews / currently prioritises
  recent_enforcement     text,          -- ONE verified recent action incl. real penalty (filled by verified pass)
  recent_enforcement_url text,          -- provenance for the enforcement claim
  recent_guidance        text,          -- a recent legislative or guidance development (factual)
  reviewed_at            date,
  updated_at             timestamptz DEFAULT now()
);

INSERT INTO framework_intelligence (framework_short, key_obligations, regulator_focus, recent_guidance, reviewed_at) VALUES

('UK_SRA_TRANSPARENCY',
'Publish price information for the specified services you offer (e.g. residential conveyancing, probate, immigration, employment tribunals, motoring offences, debt recovery, licensing).
State the total cost or a clear basis for calculation, including hourly rates and the experience of fee-earners.
Make the VAT position explicit on every quoted price.
Itemise likely disbursements and state whether VAT applies to each.
Give typical timescales and the key stages of the matter.
Identify who will carry out the work, with their qualifications and experience.
Display the SRA-issued digital badge (clickable) and complaints information, including the Legal Ombudsman and SRA.',
'The SRA actively monitors law-firm websites for cost and service transparency and for the mandatory clickable digital badge, running targeted sweeps of firms advertising the specified services.',
'The SRA''s 2023-24 transparency-compliance reviews found a majority of sampled firms only partially compliant, and it has reminded firms the digital badge and complaints data are mandatory, not optional.',
'2026-06-29'),

('UK_SRA_COC',
'State clearly that the firm is authorised and regulated by the Solicitors Regulation Authority, with the SRA number.
Operate and signpost a complaints procedure, including the Legal Ombudsman and its time limits.
Provide clients with clear information on costs, who is handling the matter and the service to expect.
Maintain client confidentiality and run conflict-of-interest checks.
Make information about professional indemnity insurance available to clients on request.
Communicate honestly and ensure publicity is not misleading.',
'The SRA enforces accurate regulated-status disclosure, honest client communications and proper complaints handling; misleading website claims and absent regulatory information are common enforcement triggers.',
'The SRA Standards and Regulations require the digital badge and regulated-status wording; 2024 guidance reiterated that consumers must be able to verify a firm''s regulated status from its website.',
'2026-06-29'),

('UK_FCA_CONDUCT',
'Deliver good outcomes for retail customers across products and services, price and value, consumer understanding and consumer support (Consumer Duty, PRIN 2A).
Ensure all financial promotions are fair, clear and not misleading (COBS 4).
Present benefits and risks with balance, giving required risk warnings due prominence.
Avoid foreseeable harm and act in good faith towards customers.
Monitor, evidence and report on the outcomes customers actually receive.
Signpost the Financial Ombudsman Service and, where relevant, FSCS protection.',
'The FCA assesses outcomes-monitoring, fair value and the clarity of customer communications across all retail firms under the Consumer Duty, and reviews financial promotions for fairness.',
'The Consumer Duty has been in force for open products since 31 July 2023 and closed products since 31 July 2024; the FCA continues to publish Dear CEO letters on fair value and outcomes evidence.',
'2026-06-29'),

('UK_FCA_CONSUMER_DUTY',
'Act to deliver good outcomes on the four Consumer Duty outcomes: products and services, price and value, consumer understanding and consumer support.
Demonstrate products and services meet identified target-market needs.
Evidence fair value through a value assessment.
Communicate so customers can make effective, timely and informed decisions.
Provide support that meets customers'' needs, including vulnerable customers.
Produce an annual board report evidencing customer outcomes.',
'The FCA reviews fair-value assessments, outcomes data and treatment of vulnerable customers, and expects firms to act on outcomes-monitoring rather than merely collect it.',
'The FCA''s 2024-25 Consumer Duty work prioritised price and value and consumer support; it has stated it will take action where firms cannot evidence good outcomes.',
'2026-06-29'),

('UK_FSMA_S21',
'Ensure any invitation or inducement to engage in investment activity is issued or approved by an authorised person (s.21 FSMA), unless exempt.
Make every financial promotion fair, clear and not misleading.
Give risk warnings the required prominence, especially for high-risk investments.
Hold approver permission under the s.21 financial-promotion gateway before approving third-party promotions.
Keep adequate records substantiating promotional claims.',
'The FCA scrutinises online financial promotions for high-risk investments and crypto, and operates a strengthened approver gateway; unapproved or misleading promotions are removed and can be prosecuted.',
'The FCA''s s.21 approver gateway took effect on 7 February 2024, and its crypto financial-promotions regime now applies to firms marketing cryptoassets to UK consumers.',
'2026-06-29'),

('UK_FCA_CONC25',
'Ensure consumer-credit financial promotions are clear, fair and not misleading (CONC 3).
Show a representative APR and the required representative example where a rate or incentive is stated.
Present the cost of credit and any risks with balanced prominence.
Avoid promoting credit as unconditionally available or suitable for everyone.
Assess affordability and creditworthiness before lending.',
'The FCA reviews credit advertising for misleading cost claims and missing representative examples, with particular attention to high-cost and buy-now-pay-later style products.',
'HM Treasury is bringing buy-now-pay-later lending into FCA regulation, extending CONC-style promotion and affordability rules to previously exempt agreements.',
'2026-06-29'),

('UK_SMCR',
'Allocate prescribed responsibilities to approved senior managers with clear statements of responsibility.
Certify staff in certification functions as fit and proper at least annually.
Apply the conduct rules and train all staff on them.
Maintain a responsibilities map for the firm''s governance.
Notify the FCA of conduct breaches and disciplinary action.',
'The FCA uses the regime to hold named senior individuals accountable, focusing on clear responsibility allocation and fitness-and-propriety certification.',
'The FCA and HM Treasury reviewed the Senior Managers and Certification Regime in 2024-25 to streamline it while preserving individual accountability.',
'2026-06-29'),

('UK_DPA_2018',
'Publish a clear privacy notice identifying the controller (and DPO where applicable) and contact details.
State a valid lawful basis for each processing purpose.
Specify data-retention periods and the criteria used to set them.
Explain data-subject rights (access, rectification, erasure, objection, portability) and how to exercise them.
Disclose international transfers and the safeguards relied upon.
Register with the ICO and pay the data-protection fee, and handle requests within statutory deadlines.',
'The ICO assesses lawful basis, transparency and retention, checks registration and fee payment, and pursues complaints and significant personal-data breaches.',
'The Data (Use and Access) Act 2025 amends the UK data-protection regime, adjusting rules on automated decisions, complaints handling and legitimate interests.',
'2026-06-29'),

('UK_GDPR_A13',
'Provide the Article 13 information at the point personal data is collected from the individual.
Give the controller''s identity and contact details, and the DPO''s where applicable.
State the purposes and lawful basis for processing, and legitimate interests where relied on.
Name recipients or categories of recipients of the data.
State the retention period and the individual''s rights, including the right to complain to the ICO.',
'The ICO checks that collection notices are complete, accessible at the point of collection and written in plain language.',
'ICO guidance continues to stress layered, just-in-time privacy information at the point of data collection rather than a single buried policy.',
'2026-06-29'),

('UK_PECR',
'Obtain prior consent before setting non-essential cookies or similar technologies.
Provide a consent mechanism with genuine, equally prominent accept and reject options.
Maintain a cookie policy listing each cookie''s purpose and duration.
Obtain consent for electronic marketing and honour opt-outs and the right to withdraw consent.
Do not use pre-ticked boxes or imply consent from continued browsing.',
'The ICO is running cookie-compliance sweeps of the most-visited UK websites, focusing on reject-all parity and pre-set non-essential cookies.',
'The ICO''s 2024-25 cookie work warned leading UK sites to fix non-compliant banners, and government has consulted on a future move to opt-out/automated cookie controls.',
'2026-06-29'),

('UK_ICO_COOKIES',
'Set only strictly necessary cookies without consent; all others require prior opt-in consent.
Give the reject option equal prominence to accept on the first layer of the banner.
Do not drop non-essential cookies or trackers before the user has consented.
List cookies, purposes, durations and third parties in a cookie policy.
Allow consent to be withdrawn as easily as it was given.',
'The ICO is actively reviewing banner design on high-traffic UK websites and has signalled enforcement where reject-all is harder than accept-all.',
'In 2024-25 the ICO contacted many top UK websites about non-compliant cookie banners and published an updated approach to consent-or-pay models.',
'2026-06-29'),

('UK_DMCC_2024',
'Do not commission, write, host or incentivise fake or misleading consumer reviews.
Show the total price including unavoidable mandatory fees up front (no drip pricing).
Avoid misleading actions, misleading omissions and aggressive practices.
Give clear pre-contract information and honour cancellation and cooling-off rights.
Make subscription terms, renewals and exit clear to the consumer.',
'The CMA gained direct consumer-protection enforcement powers under the Act and is prioritising fake reviews, drip pricing and subscription traps.',
'The DMCC Act''s consumer-protection provisions and the CMA''s direct fining power (up to 10% of global turnover) commenced in April 2025, with the fake-reviews ban now in force.',
'2026-06-29'),

('UK_CMA',
'Do not use misleading pricing, fake urgency or false scarcity claims.
Substantiate comparison and "from" pricing claims.
Present reference/was prices fairly and accurately.
Avoid misleading consumers about the main characteristics of a product or service.
Make terms and total costs transparent before purchase.',
'The CMA targets misleading pricing, urgency claims and unfair terms across consumer-facing sites, now backed by direct enforcement and fining powers.',
'Under the DMCC Act 2024 the CMA can decide breaches and impose fines directly from April 2025, without first going to court.',
'2026-06-29'),

('UK_COMPANIES_ACT',
'Display the full registered company name on the website.
Show the company registration number, place of registration and registered office address.
State the part of the UK in which the company is registered.
Disclose this information on business letters, order forms and websites (s.82).
Keep registered details at Companies House accurate and up to date.',
'Companies House and the Insolvency Service enforce trading-disclosure requirements; absent or inaccurate website disclosure is a straightforward compliance gap.',
'The Economic Crime and Corporate Transparency Act 2023 is phasing in identity verification for directors and people with significant control, with greater Companies House powers to query filings.',
'2026-06-29'),

('UK_EQUALITY_2010',
'Make reasonable adjustments so disabled people can access services, including the website.
Do not discriminate, directly or indirectly, in the provision of services.
Provide information in accessible formats on request.
Design digital services to be perceivable, operable and understandable (WCAG-aligned).
Avoid practices that put people with protected characteristics at a disadvantage.',
'The EHRC and individual claimants treat an inaccessible website as a potential failure to make reasonable adjustments in service provision.',
'UK courts and the EHRC continue to treat WCAG 2.1/2.2 AA as the practical benchmark for an accessible website under the reasonable-adjustments duty.',
'2026-06-29'),

('UK_CRA_2015',
'Supply services with reasonable care and skill, within a reasonable time and price where not agreed.
Ensure consumer contract terms are fair and transparent; unfair terms are not binding.
Give pre-contract information required by consumer-contract rules.
Honour rights to repeat performance or price reduction where services fall short.
Present terms in plain, intelligible language and make them available.',
'Trading Standards and the CMA assess fairness and transparency of consumer terms and the accuracy of pre-contract information.',
'The DMCC Act 2024 strengthens consumer-contract enforcement, layering direct CMA powers on top of the Consumer Rights Act regime.',
'2026-06-29'),

('UK_TRADING_STANDARDS',
'Describe goods and services accurately; no false or misleading descriptions.
Price goods and services transparently, including mandatory charges.
Avoid banned unfair commercial practices (e.g. fake scarcity, false endorsements).
Honour consumer cancellation and refund rights.
Ensure product safety and accurate labelling where applicable.',
'Trading Standards enforces the consumer-protection regime locally, focusing on misleading descriptions, pricing and prohibited practices.',
'The DMCC Act 2024 updated the list of banned practices, expressly prohibiting fake reviews and drip pricing enforced alongside Trading Standards.',
'2026-06-29'),

('UK_ASA_CAP',
'Ensure marketing is legal, decent, honest and truthful.
Hold documentary evidence to substantiate objective claims before publishing.
Avoid misleading pricing, comparisons and savings claims.
Clearly identify advertising, affiliate and influencer content.
Apply extra care for claims in health, finance and weight-loss sectors.',
'The ASA rules on misleading and unsubstantiated claims and is increasing scrutiny of online, social and influencer advertising via its monitoring technology.',
'The ASA has expanded use of AI-assisted monitoring to proactively find non-compliant online ads, particularly around influencer disclosure and misleading claims.',
'2026-06-29'),

('UK_CQC',
'Ensure marketing of regulated care is accurate and not misleading.
Display the current CQC rating prominently, including on the website, where the service is rated.
Reflect the registered scope of regulated activities in advertising.
Do not make unsubstantiated outcome or quality claims.
Provide accurate information about the service to people choosing care.',
'The CQC requires providers to display current ratings, including on websites, and checks that marketing reflects the registered, rated service.',
'The CQC''s single assessment framework, rolled out from 2024, changes how providers are rated and re-emphasises accurate public display of ratings.',
'2026-06-29'),

('UK_MHRA',
'Do not advertise prescription-only medicines to the public.
Substantiate all claims about medicines and medical devices.
Avoid claims that a product can prevent, treat or cure unless authorised.
Include required information and warnings in advertising of medicines.
Ensure medical-device marketing matches the registered intended purpose.',
'The MHRA enforces medicines and medical-device advertising rules, targeting unlicensed claims and promotion of prescription-only medicines to the public.',
'The MHRA is implementing the post-Brexit UK medical-devices framework and has issued guidance on advertising and on AI-enabled medical devices.',
'2026-06-29'),

('UK_ARLA',
'Belong to a government-approved redress scheme (e.g. The Property Ombudsman or PRS).
Display fees to tenants and landlords transparently, in line with the Tenant Fees Act.
Hold and display client-money-protection scheme membership.
Provide material information on property listings and avoid misleading descriptions.
Handle client money and deposits in line with the scheme rules.',
'National Trading Standards'' estate and letting agency team and Propertymark focus on fee transparency, client-money protection and material information on listings.',
'National Trading Standards has issued phased guidance (Parts A-C) requiring "material information", including price, tenure and known issues, on all property listings.',
'2026-06-29'),

('UK_TPO',
'Be a member of an approved redress scheme and display membership.
Provide clear, accurate information to consumers about properties and services.
Handle complaints fairly and signpost the Ombudsman.
Avoid misleading marketing of properties.
Treat consumers fairly throughout the transaction.',
'The Property Ombudsman reviews complaint handling and adherence to its Code, focusing on transparency and fair treatment of buyers, sellers and tenants.',
'The forthcoming reform of property-agent regulation continues to reference the Ombudsman Codes and material-information duties as the consumer-protection baseline.',
'2026-06-29'),

('UK_RICS',
'Act with integrity and provide a high standard of service.
Avoid conflicts of interest and disclose them where they arise.
Be transparent about fees and the basis of charges.
Hold professional indemnity insurance and a complaints-handling procedure.
Provide clear, accurate information to clients and the public.',
'RICS enforces its Rules of Conduct, focusing on integrity, transparency of fees and proper complaints handling by regulated firms and surveyors.',
'The updated RICS Rules of Conduct (in force from 2022) emphasise public-interest obligations, transparency and the responsible use of technology.',
'2026-06-29'),

('UK_FSA',
'Provide allergen information for the 14 named allergens.
Describe food accurately and avoid misleading claims.
Apply Natasha''s Law (PPDS) labelling for prepacked-for-direct-sale food.
Maintain food-safety management and traceability.
Display hygiene-rating information where required by scheme rules.',
'The Food Standards Agency and local-authority environmental-health officers focus on allergen disclosure, accurate food information and food-safety management.',
'Natasha''s Law (full ingredient and allergen labelling for prepacked-for-direct-sale food) has applied since October 2021, with continued FSA allergen guidance.',
'2026-06-29'),

('UK_FOOD_INFO_2014',
'Declare the 14 regulated allergens in ingredient information.
Provide mandatory food information accurately and legibly.
Avoid misleading descriptions of food.
Give allergen information for non-prepacked and PPDS food.
Apply correct labelling for prepacked food.',
'Enforced by local-authority food teams under the Food Information Regulations 2014, with allergen accuracy the principal focus.',
'Post-Natasha''s-Law guidance requires full ingredient lists with allergens emphasised on prepacked-for-direct-sale food.',
'2026-06-29'),

('UAE_PDPL',
'Establish a lawful basis (typically consent) for processing personal data.
Provide a privacy notice with the controller''s identity, purposes and data-subject rights.
Honour rights of access, correction, deletion, portability and objection.
Apply safeguards for cross-border transfers of personal data.
Appoint a Data Protection Officer where required and report breaches.',
'The UAE Data Office oversees the federal PDPL, with consent, transparency and cross-border transfer safeguards the central compliance themes.',
'The PDPL (Federal Decree-Law 45/2021) is in force, with its executive regulations expected to detail consent, transfers and DPO requirements.',
'2026-06-29'),

('UAE_DHA',
'Obtain a health-advertising permit before publishing any medical or health promotion.
Display the advertising permit/reference number on the advertisement.
Show the facility licence number and practitioner licence numbers.
Substantiate medical claims and avoid guaranteed-outcome or misleading claims.
Obtain approval before using testimonials or before/after imagery.',
'Dubai Health Authority, MOHAP and DOH require prior advertising permits and licence-number display, and act against unpermitted or exaggerated medical advertising.',
'DHA and MOHAP continue to require pre-approval of health advertisements through their e-services, with permit numbers shown on all medical marketing.',
'2026-06-29'),

('UAE_DHCC',
'Hold the relevant DHCC/DHCR clinical and facility licences for the regulated activity.
Meet DHCC clinical-governance and quality standards.
Advertise only within the permitted, licensed scope of services.
Maintain patient-data confidentiality under DHCC and PDPL rules.
Display licensing information as required.',
'The Dubai Healthcare City Authority enforces free-zone clinical governance and licensing, including the accuracy and scope of marketing by licensed facilities.',
'DHCC continues to align its clinical-governance and data rules with federal UAE health and data-protection requirements.',
'2026-06-29'),

('UAE_MOHAP',
'Obtain MOHAP licensing for facilities and practitioners in the federal/northern emirates.
Secure advertising approval before publishing health promotions.
Display licence and permit numbers on marketing.
Substantiate health claims and avoid prohibited claims.
Comply with federal health-data and patient-confidentiality rules.',
'MOHAP regulates health facilities and advertising outside Dubai and Abu Dhabi, focusing on licensing and pre-approval of medical marketing.',
'MOHAP operates digital licensing and advertising-approval services, requiring permit numbers on all health advertisements.',
'2026-06-29'),

('US_FTC',
'Do not send commercial email with deceptive headers or subject lines (CAN-SPAM).
Identify the message as an advertisement and include a valid physical postal address.
Provide a clear, working unsubscribe mechanism and honour opt-outs within 10 business days.
Avoid unfair or deceptive acts or practices in advertising generally (FTC Act §5).
Substantiate advertising claims with adequate evidence.',
'The FTC enforces CAN-SPAM email rules and §5 against deceptive advertising, with per-violation civil penalties for email and disclosure failures.',
'The FTC has continued CAN-SPAM enforcement and, separately, finalised rules on fake reviews and unfair fees that raise advertising-disclosure expectations.',
'2026-06-29'),

('US_FTC_ENDORSE',
'Disclose material connections between endorsers and the advertiser clearly and conspicuously.
Ensure endorsements reflect honest opinions and the endorser''s actual experience.
Do not present fake or incentivised reviews as independent.
Make influencer disclosures unavoidable and easy to understand.
Hold substantiation for any claims made in endorsements.',
'The FTC focuses on undisclosed influencer relationships and fake reviews under its updated Endorsement Guides.',
'The FTC''s updated Endorsement Guides (2023) and its 2024 Rule on Consumer Reviews and Testimonials tightened rules on fake and incentivised reviews.',
'2026-06-29'),

('US_FTC_FAKE_REVIEWS',
'Do not create, buy, sell or disseminate fake consumer reviews or testimonials.
Do not use AI-generated reviews presented as genuine consumer experience.
Disclose insider reviews by employees or relatives.
Do not suppress negative reviews through unfair means.
Avoid buying followers, views or other indicators of social influence.',
'The FTC enforces its Rule on Consumer Reviews and Testimonials, with civil penalties available for fake-review and review-suppression practices.',
'The FTC''s fake-reviews rule (16 CFR Part 465) took effect in October 2024, allowing civil penalties per violation.',
'2026-06-29'),

('US_CPRA',
'Maintain a privacy policy stating categories of data collected, purposes and retention.
Provide a "Do Not Sell or Share My Personal Information" link.
Honour opt-out preference signals such as Global Privacy Control.
Enable consumer rights to know, delete, correct and limit use of sensitive data.
Provide notice at collection and avoid dark patterns in consent flows.',
'The California Privacy Protection Agency and Attorney General enforce CCPA/CPRA, focusing on opt-out honouring, GPC and sensitive-data limits.',
'The CPPA has issued and updated CCPA regulations and begun enforcement sweeps, including on Global Privacy Control honouring and data-broker registration.',
'2026-06-29'),

('US_ADA',
'Provide goods, services and digital experiences accessible to people with disabilities (Title III).
Align websites and apps with recognised accessibility standards (WCAG).
Offer accessible alternatives where barriers exist.
Maintain an accessibility statement and feedback mechanism.
Remediate known accessibility barriers promptly.',
'Plaintiffs and the DOJ treat inaccessible websites as Title III barriers; web-accessibility lawsuits remain at high volume.',
'The DOJ''s 2024 Title II web-accessibility rule set WCAG 2.1 AA for state and local government, reinforcing WCAG as the practical benchmark for Title III too.',
'2026-06-29'),

('US_FAIR_HOUSING_ACT',
'Do not publish discriminatory housing advertisements referencing protected classes.
Avoid steering or statements indicating a preference or limitation.
Display the Equal Housing Opportunity logo or statement where expected.
Ensure digital ad targeting does not exclude protected groups.
Provide equal information and service to all prospective buyers and renters.',
'HUD and private plaintiffs enforce the Fair Housing Act against discriminatory advertising, including digital and targeted advertising practices.',
'HUD guidance has addressed discriminatory targeting in online housing advertising and the fair-housing risks of automated tenant-screening and advertising tools.',
'2026-06-29')

ON CONFLICT (framework_short) DO UPDATE SET
  key_obligations = EXCLUDED.key_obligations,
  regulator_focus = EXCLUDED.regulator_focus,
  recent_guidance = EXCLUDED.recent_guidance,
  reviewed_at     = EXCLUDED.reviewed_at,
  updated_at      = now();
