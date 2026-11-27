"""Offline verification of reader-bound ordered responses and write receipts."""

from costfn_task import ParityDivergence


def writer_ledger(records, writer_groups, following, successful_slots):
    """Prove the admitted writer stream cannot change a selected Following page.

    Callers must supply reconciled native commit records, not scheduled writes
    or a copy of the request payload. Never infer that an HTTP failure implies
    the absence of a committed native write.
    """
    previous_slots = set()
    keys = set()
    selected_groups = set().union(*(set(groups) for groups in following.values()))
    for row in records:
        actor, doc, slot = row['actor'], row['doc_id'], row['slot']
        actual = set(row['committed_groups'])
        expected = writer_groups.get(actor)
        key = (actor, doc)
        if (row.get('reconciled') is not True or not doc or key in keys or slot in previous_slots
                or expected is None or actual != set(expected) or actual & selected_groups):
            raise ParityDivergence('committed writer ledger does not prove Following page invariance')
        keys.add(key)
        previous_slots.add(slot)
    if previous_slots != set(successful_slots):
        raise ParityDivergence('native writer commits do not reconcile to the completed write stream')
    return previous_slots


def verify(reads, successful_slots, oracles):
    """Check exact order and value, with no sorting or partial-response escape.

    ``successful_slots`` maps (phase, slot) to the scheduled reader index.
    Oracles contain canonical rows and the three independently computed
    follow-ups, with views already reconciled to the relevant delivery state.
    """
    if not successful_slots:
        raise ParityDivergence('no successful measured requests to verify')
    checked = set()
    for record in reads:
        slot = (record['phase'], record['slot'])
        reader = record['reader_index']
        if slot in checked or successful_slots.get(slot) != reader or reader not in oracles:
            raise ParityDivergence('response does not bind uniquely to an admitted scheduled reader')
        oracle = oracles[reader]
        if (len(record['followups']) != 3 or record['rows'] != oracle['rows']
                or record['followups'] != oracle['followups']):
            raise ParityDivergence(f'ordered response differs from reader oracle: {slot}, reader {reader}')
        checked.add(slot)
    if checked != set(successful_slots):
        raise ParityDivergence('missing response records for successful requests')
    return dict(verified_responses=len(checked), exact_ordered_parity='PASS')
