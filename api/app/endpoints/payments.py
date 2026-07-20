from fastapi import APIRouter

from app.models.auth import Token
from app.models.payment import PayData
from app.services import documentdb as db
from app.services import stripe as pay
from app.services.auth import certify, decode_token

router = APIRouter()


def mget_customer_id(username):
    customer_id = db.get_customer_id(username)
    if not customer_id:
        customer_id = pay.make_customer()
        db.set_customer_id(username, customer_id)
    return customer_id


def mget_business_id(username):
    business_id = db.get_business_id(username)
    if not business_id:
        business_id = pay.make_business()
        db.set_business_id(username, business_id)
    return business_id


@router.post("/manage_business", include_in_schema=False)
async def manage_business(token: Token):
    from app.services.auth import check_admin

    check_admin(token)
    username = decode_token(token.token).username
    bus_id = mget_business_id(username)
    return pay.create_business_session(bus_id)


@router.post("/business_login", include_in_schema=False)
async def business_login(token: Token):
    from app.services.auth import check_admin

    check_admin(token)
    username = decode_token(token.token).username
    bus_id = mget_business_id(username)
    return pay.business_login_session(bus_id)


@router.post("/dev_pay")
async def subscription_checkout_session(pay_data: PayData):
    certify(Token(token=pay_data.token))
    decoded = decode_token(pay_data.token)
    username = decoded.username
    customer_id = mget_customer_id(username)
    bus_id = mget_business_id(pay_data.seller)
    return pay.create_dev_pay_session(customer_id, bus_id, pay_data)


@router.patch("/dev_pay")
async def verify_subscription(pay_data: PayData):
    certify(Token(token=pay_data.token))
    decoded = decode_token(pay_data.token)
    username = decoded.username
    customer_id = mget_customer_id(username)
    return pay.get_dev_pay_metadata(customer_id, pay_data)


@router.delete("/dev_pay")
async def cancel_subscription(pay_data: PayData):
    certify(Token(token=pay_data.token))
    decoded = decode_token(pay_data.token)
    username = decoded.username
    customer_id = mget_customer_id(username)
    return pay.cancel_dev_pay_subscription(customer_id, pay_data)
