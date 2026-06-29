-- Phase 3c — three more element-checklist rules (reusing the Phase 3a machinery): cookie consent banner (PECR),
-- FCA financial-promotion risk warnings (FSMA s.21), and UAE health-advertising permit/licence numbers (DHA).
-- check_style='element_checklist' routes them to the checklist branch; trigger_pattern gates relevance; page_scope NULL
-- = assessed site-wide. ADDITIVE new rule rows. Patterns avoid backslashes for clean JSON.
INSERT INTO compliance_rules
  (framework_short, rule_id, rule_type, check_style, page_scope, trigger_pattern, regex_elements, severity, description,
   citation_url, sector_relevance, fine_low_gbp, fine_high_gbp, layman_explanation, tamazia_fix_short, active)
VALUES

('UK_PECR', 'PECR_CONSENT_BANNER_ELEMENTS', 'element_checklist', 'element_checklist', NULL,
 '(cookie|consent|analytics|gtag|gtm|fbq|hotjar|doubleclick|pixel|tracking)',
 jsonb_build_array(
   jsonb_build_object('label','a cookie consent banner or platform','pattern','(onetrust|cookiebot|cookieyes|usercentrics|civic.?cookie|termly|cookie-?consent|cookielaw|cookie.?control|klaro|osano|iubenda|accept all cookies|manage cookies|cookie (settings|preferences))'),
   jsonb_build_object('label','a reject / decline-all option','pattern','(reject all|reject non-?essential|decline( all)?|only necessary|necessary only|refuse( all)? cookies|do not accept)'),
   jsonb_build_object('label','a cookie policy or notice','pattern','(cookie policy|cookie notice|/cookies|cookie statement|use of cookies)')
 ),
 'P1', 'PECR consent: a site setting non-essential cookies must show a consent banner with a reject option and a cookie policy',
 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/',
 NULL, 0, 0,
 'You set cookies or trackers but the scan could not find a proper consent mechanism: PECR requires prior consent via a banner that offers reject as easily as accept, plus a cookie policy. Pre-set non-essential cookies or an accept-only banner is a breach.',
 'Tamazia implements a compliant consent banner with equal accept and reject options, blocks non-essential cookies until consent, and links a complete cookie policy.',
 TRUE),

('UK_FSMA_S21', 'FSMA_PROMO_ELEMENTS', 'element_checklist', 'element_checklist', NULL,
 '(invest(ment|ing)?|capital at risk|return[s]? on investment|\bapr\b|interest rate|portfolio|wealth management|financial promotion|high.?return|fixed return|bond[s]?)',
 jsonb_build_array(
   jsonb_build_object('label','a prominent risk warning','pattern','(capital at risk|your capital is at risk|value of (your )?investments? can (go down|fall)|may (get|receive) back less|past performance is not|investments? can (go|fall) down|risk losing|don.t invest unless)'),
   jsonb_build_object('label','an FCA authorised/regulated statement','pattern','(authorised and regulated by the financial conduct authority|\bfca\b (regulated|authoris|reference|frn)|regulated by the fca|firm reference number|\bfrn\b ?[0-9])'),
   jsonb_build_object('label','complaints / FOS or FSCS signposting','pattern','(financial ombudsman|financial services compensation scheme|\bfscs\b|\bfos\b|complaints procedure)')
 ),
 'P1', 'FCA financial promotion: investment/credit promotions must carry a risk warning, FCA-authorised status and redress signposting',
 'https://www.fca.org.uk/firms/financial-promotions-and-adverts',
 ARRAY['finance','financial-services','investment','wealth','fintech','crypto','insurance','accounting','lending'],
 0, 0,
 'Your site promotes investments or credit but the scan could not find a required element of a compliant financial promotion (a prominent risk warning, your FCA-authorised status, or FOS/FSCS signposting). Under FSMA s.21 promotions must be fair, clear and not misleading.',
 'Tamazia adds the prescribed risk warnings, your FCA authorisation statement and FOS/FSCS signposting, and routes promotions through an approved s.21 sign-off.',
 TRUE),

('UAE_DHA', 'DHA_PERMIT_ELEMENTS', 'element_checklist', 'element_checklist', NULL,
 '(clinic|dental|dentist|aesthetic|cosmetic|surgery|treatment|doctor|dermatolog|medical centre|medical center|patient)',
 jsonb_build_array(
   jsonb_build_object('label','a health-advertising permit / approval reference','pattern','(advertis(ing|ement) (permit|approval|licen[cs]e)|permit (no|number|ref)|moh(ap)? (permit|approval)|dha (permit|approval|advertis)|approval (no|number|code)|ad[\s-]?permit)'),
   jsonb_build_object('label','a facility licence number','pattern','(facility licen[cs]e|dha licen[cs]e|dhcc licen[cs]e|doh licen[cs]e|moh(ap)? licen[cs]e|licen[cs]e (no|number)[\s:.-]*[a-z0-9]|licensed by (the )?(dha|dhcc|doh|moh))'),
   jsonb_build_object('label','practitioner licence numbers','pattern','(practitioner licen[cs]e|professional licen[cs]e|dha (professional|practitioner)|registered with (the )?(dha|dhcc|doh|moh)|licen[cs]ed (doctor|dentist|practitioner))')
 ),
 'P1', 'UAE health-advertising: a clinic''s site must display its advertising-permit number and facility/practitioner licences',
 'https://www.dha.gov.ae/',
 ARRAY['aesthetic','aesthetics','dental','healthcare','cosmetic','plastic-surgery','dermatology','medical-aesthetics','clinic','health'],
 0, 0,
 'UAE rules (DHA/MOHAP/DOH) require medical marketing to display the advertising-permit reference and the facility and practitioner licence numbers. The scan could not find these on your site, which is a common enforcement trigger.',
 'Tamazia displays your advertising-permit reference and facility and practitioner licence numbers on the site, and confirms each advert is permit-approved before publication.',
 TRUE)
ON CONFLICT (framework_short, rule_id) DO NOTHING;
