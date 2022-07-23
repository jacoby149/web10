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

## Web10 flowchart.



![fig_1](C:\Users\jacks\OneDrive\Documents\GitHub\web10\figures\fig_1.png)



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
if DB_URL == None:
    DB_URL = "mongodb+srv://web10:jSolBGeumNeIBhuk@cluster0.wsy18.mongodb.net/myFirstDatabase?retryWrites=true&w=majority"

```

Step 6 : Go to https://seanwasere.com/generate-random-hex/

Step 7 : Change PRIVATE_KEY to the number you generated on the website.

```python
# change this part in the settings.py file you made to your own PRIVATE_KEY
PRIVATE_KEY = os.environ.get("PRIVATE_KEY")
if PRIVATE_KEY == None:
    PRIVATE_KEY = "8cbec84ebc77c2dd275262a21ba399abfa568123407ec99c9704426cdec95b0a"

```

Step 8 : Set BETA_REQUIRED, PAY_REQUIRED, and VERIFY REQUIRED How you please. 

```python
# set these all to false.
BETA_REQUIRED = False
VERIFY_REQUIRED = False
PAY_REQUIRED = False

# set these if you enabled verification
TWILIO_SERVICE=""
TWILIO_ACCOUNT_SID = ""
TWILIO_AUTH_TOKEN = ""

# set these if you enabled payment
if PROVIDER == "api.localhost" : 
    STRIPE_KEY = "sk_test_"
    STRIPE_CREDIT_SUB_ID = "price_"
    STRIPE_SPACE_SUB_ID = "price_"
else : 
    STRIPE_KEY = "sk_live"
    STRIPE_CREDIT_SUB_ID = "price_"
    STRIPE_SPACE_SUB_ID = "price_"
    


```

Step 9 : Optionally, make Stripe and Twilio accounts for verification and payments and fill out the above details.

Step 10 : Install docker, in the main directory run docker-compose up --build

Step 11 : Try running the web10 example application in docs.web10.app/local_notes_demo



## hosting your own web10 node

Once successfully running the web10 system successfully locally, you can get web10 running successfully from google cloud.

Step 1: Install KubeCTL

Step 2 : Install Skaffold

Step 3 : Log into Google Cloud, Start a Google Cloud Kubernetes Autopilot Instance.

Step 4 : CD into the skaffold/folder

Step 5 : Make copies of the run_example and dev_example folders respectively called run and dev.

Step 6 : in run.sh, change the variables to your google cloud stuff instead of mine.

Step 7 : in the powershell, or shell, type ./run.sh

Step 8 : In google cloud Kubernetes, open the ports on the containers so they are accessible via web.

Step 9 : get a free domain name from [www.freenom.com]

Step 10 : move the domain name over to cloudflare.com

Step 11 : set A names for the domain 

* api.domain => IP of api service
* auth.domain => IP of auth service
* ... => IP of ... service

Step 12 : in settings.py, set the domain names to their respective

...... TO BE CONTINUED 

## features

| feature                              | Description                                                  |
| ------------------------------------ | ------------------------------------------------------------ |
| Hosting Platform Portability         | It is designed entirely through Docker + Kubernetes + Skaffold deployment mechanisms, meaning it can be ported to any cloud provider with Kubernetes, or deployed on bare metal. |
| Provider Self Sufficiency            | The web10 host has charging mechanisms to make sure that account holders pay the provider for the bandwidth and storage they use. |
| TBD [Phone as a Keychain encryption] | Encrypt data on web10 providers without those providers being able to access the data, because the keys are locally stored on your phone. |
| Data interoperability                | Developers can use data from other apps with web10 user permission. |
| Free for Developers                  | Users / web10 providers bear the cloud costs.                |

## diagrams