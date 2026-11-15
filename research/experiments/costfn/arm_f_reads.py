"""Full-response canonical/P/F parity and predeclared fresh-restore read trials."""
import json
from pathlib import Path

import arm_f_environment as environment
from arm_f_gates import digest, read_trial, read_trials, SAMPLES, TRIALS
from arm_f_http import HTTP
from arm_f_native import save
from arm_f_runtime import Session
from arm_satellite_ad_parity import validate_main
from arm_satellite_sql import literal as q
import restore_realism as restore


def reference(root, *, profile=None, name='F-reference'):
    root = Path(root)
    directory = root / name
    directory.mkdir(mode=0o700, exist_ok=False)
    profile = profile or json.loads((root / 'profile/inventory.json').read_bytes())
    save(directory / 'input.json', profile)
    session = Session(root)
    # A separate canonical-only process. No token or treatment output supplies
    # expected identities. Native oracle setup is never counted as a read sample.
    restore.command(session.compose, session.env, 'run', '--rm', '-T', '--no-deps',
        '-v', str(directory) + ':/fanout-reference', 'api', 'uv', 'run', 'python',
        '/research/arm_f_reference.py', '/fanout-reference', timeout=1200)
    expected = json.loads((directory / 'expected.json').read_bytes())
    if 'X-Amz-Signature' in json.dumps(expected):
        raise ValueError('signed-media oracle requires exact media verification, never omission')
    return expected


def rowset(rows):
    return sorted(json.dumps(row, sort_keys=True) for row in rows)


def compare(sample, expected, observation):
    validate_main(sample['rows'], expected['rows'], expected['eligible_ads'])
    for actual, wanted in zip(sample['followups'][:2], expected['followups'], strict=True):
        if rowset(actual.get('rows', [])) != rowset(wanted):
            raise ValueError('complete canonical engagement follow-up mismatch')
    checks = observation.get('fanout_view_checks', [])
    if len(checks) != 1:
        raise ValueError('exact same-snapshot canonical view check missing')
    values = {doc: {'impressions': count, 'reach': reach} for doc, count, reach in checks[0]['values']}
    actual = sample['followups'][2]
    if actual != values:
        raise ValueError('HTTP views differ from checked canonical snapshot')
    if set(values) - set(expected['ids']):
        raise ValueError('unrequested view values')


def views(session, ids, label):
    rows, _ = session.rows(label, 'SELECT doc_id,count() AS impressions,uniqExact(reader_key) AS reach FROM content_events '
        'WHERE service=\'posts\' AND event_type=\'delivery\' AND doc_id IN (' + ','.join(q(doc) for doc in sorted(set(ids)))
        + ') GROUP BY doc_id', setup_seconds=120)
    return {row['doc_id']: {'impressions': int(row['impressions']), 'reach': int(row['reach'])} for row in rows}


