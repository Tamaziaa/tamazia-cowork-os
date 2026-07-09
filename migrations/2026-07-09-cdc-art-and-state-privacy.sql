-- 2026-07-09 (sector-audit; snapshot _bak_schweiger_fix_20260709). (1) US_CDC_ART_REPORTING (fertility ART success-
-- rate reporting) was attaching to a DERMATOLOGY clinic: its trigger had bare tokens 'art' (matches "state of the
-- art") and 'clinic' (matches any clinic). Removed both; trigger now fires only on genuine fertility/ART terms
-- (fertility|ivf|embryo transfer|reproductive medicine|assisted reproductive|success rate|live birth rate).
-- Verified: dermatology -> no CDC_ART; fertility clinic -> CDC_ART. (2) US_STATE_PRIVACY catch-all (already removed
-- from connect UNIVERSAL_FW) still attached and duplicated the named state acts (CCPA/CPRA/VCDPA/TDPSA/WA_MHMDA/
-- NV_SB370); deactivated its 6 rules to complete the removal — the named, citable statutes carry the obligation.
UPDATE compliance_rules SET trigger_pattern='fertility|ivf|success rate|live birth rate|embryo transfer|reproductive medicine|assisted reproductive', sector_relevance=ARRAY['fertility','healthcare'] WHERE rule_id='art-success-rate-reporting';
UPDATE compliance_rules SET active=false WHERE framework_short='US_STATE_PRIVACY' AND active;
