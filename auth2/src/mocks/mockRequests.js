const mockRequests = [
    {
        service:"posts",
        cross_origins: ["schmingley.com"],
        whitelist:[{
            username : ".*",
            provider : ".*",
            read : true
        }],
        blacklist:[]
    },
    {
        service:"snake",
        cross_origins: ["localhost"],
        whitelist:[],
        blacklist:[]
    },
];

export default mockRequests;