async def sequences(root, output, *, count=SAMPLES, expected=None, require_mode=None, profile=None):
    root, output = Path(root), Path(output)
    session = Session(root)
    profile = profile or json.loads((root / 'profile/inventory.json').read_bytes())
    expected = expected or reference(root)
    http = HTTP(root, session, output)
    samples = []
    try:
        token = await http.login(profile['reader'])
        for index in range(count + 1):
            before = views(session, expected['ids'], 'before_' + str(index))
            sample = await http.sequence(token, profile['groups'], phase='warmup' if index == 0 else 'measured')
            observation = http.observation(sample['request_ids'][-1])
            compare(sample, expected, observation)
            # In quiet cells no other readers run. This second independent query
            # certifies the live-delivery delta, not a precomputed view snapshot.
            after = views(session, expected['ids'], 'after_' + str(index))
            if sample['followups'][2] != after:
                raise ValueError('quiet independent canonical views mismatch')
            for doc in expected['ids']:
                previous, current = before.get(doc, {'impressions': 0, 'reach': 0}), after.get(doc, {'impressions': 0, 'reach': 0})
                if not (0 <= current['reach'] - previous['reach'] <= 1
                        and 0 <= current['impressions'] - previous['impressions'] <= expected['ids'].count(doc)):
                    raise ValueError('independent delivery delta outside actual returned multiplicity')
            if require_mode and sample['path_mode'] != require_mode:
                raise ValueError('quiet gate did not exercise the declared P/F path')
            sample['native'] = http.native(sample['request_ids'], 'sequence_' + str(index))
            sample['parity'] = 'PASS'
            # Persist metadata/digests only. Actual responses/oracle stay private
            # in this host's reference directory, never copied into Git receipts.
            public = {key: value for key, value in sample.items() if key not in ('rows', 'followups')}
            samples.append(public)
            save(output / 'samples.json', samples)
            if index and sum(int(query['read_bytes']) for query in sample['native']) >= 25_000_000 and count == SAMPLES:
                raise ValueError('complete-response byte budget missed; stop before another trial')
    except BaseException as error:
        save(output / 'failure.json', dict(failure_class=type(error).__name__, completed_samples=samples,
            requests=http.records, parity='NOT_ESTABLISHED'))
        raise
    finally:
        await http.close()
    return samples


async def identical_contract(root, output):
    root, output = Path(root), Path(output)
    fixture = json.loads((root / 'fixture.json').read_bytes())
    expected = reference(root)
    identities = [(row['author_key'], row['doc_id']) for row in expected['rows']]
    if (sum(doc == fixture['collision_id'] for _, doc in identities) != 2
            or not any(doc in fixture['shared_ids'] for _, doc in identities)
            or not any(doc == fixture['large_front_id'] for _, doc in identities)):
        raise ValueError('tie/shared/full-key/mixed-lane fixture did not reach the actual page')
    results = {}
    for mode in ('P_DOCUMENT_STREAM_V1', 'F_DOCUMENT_STREAM_V1'):
        environment.boot(root, mode)
        try:
            samples = await sequences(root, output / mode, count=1, expected=expected, require_mode=mode)
            results[mode] = samples
        finally:
            environment.stop(root)
    return {'verified': True, 'same_contract': True, 'modes': results, 'fixture_sha256': digest(root / 'fixture.json')}


async def performance(parent, output, *, populated=False, seed=None):
    parent, output = Path(parent), Path(output)
    results, final_root = [], None
    for index in range(TRIALS):
        root = environment.fresh(parent, ('populated-' if populated else 'quiet-') + str(index))
        try:
            environment.prepare(root, parent)
            if populated:
                if seed is None:
                    raise ValueError('full population builder must run on EVERY fresh populated trial')
                seed(root)
            environment.boot(root)
            samples = await sequences(root, output / ('trial-' + str(index)), require_mode='F_DOCUMENT_STREAM_V1')
            results.append(dict(fresh_restore_sha256=digest(root / 'restore.json'), root=str(root), samples=samples))
            save(output / 'trials.json', results)
            read_trial(results[-1])  # Do not pay for a second restore after a failed first trial.
        finally:
            environment.stop(root, engine=True)
        if index < TRIALS - 1:
            environment.discard_trial(root)
        else:
            final_root = root
    verdicts = read_trials(results)
    return dict(verified=True, trials=results, verdicts=verdicts, final_root=str(final_root))


def profile_from_sample(http, sample, reader, groups):
    by_kind = {}
    for kind, request in zip(('main', 'reactions', 'comments'), sample['request_ids'][:3], strict=True):
        rows = http.observation(request).get('fanout_scopes', [])
        candidates = [row for row in rows if row['is_main']] if kind == 'main' else [row for row in rows if set(row['readable']) == {kind}]
        if not candidates or any(row['reader'] != reader for row in candidates):
            raise ValueError('actual post-gate caller scope missing')
        by_kind[kind] = candidates[0]['readable']
    return dict(reader=reader, groups=groups, actual_readable_by_kind=by_kind)
