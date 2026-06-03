'use strict';
// D: plain-language glossary so the render can show a (?) hover for every jargon term. Client voice: what it is +
// why it matters to YOU, no jargon-to-explain-jargon. Keys are lower-case; the render matches a term and shows term().
const GLOSSARY = {
  'domain authority': 'A 0 to 100 score of how much trust your site has earned from links on other websites. Higher means Google and AI engines are more likely to rank and cite you. It is the single biggest reason one site outranks another.',
  'da': 'Domain Authority: a 0 to 100 trust score based on the quality of sites linking to you. The higher it is, the easier everything else ranks.',
  'pa': 'Page Authority: the same trust idea as Domain Authority but for one specific page rather than the whole site.',
  'geo': 'Generative Engine Optimisation: whether AI answer engines (ChatGPT, Gemini, Perplexity, Google AI Overviews) actually name and cite your business when a buyer asks them for a provider like you.',
  'ai visibility': 'Whether the AI answer engines buyers now ask first will name and cite you, or only your competitors.',
  'schema': 'Hidden code (structured data) that tells search engines and AI exactly who you are, what you offer and where. Without it they have to guess, and they guess wrong.',
  'structured data': 'Hidden code that spells out who you are and what you offer so Google and AI can read it precisely instead of guessing.',
  'llms.txt': 'A simple file that tells AI models what your site is about and what they may use. It is a new standard and most firms do not have one yet, so adding it is an easy edge.',
  'ai crawler': 'The automated readers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) that AI answer engines send to read your site. Block them and those engines cannot cite you.',
  'robots.txt': 'A file that tells web crawlers which parts of your site they may read. One wrong line here can make you invisible to Google or to AI engines.',
  'nap': 'Name, Address, Phone. Search engines cross-check these to trust that your business is real and local. Inconsistent or missing NAP sinks local rankings.',
  'local pack': 'The three businesses Google shows on a small map at the top of local searches. Most local clicks go to those three, so being outside it costs real enquiries.',
  'map pack': 'The three-business map result at the top of local searches. The top spots take the majority of local clicks.',
  'e-e-a-t': "Google's test of Experience, Expertise, Authoritativeness and Trust. It decides whether your content deserves to rank, and it matters most in law, health and finance.",
  'gdpr': 'The data-protection law for the UK and EU. Fines reach GBP 17.5M or 4% of global turnover, so gaps here are the most expensive on the page.',
  'uk gdpr': 'The UK version of the EU data-protection law, enforced by the ICO with fines up to GBP 17.5M or 4% of global turnover.',
  'pecr': 'UK rules on cookies and electronic marketing. You must get clear consent before non-essential cookies or trackers fire.',
  'ccpa': "California's privacy law, and the template for the roughly 20 US states that now have one. It gives consumers the right to opt out and to have data deleted.",
  'canonical': 'A line of code that tells Google which version of a page is the real one, so duplicate web addresses do not split your ranking power.',
  'meta description': 'The summary Google shows under your result. A good one lifts click-through; if it is missing, Google writes its own from random page text.',
  'hsts': 'A security header that stops your site being downgraded from secure HTTPS. Corporate buyers check for it, so its absence is an easy red flag.',
  'csp': 'Content-Security-Policy: a security header that blocks malicious scripts. Security reviews check for it.',
  'lcp': 'Largest Contentful Paint: how long your main content takes to appear. Over 2.5 seconds and Google ranks you lower and visitors leave.',
  'cls': 'Cumulative Layout Shift: how much your page jumps around while loading. Jumpy pages frustrate users and rank worse.',
  'sameas': 'Schema links that connect your site to your verified profiles (LinkedIn, Companies House, Wikidata) so AI knows the business is really you.',
  'wikidata': "Google's and AI's open knowledge base. An entry there makes you a recognised entity that answer engines can confidently cite.",
  'share of voice': 'How often you appear versus your competitors when buyers search or ask AI in your category. Low share of voice means they are heard and you are not.',
  'organic': 'The unpaid search results, as opposed to ads. Ranking here is the durable, compounding kind of visibility.',
};
const ALIASES = { 'domain rating': 'domain authority', 'dr': 'domain authority', 'structured-data': 'structured data', 'page authority': 'pa' };
function term(t) { if (!t) return null; const k = String(t).toLowerCase().trim(); return GLOSSARY[k] || GLOSSARY[ALIASES[k]] || null; }
// Which glossary terms actually appear in the audit text (so the render shows only the relevant (?) hovers).
function termsUsed(text) {
  const hay = String(text || '').toLowerCase();
  return Object.keys(GLOSSARY).filter(k => hay.includes(k));
}
module.exports = { GLOSSARY, ALIASES, term, termsUsed };
