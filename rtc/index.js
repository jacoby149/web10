const { PeerServer } = require('peer');
const { axios } = require('axios');

const peerServer = PeerServer({
    port: 80,
    path: '/',
    proxied: true
});

// check all the invalid conditions, and close the connection if there is an issue
peerServer.on('connection', (client) => {
    const decoded = decodeToken(client.token)
    if (!decoded)
        client.socket.close()
    else {
        axios.post(`https://${decoded.provider}/certify`,{token:client.token}).then(
            (response)=>{
                if (response.status==200){
                    if (client.id !== `${token.provider}/${token.username}/${token.site}`)
                        client.socket.close();
                }
                else {
                    client.socket.close();
                }
            }
        )
    }
});

// peerServer.on('disconnect', (client) => {
//     return
// });