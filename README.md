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

No `npm install` is needed. Tests cover allocation constraints, shared supply, delivery timing, fallback accounting, cost–GHG optimization, and gallon conversion.

## Workspace sections

- **Overview:** headline commitments, expected reductions and decision windows.
- **Routes:** origin/destination selection, disruption assumptions, recommendations, network map and route editor.
- **Cost & GHG:** budget, reduction-target and internal-carbon-value optimization, plus conventional-fuel fallback.
- **Supply & Constraints:** supplier offers, inventory, delivery lanes, airport limits and planning controls.
- **Methodology:** probability model, lifecycle comparison and assumptions.

The interface uses US gallons and USD/US gallon. GHG results use metric tonnes CO2e. Volume conversion uses a screening density of 0.80 kg/L for both fuels (3.0283294272 kg/US gallon). Production use requires actual batch density and reference conditions.

## Source files

| File | Purpose |
| --- | --- |
| `dist/index.html` | Page structure and accessible section tabs |
| `dist/app.js` | UI, scenario editing, browser-local persistence and CSV export |
| `dist/engine.mjs` | Two-pass supply allocation heuristic |
| `dist/fallback.mjs` | Conventional-fuel what-if comparison |
| `dist/tradeoff.mjs` | Continuous selected-route cost–GHG optimizer |
| `dist/units.mjs` | US gallon and fuel-price conversion boundary |
| `dist/style.css`, `dist/theme.css` | Responsive Clarity brand and readable typography |
| `dist/assets/` | Selected logo and cinematic lake-flight hero |
| `test-*.mjs` | Model and unit verification |

The landing hero uses a generated photorealistic image with a slow camera-style pan and zoom, pause/play, and reduced-motion support. It is not video footage. Google Fonts supplies Nunito and Nunito Sans, with local system-font fallbacks.

## Model boundaries

All weather, probabilities, supplier offers, airline groups and prices are illustrative. There are no live feeds, supplier reservations or executed orders.

The network planner is a transparent greedy heuristic, not a globally optimal solver. The cost–GHG optimizer is exact only for its simplified selected-route, fixed-supplier-mix model. Conditional holds ring-fence planning budget and supply; they are not supplier-confirmed options.

Lifecycle reductions assume aligned CI boundaries and equal-energy substitution. Weather affects probability/timing of use, not the SAF batch’s CI. A cancellation does not automatically destroy fuel. Retained inventory is not a cash refund, and possible later SAF use is not added to current-route GHG savings. Regulatory eligibility and contract enforcement require external validation.

Scenario saves are browser-local. CSV export includes the scenario assumptions and recommendations.

## Hosting

Deploy the contents of `dist/` to a static host. No backend, secrets or database are required. This repository does not include the private Sites project identity or source-access credentials.

Source snapshot: `0076bb33ecda8af3cc6487a4c4e8364bfc466466` (the cinematic AeroCommit prototype).
