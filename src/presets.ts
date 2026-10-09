// Preset datasets + kepler.gl saved map configs (schema v1). All data is SYNTHETIC.
// Copy is written for PU students: one question per map, plain words, one thing to try.

export type LegendItem = {label: string; color: string};
export type Preset = {
  id: string;
  question: string; // tab + hero label
  short: string; // compact tab label
  file: string;
  explain: string;
  tryThis: string;
  legend: LegendItem[];
  accent: string;
  config: object;
};

// kepler assigns ordinal colours to category values in alphabetical order,
// so each list below follows the sorted values of its column.
const MODE_COLORS: LegendItem[] = [
  {label: 'Auto', color: '#F5C518'},
  {label: 'Bike', color: '#2BB673'},
  {label: 'Bus', color: '#E63946'},
  {label: 'Car', color: '#8D99AE'},
  {label: 'Metro', color: '#9B5DE5'}
];
const PLACE_COLORS: LegendItem[] = [
  {label: 'Cafe', color: '#F5C518'},
  {label: 'College', color: '#4CC9F0'},
  {label: 'Hospital', color: '#FF8FAB'},
  {label: 'Mall', color: '#F77F00'},
  {label: 'Park', color: '#2BB673'},
  {label: 'Pub', color: '#E63946'},
  {label: 'Restaurant', color: '#FCBF49'},
  {label: 'Tech Park', color: '#9B5DE5'}
];
const range = (name: string, items: LegendItem[], type = 'qualitative') => ({
  name,
  type,
  category: 'Custom',
  colors: items.map(i => i.color)
});
const BOARDINGS = {name: 'Boardings', type: 'sequential', category: 'Custom', colors: ['#1B4F72', '#1F7A8C', '#2BB673', '#9BE15D', '#D9E85A', '#F5C518']};

const BENGALURU = {latitude: 12.955, longitude: 77.63, zoom: 10.7, bearing: 0, dragRotate: true};
const cfg = (visState: object, mapState: object = {}) => ({
  version: 'v1',
  config: {visState, mapState: {...BENGALURU, pitch: 0, ...mapState}}
});
const tooltip = (id: string, fields: string[]) => ({
  tooltip: {enabled: true, fieldsToShow: {[id]: fields.map(name => ({name}))}}
});

export const PRESETS: Preset[] = [
  {
    id: 'poi',
    short: 'Hangouts',
    question: 'Where do people hang out?',
    file: 'data/poi.csv',
    explain:
      'Each dot is one place: a cafe, park, college, tech park and more. Its colour tells you what kind of place it is. Where dots crowd together, the area is busy.',
    tryThis: 'Zoom into Koramangala and Indiranagar. Which kind of place shows up the most there?',
    legend: PLACE_COLORS,
    accent: '#F5C518',
    config: cfg({
      layers: [
        {
          id: 'poi-points',
          type: 'point',
          config: {
            dataId: 'poi',
            label: 'Places',
            color: [245, 197, 24],
            columns: {lat: 'lat', lng: 'lng', altitude: null},
            isVisible: true,
            visConfig: {radius: 8, opacity: 0.9, outline: false, filled: true, colorRange: range('Places', PLACE_COLORS)}
          },
          visualChannels: {colorField: {name: 'category', type: 'string'}, colorScale: 'ordinal'}
        }
      ],
      interactionConfig: tooltip('poi', ['name', 'category', 'area', 'rating'])
    })
  },
  {
    id: 'bus_stops',
    short: 'Bus stops',
    question: 'Which bus stops are busiest?',
    file: 'data/bus_stops.csv',
    explain:
      'The city is cut into hexagon tiles. A taller, brighter tile means more people get on a bus there every day.',
    tryThis: 'Hold right-click and drag to tilt the map. Find the tallest tower. Which area is it in?',
    legend: [
      {label: 'Fewer riders', color: '#1F7A8C'},
      {label: 'More riders', color: '#F5C518'}
    ],
    accent: '#2BB673',
    config: cfg(
      {
        layers: [
          {
            id: 'stops-hex',
            type: 'hexagon',
            config: {
              dataId: 'bus_stops',
              label: 'People boarding per day',
              columns: {lat: 'lat', lng: 'lng'},
              isVisible: true,
              visConfig: {
                opacity: 0.9,
                worldUnitSize: 0.6,
                coverage: 0.88,
                colorRange: BOARDINGS,
                enable3d: true,
                elevationScale: 12,
                sizeRange: [0, 500],
                colorAggregation: 'sum',
                sizeAggregation: 'sum'
              }
            },
            visualChannels: {
              colorField: {name: 'daily_boardings', type: 'integer'},
              colorScale: 'quantile',
              sizeField: {name: 'daily_boardings', type: 'integer'},
              sizeScale: 'linear'
            }
          }
        ],
        interactionConfig: tooltip('bus_stops', ['stop_name', 'daily_boardings'])
      },
      {pitch: 50, bearing: 18}
    )
  },
  {
    id: 'commute_trips',
    short: 'Commutes',
    question: 'How does the city get to work?',
    file: 'data/commute_trips.csv',
    explain:
      'Each curve is one trip from home to work, or back home. The clock plays through one whole weekday, showing one hour of trips at a time.',
    tryThis: 'Tap the tallest bar in the day bar to jump to rush hour. Which colour (way of travel) fills the map then?',
    legend: MODE_COLORS,
    accent: '#9B5DE5',
    config: cfg({
      filters: [
        {
          dataId: ['commute_trips'],
          id: 'trip-time',
          name: ['start_time'],
          type: 'timeRange',
          // kepler reads "2026-09-15 06:00:00" as UTC: start with a 1-hour window at 6 AM.
          value: [Date.UTC(2026, 8, 15, 6), Date.UTC(2026, 8, 15, 7)],
          // Our own day bar drives playback, so kepler's expert timeline stays tucked away.
          view: 'side',
          animationWindow: 'free'
        }
      ],
      layers: [
        {
          id: 'trip-arcs',
          type: 'arc',
          config: {
            dataId: 'commute_trips',
            label: 'Trips (home → work)',
            columnMode: 'points',
            color: [155, 93, 229],
            columns: {lat0: 'start_lat', lng0: 'start_lng', lat1: 'end_lat', lng1: 'end_lng'},
            isVisible: true,
            visConfig: {opacity: 0.55, thickness: 1.2, colorRange: range('Ways of travel', MODE_COLORS)}
          },
          visualChannels: {colorField: {name: 'mode', type: 'string'}, colorScale: 'ordinal'}
        }
      ],
      interactionConfig: tooltip('commute_trips', ['start_time', 'from_area', 'to_area', 'mode', 'duration_min'])
    }, {latitude: 12.9, zoom: 10.35}) // sit the city above the timeline panel
  }
];
