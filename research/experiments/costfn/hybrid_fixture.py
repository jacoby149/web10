"""Reproduce the D117 in-memory preflight; no database or native I/O metrics."""
import hashlib
import json


def wire(value):
    return json.dumps(value, separators=(',', ':'), sort_keys=True).encode()


def digest(value):
    return hashlib.sha256(wire(value)).digest()


def rank(rows, limit):
    return sorted((row for row in rows if row[2] == 'public'),
                  key=lambda row: (-row[3], row[0]))[:limit]


def main():
    # Full document keys are (author, ID); ID alone is deliberately nonunique.
    docs = {(i // 8, i % 8): {'policy': 'private' if i % 7 == 0 else 'public',
                             'rank': i % 23, 'body': f'{i:04}' + 'x' * 8192}
            for i in range(256)}
    commits = {}
    skinny = {}
    staged = {}

    def row(key, version, doc):
        return key, version, doc['policy'], doc['rank']

    def stage(key, version, doc):
        staged[key, version] = doc.copy()
        skinny[key, version] = row(key, version, doc)

    def publish(key, version):
        pair = key, version
        doc = staged[pair]
        expected = row(key, version, doc)
        if skinny.get(pair) != expected:
            raise ValueError('unconfirmed stage')
        previous = commits.get(key)
        current = version, digest(expected), digest(doc), doc.copy()
        if previous and previous[0] >= version and current != previous:
            raise ValueError('conflicting or stale operation')
        commits[key] = current

    def canonical(limit):
        scanned = [(key, v, doc) for key, (v, _, _, doc) in commits.items()]
        projected = [row(key, v, doc) for key, v, doc in scanned]
        result = [(key, v, commits[key][3]) for key, v, *_ in rank(projected, limit)]
        full_scan_bytes = sum(len(wire(item)) for item in scanned)
        # Sensitivity check, not a claim that current canonical SQL obtains
        # this pruning: seek winners after scanning only the required columns.
        projected_bytes = sum(len(wire(item)) for item in projected)
        projected_bytes += sum(len(wire(item)) for item in result)
        return result, (full_scan_bytes, projected_bytes)

    def hybrid(limit):
        verified = []
        manifest_bytes = row_bytes = payload_bytes = 0
        for key, (version, expected, payload_digest, _) in commits.items():
            manifest_bytes += len(wire((key, version))) + len(expected) + len(payload_digest)
            actual = skinny.get((key, version))
            if actual is None or digest(actual) != expected:
                raise ValueError('committed row missing or corrupt')
            row_bytes += len(wire(actual))
            verified.append(actual)
        result = []
        for key, version, *_ in rank(verified, limit):
            v, _, expected, doc = commits[key]
            if version != v or digest(doc) != expected:
                raise ValueError('committed document mismatch')
            result.append((key, version, doc))
            payload_bytes += len(wire((key, version, doc)))
        return result, (manifest_bytes, row_bytes, payload_bytes)

    def refuses(action, message):
        try:
            action()
        except ValueError as error:
            assert str(error) == message, error
        else:
            raise AssertionError(message)

    for key, doc in docs.items():
        stage(key, 1, doc)
        publish(key, 1)

    expected, (full_scan, projected_scan) = canonical(20)
    actual, costs = hybrid(20)
    # Independent initial result directly over the input corpus.
    keys = sorted((key for key, doc in docs.items() if doc['policy'] == 'public'),
                  key=lambda key: (-docs[key]['rank'], key))[:20]
    assert expected == actual == [(key, 1, docs[key]) for key in keys]
    print(f'Ordered K20 parity: PASS; full scan {full_scan:,} modeled bytes; '
          f'hybrid {sum(costs):,} ({costs[0]:,} manifest + {costs[1]:,} skinny + '
          f'{costs[2]:,} winner documents); {full_scan / sum(costs):.2f}x smaller')
    print(f'Projected canonical + winner fetch sensitivity: {projected_scan:,} modeled bytes; '
          f'hybrid {(sum(costs) / projected_scan - 1) * 100:.1f}% larger')

    key = keys[0]
    edit = {**docs[key], 'policy': 'private'}
    stage(key, 2, edit)
    assert hybrid(20)[0] == expected
    assert commits[key][0] == 1 and (key, 2) in staged
    print('Crash before commit: staged edit invisible')

    skinny.pop((key, 2))
    refuses(lambda: publish(key, 2), 'unconfirmed stage')
    assert hybrid(20)[0] == expected
    print('Dropped row: commit refused; old version still visible')

    stage(key, 2, edit)
    publish(key, 2)
    # The first publication landed but its response was lost; resolve by retrying
    # the same immutable identity/content, not by minting a new version.
    saved = commits.copy()
    publish(key, 2)
    assert commits == saved and all(item[0] != key for item in hybrid(20)[0])
    assert (key, 1) in skinny and hybrid(20)[0] == canonical(20)[0]
    print('Lost commit acknowledgment + identical retry: one commit; stale public row ignored')

    skinny.pop((key, 2))
    refuses(lambda: hybrid(20), 'committed row missing or corrupt')
    skinny[key, 2] = row(key, 2, {**edit, 'policy': 'public'})
    refuses(lambda: hybrid(20), 'committed row missing or corrupt')
    print('Missing and corrupt current rows: read refuses before the census')

    skinny.clear()
    refuses(lambda: hybrid(20), 'committed row missing or corrupt')
    skinny.update({(k, v): row(k, v, doc) for k, (v, _, _, doc) in commits.items()})
    assert hybrid(20)[0] == canonical(20)[0]
    assert all(digest(skinny[k, v]) == d for k, (v, d, _, _) in commits.items())
    print('Dropped satellite: fail-closed read; rebuild from committed documents restores parity')

    winner = hybrid(20)[0][0][0]
    commits[winner][3]['body'] = 'corrupt payload'
    refuses(lambda: hybrid(20), 'committed document mismatch')
    print('Corrupt winning payload: read refuses before returning a page')


if __name__ == '__main__':
    main()
