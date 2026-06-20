#!/usr/bin/env node
'use strict';
// ============================================================================================================================
// NOTION ACCEPT/REJECT — two-way cockpit bridge.
// Polls the Notion Leads Cockpit DB for pages tagged "Accept" or "Reject" in the "Review Action" property,
// writes the verdict into Neon (leads.review_status), then clears the Notion tag so the loop does not repeat.
//
// Flow:
//   1. Query Notion DB (NOTION_LEADS_DB_ID) for pages where "Review Action" select = "Accept" | "Reject"
//   2. For each page: extract lead_id from "Lead ID" (number property)
//   3. Write to Neon:
//        Accept -> review_status='accepted', reviewed_by='notion_cockpit', reviewed_at=NOW()
//                  (skips if already in accepted / applied_accepted / applied_accepted_via_mcp)
//        Reject -> review_status='rejected', reviewed_by='notion_cockpit', reviewed_at=NOW()
//                  (skips if already in rejected / applied_rejected)
//   4. Clear Notion "Review Action" property back to null (PATCH /v1/pages/{id})
//   5. Print summary: accepted N, rejected M, skipped K
//
// Env (from ENV_B64 / .env):
//   NOTION_API_KEY / NOTION_TOKEN  — Notion integration token
//   NOTION_LEADS_DB_ID             — 32-hex or UUID form of the Leads Cockpit database ID
//   NEON_URL / NEON_CONNECTION_STRING
//
// SEND stays OFF. This script only writes review_status. scripts/apply-review.js (running every 30 min)
// then picks up 'accepted'/'rejected' and promotes/parks the lead atomically through the canonical gate.
//
// Uses:
//   - Node 24 built-in fetch for Notion API (no extra deps)
//   - scripts/psql shim for Neon writes (same pattern as apply-review.js / notion-sync.js)
//   - Never prints secret values
// ============================================================================================================================

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// ---- inline .env loader (same shape as apply-review.js / claude-safeguard-batch.js) ----
(() => {
  const ENV_FILES = [
    path.join(ROOT, '.env'),
    '/Users/amanigga/Desktop/TAMAZIA-REBUILD/COWORK-OS-EXECUTION/.env',
  ];
  for (const f of ENV_FILES) {
    try {
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
      }
    } catch (_e) { /* file may not exist on this host */ }
  }
})();

const NOTION_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || '';
// The Leads Cockpit database ID — set in ENV_B64 as NOTION_LEADS_DB_ID.
// Format: 32 hex chars (no dashes) or UUID form — Notion accepts both.
const NOTION_DB_ID = process.env.NOTION_LEADS_DB_ID || '';
const NEON = () => process.env.NEON_URL || process.env.NEON_CONNECTION_STRING || '';

// The select property name on Notion pages that Aman flips to Accept/Reject.
// Must match exactly what the Notion DB property is called.
const REVIEW_PROP = 'Review Action';
// The number property that holds the Neon leads.id value.
const LEAD_ID_PROP = 'Lead ID';

// ---- Neon via psql shim ----
function pg(sql) {
  return execFileSync(
    path.join(ROOT, 'scripts', 'psql'),
    [NEON(), '-tA', '-c', sql],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  ).toString().trim();
}

// ---- Notion API helper (Node 24 built-in fetch) ----
async function notionRequest(method, apiPath, body) {
  const url = 'https://api.notion.com' + apiPath;
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + NOTION_KEY,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch (_e) { return { _raw: text, status: res.status }; }
}

