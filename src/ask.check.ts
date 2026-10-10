// Runnable check: `npm test`. Asks real questions against the real sample CSVs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answer, findAreas, parseCity, SUGGESTIONS} from './ask.ts';

const read = (f: string) => readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8');
const d = parseCity(read('bus_stops.csv'), read('poi.csv'), read('commute_trips.csv'));
assert.equal(d.stops.length, 900);
assert.equal(d.places.length, 1800);
assert.ok(d.trips.length > 3000);

const top = [...d.stops].sort((a, b) => b.boardings - a.boardings)[0];
const busiest = answer('Which bus stop is the busiest?', d);
assert.ok(busiest.text.includes(top.name), busiest.text);
assert.equal(busiest.preset, 'bus_stops');
assert.equal(busiest.focus?.lat, top.lat);

const wf = d.stops.filter(s => s.area === 'Whitefield');
const wfTotal = wf.reduce((a, s) => a + s.boardings, 0);
assert.ok(answer('how many people board in whitefield', d).text.includes(wfTotal.toLocaleString('en-IN')));

const s42 = d.stops.find(s => s.id === 'BS0042')!;
assert.ok(answer('how many board at stop 42?', d).text.includes(s42.boardings.toLocaleString('en-IN')));
assert.ok(answer('BS0042', d).text.includes(s42.name));
assert.match(answer('stop 99999', d).text, /couldn't find/);

const caf = d.places.filter(p => p.category === 'Cafe' && p.area === 'Koramangala').length;
assert.ok(answer('How many cafes are in Koramangala?', d).text.includes(`${caf} cafes`));
assert.match(answer('When is rush hour?', d).text, /Rush hour is (8|9) AM/);
assert.match(answer('how many people take the metro', d).text, /go by metro/);
assert.match(answer('trips from Jayanagar to Koramangala', d).text, /from Jayanagar to Koramangala/);
assert.match(answer('which area is busiest for buses', d).text, /busiest area for buses/);
assert.match(answer('top 3 bus stops', d).text, /^Top 3/);
assert.match(answer('asdf qwerty', d).text, /didn't catch/);
assert.deepEqual(findAreas('from hsr to e city'), ['HSR Layout', 'Electronic City']);
for (const s of SUGGESTIONS) assert.doesNotMatch(answer(s, d).text, /didn't catch/, s);
console.log('ask ok');
