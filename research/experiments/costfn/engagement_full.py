"""Execute the operator's26.x A–D programme on one explicitly bound DO lease."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import time

from arm_f_failure import operation
from arm_f_http import HTTP
from arm_f_native import save
import arm_f_reads as reads
import core_feed
import engagement_cells as cells
import engagement_events as events
import engagement_hot
import engagement_hot_read
import engagement_modern as modern
import engagement_programme as programme
import engagement_projection
import engagement_queries as queries
import engagement_ref as refs
import engagement_restore
import engagement_setup
import arm_satellite_counts as counts
import restore_realism as restore


def metric(value):
    if 'elapsed_ms' in value:
        return {key: value[key] for key in ('elapsed_ms', 'read_rows', 'read_bytes')}
    return dict(read_rows=int(value.get('read_rows', 0)), read_bytes=int(value.get('read_bytes', 0)),
        native_ms_sum_not_wall=int(value.get('native_ms_sum_not_wall', value.get('native_ms', value.get('query_duration_ms', 0)))),
        queries=int(value.get('queries', 1)))


def totals(samples):
    result = []
    for sample in samples:
        native = sample['native']
        stages = {}
        for request in sample['request_ids']:
            path = Path(sample['_cell']) / 'F-stages' / (request + '.jsonl')
            for line in path.read_text().splitlines():
                row = json.loads(line)
                stages[row['query_id']] = row['stage']
        table = {}
        for row in native:
            entry = table.setdefault(stages[row['query_id']], dict(read_rows=0, read_bytes=0, native_ms=0, queries=0))
            for field, column in (('read_rows', 'read_rows'), ('read_bytes', 'read_bytes'), ('native_ms', 'query_duration_ms')):
                entry[field] += int(row[column])
            entry['queries'] += 1
        size = sum(int(row['read_bytes']) for row in native)
        result.append(dict(phase=sample['phase'], elapsed_ms=sample['elapsed_ms'], parity=sample['parity'],
            read_rows=sum(int(row['read_rows']) for row in native), read_bytes=size, stages=table,
            below_500ms=sample['elapsed_ms'] < 500, below_25MB=size < 25_000_000,
            scope='ONE_COMPLETE_HTTP_SEQUENCE_NOT_P95_OR_WHOLE_ARM_ACCEPTANCE'))
    return result


class Actions:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.approval = json.loads((self.root / 'admission.json').read_bytes())
        modern.admitted(self.approval, modern.arm_t.digitalocean_id())
        self.expected = {}
        self.aggregate_ready = False

    def checkpoint(self, stage, result):
        save(self.root / 'checkpoint.json', dict(stage=stage, outcome=result['outcome'],
            directive=modern.DIRECTIVE, engine=modern.ENGINE, deadline_utc=self.approval['deadline_utc']))
        self.comparisons()

    def comparisons(self):
        history = json.loads((Path(__file__).parent / 'evidence/arm-f-persistent-20261117/ordinary-k20-read-and-cleanup.json').read_bytes())
        old = {key: metric(value) for key, value in history['measured_stage_totals'].items()}
        old['complete_http'] = metric(next(row for row in history['complete_sequences'] if row['phase'] == 'measured'))
        baseline_path = self.root / 'A-baseline-complete.json'
        baseline = {}
        if baseline_path.exists():
            measured = next(row for row in json.loads(baseline_path.read_bytes()) if row['phase'] == 'measured')
            baseline = {**{key: metric(value) for key, value in measured['stages'].items()}, 'complete_http': metric(measured)}
        tables = {}
        for name in ('A-projection-old-semantics', 'C-uniform'):
            path = self.root / (name + '-complete.json')
            treated = {}
            if path.exists():
                value = next(row for row in json.loads(path.read_bytes()) if row['phase'] == 'measured')
                treated = {**{key: metric(item) for key, item in value['stages'].items()}, 'complete_http': metric(value)}
            tables[name] = programme.table(old, baseline, treated)
        views = self.root / 'cells/B-aggregate/measured.json'
        if views.exists():
            value = json.loads(views.read_bytes())
            raw_path = self.root / 'cells/B-raw/measured.json'
            raw = metric(json.loads(raw_path.read_bytes())['view_native']) if raw_path.exists() else 'NO_VALID_RAW_CONTROL'
            tables['B-views-only'] = programme.table({'views': old['views']},
                {'views': raw}, {'views': metric(value['view_native'])})
        save(self.root / 'three-column-stage-tables.json', dict(tables=tables,
            named_unoptimized_remainder=['preparation', 'unclassified'],
            missing_complete_results_are_not_stage_passes=True,
            same_engine_instrumentation='raw and aggregate views both independently validated outside measured HTTP',
            historical_instrumentation='24.8 history included its same-snapshot raw differential aggregates'))

    def stage(self, stage, results):
        if modern.remaining(self.approval) < 120:
            raise TimeoutError('original lease cleanup margin; stage not started')
        with operation(self.root, stage=stage, engine=modern.ENGINE):
            return {
                'restore': self.restore, 'read-setup': self.read_setup, 'infrastructure': self.infrastructure,
                'A-baseline': self.baseline, 'A-projection': self.projection,
                'A-treated': self.projected, 'A-decomposition': self.decompose,
                'B-diagnostic': self.diagnostic, 'B-aggregate': self.aggregate,
                'C-migration': self.migrate, 'C-complete': self.uniform,
                'C-paired': self.paired, 'D-fat': self.hot,
            }[stage]()

    def restore(self):
        started = time.perf_counter()
        if self.approval.get('restored_snapshot_id'):
            engagement_restore.stop_snapshot_processes()
        rehearsal = self.root / 'modern-native-rehearsal'
        rehearsal.mkdir(mode=0o700)
        (rehearsal / 'admission.json').write_bytes((self.root / 'admission.json').read_bytes())
        from arm_satellite_reconcile_native import run as native_rehearsal
        native_rehearsal(rehearsal, engagement_only=True, engagement_engine=modern.ENGINE)
        restored = engagement_restore.run(self.root)
        return dict(restore_source=restored['source'], restore_seconds=restored['restore_seconds'],
            total_restore_and_rehearsal_seconds=time.perf_counter() - started, engine=modern.ENGINE,
            snapshot_id=restored.get('snapshot_id'))

    def reference(self, profile, name):
        return reads.reference(self.root, profile=profile, name=name)

    def read_setup(self):
        restored = json.loads((self.root / 'modern-restore.json').read_bytes())
        fixture = engagement_setup.profiles(self.root, restored_fixture=restored.get('fixture'))
        for name in ('ordinary', 'fixture'):
            profile = json.loads((self.root / ('profile-' + name + '.json')).read_bytes())
            self.expected[name] = self.reference(profile, 'reference-' + name)
        coverage = reads.fixture_coverage(fixture, self.expected['fixture'])
        save(self.root / 'modern-fixture-coverage.json', coverage)
        return dict(fixture_coverage=coverage,
            baseline_definition='existing captured Config F complete path, old semantics/counters, no ref_sorted or events aggregate')

    def infrastructure(self):
        return dict(generation=engagement_setup.infrastructure(self.root, 'before-projection', initial=True))

    def complete(self, name, mode, *, profile='ordinary', serving='F_DOCUMENT_STREAM_V1'):
        samples = cells.run_complete(self.root, name, profile, mode, self.expected[profile],
            serving_mode=serving, aggregate=self.aggregate_ready)
        for sample in samples:
            sample['_cell'] = str(self.root / 'cells' / name)
        result = totals(samples)
        save(self.root / (name + '-complete.json'), result)
        return result

    def baseline(self):
        return self.complete('A-baseline', 'baseline')

    def projection(self):
        cells.stop(self.root)
        session = modern.Session(self.root)
        before, _ = counts.generation(session)
        value = engagement_projection.install(session, 'documents', self.root)
        after, _ = counts.generation(session)
        if after != before and (self.root / 'fanout-template').exists():
            engagement_setup.infrastructure(self.root, 'after-projection')
        value['physical_generation_changed'] = before != after
        return value

    def projected(self):
        return dict(complete=self.complete('A-projection-old-semantics', 'projection'),
            document_counts='direct captured queries through ref_sorted where old reference semantics permit', views='UNAFFECTED_RAW')

    def decompose(self):
        session = modern.Session(self.root)
        result = []
        seen = set()
        for folder in sorted((self.root / 'cells').glob('A-*/F-stages')):
            for file in folder.glob('*.jsonl'):
                for line in file.read_text().splitlines():
                    row = json.loads(line)
                    if row.get('stage') != 'counts_embedded_in_resolution' or row['sql_sha256'] in seen:
                        continue
                    seen.add(row['sql_sha256'])
                    sql = (folder / (row['sql_sha256'] + '.sql')).read_text()
                    split = queries.mixed_components(sql)
                    record = dict(full_query_sha256=row['sql_sha256'], additive=False, components=[])
                    for index, component in enumerate(split['components']):
                        values, query_id = session.rows('isolated_mixed_count_' + str(len(result)) + '_' + str(index), component, measured=True)
                        record['components'].append(dict(sql=component, query_id=query_id, native=session.native(query_id, measured=True),
                            returned_rows=len(values)))
                    result.append(record)
        save(self.root / 'mixed-decomposition.json', result)
        if not result or any(not row['components'] for row in result):
            raise ValueError('mixed decomposition unavailable; an empty list is not a measurement')
        return dict(queries=result, attribution='isolated count components; no subtractive/additive per-table byte attribution')

    def diagnostic(self):
        return asyncio.run(self.views('B-raw', 'raw', diagnostic=True))

    async def views(self, name, mode, *, diagnostic=False):
        cells.stop(self.root)
        cell = cells.boot_views(self.root, name, mode)
        session = modern.Session(self.root)
        http = HTTP(cell, session, cell / 'http')
        profile = json.loads((self.root / 'profile-ordinary.json').read_bytes())
        expected = self.expected['ordinary']
        result = []
        try:
            token = await http.login(profile['reader'])
            for phase in ('warmup', 'measured'):
                request = http.capture['requests'][3]
                payload = core_feed.payload(request['payload'], token, profile['groups'], expected['ids'])
                response, record = await http.post(request['path'], payload, origin=http.manifest['origin'])
                raw = reads.visible_views(session, expected['ids'], expected['views_readable_groups'], phase + '_independent_views')
                if response != raw and not diagnostic:
                    raise ValueError('independent complete raw event/scope parity mismatch')
                native = http.native([record['request_id']], phase)
                observation = http.observation(record['request_id'])
                matches = [row for row in native if row['query_id'] == observation['fanout_view_checks'][0]['query_id']]
                if len(matches) != 1:
                    raise ValueError('views native query identity ambiguity')
                sample = dict(phase=phase, elapsed_ms=record['elapsed_ms'], native=native, parity='PASS' if response == raw else 'FAIL',
                    view_native=matches[0], request_id=record['request_id'],
                    true_event_count=sum(value['impressions'] for value in raw.values()))
                save(cell / (phase + '.json'), sample)
                result.append(sample)
                if diagnostic and (phase == 'measured' or response != raw):
                    stages = [json.loads(line) for line in (cell / 'F-stages' / (record['request_id'] + '.jsonl')).read_text().splitlines()]
                    stage = next(row for row in stages if row['query_id'] == matches[0]['query_id'])
                    sql = (cell / 'F-stages' / (stage['sql_sha256'] + '.sql')).read_text()
                    value = events.diagnostic(sql, {key: int(matches[0][key]) for key in ('read_rows', 'read_bytes', 'exception_code')},
                        sample['true_event_count'], sum(value['impressions'] for value in response.values()))
                    save(self.root / 'views-diagnostic26.json', value)
                    if response != raw:
                        break
            return result
        finally:
            try:
                cells.harvest(self.root, cell, http)
            except Exception as error:
                save(cell / 'native-collection-failure.json', __import__('arm_f_failure').details(error))
            finally:
                await http.close()
                cells.stop(self.root)

    def aggregate(self):
        diagnosis = json.loads((self.root / 'views-diagnostic26.json').read_bytes())
        if diagnosis['cause'] != 'RAW_EVENT_AGGREGATION':
            return self.investigate(diagnosis)
        cells.stop(self.root)
        session = modern.Session(self.root)
        started = time.perf_counter()
        for index, sql in enumerate(events.build(diagnosis, writers_stopped=True)):
            if index == 2:
                sql += ' SETTINGS optimize_aggregation_in_order=1'
            _, query_id = session.query('events_aggregate_build_' + str(index), sql, setup_seconds=1800)
            save(self.root / ('aggregate-build-' + str(index) + '.json'), dict(query_id=query_id, native=session.native(query_id)))
        session.query('settle_events_aggregate', 'OPTIMIZE TABLE content_events_aggregated FINAL', setup_seconds=1800)
        seeded_seconds = time.perf_counter() - started
        samples = asyncio.run(self.views('B-aggregate', 'aggregate'))
        self.aggregate_ready = True
        return dict(seed_seconds=seeded_seconds, views=samples)

    def investigate(self, diagnosis):
        session = modern.Session(self.root)
        page = self.expected['ordinary']
        selected, groups = refs.targets(page['ids']), refs.targets(page['views_readable_groups'])
        census, census_id = session.rows('views_history_multiplicity', 'SELECT doc_id,count() AS history_links,uniqExact(group_id) AS groups '
            'FROM doc_groups WHERE doc_id IN (' + selected + ') AND group_id IN (' + groups + ') GROUP BY doc_id', measured=True)
        native = session.native(census_id, measured=True)
        corrected_sql = events.read(page['ids'], 'posts', page['views_readable_groups'], aggregate=False)
        values, corrected_id = session.rows('views_winners_only_remeasurement', corrected_sql, measured=True)
        corrected_native = session.native(corrected_id, measured=True)
        raw = reads.visible_views(session, page['ids'], page['views_readable_groups'], 'views_independent_investigation_oracle')
        actual = {row['doc_id']: dict(impressions=int(row['impressions']), reach=int(row['reach'])) for row in values}
        value = dict(branch=diagnosis['cause'], aggregate_built=False, history_census=census, census_native=native,
            winners_only_native=corrected_native, winners_only_parity='PASS' if actual == raw else 'FAIL',
            interpretation='history multiplicity is not automatically join fanout; no forced aggregate branch')
        save(self.root / 'views-multiplicity-investigation.json', value)
        return value

    def migrate(self):
        cells.stop(self.root)
        session = modern.Session(self.root)
        checks, statements = refs.migration()
        verdicts = {}
        for name, sql in checks.items():
            rows, query_id = session.rows('migration_' + name, sql, setup_seconds=900)
            verdicts[name] = dict(n=int(rows[0]['n']), query_id=query_id)
            save(self.root / 'migration-checks26.json', verdicts)
            if verdicts[name]['n']:
                raise ValueError('migration source check nonzero: ' + name)
        for index, sql in enumerate(statements[:-len(refs.projection('engagement_documents'))]):
            session.query('migration_setup_' + str(index), sql, setup_seconds=1200)
        install = (engagement_projection.install_rebuild if self.approval.get('engagement_completion_admitted') is True
            else engagement_projection.install)
        install(session, 'engagement_documents', self.root)
        batches = []
        for batch in range(32):
            rows, query_id = session.rows('migration_roundtrip_' + str(batch), refs.roundtrip_check(batch), setup_seconds=900)
            save(self.root / ('migration-roundtrip-' + str(batch) + '.json'), dict(query_id=query_id, rows=rows))
            if int(rows[0]['mismatches']):
                raise ValueError('exact inverse multiset parity mismatch')
            batches.append(batch)
        parts, _ = session.rows('copy_current_parts', "SELECT name,toString(rows) AS rows,toString(data_version) AS data_version FROM system.parts "
            "WHERE database='web10' AND table='engagement_documents' AND active ORDER BY name")
        proof = dict(parity='PASS', batches=batches, parts_sha256=hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest())
        save(self.root / 'copy-proof.json', proof)
        return proof

    def uniform(self):
        return dict(aggregate_views=self.aggregate_ready, complete=self.complete('C-uniform', 'uniform'))

    def paired(self):
        result = {}
        for mode in ('P_DOCUMENT_STREAM_V1', 'F_DOCUMENT_STREAM_V1'):
            try:
                result[mode] = dict(outcome='PASS', samples=self.complete('C-paired-' + mode, 'uniform', profile='fixture', serving=mode))
            except Exception as error:
                result[mode] = dict(outcome='STOP', **__import__('arm_f_failure').details(error))
        save(self.root / 'C-paired-comparison.json', result)
        if any(value['outcome'] != 'PASS' for value in result.values()):
            raise ValueError('paired comparison incomplete; both independent mode receipts preserved')
        return result

    def hot(self):
        cells.stop(self.root)
        session = modern.Session(self.root)
        plan = engagement_hot.seed(session, self.root)
        present, _ = session.rows('hot_aggregate_available', "SELECT count() AS n FROM system.tables WHERE database='web10' "
            "AND name IN ('content_events_aggregated','content_events_aggregated_insert')")
        available = int(present[0]['n']) == 2 and plan['views_seed_outcome'] == 'PASS'
        return dict(plan=plan, aggregate_available=available,
            samples=engagement_hot_read.run(self.root, plan, aggregate=available),
            no_counter_retirement_without_measured_hot_evidence=True)


def run(root):
    modern.install_sessions()
    actions = Actions(root)
    try:
        return programme.run(actions, Path(root) / 'programme26')
    finally:
        if (Path(root) / 'restore.json').exists():
            value = json.loads((Path(root) / 'restore.json').read_bytes())
            compose = restore.commands(value['project'], value['api_port'], value['overlay'])
            env = {**__import__('os').environ, 'API_PORT': str(value['api_port']),
                'COSTFN_RESEARCH_DIR': str(Path(__file__).parent), 'COSTFN_REPO_DIR': str(Path(__file__).resolve().parents[3])}
            restore.command(compose, env, 'stop', timeout=120)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    run(parser.parse_args().root)
