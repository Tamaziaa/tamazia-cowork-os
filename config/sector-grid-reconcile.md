# Sector taxonomy reconciliation — collapse everything into `sector-grid.json`

**Canonical source of truth:** `config/sector-grid.json` (`version: v3-2026-06-13`, from the 20×20 PDF — 20 sectors × 20 ICPs = 400 verbatim client types).
This doc maps **every pre-existing taxonomy** in the engine onto the canonical 20 codes, then shows how the **live 7,679 `leads.sector` rows** re-bucket.

Canonical codes (rank · is_priority):

| code | name | rank | priority |
|---|---|---|---|
| LS | Law Firms & Legal | 1 | ✅ |
| HC | Healthcare & Medical | 2 | ✅ |
| AE | Aesthetics, Cosmetic & Dermatology | 3 | ✅ |
| DN | Dental | 4 | ✅ |
| FS | Financial Services | 5 | ✅ |
| RE | Real Estate & Property | 6 | ✅ |
| HO | Hotels & Hospitality | 7 | ✅ |
| FB | Restaurants, Bars & F&B | 8 | ✅ |
| ED | Education | 9 | ✅ |
| PB | Professional & B2B Services | 10 | ✅ |
| CR | Crypto, Web3 & Digital Assets | 11 | — |
| IN | Insurance | 12 | — |
| EC | E-commerce & Luxury Retail | 13 | — |
| AU | Automotive | 14 | — |
| WF | Wellness & Fitness | 15 | — |
| SU | CBD, Supplements & Nutraceuticals | 16 | — |
| VT | Veterinary & Pet Care | 17 | — |
| TR | Travel, Tourism & Experiences | 18 | — |
| EN | Energy, Cleantech & Sustainability | 19 | — |
| PX | Executive & Personal Brand | 20 | — |

---

## 1. `src/lib/sourcing/icp.js` — `SECTORS` (8 keys)

The original, coarsest taxonomy. Healthcare is one bucket that the canonical grid **splits** into four codes (HC / DN / AE + pharmacy→SU); "financial" folds in accountancy which the grid keeps under PB.

| icp.js key | regulator (as coded) | → canonical | notes |
|---|---|---|---|
| `law-firms` | SRA | **LS** | clean 1:1 |
| `healthcare` | CQC/MHRA | **HC** (primary) + **DN** + **AE** + **SU** | **SPLIT.** kw list mixes `dental`/`dentist`→DN, `aesthetic`/`cosmetic surgery`→AE, `pharmacy`→SU. Default unmatched medical → HC. |
| `real-estate` | RICS/Property Ombudsman | **RE** | clean 1:1 |
| `hospitality` | FSA/licensing | **HO** (primary) + **FB** | **SPLIT.** kw `restaurant`/`fine dining`/`bar`/`catering`→FB; `hotel`/`resort`/`spa`/`venue`→HO. |
| `financial` | FCA | **FS** (primary) + **PB** | **SPLIT.** kw `accountant`/`accounting`/`tax advis`→PB (accountancy lives in PB per grid; also valid as FS-04). `insurance`→IN. Rest→FS. |
| `education` | Ofsted/DfE | **ED** | clean 1:1 |
| `automotive` | FCA (motor finance) | **AU** | clean 1:1 |
| `professional` | sector body | **PB** | clean 1:1 (consultancy/architects/engineering/surveyor/recruitment/agency) |

**Splits introduced by the canonical grid that icp.js did not have:** DN, AE, FB, PB, IN, SU all emerge from the 8 coarse buckets above.

---

## 2. `scripts/cc2-provision.js` — `CATALOG` (the `icp_catalog` 20)

Closest existing analogue: already a 20-row catalogue with `priority_rank` 1–20 and `enabled = (rank ≤ 10)`. Mostly 1:1, but the **rank order differs** from the PDF-derived grid, and a few keys map to different canonical codes.

