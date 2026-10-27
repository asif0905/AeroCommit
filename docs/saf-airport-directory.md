# SAF airport directory

Snapshot retrieved 24 October 2026. The directory is not a real-time inventory feed and is not guaranteed exhaustive. It includes 183 distinct airports: 64 US and 119 Europe/ECAC, including occasional-use records, historical agreements and projects.

## Sources and boundaries

- EUROCONTROL / ECAC: https://www.eurocontrol.int/shared/saf/ — all 113 airport features from the map's public `saf-airports.min.geojson`; source map date 7 July 2026. Offers → Reported offering; Using → Occasional/operator use. Manchester's project description is labelled Planned supply; Düsseldorf's development description is labelled Development project. These categories preserve uncertainty rather than claim current stock.
- 4AIR: https://www.4air.aero/saf-map — all US and European airport groups from the linked public Atlist map (124 worldwide FBO markers before geographic filtering). Classified Physical supply listed; not independently verified by AeroCommit. Record update dates are not fuel stock confirmations. Does not include book-and-claim-only locations.
- Selected public Neste/United, FedEx, Delta/Shell, Southwest/Valero announcements supplement commercial airports. Individual URLs and dates are retained with each record. Known 2025-only Neste agreements are labelled historical.
- Airport identity, codes, coordinates and country: OurAirports public-domain metadata distributed by DataHub https://github.com/datasets/airport-codes. IATA codes take priority over colliding local identifiers. EUROCONTROL's Sofia code typo and missing Cranfield identifier were resolved to SOF and EGTC. Legacy source identifiers remain searchable as aliases. Country scope includes ECAC airports in Türkiye and Spanish overseas territories.

## Planning behavior

Adding a directory airport creates zero-demand and zero-capacity lanes to the three illustrative suppliers. Operational/delivery risks start at 100% as conservative placeholders labelled Not configured; these must be replaced with user assumptions. Source records do not populate inventory, price, CI, or transit times. No airport-level supplier contract is implied. Imported airports are available in route-editor origin/destination selectors and persist through Save scenario locally. Demo scenarios do not overwrite imported airport risks. Expanded network views fit actual coordinates over Natural Earth coastlines and country borders; domestic scenarios retain the detailed US basemap. Airports with Not configured risk show no weather glow on the map. The directory CSV has one row per evidence record with a fixed 12-column layout; extra source identifiers go in the Other identifiers column.

## Refresh

Update `dist/airports.mjs` from the linked public map datasets and dated primary announcements. Match using ICAO/IATA identifiers, resolve aliases, deduplicate airport IDs, retain evidence dates and do not convert mandates or future projects into operational supply. Review source category and description together. Run `node test-airports.mjs` and the existing four model suites; check search, filters, import, save/reload, scenario changes and CSV in the UI. Refresh is manual; the browser does not contact source services.
