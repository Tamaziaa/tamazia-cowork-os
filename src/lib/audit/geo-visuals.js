'use strict';
// P3.V1-V3 GEO visual generators — pure functions, data -> SVG string (Phase-4 render embeds these). Brand tokens.
const C = { maroon: '#3D0E0E', gold: '#C8A664', cream: '#F8F5EF', ink: '#2A2A2A', grey: '#C9C2B8', green: '#2E7D52', red: '#B23A3A' };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// V1 — AI-engine grid: which engines cite you (green) vs not (grey). engines: [{name, cited:bool}]
function aiEngineGrid(engines) {
  const list = (engines && engines.length) ? engines : ['ChatGPT', 'Gemini', 'Perplexity', 'Claude', 'Copilot', 'Grok', 'Meta AI', 'Google AI'].map(n => ({ name: n, cited: false }));
  const cols = 4, w = 560, cw = w / cols, ch = 70, rows = Math.ceil(list.length / cols), h = rows * ch + 40;
  let cells = '';
  list.forEach((e, i) => { const x = (i % cols) * cw + 8, y = Math.floor(i / cols) * ch + 36; const on = !!e.cited;
    cells += `<rect x="${x}" y="${y}" width="${cw - 16}" height="${ch - 14}" rx="8" fill="${on ? C.green : '#EFEAE1'}" stroke="${on ? C.green : C.grey}"/>`
      + `<text x="${x + (cw - 16) / 2}" y="${y + 26}" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="${on ? '#fff' : C.ink}">${esc(e.name)}</text>`
      + `<text x="${x + (cw - 16) / 2}" y="${y + 44}" text-anchor="middle" font-family="Arial" font-size="10" fill="${on ? '#dfeee6' : '#8a8377'}">${on ? 'cites you' : 'not citing you'}</text>`; });
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img"><text x="16" y="22" font-family="Georgia,serif" font-size="15" fill="${C.maroon}">Which AI engines cite you</text>${cells}</svg>`;
}

// V2 — AI-visibility radar. axes: [{label, value 0-100}]
function aiRadar(axes) {
  const A = (axes && axes.length >= 3) ? axes : [{ label: 'Entity', value: 0 }, { label: 'Crawler access', value: 0 }, { label: 'Share of voice', value: 0 }, { label: 'Schema', value: 0 }, { label: 'Knowledge graph', value: 0 }, { label: 'Citations', value: 0 }];
  const cx = 200, cy = 190, R = 130, n = A.length;
  const pt = (i, r) => [cx + r * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n), cy + r * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n)];
  let rings = ''; for (let g = 1; g <= 4; g++) { const pts = A.map((_, i) => pt(i, R * g / 4).map(v => v.toFixed(1)).join(',')).join(' '); rings += `<polygon points="${pts}" fill="none" stroke="${C.grey}" stroke-width="0.7" opacity="0.6"/>`; }
  const poly = A.map((a, i) => pt(i, R * Math.max(0, Math.min(100, a.value)) / 100).map(v => v.toFixed(1)).join(',')).join(' ');
  let labels = ''; A.forEach((a, i) => { const [x, y] = pt(i, R + 22); labels += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="11" fill="${C.ink}">${esc(a.label)}</text><text x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="10" fill="${C.gold}">${Math.round(a.value)}</text>`; });
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img"><text x="200" y="24" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="${C.maroon}">AI visibility</text>${rings}<polygon points="${poly}" fill="${C.maroon}" fill-opacity="0.25" stroke="${C.maroon}" stroke-width="2"/>${labels}</svg>`;
}

// V3 — entity / citation web map: you in centre, sources + competitors as nodes. {you, nodes:[{label,type:'source'|'competitor'}]}
function entityWebMap({ you = 'You', nodes = [] } = {}) {
  const cx = 280, cy = 180, R = 130; const list = nodes.slice(0, 8);
  let edges = '', dots = '';
  list.forEach((nd, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, list.length); const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); const col = nd.type === 'competitor' ? C.red : C.gold;
    edges += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${C.grey}" stroke-width="1" stroke-dasharray="3 3"/>`;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${col}"/><text x="${x.toFixed(1)}" y="${(y + (Math.sin(a) >= 0 ? 22 : -12)).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="10" fill="${C.ink}">${esc(nd.label)}</text>`; });
  return `<svg viewBox="0 0 560 360" xmlns="http://www.w3.org/2000/svg" role="img"><text x="280" y="22" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="${C.maroon}">Who the AI knowledge graph connects to you</text>${edges}<circle cx="${cx}" cy="${cy}" r="30" fill="${C.maroon}"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="Georgia,serif" font-size="12" fill="#fff">${esc(you)}</text>${dots}</svg>`;
}
module.exports = { aiEngineGrid, aiRadar, entityWebMap };
