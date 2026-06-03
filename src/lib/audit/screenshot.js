'use strict';
// P3.8 real-answer / surface screenshot — free, no key (thum.io). Returns image URLs the render embeds as evidence:
// the firm's own page and the live Google result surface for the buyer query (where the firm is absent).
function screenshotUrls({ domain, query } = {}) {
  const site = 'https://' + String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*/, '');
  const base = 'https://image.thum.io/get/width/1200/crop/1000/';
  return {
    homepage: site && site !== 'https://' ? base + site : null,
    answer_surface: query ? base + 'https://www.google.com/search?q=' + encodeURIComponent(query) : null,
    provider: 'thum.io (free, no key)',
  };
}
module.exports = { screenshotUrls };