// Query Notion DB for pages where REVIEW_PROP select = value ("Accept" or "Reject")
// Uses the database query endpoint with a filter.
async function queryByReviewAction(value) {
  const pages = [];
  let cursor = undefined;
  // Paginate (Notion returns up to 100 per page)
  for (let attempt = 0; attempt < 20; attempt++) {
    const body = {
      filter: {
        property: REVIEW_PROP,
        select: { equals: value },
      },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const res = await notionRequest('POST', `/v1/databases/${NOTION_DB_ID}/query`, body);
    if (!res || res.object === 'error') {
      // Log the code/message but never the key
      const msg = res ? (res.message || res.code || JSON.stringify(res).slice(0, 120)) : 'no response';
      // If the property doesn't exist yet, Notion returns a validation error — exit cleanly
      if (res && (res.code === 'validation_error' || res.status === 400)) {
        console.log(`[notion-accept-reject] Notion validation error querying for "${value}" — "${REVIEW_PROP}" property may not exist on DB yet. Skipping.`);
        return [];
      }
      throw new Error(`Notion query failed for "${value}": ${msg}`);
    }
    if (!Array.isArray(res.results)) break;
    pages.push(...res.results);
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return pages;
}

// Extract the numeric Lead ID from a Notion page's properties
function extractLeadId(page) {
  const props = page.properties || {};
  const prop = props[LEAD_ID_PROP];
  if (!prop) return null;
  // Number type
  if (prop.type === 'number' && prop.number !== null && prop.number !== undefined) {
    return Number(prop.number);
  }
  // Rich text fallback (in case it was added as text)
  if (prop.type === 'rich_text' && Array.isArray(prop.rich_text) && prop.rich_text.length > 0) {
    const n = parseInt(prop.rich_text[0].plain_text, 10);
    return Number.isFinite(n) ? n : null;
  }
  // Title fallback
  if (prop.type === 'title' && Array.isArray(prop.title) && prop.title.length > 0) {
    const n = parseInt(prop.title[0].plain_text, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Write accept verdict to Neon. Idempotent: skips if already accepted/applied.
function writeAccept(leadId) {
  const sql = `UPDATE leads
    SET review_status='accepted',
        reviewed_by='notion_cockpit',
        reviewed_at=NOW()
    WHERE id=${Number(leadId)}
      AND COALESCE(review_status,'') NOT IN (
        'accepted','applied_accepted','applied_accepted_via_mcp','applied_accept_consent_held'
      )`;
  try {
    pg(sql);
    return true;
  } catch (e) {
    console.warn(`[notion-accept-reject] Neon accept write failed for lead ${leadId}: ${String(e.message || e).slice(0, 120)}`);
    return false;
  }
}

// Write reject verdict to Neon. Idempotent: skips if already rejected/applied.
function writeReject(leadId) {
  const sql = `UPDATE leads
    SET review_status='rejected',
        reviewed_by='notion_cockpit',
        reviewed_at=NOW()
    WHERE id=${Number(leadId)}
      AND COALESCE(review_status,'') NOT IN (
        'rejected','applied_rejected'
      )`;
  try {
    pg(sql);
    return true;
  } catch (e) {
    console.warn(`[notion-accept-reject] Neon reject write failed for lead ${leadId}: ${String(e.message || e).slice(0, 120)}`);
    return false;
  }
}

// Clear the "Review Action" select back to null on the Notion page so it does not re-trigger.
async function clearReviewAction(pageId) {
  const res = await notionRequest('PATCH', `/v1/pages/${pageId}`, {
    properties: {
      [REVIEW_PROP]: { select: null },
    },
  });
  if (res && res.object === 'error') {
    console.warn(`[notion-accept-reject] Failed to clear Review Action on page ${pageId}: ${res.message || JSON.stringify(res).slice(0, 120)}`);
  }
}

async function main() {
  if (!NOTION_KEY) {
    console.log('[notion-accept-reject] NOTION_API_KEY not set — skipping');
    return;
  }
  if (!NOTION_DB_ID) {
    console.log('[notion-accept-reject] NOTION_LEADS_DB_ID not set — skipping (set in ENV_B64 to enable)');
    return;
  }
  if (!NEON()) {
    console.log('[notion-accept-reject] NEON_URL not set — skipping');
    return;
  }

  let accepted = 0, rejected = 0, skipped = 0, errors = 0;

  // ---- Process Accept pages ----
  let acceptPages = [];
  try {
    acceptPages = await queryByReviewAction('Accept');
  } catch (e) {
    console.warn('[notion-accept-reject] Could not query Accept pages:', String(e.message || e).slice(0, 160));
  }

  for (const page of acceptPages) {
    const leadId = extractLeadId(page);
    if (!leadId || !Number.isFinite(leadId) || leadId <= 0) {
      console.log(`[notion-accept-reject] Accept page ${page.id} — no valid Lead ID property, skipping`);
      skipped++;
      // Still clear the tag so it does not loop on a misconfigured page
      await clearReviewAction(page.id).catch(() => {});
      continue;
    }
    const wrote = writeAccept(leadId);
    if (wrote) {
      accepted++;
      console.log(`[notion-accept-reject] accepted lead ${leadId} (page ${page.id})`);
    } else {
      skipped++;
      console.log(`[notion-accept-reject] lead ${leadId} already in accepted/applied state — clearing tag`);
    }
    // Always clear the tag so it does not re-trigger regardless of whether we wrote
    await clearReviewAction(page.id).catch((e) => {
      console.warn(`[notion-accept-reject] clear failed for page ${page.id}: ${String(e.message || e).slice(0, 80)}`);
      errors++;
    });
  }

  // ---- Process Reject pages ----
  let rejectPages = [];
  try {
    rejectPages = await queryByReviewAction('Reject');
  } catch (e) {
    console.warn('[notion-accept-reject] Could not query Reject pages:', String(e.message || e).slice(0, 160));
  }

  for (const page of rejectPages) {
    const leadId = extractLeadId(page);
    if (!leadId || !Number.isFinite(leadId) || leadId <= 0) {
      console.log(`[notion-accept-reject] Reject page ${page.id} — no valid Lead ID property, skipping`);
      skipped++;
      await clearReviewAction(page.id).catch(() => {});
      continue;
    }
    const wrote = writeReject(leadId);
    if (wrote) {
      rejected++;
      console.log(`[notion-accept-reject] rejected lead ${leadId} (page ${page.id})`);
    } else {
      skipped++;
      console.log(`[notion-accept-reject] lead ${leadId} already in rejected/applied state — clearing tag`);
    }
    await clearReviewAction(page.id).catch((e) => {
      console.warn(`[notion-accept-reject] clear failed for page ${page.id}: ${String(e.message || e).slice(0, 80)}`);
      errors++;
    });
  }

  const total = accepted + rejected + skipped;
  if (total === 0 && !errors) {
    console.log('[notion-accept-reject] nothing to do (no Accept/Reject tags found)');
  } else {
    console.log(`[notion-accept-reject] done — accepted=${accepted} rejected=${rejected} skipped=${skipped} errors=${errors}`);
  }
}

main().catch((e) => {
  console.error('[notion-accept-reject] fatal (non-blocking):', String(e.message || e).slice(0, 200));
  process.exit(0); // fail-open: never red the workflow
});
