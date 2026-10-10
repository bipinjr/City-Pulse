import {useEffect, useRef, useState} from 'react';
import {answer, parseCity, SUGGESTIONS, type Answer, type CityData} from './ask';

type Msg = {from: 'you' | 'bot'; text: string};
const GREETING: Msg = {
  from: 'bot',
  text: "Hi! Ask me anything about Bengaluru's bus stops, hangouts or commutes. I'll answer and show you the spot on the map."
};

let cache: Promise<CityData> | null = null;
const loadCity = () =>
  (cache ??= Promise.all(
    ['bus_stops.csv', 'poi.csv', 'commute_trips.csv'].map(f =>
      fetch(`${import.meta.env.BASE_URL}data/${f}`).then(r => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`);
        return r.text();
      })
    )
  )
    .then(([s, p, t]) => parseCity(s, p, t))
    .catch(e => {
      cache = null; // let the next question retry
      throw e;
    }));

export function AskPanel({onClose, onAnswer}: {onClose: () => void; onAnswer: (a: Answer) => void}) {
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadCity().catch(() => {}); // warm up while they type
  }, []);
  useEffect(() => {
    logRef.current?.scrollTo({top: logRef.current.scrollHeight, behavior: 'smooth'});
  }, [msgs]);

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setText('');
    setMsgs(m => [...m, {from: 'you', text: q}]);
    setBusy(true);
    try {
      const a = answer(q, await loadCity());
      setMsgs(m => [...m, {from: 'bot', text: a.text}]);
      onAnswer(a);
    } catch {
      setMsgs(m => [...m, {from: 'bot', text: "I couldn't load the city data. Check your internet connection and ask again."}]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const showChips = msgs.length <= 1 || msgs[msgs.length - 1].text.startsWith("I didn't catch");

  return (
    <section
      className="ui absolute right-16 top-4 z-10 flex max-h-[min(34rem,calc(100%-10rem))] w-[22rem] flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-line"
      aria-label="Ask City Pulse"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-lg font-bold">Ask City Pulse</h2>
        <button onClick={onClose} aria-label="Close chat" className="grid size-8 place-items-center rounded-lg hover:bg-sunk">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.map((m, i) => (
          <p
            key={i}
            className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${
              m.from === 'you' ? 'ml-auto rounded-br-md bg-auto font-semibold text-[#141a3c]' : 'rounded-bl-md bg-sunk'
            }`}
          >
            {m.text}
          </p>
        ))}
        {busy && <p className="w-fit animate-pulse rounded-2xl rounded-bl-md bg-sunk px-3.5 py-2.5 text-[15px]">Looking it up…</p>}
        {showChips && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border-2 border-line px-3 py-1 text-sm hover:border-auto">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          ask(text);
        }}
        className="flex gap-2 border-t border-line p-3"
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Which bus stop is busiest?"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border-2 border-line bg-paper px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted focus:border-auto"
        />
        <button type="submit" disabled={!text.trim() || busy} className="btn-auto rounded-xl px-4 font-bold disabled:opacity-50">
          Ask
        </button>
      </form>
    </section>
  );
}