| cc2 `s` (slug) | cc2 rank | cc2 name | → canonical | canonical rank | rank moved? |
|---|---|---|---|---|---|
| `law-firms` | 1 | Law firms & solicitors | **LS** | 1 | same |
| `healthcare` | 2 | Private clinics & healthcare | **HC** | 2 | same |
| `dental` | 3 | Dental practices | **DN** | 4 | −1 |
| `aesthetics` | 4 | Aesthetic & cosmetic clinics | **AE** | 3 | +1 |
| `finance` | 5 | Wealth, advisers & accountants | **FS** | 5 | same |
| `real-estate` | 6 | Estate agents & property | **RE** | 6 | same |
| `hospitality` | 7 | Hotels, resorts & venues | **HO** | 7 | same |
| `food` | 8 | Restaurants & F&B brands | **FB** | 8 | same |
| `pharmacy` | 9 | Pharmacies & online pharmacy | **SU** | 16 | ▼ pharmacy folds into CBD/Supplements/Nutraceuticals (closest PDF home; no standalone pharmacy sector). Alt: HC. |
| `education` | 10 | Schools, colleges & training | **ED** | 9 | +1 |
| `fintech` | 11 | Fintech & payments | **FS** (FS-06) | 5 | ▲ fintech is an FS ICP in the PDF, not its own sector. |
| `automotive` | 12 | Dealerships & vehicle finance | **AU** | 14 | −2 |
| `wellness` | 13 | Gyms, spas & wellness | **WF** | 15 | −2 |
| `veterinary` | 14 | Veterinary clinics | **VT** | 17 | −3 |
| `travel` | 15 | Tour operators & travel | **TR** | 18 | −3 |
| `ecommerce` | 16 | E-commerce & D2C retail | **EC** | 13 | +3 |
| `energy` | 17 | Energy & renewables installers | **EN** | 19 | −2 |
| `recruitment` | 18 | Recruitment & staffing | **PB** (PB-03) | 10 | ▲ recruitment is a PB ICP in the PDF, not its own sector. |
| `b2b` | 19 | Professional services & B2B | **PB** | 10 | +9 |
| `charity` | 20 | Charities & foundations | **(dropped)** | — | ✖ PDF explicitly has **no charity sector**; nearest is PB. Not represented in the canonical 20. |

**New canonical sectors absent from cc2 CATALOG:** CR (Crypto), IN (Insurance), PX (Executive & Personal Brand) — all are full PDF sectors that the cc2 list never had.
**cc2 keys with no standalone canonical sector:** `fintech`→FS, `recruitment`→PB, `pharmacy`→SU, `charity`→dropped/PB.

---

## 3. `src/lib/scraping/serp-engine.js` — `SECTORS` (10 keys)

The SERP scraper's 10-sector query map. Uses some hyphenated slugs that differ from both other files (`legal`, `financial-services`, `ecommerce-retail`, `beauty-wellness`, `professional-services`).

| serp-engine key | → canonical | notes |
|---|---|---|
| `hospitality` | **HO** (+ **FB**) | query seeds mix `fine dining restaurant`→FB into a hospitality bucket. |
| `healthcare` | **HC** (+ **AE** + **DN**) | seeds include `aesthetics clinic`/`cosmetic surgery`→AE, `dental practice`→DN. |
| `real-estate` | **RE** | 1:1 |
| `legal` | **LS** | ⚠ **alias of law-firms.** Live data has BOTH `legal` (941) and `law-firms` (187) — same canonical code LS. |
| `financial-services` | **FS** | 1:1 (alias of `finance`/`financial`) |
| `ecommerce-retail` | **EC** | 1:1 (alias of `ecommerce`) |
| `beauty-wellness` | **WF** (+ **AE**) | seeds `luxury spa`/`wellness retreat`/`fitness studio`→WF; `medical spa`→AE. |
| `automotive` | **AU** | 1:1 |
| `education` | **ED** | 1:1 |
| `professional-services` | **PB** | 1:1 (alias of `professional`/`b2b`) |

---

## 4. Slug-alias collapse (the source of double-counting in live data)

The three files use **different slugs for the same concept**. Canonical normalisation table:

