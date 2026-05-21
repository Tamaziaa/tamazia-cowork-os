-- 10 plus-addressed test leads for Phase 3 task 3.3.3 (touch-0 end-to-end test).
-- All emails route to realfamemedia@gmail.com via Gmail plus-addressing.
INSERT INTO leads (company, domain, email, contact_first, contact_last, contact_title, sector, jurisdiction, entity_type, status, source, imported_at, first_name, last_name, title, next_touch_date)
VALUES
  ('Test Apex Hotels',      'test-apex.co.uk',      'realfamemedia+t01@gmail.com', 'Aman', 'Test', 'Director', 'hospitality',  'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Briar Healthcare', 'test-briar.co.uk',     'realfamemedia+t02@gmail.com', 'Aman', 'Test', 'Director', 'healthcare',   'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Crown Estates',    'test-crown.co.uk',     'realfamemedia+t03@gmail.com', 'Aman', 'Test', 'Director', 'real-estate',  'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Dalton Solicitors','test-dalton.co.uk',    'realfamemedia+t04@gmail.com', 'Aman', 'Test', 'Director', 'law-firms',    'uk-eng-wales', 'LLP', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Edenfield Lending','test-edenfield.co.uk', 'realfamemedia+t05@gmail.com', 'Aman', 'Test', 'Director', 'finance',      'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Foxglove Hotels',  'test-foxglove.co.uk',  'realfamemedia+t06@gmail.com', 'Aman', 'Test', 'Director', 'hospitality',  'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Grange Clinics',   'test-grange.co.uk',    'realfamemedia+t07@gmail.com', 'Aman', 'Test', 'Director', 'healthcare',   'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Hartfield Lets',   'test-hartfield.co.uk', 'realfamemedia+t08@gmail.com', 'Aman', 'Test', 'Director', 'real-estate',  'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Ivory Chambers',   'test-ivory.co.uk',     'realfamemedia+t09@gmail.com', 'Aman', 'Test', 'Director', 'law-firms',    'uk-eng-wales', 'LLP', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE),
  ('Test Juniper Finance',  'test-juniper.co.uk',   'realfamemedia+t10@gmail.com', 'Aman', 'Test', 'Director', 'finance',      'uk-eng-wales', 'Ltd', 'test', 'phase-3', NOW(), 'Aman', 'Test', 'Director', CURRENT_DATE)
;
