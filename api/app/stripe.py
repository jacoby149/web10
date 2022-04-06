import stripe
import app.settings as settings 

stripe.api_key = settings.STRIPE_KEY

################
# Prices objects
################
subscription = [{
    "price":settings.STRIPE_CREDIT_SUB_ID,"quantity":1,'adjustable_quantity': {
        'enabled': True,}
    },
    {
    "price":settings.STRIPE_SPACE_SUB_ID,"quantity":1,"adjustable_quantity": {
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

def get_active_subscription_data(customer_id):
    customer = stripe.Customer.retrieve(customer_id, expand=['subscriptions'])
    if "subscriptions" not in customer : return []
    subscriptions = customer["subscriptions"]
    return [sub["items"]["data"][0] for sub in subscriptions]

def sub_price_ids(sub_data):
    return [sub["price"]["id"] for sub in sub_data]

#TODO
def make_dev_pay():
    return

#TODO
def update_dev_pay():
    return

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
    prices = sub_price_ids(get_active_subscription_data(customer_id))
    if price in prices:
        return create_portal_session(customer_id)
    return create_checkout_session(customer_id,price,item_type)

def manage_space(customer_id):
    return manage_subscription(customer_id,settings.STRIPE_SPACE_SUB_ID)

def manage_credits(customer_id):
    return manage_subscription(customer_id,settings.STRIPE_CREDIT_SUB_ID)

##################################
# payment registration functions
##################################

# get credits and space in customers plans
def credit_space(customer_id):
    sub_data = get_active_subscription_data(customer_id)
    prices = sub_price_ids(sub_data)
    cidx = -1 
    if settings.STRIPE_CREDIT_SUB_ID in prices:
        cidx = prices.index(settings.STRIPE_CREDIT_SUB_ID)
        c = sub_data[cidx]["quantity"]  + settings.FREE_CREDITS
    if cidx == -1 : c = settings.FREE_CREDITS

    sidx = -1 
    if settings.STRIPE_SPACE_SUB_ID in prices:
        sidx = prices.index(settings.STRIPE_SPACE_SUB_ID)
        s = sub_data[sidx]["quantity"] * 1024 + settings.FREE_SPACE 
    if sidx == -1 : s = settings.FREE_SPACE
    
    return c,s