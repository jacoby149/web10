const { PeerServer } = require('peer');

const peerServer = PeerServer({
    port: 80,
    path: '/',
    proxied: true
});

peerServer.on('connection', (client) => {
    //certify token with appropriate api server
    // if user2user, facilitate the connection
    // else if user2mobile, facilitate the connection
    return
});

//TODO figure out
peerServer.on('disconnect', (client) => {
    return
});