"""Opt-in ASGI entry point for Arm T's own disposable DO store only.

Do not change research_api or frozen overlays. This module is never imported
by the ordinary API, Arm D, or the baseline. All selection reads are timed
inside the normal observed request and use the unchanged native 10s limit.
"""
import hashlib
import importlib
import os

import arm_t
import arm_t_merge_first as treatment
from fastapi import HTTPException

if (os.environ.get("COSTFN_ARM_T") != "1"
        or any(os.environ.get(k) == "1" for k in
               ("COSTFN_ARM_D", "COSTFN_SATELLITE", "COSTFN_VIEWS_TREAT"))):
    raise RuntimeError("Arm T requires explicit isolated opt-in and other treatments off")

receipt = arm_t.read_build(os.environ["COSTFN_ARM_T_BUILD_RECEIPT"])
_admission = os.environ["COSTFN_ARM_T_ADMISSION"]
_host = arm_t.digitalocean_id()  # Before any startup SQL, including UUID checks.
arm_t.runtime_admission(receipt, _admission, _host)

observer = importlib.import_module("research_api")
ch = importlib.import_module("app.v3.services.clickhouse")

_, tables = ch.execute_query("SELECT name,toString(uuid) FROM system.tables WHERE database='web10' "
                            "AND name IN ('documents','doc_groups','doc_groups_t') ORDER BY name",
                            settings={"max_execution_time": 10})
if [{"name": row[0], "uuid": row[1]} for row in tables] != receipt["tables"]:
    raise RuntimeError("Arm T refuses a different store/table generation")

_compile = observer.original_compile


def compile_main(*args, **kwargs):
    arm_t.runtime_admission(receipt, _admission, _host)
    compiled = _compile(*args, **kwargs)
    readable = args[1] if len(args) >= 2 else kwargs.get("readable_groups_by_service", {})
    if set(readable) != treatment.SERVICES:
        return compiled  # Unrelated follow-up/prepare reads keep ordinary policy.
    reader = kwargs.get("member_key", args[2] if len(args) > 2 else "anon")
    if len({frozenset(g) for g in readable.values()}) != 1:
        raise ValueError("Arm T main requires the same actual readable set for all services")
    groups = sorted(readable["posts"])
    sql = treatment.candidates_sql(compiled, reader, groups)
    current = observer.current.get()
    if current is None:
        raise ValueError("Arm T refuses unobserved candidate work")
    current["arm_t"] = {"additive_directive": "2026-11-14", "groups": len(groups),
                         "query_revision": "merge-first-v2",
                         "revision_sha256": arm_t.digest(treatment.__file__),
                         "adapter_sha256": arm_t.digest(__file__),
                        "selection_state": "started", "snapshot": receipt["receipt_sha256"],
                        "candidate_sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
                        "selection_cost_is_main_request_cost": True,
                        "related_metadata_residual": "group-prefix scans, not page-bounded"}
    current["compiled_sha256"] = current["arm_t"]["candidate_sql_sha256"]
    print("[arm-t] canonical candidate selection start", flush=True)
    try:
        columns, rows = ch.execute_query(sql, settings={"max_execution_time": 10,
                                                       "max_memory_usage": 22 * 1024**3})
        selected = [dict(zip(columns, row)) for row in rows]
        verification = treatment.verification_sql(compiled, reader, groups, selected)
        current["arm_t"].update(selection_state="verifying", selected_rows=len(selected),
                               verification_sql_sha256=hashlib.sha256(verification.encode()).hexdigest())
        print(f"[arm-t] merge-first slices complete rows={len(selected)}; canonical verification start", flush=True)
        columns, rows = ch.execute_query(verification, settings={"max_execution_time": 10,
                                                                 "max_memory_usage": 22 * 1024**3})
        winners = treatment.verified_page(selected, [dict(zip(columns, row)) for row in rows])
    except Exception as error:
        current["arm_t"].update(selection_state="failed", failure_class=type(error).__name__)
        if isinstance(error, treatment.InvalidArm):
            current["arm_t"]["invalid_reason"] = str(error)
        print(f"[arm-t] canonical candidate selection failed class={type(error).__name__}", flush=True)
        if isinstance(error, (ch.QueryExecutionError, treatment.InvalidArm)):
            # Preserve ordinary native-error HTTP 400 (UnsafeQueryError would
            # incorrectly return 403). Never put SQL/error payloads in HTTP.
            raise HTTPException(status_code=400, detail="Arm T selection failed; inspect retained native/arm receipt") from error
        raise
    print(f"[arm-t] canonical candidate selection complete rows={len(winners)}", flush=True)
    rewritten = treatment.main_sql(compiled, reader, groups, winners)
    current["arm_t"].update(selection_state="complete", candidate_rows=len(winners))
    return rewritten


observer.original_compile = compile_main


async def application(scope, receive, send):
    # Admission is checked on every request, including follow-ups, not only when
    # a multi-service query happens to compile. No metadata network read per request.
    arm_t.runtime_admission(receipt, _admission, _host)

    async def marked_send(message):
        observation = observer.current.get()
        if (message["type"] == "http.response.start" and observation
                and observation.get("arm_t", {}).get("invalid_reason")):
            message = {**message, "headers": [*message.get("headers", []), (b"x-arm-t-invalid", b"1")]}
        await send(message)

    return await observer.application(scope, receive, marked_send)
