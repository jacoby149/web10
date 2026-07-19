import stripe

import app.exceptions as exceptions
import app.settings as settings

if settings.STRIPE_STATUS=="live":
    stripe.api_key = settings.STRIPE_LIVE_KEY
else:
    stripe.api_key = settings.STRIPE_TEST_KEY

###############################################
#### Session URL creation
###############################################

def create_business_session(bus_id):
    bus_session = stripe.AccountLink.create(
    account=bus_id,
    refresh_url="https://auth.web10.app",
    return_url="https://auth.web10.app",
    type="account_onboarding",
    )
    return bus_session["url"]

def business_login_session(bus_id):
    return stripe.Account.create_login_link(bus_id)["url"]

#################################
### Dev Pay (creator economy)
#################################

def make_customer():
    return stripe.Customer.create(description="Customer")["id"]

def make_business():
    return stripe.Account.create(type="express")["id"]

def get_active_subscriptions(customer_id):
    customer = stripe.Customer.retrieve(customer_id, expand=['subscriptions'])
    if "subscriptions" not in customer:
        return []
    return customer["subscriptions"]

def get_subscription_price_ids(subscriptions):
    return [sub["items"]["data"][0]["price"]["id"] for sub in subscriptions]

# create dev pay subscription checkout session
def create_dev_pay_session(customer_id, bus_id, pay_data):
    success_url = "https://auth.web10.app"
    if pay_data.success_url is not None:
        success_url = pay_data.success_url
    cancel_url = "https://auth.web10.app"
    if pay_data.cancel_url is not None:
        cancel_url = pay_data.cancel_url

    try:
        checkout_session = stripe.checkout.Session.create(
            success_url=success_url,
            cancel_url=cancel_url,
            customer=customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": pay_data.price,
                    "recurring": {
                        "interval": "month",
                    },
                    "product_data": {
                        "name": pay_data.title,
                    },
                },
                "quantity": 1,
            }],
            subscription_data={
                "metadata": {
                    "title": pay_data.title,
                    "seller": pay_data.seller,
                    "price": pay_data.price,
                },
                "transfer_data": {
                    "destination": bus_id,
                    "amount_percent": settings.DEV_PAY_PCT,
                },
            },
        )
    except stripe.error.StripeError:
        raise exceptions.BUSINESS_NOT_READY
    return checkout_session["url"]

# gets the metadata json from customers devpay subscription with the title.
def get_dev_pay_subscription(customer_id, pay_data):
    subs = get_active_subscriptions(customer_id)
    def f(sub):
        if "title" not in sub["metadata"] or "seller" not in sub["metadata"]:
            return False
        return sub["metadata"]["title"] == pay_data.title and sub["metadata"]["seller"] == pay_data.seller
    subs = list(filter(f, subs))
    if len(subs) == 0:
        return None
    return subs[0]

def get_dev_pay_metadata(customer_id, pay_data):
    sub = get_dev_pay_subscription(customer_id, pay_data)
    if sub is None:
        return None
    return sub["metadata"]

# cancels the customers devpay subscription of given title
def cancel_dev_pay_subscription(customer_id, pay_data):
    sub = get_dev_pay_subscription(customer_id, pay_data)
    if sub is None:
        raise exceptions.NO_SUB
    stripe.Subscription.delete(sub["id"], prorate=True)