// "Ask City Pulse": answers plain-English questions about the three sample datasets.
// Offline keyword matching, no AI and no API key, so it is free, instant and safe in a static site.
// ponytail: keyword intents, not real language understanding. Upgrade path: send the question plus
// these same stats to an LLM through a Vercel serverless function.

export type Stop = {id: string; name: string; area: string; lat: number; lng: number; boardings: number};
export type Place = {name: string; category: string; area: string; lat: number; lng: number; rating: number};
export type Trip = {hour: number; from: string; to: string; mode: string; minutes: number; km: number};
export type CityData = {stops: Stop[]; places: Place[]; trips: Trip[]};
export type Focus = {lat: number; lng: number; zoom: number};
export type Answer = {
  text: string;
  preset?: 'poi' | 'bus_stops' | 'commute_trips';
  focus?: Focus;
  chips?: string[]; // follow-up suggestions to show as buttons
  understood?: boolean; // false = offline brain gave up, worth asking the AI
  ctx?: string; // normalised question, remembered for follow-ups like "what about Hebbal?"
};

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

/** Edit distance, for typo tolerance ("whitfield", "koramangla", "busyest"). */
export function lev(a: string, b: string): number {
  let prev = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const typoOk = (word: string, target: string) => lev(word, target) <= (target.length >= 8 ? 2 : target.length >= 5 ? 1 : 0);

/** All areas mentioned, in the order they appear (run normalize() first to fix typos). */
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

// Words the keyword rules rely on; a misspelt word is snapped to the closest one.
const VOCAB = (
  'busiest bus stop stops board boarding boards people metro cafe cafes coffee restaurant restaurants college colleges ' +
  'hospital hospitals park parks mall malls pubs trips trip commute commuters travel rush hour peak quietest least most ' +
  'many where which when average longest rated rating best area areas auto bike car cars passengers riders popular ' +
  'office offices places hangout destination morning evening bars bar shop shopping food garden time take ride rides'
).split(' ');

/** Lower-case, strip punctuation, and fix typos in key words. */
export function normalize(question: string): string {
  const q = question.toLowerCase().replace(/[?!.,'"]/g, ' ').replace(/\s+/g, ' ').trim();
  let fixed = q
    .split(' ')
    .map(w => {
      if (w.length < 4 || VOCAB.includes(w)) return w;
      const fix = VOCAB.find(v => typoOk(w, v));
      return fix ?? w;
    })
    .join(' ');
  // Snap misspelt area names to the real ones ("whitfield" -> "whitefield"), so follow-ups can swap them.
  for (const area of AREAS) {
    const name = area.toLowerCase();
    if (fixed.includes(name)) continue;
    const words = fixed.split(' ');
    const n = name.split(' ').length;
    for (let i = 0; i + n <= words.length; i++) {
      const window = words.slice(i, i + n).join(' ');
      if (window.length >= 5 && typoOk(window, name)) {
        fixed = [...words.slice(0, i), name, ...words.slice(i + n)].join(' ');
        break;
      }
    }
  }
  return fixed;
}

const TOPIC = /\bbs ?\d|\bstops?\b|board|riders?|passengers?|trips?|commut|travel|rush|peak|hour|caf|restaurant|park|mall|hospital|college|pub|places?|metro|\bbus|auto|bike|car|busiest|how many|which|where|when/;
const CHIPS = ['Which bus stop is busiest?', 'When is rush hour?', 'Which area has the most cafes?'];

/**
 * Main entry. `prev` is the last understood question (Answer.ctx), so short follow-ups
 * like "what about Indiranagar?" or "and cafes?" reuse its intent.
 */
export function answer(question: string, d: CityData, prev = ''): Answer {
  let q = normalize(question);
  if (!q) return help();

  // Small talk and things the data can't know.
  if (/^(hi+|hello|hey+|yo|hola|namaste|good (morning|evening|afternoon))\b/.test(q) && q.split(' ').length <= 4)
    return {text: "Hey! I know Bengaluru's bus stops, hangout spots and commutes. Ask me anything about them.", chips: CHIPS, understood: true};
  if (/^(thanks|thank you|thx|ty|cool|nice|awesome|great|ok|okay)\b/.test(q))
    return {text: 'Happy to help! Want to know anything else about the city?', chips: CHIPS, understood: true};
  if (/^(bye|see you|goodbye)\b/.test(q)) return {text: 'Bye! Come back and explore anytime.', understood: true};
  if (/who are you|what are you|what can you (do|answer)|^help\b|what do you know/.test(q))
    return {
      text: "I'm the City Pulse helper. I can count bus riders at any stop or area, find busy places, tell you when rush hour is, and compare ways of travel. I'll also fly the map to what I find.",
      chips: CHIPS,
      understood: true
    };
  if (/weather|rain|temperature|news|cricket|movie|live traffic|right now|today|tomorrow|real.?time/.test(q))
    return {
      text: "I only know the sample data in this app (one typical weekday), so I can't tell live or real-world info. Try asking about bus stops, places or commutes.",
      chips: CHIPS,
      understood: true
    };

  // Follow-ups: "what about Hebbal?", "and cafes?", "in Indiranagar?".
  const areas = findAreas(q);
  const category = CATEGORIES.find(([re]) => re.test(q))?.[1];
  const mode = MODES.find(([re]) => re.test(q))?.[1];
  const shortSlotOnly = q.split(' ').length <= 4 && (areas.length > 0 || category || mode);
  if (prev && (/^(what|how) about\b|^(and|also|same)\b|^in\b/.test(q) || shortSlotOnly)) {
    let merged = prev;
    if (areas.length) {
      const old = findAreas(prev);
      merged = old.length ? merged.replace(new RegExp(old[0], 'i'), areas[0].toLowerCase()) : `${merged} in ${areas[0].toLowerCase()}`;
    }
    if (category) {
      for (const [re] of CATEGORIES) merged = merged.replace(new RegExp(re.source, 'g'), ' ');
      merged = `${merged} ${category.toLowerCase()}s`;
    }
    if (mode) {
      for (const [re] of MODES) merged = merged.replace(new RegExp(re.source, 'g'), ' ');
      merged = `${merged} ${mode.toLowerCase()}`;
    }
    q = merged.replace(/\s+/g, ' ').trim();
  } else if (!TOPIC.test(q) && !areas.length && !category) {
    return help();
  }

  // Vague superlatives: "busiest?", "which is the most?"
  if (/^(which|what)?( is)?( the)? ?(busiest|most|biggest|top|best)( one)?$/.test(q))
    return {
      text: 'Busiest what? I can find the busiest bus stop, the busiest area for buses, the area with the most cafes, or the busiest hour.',
      chips: ['Which bus stop is busiest?', 'Which area is busiest for buses?', 'Which area has the most cafes?', 'When is rush hour?'],
      understood: true
    };

  const a = core(q, d);
  return a.understood === false ? a : {...a, understood: true, ctx: q};
}

function core(q: string, d: CityData): Answer {
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
    text: "I didn't catch that. I can answer questions about bus stops, places to hang out and commutes. Try one of these:",
    chips: SUGGESTIONS.slice(0, 4),
    understood: false
  };
}

/** Compact fact sheet the AI answers from (so it never invents numbers). */
export function facts(d: CityData): string {
  const byArea = (f: (a: string) => string) => AREAS.map(a => `${a}: ${f(a)}`).join('\n');
  const stopsIn = (a: string) => d.stops.filter(s => s.area === a);
  const top = [...d.stops].sort((a, b) => b.boardings - a.boardings).slice(0, 10);
  const hours = countBy(d.trips, t => String(t.hour)).sort((a, b) => +a[0] - +b[0]);
  const pairs = countBy(d.trips, t => `${t.from} -> ${t.to}`).slice(0, 12);
  return [
    `BUS STOPS (${d.stops.length} stops, ${fmt(sum(d.stops.map(s => s.boardings)))} daily boardings in total)`,
    'Per area (stops, daily boardings, busiest stop):',
    byArea(a => {
      const s = stopsIn(a);
      const best = [...s].sort((x, y) => y.boardings - x.boardings)[0];
      return `${s.length} stops, ${fmt(sum(s.map(x => x.boardings)))} boardings, busiest ${best?.name} (${best?.id}, ${fmt(best?.boardings ?? 0)})`;
    }),
    'Top 10 stops: ' + top.map(s => `${s.name} (${s.id}, ${s.area}) ${fmt(s.boardings)}`).join('; '),
    '',
    `PLACES (${d.places.length} total). Count per area by category:`,
    byArea(a => countBy(d.places.filter(p => p.area === a), p => p.category).map(([c, n]) => `${c} ${n}`).join(', ')),
    '',
    `COMMUTE TRIPS (${d.trips.length} trips on one weekday)`,
    'Trips starting per hour: ' + hours.map(([h, n]) => `${clock12(+h)} ${n}`).join(', '),
    'By mode: ' + countBy(d.trips, t => t.mode).map(([m, n]) => `${m} ${n}`).join(', '),
    `Average trip ${fmt(sum(d.trips.map(t => t.minutes)) / d.trips.length)} min, ${(sum(d.trips.map(t => t.km)) / d.trips.length).toFixed(1)} km`,
    'Trips starting / ending per area (more ending = work hub, more starting = home area): ' +
      AREAS.map(a => {
        const out = d.trips.filter(t => t.from === a).length;
        const inn = d.trips.filter(t => t.to === a).length;
        return `${a} ${out} start / ${inn} end = ${inn > out ? 'work hub' : 'home area'}`;
      }).join('; '),
    'Top 12 routes: ' + pairs.map(([p, n]) => `${p} ${n}`).join('; ')
  ].join('\n');
}

/** Where to fly the map for an area the AI mentions. */
export function areaFocus(area: string, d: CityData): Focus | undefined {
  const pts = [...d.stops.filter(s => s.area === area), ...d.places.filter(p => p.area === area)];
  return pts.length ? centre(pts, STOP_ZOOM) : undefined;
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
