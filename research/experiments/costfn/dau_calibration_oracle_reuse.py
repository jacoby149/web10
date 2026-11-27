"""Reuse the previously banked reader oracles under a fresh native census."""

import shutil
from uuid import uuid4

from arm_f_native import save
from costfn_task import digest, read
from dau_sustain_reference import source_binding
from dau_sustain_workload import READERS


INDEX_SHA = '6f7ea83bc2fd52c248df0cff70cc4b2be2828194d231580c43ba5791b497347f'
SELECTION_SHA = 'a538ead12ca9f53c7977f613fc116a8197689f7676c6a90ff7af34cc78fda82f'


def selection_domain(selection):
    return {key: value for key, value in selection.items() if key != 'census_sha256'}


def verify_packets(banked, old_index, scope):
    indexed = old_index['readers']
    if (len(indexed) != READERS or len(scope) != READERS or
            [row['index'] for row in indexed] != list(range(READERS))):
        raise ValueError('banked oracle must cover the complete fixed reader pool')
    for selected, entry in zip(scope, indexed, strict=True):
        directory = banked / f"reader-{entry['index']:03d}"
        packet_file = directory / 'oracle.json'
        packet = read(packet_file)
        profile = packet['profile']
        if (digest(packet_file) != entry['sha256'] or packet['binding'] != old_index['binding']
                or (entry['reader'], entry['index']) != (profile['reader'], profile['index'])
                or (profile['reader'], profile['index'], profile['groups']) != (
                    selected['reader'], selected['index'], selected['groups'])
                or packet['canonical_receipt_sha256'] != digest(directory / 'summary.json')
                or packet['canonical_response_sha256'] != digest(directory / 'expected.json')
                or read(directory / 'input.json') != profile):
            raise ValueError('banked oracle packet does not match its canonical receipt and reader')
        yield entry, directory, packet


def prepare(root, settled_ledger):
    banked = root / 'banked-utilization-oracles'
    original_selection = banked / 'selection.json'
    original_index = banked / 'oracle-index.json'
    original_billboards = banked / 'settled-billboards.json'
    if digest(original_selection) != SELECTION_SHA or digest(original_index) != INDEX_SHA:
        raise ValueError('exact banked reader oracle and selection required')
    old_scope, old_index = read(original_selection), read(original_index)
    current_selection = root / 'dau-diverse-reader-selection.json'
    current_scope = read(current_selection)
    if (selection_domain(old_scope) != selection_domain(current_scope)
            or read(original_billboards) != settled_ledger
            or old_index['binding'] != source_binding(original_selection, original_billboards)):
        raise ValueError('fresh live scope, billboard fixture or exact canonical oracle source differs')
    target = root / 'dau-reader-oracles'
    if target.exists():
        index = read(target / 'oracle-index.json')
        if (index.get('reused_oracle_index_sha256') != INDEX_SHA
                or index['binding'] != source_binding(current_selection, original_billboards)):
            raise ValueError('existing oracle was not rebound from the validated banked inputs')
        return index
    stage = target.with_name(target.name + '-rebind-' + uuid4().hex)
    stage.mkdir(mode=0o700)
    shutil.copyfile(current_selection, stage / 'selection.json')
    shutil.copyfile(original_billboards, stage / 'settled-billboards.json')
    binding = source_binding(current_selection, original_billboards)
    rebound = []
    for entry, directory, packet in verify_packets(banked, old_index, current_scope['readers']):
        new = stage / directory.name
        new.mkdir(mode=0o700)
        for file in ('input.json', 'summary.json', 'expected.json'):
            shutil.copyfile(directory / file, new / file)
        save(new / 'oracle.json', dict(packet, binding=binding))
        rebound.append(dict(entry, sha256=digest(new / 'oracle.json'), original_packet_sha256=entry['sha256']))
    value = dict(binding=binding, reused_oracle_index_sha256=INDEX_SHA, readers=rebound,
        load_windows='NOT_RUN', canonical_oracle_values_changed=False)
    save(stage / 'oracle-index.json', value)
    stage.rename(target)
    return value
