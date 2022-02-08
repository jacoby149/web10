
const defaultServiceRecord = {
    "whitelist": [], 
    "blacklist": [],
    "body": {
        "service" : "inbox",
        "cross_origins" : ["jacobhoffman.tk/web10social","localhost:8000"],
        "active" : true,
        "banlist":[]
        }   
}
const initialServiceRequest = {
    "create":{
        "query": defaultServiceRecord
    },
    "update":{
        "query": {
            "body.service": "inbox"
        },
        "value": {"$addToSet": {
            "cross_origins" : ["jacobhoffman.tk/web10social","localhost:8000"]
        }} 
    }
    
}

// if wapi.isSignedIn(){
//     axios.get("localhost:5000/web10pubkey").then(function (response) {
//         console.log("response");
//         console.log(response);

//         wapi.PUBLIC_KEY = response.data.PUBLIC_KEY;
//         console.log("we in here");
//         document.cookie = `apiKey=${wapi.apiKey};Secure;path=/`;
//         setAuth(true); 
//     })
//     .catch(function (error) {
//         console.log(error);
//     });
// }