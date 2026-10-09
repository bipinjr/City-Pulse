import {useEffect, useMemo, useRef, useState} from 'react';
import {Provider, useDispatch, useSelector} from 'react-redux';
import {applyMiddleware, combineReducers, compose, legacy_createStore as createStore} from 'redux';
import KeplerGl from '@kepler.gl/components';
import keplerGlReducer, {enhanceReduxMiddleware} from '@kepler.gl/reducers';
import {addDataToMap, mapStyleChange, removeDataset, setFilter, toggleModal} from '@kepler.gl/actions';
import {ADD_DATA_ID} from '@kepler.gl/constants';
import {processCsvData} from '@kepler.gl/processors';
import {themeLT} from '@kepler.gl/styles';
import {initApplicationConfig} from '@kepler.gl/utils';
import {PRESETS, type Preset} from './presets';
import {clock, computeInsights, hourCounts} from './insights';
import {MoonIcon, SunIcon} from './icons';

// Store + setup per kepler.gl examples/get-started-vite.
initApplicationConfig({enableAnnotations: false});
const reducers = combineReducers({
  // Side panel starts closed: students see the map first, expert controls stay one click away.
  keplerGl: keplerGlReducer.initialState({uiState: {readOnly: false, currentModal: null, activeSidePanel: null}})
});
const store = createStore(reducers, {}, compose(applyMiddleware(...enhanceReduxMiddleware([]))));
type RootState = ReturnType<typeof store.getState>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (import.meta.env.DEV) (window as any).__store = store; // handy for debugging in devtools
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const visState = (s: RootState): any => (s.keplerGl as any).map?.visState;

// luma.gl debug layer breaks multi-pass rendering in dev (see kepler example).
const DECK_GL_PROPS = {deviceProps: {debug: false}};
// Trip times are stored as UTC by kepler, so format in UTC to show the CSV's own clock.
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'}).toUpperCase();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STEP = 2 * 60_000; // each tick moves the clock 2 minutes: a full day plays in ~30 s
const isTime = (f: {type: string}) => f.type === 'timeRange';
const moodOf = (h: number) =>
  h >= 8 && h < 10 ? 'Morning rush hour' : h >= 17 && h < 20 ? 'Evening rush hour' : h < 7 || h >= 21 ? 'Quiet roads' : 'Normal traffic';
const basemap = (dark: boolean) => (dark ? 'dark-matter' : 'positron');

// kepler merges a theme object over its dark theme: re-skin it in the City Pulse palette.
const FONT = '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif';
const SHARED = {fontFamily: FONT, activeColor: '#F5C518', activeColorHover: '#FFD84D', primaryBtnBgd: '#F5C518', primaryBtnActBgd: '#FFD84D', primaryBtnColor: '#141A3C'};
const KEPLER_DARK = {
  ...SHARED,
  sidePanelBg: '#161E4B',
  sidePanelHeaderBg: '#0F1538',
  sidePanelBorderColor: '#2B3570',
  panelBackground: '#1E275C',
  panelBackgroundHover: '#2B3570',
  panelBorderColor: '#2B3570',
  mapPanelBackgroundColor: '#161E4B',
  mapPanelHeaderBackgroundColor: '#1E275C',
  bottomWidgetBgd: '#161E4B',
  floatingBtnBgd: '#161E4B',
  floatingBtnBgdHover: '#2B3570',
  floatingBtnActBgd: '#2B3570',
  tooltipBg: '#EEF1FF',
  tooltipColor: '#141A3C',
  inputBgd: '#0F1538',
  secondaryInputBgd: '#0F1538',
  dropdownListBgd: '#1E275C',
  modalDialogBgd: '#161E4B',
  histogramFillInRange: '#F5C518',
  histogramFillOutRange: '#3A4486',
  sliderBarColor: '#F5C518',
  titleTextColor: '#FFFFFF',
  textColor: '#C9CFF0',
  labelColor: '#A7AFD6'
};
const KEPLER_LIGHT = {...themeLT, ...SHARED, histogramFillInRange: '#D9A900'};

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width: 0, height: 0});
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({width: e.contentRect.width, height: e.contentRect.height}));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

type Props = {initial: string; dark: boolean; onToggleTheme: () => void; onHome: () => void};

