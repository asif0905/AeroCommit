// Credit prices, program parameters and mandate levels used by the Supplier Plan.
// Every value is editable in the UI. Checked 27 October 2026; prices move daily and rules change,
// so treat these as screening defaults, not tax, legal or trading advice.
export const POLICY_CHECKED = '2026-10-27';

export const SOURCES = {
  z45: {label: 'Treasury proposed 45Z regulations (Federal Register, 4 Feb 2026)', url: 'https://www.federalregister.gov/documents/2026/02/04/2026-02246/section-45z-clean-fuel-production-credit'},
  rin: {label: 'PFL Petroleum RIN recap, 5 Oct 2026 (D4-26 ≈ 205¢)', url: 'https://pflpetroleum.com/reports/wp-content/uploads/2026/10/PFL_RIN_RECAP_V6_2026_10_5.pdf'},
  lcfsPrices: {label: 'FuSE credit prices, 23 Oct 2026', url: 'https://usefuse.com/resources/credit-prices'},
  caBenchmark: {label: 'CARB LCFS Basics (Nov 2025): jet benchmark mirrors diesel, 80.17 g/MJ in 2026', url: 'https://ww2.arb.ca.gov/sites/default/files/2025-11/LCFS%20Basics_post11-20-25_final.pdf'},
  caOptIn: {label: 'LAO: SAF earns LCFS credits by voluntary opt-in', url: 'https://lao.ca.gov/Publications/Report/5139'},
  wa: {label: 'WAC 173-424-900: diesel standard 93.10 g/MJ (2026); alternative jet 126.37 MJ/gal', url: 'https://app.leg.wa.gov/WAC/default.aspx?cite=173-424-900'},
  waCredit: {label: 'WA SB 5932 bill report: SAF tax credit not active until 20M gal/yr capacity (or 1 Jul 2031)', url: 'https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bill%20Reports/Senate/5932%20SBA%20ENET%2026.pdf'},
  or: {label: 'Oregon CFP: alternative jet fuel may opt in (OAR 340-253-0100)', url: 'https://law.cornell.edu/regulations/oregon/Or-Admin-Code-SS-340-253-0100'},
  il: {label: 'Argus: Illinois $1.50/gal SAF credit for airlines', url: 'https://www.argusmedia.com/en/news/2412226-illinois-passes-sustainable-aviation-fuel-tax-credit'},
  mn: {label: 'Minnesota Department of Revenue: SAF credit', url: 'https://www.revenue.state.mn.us/sustainable-aviation-fuel-credit'},
  mnCap: {label: 'Michigan Advanced Biofuels Coalition: state SAF incentives (MN certificate caps)', url: 'https://www.miadvancedbiofuels.com/2025/03/state-level-saf-incentives-explained/'},
  eu: {label: 'SkyNRG: ReFuelEU 2% from 2025, averaging to 2034, penalty ≥ 2× price gap', url: 'https://skynrg.com/refueleu-how-it-will-shape-the-saf-market/'},
  euPrices: {label: 'EASA 2025 reference prices: SAF €1,925/t, jet €640/t', url: 'https://www.safinvestor.com/news/149690/easa-2025/'},
  uk: {label: 'DfT SAF Mandate compliance guidance 2026', url: 'https://assets.publishing.service.gov.uk/media/69a80cb5a2495f2d259f1425/dft-saf-mandate-compliance-guidance-26.pdf'}
};

export const defaultPolicy = () => ({
  fx: {eurUsd: 1.161, gbpUsd: 1.33},            // EUR from EASA/SAF Investor conversion (Mar 2026); GBP is an assumption.
  rfs: {rinsPerGal: 1.6, d4: 2.05, capture: 100},
  z45: {rate: 1.00, claim: true},               // $1.00 with prevailing wage & apprenticeship; North American feedstock only.
  lcfs: {
    mjPerGal: 126.37,
    CA: {benchmark: 80.17, price: 89.25, capture: 100},
    OR: {benchmark: 89.0, price: 86.00, capture: 100, estimate: true},   // 2026 standard not confirmed; replace from OAR 340-253-8040.
    WA: {benchmark: 93.10, price: 82.25, capture: 100}
  },
  il: {rate: 1.50, capture: 50, soyCapReached: false},   // Claimed by airlines; capture = share priced into the sale.
  mn: {base: 1.50, perPoint: 0.02, max: 2.00, minReduction: 50, cap: 2100000, capture: 100},
  wa: {base: 1.00, perPoint: 0.02, max: 2.00, active: false, capture: 100},
  eu: {share: 2, safEurT: 1925, jetEurT: 640, multiplier: 2},
  uk: {target: 3.734, buyoutGbp: 4.66, certGbp: 0, safLhv: 33.38}   // certGbp: your sale price for surplus certificates (no public price; 0 = not sold).
});

export const CROP_FEEDSTOCKS = new Set(['soybean', 'canola', 'corn']);
export const FEEDSTOCK_LABELS = {uco: 'Used cooking oil', tallow: 'Tallow', soybean: 'Soybean oil', canola: 'Canola oil', corn: 'Corn oil'};
export const JURISDICTIONS = {
  CA: 'California (LCFS)', OR: 'Oregon (CFP)', WA: 'Washington (CFS)', IL: 'Illinois', MN: 'Minnesota', US: 'Other US', EU: 'EU (ReFuelEU)', UK: 'UK (SAF Mandate)'
};
