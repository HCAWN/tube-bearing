# Tube Bearing

A React application comparing London Underground platform direction labels with the track heading immediately on departure.

A GitHub Pages deployment workflow is prepared for this app. Do not push or trigger a deployment without an explicit user request.

## Run locally

```powershell
npm install
npm run dev
```

`npm run build` checks TypeScript and builds the app into `dist/`. `npm run preview` serves that build locally. There is no backend, database or API key.

## GitHub Pages

In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Once committed and pushed, `.github/workflows/deploy.yml` builds and deploys on pushes to `main`, or when manually run from the Actions tab. It uses Node.js 22, installs dependencies with `npm ci`, builds with the Pages base path and publishes `dist/`. The expected project URL is `https://hcawn.github.io/tube-bearing/`.

The workflow also copies the built app to `404.html`, allowing station and statistics links to load directly or refresh on GitHub Pages. Pages serves these fallback requests with a 404 HTTP status while the app resolves the requested view. Local development continues to use `/`.

## One permanent dataset

**`data/network.json` is the only application dataset.** It contains:

- `departures`: 747 measured departure records, all with a stored angular discrepancy.
- `stations`: the 272 stations, with map locations and line membership.
- `lines`: line names and colours.
- `tracks`: the GeoJSON geometry drawn on the map.
- `meta`: snapshot date, measurement definitions and attribution.

Each departure contains its stable ID, station ID/name, line ID/name/colour, platform number/name, signed direction, signed bearing, actual track bearing, discrepancy, next station, departure coordinates, measurement reference and source links. Curated corrections have their explanation and evidence URLs directly in that record's `sources` object.

Bearings are degrees clockwise from true north: north is 0, east 90, south 180 and west 270. `deviation` is the smaller angle between `signedBearing` and `bearing`, from 0 to 180 degrees. Coordinates are `[longitude, latitude]`; the first coordinate is the departure anchor.

The 747 records describe departures by station, line, direction and branch. A platform can serve multiple departures. `platform: null` means a numbered platform has not been assigned; optional `platformCandidates` preserve mapped possibilities without assigning one. For example, Battersea's Northbound departure towards Nine Elms has a bearing of 54.14° and a discrepancy of 54.14°, with its platform number unassigned.

The app loads this file as a local Vite asset. Development and builds use the saved values directly: no scraping, source interpretation, track measurement, data-generation scripts or copied public JSON. Intentional corrections belong in this file, with supporting notes and URLs in the affected record.

## Measurement

The bearing is the immediate outgoing tangent of the mapped track at the departure anchor. The reference is the downstream mapped platform end where available, otherwise the mapped train stop position or a station position projected onto that line's track. Later curves do not change the departure bearing. These are map-derived estimates rather than surveyed measurements or live train headings.

The signed direction was curated from passenger-facing labels and documented source evidence. It is not inferred from the track bearing.

## Station links

Selecting a station or departure updates the URL, for example:

- `/battersea-power/northbound`
- `/westminster/district-eastbound-platform-2`
- `/hatton-cross/westbound-platform-1-towards-heathrow-terminal-4`

Opening or refreshing a link restores the exact departure. Back and Forward restore earlier selections. A station-only path selects its first departure. `/stats` opens the statistics view. Previously shared `#departure-id` links still work.

## Project files

`src/` contains the application; `data/` contains just `network.json`; `public/` contains the favicon. `node_modules/` and `dist/` are generated and ignored by Git.

Raw downloads, old curation files, research scripts and scratch outputs are outside this project. Future screenshots and one-off working files belong in Windows Temp, outside the checkout.

## Attribution

- Station locations, lines and platform labels: [TfL Open Data](https://tfl.gov.uk/info-for/open-data-users/api-documentation), under [TfL transport data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service). Powered by TfL Open Data.
- Track geometry and derived bearings: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). OSM-derived data in `data/network.json` is available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); TfL fields retain their source terms.
- Basemap tiles: [OpenFreeMap](https://openfreemap.org/), with OpenMapTiles and OpenStreetMap attribution shown on the map. Basemap tiles are fetched on demand; the analytical dataset stays fixed.
