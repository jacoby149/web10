# web10.0
Users of the internet solely use the internet as clients through their browser. 

web10.0 is a protocol for supplying internet users with their own personal APIs allowing them to use the internet in a new way.

With all users of the internet having their own API's, there can be decentralized peer to peer apps that run entirely in a web browser  (social apps, crypto currencies, and more)

**web10.0 generic record**

```json
{
	"id" : "# ae12 f234 eacd 32ed 8769", //random id
	"address" : "web10server.com/user/service/id",
	"body" : {}
}
```

users of web10.0 have services, or CRUD API endpoints that are a collection of web10.0 generic records. other web10.0 users can utilize the CRUD API endpoints depending on the service records.

when a web10.0 record is sent for RUD, the receiving web10 server checks for auth and whitelist and RUD permissions. if not authenticated and the address is remote, it processes the request it by pinging the given address. upon anti fraud confirmation and token exchange, the web10 server authorizes the user, and  the web10 server executes the API call.

**web10.0 /services record**

```json
[
{
    "id":null,
    "aliases": {
        "mom" : "bevbev45432",
        "me and my bois": ["me", "otherweb10.com/mrsnow","chimdi511","alex333"],
        //me is reserved for your own username
        "family":["mom","poppapop"]
    },
    "payment_options":{
        "bank_card":"1010 2020 3030 4040, 08/24, 987",
        "bank_acct":"03000097, 1010202030",
    }    
},
{
    "id" : "# f234 eacd 32ed 8769 ae12", //random id
    "address" : "web10server.com/user/services/aboveid",
    "body":{
        "service" : "email/feed",
        "cross_origins" : ["email.com","social.com"],
        "active" : true,
        "wallet" : "wallet 1",
        "api_call_limit" : .20, //# units of USD per month
        "api_storage_limit":.30, // perhaps allowing other units would be good
        "whitelist":[
            		  	{
                            user:"me and my bois",
                            "api_call_limit":null, //limitless
                            "api_storage_limit":null,
                            "move_to_blacklist_on_call_limit":false, 
                            "move_to_blacklist_on_storage_limit":false, 
                            "create":true,
                            "read":true,
                            "update":true,
                            "delete":true
                        },
                        {
                            user:"*", //set multiple users with a wildcard
                            "api_call_limit":.02, //units of USD per month
                            "api_storage_limit":.02,
                            "move_to_blacklist_on_call_limit":false, 
                            "move_to_blacklist_on_storage_limit":false, 
                            "create":false,
                            "read":true,
                            "update":false,
                            "delete":false
                        }
                      ],
        "blacklist":[
                        {
                        	user:"charlie",
                            service_suspend:10, //units of days
                            service_ban:false,
                        }
        			]
    }
}
]
```

For each web service, a web10 server has a service record on /services to detail all the logistics of providing the specific service.

making a service record for the service * controls web10 API wide service settings.

the service record with a null id has service metadata such as aliases for usernames, and payment options. 

web10 services is only accessible to you via CRUD as a security measure, but can be over ridden by adding a service record for itself. in fact, all services are only accessible to you via CRUD by default.
