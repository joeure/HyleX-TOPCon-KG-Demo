# Inspector UI

`services/inspector-ui/` is the isolated frontend workspace for the
customer-facing inspection portal. Its first route is `/dashboard`.

This service is separate from the Streamlit developer console in
`services/ui/`. It must communicate with Core and optional services only over
public HTTP APIs and must not read Core state files, Neo4j, PostgreSQL, MinIO,
or extension-owned data directly.

## Phase A Layout

```text
services/inspector-ui/
  scripts/screenshots.mjs Playwright capture and watch workflow.
  public/                 Static assets (reserved for licensed assets).
  src/
    api/                  Gateway protocol seam and fixture client.
    app/                  Portal modes, preferences, and shell composition.
    design-system/        CSS tokens and responsive visual primitives.
    domain/               Stable dashboard view models.
    features/universe/    Shared 2D/3D Ontology/KG force scene and overlays.
    features/query/       Query/Search composer and evidence panels.
    features/auth/        Remote Gateway login screen.
    fixtures/             Deterministic published snapshot fixture.
    i18n/                 Chinese/English message dictionaries.
```

The current deep-space visual is an original lightweight Canvas/SVG adaptation
of the visual direction observed in the local SAG repository. No SAG runtime
component or product data is imported. If a substantial SAG code subset is
copied later, retain its MIT copyright/license notice in `public/licenses/` and
add a provenance header to the adapted file.

## Local development

```bash
cd services/inspector-ui
npm install
npm run dev                 # http://127.0.0.1:4173/dashboard
npm run typecheck
npm run build
npm run screenshot          # starts dev server and writes repo ./screenshots
npm run screenshot:ci       # fixture capture for CI/review
npm run screenshot:watch   # debounced capture after src/public/index.html/vite.config changes
npm run screenshot:real    # live VPS data through an existing loopback SSH tunnel
npm run screenshot:real:login # visible Chromium window for manual login
npm run screenshot:real:watch
```

Screenshot sizes are fixed at 1440×900 (desktop), 1024×768 (tablet), and
390×844 (mobile). The script disables animations during capture so the files
are stable enough for design review. Production builds use same-origin
`/auth` and `/inspector` requests. For offline UI smoke tests only, set
`VITE_USE_FIXTURES=true`; the production app never falls back to fixtures
silently.

Each run also captures six interaction states per viewport: 3D Layer, 3D wheel
drill, 3D double-click drill, 2D Layer, 2D wheel drill, and 2D double-click
drill. Their names follow
`dashboard-{layer|zoom|double-click}-{3d|2d}-{desktop|tablet|mobile}.png`.

For a real-data capture, first forward the remote Inspector port to a local
loopback port, then provide the Gateway URL and password only as runtime
environment variables. The workflow refuses the fixture snapshot, requires at
least `INSPECTOR_REAL_MIN_NODES` nodes (default 100), and writes
`dashboard-real-{desktop,tablet,mobile}.png` plus
`dashboard-real-manifest.json`. It never stores the password.
The local Vite server proxies `/auth` and `/inspector` through the tunnel so
the browser remains same-origin and the formal Gateway CORS policy is not
weakened.

## Inspector Universe contract

The graph is rendered by `UniverseExplorer`; the old static `Universe` path is
not mounted. Ontology and KG share one force runtime in both 2D and 3D. Nodes
are small monochrome points/circles, labels are not permanently rendered, and
information is a single graph-anchored floating layer: hover a node for its
details and incident-edge highlight, click an edge to pin edge provenance.
`Layer` is an opt-in layout constraint (off by default), and the page has no
type filters, Overview button, or right-hand sidebar.

Graph pages are loaded through the UI Gateway only:

```text
POST /inspector/universe/graph/pages
{
  "snapshot_id": "snapshot-id",
  "mode": "concept | entity | global | evidence",
  "focus_id": "concept-or-entity-id",
  "depth": 1,
  "cursor": null,
  "page_size": 500
}
```

The client follows `page.nextCursor` until `complete=true`, deduplicating nodes
and edges by stable IDs. Single click selects a node for inspection.
Double-clicking a Concept, or zooming in repeatedly while the pointer is
explicitly over it, loads its bound entities plus a one-hop dimmed Ontology
boundary. Semantic zoom expands entity depth and then evidence; zooming out
from a Concept KG returns directly to Ontology without an empty global-graph
interlude. No UI code reads Core state, Neo4j, PostgreSQL, MinIO, or extension
data directly.

The shared UI Gateway itself is under `services/ui-gateway/` and can be started with
the commands in its README. It calls Core only through configured public HTTP
routes; it does not share Core storage mounts.

## Integration Boundary

- Local UI development may use a loopback-only development port.
- Remote containers must remain internal and must not publish a new VPS port.
- Compose and remote deployment integration is performed by the shared UI
  Gateway plan; the existing `services/ui/`, Core APIs, and persistent data
  stores remain outside this frontend's implementation boundary.
