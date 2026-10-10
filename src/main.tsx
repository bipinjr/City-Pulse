import {lazy, StrictMode, Suspense, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PRESETS} from './presets';
import {MoonIcon, SunIcon} from './icons';
import {Logo} from './Logo';
import './index.css';

// kepler.gl is heavy (~2 MB gzipped, several seconds to start). Load it lazily, and warm it up
// in the background while people read the home page so the map opens fast.
const loadMap = () => import('./MapApp');
const MapApp = lazy(loadMap);

const saved = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: theme just won't persist */
    }
  }
};

// Routes: "" = home, "#map" or "#map/<preset id>" = explorer.
const route = () => (location.hash.startsWith('#map') ? location.hash.split('/')[1] ?? '' : null);

function App() {
  const [dark, setDark] = useState(() => (saved.get('theme') ?? 'dark') === 'dark');
  const [mapAt, setMapAt] = useState<string | null>(route);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    saved.set('theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const sync = () => setMapAt(route());
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);

  const toggle = () => setDark(d => !d);
  if (mapAt !== null)
    return (
      <Suspense fallback={<Loading />}>
        <MapApp initial={mapAt} dark={dark} onToggleTheme={toggle} onHome={() => (location.hash = '')} />
      </Suspense>
    );
  return <Hero dark={dark} onToggleTheme={toggle} />;
}

function Loading() {
  return (
    <div className="grid h-screen place-items-center bg-paper text-muted">
      <div className="ui text-center">
        <p className="animate-pulse font-display text-2xl font-bold text-ink">Getting the map ready</p>
        <p className="mt-2 text-sm">The map engine is big, so the first visit takes a few seconds.</p>
      </div>
    </div>
  );
}

// --- Hero: a live mini-map of real Bengaluru neighbourhoods with commutes flowing between them.
const AREAS: Record<string, [number, number]> = {
  Yelahanka: [13.1007, 77.5963],
  Hebbal: [13.0358, 77.597],
  Malleshwaram: [13.0035, 77.5709],
  Majestic: [12.9767, 77.5713],
  'MG Road': [12.9756, 77.6066],
  Indiranagar: [12.9784, 77.6408],
  Whitefield: [12.9698, 77.75],
  Marathahalli: [12.9591, 77.6974],
  Koramangala: [12.9352, 77.6245],
  Bellandur: [12.9304, 77.6784],
  Jayanagar: [12.925, 77.5938],
  Banashankari: [12.9255, 77.5468],
  'HSR Layout': [12.9116, 77.6474],
  'Electronic City': [12.8452, 77.6602]
};
const xy = ([lat, lng]: [number, number]) => [((lng - 77.52) / 0.25) * 520 + 40, ((13.12 - lat) / 0.29) * 520 + 40] as const;
const TRIPS: [string, string, string][] = [
  ['Yelahanka', 'MG Road', '#9B5DE5'],
  ['Banashankari', 'Electronic City', '#E63946'],
  ['Malleshwaram', 'Whitefield', '#9B5DE5'],
  ['Jayanagar', 'Koramangala', '#F5C518'],
  ['Hebbal', 'Bellandur', '#E63946'],
  ['HSR Layout', 'Electronic City', '#2BB673'],
  ['Majestic', 'Indiranagar', '#9B5DE5'],
  ['Banashankari', 'Marathahalli', '#E63946'],
  ['Indiranagar', 'Whitefield', '#2BB673'],
  ['Jayanagar', 'MG Road', '#F5C518']
];
const arc = (a: string, b: string) => {
  const [x1, y1] = xy(AREAS[a]);
  const [x2, y2] = xy(AREAS[b]);
  const k = 0.25; // bend
  return `M${x1},${y1} Q${(x1 + x2) / 2 - (y2 - y1) * k},${(y1 + y2) / 2 + (x2 - x1) * k} ${x2},${y2}`;
};

function CityMap() {
  return (
    <svg viewBox="0 0 600 600" className="h-auto w-full" role="img" aria-label="Commute lines flowing between Bengaluru neighbourhoods">
      <circle cx="300" cy="300" r="280" fill="var(--sunk)" opacity="0.6" />
      <circle cx="300" cy="300" r="190" fill="none" stroke="var(--line)" strokeDasharray="2 8" />
      {TRIPS.map(([a, b, c], i) => {
        const d = arc(a, b);
        return (
          <g key={i}>
            <path d={d} pathLength={1} className="route" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" opacity="0.75" style={{animationDelay: `${i * 0.12}s`}} />
            <circle r="5" fill={c} className="rider" style={{offsetPath: `path("${d}")`, animationDelay: `${1.6 + i * 0.45}s`}} />
          </g>
        );
      })}
      {Object.entries(AREAS).map(([name, ll]) => {
        const [x, y] = xy(ll);
        return (
          <g key={name}>
            <circle cx={x} cy={y} r="5" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
            <text x={x + 9} y={y + 4} fontSize="13" fill="var(--muted)" fontFamily="var(--font-sans)">
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Hero({dark, onToggleTheme}: {dark: boolean; onToggleTheme: () => void}) {
  useEffect(() => {
    const t = setTimeout(loadMap, 2500); // after the hero animation has played
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="ui min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-tight">
          <Logo className="size-10" />
          City Pulse
        </span>
        <button
          onClick={onToggleTheme}
          aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
          className="grid size-10 place-items-center rounded-xl border-2 border-line hover:border-auto"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-6 lg:grid-cols-[1.05fr_1fr]">
        <section>
          <h1 className="font-display text-[clamp(3rem,7vw,5.75rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
            How does Bengaluru move?
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
            Pick a question and watch the answer play out on a real map of the city. No coding and no maths: just look, zoom and
            spot the patterns.
          </p>
          <a href="#map" className="btn-auto mt-8 inline-block rounded-2xl px-7 py-4 text-lg font-bold no-underline">
            Open the live map
          </a>

          <h2 className="mt-12 text-sm font-bold text-muted">Or start with a question</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {PRESETS.map(p => (
              <li key={p.id}>
                <a href={`#map/${p.id}`} className="group flex items-start gap-4 py-4 no-underline">
                  <span className="mt-1.5 h-6 w-1.5 shrink-0 rounded-full" style={{background: p.accent}} aria-hidden />
                  <span>
                    <span className="block font-display text-xl font-bold group-hover:underline">{p.question}</span>
                    <span className="mt-0.5 block text-[15px] text-muted">{p.explain.split('. ')[0]}.</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto w-full max-w-[560px]">
          <CityMap />
          <p className="mt-2 text-center text-sm text-muted">Every line is someone going to work.</p>
        </div>
      </main>

      <section className="mx-auto max-w-6xl px-6 pb-14" aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-bold">How it works</h2>
        <ol className="mt-5 grid gap-6 sm:grid-cols-3">
          {[
            ['Pick a question', 'Each question has its own map, already set up to show the answer.'],
            ['Play, zoom and hover', 'Press play to run the clock, scroll to zoom, and hover anything to see its details.'],
            ['Spot the pattern', 'Use the colour key and the "Try this" tip to find what the data is telling you.']
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-auto font-display text-lg font-extrabold text-[#141a3c]">
                {i + 1}
              </span>
              <span>
                <span className="block font-display text-lg font-bold">{title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-muted">
        Sample data is made up for learning. Built on kepler.gl (MIT) with MapLibre and CARTO basemaps.
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
