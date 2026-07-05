'use strict';
// src/lib/compliance/registry/sector-views.js — DERIVED legacy views (Branch-4 prep, V1 defect A3).
// Additive-only proof module. It COMPUTES the three hand-maintained legacy sector structures from the ONE
// canonical source (registry/sector.js: TREE + BRIDGE) so a later cut-over can be shown to be lossless.
// Pure, deterministic, no DB, no side effects. See eval/sector-views.test.js for the proof.
//
// The three legacy shapes this reproduces:
//   (1) SECTOR_RX      — src/lib/compliance/signals.js:13-34   (Array<[RegExp, signalsKey]>)
//   (2) SECTOR_MAP     — src/lib/compliance/jurisdiction-router.js:11-88 ({ canonicalSector: [framework_short...] })
//   (3) SECTOR_PARENTS — src/lib/compliance/connect.js:27-43   ({ signalsKey: [canonicalSector...] })
//
// DERIVABILITY NOTE (surfaced, not papered over):
//   registry/sector.js exports { TREE, resolveSubSector, subSectorPredicates, parentOf, subSectorExcludes,
//   SUB_EXCLUSIVE, SUB_SECTOR_IDS } (sector.js:79) — BRIDGE is NOT exported. Since the task requires deriving
//   from TREE + BRIDGE and forbids editing sector.js, this module reads TREE from the module and reconstructs
//   BRIDGE from the on-disk source text of sector.js (single source of truth, no hand-copy). If BRIDGE is later
//   exported, _readBridge() transparently prefers the exported constant.

const fs = require('fs');
const path = require('path');
const sector = require('./sector.js');
const TREE = sector.TREE;

// --- BRIDGE reconstruction (single-source, parsed from sector.js text; sector.js:52) ---
function _readBridge() {
  if (sector.BRIDGE && typeof sector.BRIDGE === 'object') return sector.BRIDGE; // forward-compatible
  const src = fs.readFileSync(path.join(__dirname, 'sector.js'), 'utf8');
  const m = src.match(/const\s+BRIDGE\s*=\s*\{([^}]*)\}/);
  if (!m) throw new Error('sector-views: could not locate BRIDGE literal in sector.js');
  const out = {};
  for (const pair of m[1].split(',')) {
    const mm = pair.match(/\s*([A-Za-z0-9_-]+)\s*:\s*'([^']+)'/);
    if (mm) out[mm[1]] = mm[2];
  }
  return out;
}
const BRIDGE = _readBridge();

// ===== (3) deriveSectorParents() -> connect.js SECTOR_PARENTS ({ signalsKey: [canonicalSector,...] }) =====
function deriveSectorParents() {
  const out = {};
  // (a) BRIDGE aliases: signalsKey -> canonical parent id
  for (const [alias, canon] of Object.entries(BRIDGE)) {
    (out[alias] = out[alias] || []);
    if (!out[alias].includes(canon)) out[alias].push(canon);
  }
  // (b) TREE nodes that declare a `parent:` (child sector inherits parent regulator stack).
  for (const [id, node] of Object.entries(TREE)) {
    if (node.parent) {
      (out[id] = out[id] || []);
      if (!out[id].includes(node.parent)) out[id].push(node.parent);
    }
  }
  return out;
}

// ===== (2) deriveSectorMap() -> jurisdiction-router.js SECTOR_MAP ({ canonicalSector: [framework...] }) =====
// Registry binds frameworks to a NODE. To reproduce the flat legacy map we UNION every sub-node's frameworks
// under a parent, and also emit each sub-node as its own "parent/sub" key.
function deriveSectorMap() {
  const out = {};
  for (const [parentId, node] of Object.entries(TREE)) {
    const union = [];
    for (const s of Object.values(node.sub || {})) {
      for (const fw of (s.frameworks || [])) if (!union.includes(fw)) union.push(fw);
    }
    out[parentId] = union;
    for (const [subId, s] of Object.entries(node.sub || {})) {
      out[parentId + '/' + subId] = (s.frameworks || []).slice();
    }
  }
  return out;
}

// ===== (1) deriveSectorRx() -> signals.js SECTOR_RX (Array<[RegExp, signalsKey]>) =====
// Registry stores per-SUB-node `detect` regexes (fine). Legacy SECTOR_RX is per-signals-key (coarse). We union
// (alternation) the sub-node detect sources under the parent each signals-key bridges to. Structural repro:
// exact legacy source-string equality is NOT expected; the test reports that drift precisely.
function _unionDetect(parentId) {
  const node = TREE[parentId];
  if (!node) return null;
  const parts = [];
  for (const s of Object.values(node.sub || {})) {
    if (s.detect && s.detect.source) parts.push(s.detect.source);
  }
  if (!parts.length) return null;
  return new RegExp(parts.join('|'), 'i');
}
function deriveSectorRx() {
  const out = [];
  const seen = new Set();
  for (const parentId of Object.keys(TREE)) {
    const rx = _unionDetect(parentId);
    if (rx) { out.push([rx, parentId]); seen.add(parentId); }
  }
  for (const [alias, canon] of Object.entries(BRIDGE)) {
    const rx = _unionDetect(canon);
    if (rx && !seen.has(alias)) { out.push([rx, alias]); seen.add(alias); }
  }
  return out;
}

module.exports = { deriveSectorRx, deriveSectorMap, deriveSectorParents, _readBridge, TREE, BRIDGE };
