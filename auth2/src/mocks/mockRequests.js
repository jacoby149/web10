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
        service:"messages",
        cross_origins: ["localhost"],
        whitelist:[{
            username : ".*",
            provider : ".*",
            create : true
        }],
        blacklist:[],
    },
    {
        service:"snake",
        cross_origins: ["localhost"],
        whitelist:[],
        blacklist:[]
    },
];

export default mockRequests;