function Explorer({initial, dark, onToggleTheme, onHome}: Props) {
  const dispatch = useDispatch();
  const [ref, {width, height}] = useSize();
  const [active, setActive] = useState(PRESETS.some(p => p.id === initial) ? initial : 'commute_trips');
  const [error, setError] = useState('');
  const datasets = useSelector((s: RootState) => visState(s)?.datasets ?? {});
  const timeFilter: {value: number[]; domain: number[]} | undefined = useSelector((s: RootState) => visState(s)?.filters?.find(isTime));
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Set the 1-hour window's start; wrap to the start of the day at the end.
  function setWindow(start: number | ((value: number[]) => number)) {
    const fs = visState(store.getState())?.filters ?? [];
    const i = fs.findIndex(isTime);
    if (i < 0 || !fs[i].domain) return;
    const [lo, hi] = fs[i].domain;
    let t = typeof start === 'number' ? start : start(fs[i].value);
    if (t + HOUR > hi) t = lo;
    t = Math.max(lo, t);
    dispatch(setFilter(i, 'value', [t, t + HOUR]));
  }

  async function load(p: Preset) {
    setActive(p.id);
    history.replaceState(null, '', `#map/${p.id}`);
    setError('');
    try {
      const res = await fetch(import.meta.env.BASE_URL + p.file);
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const data = processCsvData(await res.text());
      if (!data) throw new Error('the file was empty');
      for (const id of Object.keys(visState(store.getState())?.datasets ?? {}))
        if (PRESETS.some(x => x.id === id)) dispatch(removeDataset(id));
      dispatch(addDataToMap({datasets: {info: {id: p.id, label: p.question}, data}, options: {centerMap: false}, config: p.config}));
      dispatch(mapStyleChange(basemap(dark)));
    } catch (e) {
      setError(`This map didn't load because ${(e as Error).message}. Check your connection and pick the tab again.`);
    }
  }

  // Actions sent before <KeplerGl> registers its instance are dropped, so wait for it.
  const ready = useSelector((s: RootState) => Boolean(visState(s)));
  const loaded = useRef(false);
  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    load(PRESETS.find(p => p.id === active)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    dispatch(mapStyleChange(basemap(dark)));
  }, [dark, dispatch]);

  // Facts follow the most recently added dataset (a preset or an upload).
  const ids = Object.keys(datasets);
  const current = datasets[ids[ids.length - 1]];
  const facts = useMemo(
    () =>
      current
        ? computeInsights({
            fields: current.fields,
            numRows: current.dataContainer.numRows(),
            valueAt: (r, c) => current.dataContainer.valueAt(r, c)
          })
        : [],
    [current]
  );
  const preset = PRESETS.find(p => p.id === current?.id);
  const uploaded = current && !preset;
  const isTrips = preset?.id === 'commute_trips' && Boolean(timeFilter?.domain);

  useEffect(() => {
    if (!playing || !isTrips) return;
    const id = setInterval(() => setWindow(v => v[0] + STEP), 60);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, isTrips]);

  const counts = useMemo(() => {
    const col = current?.fields.findIndex((f: {type: string}) => f.type === 'timestamp') ?? -1;
    if (col < 0) return null;
    return hourCounts(
      {fields: current.fields, numRows: current.dataContainer.numRows(), valueAt: (r, c) => current.dataContainer.valueAt(r, c)},
      col
    );
  }, [current]);
  const mood = timeFilter ? moodOf(new Date(timeFilter.value[0] + HOUR / 2).getUTCHours()) : '';

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="ui flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-panel px-5 py-3">
        <button onClick={onHome} className="font-display text-2xl font-extrabold tracking-tight" aria-label="City Pulse home">
          City Pulse
        </button>
        <nav className="flex gap-1 rounded-2xl bg-sunk p-1" aria-label="Pick a question">
          {PRESETS.map(p => {
            const on = active === p.id;
            return (
              <button
                key={p.id}
                onClick={() => load(p)}
                aria-pressed={on}
                title={p.question}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                  on ? 'bg-panel shadow-[0_1px_0_var(--line),0_2px_8px_rgba(20,26,60,0.12)]' : 'text-muted hover:text-ink'
                }`}
              >
                <span className="size-2.5 rounded-full" style={{background: p.accent}} aria-hidden />
                {p.short}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => dispatch(toggleModal(ADD_DATA_ID))}
            className="rounded-xl border-2 border-line px-4 py-2 text-sm font-semibold hover:border-auto"
          >
            Add your own data
          </button>
          <button
            onClick={onToggleTheme}
            aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
            className="grid size-10 place-items-center rounded-xl border-2 border-line hover:border-auto"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div ref={ref} className="relative min-w-0 flex-1">
          {width > 0 && (
            <KeplerGl
              id="map"
              appName="City Pulse"
              mapboxApiAccessToken={import.meta.env.VITE_MAPBOX_TOKEN ?? ''}
              width={width}
              height={height}
              theme={dark ? KEPLER_DARK : KEPLER_LIGHT}
              deckGlProps={DECK_GL_PROPS}
            />
          )}
          {isTrips && timeFilter && (
            <>
              <div className="ui pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-2xl bg-panel/95 px-6 py-3 text-center shadow-xl ring-1 ring-line">
                <p className="text-sm text-muted">Trips starting between</p>
                <p className="font-display text-3xl font-bold tabular-nums">
                  {hhmm(timeFilter.value[0])} – {hhmm(timeFilter.value[1])}
                </p>
                <p className={`mt-1 text-sm font-bold ${mood.includes('rush') ? 'text-auto' : 'text-muted'}`}>{mood}</p>
              </div>
              {counts && (
                <DayBar
                  counts={counts}
                  value={timeFilter.value}
                  dayStart={Math.floor(timeFilter.domain[0] / DAY) * DAY}
                  playing={playing}
                  onPlay={() => setPlaying(p => !p)}
                  onJump={t => setWindow(t)}
                />
              )}
            </>
          )}
        </div>

        <aside className="ui w-80 shrink-0 overflow-y-auto border-l border-line bg-panel px-6 py-6 xl:w-96">
          {error && <p className="mb-5 rounded-xl bg-bus/15 p-3 text-sm">{error}</p>}

          {preset ? (
            <>
              <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-tight">{preset.question}</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{preset.explain}</p>

              <h2 className="mt-6 text-sm font-bold">What the colours mean</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {preset.legend.map(l => (
                  <li key={l.label} className="flex items-center gap-1.5 rounded-full bg-sunk px-2.5 py-1 text-sm">
                    <span className="size-3 rounded-full" style={{background: l.color}} aria-hidden />
                    {l.label}
                  </li>
                ))}
              </ul>

              <div className="mt-6 rounded-2xl border-l-4 border-auto bg-sunk p-4">
                <h2 className="text-sm font-bold">Try this</h2>
                <p className="mt-1 text-[15px] leading-relaxed">{preset.tryThis}</p>
              </div>
            </>
          ) : uploaded ? (
            <>
              <h1 className="font-display text-3xl font-bold leading-[1.1] tracking-tight">Your data is on the map</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                kepler.gl picked a layer for “{current.label}”. Open the panel on the left of the map to change colours, size and
                layer type.
              </p>
            </>
          ) : (
            <div className="animate-pulse">
              <p className="font-display text-2xl font-bold">Drawing the city…</p>
              <p className="mt-2 text-[15px] text-muted">Placing thousands of points on the map. This takes a few seconds the first time.</p>
            </div>
          )}

          {facts.length > 0 && (
            <>
              <h2 className="mt-8 text-sm font-bold">Quick facts</h2>
              <dl className="mt-2 divide-y divide-line">
                {facts.map(f => (
                  <div key={f.label} className="py-3">
                    <dt className="text-sm text-muted">{f.label}</dt>
                    <dd className="font-display text-xl font-bold">{f.value}</dd>
                    {f.hint && <dd className="text-sm text-muted">{f.hint}</dd>}
                  </div>
                ))}
              </dl>
            </>
          )}

          <p className="mt-8 text-xs leading-relaxed text-muted">
            The data here is made up, but realistic. Map engine:{' '}
            <a className="underline" href="https://github.com/keplergl/kepler.gl" target="_blank" rel="noreferrer">
              kepler.gl
            </a>{' '}
            (MIT). Basemap © CARTO, © OpenStreetMap contributors.
          </p>
        </aside>
      </div>
    </div>
  );
}

type DayBarProps = {counts: number[]; value: number[]; dayStart: number; playing: boolean; onPlay: () => void; onJump: (t: number) => void};

function DayBar({counts, value, dayStart, playing, onPlay, onJump}: DayBarProps) {
  const first = counts.findIndex(n => n > 0);
  const last = 23 - [...counts].reverse().findIndex(n => n > 0);
  const hours = Array.from({length: last - first + 1}, (_, i) => first + i);
  const max = Math.max(...counts);
  return (
    <div className="ui absolute inset-x-4 bottom-4 flex items-center gap-5 rounded-2xl bg-panel/95 px-5 py-4 shadow-xl ring-1 ring-line">
      <button
        onClick={onPlay}
        className="btn-auto grid size-14 shrink-0 place-items-center rounded-full"
        aria-label={playing ? 'Pause the clock' : 'Play the day'}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-6 translate-x-0.5" fill="currentColor" aria-hidden>
            <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-sm text-muted">Trips per hour. Tap a bar to jump to that time.</p>
        <div className="flex h-16 items-end gap-1">
          {hours.map(h => {
            const t = dayStart + h * HOUR;
            const on = t < value[1] && t + HOUR > value[0];
            return (
              <button
                key={h}
                onClick={() => onJump(t)}
                aria-label={`Jump to ${clock(h)}, ${counts[h]} trips`}
                title={`${clock(h)}: ${counts[h]} trips`}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                <span
                  className={`block w-full rounded-t-md transition-colors ${on ? 'bg-auto' : 'bg-metro/45 group-hover:bg-metro'}`}
                  style={{height: `${Math.max(6, (counts[h] / max) * 100)}%`}}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1 text-xs text-muted" aria-hidden>
          {hours.map(h => (
            <span key={h} className="min-w-0 flex-1 whitespace-nowrap text-center">
              {h % 3 === 0 ? clock(h) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MapApp(props: Props) {
  return (
    <Provider store={store}>
      <Explorer {...props} />
    </Provider>
  );
}
