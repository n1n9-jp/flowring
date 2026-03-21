# Flowring — SVG Flow Visualization Library

## Purpose

An npm library for visualizing directional flow data as SVG overlays.
Renders donut arcs, directional arrows, and ranked labels on maps or any 2D coordinate space.

## Stack

- **Language**: TypeScript
- **SVG rendering**: d3-selection, d3-shape, d3-path
- **Bundler**: tsup (ESM + CJS + DTS)
- **React wrapper**: optional (`flowring/react` entry point)

## Package Structure

```
flowring/                        # repo root = npm package
├── src/                         # library source
│   ├── index.ts                 # main entry (re-exports)
│   ├── types.ts                 # public types (FlowringSource, FlowringDatum, FlowringOptions, etc.)
│   ├── defaults.ts              # default constants
│   ├── blink.ts                 # blink timing engine (getBlinkOpacity, createBlinkTimer)
│   ├── layout.ts                # geometry (angle adjustment, line crossing, ratio calculation)
│   ├── render.ts                # SVG drawing (d3-based)
│   ├── flowring.ts              # flowring(container, options) factory function
│   └── react/                   # React wrapper
│       ├── index.ts
│       ├── use-flowring.ts      # useFlowring() — blink timer hook
│       └── FlowringIndicator.tsx # <FlowringIndicator /> component
├── dist/                        # build output (gitignored)
├── examples/
│   └── demo-map/                # Next.js demo app (South Korea population migration)
│       ├── src/                 # app source
│       └── public/              # static data (JSON, GeoJSON, TSV)
└── image/                       # screenshots and GIFs for README
```

## API Overview

```typescript
// Vanilla JS
const ring = flowring(container, { topN: 12, direction: 'inbound', ... });
ring.update(source, data);
ring.render();       // on map pan/zoom
ring.destroy();

// React
<FlowringIndicator mapRef={mapRef} source={...} data={...} blinkTime={blinkTime} />
```

## Core Modules

- **`layout.ts`**: `computeLayout()` — coordinate projection, ratio calculation, `adjustRatioBarLocation()` (arc overlap prevention, 800 iter early exit), `unravelLines()` (line crossing resolution)
- **`render.ts`**: `renderToSvg()` — full SVG redraw each frame (clear + redraw)
- **`blink.ts`**: `getBlinkOpacity(timeSec, rankIndex)` → 0 | 1, exported for external sync (e.g., deck.gl fill colors)
- **`flowring.ts`**: factory function, ResizeObserver, internal blink timer management

## Build

```bash
npm run build        # tsup → dist/
npm run dev          # cd examples/demo-map && npm run dev
npm run build:demo   # cd examples/demo-map && npm run build
```

## Demo App (examples/demo-map/)

Visualizes South Korea population migration data using MapLibre + deck.gl + flowring.
- Static JSON: `netflow-all-sgg.json` (district), `netflow-all-emd.json` (neighborhood)
- GeoJSON hover detection → Zustand store filtering → FlowringIndicator rendering
- GitHub Pages deployment: `vuski.github.io/flowring`

## Documentation Rules

- Ask the user whether to update CLAUDE.md after major changes, and proceed only upon approval
- Document major changes in `.readme/yyyymmdd_title.md` format

## Misc

- use context7
