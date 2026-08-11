from datetime import datetime

from fastapi import APIRouter

from ...models import FunnelEventCreate, JsErrorReport, PageView

router = APIRouter()

analytics_events: list[dict] = []


@router.post("/pageview")
async def track_pageview(event: PageView):
    analytics_events.append({
        "type": "pageview",
        "path": event.path,
        "referrer": event.referrer,
        "user_agent": event.user_agent,
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"status": "ok"}


@router.post("/funnel")
async def track_funnel(event: FunnelEventCreate):
    analytics_events.append({
        "type": "funnel",
        "event": event.event,
        "metadata": event.metadata,
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"status": "ok"}


@router.post("/error")
async def report_error(error: JsErrorReport):
    analytics_events.append({
        "type": "error",
        "message": error.message,
        "source": error.source,
        "line": error.line,
        "column": error.column,
        "app": error.app,
        "route": error.route,
        "user_agent": error.user_agent,
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"status": "ok"}


@router.get("/summary")
async def get_analytics_summary():
    total_pageviews = sum(1 for e in analytics_events if e["type"] == "pageview")
    funnel_counts = {}
    for e in analytics_events:
        if e["type"] == "funnel":
            ev = e["event"]
            funnel_counts[ev] = funnel_counts.get(ev, 0) + 1
    funnel_order = [
        "landing",
        "docs_view",
        "app_store_view",
        "exporter_view",
        "export_started",
        "export_complete",
    ]
    dropoff = {}
    prev_count = None
    for step in funnel_order:
        count = funnel_counts.get(step, 0)
        if prev_count is not None and prev_count > 0:
            dropoff[step] = {
                "reached": count,
                "previous_reached": prev_count,
                "drop_off_pct": round((1 - count / prev_count) * 100, 1),
            }
        else:
            dropoff[step] = {"reached": count, "previous_reached": 0, "drop_off_pct": None}
        prev_count = count
    total_errors = sum(1 for e in analytics_events if e["type"] == "error")
    return {
        "total_pageviews": total_pageviews,
        "funnel": funnel_counts,
        "funnel_dropoff": dropoff,
        "total_errors": total_errors,
        "events_tracked": len(analytics_events),
    }
