"""Adopt prepared metadata/paired scopes; one explicitly approved K20 count setup."""
import hashlib
import json
from pathlib import Path

import arm_f_infrastructure as infra
from arm_f_native import save
import arm_satellite_batch_run as batching
import arm_satellite_counts as counts
import arm_satellite_sql as typed
import engagement_certificates as certificates
import engagement_modern as modern
import engagement_restore
import engagement_setup


def initial_k20(root, session, generation):
    if session.operation.get('initial_k20_count_build_admitted') is not True:
        raise ValueError('Jacob18 November initial K20 setup exception required')
    output = Path(root) / 'initial-k20-count-setup'
    output.mkdir(mode=0o700, exist_ok=False)  # One setup, never a silent reentry.
    profile = json.loads((Path(root) / 'profile-ordinary.json').read_bytes())
    result = dict(**infra.common(session, generation), kind='INITIAL_K20_ONLY_OPERATOR_APPROVED',
        outcome='BUILDING', T1=infra.VERDICT, final_table=batching.FINAL, scopes=[], build_queries=[])
    targets = [row['doc_id'] for row in profile['reference_page']]
    for label in ('main', 'reactions', 'comments'):
        readable = profile['actual_readable_by_kind'][label]
        recipes = [recipe for recipe in counts.RECIPES if recipe.service in readable]
        mapping = {recipe.service: readable[recipe.service] for recipe in recipes}
        scope = typed.scope_key(profile['reader'], mapping, generation, recipes)
        boundaries = {service: counts.canonical_boundary(service, groups, profile['reader']) for service, groups in mapping.items()}
        built = batching.build_scope(session, output, result, label, scope, boundaries, recipes, 8)
        built.update(complete=True, groups_by_service=mapping,
            comparisons=batching.compare(session, scope, targets, recipes, generation, mapping, profile['reader']))
    result['outcome'] = 'INFRASTRUCTURE_BUILT_SPOTS_PASS'
    save(output / 'result.json', result)
    save(Path(root) / 'counts-ordinary.json', result)
    engagement_setup.presence(Path(root), output, session, 'ordinary', profile, generation, targets)


def run(root):
    root = Path(root)
    session = modern.Session(root)
    snapshot = engagement_restore.SNAPSHOT_ROOT
    old_profile = json.loads((snapshot / 'profile/inventory.json').read_bytes())
    paired = json.loads((root / 'profile-fixture.json').read_bytes())
    if old_profile['reader'] != paired['reader'] or old_profile['actual_readable_by_kind'] != paired['actual_readable_by_kind']:
        raise ValueError('prepared paired scopes differ from current canonical permissions')
    # Settle once BEFORE constructing the newly admitted ordinary count scopes.
    infra.settle_canonical(session)
    for table in infra.CANONICAL_TABLES:
        session.query('completion_freeze_' + table, 'SYSTEM STOP MERGES ' + table)
    generation, _ = counts.generation(session)
    initial_k20(root, session, generation)
    adopted = {}
    for source, target in {'counts-batch-p2/result.json': 'counts-fixture.json',
            'presence/result.json': 'presence-fixture.json', 'metadata/result.json': 'metadata/result.json',
            'metadata-parity/result.json': 'metadata-parity/result.json'}.items():
        path = snapshot / source
        value = json.loads(path.read_bytes())
        adopted[source] = hashlib.sha256(path.read_bytes()).hexdigest()
        # Keep the exact snapshot scope keys. Paired treatment forbids cached
        # count reads; it computes canonical counts through the accepted copy.
        value['prepared_snapshot_receipt_sha256'] = adopted[source]
        destination = root / target
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        save(destination, value)
    # Existing generic metadata layouts cover the complete snapshot, not only
    # the fixture profile. Source/copy reads still revalidate canonical authority.
    session.query('completion_replace_owned_fanout', 'DROP TABLE fanout')
    ordinary = json.loads((root / 'profile-ordinary.json').read_bytes())
    engagement_setup.build_fanout(root, ordinary, paired)
    if counts.generation(session)[0] != generation:
        raise ValueError('canonical generation changed during initial setup')
    state = certificates.fingerprint(session)
    save(root / 'before-projection-fingerprint.json', state)
    provenance = dict(kind='PREPARED_SNAPSHOT_ADOPTION_PLUS_INITIAL_K20_SETUP', snapshot_id=engagement_restore.SNAPSHOT,
        snapshot_receipt_hashes=adopted, canonical_content_sha256=state['canonical_content_sha256'],
        initial_k20_build_only=True, paired_counter_values_never_used_by_uniform_treatment=True)
    certificate = certificates.bind(root, session, generation, provenance)
    certificates.verify(root)
    return certificate
