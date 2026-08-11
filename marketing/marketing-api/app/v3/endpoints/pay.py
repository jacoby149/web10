import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, HTTPException, Request

from ...models import (
    AffiliateClick,
    AffiliateConversion,
    AffiliateCreate,
    AffiliateLinkResponse,
    PayoutCreate,
    PayoutResponse,
    PayoutStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Stripe config
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PLATFORM_FEE_PCT = float(os.getenv("STRIPE_PLATFORM_FEE_PCT", "2"))  # 2% platform fee

# In-memory stores (replace with ClickHouse/DB in production)
payouts: dict[str, dict] = {}
affiliate_links: dict[str, dict] = {}
affiliate_clicks: list[dict] = []
affiliate_conversions: list[dict] = []
store_lock = Lock()

# Persistence
_payouts_file = Path(__file__).resolve().parent.parent.parent / "data" / "payouts.json"
_affiliate_file = Path(__file__).resolve().parent.parent.parent / "data" / "affiliate.json"


def _load_stores():
    if _payouts_file.exists():
        try:
            with store_lock:
                payouts.update(json.loads(_payouts_file.read_text()))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load payouts: %s", e)
    if _affiliate_file.exists():
        try:
            data = json.loads(_affiliate_file.read_text())
            with store_lock:
                affiliate_links.update(data.get("links", {}))
                affiliate_clicks.extend(data.get("clicks", []))
                affiliate_conversions.extend(data.get("conversions", []))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load affiliate data: %s", e)


def _save_stores():
    _payouts_file.parent.mkdir(parents=True, exist_ok=True)
    _affiliate_file.parent.mkdir(parents=True, exist_ok=True)
    _payouts_file.write_text(json.dumps(list(payouts.values()), indent=2))
    _affiliate_file.write_text(
        json.dumps(
            {
                "links": affiliate_links,
                "clicks": affiliate_clicks[-1000:],
                "conversions": affiliate_conversions[-1000:],
            },
            indent=2,
        )
    )


_load_stores()


# ─── Pay: Developer Payouts ──────────────────────────────────────────────


@router.post("/payout")
async def create_payout(req: PayoutCreate):
    """Create a payout for a web10 developer/app.

    This initiates a Stripe payment to the developer's connected account.
    The platform takes a configurable percentage fee (default 2%).
    """
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe not configured")

    payout_id = str(uuid.uuid4())
    platform_fee = int(req.amount_cents * STRIPE_PLATFORM_FEE_PCT / 100)
    net_amount = req.amount_cents - platform_fee

    # In production, create a Stripe payment:
    # import stripe
    # stripe.PaymentIntent.create(
    #     amount=net_amount,
    #     currency=req.currency,
    #     payment_method_types=["card"],
    #     transfer_data={"destination": req.stripe_account_id},
    #     application_fee_amount=platform_fee,
    #     metadata={"app_id": req.app_id, "payout_id": payout_id},
    # )

    payout = {
        "payout_id": payout_id,
        "app_id": req.app_id,
        "amount_cents": req.amount_cents,
        "net_amount_cents": net_amount,
        "platform_fee_cents": platform_fee,
        "currency": req.currency,
        "status": PayoutStatus.PENDING,
        "stripe_payment_id": None,
        "stripe_account_id": req.stripe_account_id,
        "stripe_customer_id": req.stripe_customer_id,
        "description": req.description,
        "created_at": datetime.utcnow().isoformat(),
    }

    with store_lock:
        payouts[payout_id] = payout
    _save_stores()

    return PayoutResponse(**payout)


@router.get("/payout/{payout_id}")
async def get_payout(payout_id: str):
    """Get payout status."""
    with store_lock:
        payout = payouts.get(payout_id)
    if not payout:
        raise HTTPException(404, "Payout not found")
    return PayoutResponse(**payout)


@router.get("/payouts")
async def list_payouts(app_id: str | None = None, limit: int = 50):
    """List payouts, optionally filtered by app_id."""
    with store_lock:
        all_payouts = list(payouts.values())
    if app_id:
        all_payouts = [p for p in all_payouts if p["app_id"] == app_id]
    return {
        "items": list(reversed(all_payouts))[:limit],
        "total": len(all_payouts),
    }


@router.post("/payout/{payout_id}/cancel")
async def cancel_payout(payout_id: str):
    """Cancel a pending payout."""
    with store_lock:
        payout = payouts.get(payout_id)
        if not payout:
            raise HTTPException(404, "Payout not found")
        if payout["status"] != PayoutStatus.PENDING:
            raise HTTPException(409, f"Cannot cancel payout in status: {payout['status']}")
        payout["status"] = PayoutStatus.CANCELLED
    _save_stores()
    return PayoutResponse(**payout)


# ─── Pay: Affiliate Links ────────────────────────────────────────────────


@router.post("/affiliate/link")
async def create_affiliate_link(req: AffiliateCreate):
    """Generate an affiliate link for a web10 product.

    When someone signs up or makes a purchase through this link,
    the affiliate earns the configured commission percentage.
    """
    affiliate_id = str(uuid.uuid4())
    # Encode affiliate_id in the link for tracking
    affiliate_link = f"https://web10.app/join?ref={affiliate_id}"

    link_data = {
        "affiliate_id": affiliate_id,
        "affiliate_key": req.affiliate_key,
        "target_url": req.target_url,
        "affiliate_link": affiliate_link,
        "commission_pct": req.commission_pct,
        "created_at": datetime.utcnow().isoformat(),
        "clicks": 0,
        "conversions": 0,
    }

    with store_lock:
        affiliate_links[affiliate_id] = link_data
    _save_stores()

    return AffiliateLinkResponse(**link_data)


@router.get("/affiliate/link/{affiliate_id}")
async def get_affiliate_link(affiliate_id: str):
    """Get affiliate link stats."""
    with store_lock:
        link_data = affiliate_links.get(affiliate_id)
    if not link_data:
        raise HTTPException(404, "Affiliate link not found")
    return AffiliateLinkResponse(**link_data)


@router.get("/affiliate/links")
async def list_affiliate_links(affiliate_key: str | None = None, limit: int = 50):
    """List affiliate links, optionally filtered by affiliate_key."""
    with store_lock:
        all_links = list(affiliate_links.values())
    if affiliate_key:
        all_links = [link for link in all_links if link["affiliate_key"] == affiliate_key]
    return {
        "items": list(reversed(all_links))[:limit],
        "total": len(all_links),
    }


@router.post("/affiliate/click")
async def track_affiliate_click(click: AffiliateClick):
    """Record an affiliate link click."""
    with store_lock:
        link_data = affiliate_links.get(click.affiliate_id)
        if not link_data:
            raise HTTPException(404, "Affiliate link not found")
        link_data["clicks"] = link_data.get("clicks", 0) + 1
        affiliate_clicks.append(
            {
                "affiliate_id": click.affiliate_id,
                "visitor_ip": click.visitor_ip,
                "user_agent": click.user_agent,
                "referrer": click.referrer,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
    _save_stores()
    return {"status": "ok"}


@router.post("/affiliate/conversion")
async def track_affiliate_conversion(conv: AffiliateConversion):
    """Record a conversion from an affiliate link.

    Call this when a referred user completes a paid action (signup, purchase).
    The affiliate earns commission_pct of revenue_cents.
    """
    with store_lock:
        link_data = affiliate_links.get(conv.affiliate_id)
        if not link_data:
            raise HTTPException(404, "Affiliate link not found")
        link_data["conversions"] = link_data.get("conversions", 0) + 1

        commission_cents = int(conv.revenue_cents * link_data["commission_pct"] / 100)
        platform_fee_cents = conv.revenue_cents - commission_cents

        affiliate_conversions.append(
            {
                "affiliate_id": conv.affiliate_id,
                "affiliate_key": link_data["affiliate_key"],
                "revenue_cents": conv.revenue_cents,
                "commission_cents": commission_cents,
                "platform_fee_cents": platform_fee_cents,
                "customer_key": conv.customer_key,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
    _save_stores()

    return {
        "status": "ok",
        "commission_cents": commission_cents,
        "platform_fee_cents": platform_fee_cents,
    }


@router.get("/affiliate/stats")
async def get_affiliate_stats(affiliate_key: str):
    """Get aggregate stats for an affiliate."""
    with store_lock:
        links = [link for link in affiliate_links.values() if link["affiliate_key"] == affiliate_key]
        conversions = [c for c in affiliate_conversions if c["affiliate_key"] == affiliate_key]

    total_clicks = sum(link.get("clicks", 0) for link in links)
    total_conversions = len(conversions)
    total_commission = sum(c.get("commission_cents", 0) for c in conversions)
    total_revenue = sum(c.get("revenue_cents", 0) for c in conversions)

    return {
        "affiliate_key": affiliate_key,
        "links_count": len(links),
        "total_clicks": total_clicks,
        "total_conversions": total_conversions,
        "conversion_rate": round(total_conversions / total_clicks * 100, 2) if total_clicks else 0,
        "total_commission_cents": total_commission,
        "total_revenue_cents": total_revenue,
    }


# ─── Stripe Webhook ──────────────────────────────────────────────────────


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events.

    In production, verify the signature and process events like:
    - payment_intent.succeeded: mark payout as paid
    - charge.succeeded: process affiliate commission
    """
    # TODO: implement webhook signature verification
    return {"status": "ok"}
