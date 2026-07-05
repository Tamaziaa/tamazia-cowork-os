'use strict';
// Phase 3.1 — feed change-detection. Proves checksum classifies new/updated/unchanged and sets the re-review flag on
// change. Parser handles Atom+RSS. Live fetch is a smoke (network-gated). Deterministic core needs no network.
const assert = require('assert');
const { parseAtom, detectChanges, checksum, FEED_SOURCES } = require('../src/lib/feeds/feed-registry.js');
// parser
const xml = '<feed><entry><title>Data Act 2026</title><id>uri:1</id><link href="http://x/1"/><updated>2026-07-01</updated></entry><entry><title>AI Reg</title><id>uri:2</id><updated>2026-06-01</updated></entry></feed>';
const entries = parseAtom(xml);
assert.strictEqual(entries.length, 2, 'parses both entries');
assert.strictEqual(entries[0].title, 'Data Act 2026', 'title parsed');
// change detection: first run = all new
const seen = {};
let ev = detectChanges(entries, id => (id in seen ? seen[id] : null));
assert(ev.every(e => e.change_type === 'new'), 'first run: all new');
assert(ev.every(e => e.requires_legal_review === true), 'new entries flag re-review');
for (const e of ev) seen[e.entry_id] = e.checksum;
// second run, unchanged
ev = detectChanges(entries, id => (id in seen ? seen[id] : null));
assert(ev.every(e => e.change_type === 'unchanged'), 'unchanged run detected');
assert(ev.every(e => e.requires_legal_review === false), 'unchanged => no re-review');
// modify one entry -> updated
const entries2 = parseAtom(xml.replace('2026-07-01', '2026-08-15'));
ev = detectChanges(entries2, id => (id in seen ? seen[id] : null));
const upd = ev.find(e => e.entry_id === 'uri:1');
assert.strictEqual(upd.change_type, 'updated', 'modified entry => updated');
assert.strictEqual(upd.requires_legal_review, true, 'updated => re-review flag');
// RSS shape too
assert(parseAtom('<rss><item><title>X</title><guid>g1</guid><pubDate>2026-01-01</pubDate></item></rss>').length === 1, 'parses RSS item');
assert(FEED_SOURCES.length >= 3, 'feed registry has sources');
console.log(`feed-registry OK: parse Atom+RSS, checksum new/updated/unchanged + re-review flag; ${FEED_SOURCES.length} sources configured.`);
