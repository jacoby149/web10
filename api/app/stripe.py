import stripe
import app.settings as settings 
import app.exceptions as exceptions

if settings.STRIPE_STATUS=="live":
    stripe.api_key = settings.STRIPE_LIVE_KEY
    CREDIT_SUB_ID = settings.STRIPE_LIVE_CREDIT_SUB_ID
    SPACE_SUB_ID = settings.STRIPE_LIVE_SPACE_SUB_ID
else:
    stripe.api_key = settings.STRIPE_TEST_KEY
    CREDIT_SUB_ID = settings.STRIPE_TEST_CREDIT_SUB_ID
    SPACE_SUB_ID = settings.STRIPE_TEST_SPACE_SUB_ID

################
# Prices objects
################
subscription = [{
    "price":CREDIT_SUB_ID,"quantity":1,'adjustable_quantity': {
        'enabled': True,}
    },
    {
    "price":SPACE_SUB_ID,"quantity":1,"adjustable_quantity": {
        'enabled': True}
    }]

############################################
# customer payment / subscription management
############################################
def make_customer():
    customer = stripe.Customer.create(
        description="New Customer",
    )
    return customer["id"]

def make_business():
    bus = stripe.Account.create(type="express")
    return bus["id"]

def get_active_subscriptions(customer_id):
    customer = stripe.Customer.retrieve(customer_id, expand=['subscriptions'])
    if "subscriptions" not in customer : return []
    subscriptions = customer["subscriptions"]
    return subscriptions

def get_subscription_price_ids(subscriptions):
    return [sub["items"]["data"][0]["price"]["id"] for sub in subscriptions]

###############################################
#### Session URL creation
###############################################

def create_business_session(bus_id):
    print(bus_id)
    bus_session = stripe.AccountLink.create(
    account=bus_id,
    refresh_url="https://auth.web10.app",
    return_url="https://auth.web10.app",
    type="account_onboarding",
)
    print(bus_session["url"])
    return bus_session["url"]

def business_login_session(bus_id):
    return stripe.Account.create_login_link(bus_id)["url"]

def create_checkout_session(customer_id,price_id,item_type="plan"):
    # for web10 plans
    if (item_type=="plan"):
        line_items = [{
    "price":price_id,"quantity":1,'adjustable_quantity': {
        'enabled': True,}
    }]

    # for devPay items
    else: line_items=[{
    "price":price_id,"quantity":1}]

    checkout_session = stripe.checkout.Session.create(
        success_url="https://auth.web10.app",
        cancel_url="https://auth.web10.app",
        customer=customer_id,
        payment_method_types=["card"],
        mode="subscription",
        line_items= line_items
    )
    return checkout_session["url"]

def create_portal_session(customer_id):
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
    )
    return session["url"]

##############################
# button functions
##############################

# helper function for subscriptions [devPay too]
def manage_subscription(customer_id,price,item_type="plan"):
    prices = get_subscription_price_ids(get_active_subscriptions(customer_id))
    if price in prices:
        return create_portal_session(customer_id)
    return create_checkout_session(customer_id,price,item_type)

def manage_space(customer_id):
    return manage_subscription(customer_id,SPACE_SUB_ID)

def manage_credits(customer_id):
    return manage_subscription(customer_id,CREDIT_SUB_ID)

##################################
# payment registration functions
##################################

# get credits and space in customers plans
def credit_space(customer_id):
    subscriptions = get_active_subscriptions(customer_id)
    prices = get_subscription_price_ids(subscriptions)
    subscription_data = [s["items"]["data"][0] for s in subscriptions]
    cidx = -1 
    if CREDIT_SUB_ID in prices:
        cidx = prices.index(CREDIT_SUB_ID)
        c = subscription_data[cidx]["quantity"]  + settings.FREE_CREDITS
    if cidx == -1 : c = settings.FREE_CREDITS

    sidx = -1 
    if SPACE_SUB_ID in prices:
        sidx = prices.index(SPACE_SUB_ID)
        s = subscription_data[sidx]["quantity"] * 1024 + settings.FREE_SPACE 
    if sidx == -1 : s = settings.FREE_SPACE
    
    return c,s

#################################
### Dev Pay
#################################

# create dev pay subscription checkout session
def create_dev_pay_session(customer_id,bus_id,pay_data):
    
    success_url = "https://auth.web10.app"
    if pay_data.success_url != None :
        success_url = pay_data.success_url
    cancel_url = "https://auth.web10.app"
    if pay_data.cancel_url != None :
        cancel_url = pay_data.cancel_url

    try :
        checkout_session = stripe.checkout.Session.create(
            success_url=success_url,
            cancel_url=cancel_url,
            customer=customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items= [{
                "price_data":{
                    "currency":"usd",
                    "unit_amount":pay_data.price,
                    "recurring":{
                        "interval":"month",
                    },
                    "product_data":{
                        "name":pay_data.title
                    },
                },
                "quantity":1,
                }],
            subscription_data= {
                "metadata":{
                    "title":pay_data.title,
                    "seller":pay_data.seller,
                    "price":pay_data.price,
                    },
                "transfer_data":{
                    "destination":bus_id,
                    "amount_percent":settings.DEV_PAY_PCT
                }
            }
        )
    except:
        raise exceptions.BUSINESS_NOT_READY
    return checkout_session["url"]

# gets the metadata json from customers devpay subscription with the title.
def get_dev_pay_subscription(customer_id,pay_data):
    subs = get_active_subscriptions(customer_id)
    def f(sub):
        return sub["metadata"]["title"] == pay_data.title and sub["metadata"]["seller"] == pay_data.seller
    subs = list(filter(f, subs))
    if len(subs) == 0: return None
    else : return subs[0]

def get_dev_pay_metadata(customer_id,pay_data):
    sub = get_dev_pay_subscription(customer_id, pay_data)
    if sub == None: return None
    else : return sub["metadata"]

# cancels the customers devpay subscription of given title
def cancel_dev_pay_subscription(customer_id, pay_data):
    sub = get_dev_pay_subscription(customer_id, pay_data)
    if sub == None:
        raise exceptions.NO_SUB
    stripe.Subscription.delete(sub["id"],prorate=True)