const axios = require('axios').default;
var jwt = require('jsonwebtoken');
const { PeerServer } = require('peer');

const peerServer = PeerServer({
    port: 80,
    path: '/',
    proxied: true
});

// check all the invalid conditions, and close the connection if there is an issue
peerServer.on('connection', (client) => {
    console.log("get")
    if (typeof client.token !== "string") {
        client.socket.close()
        return
    }
    var decoded = jwt.decode(client.token);
    if (!decoded) {
        client.socket.close()
        return
    }
    else {
        axios.post(`https://${decoded.provider}/certify`, { token: client.token }).then(
            (response) => {
                if (response.status == 200) {
                    var id = `${decoded.provider} ${decoded.username} ${decoded.site}`;
                    id = id.replaceAll(".", "_")
                    if (client.id === id) {
                        return
                    }
                }
                client.socket.close();
            }
        )
    }
});

peerServer.on('disconnect', (client) => {
    return
});