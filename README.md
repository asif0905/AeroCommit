# AeroCommit

Weather-aware sustainable aviation fuel supply planning prototype. Compare tomorrow’s supply commitments, destination disruption risks, procurement cost and lifecycle GHG impact.

## Run locally

No build or JavaScript dependencies are required. Serve `dist/` over HTTP (ES modules do not run correctly from a `file://` URL):

```sh
python -m http.server 8080 --directory dist
```

Open http://localhost:8080. Any static web server can serve the same directory.

## Tests

Requires Node.js 18 or later:

```sh
npm test
```

No `npm install` is needed. Tests cover allocation constraints, shared supply, delivery timing, LP optimality versus the greedy baseline, map projection and airport distances, planner/trade-off consistency, fallback accounting, cost–GHG optimization, and gallon conversion.

## Workspace sections

- **Overview:** headline commitments, expected reductions and decision windows.
- **Routes:** origin/destination selection, disruption assumptions, recommendations, network map and route editor.
- **Cost & GHG:** budget, reduction-target and internal-carbon-value optimization, plus conventional-fuel fallback.
- **Supply & Constraints:** supplier offers, inventory, delivery lanes, airport limits and planning controls.
- **Compliance Plan:** for airlines. A two-stage stochastic LP picks how much SAF to contract from each supplier offer for the compliance year, then tests the plan against weather seasons (extra burn, diversions) and supplier shortfalls (hurricane-exposed suppliers fail more in severe seasons). Each delivered tonne is claimed once against EU ETS, CORSIA or the corporate SAF target; spot SAF, book-and-claim certificates, allowances and CORSIA units cover gaps. A slider trades expected cost against bad-year cost (CVaR), compared with a plan sized for an average year.
- **Supplier Plan:** for fuel suppliers. Allocates each month's SAF batches to airports with an exact LP, stacking RINs, California/Oregon/Washington clean fuel credits, Illinois and Minnesota SAF credits and 45Z, plus ReFuelEU penalties avoided and UK mandate certificates. Shows value per gallon by source, mandate coverage, the value of extra uptake or volume, and the gain over a credit-blind nearest-airport plan.
- **SAF Airports:** searchable 183-airport US/Europe evidence directory, CSV and scenario imports.
- **Methodology:** probability model, lifecycle comparison and assumptions.

The interface uses US gallons and USD/US gallon. GHG results use metric tonnes CO2e. Volume conversion uses a screening density of 0.80 kg/L for both fuels (3.0283294272 kg/US gallon). Production use requires actual batch density and reference conditions.

## Source files

| File | Purpose |
| --- | --- |
| `dist/index.html` | Page structure and accessible section tabs |
| `dist/app.js` | UI, scenario editing, browser-local persistence and CSV export |
| `dist/engine.mjs` | Two-stage supply allocation (exact LP by default, greedy baseline) |
| `dist/lp.mjs` | Dependency-free simplex: `maximize` (≤ rows) and `solveLP` (two-phase, ≤/≥/= rows, min or max) |
| `dist/fallback.mjs` | Conventional-fuel what-if comparison |
| `dist/tradeoff.mjs` | Continuous selected-route cost–GHG optimizer |
| `dist/units.mjs` | US gallon and fuel-price conversion boundary |
| `dist/geo.mjs` | Albers equal-area projection, great-circle paths and distances |
| `dist/basemap.mjs` | Generated contiguous-US land and state-border paths (~21 KB) |
| `tools/build-basemap.mjs` | Dev-only generator for `basemap.mjs` from US Census boundaries |
| `dist/worldmap.mjs` | Generated North Atlantic land and country borders for US–Europe scenarios (~41 KB) |
| `tools/build-worldmap.mjs` | Dev-only generator for `worldmap.mjs` from Natural Earth 1:50m |
| `dist/compliance.mjs` | Compliance Plan model: scenarios, two-stage stochastic LP with CVaR, average-year comparison |
| `dist/compliance-ui.mjs` | Compliance Plan tab |
| `dist/supplier.mjs` | Supplier Plan model: per-gallon value stack, mandate pools, LP allocation, nearest-airport comparison |
| `dist/supplier-ui.mjs` | Supplier Plan tab: inputs, results, CSV export, saved-scenario restore |
| `dist/policy.mjs` | Credit prices, program parameters and mandate levels with sources and the date checked |
| `dist/labels.mjs` | Collision-avoiding placement for airport and hub labels |
| `dist/directory.mjs` | Directory helpers: country names and aligned CSV export |
| `dist/style.css`, `dist/theme.css` | Responsive Clarity brand and readable typography |
| `dist/assets/` | Selected logo and cinematic lake-flight hero |
| `test-*.mjs` | Model and unit verification |

