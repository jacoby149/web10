"""Current-engine infrastructure for the unchanged captured F baseline/read gate."""
import asyncio
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil

import arm_f_banked as banked
import arm_f_fixtures
import arm_f_infrastructure as infra
import arm_f_native
from arm_f_native import save
from arm_f_run import setup_scopes
import arm_satellite_batch as batch
import arm_satellite_batch_run as batching
import arm_satellite_counts as counts
import arm_satellite_sql as typed
import engagement_cells as cells
import engagement_modern as modern


def profiles(root, *, restored_fixture=None):
    root = Path(root)
    fixture = restored_fixture or asyncio.run(arm_f_fixtures.parity_fixture(root))
    if restored_fixture:
        save(root / 'fixture.json', fixture)
        save(root / 'fixture-clock.json', fixture['fixture_clock'])
    ordinary = asyncio.run(setup_scopes(root, modern.Session(root)))
    fixture_root = cells.root(root, 'fixture-scope')
    paired = asyncio.run(setup_scopes(fixture_root, modern.Session(fixture_root),
        reader_override=fixture['reader'], groups_override=fixture['groups']))
    save(root / 'profile-ordinary.json', ordinary)
    save(root / 'profile-fixture.json', paired)
    return fixture


def counters(root, epoch, session, generation, *, initial):
    old = banked.load(root)
    if initial:
        session.query('count_parts', batch.partial_ddl(batching.PARTS))
        session.query('count_final', batch.count_ddl(batching.FINAL))
    for profile_name in ('ordinary', 'fixture'):
        profile = json.loads((root / ('profile-' + profile_name + '.json')).read_bytes())
        output = epoch / ('counts-' + profile_name)
        output.mkdir(mode=0o700)
        result = dict(**infra.common(session, generation), outcome='BUILDING', T1=infra.VERDICT,
            scopes=[], build_queries=[], final_table=batching.FINAL)
        targets = [row['doc_id'] for row in profile['reference_page']]
        for label in ('main', 'reactions', 'comments'):
            readable = profile['actual_readable_by_kind'][label]
            recipes = [recipe for recipe in counts.RECIPES if recipe.service in readable]
            mapping = {recipe.service: readable[recipe.service] for recipe in recipes}
            scope = typed.scope_key(profile['reader'], mapping, generation, recipes)
            boundaries = {service: counts.canonical_boundary(service, groups, profile['reader']) for service, groups in mapping.items()}
            item = batching.build_scope(session, output, result, label, scope, boundaries, recipes, 8)
            item.update(complete=True, groups_by_service=mapping,
                comparisons=batching.compare(session, scope, targets, recipes, generation, mapping, profile['reader']))
        result.update(outcome='INFRASTRUCTURE_BUILT_SPOTS_PASS',
            stratified_targets={'all_ids': targets}, baseline_archive=old['profile/inventory.json']['dataset_id'])
        save(output / 'result.json', result)
        save(root / ('counts-' + profile_name + '.json'), result)
        presence(root, epoch, session, profile_name, profile, generation, targets)


def presence(root, epoch, session, name, profile, generation, targets):
    output = epoch / ('presence-' + name)
    output.mkdir(mode=0o700)
    recipe = typed.Counter('reactions:present', 'reactions')
    mapping = {'reactions': profile['actual_readable_by_kind']['reactions']['reactions']}
    scope = typed.scope_key(profile['reader'], mapping, generation, [recipe])
    result = dict(**infra.common(session, generation), outcome='BUILDING', T1=infra.VERDICT,
        scopes=[], build_queries=[], serving_scope_key=scope)
    info = batching.build_scope(session, output, result, 'reaction_presence', scope,
        {'reactions': counts.canonical_boundary('reactions', mapping['reactions'], profile['reader'])}, [recipe], 8)
    info.update(complete=True, groups_by_service=mapping,
        comparisons=batching.compare(session, scope, targets, [recipe], generation, mapping, profile['reader']))
    result['outcome'] = 'INFRASTRUCTURE_BUILT_SPOTS_PASS'
    save(output / 'result.json', result)
    save(root / ('presence-' + name + '.json'), result)


def infrastructure(root, name, *, initial=False, settle=True, additional_groups=()):
    root = Path(root)
    cells.stop(root)
    session = modern.Session(root)
    if initial:
        # Only explicitly owned derived research layouts. Never canonical data.
        for table in (batching.PARTS, batching.FINAL, 'strings', 'timestamps', 'doc_groups_t', 'fanout'):
            session.query('discard_old_derived_' + table, 'DROP TABLE IF EXISTS ' + table)
        if settle:
            infra.settle_canonical(session)
    else:
        for table in ('strings', 'timestamps', 'doc_groups_t'):
            session.query('refresh_derived_' + table, 'DROP TABLE ' + table)
    for table in infra.CANONICAL_TABLES:
        session.query('freeze_' + table, 'SYSTEM STOP MERGES ' + table)
    generation, parts = counts.generation(session)
    epoch = cells.root(root, 'infra-' + name)
    (epoch / 'counts-batch-p2').mkdir(mode=0o700)
    counters(root, epoch, session, generation, initial=initial)
    shutil.copyfile(root / 'counts-ordinary.json', epoch / 'counts-batch-p2/result.json')
    profile = json.loads((root / 'profile-ordinary.json').read_bytes())
    paired = json.loads((root / 'profile-fixture.json').read_bytes())
    combined = deepcopy(profile)
    combined['reference_page'] = profile['reference_page'][:3] + paired['reference_page'][:3]
    infra.build_metadata(epoch, session, combined, generation)
    for name in ('metadata', 'metadata-parity'):
        target = root / name
        if target.is_symlink():
            target.unlink()
        if target.exists():
            raise ValueError('unregistered current infrastructure directory')
        target.symlink_to(epoch / name, target_is_directory=True)
    if counts.generation(session)[0] != generation:
        raise ValueError('canonical generation changed during modern infrastructure build')
    save(epoch / 'epoch.json', dict(canonical_generation=generation, parts=parts,
        retained_prior_counter_scopes=not initial, initial=initial))
    if initial:
        build_fanout(root, profile, paired, additional_groups=additional_groups)
    return generation


def build_fanout(root, ordinary, paired, *, additional_groups=()):
    build_root = cells.root(root, 'fanout-bootstrap')
    (build_root / 'profile').mkdir()
    combined = deepcopy(ordinary)
    combined['groups'] = sorted(set(ordinary['groups']) | set(paired['groups']) | set(additional_groups))
    save(build_root / 'profile/inventory.json', combined)
    arm_f_native.build(build_root)
    shutil.copytree(build_root / 'fanout-state', root / 'fanout-template')
    save(root / 'fanout-template-source.json', dict(build_sha256=hashlib.sha256(
        (build_root / 'F-build/result.json').read_bytes()).hexdigest(), groups=combined['groups']))
