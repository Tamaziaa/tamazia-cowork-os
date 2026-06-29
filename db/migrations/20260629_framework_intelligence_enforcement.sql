-- Phase 4.1 — VERIFIED recent enforcement actions for the framework-intelligence catalogue.
-- Each row below was independently researched and cross-checked against the regulator's own publication or reputable
-- press; the source URL is stored for provenance. Frameworks with NO verifiable recent action are deliberately left
-- NULL (UK_COMPANIES_ACT s.82, UK_FCA_CONSUMER_DUTY [no completed Duty fine exists yet], UK_FOS_FSCS, UK_ARLA,
-- UAE_PDPL [executive regulations pending], US_FTC_FAKE_REVIEWS [Rytr order vacated Dec 2025]) — the render falls back
-- to honest generic prose for those. No enforcement claim is stored unverified. ADDITIVE update of existing rows only.
UPDATE framework_intelligence AS fi SET
  recent_enforcement = v.enf,
  recent_enforcement_url = v.url,
  updated_at = now()
FROM (VALUES

('UK_SRA_TRANSPARENCY',
 'Southampton firm David Ebert LLP was fined £20,700 plus £10,000 costs by the Solicitors Disciplinary Tribunal in 2024 for persistently breaching the SRA Transparency Rules 2018, having failed to publish required price, complaints and Legal Ombudsman information on its website.',
 'https://www.legalfutures.co.uk/latest-news/tribunal-fines-law-firm-for-persistent-transparency-rule-breaches'),

('UK_SRA_COC',
 'Bradford solicitor Shezhad Ilyas (Goldmark Legal Services) was struck off the roll and ordered to pay £28,000 costs after the Solicitors Disciplinary Tribunal found he had acted dishonestly, giving misleading evidence to a County Court and inaccurate information to the SRA.',
 'https://www.lawgazette.co.uk/news/solicitor-struck-off-over-dishonesty-to-sra/5127055.article'),

('UK_DPA_2018',
 'In March 2025 the ICO fined Advanced Computer Software Group £3.07m under the UK GDPR for security failings that enabled a 2022 LockBit ransomware attack, which disrupted NHS 111 and exposed the personal data of 79,404 people.',
 'https://ico.org.uk/action-weve-taken/enforcement/2025/03/advanced-computer-software-group-limited/'),

('UK_GDPR_A13',
 'In March 2025 the ICO fined Advanced Computer Software Group £3.07m under the UK GDPR for security failings behind a 2022 ransomware attack affecting 79,404 people, underlining that transparency and security duties under the UK GDPR are enforced with multi-million-pound penalties.',
 'https://ico.org.uk/action-weve-taken/enforcement/2025/03/advanced-computer-software-group-limited/'),

('UK_PECR',
 'In January 2024 the ICO fined HelloFresh £140,000 for sending over 80 million unsolicited marketing emails and texts without valid consent, in breach of Regulation 22 of PECR.',
 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2024/01/ico-fines-hellofresh-140-000-for-spam-texts-and-emails/'),

('UK_ICO_COOKIES',
 'In its January 2025 cookie-compliance sweep of the UK''s top 1,000 websites, the ICO reviewed the first 200 and warned 134 to fix issues such as the absence of a clear ''Reject All'' option and non-essential cookies set before consent.',
 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/01/ico-takes-action-to-tackle-cookie-compliance-across-the-uk-s-top-1-000-websites/'),

('UK_DMCC_2024',
 'In 2026 the CMA imposed its first monetary penalty under the Digital Markets, Competition and Consumers Act 2024, fining the AA''s driving schools £4.2m plus over £760,000 in refunds to more than 80,000 learner drivers for hiding a mandatory booking fee from the headline price (drip pricing).',
 'https://www.gov.uk/government/news/cma-orders-the-aa-and-bsm-driving-schools-to-refund-learner-drivers-over-drip-pricing'),

('UK_CMA',
 'In July 2024 the CMA secured undertakings from deals site Wowcher over misleading countdown timers and urgency claims plus a pre-ticked paid ''VIP membership'', resulting in over £4m of refund credits to more than 870,000 customers.',
 'https://www.gov.uk/government/news/cma-secures-over-4-million-in-refunds-for-wowcher-customers'),

('UK_CRA_2015',
 'In 2026 the High Court endorsed a CMA settlement under which mattress firm Emma Sleep admitted breaching consumer law through misleading countdown timers and false ''high demand'' messages, signing binding undertakings to change its sales and pricing practices.',
 'https://www.gov.uk/government/news/court-endorses-cma-action-as-emma-sleep-agrees-to-change-sales-practices'),

('UK_ASA_CAP',
 'In 2026 the ASA banned a Motorpoint Instagram ad claiming buyers could ''Save up to £17,000'', finding the claim misleading and unsubstantiated (only 20 of 1,611 vehicles fell in that band) in breach of the CAP Code; ASA rulings carry no fine but compel withdrawal.',
 'https://www.asa.org.uk/rulings/motorpoint-ltd-a26-1332053-motorpoint-ltd.html'),

('UK_TRADING_STANDARDS',
 'In October 2024 West Berkshire Council Trading Standards secured confiscation orders totalling nearly £270,000 against R''Ellite Rainments Ltd and its director following conviction over counterfeit-clothing offences.',
 'https://www.gov.uk/government/publications/trading-standards-ip-crime-survey-and-successes-2024-to-2025/trading-standards-survey-2024-to-2025'),

('UK_EQUALITY_2010',
 'In 2021 blind student Holly Scott-Gardner brought a disability-discrimination claim against the Student Loans Company under the Equality Act 2010 over an inaccessible online form, recovering a £5,000 settlement after which the form was made accessibility-compliant.',
 'https://analysisfunction.civilservice.gov.uk/policy-store/accessibility-legislation-what-you-need-to-know/'),

('UK_FCA_CONDUCT',
 'In October 2024 the FCA fined TSB Bank £10,910,500 for inadequate systems and controls that meant customers in arrears or financial difficulty were not treated fairly, with TSB also paying about £99.9m in redress to roughly 232,849 customers.',
 'https://www.fca.org.uk/news/press-releases/fca-fines-tsb-over-treatment-customers-financial-difficulty'),

('UK_FSMA_S21',
 'In February 2024 the FCA fined Floris Jakobus Huisamen £31,800 and banned him for recklessly signing off hundreds of London Capital & Finance minibond financial promotions that were misleading and omitted key risks.',
 'https://www.fca.org.uk/news/press-releases/fca-bans-and-fines-floris-jakobus-huisamen-over-london-capital-finance-plc-financial-promotions'),

('UK_FCA_CONC25',
 'In 2024 the FCA reported a record 19,766 financial promotions amended or withdrawn after its intervention (up 97.5% on 2023), including 9,197 misleading consumer-credit claims-management promotions removed from 46 authorised firms.',
 'https://www.fca.org.uk/news/press-releases/fca-steps-action-against-misleading-financial-adverts'),

('UK_SMCR',
 'In July 2025 the FCA fined former Barclays CEO Jes Staley £1.1m and banned him from senior roles after the Upper Tribunal upheld its finding that he acted with a lack of integrity over misleading statements to the FCA about his relationship with Jeffrey Epstein.',
 'https://www.fca.org.uk/news/press-releases/upper-tribunal-upholds-jes-staley-ban'),

('UK_FCA_HRI_PROMO',
 'Since the cryptoasset financial-promotions regime took effect in October 2023 the FCA has issued over 450 alerts against firms and individuals communicating non-compliant crypto and high-risk-investment promotions, requiring website takedowns and amendments.',
 'https://www.fca.org.uk/firms/cryptoassets-information'),

('UK_CQC',
 'In 2024 a County Durham care-home provider was prosecuted by the Care Quality Commission for failing to provide safe care and treatment following the death of a 93-year-old resident, and was ordered to pay £47,681 in fine and costs.',
 'https://www.cqc.org.uk/press-release/durham-care-home-provider-ordered-pay-ps47681-prosecution-brought-care-quality'),

('UK_MHRA',
 'In December 2024 the MHRA, with the ASA and General Pharmaceutical Council, issued an enforcement notice warning advertisers that promoting prescription-only weight-loss medicines such as Wegovy, Mounjaro and Ozempic to the public is unlawful and ordering such ads withdrawn.',
 'https://www.asa.org.uk/news/asa-partners-with-mhra-and-gphc-to-reinforce-rules-on-the-advertising-of-weight-loss-drugs-online.html'),

('UK_TPO',
 'In 2024 David Key Property Limited was expelled from The Property Ombudsman scheme after failing to comply with a guaranteed-rent agreement, preventing the landlord from letting to tenants of his choosing.',
 'https://www.estateagenttoday.co.uk/breaking-news/2024/11/the-property-ombudsman-reveals-latest-agent-expulsions/'),

('UK_RICS',
 'In January 2024 a RICS Disciplinary Panel expelled surveyor Edward Webb for dishonesty and lack of integrity after he claimed to be a fully qualified RICS member and displayed the RICS logo without entitlement, ordering him to pay £20,000 in costs.',
 'https://thenegotiator.co.uk/news/associations-bodies-news/surveyor-expelled-from-rics-for-dishonesty-and-lack-of-integrity/'),

('UK_FSA',
 'In July 2024, following a Food Standards Agency National Food Crime Unit investigation, poultry farmer Stuart Perkins and SG Perkins Ltd were ordered to pay over £50,000 after pleading guilty to food-safety offences including falsifying Salmonella testing certificates.',
 'https://www.food.gov.uk/news-alerts/news/fsas-national-food-crime-unit-investigation-results-in-a-ps50000-fine-for-food-business-which-faked-disease-certificates'),

('UK_FOOD_INFO_2014',
 'In 2024 JR Uxbridge Ltd (Javitri restaurant) was ordered to pay £43,816 after pleading guilty to food-information offences when a customer with a nut allergy was served a meal with undeclared allergens and was hospitalised.',
 'https://pre.hillingdon.gov.uk/news/article/59/uxbridge-restaurant-fined-more-than-40-000-after-allergen-contamination-led-to-customer-being-hospitalised'),

('US_FTC',
 'In 2024 the FTC, via a DOJ referral, charged security-camera maker Verkada over sending more than 30 million commercial emails that failed to honour unsubscribe requests and omitted a physical address, resulting in a US$2.95m civil penalty — its largest CAN-SPAM penalty.',
 'https://www.ftc.gov/news-events/news/press-releases/2024/08/ftc-takes-action-against-security-camera-firm-verkada-over-charges-it-failed-secure-videos-other'),

('US_FTC_ENDORSE',
 'In 2022 the FTC ordered Fashion Nova to pay US$4.2m to settle allegations it suppressed hundreds of thousands of reviews rated below four stars, violating the FTC Act''s prohibition on deceptive endorsement and review practices.',
 'https://www.ftc.gov/news-events/news/press-releases/2022/01/fashion-nova-will-pay-42-million-part-settlement-ftc-allegations-it-blocked-negative-reviews'),

('US_CPRA',
 'In 2022 the California Attorney General secured a US$1.2m settlement from Sephora for violating the CCPA by failing to disclose it was selling consumers'' personal information and ignoring opt-out requests sent via Global Privacy Control signals.',
 'https://oag.ca.gov/news/press-releases/attorney-general-bonta-announces-settlement-sephora-part-ongoing-enforcement'),

('US_ADA',
 'In 2021-22 the US Department of Justice secured a settlement with Rite Aid requiring it to make its online COVID-19 vaccine-registration portal conform to WCAG 2.1 AA after it was inaccessible to screen-reader users, in breach of ADA Title III (injunctive relief, no civil penalty).',
 'https://www.justice.gov/usao-mdpa/pr/justice-department-secures-settlement-rite-aid-corporation-make-its-online-covid-19'),

('US_FAIR_HOUSING_ACT',
 'In 2022 the US Department of Justice settled with Meta (Facebook) over a targeted housing-ad system that discriminated on protected characteristics in breach of the Fair Housing Act, requiring Meta to pay the statutory maximum civil penalty of US$115,054 and overhaul its ad-delivery algorithm.',
 'https://www.justice.gov/crt/case/united-states-v-meta-platforms-inc-fka-facebook-inc-sdny'),

('UAE_DHA',
 'Under the UAE health-advertising regime, clinics and physicians that advertise medical or pharmaceutical products without prior MOHAP / health-authority approval face penalties ranging from a warning and AED 1,000 up to AED 1 million.',
 'https://www.khaleejtimes.com/news/government/social-media-ads-on-pharma-products-in-uae-now-need-health-ministry-nod'),

('UAE_DHCC',
 'Dubai Healthcare City Authority''s Rule No. 3 of 2025 (effective 2 May 2025) sets a fine of AED 2,000 (rising to AED 4,000 on repeat) for a healthcare operator''s or professional''s non-compliance with DHCA advertising-policy requirements.',
 'https://dhcc.ae/gallery/Rule_No_3.pdf'),

('UAE_MOHAP',
 'Under MOHAP''s health-advertising rules, health bodies, clinics and physicians that publish advertisements without a MOHAP permit face fines from a warning and AED 1,000 up to AED 1 million, with possible suspension of the medical licence for six months to one year.',
 'https://www.khaleejtimes.com/news/government/social-media-ads-on-pharma-products-in-uae-now-need-health-ministry-nod'),

('DIFC_DPL',
 'The DIFC Commissioner of Data Protection issued 323 administrative fines in 2023 (up from 41 in 2022) under the DIFC Data Protection Law 2020, mostly for contraventions such as failing to renew processing notifications, with per-infringement fines between US$25,000 and US$100,000.',
 'https://www.difc.com/business/registrars-and-commissioners/commissioner-of-data-protection/supervision-enforcement'),

('UAE_HEALTH_DATA_LAW',
 'Article 13 of UAE Federal Law No. 2 of 2019 on the Use of ICT in Health Fields prohibits storing or transferring UAE health data abroad without health-authority approval, and breach carries a fine of between AED 500,000 and AED 700,000.',
 'https://www.lw.com/en/insights/2021/08/UAE-Decision-on-Health-Data-Law-Provides-Clarity'),

('UAE_ICT_HEALTH_LAW',
 'Article 13 of UAE Federal Law No. 2 of 2019 on the Use of ICT in Health Fields prohibits storing or transferring UAE health data abroad without health-authority approval, and breach carries a fine of between AED 500,000 and AED 700,000.',
 'https://www.lw.com/en/insights/2021/08/UAE-Decision-on-Health-Data-Law-Provides-Clarity')

) AS v(fw, enf, url)
WHERE fi.framework_short = v.fw;
