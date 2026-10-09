// Simple stats over any kepler dataset (presets or uploads). No kepler imports so it
// can be checked standalone: `npm test`.

export type Field = {name: string; type: string};
export type Table = {fields: Field[]; numRows: number; valueAt: (row: number, col: number) => unknown};
export type Insight = {label: string; value: string; hint?: string};

const mode = (counts: Map<string, number>) => {
  let best: [string, number] = ['', 0];
  for (const e of counts) if (e[1] > best[1]) best = e;
  return best;
};
const tally = (t: Table, col: number, key: (v: unknown) => string | null) => {
  const m = new Map<string, number>();
  for (let r = 0; r < t.numRows; r++) {
    const k = key(t.valueAt(r, col));
    if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};
const find = (t: Table, re: RegExp, types?: string[]) =>
  t.fields.findIndex(f => re.test(f.name) && (!types || types.includes(f.type)));

export function toHour(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e11 ? v * 1000 : v).getHours(); // epoch s or ms
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.getHours();
}

const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}% of all data points`;
export const clock = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`;

export function computeInsights(t: Table): Insight[] {
  const out: Insight[] = [{label: 'Data points', value: t.numRows.toLocaleString('en-IN')}];
  if (!t.numRows) return out;

  // Busiest area: named area column, else a ~1 km lat/lng grid cell.
  const area = find(t, /area|neighbou?rhood|locality|ward|zone|district/i, ['string']);
  if (area >= 0) {
    const [name, n] = mode(tally(t, area, v => (v ? String(v) : null)));
    out.push({label: `Busiest ${t.fields[area].name.replace(/_/g, ' ')}`, value: name, hint: pct(n, t.numRows)});
  } else {
    const lat = find(t, /^(lat|latitude|.*_lat)$/i);
    const lng = find(t, /^(lng|lon|long|longitude|.*_lng|.*_lon)$/i);
    if (lat >= 0 && lng >= 0) {
      const m = new Map<string, number>();
      for (let r = 0; r < t.numRows; r++) {
        const a = Number(t.valueAt(r, lat));
        const b = Number(t.valueAt(r, lng));
        if (isFinite(a) && isFinite(b)) {
          const k = `${(Math.round(a * 100) / 100).toFixed(2)}, ${(Math.round(b * 100) / 100).toFixed(2)}`;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
      }
      const [cell, n] = mode(m);
      if (n) out.push({label: 'Busiest spot (about 1 km wide)', value: cell, hint: pct(n, t.numRows)});
    }
  }

  // Peak hour from the first timestamp column.
  const ts = t.fields.findIndex(f => f.type === 'timestamp');
  if (ts >= 0) {
    const [h, n] = mode(tally(t, ts, v => {
      const hr = toHour(v);
      return hr === null ? null : String(hr);
    }));
    if (n) {
      const hr = Number(h);
      out.push({label: 'Busiest hour', value: `${clock(hr)} – ${clock(hr + 1)}`, hint: pct(n, t.numRows)});
    }
  }

  // Top category-like column (category / mode / type / kind).
  const cat = find(t, /category|mode|type|kind|class/i, ['string']);
  if (cat >= 0) {
    const [name, n] = mode(tally(t, cat, v => (v ? String(v) : null)));
    out.push({label: `Top ${t.fields[cat].name.replace(/_/g, ' ')}`, value: name, hint: pct(n, t.numRows)});
  }
  return out;
}

// Rows per hour of day (0–23) from a timestamp column, for the playback day bar.
export function hourCounts(t: Table, col: number): number[] {
  const out = new Array(24).fill(0);
  for (let r = 0; r < t.numRows; r++) {
    const h = toHour(t.valueAt(r, col));
    if (h !== null) out[h]++;
  }
  return out;
}
