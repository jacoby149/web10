"""Reader-bound canonical oracle setup on the owned, quiescent run copy."""

from copy import deepcopy
import json
from pathlib import Path
import shutil

import sqlglot

from arm_f_native import save
import core_feed
from costfn_task import digest, read
import dau_sustain_readers as readers
import dau_sustain_workload as wl
import engagement_billboards as ads
import restore_realism as restore


def ordered_capture(capture):
    """Make the previously unspecified order of grouped follow-ups explicit."""
    result = deepcopy(capture)
    for item, key in zip(result['requests'][1:3], ('ref_value', 'post_id'), strict=True):
        tree = sqlglot.parse_one(item['payload']['sql'], read='clickhouse')
        if tree.args.get('order') is not None or key not in tree.named_selects:
            raise ValueError('unexpected grouped-followup ordering or columns')
        item['payload']['sql'] = tree.order_by(key).sql(dialect='clickhouse')
    return result


def profiles(selection, *, origin, permissions, readable):
    """Resolve exactly the services/groups consumed by the real query shapes.

    This is quiescent setup; the live API must still authenticate each request
    and resolve its scope again. No serving response is an oracle input.
    """
    from app.v3.services import safe_query

    rows = selection['readers']
    if (selection['criterion'] != readers.CRITERION or selection['outcome'] != 'SELECTED'
            or len(rows) != wl.READERS or len({row['reader'] for row in rows}) != wl.READERS
            or [row['index'] for row in rows] != list(range(wl.READERS))):
        raise ValueError('complete frozen reader manifest required')
    capture = ordered_capture(core_feed.wire())
    placeholder = ['00000000-0000-0000-0000-000000000001']
    for row in rows:
        reader, groups = row['reader'], row['groups']
        allowed = frozenset(service for service, grants in permissions(reader, origin).items()
            if 'readAll' in grants)
        actual = {}
        for item, kind in zip(capture['requests'][:3], ('main', 'reactions', 'comments'), strict=True):
            payload = core_feed.payload(item['payload'], '', groups, None if kind == 'main' else placeholder)
            services = safe_query.query_services(payload['sql'], allowed)
            actual[kind] = {service: readable(reader, service, True, payload['groups']) for service in services}
        if sorted(actual['main'].get('posts', [])) != groups:
            raise ValueError('frozen Following scope disagrees with current posts authority')
        yield dict(index=row['index'], reader=reader, groups=groups,
            actual_readable_by_kind=actual, static_billboards=True)


def apply_billboards(rows, setup):
    """Use the settled setup ledger; new page identities are genuinely unpinned."""
    keys = {tuple(record['post']) for record in setup['posts']}
    if any('ad' in row or 'node_ad' in row for row in rows):
        raise ValueError('canonical oracle rows must not contain serving-produced ads')
    no_placement = [dict(post=list(ads.key(row)), placement='none', ad=None) for row in rows
        if ads.key(row) not in keys]
    return ads.expected_rows(rows, dict(posts=[*setup['posts'], *no_placement]))


def source_binding(selection_file, billboard_file):
    return dict(selection_sha256=digest(selection_file), billboard_sha256=digest(billboard_file),
        source_sha256=digest(Path(__file__)), canonical_source_sha256=digest(Path(__file__).with_name('arm_f_reference.py')))


def build(root):
    """Batch one process over 150 scopes, saving a source-bound receipt per page."""
    from app.v3.services import clickhouse as ch
    from arm_f_reference import build as canonical_reference

    root = Path(root)
    selection_file = root / 'selection.json'
    billboard_file = root / 'settled-billboards.json'
    selection, billboards = read(selection_file), read(billboard_file)
    binding = source_binding(selection_file, billboard_file)
    result = []
    for profile in profiles(selection, origin=selection['origin'], permissions=ch.get_app_permissions,
            readable=ch.readable_groups):
        directory = root / f"reader-{profile['index']:03d}"
        directory.mkdir(mode=0o700, exist_ok=True)
        packet = directory / 'oracle.json'
        if packet.exists():
            evidence = read(packet)
            if (evidence['binding'] != binding or evidence['profile'] != profile
                    or evidence['canonical_receipt_sha256'] != digest(directory / 'summary.json')
                    or evidence['canonical_response_sha256'] != digest(directory / 'expected.json')):
                raise ValueError('recorded reader oracle cannot be reused on changed inputs')
        else:
            save(directory / 'input.json', profile)
            canonical_reference(directory)
            value = read(directory / 'expected.json')
            if 'X-Amz-Signature' in json.dumps(value):
                raise ValueError('signed-media oracle is outside the text-only workload')
            evidence = dict(binding=binding, profile=profile, ids=value['ids'],
                canonical_receipt_sha256=digest(directory / 'summary.json'),
                canonical_response_sha256=digest(directory / 'expected.json'),
                rows=apply_billboards(value['rows'], billboards),
                followups=[{'rows': part, 'count': len(part)} for part in value['followups']],
                views_readable_groups=value['views_readable_groups'])
            save(packet, evidence)
        result.append(dict(reader=profile['reader'], index=profile['index'], sha256=digest(packet)))
        print('[dau-oracle] banked reader index', profile['index'], flush=True)
    save(root / 'oracle-index.json', dict(binding=binding, readers=result, load_windows='NOT_RUN'))


def prepare(root, session, settled_ledger):
    """Controller-side entry: launch the pinned canonical process, never HTTP."""
    output = root / 'dau-reader-oracles'
    output.mkdir(mode=0o700, exist_ok=True)
    admitted_selection = root / 'dau-diverse-reader-selection.json'
    selection = output / 'selection.json'
    ledgers = output / 'settled-billboards.json'
    if selection.exists():
        if digest(selection) != digest(admitted_selection):
            raise ValueError('saved oracle batch uses a different reader manifest')
    else:
        shutil.copyfile(admitted_selection, selection)
    if ledgers.exists():
        if read(ledgers) != settled_ledger:
            raise ValueError('saved oracle batch uses a different billboard ledger')
    else:
        save(ledgers, settled_ledger)
    if not (output / 'oracle-index.json').exists():
        restore.command(session.compose, session.env, 'run', '--rm', '-T', '--no-deps',
            '-v', str(output) + ':/dau-reader-oracles', 'api', 'uv', 'run', 'python',
            '/research/dau_sustain_reference.py', '/dau-reader-oracles', timeout=7200)
    index = read(output / 'oracle-index.json')
    if index['binding'] != source_binding(selection, ledgers):
        raise ValueError('oracle index does not match the frozen inputs and executing source')
    census = read(selection)['readers']
    if len(index['readers']) != wl.READERS or len(census) != wl.READERS:
        raise ValueError('incomplete reader oracle index')
    for selected, expected in zip(census, index['readers'], strict=True):
        receipt = output / f"reader-{selected['index']:03d}" / 'oracle.json'
        if (selected['reader'], selected['index'], digest(receipt)) != (
                expected['reader'], expected['index'], expected['sha256']):
            raise ValueError('reader oracle index no longer matches its frozen packets')
    return index


if __name__ == '__main__':
    import sys
    build(Path(sys.argv[1]))
