<p align="center"><img src="public/logo.svg" width="96" alt="City Pulse logo"></p>

# City Pulse

**How does Bengaluru move?** An interactive map explorer made for school and PU students. Pick a question, press play and spot
the patterns: where people hang out, which bus stops are busiest, and how the city commutes through a whole weekday.

Built on [kepler.gl](https://github.com/keplergl/kepler.gl), the open-source geospatial analysis tool from the Urban Computing
Foundation, used here as a library inside a custom React app.

![Home page](docs/screenshot-home.png)
![Commute playback](docs/screenshot-commutes.gif)

> Screenshot placeholders: add `docs/screenshot-home.png` and a short `docs/screenshot-commutes.gif` recording.

## What you can do

| Question | Map | What to notice |
| --- | --- | --- |
| Where do people hang out? | 1,800 places as dots coloured by type | Cafes and pubs cluster in Koramangala and Indiranagar |
| Which bus stops are busiest? | 3D hexagon towers of daily boardings | The tallest towers sit on the busiest routes |
| How does the city get to work? | Arcs from home to work, played hour by hour | Two rush hours, around 9 AM and 6 PM |

- **Ask City Pulse**: a chat box. Type "Which bus stop is busiest?", "How many people board in Whitefield?" or "When is
  rush hour?" and it answers from the data, switches to the right map and flies to the spot. It works offline by matching
  keywords (`src/ask.ts`), so there is no AI service and no API key to leak.
- **Day bar playback**: a big play button plus one bar per hour (tap a bar to jump there) replaces kepler's expert timeline.
- **What you're seeing panel**: a plain-language explanation, a colour key that matches the map, a "Try this" tip and quick
  facts (number of data points, busiest area, busiest hour, top category), computed in TypeScript.
- **Add your own data**: drag in any CSV or GeoJSON through kepler's built-in upload window. Quick facts work for uploads too.
- **Light and dark mode**, remembered between visits, with matching basemaps.
- **Expert controls stay available**: open the panel on the left of the map for kepler's full layer and filter controls.

## Run it

Needs Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # checks the quick-facts maths
npm run build      # static site in dist/
```

No API keys are needed. The basemap is MapLibre with free CARTO tiles. See `.env.example` if you ever switch to a Mapbox style.

### Deploy to Vercel

Import the repo in Vercel. It detects Vite automatically (build `npm run build`, output `dist`). No environment variables are
required.

## Data

All three datasets in `public/data/` are **synthetic**. They are made up but shaped like the real city: real neighbourhood
locations, morning and evening rush-hour peaks, and commutes flowing towards tech hubs like Whitefield and Electronic City.
Regenerate them (same output every time, the generator is seeded) with:

```bash
npm run gen-data
```

Want real data? Good open sources for Bengaluru include BMTC GTFS feeds and OpenStreetMap extracts. Drop the CSV straight into
the app with "Add your own data".

## How it's built

- **Vite + React 19 + TypeScript + Tailwind CSS v4.** Tailwind's reset is left out on purpose, so kepler's own styling isn't
  disturbed. A small scoped reset (`.ui`) covers this app's own UI only.
- **kepler.gl 3.3.0-alpha.16** (`@kepler.gl/components`, `reducers`, `actions`, `processors`), embedded with a Redux store
  following kepler's official
  [`examples/get-started-vite`](https://github.com/keplergl/kepler.gl/tree/master/examples/get-started-vite). Its Vite config
  is reused nearly unchanged.
- Each question is a saved kepler map config in `src/presets.ts`, loaded with `addDataToMap`.
- kepler is re-themed with the City Pulse palette and fonts through its `theme` prop. The map code is lazy-loaded and warmed up
  in the background while the home page is open.
- Type: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) for headings and
  [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next) for body text, which was designed
  for easy reading.

## Credits and licence

- [kepler.gl](https://github.com/keplergl/kepler.gl): MIT licence, copyright contributors to the kepler.gl project.
  `vite.config.ts` is adapted from its `get-started-vite` example.
- Basemap © [CARTO](https://carto.com/attributions), map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors. Rendered with [MapLibre GL JS](https://maplibre.org/).
- This project: MIT.
