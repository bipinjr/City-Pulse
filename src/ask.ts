// "Ask City Pulse": answers plain-English questions about the three sample datasets.
// Offline keyword matching, no AI and no API key, so it is free, instant and safe in a static site.
// ponytail: keyword intents, not real language understanding. Upgrade path: send the question plus
// these same stats to an LLM through a Vercel serverless function.

export type Stop = {id: string; name: string; area: string; lat: number; lng: number; boardings: number};
export type Place = {name: string; category: string; area: string; lat: number; lng: number; rating: number};
export type Trip = {hour: number; from: string; to: string; mode: string; minutes: number; km: number};
export type CityData = {stops: Stop[]; places: Place[]; trips: Trip[]};
export type Focus = {lat: number; lng: number; zoom: number};
export type Answer = {text: string; preset?: 'poi' | 'bus_stops' | 'commute_trips'; focus?: Focus};

export const SUGGESTIONS = [
  'Which bus stop is busiest?',
  'How many people board in Whitefield?',
  'When is rush hour?',
  'How many cafes are in Koramangala?',
  'How many people take the metro?',
  'Where do most trips go?'
];

const AREAS = [
  'MG Road', 'Koramangala', 'Indiranagar', 'Whitefield', 'Electronic City', 'Jayanagar', 'Malleshwaram', 'HSR Layout',
  'Hebbal', 'Marathahalli', 'Yelahanka', 'BTM Layout', 'Majestic', 'Banashankari', 'Bellandur'
];
const AREA_ALIASES: Record<string, string> = {'e city': 'Electronic City', ecity: 'Electronic City', hsr: 'HSR Layout', btm: 'BTM Layout', 'mg rd': 'MG Road'};
const CATEGORIES: [RegExp, string][] = [
  [/\bcaf(e|é)s?\b|coffee/, 'Cafe'],
  [/\brestaurants?\b|\bfood\b|\beat\b/, 'Restaurant'],
  [/\bparks?\b|garden/, 'Park'],
  [/tech ?parks?|\boffices?\b|\bit\b/, 'Tech Park'],
  [/\bmalls?\b|shopping/, 'Mall'],
  [/hospitals?|clinics?/, 'Hospital'],
  [/colleges?|universit/, 'College'],
  [/\bpubs?\b|\bbars?\b|brew/, 'Pub']
];
const MODES: [RegExp, string][] = [
  [/metro|train/, 'Metro'],
  [/\bbus(es)?\b|bmtc/, 'Bus'],
  [/\bautos?\b|rickshaw/, 'Auto'],
  [/\bbikes?\b|scooter|two.?wheeler/, 'Bike'],
  [/\bcars?\b|driv/, 'Car']
];

// Bus stops are 3D towers: zooming closer than this puts the camera inside one.
const STOP_ZOOM = 12.6;
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
export const clock12 = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};
const centre = (pts: {lat: number; lng: number}[], zoom: number): Focus => ({
  lat: sum(pts.map(p => p.lat)) / pts.length,
  lng: sum(pts.map(p => p.lng)) / pts.length,
  zoom
});

/** All areas mentioned, in the order they appear in the question. */
export function findAreas(q: string): string[] {
  const hits: [number, string][] = [];
  for (const a of AREAS) {
    const i = q.indexOf(a.toLowerCase());
    if (i >= 0) hits.push([i, a]);
  }
  for (const [alias, a] of Object.entries(AREA_ALIASES)) {
    const i = q.search(new RegExp(`\\b${alias}\\b`));
    if (i >= 0 && !hits.some(h => h[1] === a)) hits.push([i, a]);
  }
  return hits.sort((x, y) => x[0] - y[0]).map(h => h[1]);
}

