const mockRequests = [
    {
        service:"contacts",
        cross_origins: ["localhost","crm.web10.app","localhost","crm.web10.app","localhost","crm.web10.app","localhost","crm.web10.app",],
        whitelist:[],
        blacklist:[]
    },
    {
        service:"posts",
        cross_origins: ["localhost"],
        whitelist:[{
            username : ".*",
            provider : ".*",
            read : true
        }],
        blacklist:[]
    },
    {
        service:"identity",
        cross_origins: ["localhost"],
        whitelist:[{
            username : ".*",
            provider : ".*",
            read : true
        }],
        blacklist:[{
            username : "tig57",
            provider : "web10.app",
            read : true
        }],
    },
    {
        service:"messages",
        cross_origins: ["localhost"],
        whitelist:[{
            username : ".*",
            provider : ".*",
            create : true
        }],
        blacklist:[{
            username : "tig57",
            provider : "web10.app",
            create : true
        }],
    },
    {
        service:"notes",
        cross_origins: ["localhost"],
        whitelist:[],
        blacklist:[]
    },
];

export default mockServices;