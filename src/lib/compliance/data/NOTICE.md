# Third-party data attribution

## Open Cookie Database
- Source: https://github.com/jkwakman/Open-Cookie-Database
- License: Apache License 2.0
- Files: `open-cookie-database.csv` (verbatim), `tracker-classification.json` (derived: platform → category/controller/cookies, Analytics+Marketing+Advertising only)
- Used by: `src/lib/compliance/tracker-detect.js` to name the specific cookies, category and data controller for trackers detected on an audited site.
