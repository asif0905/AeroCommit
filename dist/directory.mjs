// SAF airport directory helpers shared by the UI and tests.
export const countryName = code => { try { return new Intl.DisplayNames(['en'], {type: 'region'}).of(code); } catch { return code; } };

export const CSV_HEADER = ['IATA / ID', 'ICAO', 'Other identifiers', 'Airport', 'Country', 'Region', 'Evidence', 'Provider / operator', 'Source', 'Source date', 'Directory checked', 'Live stock (US gal)'];

// One row per evidence record; every row has exactly CSV_HEADER.length cells.
export function directoryCsvRows(airports, checkedOn) {
  return [CSV_HEADER, ...airports.flatMap(a => a.evidence.map(e => [
    a.id, a.icao, a.aliases.filter(x => x !== a.id && x !== a.icao).join('; '), a.name, countryName(a.country),
    a.region === 'US' ? 'United States' : 'Europe / ECAC', e.status, e.provider, e.url, e.date || '', checkedOn, 'Unknown'
  ]))];
}

// RFC 4180 quoting; CRLF line ends and a BOM so spreadsheet apps detect UTF-8.
export const toCsv = rows => '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
