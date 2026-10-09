// Generates SYNTHETIC Bengaluru sample data into public/data. Not real data.
// Deterministic (seeded) so the committed CSVs are reproducible: `npm run gen-data`.
import {writeFileSync, mkdirSync} from 'node:fs';

let seed = 20261009;
const rand = () => {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const pick = arr => arr[Math.floor(rand() * arr.length)];
const weighted = (items, key) => {
  const total = items.reduce((s, i) => s + i[key], 0);
  let r = rand() * total;
  for (const i of items) if ((r -= i[key]) <= 0) return i;
  return items[items.length - 1];
};

// Approximate neighbourhood centres; weight = rough activity, jobs = office hub pull.
const AREAS = [
  {name: 'MG Road', lat: 12.9756, lng: 77.6066, w: 10, jobs: 8},
  {name: 'Koramangala', lat: 12.9352, lng: 77.6245, w: 10, jobs: 7},
  {name: 'Indiranagar', lat: 12.9784, lng: 77.6408, w: 9, jobs: 5},
  {name: 'Whitefield', lat: 12.9698, lng: 77.75, w: 8, jobs: 10},
  {name: 'Electronic City', lat: 12.8452, lng: 77.6602, w: 6, jobs: 10},
  {name: 'Jayanagar', lat: 12.925, lng: 77.5938, w: 8, jobs: 2},
  {name: 'Malleshwaram', lat: 13.0035, lng: 77.5709, w: 6, jobs: 2},
  {name: 'HSR Layout', lat: 12.9116, lng: 77.6474, w: 8, jobs: 4},
  {name: 'Hebbal', lat: 13.0358, lng: 77.597, w: 5, jobs: 5},
  {name: 'Marathahalli', lat: 12.9591, lng: 77.6974, w: 7, jobs: 6},
  {name: 'Yelahanka', lat: 13.1007, lng: 77.5963, w: 4, jobs: 1},
  {name: 'BTM Layout', lat: 12.9166, lng: 77.6101, w: 7, jobs: 2},
  {name: 'Majestic', lat: 12.9767, lng: 77.5713, w: 9, jobs: 4},
  {name: 'Banashankari', lat: 12.9255, lng: 77.5468, w: 6, jobs: 1},
  {name: 'Bellandur', lat: 12.9304, lng: 77.6784, w: 6, jobs: 8}
];
const near = (a, km) => [a.lat + (gauss() * km) / 111, a.lng + (gauss() * km) / 108];
const r5 = n => n.toFixed(5);
const csv = (header, rows) =>
  [header.join(','), ...rows.map(r => r.map(v => (/[",]/.test(String(v)) ? `"${v}"` : v)).join(','))].join('\n') + '\n';

mkdirSync('public/data', {recursive: true});

// 1. Points of interest
const CATS = [
  ['Cafe', 'Brew', 'Filter Coffee', 'Darshini'],
  ['Restaurant', 'Biryani House', 'Dosa Corner', 'Meals'],
  ['Park', 'Park', 'Garden', 'Lake View'],
  ['Tech Park', 'Tech Park', 'IT Campus', 'Business Bay'],
  ['Mall', 'Mall', 'Arcade', 'Plaza'],
  ['Hospital', 'Hospital', 'Clinic', 'Health Centre'],
  ['College', 'College', 'Institute', 'Academy'],
  ['Pub', 'Brewpub', 'Taproom', 'Bar']
];
const poi = [];
for (let i = 0; i < 1800; i++) {
  const a = weighted(AREAS, 'w');
  const c = weighted(CATS.map(c => ({c, w: c[0] === 'Tech Park' ? a.jobs / 3 : 2})), 'w').c;
  const [lat, lng] = near(a, 1.4);
  poi.push([`P${i + 1}`, `${a.name} ${pick(c.slice(1))} ${1 + Math.floor(rand() * 40)}`, c[0], a.name, r5(lat), r5(lng), (3 + rand() * 2).toFixed(1)]);
}
writeFileSync('public/data/poi.csv', csv(['poi_id', 'name', 'category', 'area', 'lat', 'lng', 'rating'], poi));

// 2. Bus stops
const stops = [];
for (let i = 0; i < 900; i++) {
  const a = weighted(AREAS, 'w');
  const [lat, lng] = near(a, 2);
  const boardings = Math.round(a.w * 180 * (0.4 + rand()) + rand() * 300);
  stops.push([`BS${String(i + 1).padStart(4, '0')}`, `${a.name} Stop ${i + 1}`, a.name, r5(lat), r5(lng), boardings]);
}
writeFileSync('public/data/bus_stops.csv', csv(['stop_id', 'stop_name', 'area', 'lat', 'lng', 'daily_boardings'], stops));

// 3. Commute trips over one weekday, with morning & evening peaks
const MODES = [
  {m: 'Metro', w: 3, kmh: 32},
  {m: 'Bus', w: 4, kmh: 16},
  {m: 'Auto', w: 2, kmh: 18},
  {m: 'Bike', w: 3, kmh: 22},
  {m: 'Car', w: 2, kmh: 14}
];
const hourWeight = h => 0.4 + 5 * Math.exp(-((h - 9) ** 2) / 1.5) + 4.5 * Math.exp(-((h - 18.5) ** 2) / 2) + 1.2 * Math.exp(-((h - 13) ** 2) / 3);
const hours = Array.from({length: 18}, (_, k) => ({h: k + 5, w: hourWeight(k + 5)})); // 05:00–22:59
const trips = [];
for (let i = 0; i < 4000; i++) {
  const {h} = weighted(hours, 'w');
  const morning = h < 13;
  const home = weighted(AREAS.map(a => ({...a, hw: a.w * (11 - a.jobs)})), 'hw');
  const work = weighted(AREAS.map(a => ({...a, ww: a.jobs ** 2})), 'ww');
  const [from, to] = morning ? [home, work] : [work, home];
  if (from.name === to.name) continue;
  const [lat0, lng0] = near(from, 1.2);
  const [lat1, lng1] = near(to, 1.2);
  const km = Math.hypot((lat1 - lat0) * 111, (lng1 - lng0) * 108) * 1.35;
  const mode = weighted(MODES, 'w');
  const mins = Math.max(8, Math.round((km / mode.kmh) * 60 * (morning || h > 16 ? 1.5 : 1)));
  const mm = Math.floor(rand() * 60);
  const ss = Math.floor(rand() * 60);
  const ts = `2026-09-15 ${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  trips.push([`T${i + 1}`, ts, from.name, to.name, r5(lat0), r5(lng0), r5(lat1), r5(lng1), mode.m, km.toFixed(1), mins]);
}
trips.sort((a, b) => a[1].localeCompare(b[1]));
writeFileSync(
  'public/data/commute_trips.csv',
  csv(['trip_id', 'start_time', 'from_area', 'to_area', 'start_lat', 'start_lng', 'end_lat', 'end_lng', 'mode', 'distance_km', 'duration_min'], trips)
);

console.log(`poi=${poi.length} stops=${stops.length} trips=${trips.length}`);
