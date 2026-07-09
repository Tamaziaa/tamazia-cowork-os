-- 2026-07-09 (#18). Populated statute_chunks (was empty) with a 908-chunk retrievable statutory-obligation
-- corpus covering 366 laws, drawn from compliance_rules (obligation + statutory basis + citation), law_obligations
-- (verbatim/plain statute text), and compliance_laws (section refs + website obligations). Added a GIN full-text
-- index (tsv) so the #19 RAG retrieves by relevance with no external embeddings key. Enforcement feeds
-- (law_enforcement=26, enforcement_news=46, compliance_enforcement=18) were already populated.
INSERT INTO statute_chunks (law_id, section, chunk_text)
SELECT framework_short, rule_id, concat_ws(' | ', nullif(coalesce(layman_explanation,description),''),
       nullif('Statutory basis: '||statutory_citation,'Statutory basis: '), nullif('Cite: '||citation_url,'Cite: '))
FROM compliance_rules WHERE active AND coalesce(layman_explanation,description,'')<>'';
INSERT INTO statute_chunks (law_id, section, chunk_text)
SELECT law_id, coalesce(obligation_type,'obligation')||':'||obligation_id::text, concat_ws(' | ', nullif(verbatim_text,''), nullif(plain_text,''))
FROM law_obligations WHERE coalesce(verbatim_text,plain_text,'')<>'';
INSERT INTO statute_chunks (law_id, section, chunk_text)
SELECT coalesce(neon_framework_short, files10_law_id, id), coalesce(section_ref,'general'), concat_ws(' | ', name, nullif(section_ref,''), nullif(website_obligation,''))
FROM compliance_laws WHERE coalesce(website_obligation, section_ref, name,'')<>'';
ALTER TABLE statute_chunks ADD COLUMN IF NOT EXISTS tsv tsvector;
UPDATE statute_chunks SET tsv = to_tsvector('english', coalesce(chunk_text,'')||' '||coalesce(law_id,'')||' '||coalesce(section,'')) WHERE tsv IS NULL;
CREATE INDEX IF NOT EXISTS idx_statute_chunks_tsv ON statute_chunks USING gin(tsv);
