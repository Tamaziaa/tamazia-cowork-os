// OpenStreetMap Overpass · free, no key · workaround for Google Places + Yelp
// POI search by sector + city. Used as primary geo-sourcing for B2C verticals.

const { fetchWithRetry } = require('../../skills/S008-personalisation-engine/lib/http.js');

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const UA = 'Tamazia Lead Sourcing aman@tamazia.co.uk';

// Sector → OSM tag mapping
const SECTOR_TAGS = {
  'law-firms': '[office=lawyer]',
  'healthcare': '[amenity~"clinic|doctors|hospital"]',
  'dental': '[amenity=dentist]',
  'pharma': '[amenity=pharmacy]',
  'finance': '[office=financial]',
  'insurance': '[office=insurance]',
  'real-estate': '[office=estate_agent]',
  'hospitality': '[tourism~"hotel|guest_house|hostel"]',
  'food': '[amenity~"restaurant|cafe|bar|pub|fast_food"]',
  'restaurants': '[amenity~"restaurant|cafe|bar|pub"]',
  'fitness': '[leisure=fitness_centre]',
  'wellness': '[shop~"beauty|massage"]',
  'education': '[amenity~"school|college|university"]',
  'higher-education': '[amenity=university]',
  'charity': '[office~"charity|ngo|non_profit"]',
  'automotive': '[shop=car]',
  'retail': '[shop]'
};

// City → bbox (south,west,north,east). 50 major business cities pre-cached.
const CITY_BBOX = {
  // UK
  'London': '51.28,-0.51,51.69,0.33',
  'Manchester': '53.41,-2.30,53.55,-2.16',
  'Birmingham': '52.43,-2.04,52.54,-1.79',
  'Leeds': '53.78,-1.65,53.86,-1.43',
  'Edinburgh': '55.89,-3.31,56.00,-3.03',
  'Glasgow': '55.83,-4.34,55.92,-4.16',
  'Bristol': '51.41,-2.66,51.49,-2.50',
  'Cambridge': '52.18,0.07,52.23,0.18',
  'Oxford': '51.71,-1.30,51.79,-1.20',
  'Brighton': '50.81,-0.20,50.85,-0.10',
  // US
  'New York': '40.50,-74.26,40.92,-73.70',
  'San Francisco': '37.70,-122.51,37.83,-122.36',
  'Los Angeles': '33.70,-118.67,34.34,-118.16',
  'Chicago': '41.64,-87.94,42.02,-87.52',
  'Boston': '42.23,-71.19,42.40,-70.99',
  'Miami': '25.71,-80.32,25.86,-80.13',
  'Austin': '30.10,-97.94,30.52,-97.56',
  'Washington': '38.79,-77.12,38.99,-76.91',
  // EU
  'Paris': '48.80,2.22,48.91,2.47',
  'Berlin': '52.34,13.09,52.67,13.76',
  'Munich': '48.06,11.36,48.25,11.72',
  'Frankfurt': '50.02,8.47,50.23,8.80',
  'Amsterdam': '52.30,4.73,52.43,5.02',
  'Madrid': '40.31,-3.83,40.56,-3.52',
  'Barcelona': '41.32,2.05,41.47,2.23',
  'Milan': '45.39,9.07,45.54,9.30',
  'Rome': '41.79,12.35,42.00,12.62',
  'Dublin': '53.30,-6.40,53.41,-6.10',
  // Middle East
  'Dubai': '24.92,54.81,25.34,55.55',
  'Abu Dhabi': '24.30,54.30,24.55,54.70',
  'Doha': '25.20,51.46,25.39,51.61',
  'Riyadh': '24.55,46.55,24.85,46.85',
  // Asia
  'Singapore': '1.22,103.61,1.47,104.04',
  'Hong Kong': '22.18,114.10,22.50,114.30',
  'Tokyo': '35.50,139.55,35.83,139.91'
};

const SECTOR_LIMIT = 50;

async function search({ sector, city, country }) {
  const tag = SECTOR_TAGS[sector];
  if (!tag) return [];
  const bbox = CITY_BBOX[city];
  if (!bbox) return [];

  // Query for nodes + ways + relations matching the sector tag inside the city bbox
  const query = `
    [out:json][timeout:25];
    (
      node${tag}(${bbox});
      way${tag}(${bbox});
    );
    out tags center ${SECTOR_LIMIT};
  `;
  const r = await fetchWithRetry(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
    timeout: 30000,
    retries: 1
  });
  if (!r.ok) return [];
  try {
    const json = JSON.parse(r.body);
    return (json.elements || []).map(el => ({
      osm_id: el.id,
      osm_type: el.type,
      company: el.tags?.name || el.tags?.['name:en'] || null,
      website: el.tags?.website || el.tags?.['contact:website'] || null,
      phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
      email: el.tags?.email || el.tags?.['contact:email'] || null,
      address: [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:postcode']].filter(Boolean).join(' ') || null,
      lat: el.lat || el.center?.lat || null,
      lon: el.lon || el.center?.lon || null,
      sector,
      city,
      country
    })).filter(r => r.company); // require name
  } catch (_e) { return []; }
}

function listSectors() { return Object.keys(SECTOR_TAGS); }
function listCities() { return Object.keys(CITY_BBOX); }

module.exports = { search, listSectors, listCities, SECTOR_TAGS, CITY_BBOX };

if (require.main === module) {
  (async () => {
    const r = await search({ sector: 'law-firms', city: 'London', country: 'UK' });
    console.log('London law firms via OSM:', r.length);
    console.log('Sample:', JSON.stringify(r.slice(0, 3), null, 2));
  })();
}
