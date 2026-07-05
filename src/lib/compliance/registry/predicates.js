'use strict';
// src/lib/compliance/registry/predicates.js — the ONE predicate registry (UI-4 / V2 DUP-9 / V3 §6.3).
// Maps each catalogue applies_when predicate to a GROUNDED detector (sector, canonical jurisdiction code, and/or a
// conservative corpus regex). Pure + deterministic + free. derivePredicates(ctx) returns the Set the firm satisfies.
// This is the producer source of truth that buildSignals unions in; adding a grounded producer here removes an
// orphan from the gate WITHOUT new false-attach risk (a finding still requires its own ruleCheck match + connect()).
const RULES = [
  // consumer / commerce (corpus-driven)
  { id:'has_endorsements_or_affiliates', when:c=>/\baffiliate|sponsored (post|content|by)|#ad\b|paid partnership|commission(?:s|ed)? from|as an amazon associate/.test(c.lc) },
  { id:'captures_phone_for_marketing', when:c=>/(phone|mobile|sms|whatsapp)[^.]{0,40}(market|offers|updates|newsletter)|text (us|me) (for|to)|opt[- ]?in to (sms|texts)/.test(c.lc) },
  { id:'uses_ai_chatbot_or_genai_content', when:c=>c.trig.has('uses_ai')||/\bchatbot\b|ai assistant|live chat (bot|widget)|powered by (gpt|ai)|ai[- ]generated|generative ai/.test(c.lc) },
  { id:'is_online_platform_or_marketplace', when:c=>/marketplace|listing platform|connect (buyers|sellers|clients|customers)|vendors? (sign up|onboard|join)|book (a |an )?(provider|professional) (online|through us)/.test(c.lc) },
  { id:'child_directed_content', when:c=>/\b(kids|children|under 13|under 18|for (your )?child|pupils|nursery|toddler|under[- ]18s)\b/.test(c.lc) },
  // healthcare + sub-sectors
  { id:'makes_health_claims', when:c=>/health|clinic|medical|patient|treatment|dental|aesthetic|pharma|wellness/.test(c.sec)&&/cure|treat(s|ment of)?|clinically proven|heals|relieve|reverse|boost(s)? immun|detox|anti[- ]?ageing|results? (guaranteed|in \d)/.test(c.lc) },
  { id:'doctor_led_service', when:c=>/\b(doctor[- ]led|gp[- ]led|physician|consultant[- ]led|led by (a )?(doctor|surgeon|gp)|medically supervised|our (doctors|gps|surgeons))\b/.test(c.lc) },
  { id:'is_cqc_registered_provider', when:c=>/health|clinic|care|dental|aesthetic/.test(c.sec)&&/cqc|care quality commission/.test(c.lc) },
  { id:'mentions_medicines', when:c=>/\b(medicine|medication|prescription|pharmac|tablet|dosage|\bdrug(s)?\b)\b/.test(c.lc) },
  { id:'mentions_pom_or_medicines', when:c=>/prescription[- ]only|\bpom\b|botox|botulinum|dysport|dermal filler|prescription medic/.test(c.lc) },
  { id:'advertises_rx_drugs', when:c=>/\b(buy|order|get|prescri\w*)[^.]{0,30}(viagra|ozempic|wegovy|semaglutide|mounjaro|botox|antibiotic|weight[- ]loss (jab|injection|drug|medication))/.test(c.lc) },
  { id:'offers_injectables', when:c=>/\b(botox|botulinum|dermal filler|lip filler|anti[- ]wrinkle injection|injectable|dysport|profhilo|aesthetic injection|fat[- ]dissolving)\b/.test(c.lc) },
  { id:'offers_cosmetic_interventions', when:c=>/aesthetic|cosmetic|skin clinic|medspa/.test(c.sec)||/\b(cosmetic (procedure|surgery|treatment)|non[- ]surgical|laser (hair|skin)|microneedling|chemical peel|coolsculpt|thread lift)\b/.test(c.lc) },
  { id:'is_dental_practice', when:c=>/dental|dentist/.test(c.sec)||/\bdentist\b|dental (practice|clinic|surgery)|orthodont|endodont|implant dentistry/.test(c.lc) },
  { id:'claims_dental_specialist_title', when:c=>/\b(orthodontist|endodontist|periodontist|prosthodontist|specialist (in )?(orthodontic|endodontic|periodontic)|dental specialist)\b/.test(c.lc) },
  { id:'is_veterinary_practice', when:c=>/veterin|\bvet\b/.test(c.sec)||/\bveterinary\b|\bvet (practice|clinic|surgery|service)|animal hospital/.test(c.lc) },
  { id:'sells_vet_medicines', when:c=>/\b(prescri\w*|sell|supply|dispense)[^.]{0,30}(veterinary|animal) (medicine|medication|drug)|\bpom[- ]?v\b/.test(c.lc) },
  { id:'makes_nutrition_health_claims', when:c=>/\b(boost|support|improve|aid|enhance)[^.]{0,30}(immune|digestion|metabolism|gut health|weight loss|energy levels)\b|superfood|nutrient[- ]rich|clinically (proven|shown) to/.test(c.lc) },
  { id:'makes_fitness_health_claims', when:c=>/fitness|\bgym\b|wellness|pilates|yoga|personal train/.test(c.sec)&&/transform|lose \d|burn fat|build muscle|guaranteed results|shred|shape up|\d+ ?(lbs|kg) in/.test(c.lc) },
  // legal + sub-sectors
  { id:'offers_reserved_legal_activity', when:c=>/law|legal|solicitor|barrister|attorney/.test(c.sec)||/\b(conveyancing|probate|litigation|reserved legal activit|rights of audience|will (writing|drafting)|notary public)\b/.test(c.lc) },
  { id:'is_barrister_or_chambers', when:c=>/barrister/.test(c.sec)||/\b(barrister|chambers|\bqc\b|\bkc\b|direct access barrister|counsel'?s chambers)\b/.test(c.lc) },
  // finance + sub-sectors
  { id:'promotes_financial_products', when:c=>/financ|bank|wealth|invest|insur|fintech|mortgage|pension/.test(c.sec)||/\b(invest(ment)?|isa\b|pension|portfolio|annuity|capital (growth|at risk)|financial product|returns? of \d)\b/.test(c.lc) },
  { id:'is_fca_regulated_retail', when:c=>/financial conduct authority|\bfca\b|authorised and regulated by the fca|\bfrn\b/.test(c.lc) },
  { id:'advertises_consumer_credit', when:c=>/\b(buy now pay later|\bbnpl\b|0% (apr|finance)|representative apr|credit (agreement|broker|available)|spread the cost|pay (monthly|in instal)|personal loan)\b/.test(c.lc) },
  { id:'advertises_mortgages', when:c=>/\bmortgage|remortgage|home loan|first[- ]time buyer|buy[- ]to[- ]let mortgage\b/.test(c.lc) },
  { id:'sells_insurance', when:c=>/insur/.test(c.sec)||/\b(insurance (policy|cover|quote)|insure your|underwrit|premium from|cover starts from)\b/.test(c.lc) },
  { id:'is_listed_or_pre_ipo', when:c=>/\b(listed on (the )?(lse|nasdaq|nyse|aim)|publicly traded|\bipo\b|pre[- ]ipo|investor relations|annual report 20)\b/.test(c.lc) },
  { id:'is_accountancy_firm', when:c=>/account/.test(c.sec)||/\b(chartered accountant|accountancy (firm|practice)|\bicaew\b|\bacca\b|bookkeeping|tax return|audit & assurance)\b/.test(c.lc) },
  { id:'is_rics_firm', when:c=>/\brics\b|royal institution of chartered surveyors|chartered surveyor/.test(c.lc) },
  { id:'uses_architect_title', when:c=>/\barchitect\b|\barb\b|\briba\b|architectural practice/.test(c.lc) },
  { id:'makes_esg_finance_claims', when:c=>/financ|invest|fund|wealth/.test(c.sec)&&/\b(esg|sustainable invest|green (bond|fund|finance)|net[- ]zero portfolio|ethical invest|impact invest)\b/.test(c.lc) },
  { id:'promotes_crypto_to_uk', when:c=>c.jur.has('UK')&&/\b(crypto|bitcoin|ethereum|token sale|web3|digital asset|defi|\bnft\b)\b/.test(c.lc) },
  { id:'promotes_crypto_to_eu', when:c=>c.jur.has('EU')&&/\b(crypto|bitcoin|ethereum|token sale|web3|digital asset|defi|\bnft\b|\bmica\b)\b/.test(c.lc) },
  // real estate
  { id:'is_estate_or_letting_agent', when:c=>/real[- ]?estate|propert|letting|estate[- ]agent/.test(c.sec)||/\b(estate agent|letting agent|properties for (sale|rent)|lettings|tenancy|landlord|to let|for sale by)\b/.test(c.lc) },
  // travel / hospitality / food
  { id:'sells_travel_packages', when:c=>/\b(holiday package|package holiday|\batol\b|\babta\b|all[- ]inclusive|tour operator|book your (holiday|trip))\b/.test(c.lc) },
  { id:'sells_air_travel', when:c=>/\b(flight|airfare|airline|book flights?|departures? from)\b/.test(c.lc) },
  { id:'sells_flight_packages', when:c=>/\b(flight \+ hotel|flight and hotel|package (flight|holiday)|atol protected)\b/.test(c.lc) },
  { id:'sells_food_online', when:c=>/restaurant|food|cafe|takeaway|grocer|bakery|hospitality|\bfb\b/.test(c.sec)&&/\b(order (food )?online|menu|takeaway|food delivery|click & collect|add to (basket|order))\b/.test(c.lc) },
  { id:'sells_hfss_products', when:c=>/\b(confectionery|chocolate bar|sugary (drink|snack)|crisps|biscuits|ice cream|fast food|high in (fat|salt|sugar))\b/.test(c.lc) },
  { id:'sells_or_markets_alcohol', when:c=>/\b(wine|beer|spirits|whisky|vodka|\bgin\b|champagne|cocktail|brewery|distillery|off[- ]licence|alcohol)\b/.test(c.lc) },
  { id:'sells_supplements', when:c=>/\b(supplement|vitamin|protein powder|nutraceutical|collagen drink|probiotic)\b/.test(c.lc) },
  { id:'sells_cbd', when:c=>/\bcbd\b|cannabidiol|hemp (oil|extract)/.test(c.lc) },
  { id:'sells_cbd_food', when:c=>/cbd (gummies|edible|drink|coffee|tea|chocolate|infused|capsule)/.test(c.lc) },
  { id:'makes_green_claims', when:c=>/\b(eco[- ]friendly|sustainable|carbon neutral|net zero|recyclable|biodegradable|environmentally friendly|plastic[- ]free|green credentials)\b/.test(c.lc) },
  { id:'makes_emissions_claims', when:c=>/\b(zero emission|low emission|carbon (offset|footprint)|co2 (saving|reduction)|emission[- ]free)\b/.test(c.lc) },
  // automotive / energy / telecom
  { id:'sells_vehicles', when:c=>/automotive|\bcar\b|vehicle|dealership/.test(c.sec)||/\b(cars? for sale|used cars?|vehicle dealership|car dealer|browse (our )?(stock|vehicles))\b/.test(c.lc) },
  { id:'advertises_car_finance', when:c=>/\b(car finance|\bpcp\b|hire purchase|vehicle finance|finance (your|this) (car|vehicle)|drive away (from|today))\b/.test(c.lc) },
  { id:'is_energy_supplier', when:c=>/energy|utilit|power|solar/.test(c.sec)||/\b(energy supplier|electricity (tariff|supply)|gas (tariff|supply)|switch (your )?energy|renewable energy plan)\b/.test(c.lc) },
  { id:'telecom_or_it_sector', when:c=>/telecom|\bit\b|technology|saas|software/.test(c.sec)||/\b(broadband|telecoms?|mobile network|sim[- ]only|data centre|managed it|\bisp\b)\b/.test(c.lc) },
  // education
  { id:'is_he_provider', when:c=>/higher[- ]education|university|college/.test(c.sec)||/\b(university|higher education|undergraduate|postgraduate|degree (course|programme)|\bofs\b|office for students)\b/.test(c.lc) },
  { id:'is_student_sponsor', when:c=>/\b(student visa|tier 4|sponsor licence|international students|\bcas\b)\b/.test(c.lc) },
  // public / entity
  { id:'is_public_sector_body', when:c=>/\b(\.gov\b|local (council|authority)|nhs trust|government department|public body|borough council)\b/.test(c.lc) },
  { id:'is_uk_registered_entity', when:c=>c.jur.has('UK')&&/\b(ltd\.?|limited|\bllp\b|\bplc\b|registered in (england|scotland|wales)|company (no|number|registration)|companies house|registered office)\b/.test(c.lc) },
  // jurisdiction x sector — US
  { id:'is_us_law_firm', when:c=>c.jur.has('USA')&&/law|legal|attorney|solicitor/.test(c.sec) },
  { id:'is_us_healthcare_provider', when:c=>c.jur.has('USA')&&/health|clinic|medical|dental/.test(c.sec) },
  { id:'is_us_hotel', when:c=>c.jur.has('USA')&&/hotel|hospitality|resort/.test(c.sec) },
  { id:'is_us_real_estate', when:c=>c.jur.has('USA')&&/real[- ]?estate|propert/.test(c.sec) },
  { id:'is_us_ria', when:c=>c.jur.has('USA')&&/\bria\b|registered investment advis|sec[- ]registered|form adv/.test(c.lc) },
  { id:'is_us_broker_dealer', when:c=>c.jur.has('USA')&&/\b(broker[- ]dealer|finra|sec[- ]registered broker)\b/.test(c.lc) },
  { id:'is_us_used_car_dealer', when:c=>c.jur.has('USA')&&/\b(used cars?|pre[- ]owned (vehicle|car)|car dealer)\b/.test(c.lc) },
  // jurisdiction x sector — Gulf
  { id:'is_uae_ecommerce', when:c=>c.jur.has('MENA-AE')&&(/ecommerce|retail|shop/.test(c.sec)||/\b(add to cart|checkout|buy online|online store)\b/.test(c.lc)) },
  { id:'is_saudi_ecommerce', when:c=>c.jur.has('MENA-SA')&&(/ecommerce|retail|shop/.test(c.sec)||/\b(add to cart|checkout|buy online|online store)\b/.test(c.lc)) },
  { id:'is_dubai_property_business', when:c=>c.jur.has('MENA-AE')&&/real[- ]?estate|propert|letting/.test(c.sec) },
  { id:'is_dubai_accommodation', when:c=>c.jur.has('MENA-AE')&&/hotel|hospitality|resort|holiday (home|rental)/.test(c.sec) },
  { id:'is_dubai_school', when:c=>c.jur.has('MENA-AE')&&/school|education|nursery|kindergarten/.test(c.sec) },
  { id:'is_dubai_vasp', when:c=>c.jur.has('MENA-AE')&&/\b(crypto|virtual asset|\bvara\b|digital asset exchange)\b/.test(c.lc) },
  { id:'advertises_health_products_saudi', when:c=>c.jur.has('MENA-SA')&&/health|supplement|medicine|cosmetic|clinic/.test(c.sec+' '+c.lc) },
  { id:'publishes_content_uae', when:c=>c.jur.has('MENA-AE') },
  // jurisdiction x sector — EU
  { id:'is_eu_law_firm', when:c=>c.jur.has('EU')&&/law|legal|avocat|abogad|rechtsanwalt|cabinet juridique/.test(c.sec+' '+c.lc) },
  { id:'is_eu_investment_firm', when:c=>c.jur.has('EU')&&/invest|fund|wealth|securities|mifid/.test(c.sec+' '+c.lc) },
  { id:'is_eu_insurance', when:c=>c.jur.has('EU')&&/insur|assuranc|versicherung/.test(c.sec+' '+c.lc) },
  { id:'is_eu_professional_service', when:c=>c.jur.has('EU')&&/consult|advisor|professional[- ]service|accounting|legal/.test(c.sec) },
  { id:'is_covered_eaa_service', when:c=>c.jur.has('EU')&&(c.trig.has('takes_payment')||c.trig.has('b2c')||/ecommerce|bank|transport|media/.test(c.sec)) },
  { id:'is_difc_financial_firm', when:c=>c.jur.has('MENA-AE-DIFC')&&/financ|bank|wealth|invest|insur|fintech|capital/.test(c.sec) },
  { id:'is_difc_law_firm', when:c=>c.jur.has('MENA-AE-DIFC')&&/law|legal|attorney|solicitor/.test(c.sec) },
  { id:'serves_us_state_residents', when:c=>c.jur.has('USA') },
  { id:'serves_california_residents', when:c=>c.jur.has('USA') },
  { id:'sells_subscription', when:c=>/\b(subscription|subscribe (now|today)|recurring (payment|billing)|monthly plan|auto[- ]renew|membership (plan|fee)|billed (monthly|annually))\b/.test(c.lc) },
];
function derivePredicates({ sector='', jurSet=new Set(), corpusText='', trig=new Set() } = {}) {
  const ctx = { sec:String(sector||'').toLowerCase(), jur:jurSet, lc:String(corpusText||'').toLowerCase(), trig };
  const out = new Set();
  for (const r of RULES) { try { if (r.when(ctx)) out.add(r.id); } catch (_e) {} }
  return out;
}
module.exports = { derivePredicates, PREDICATE_IDS: RULES.map(r=>r.id), RULES };
