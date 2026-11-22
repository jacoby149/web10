"""Source-bound same-lease continuation; never reseed or replace original STOPs."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path

from arm_f_failure import details, operation
from arm_f_native import save
import engagement_full as full
import engagement_hot_read
import engagement_modern as modern
import engagement_projection


def run(root, output, *, reads_only=False):
    root, output = Path(root).resolve(), Path(output).resolve()
    output.mkdir(mode=0o700, exist_ok=False)
    modern.install_sessions()
    actions = full.Actions(root)
    session = modern.Session(root)
    original = json.loads((root / 'programme26/summary.json').read_bytes())
    if original['stages']['B-aggregate']['outcome'] != 'STOP' or original['stages']['D-fat']['outcome'] != 'STOP':
        raise ValueError('this continuation requires the preserved original aggregate/hot STOPs')
    result = dict(original_summary_sha256=hashlib.sha256((root / 'programme26/summary.json').read_bytes()).hexdigest(),
        original_deadline_utc=actions.approval['deadline_utc'], droplet_id=actions.approval['droplet_id'],
        reseeded=False, baseline='UNREACHED_BEFORE_PROJECTION; NO_RETROACTIVE_UNTREATED_BASELINE', stages={})
    for profile in ('ordinary', 'fixture'):
        actions.expected[profile] = json.loads((root / ('reference-' + profile) / 'expected.json').read_bytes())

    def stage(name, action):
        if modern.remaining(actions.approval) < 120:
            result['stages'][name] = dict(outcome='UNREACHED_DEADLINE_MARGIN')
        else:
            try:
                with operation(output, stage=name):
                    evidence = action()
                result['stages'][name] = dict(outcome='PASS', evidence=evidence)
            except Exception as error:
                result['stages'][name] = dict(outcome='STOP', **details(error))
        save(output / (name + '.json'), result['stages'][name])
        save(output / 'summary.json', result)
        print('[engagement-continuation]', name, result['stages'][name]['outcome'], flush=True)

    def settle_receipt(label, query_id):
        native = session.native(query_id)
        if int(native['exception_code']):
            raise ValueError('original setup query did not finish successfully: ' + label)
        return dict(original_query_id=query_id, native=native, original_transport_STOP_preserved=True)

    def projection():
        settled = settle_receipt('projection', 'fanout-f-6262230727994a81b9168e02cb0b4b05')
        session.query('continuation_freeze_documents', 'SYSTEM STOP MERGES documents')
        return dict(**settled, coverage=engagement_projection.coverage(session, 'documents'))

    def aggregate():
        settled = settle_receipt('aggregate', 'fanout-f-cfe405f26981426b90fa008be25812aa')
        values = asyncio.run(actions.views('B-aggregate-continuation', 'aggregate'))
        actions.aggregate_ready = True
        return dict(**settled, views=values, seeded_again=False)

    def hot():
        plan = json.loads((root / 'hot-fixture/seeded.json').read_bytes())
        return dict(samples=engagement_hot_read.run(root, plan, aggregate=actions.aggregate_ready,
            name='D-hot-continuation'), fixture_reused=True)

    try:
        if reads_only:
            proof = json.loads((root / 'copy-proof.json').read_bytes())
            previous = json.loads((root.parent / 'continuation-results/summary.json').read_bytes())
            if proof.get('parity') != 'PASS' or proof.get('batches') != list(range(32)):
                raise ValueError('read continuation requires completed exact migration proof')
            actions.aggregate_ready = previous['stages']['B-aggregate']['outcome'] == 'PASS'
            result['migration_reused_without_rebuild'] = True
            stage('C-complete', lambda: actions.complete('C-uniform-continuation', 'uniform'))
            for mode in ('P_DOCUMENT_STREAM_V1', 'F_DOCUMENT_STREAM_V1'):
                stage('C-paired-' + mode, lambda mode=mode: actions.complete(
                    'C-paired-continuation-' + mode, 'uniform', profile='fixture', serving=mode))
            return result
        stage('projection-completion', projection)
        stage('B-aggregate', aggregate)
        stage('D-fat', hot)
        if result['stages']['projection-completion']['outcome'] == 'PASS':
            stage('C-migration', actions.migrate)
            if result['stages']['C-migration']['outcome'] == 'PASS':
                stage('C-complete', actions.uniform)
                stage('C-paired', actions.paired)
        return result
    finally:
        save(output / 'summary.json', result)
        full.cells.stop(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--reads-only', action='store_true')
    args = parser.parse_args()
    run(args.root, args.output, reads_only=args.reads_only)
