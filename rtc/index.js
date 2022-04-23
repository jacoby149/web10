const { PeerServer } = require('peer');

const peerServer = PeerServer({
    port: 80,
    path: '/',
    proxied: true
});

peerServer.on('connection', (client) => {
    return
});

peerServer.on('disconnect', (client) => {
    return
});