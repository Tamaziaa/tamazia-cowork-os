const assert = require('assert');
const { preFilter, scoreICP, classifySector, isExcluded } = require('../icp.js');
const { hotScore } = require('../hot-score.js');

// excludes platforms/aggregators
assert(isExcluded('facebook.com') && isExcluded('rightmove.co.uk') && !isExcluded('streathers.co.uk'));
// sector classification
assert.strictEqual(classifySector('Streathers Solicitors London'), 'law-firms');
assert.strictEqual(classifySector('Smile Cliniq dental implants'), 'healthcare');
// pre-filter: real UK law firm running ads → pass
let p = preFilter({ domain: 'streathers.co.uk', country: 'UK', title: 'Streathers Solicitors', adRunner: true });
assert(p.pass && p.sector === 'law-firms', 'UK solicitor should pass pre-filter');
// pre-filter: social platform → fail
assert(!preFilter({ domain: 'facebook.com', country: 'USA' }).pass);
// pre-filter: out-of-geo random sector → fail on geo or sector
assert(!preFilter({ domain: 'example.cn', country: 'China', title: 'random shop' }).pass);
// FIT requires gap + ad-runner + sector
let f = scoreICP({ sector: 'law-firms', country: 'UK', adRunner: true, adPlatforms: ['google','x'], seoGapCount: 4, aiVisibilityGap: true, complianceApplicable: true, decisionMakerFound: true });
assert(f.fit === true && f.band === 'hot' && f.score >= 70, 'strong lead should be FIT+hot: ' + JSON.stringify(f));
let nf = scoreICP({ sector: 'law-firms', country: 'UK', adRunner: false, seoGapCount: 0, aiVisibilityGap: false });
assert(nf.fit === false, 'no ad-runner + no gap must not be FIT');
// hot score
let hs = hotScore({ adRunner: true, adPlatforms: ['google','reddit','youtube'], adRecencyDays: 3, seoGapSeverity: 2, aiVisibilityGap: true, decisionMakerFound: true });
assert(hs.hot >= 70 && hs.band === 'hot', 'multi-platform recent advertiser should be hot: ' + JSON.stringify(hs));
console.log('icp.test.js · ALL PASS');
