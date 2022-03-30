import stripe
import app.settings as settings 

stripe.api_key = settings.STRIPE_KEY

def create_checkout_session(customer_id,prices,sub=True):
    #there needs to be a customer id...
    if not customer_id:
        customer = stripe.Customer.create(
            description="New Customer",
        )
    
    mode = "payment"
    if sub : mode = "subscription"

    checkout_session = stripe.checkout.Session.create(
        customer=customer,
        #success_url="https://localhost:8000/success?session_id={CHECKOUT_SESSION_ID}",
        #cancel_url="http://localhost:8000/cancel",
        payment_method_types=["card"],
        mode=mode,
        line_items= prices
        # [{
        #     "price": data["priceId"],
        #     "quantity": 4
        # },{
        #     "price": "price_1Ki4vvFGm9S2yiuxLklHRK3a",
        #     "quantity": 1
        # }],
    )
    return {
        "sessionUrl": checkout_session["url"],"customerId":customer_id
        }


def create_portal_session(customer_id):
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        # return_url="http://localhost:8000"
    )
    return {"url": session.url}