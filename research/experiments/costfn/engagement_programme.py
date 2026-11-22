"""A–D receipt ordering and independent-stage continuation, no engine on import."""
from datetime import UTC, datetime
from pathlib import Path

from arm_f_failure import details, save

ORDER = ('restore', 'read-setup', 'infrastructure', 'A-baseline', 'A-projection', 'A-treated', 'A-decomposition',
    'B-diagnostic', 'B-aggregate', 'C-migration', 'C-complete', 'C-paired', 'D-fat')
DEPENDENCIES = {
    'restore': (), 'read-setup': ('restore',), 'infrastructure': ('read-setup',),
    'A-baseline': ('infrastructure',), 'A-projection': ('restore',),
    'A-treated': ('A-projection', 'infrastructure'), 'A-decomposition': ('restore',),
    'B-diagnostic': ('read-setup',), 'B-aggregate': ('B-diagnostic',),
    'C-migration': ('A-projection',), 'C-complete': ('C-migration', 'infrastructure'),
    'C-paired': ('C-migration', 'infrastructure'), 'D-fat': ('restore',),
}


def run(actions, output):
    output = Path(output)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    results = {}
    for stage in ORDER:
        blocked = [name for name in DEPENDENCIES[stage] if results[name]['outcome'] != 'PASS']
        if blocked:
            result = dict(outcome='BLOCKED', blocked_by=blocked, independent_stages_not_skipped=True)
        else:
            try:
                value = actions.stage(stage, results)
                result = dict(outcome='PASS', evidence=value)
            except Exception as error:
                result = dict(outcome='STOP', **details(error))
        result.update(stage=stage, recorded_utc=datetime.now(UTC).isoformat())
        results[stage] = result
        save(output / (stage + '.json'), result)
        save(output / 'summary.json', dict(stages=results, complete_feed_pass=False,
            historical_F_FAIL_preserved=True, ordinary_runtime_changed=False))
        print('[engagement26]', stage, result['outcome'], flush=True)
        actions.checkpoint(stage, result)
    return results


def table(history, baseline, treated):
    """No sums across unrelated stages or invented decomposition fractions."""
    stages = sorted(set(history) | set(baseline) | set(treated))
    return {stage: {'history_24_8_PR1578': history.get(stage, 'UNAVAILABLE'),
        'baseline_26_x': baseline.get(stage, 'UNREACHED'), 'treated_26_x': treated.get(stage, 'UNREACHED')}
        for stage in stages}
