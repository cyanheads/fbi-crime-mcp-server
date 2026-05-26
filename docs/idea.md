# fbi-crime-mcp-server

FBI Crime Data Explorer — UCR (Uniform Crime Reporting) and NIBRS (National Incident-Based Reporting System) crime statistics.

## API

- **Base**: `https://api.usa.gov/crime/fbi/`
- **Auth**: API key (free, via api.data.gov registration)
- **Docs**: https://crime-data-explorer.fr.cloud.gov/pages/docApi
- **Alt docs**: https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/docApi

## Key data

- **UCR Summary**: Agency-level crime counts by offense type (legacy system, 1960–present)
- **NIBRS**: Incident-level data — offense, victim, offender, arrestee demographics, property, location type
- **Agency participation**: Which agencies report, their coverage population
- **Hate crimes**: Bias-motivated incident reporting
- **LEO killed/assaulted**: Law enforcement officer data
- **Arson**: Separate reporting track
- **Human trafficking**: Newer data collection

## Cross-domain value

| Chain to | Query |
|---|---|
| Census | Crime rates per capita by geography, demographic correlations |
| BLS | Crime rates vs unemployment by region |
| CDC | Violent crime → injury/mortality data |
| OpenStates | Crime trends → state criminal justice legislation |
| Congress | Federal crime bills, sentencing reform |
| OpenStreetMap | Crime hotspots → neighborhood characteristics |
| Socrata | Local open data portals often have granular crime data |

## Tool ideas

- `fbi_search_agencies` — find reporting agencies by state, county, type
- `fbi_get_agency` — agency profile and participation status
- `fbi_get_crime_summary` — UCR summary data by agency/state/national, offense, year range
- `fbi_get_nibrs_offenses` — incident-level offense data with filters
- `fbi_get_nibrs_victims` — victim demographics and circumstances
- `fbi_get_hate_crimes` — bias-motivated incident data
- `fbi_get_participation` — which agencies are reporting and their population coverage

## Licensing (audited 2026-05-25)

- **Status: Clear to host**
- US federal government data (FBI/DOJ) — public domain under 17 USC §105
- Free API key via api.data.gov registration
- No redistribution restriction on the data

## Notes

- UCR is transitioning fully to NIBRS — some agencies still only report summary data
- Population coverage varies: not all agencies report every year
- NIBRS is far richer (incident-level) but adoption is still growing
