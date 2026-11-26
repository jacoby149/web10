# Profile and post suggestions

These are modified snapshots, not authoritative or complete directories. The app loads each JSON file on demand from its own origin. A snapshot lists compact tuples: ID, display name, disambiguation, aliases, and (cities only) rounded centroid coordinates. The browser doesn't send search text or device coordinates to a catalog provider.

| File | Snapshot | Source |
| --- | --- | --- |
| `cities-v1.json` | 34,247 cities; 26 November 2026 | [GeoNames cities15000 and admin1 names](https://download.geonames.org/export/dump/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Sorted by population; many smaller towns are not included. |
| `schools-v1.json` | 23,385 active education records | [ROR 2.0, 16 December 2025](https://zenodo.org/records/17953395), CC0; location metadata from [GeoNames](https://www.geonames.org/) under CC BY 4.0. Primarily higher education, not a K–12 directory. |
| `employers-v1.json` | 7,988 distinct issuers; downloaded 26 November 2026 | [U.S. SEC company ticker mappings](https://www.sec.gov/files/company_tickers.json). U.S.-listing oriented; neither all employers nor a verification source. Not affiliated with or endorsed by the SEC. |

## Refresh

Download `cities15000.zip`, `admin1CodesASCII.txt`, the ROR JSON/CSV data dump zip (name it `ror.zip` locally), and `company_tickers.json` into a scratch directory. Follow the SEC's [Fair Access instructions](https://www.sec.gov/about/developer-resources) for the download. Run `python3 marketing/web10-social/scripts/build-profile-catalogs.py <scratch-directory>` from the repository root. Review row counts, coverage, and size, update the snapshot references above, and keep source-qualified IDs stable. Bump the filename version in the generator and client together when the tuple shape changes.
