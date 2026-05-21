# Automation audit · Phase 5 → now
Every automation, whether it's wired into the live cycle, and how it connects to the admin dashboard (tamazia.co.uk/admin). ✅ in 30-min cycle · 🟡 on-demand/triggered · 📊 surfaces in dashboard.

## Sourcing
| Automation | Status | In cycle | Dashboard |
|---|---|---|---|
| SERP engine (serp-engine.js) — sponsored + organic, 10 sectors | ✅ built | ✅ run-serp-scrape (daily-gated) | 📊 Sponsored + Organic tabs |
| Query calendar (query-calendar.js) — 14,400 queries, daily rotation | ✅ | ✅ via serp-engine | 📊 scrape_runs |
| Registries/GLEIF/CH/SEC/OSM sourcers | ✅ built | 🟡 on-demand | 📊 acquisition_channel |
| Ad-intel: pixel/job-board/Meta-Ad-Lib/Google-Ads-Transparency | ✅ built | 🟡 (signals feed quality scorer) | 📊 ad_intel field |

## Enrichment + quality
| Enrichment waterfall (waterfall.js) — Hunter emails + all socials + website | ✅ | ✅ enrich-and-queue (8/run) | 📊 all_emails/all_socials |
| S063 deep-research — news + sector intel + brand pointers + Touch 0 | ✅ | ✅ run-deep-research-batch (6/run) | 📊 personalisation_pointers |
| 10-layer quality scorer (lead-quality.js) — genuine + compliance-need + SEO-need | ✅ NEW | ✅ qualify-and-queue (12/run) | 📊 quality_score/quality_fit/layers |
| NeverBounce verify | ✅ wired | 🟡 pre-send (needs credits) | 📊 contact_confidence |
| Audit mint (audit-worker) — Touch-1 asset | ✅ | 🟡 (17 live) | 📊 audit_url |

## Outreach + cadence
| S064/S065 touch cadence (Touch 0 +5d +10d +20d) | ✅ | ✅ send-due | 📊 Email tracking tab |
| Quality gate in send-due (scored <60 never sends) | ✅ NEW | ✅ | 📊 status=quality_blocked |
| Alias rotator (LRU + warmup + health) + Aman-identity rule | ✅ | ✅ | 📊 sends |
| Relay router (4 relays + failover + caps) | ✅ | ✅ | 📊 relay_provider |
| Content linter (spam + placeholder gates) | ✅ | ✅ pre-send | 📊 blocked_spam_lint |
| Multi-channel waterfall (email→LinkedIn→Insta) + manual-send tracking | ✅ | ✅ enrich-and-queue | 📊 Pending LinkedIn/Insta tabs |

## Replies + journey
| Zoho IMAP poller + S012 14-cat classifier | ✅ built | ✅ zoho-imap-poll (needs paid Zoho IMAP) | 📊 replies KPI |
| Client journey (client_journey view + lifecycle stages) | ✅ | ✅ (every step writes) | 📊 Overview + journey |
| S016 alias health monitor | ✅ | 🟡 weekly | 📊 alias status |

## Surfacing + automation backbone
| Admin dashboard (admin-worker.js) — 7 tabs, live Neon, mark-sent, send-to-pipeline | ✅ | live at /admin | 📊 the dashboard itself |
| CRM dashboard generator (build-crm-dashboard.js) | ✅ | ✅ each cycle | 📊 HTML snapshot |
| run-engine-cycle.sh orchestrator (8 steps) | ✅ | runs every 30 min | — |
| Reporting (Slack #all-tamazia + Telegram) | ✅ terse | ✅ on scrape complete | 📊 |

## The live cycle order (run-engine-cycle.sh)
reply-poll → send (gated) → daily-scrape → enrich → deep-research → **quality-gate** → dashboard.

## Honest gaps still open
- **SERPER_KEY** — scrape skips until set (serper.dev).
- **Zoho IMAP** — reply automation needs paid Zoho Lite (~£1/mo).
- **24/7 host** — Oracle VM pending; launchd loads the cycle locally meanwhile.
- **NeverBounce credits** — 0 now (refreshes).
- **Brevo activation + Resend/MailerSend keys** — unlock more send volume.