The landing hero uses a generated photorealistic image with a slow camera-style pan and zoom, pause/play, and reduced-motion support. It is not video footage. Google Fonts supplies Nunito and Nunito Sans, with local system-font fallbacks.

## Map

The Routes map is drawn from real geography with no map service or tiles, so it works offline and on any static host. Airports sit at their FAA reference coordinates; supplier hubs are illustrative companies placed at real renewable-fuel terminal regions (Portland, Houston, Baltimore). The contiguous US is shown in an Albers equal-area projection (standard parallels 29.5°N and 45.5°N), flights follow great-circle paths, and tooltips give great-circle and straight-line distances in km. State boundaries come from US Census Bureau cartographic boundaries via [us-atlas](https://github.com/topojson/us-atlas). To regenerate them, install `us-atlas@3.0.1 topojson-client@3.1.0 topojson-simplify@3.0.3` in any folder and run `node tools/build-basemap.mjs` from it.

## Model boundaries

All weather, probabilities, supplier offers, airline groups and prices are illustrative. There are no live feeds, supplier reservations or executed orders.

The network planner solves an exact linear program in two stages: it maximizes expected firm tCO2e under every shared constraint, then maximizes expected conditional-hold tCO2e from what remains. Each stage is optimal for its objective; the pair is lexicographic (firm first), not a single joint optimum. The original greedy ranking is kept as `planGreedy` and reported as a baseline in the CSV export. The cost–GHG optimizer is exact only for its simplified selected-route, fixed-supplier-mix model. Conditional holds ring-fence planning budget and supply; they are not supplier-confirmed options.

Expected reductions use the same probability everywhere: route operation × SAF arrival (1 − origin delivery failure), so the Overview, Cost & GHG and fallback views agree for a route. SAF that does not arrive is replaced by conventional jet fuel at the jet price. The firm risk threshold applies to combined route disruption only; delivery risk lowers a route's priority through its expected benefit instead.

Lifecycle reductions assume aligned CI boundaries and equal-energy substitution. Weather affects probability/timing of use, not the SAF batch’s CI. A cancellation does not automatically destroy fuel. Retained inventory is not a cash refund, and possible later SAF use is not added to current-route GHG savings. Regulatory eligibility and contract enforcement require external validation.

Scenario saves are browser-local. CSV export includes the scenario assumptions and recommendations.

## Hosting

Deploy the contents of `dist/` to a static host. No backend, secrets or database are required. This repository does not include the private Sites project identity or source-access credentials.

Airport directory snapshot: 24 October 2026. Coverage is not exhaustive or live inventory. See `docs/saf-airport-directory.md`. Imported airports start with no delivery capacity and unconfigured risks; demo weather presets do not overwrite those risks.

When a scenario includes airports outside the contiguous US, the map switches to a fitted overview with Natural Earth coastlines and country borders (public domain, via [world-atlas](https://github.com/topojson/world-atlas)); domestic scenarios keep the detailed Albers US basemap. Airport and hub labels are placed to avoid each other and the markers. Imported airports whose risk is still Not configured show no weather glow. To regenerate the outlines, install `world-atlas@2.0.2 topojson-client@3.1.0 topojson-simplify@3.0.3` and run `node tools/build-worldmap.mjs` from that folder.

## Supplier Plan values

Program values were checked on 27 October 2026 and live in `dist/policy.mjs`, each with its source. All are editable in the tab. Two need your own inputs before real use: Oregon's 2026 CFP benchmark is an estimate (replace from OAR 340-253-8040 Table 2), and the surplus UK certificate sale price defaults to £0 because there is no public price. Batches, airports, lanes and uptake are illustrative. The model is a screening tool, not tax, legal or trading advice.

## Compliance Plan values

Airline obligations by region, checked 27 October 2026 (sources listed in the tab): EU ETS covers intra-EEA flights with full auctioning from 2026, SAF counts as zero emissions and 20M SAF allowances cover 50–95% of the price gap; ReFuelEU requires airlines to uplift 90% of EU-departing fuel at EU airports; CORSIA's mandatory phase starts in 2027 (the US volunteered for the earlier phases; Canada has it in regulation). California's proposed intrastate jet obligation (2028) is not modeled. Two inputs are estimates to replace: the CORSIA sector growth factor (19%) and the CORSIA unit price ($25/t, a 2027 projection).
