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
    // TODO check the length isnt equal to two, 
    // check if the label has invalid characters in it.
    const [token,label] = client.token.split("~");
    var decoded = jwt.decode(token);
    if (!decoded) {
        client.socket.close()
        return
    }
    else {
        axios.post(`https://${decoded.provider}/certify`, { token: token }).then(
            (response) => {
                if (response.status == 200) {
                    var id = `${decoded.provider} ${decoded.username} ${decoded.site} ${label}`;
                    id = id.replaceAll(".", "_")
                    console.log(client.id);
                    console.log(id)
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
    console.log('disconnected...')
    return
});