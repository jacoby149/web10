"""Build static autocomplete catalogs from locally downloaded source snapshots."""

import argparse
import json
from pathlib import Path
from zipfile import ZipFile


def cities(source):
    regions = {}
    for line in (source / 'admin1CodesASCII.txt').read_text().splitlines():
        code, name, *_ = line.split('\t')
        regions[code] = name

    result = []
    with ZipFile(source / 'cities15000.zip') as archive:
        for line in archive.read('cities15000.txt').decode().splitlines():
            row = line.split('\t')
            region = regions.get(f'{row[8]}.{row[10]}')
            detail = ', '.join(part for part in (region, row[8]) if part and part != row[1])
            aliases = [row[2]] if row[2] and row[2] != row[1] else []
            if row[8] in {'US', 'CA'} and row[10].isalpha():
                aliases.append(f'{row[1]} {row[10]}')
            if int(row[14] or 0) >= 100_000:
                aliases.extend(alias for alias in row[3].split(',')
                               if alias.isascii() and alias.isalpha() and alias.isupper() and 3 <= len(alias) <= 4)
            result.append((-int(row[14] or 0), [row[0], row[1], detail, aliases,
                                               round(float(row[4]), 3), round(float(row[5]), 3)]))
    return [record for _, record in sorted(result)]


def schools(source):
    with ZipFile(source / 'ror.zip') as archive:
        filename, = (name for name in archive.namelist() if name.endswith('-ror-data.json'))
        with archive.open(filename) as data:
            organizations = json.load(data)
    result = []
    for org in organizations:
        if org['status'] != 'active' or 'education' not in org['types']:
            continue
        name = next(item['value'] for item in org['names'] if 'ror_display' in item['types'])
        aliases = [item['value'] for item in org['names'] if item['value'] != name
                   and set(item['types']) & {'alias', 'acronym', 'label'}]
        country = next((loc.get('geonames_details', {}).get('country_code')
                        for loc in org['locations'] if loc.get('geonames_details')), None)
        result.append([org['id'].rsplit('/', 1)[-1], name, country or '', list(dict.fromkeys(aliases))[:6]])
    return sorted(result, key=lambda row: (row[1].casefold(), row[0]))


def employers(source):
    issuers = json.loads((source / 'company_tickers.json').read_text())
    result = {}
    for issuer in issuers.values():
        key = str(issuer['cik_str'])
        record = result.setdefault(key, [key, issuer['title'], '', []])
        if issuer['ticker'] not in record[3]:
            record[3].append(issuer['ticker'])
        if not record[2]:
            record[2] = issuer['ticker']
    return sorted(result.values(), key=lambda row: (row[1].casefold(), row[0]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    source = parser.parse_args().source
    out = Path(__file__).resolve().parents[1] / 'public' / 'profile-catalogs'
    out.mkdir(parents=True, exist_ok=True)
    for name, build in [('cities', cities), ('schools', schools), ('employers', employers)]:
        rows = build(source)
        if not rows or len(rows) != len({row[0] for row in rows}):
            raise ValueError(f'{name}: expected non-empty rows with distinct IDs')
        encoded = [json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows]
        payload = ',\n'.join(','.join(encoded[i:i + 32]) for i in range(0, len(encoded), 32))
        (out / f'{name}-v1.json').write_text(f'[\n{payload}\n]\n', encoding='utf-8')
        print(f'{name}: {len(rows):,} records')


if __name__ == '__main__':
    main()
