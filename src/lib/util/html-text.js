'use strict';
// D-01 — THE ONE CORRECT HTML->TEXT EXTRACTOR. EVERY SCANNER MUST USE THIS AND NOTHING ELSE.
//
// WHAT WAS WRONG, and it reached clients:
//   Fifteen separate call sites each rolled their own stripper, all of them variations on
//       html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
//   That is wrong in three ways, and CodeQL flags it as `js/bad-tag-filter`:
//
//   1. `<\/script>` demands the closing tag be EXACTLY "</script>". HTML legally permits "</script >" with
//      whitespace and every browser accepts it. On such a page the close never matches, THE ENTIRE JAVASCRIPT
//      BLOCK SURVIVES INTO THE "VISIBLE TEXT" CORPUS, and the compliance scanner then reads minified JS as if it
//      were page prose. Reproduced: `<script >var _gaq=[["_setAccount","UA-123"]]...</script >` came out the far
//      side as body text. We could quote JAVASCRIPT SOURCE as an `evidence_quote` on a breach sent to a law firm.
//   2. `<[^>]+>` cannot see that a `>` inside a quoted attribute value is not the end of the tag, so
//      `<div data-x="a>b">Hidden</div>` leaks `b">Hidden` into the text.
//   3. HTML comments were never removed, so commented-out markup counted as page content.
//
// This is a character scanner, not a regex. It is the only way to get quoting right. The corpus it produces is
// what every legal finding is evidenced against, so it is worth doing properly exactly once.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/' };

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
    if (Object.prototype.hasOwnProperty.call(NAMED, g)) return NAMED[g];
    if (g[0] === '#') {
      const code = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      if (Number.isFinite(code) && code > 0 && code < 0x110000) { try { return String.fromCodePoint(code); } catch (_e) { return m; } }
    }
    return m;
  });
}

// Skip a raw-text element (script/style/textarea/title) tolerantly: the close tag may carry whitespace
// ("</script >"), any case, and may be absent entirely (then we drop to end of input, which is correct —
// an unterminated <script> means everything after it IS script, not prose).
function _skipRawText(s, i, tag) {
  const close = new RegExp('<\\/' + tag + '\\s*>', 'i');
  const rest = s.slice(i);
  const m = close.exec(rest);
  return m ? i + m.index + m[0].length : s.length;
}

/**
 * htmlToText(html) -> the visible text of the document.
 * Quote-aware, comment-aware, raw-text-element-aware. No script or style content can survive it.
 */
function htmlToText(html) {
  const s = String(html == null ? '' : html);
  let out = '';
  let i = 0;
  const n = s.length;

  while (i < n) {
    const c = s[i];
    if (c !== '<') { out += c; i++; continue; }

    // comment / CDATA / doctype
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      i = end === -1 ? n : end + 3;
      out += ' ';
      continue;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9);
      i = end === -1 ? n : end + 3;
      out += ' ';
      continue;
    }

    // raw-text elements: their CONTENT is not prose and must never enter the corpus
    const raw = /^<\s*(script|style|textarea|title|noscript|template|svg|iframe)\b/i.exec(s.slice(i, i + 20));
    if (raw) {
      // step past this opening tag first (quote-aware), then skip to the tolerant close
      let j = i + 1;
      let q = '';
      while (j < n) {
        const d = s[j];
        if (q) { if (d === q) q = ''; }
        else if (d === '"' || d === "'") q = d;
        else if (d === '>') { j++; break; }
        j++;
      }
      // a self-closed or immediately-closed raw element has no body to skip
      const tag = raw[1].toLowerCase();
      i = _skipRawText(s, j, tag);
      out += ' ';
      continue;
    }

    // an ordinary tag: consume to its real '>' , honouring quoted attribute values so that a '>' inside
    // an attribute (data-x="a>b") does not terminate the tag early.
    // If we meet ANOTHER unquoted '<' before the '>', the tag is malformed and the inner '<' is the real tag start
    // (this is what a browser does). That closes the nesting bypass: `<scr<script>ipt>alert(1)</script>` restarts at
    // the inner <script> and the script body is skipped as raw text rather than re-forming a live tag.
    let j = i + 1;
    let quote = '';
    let restart = -1;
    while (j < n) {
      const d = s[j];
      if (quote) { if (d === quote) quote = ''; }
      else if (d === '"' || d === "'") quote = d;
      else if (d === '<') { restart = j; break; }
      else if (d === '>') { j++; break; }
      j++;
    }
    if (restart !== -1) { out += ' '; i = restart; continue; }
    if (j >= n && s.indexOf('>', i) === -1) { out += ' '; i = n; break; }  // unterminated tag: drop it
    i = j;
    out += ' ';
  }

  return decodeEntities(out).replace(/\s+/g, ' ').trim();
}

/** Back-compat alias used by the older call sites. */
const stripHtml = htmlToText;

module.exports = { htmlToText, stripHtml, decodeEntities };
