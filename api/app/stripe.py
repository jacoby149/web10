import stripe
import app.settings as settings 

stripe.api_key = settings.STRIPE_KEY

################
# Prices objects
################
subscription = [{
    "price":settings.STRIPE_CREDIT_SUB_ID,"adjustable_quantity":True
    },
    {
    "price":settings.STRIPE_SPACE_SUB_ID,"adjustable_quantity":True
    }]
purchase = [{
    "price":settings.STRIPE_CREDIT_ID,"adjustable_quantity":True
    }]


############################################
# customer payment / subscription management
############################################
def make_customer():
    customer = stripe.Customer.create(
        description="New Customer",
    )
    return customer["id"]

def create_checkout_session(customer_id,prices,sub=True):
    mode = "payment"
    prices = purchase
    if sub : 
        mode = "subscription"
        prices = subscription

    checkout_session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        mode=mode,
        line_items= prices
    )
    return {
        "sessionUrl":checkout_session["url"],"customerId":customer_id
        }

def create_portal_session(customer_id):
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
    )
    return {"url": session.url}