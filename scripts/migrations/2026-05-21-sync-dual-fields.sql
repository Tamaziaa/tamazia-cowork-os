-- CANONICAL FIELD SYNC for `leads`
-- Problem: the table grew two parallel column families for the same logical data:
--   first_name  <-> contact_first
--   last_name   <-> contact_last
--   title       <-> contact_title
--   email       <-> contact_email
--   email_confidence <-> contact_confidence
-- Different pipelines write/read different twins, so a draft that reads the empty twin
-- emits a blank placeholder ({first}, [Decision Maker Name], etc.). This keeps every
-- twin pair byte-identical automatically, so every framework resolves the same element.
--
-- Strategy: a BEFORE INSERT/UPDATE trigger mirrors whichever side carries a fresh value,
-- plus a one-time backfill of existing rows. Idempotent and safe to re-run.

CREATE OR REPLACE FUNCTION leads_sync_dual_fields() RETURNS trigger AS $$
DECLARE
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.first_name        := COALESCE(NULLIF(NEW.first_name,''),   NULLIF(NEW.contact_first,''));
    NEW.contact_first     := COALESCE(NULLIF(NEW.contact_first,''),NULLIF(NEW.first_name,''));
    NEW.last_name         := COALESCE(NULLIF(NEW.last_name,''),    NULLIF(NEW.contact_last,''));
    NEW.contact_last      := COALESCE(NULLIF(NEW.contact_last,''), NULLIF(NEW.last_name,''));
    NEW.title             := COALESCE(NULLIF(NEW.title,''),        NULLIF(NEW.contact_title,''));
    NEW.contact_title     := COALESCE(NULLIF(NEW.contact_title,''),NULLIF(NEW.title,''));
    NEW.email             := COALESCE(NULLIF(NEW.email,''),        NULLIF(NEW.contact_email,''));
    NEW.contact_email     := COALESCE(NULLIF(NEW.contact_email,''),NULLIF(NEW.email,''));
    NEW.contact_confidence:= COALESCE(NEW.contact_confidence, NEW.email_confidence);
    NEW.email_confidence  := COALESCE(NEW.email_confidence, NEW.contact_confidence);
    RETURN NEW;
  END IF;

  -- UPDATE: propagate whichever side of each pair changed to a fresh non-empty value.
  -- first_name <-> contact_first
  IF COALESCE(NEW.first_name,'') <> COALESCE(OLD.first_name,'') AND NULLIF(NEW.first_name,'') IS NOT NULL THEN
    NEW.contact_first := NEW.first_name;
  ELSIF COALESCE(NEW.contact_first,'') <> COALESCE(OLD.contact_first,'') AND NULLIF(NEW.contact_first,'') IS NOT NULL THEN
    NEW.first_name := NEW.contact_first;
  ELSE
    NEW.first_name    := COALESCE(NULLIF(NEW.first_name,''),   NULLIF(NEW.contact_first,''));
    NEW.contact_first := COALESCE(NULLIF(NEW.contact_first,''),NULLIF(NEW.first_name,''));
  END IF;
  -- last_name <-> contact_last
  IF COALESCE(NEW.last_name,'') <> COALESCE(OLD.last_name,'') AND NULLIF(NEW.last_name,'') IS NOT NULL THEN
    NEW.contact_last := NEW.last_name;
  ELSIF COALESCE(NEW.contact_last,'') <> COALESCE(OLD.contact_last,'') AND NULLIF(NEW.contact_last,'') IS NOT NULL THEN
    NEW.last_name := NEW.contact_last;
  ELSE
    NEW.last_name    := COALESCE(NULLIF(NEW.last_name,''),   NULLIF(NEW.contact_last,''));
    NEW.contact_last := COALESCE(NULLIF(NEW.contact_last,''),NULLIF(NEW.last_name,''));
  END IF;
  -- title <-> contact_title
  IF COALESCE(NEW.title,'') <> COALESCE(OLD.title,'') AND NULLIF(NEW.title,'') IS NOT NULL THEN
    NEW.contact_title := NEW.title;
  ELSIF COALESCE(NEW.contact_title,'') <> COALESCE(OLD.contact_title,'') AND NULLIF(NEW.contact_title,'') IS NOT NULL THEN
    NEW.title := NEW.contact_title;
  ELSE
    NEW.title         := COALESCE(NULLIF(NEW.title,''),        NULLIF(NEW.contact_title,''));
    NEW.contact_title := COALESCE(NULLIF(NEW.contact_title,''),NULLIF(NEW.title,''));
  END IF;
  -- email <-> contact_email
  IF COALESCE(NEW.email,'') <> COALESCE(OLD.email,'') AND NULLIF(NEW.email,'') IS NOT NULL THEN
    NEW.contact_email := NEW.email;
  ELSIF COALESCE(NEW.contact_email,'') <> COALESCE(OLD.contact_email,'') AND NULLIF(NEW.contact_email,'') IS NOT NULL THEN
    NEW.email := NEW.contact_email;
  ELSE
    NEW.email         := COALESCE(NULLIF(NEW.email,''),        NULLIF(NEW.contact_email,''));
    NEW.contact_email := COALESCE(NULLIF(NEW.contact_email,''),NULLIF(NEW.email,''));
  END IF;
  -- email_confidence <-> contact_confidence
  IF NEW.email_confidence IS DISTINCT FROM OLD.email_confidence AND NEW.email_confidence IS NOT NULL THEN
    NEW.contact_confidence := NEW.email_confidence;
  ELSIF NEW.contact_confidence IS DISTINCT FROM OLD.contact_confidence AND NEW.contact_confidence IS NOT NULL THEN
    NEW.email_confidence := NEW.contact_confidence;
  ELSE
    NEW.contact_confidence := COALESCE(NEW.contact_confidence, NEW.email_confidence);
    NEW.email_confidence   := COALESCE(NEW.email_confidence, NEW.contact_confidence);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_sync_dual_fields ON leads;
CREATE TRIGGER trg_leads_sync_dual_fields
  BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_sync_dual_fields();

-- One-time backfill of existing rows (trigger fires and harmonises each).
UPDATE leads SET
  first_name        = COALESCE(NULLIF(first_name,''),   NULLIF(contact_first,'')),
  contact_first     = COALESCE(NULLIF(contact_first,''),NULLIF(first_name,'')),
  last_name         = COALESCE(NULLIF(last_name,''),    NULLIF(contact_last,'')),
  contact_last      = COALESCE(NULLIF(contact_last,''), NULLIF(last_name,'')),
  title             = COALESCE(NULLIF(title,''),        NULLIF(contact_title,'')),
  contact_title     = COALESCE(NULLIF(contact_title,''),NULLIF(title,'')),
  email             = COALESCE(NULLIF(email,''),        NULLIF(contact_email,'')),
  contact_email     = COALESCE(NULLIF(contact_email,''),NULLIF(email,'')),
  contact_confidence= COALESCE(contact_confidence, email_confidence),
  email_confidence  = COALESCE(email_confidence, contact_confidence)
WHERE TRUE;