export function answer(question: string, d: CityData): Answer {
  const q = question.toLowerCase().replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return help();
  const areas = findAreas(q);
  const area = areas[0];
  const category = CATEGORIES.find(([re]) => re.test(q))?.[1];
  const most = /busiest|most|highest|top|biggest|crowded|popular|maximum|max\b/.test(q);
  const least = /least|quietest|lowest|fewest|minimum|emptiest/.test(q);
  const stopWords =
    /\bstops?\b|board|boarding|riders?|passengers?/.test(q) ||
    // "Which area is busiest for buses?" ranks areas by boardings.
    ((most || least) && /\barea|neighbou?rhood|where/.test(q) && /\bbus(es)?\b/.test(q));
  // "bus" inside "bus stop" is about stops, not a way of travel.
  const mode = stopWords ? undefined : MODES.find(([re]) => re.test(q))?.[1];
  const tripWords = /trips?|commut|travel|go(es)? to|going|journey|rush|peak|hour|time/.test(q);

  // A specific stop by id or name, e.g. "BS0042" or "Whitefield Stop 12".
  const stopRef = q.match(/\bbs ?0*(\d{1,6})\b/) ?? q.match(/\bstop (?:no\.? ?|number )?(\d{1,6})\b/);
  if (stopRef) {
    const n = Number(stopRef[1]);
    const s = d.stops.find(x => Number(x.id.replace(/\D/g, '')) === n);
    if (!s) return {text: `I couldn't find stop ${n}. Stops go from 1 to ${d.stops.length}.`};
    return {
      text: `${s.name} (${s.id}) has about ${fmt(s.boardings)} people boarding every day.`,
      preset: 'bus_stops',
      focus: {lat: s.lat, lng: s.lng, zoom: STOP_ZOOM}
    };
  }

  // Bus stops.
  if (stopWords) {
    const pool = area ? d.stops.filter(s => s.area === area) : d.stops;
    if (!pool.length) return {text: `I don't have any bus stops in ${area}.`};
    const topN = q.match(/\btop (\d+)/);
    if (topN) {
      const list = [...pool].sort((a, b) => b.boardings - a.boardings).slice(0, Math.min(10, Number(topN[1])));
      return {
        text: `Top ${list.length} busiest stops${area ? ` in ${area}` : ''}:\n${list.map((s, i) => `${i + 1}. ${s.name}: ${fmt(s.boardings)} a day`).join('\n')}`,
        preset: 'bus_stops',
        focus: centre(list, 12)
      };
    }
    if (most || least) {
      // "Which area is busiest for buses?" ranks areas, not single stops.
      if (/\barea|neighbou?rhood|part of|locality/.test(q) && !area) {
        const byArea = new Map<string, number>();
        for (const s of d.stops) byArea.set(s.area, (byArea.get(s.area) ?? 0) + s.boardings);
        const ranked = [...byArea].sort((a, b) => (least ? a[1] - b[1] : b[1] - a[1]));
        const [name, total] = ranked[0];
        return {
          text: `${name} is the ${least ? 'quietest' : 'busiest'} area for buses: about ${fmt(total)} people board there every day.`,
          preset: 'bus_stops',
          focus: centre(d.stops.filter(s => s.area === name), STOP_ZOOM - 0.5)
        };
      }
      const s = [...pool].sort((a, b) => (least ? a.boardings - b.boardings : b.boardings - a.boardings))[0];
      return {
        text: `The ${least ? 'quietest' : 'busiest'} bus stop${area ? ` in ${area}` : ''} is ${s.name} (${s.id}), with about ${fmt(s.boardings)} people boarding every day.`,
        preset: 'bus_stops',
        focus: {lat: s.lat, lng: s.lng, zoom: STOP_ZOOM}
      };
    }
    const total = sum(pool.map(s => s.boardings));
    return {
      text: area
        ? `About ${fmt(total)} people board a bus in ${area} every day, across ${pool.length} stops. That's ${fmt(total / pool.length)} per stop on average.`
        : `About ${fmt(total)} people board a bus every day across all ${pool.length} stops. The average stop gets ${fmt(total / pool.length)}.`,
      preset: 'bus_stops',
      focus: area ? centre(pool, STOP_ZOOM - 0.5) : undefined
    };
  }

  // Places (hangouts).
  if (category || /places?|hang ?out|rating|rated/.test(q)) {
    let pool = category ? d.places.filter(p => p.category === category) : d.places;
    const label = category ? `${category.toLowerCase()}s` : 'places';
    if (/best|top rated|highest rated|rating|rated/.test(q)) {
      if (area) pool = pool.filter(p => p.area === area);
      if (!pool.length) return {text: `I couldn't find any ${label}${area ? ` in ${area}` : ''}.`};
      const p = [...pool].sort((a, b) => b.rating - a.rating)[0];
      return {text: `The best rated is ${p.name} in ${p.area}, with ${p.rating.toFixed(1)} stars.`, preset: 'poi', focus: {lat: p.lat, lng: p.lng, zoom: 15}};
    }
    if (area) {
      const here = pool.filter(p => p.area === area);
      return {
        text: `There are ${fmt(here.length)} ${label} in ${area}${here.length ? '' : '. Try another area'}.`,
        preset: 'poi',
        focus: here.length ? centre(here, 13.5) : undefined
      };
    }
    if (most || /where/.test(q)) {
      const [name, n] = countBy(pool, p => p.area)[0];
      return {text: `${name} has the most ${label}: ${fmt(n)} of them.`, preset: 'poi', focus: centre(pool.filter(p => p.area === name), 13.5)};
    }
    const kinds = countBy(d.places, p => p.category);
    return {
      text: category
        ? `There are ${fmt(pool.length)} ${label} across the city.`
        : `There are ${fmt(d.places.length)} places on the map. The most common kind is ${kinds[0][0].toLowerCase()} (${fmt(kinds[0][1])}).`,
      preset: 'poi'
    };
  }

  // Trips and commuting.
  if (mode || tripWords || areas.length) {
    if (/rush|peak|busiest (hour|time)|what time|when/.test(q)) {
      const byHour = countBy(d.trips, t => String(t.hour));
      const [h, n] = byHour[0];
      const am = countBy(d.trips.filter(t => t.hour < 12), t => String(t.hour))[0];
      const pm = countBy(d.trips.filter(t => t.hour >= 12), t => String(t.hour))[0];
      return {
        text: `Rush hour is ${clock12(Number(h))} to ${clock12(Number(h) + 1)}, with ${fmt(n)} trips starting. There are two peaks: mornings around ${clock12(Number(am[0]))} and evenings around ${clock12(Number(pm[0]))}.`,
        preset: 'commute_trips'
      };
    }
    if (mode) {
      const n = d.trips.filter(t => t.mode === mode).length;
      const ways = countBy(d.trips, t => t.mode);
      const rank = ways.findIndex(w => w[0] === mode) + 1;
      return {
        text: `${fmt(n)} of the ${fmt(d.trips.length)} trips go by ${mode.toLowerCase()} (${Math.round((n / d.trips.length) * 100)}%). That makes it number ${rank} of ${ways.length} ways of travel.`,
        preset: 'commute_trips'
      };
    }
    if (/how (do|does)|way|mode|popular/.test(q) && !areas.length) {
      const [m, n] = countBy(d.trips, t => t.mode)[0];
      return {text: `The most popular way to travel is ${m.toLowerCase()}: ${fmt(n)} trips (${Math.round((n / d.trips.length) * 100)}%).`, preset: 'commute_trips'};
    }
    if (/long|far|average|time taken|duration|minutes/.test(q)) {
      const avg = sum(d.trips.map(t => t.minutes)) / d.trips.length;
      const longest = [...d.trips].sort((a, b) => b.minutes - a.minutes)[0];
      return {
        text: `An average commute takes ${fmt(avg)} minutes. The longest one goes from ${longest.from} to ${longest.to} by ${longest.mode.toLowerCase()} and takes ${fmt(longest.minutes)} minutes.`,
        preset: 'commute_trips'
      };
    }
    if (areas.length >= 2) {
      const [a, b] = areas;
      const n = d.trips.filter(t => t.from === a && t.to === b).length;
      const back = d.trips.filter(t => t.from === b && t.to === a).length;
      return {text: `${fmt(n)} trips go from ${a} to ${b}, and ${fmt(back)} come back the other way.`, preset: 'commute_trips'};
    }
    if (area) {
      const out = d.trips.filter(t => t.from === area).length;
      const inn = d.trips.filter(t => t.to === area).length;
      return {
        text: `${fmt(out)} trips start in ${area} and ${fmt(inn)} end there. ${inn > out ? 'More people come in than leave, so it is a work hub.' : 'More people leave than come in, so it is mostly where people live.'}`,
        preset: 'commute_trips'
      };
    }
    if (/where|destination|go to/.test(q) || most) {
      const [name, n] = countBy(d.trips, t => t.to)[0];
      return {text: `Most trips end in ${name}: ${fmt(n)} of them. Lots of offices are there.`, preset: 'commute_trips'};
    }
    return {text: `There are ${fmt(d.trips.length)} trips in one weekday of sample data.`, preset: 'commute_trips'};
  }

  return help();
}

function help(): Answer {
  return {
    text: `I didn't catch that. I can answer questions about bus stops, places to hang out and commutes. Try one of these: ${SUGGESTIONS.slice(0, 3).map(s => `"${s}"`).join(', ')}.`
  };
}

// --- CSV loading (our generated files never contain quoted commas, so a plain split is enough).
function rows(text: string) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}
export function parseCity(stopsCsv: string, placesCsv: string, tripsCsv: string): CityData {
  return {
    stops: rows(stopsCsv).map(r => ({id: r.stop_id, name: r.stop_name, area: r.area, lat: +r.lat, lng: +r.lng, boardings: +r.daily_boardings})),
    places: rows(placesCsv).map(r => ({name: r.name, category: r.category, area: r.area, lat: +r.lat, lng: +r.lng, rating: +r.rating})),
    trips: rows(tripsCsv).map(r => ({
      hour: Number(r.start_time.slice(11, 13)),
      from: r.from_area,
      to: r.to_area,
      mode: r.mode,
      minutes: +r.duration_min,
      km: +r.distance_km
    }))
  };
}