| canonical | all known raw aliases seen across code + live `leads.sector` |
|---|---|
| **LS** | `law-firms`, `legal`, `law firm` |
| **HC** | `healthcare` |
| **AE** | `aesthetics` |
| **DN** | `dental` |
| **FS** | `financial`, `finance`, `financial-services`, `fintech` |
| **RE** | `real-estate` |
| **HO** | `hospitality` |
| **FB** | `food` |
| **ED** | `education` |
| **PB** | `professional`, `professional-services`, `b2b`, `recruitment` |
| **CR** | `crypto` (none live yet) |
| **IN** | `insurance` |
| **EC** | `ecommerce`, `ecommerce-retail` |
| **AU** | `automotive` |
| **WF** | `wellness`, `beauty-wellness` |
| **SU** | `pharmacy`, `supplements`, `cbd` (none live yet) |
| **VT** | `veterinary` (none live yet) |
| **TR** | `travel` (none live yet) |
| **EN** | `energy` (none live yet) |
| **PX** | `executive`, `personal-brand` (none live yet) |
| **(unmapped)** | `unknown` → leave as UNKNOWN, re-classify on next enrich pass |

---

## 5. Live re-bucket — how the 7,679 `leads.sector` rows collapse

Source query (read-only, run 2026-06-13):
`python3 ops/neonq.py "SELECT sector, count(*) FROM leads GROUP BY sector ORDER BY 2 DESC"`

Raw distribution (15 distinct values, total **7,679**):

| raw `leads.sector` | count | → canonical |
|---|---:|---|
| `healthcare` | 2,251 | HC |
| `hospitality` | 1,944 | HO |
| `real-estate` | 1,899 | RE |
| `legal` | 941 | LS |
| `financial-services` | 273 | FS |
| `law-firms` | 187 | LS |
| `unknown` | 79 | (unmapped) |
| `ecommerce` | 41 | EC |
| `ecommerce-retail` | 23 | EC |
| `automotive` | 10 | AU |
| `insurance` | 9 | IN |
| `education` | 8 | ED |
| `professional` | 7 | PB |
| `financial` | 6 | FS |
| `law firm` | 1 | LS |

**Collapsed into canonical codes:**

| canonical | live rows | from raw aliases |
|---|---:|---|
| **HC** | 2,251 | healthcare |
| **HO** | 1,944 | hospitality |
| **RE** | 1,899 | real-estate |
| **LS** | 1,129 | legal (941) + law-firms (187) + law firm (1) |
| **FS** | 279 | financial-services (273) + financial (6) |
| **EC** | 64 | ecommerce (41) + ecommerce-retail (23) |
| **AU** | 10 | automotive |
| **IN** | 9 | insurance |
| **ED** | 8 | education |
| **PB** | 7 | professional |
| **(UNKNOWN)** | 79 | unknown |
| **TOTAL** | **7,679** | |

**Key observations for the re-bucket migration:**
- **LS double-counts today.** `legal` + `law-firms` (+ `law firm`) are three slugs for the same canonical LS = **1,129 rows**. Collapsing them is the single biggest correctness win.
- **FS** similarly merges `financial-services` + `financial` = 279.
- **EC** merges `ecommerce` + `ecommerce-retail` = 64.
- **Only 10 of 20 canonical sectors have any live leads.** The priority-10 sectors AE, DN, FB, ED, PB are under- or un-populated (AE=0, DN=0, FB=0, ED=8, PB=7) despite being top-10 — because legacy sourcing used the coarse 8-bucket `healthcare`/`hospitality` slugs, so dental/aesthetic/restaurant leads are **hidden inside HC (2,251) and HO (1,944)** and must be re-classified out (the splits in §1/§2/§3) to surface them.
- **No live leads yet** for CR, SU, VT, TR, EN, PX (ranks 11/16/17/18/19/20) — expected, sourcing not yet enabled there.
- **79 `unknown`** stay UNKNOWN until the next enrich/classify pass assigns a canonical code.

> Migration is a re-label only (no Neon DDL, no row deletes). `leads.sector` is the SHARED column — **additive/UPDATE only, never rename/drop** per the DO-NOT-TOUCH rules. Recommended: add a derived `leads.sector_canonical` (additive column) populated from the §4 alias table rather than overwriting raw `sector`, so audit-engine joins on the original value are never disturbed.
