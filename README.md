# Introducing web10



<img src="auth\public\logo_blue.jpg" alt="logo_black" style="height:75px;" />



web10 is a system for users to **own their data** on the internet. 

the **social experiences** of the future

not public and permanent like blockchain. **private and temporary**

**demonopolizes the internet**, breaks it up into modules.

bring your data with you **across apps**

web10 provides **free** databases for developers [users pay for plans]

**make money** as a web10 developer or web10 provider



**Try a web10 app [contact manager]** : https://crm.web10.app

The web10 inc. web10 node : https://web10.app 

docs page [for developers] : https://docs.web10.app



## Community

web10 discord : https://discord.gg/Dbd4VEDznU



## web10 deployment and practical use

This guide will : 

1. Explain how to run the web10 system locally

2. Deploy the web10 system seamlessly to Google Cloud + MongoDB Atlas

3. Specify the web10 protocol

   

## running web10 locally

web10 is a system that any person can get running Locally + MongoDB Atlas in 15 minutes. 

#### Cloning the repo

Step 1 : give the web10 repo a star :) [ join the web10 discord too :0 ]

Step 2 : fork the web10 repo

Step 3 : clone your fork of the web10 GitHub repo locally.

#### Set up the API

Step 4 : Make a Mongo DB Atlas account. start a free cluster.

Step 5 : Go to the /api/app directory. Duplicate settings_example.py file in the same location, and rename the duplicate to settings.py

Step 6 : Change the DB_URL settings.py if statement to your Mongo DB atlas DB URL

```python
# change this part in the settings.py file you made to your own DB_URL
DB_URL = "mongodb+srv://web10:jSol....."
```

Step 7 : Go to https://seanwasere.com/generate-random-hex/

Step 8 : Change PRIVATE_KEY to the number you generated on the website.

```python
# change this part in the settings.py file you made to your own PRIVATE_KEY
PRIVATE_KEY = "8cbec8....."
```

Step 9 : Set BETA_REQUIRED, PAY_REQUIRED, and VERIFY REQUIRED How you please. If you set them all to "False", you can skip step 10.

```python
# try setting these all to false. [or however you would like]
BETA_REQUIRED = False
VERIFY_REQUIRED = False
PAY_REQUIRED = False
```

Step 10 : Optionally, make Stripe and Twilio accounts for verification and payments and fill out the API keys. Optionally, set a beta code.

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

#### Set up the Authentication portal

Step 12 : Go to the /auth/src directory. Duplicate config_example.js file in the same location, and rename the duplicate to config.js

Step 13 : Set BETA_REQUIRED, PAY_REQUIRED, and VERIFY REQUIRED to the same values as you did in step 9 

```javascript
var config = {
    DEFAULT_API: process.env.REACT_APP_DEFAULT_API || "api.localhost",
    /* change these 3 variables to match step 9 */
    BETA_REQUIRED: process.env.REACT_APP_BETA_REQUIRED || false,
    VERIFY_REQUIRED: process.env.REACT_APP_VERIFY_REQUIRED || false,
    PAY_REQUIRED: process.env.REACT_APP_PAY_REQUIRED || false,
}

export {config}
```

#### Running in Docker

Step 12 : Install docker, in the main directory run 

```bash
docker-compose up --build
```

Step 13 : Try running the web10 example application crm.localhost



## hosting your own web10 node

Once successfully running the web10 system successfully locally, you can get web10 running successfully from google cloud.

#### Getting google cloud and your PC initially set up

Step 1: Install KubeCTL

Step 2 : Install Skaffold

Step 3 : Log into Google Cloud, Start a Google Cloud Kubernetes Autopilot Instance.

Step 4: Connect Google Cloud Kubernetes Autopilot to your computer's terminal by copy pasting the command from Google Cloud that they supply in the dashboard.

#### Making the skaffold files and running skaffold

Step 5 : CD into the skaffold/folder

Step 6 : Make a copy of the run_example called run.

Step 7 : Change "pure-phalanx-344719" in the files of the run folder to match your google cloud project ID.

Step 8 : Go into the run folder and run the command "skaffold run"

#### Exposing the containers and configuring the skaffold files to the domain names / IP addresses of the containers.

Step 9 : Expose all the docker containers in the Kubernetes dashboard.

Step 10 : change the env vars in the yml files in the run folder to match the domains / IPs of the docker containers.

## enjoy

Have fun with web10, use it responsibly, and please give it a star!



## What makes web10 cooler than web3 :)

| feature                              | Description                                                  |
| ------------------------------------ | ------------------------------------------------------------ |
| Hosting Platform Portability         | It is designed entirely through Docker + Kubernetes + Skaffold deployment mechanisms, meaning it can be ported to any cloud provider with Kubernetes, or deployed on bare metal. |
| Provider Self Sufficiency            | The web10 host has charging mechanisms to make sure that account holders pay the provider for the bandwidth and storage they use. |
| Mongo DB Based                       | Web 10 nodes work off of the highly scalable mongo DB framework for Data storage. |
| WebRTC                               | Web 10 makes it easy to use webRTC, and handles the initial identity verification needed to do webRTC properly. |
| TBD [Phone as a Keychain encryption] | Encrypt data on web10 providers without those providers being able to access the data, because the keys are locally stored on your phone. |
| Data interoperability                | Developers can use data from other apps with web10 user permission. |
| Free for Developers                  | Users / web10 providers bear the cloud costs.                |
