"""Row-model cell primitives. No provisioning, engine or import-time side effects.

Canonical JSON remains the INDEPENDENT source/oracle and control. It is never a
fallback inside the measured typed treatment. The caller supplies a source-bound
native measurement driver on the admitted DO host, after all-fixes banks.
"""
import hashlib
import math
from numbers import Real
from pathlib import Path

import row_model as model
from row_model_fence import DOMAINS

STAGES = ('uniform-K20-feed', 'paired-P-feed', 'paired-F-feed', 'ordinary-post-open', 'paired-post-open', 'fat-post-open')


def binding():
    names = ('row_model.py', 'row_model_ingest.py', 'row_model_sql.py', 'row_model_store.py',
        'row_model_fence.py', 'row_model_cell.py', 'row_model_build.py')
    return {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in names}


def require_banked_composition(summary):
    # Budget FAIL is a valid banked result. Missing parity/measurements is not.
    from engagement_composition import CELLS, GATES, gate
    stages = summary['stages']
    if stages.get('decomposition', {}).get('outcome') != 'PASS' or not stages['decomposition'].get('evidence'):
        raise ValueError('banked all-fixes per-statement accounting required')
    for name in GATES:
        stage = stages['verify-' + name]
        if stage['outcome'] != 'PASS':
            raise ValueError('all-fixes required prechecks have not banked')
        gate(name, stage['evidence'])
    for name in CELLS:
        stage = stages[name]
        if stage['outcome'] != 'PASS':
            raise ValueError('all-fixes complete responses have not banked')
        samples = stage['evidence']
        if ({sample['phase'] for sample in samples} != {'warmup', 'measured'} or len(samples) != 2
                or any(sample.get('parity') != 'PASS' or not all(key in sample for key in ('read_rows', 'read_bytes', 'elapsed_ms'))
                    for sample in samples)):
            raise ValueError('actual complete all-fixes response accounting required before row-model measurement')


def verify_domains(reader, canonical, domains):
    """Expected documents come from canonical source, never pointer/value output.

    Every domain carries full identities. No missing-domain zero/default values
    can pass; deleted documents must actually be queried and compare to None.
    """
    if set(domains) != DOMAINS or any(not values for values in domains.values()):
        raise ValueError('all actual page/fat/sample/adversarial domains required')
    checked = {}
    for name, identities in domains.items():
        expected = canonical(identities)
        actual = reader(identities)
        if set(expected) != set(identities) or set(actual) != set(identities):
            raise ValueError('row-model/canonical verifier omitted required identities')
        for identity in identities:
            if not model.exact_equal(actual[identity], expected[identity]):
                raise ValueError('row-model canonical key/type parity mismatch: ' + name)
        checked[name] = [identity.row_id for identity in identities]
    return dict(parity='PASS', domains=checked, source_binding=binding())


def assembly_comparison(canonical, rows):
    """Same-order/order-of-magnitude flags per axis, never hidden in feed totals."""
    metrics = ('read_rows', 'read_bytes', 'elapsed_ms')
    if canonical.get('parity') != 'PASS' or rows.get('parity') != 'PASS':
        raise ValueError('exact parity is required before comparing assembly economics')
    ratios = {}
    for metric in metrics:
        control, treatment = canonical[metric], rows[metric]
        if (isinstance(control, bool) or isinstance(treatment, bool)
                or not isinstance(control, Real) or not isinstance(treatment, Real)
                or not math.isfinite(control) or not math.isfinite(treatment) or control < 0 or treatment < 0):
            raise ValueError('nonnegative actual assembly measurements required')
        ratios[metric] = treatment / control if control else None
    expensive = [key for key, ratio in ratios.items() if ratio is not None and ratio >= 10]
    verdict = ('MAXIMAL_REJECTED_ORDER_OF_MAGNITUDE' if expensive else
        'UNDEFINED_ZERO_CONTROL' if any(value is None for value in ratios.values()) else
        'SAME_ORDER_OF_MAGNITUDE_PAGE_SCALE_ONLY')
    return dict(ratios=ratios, order_of_magnitude_axes=expensive, verdict=verdict,
        assembly_stage_only=True, p95=False, production_acceptance=False,
        latency_scope='single warmed comparison, not a latency distribution')


def measure(actions, banked, verification):
    require_banked_composition(banked)
    if (verification.get('parity') != 'PASS' or verification.get('source_binding') != binding()
            or set(verification.get('domains', {})) != DOMAINS or not verification.get('native_fence_verified')
            or not verification.get('query_ids') or any(not v for v in verification['domains'].values())):
        raise ValueError('native complete model verification/fence must precede every assembly measurement')
    result = {}
    # Each control/treatment and failure is preserved by the action provider's
    # existing native ledger. No JSON control cost is arithmetically substituted.
    for name in STAGES:
        result[name] = []
        for phase in ('warmup', 'measured'):
            samples = {}
            for variant in ('canonical', 'rows'):
                try:
                    samples[variant] = actions.measure(name, variant, phase)
                except Exception as error:
                    from arm_f_failure import details
                    samples[variant] = dict(parity='INCOMPLETE', **details(error))
                actions.checkpoint(name, phase, variant, samples[variant])
            if all(sample['parity'] == 'PASS' for sample in samples.values()):
                samples['comparison'] = assembly_comparison(samples['canonical'], samples['rows'])
            result[name].append(dict(phase=phase, **samples))
    return result
