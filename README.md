## What is web10?



web10 is a system for users to **own their data** on the internet. 

APIs and encryption pipelines **easy enough for grandma !!!**

Fast peer to peer networking !!!

The **social experience** of the future

Not public and permanent like blockchain. **Private and temporary**

Demonopolizes the internet, breaks it up into modules.

*The Modules : app | auth | api | encryption | webrtc*

Active version / example of web10 : https://web10.app | https://docs.web10.app



## Community

web10 discord : https://discord.gg/Dbd4VEDznU



## web10 deployment and practical use

This guide will : 

1. Explain how to run the web10 system locally

2. Deploy the web10 system seamlessly to Google Cloud + MongoDB Atlas

3. Specify the web10 protocol

   

## running web10 locally

web10 is a system that any person can get running Locally + MongoDB Atlas in 15 minutes. 

Step 1 : Clone the GitHub repo locally.

Step 2 : Make a Mongo DB Atlas account. start a free cluster.

Step 3 : Duplicate the settings_example.py file in the api/app directory

Step 4 :  Rename it to settings.py

Step 5 : Change the DB_URL settings.py if statement to your Mongo DB atlas DB URL

```python
# change this part in the settings.py file you made to your own DB_URL
DB_URL = "mongodb+srv://web10:jSol....."
```

Step 6 : Go to https://seanwasere.com/generate-random-hex/

Step 7 : Change PRIVATE_KEY to the number you generated on the website.

```python
# change this part in the settings.py file you made to your own PRIVATE_KEY
PRIVATE_KEY = "8cbec8....."
```

Step 8 : Set BETA_REQUIRED, PAY_REQUIRED, and VERIFY REQUIRED How you please. If you set them all to "False", you can skip step 9.

```python
# try setting these all to false. [or however you would like]
BETA_REQUIRED = False
VERIFY_REQUIRED = False
PAY_REQUIRED = False
```

Step 9 : Optionally, make Stripe and Twilio accounts for verification and payments and fill out the API keys. Optionally, set a beta code.

```python
BETA_CODE = "web10betacode"
TWILIO_SERVICE = "VAbce...."
TWILIO_ACCOUNT_SID = "AC3594...."
TWILIO_AUTH_TOKEN = "460d....."
STRIPE_STATUS = "live"
STRIPE_TEST_KEY = "sk_test_51Khy....."
STRIPE_TEST_CREDIT_SUB_ID = "price_1Kh...."
STRIPE_TEST_SPACE_SUB_ID = "price_1Ki...."
STRIPE_LIVE_KEY = "sk_live_51Khyui......"
STRIPE_LIVE_CREDIT_SUB_ID = "price_1Kkb....."
STRIPE_LIVE_SPACE_SUB_ID = "price_1Kkb7....."  
```

Step 10 : Install docker, in the main directory run docker-compose up --build

Step 11 : Try running the web10 example application crm.localhost



## hosting your own web10 node

Once successfully running the web10 system successfully locally, you can get web10 running successfully from google cloud.

Step 1: Install KubeCTL

Step 2 : Install Skaffold

Step 3 : Log into Google Cloud, Start a Google Cloud Kubernetes Autopilot Instance.

Step 4 : CD into the skaffold/folder

Step 5 : Make copies of the run_example and dev_example folders respectively called run and dev.

...... TO BE CONTINUED 

## features

| feature                              | Description                                                  |
| ------------------------------------ | ------------------------------------------------------------ |
| Hosting Platform Portability         | It is designed entirely through Docker + Kubernetes + Skaffold deployment mechanisms, meaning it can be ported to any cloud provider with Kubernetes, or deployed on bare metal. |
| Provider Self Sufficiency            | The web10 host has charging mechanisms to make sure that account holders pay the provider for the bandwidth and storage they use. |
| TBD [Phone as a Keychain encryption] | Encrypt data on web10 providers without those providers being able to access the data, because the keys are locally stored on your phone. |
| Data interoperability                | Developers can use data from other apps with web10 user permission. |
| Free for Developers                  | Users / web10 providers bear the cloud costs.                |
