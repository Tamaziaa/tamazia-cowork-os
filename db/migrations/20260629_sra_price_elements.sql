-- Phase 3a — make the SRA price-transparency rule GRANULAR. Convert the existing single-regex SRA_PRICE_PUBLISH
-- (which passed the moment ANY price word appeared) into an element checklist that reports which of the SRA
-- Transparency Rules' required price elements are present vs missing, with a verbatim quote for each present element.
-- Trigger = the firm offers a specified service; elements assessed on the fees/pricing page (page_scope deliberately
-- excludes WordPress /feed/ and /comments/feed/). ADDITIVE update of one row. Validated on rashidlaw.co.uk: /our-fees
-- shows cost, VAT, disbursements, timescales and team but NOT the key stages of the work -> one grounded finding.
UPDATE compliance_rules SET
  check_style = 'element_checklist',
  page_scope  = 'fees|pricing|prices|/price|/cost|costs|/charges|tariff|/quote|fee-schedule|fee-guide|scale-of-fees',
  trigger_pattern = '(conveyanc|probate|estate administration|immigration|employment tribunal|motoring offence|licensing application|debt recovery|residential property|uncontested|grant of probate)',
  regex_elements = jsonb_build_array(
    jsonb_build_object('label','the total cost or basis of charges','pattern','(total (cost|fee)|fixed fee|hourly rate|basis of (our )?charg|price (from|start)|fees? (from|start|of)|£ ?[0-9])'),
    jsonb_build_object('label','VAT treatment','pattern','(vat|value added tax|inclusive of vat|plus vat|[+] ?vat|excluding vat|exclusive of vat|no vat)'),
    jsonb_build_object('label','likely disbursements','pattern','(disbursement|search fee|land registry|stamp duty|probate (court )?fee|court fee|third.party cost)'),
    jsonb_build_object('label','likely timescales','pattern','(timescale|how long it (will|may|can) take|typically take|usually take|on average|[0-9]+ ?(to ?[0-9]+ )?(working )?(day|week|month))'),
    jsonb_build_object('label','the key stages of the work','pattern','(key stage|the stages|stages (of|involved|are)|what is included|the process|step by step|what we do)'),
    jsonb_build_object('label','who does the work and their experience','pattern','(qualif|years.{0,4}experience|fee earner|conducted by|handled by|led by|our (solicitor|team|lawyer|conveyancer)|supervised by|expertise of)')
  ),
  description = COALESCE(NULLIF(description,''), 'SRA Transparency Rules require firms offering specified services to publish the cost (or basis of charges), VAT treatment, likely disbursements, timescales, key stages, and who does the work with their experience.'),
  severity = COALESCE(severity, 'P1')
WHERE rule_id = 'SRA_PRICE_PUBLISH';
