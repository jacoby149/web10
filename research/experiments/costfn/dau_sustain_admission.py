"""Bind the exact committed DAU source to a verified owned guest lease."""

import argparse
from datetime import UTC, datetime
import re

import arm_f_banked
import arm_f_cloud as cloud
import arm_t
from costfn_task import read
import dau_sustain_readers as readers
import dau_sustain_run as run
import engagement_composition as composition
import engagement_limits as limits
import engagement_modern as modern
import engagement_pin_index as pins
import hybrid_k20_slice


def bind(lease, guest, source):
    cloud.validate(lease)
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('exact merged source revision required')
    if (lease.get('dau_overnight') is not True or lease.get('cancelled') or lease.get('cleanup_verified')
            or lease.get('restored_snapshot_id') != '255003176' or type(lease.get('droplet_id')) is not int
            or guest['droplet_id'] != lease['droplet_id'] or guest['logical_cpus'] != 32
            or guest['memory_bytes'] < 32 * 1024**3 or guest['timer_active'] is not True
            or guest['timer_deadline_epoch'] != lease['deadline']):
        raise ValueError('exact guest identity, shape, retained snapshot and armed deadline required')
    def timestamp(value):
        return datetime.fromtimestamp(value, UTC).isoformat()
    value = dict(configuration='F', purpose='DAU_SUSTAINED_CONTRACT_RATE', approved_by='Jacob',
        droplet_id=lease['droplet_id'], approved_utc=timestamp(lease['created_epoch']), deadline_utc=timestamp(lease['deadline']),
        budget_usd=25, cleanup_model='agent-supervised-self-kill', host_self_kill_verified=True,
        cutoff=2000, T7_admitted=False, sort_order_arm_admitted=False, scope='F_GATES_ONLY',
        banked_P_sha256=arm_f_banked.ARCHIVE_SHA256, dataset_id=arm_t.DATASET, restored_snapshot_id='255003176',
        costfn_task_id=lease['costfn_task_id'], costfn_run_rules=lease['costfn_run_rules'], dau_overnight=True,
        dau_reader_criterion=readers.CRITERION, dau_store_source='PARQUET_TRANSFER', dau_sustain_directive=run.DIRECTIVE,
        hybrid_k20_directive=hybrid_k20_slice.DIRECTIVE, hybrid_k20_projected_admitted=False,
        hybrid_k20_source_commit=source, pin_index_directive=pins.DIRECTIVE, row_model_admitted=False,
        engagement_engine=modern.ENGINE, engagement_directive=modern.DIRECTIVE, engagement_ref_admitted=True,
        measurement_limits_directive=limits.DIRECTIVE, run_directive=composition.DIRECTIVE, composition_admitted=True,
        initial_k20_count_build_admitted=True, engagement_completion_admitted=True, tally_wiring_admitted=True,
        stages_b_d_admitted=False, billboard_node_ratio='1/3', billboard_seed='dau-after-1722',
        dau_host=dict(size='c-32', region='nyc1', expected_guest_logical_cpus=32, price_hourly=1,
            storage_gib=400, storage_class='class-provided local disk', backstop_h=24, compute_ceiling_usd=25.0),
        dau_envelope=dict(container_bytes=28 * 1024**3, server_bytes=22 * 1024**3,
            api_bytes=2 * 1024**3, minio_bytes=512 * 1024**2))
    return value


if __name__ == '__main__':
    from pathlib import Path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lease', type=Path)
    parser.add_argument('guest', type=Path)
    parser.add_argument('source')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('immutable existing run admission')
    cloud.save(args.output, bind(read(args.lease), read(args.guest), args.source))
