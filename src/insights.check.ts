// Runnable check: `npm test` (Node 22.18+ strips TS types natively).
import assert from 'node:assert/strict';
import {clock, computeInsights, hourCounts, toHour, type Table} from './insights.ts';

const rows = [
  ['Koramangala', 12.93, 77.62, '2026-09-15 09:10:00', 'Bus'],
  ['Koramangala', 12.94, 77.62, '2026-09-15 09:40:00', 'Metro'],
  ['Whitefield', 12.97, 77.75, '2026-09-15 18:05:00', 'Bus']
];
const t: Table = {
  fields: [
    {name: 'from_area', type: 'string'},
    {name: 'lat', type: 'real'},
    {name: 'lng', type: 'real'},
    {name: 'start_time', type: 'timestamp'},
    {name: 'mode', type: 'string'}
  ],
  numRows: rows.length,
  valueAt: (r, c) => rows[r][c]
};

const byLabel = Object.fromEntries(computeInsights(t).map(i => [i.label, i.value]));
assert.equal(byLabel['Data points'], '3');
assert.equal(byLabel['Busiest from area'], 'Koramangala');
assert.equal(byLabel['Busiest hour'], '9 AM – 10 AM');
assert.equal(byLabel['Top mode'], 'Bus');

// No area column → grid cell fallback; no timestamp → no peak hour.
const g = computeInsights({...t, fields: t.fields.map((f, i) => (i === 0 ? {name: 'x', type: 'string'} : i === 3 ? {name: 'ts', type: 'string'} : f))});
assert.equal(g.find(i => i.label === 'Busiest spot (about 1 km wide)')?.value, '12.93, 77.62');
assert.ok(!g.some(i => i.label === 'Busiest hour'));

assert.equal(toHour(''), null);
assert.equal(clock(0), '12 AM');
assert.equal(clock(12), '12 PM');
assert.equal(clock(23), '11 PM');
assert.equal(clock(24), '12 AM');
assert.equal(toHour('garbage'), null);
assert.equal(computeInsights({...t, numRows: 0}).length, 1);
const hc = hourCounts(t, 3);
assert.equal(hc.length, 24);
assert.equal(hc[9], 2);
assert.equal(hc[18], 1);
console.log('insights ok');
