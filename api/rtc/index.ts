import axios from "axios";
import jwt from "jsonwebtoken";
import { PeerServer } from "peer";

interface DecodedToken {
  provider: string;
  username: string;
  site: string;
  [key: string]: unknown;
}

const peerServer = PeerServer({
  port: 80,
  path: "/",
  proxied: true,
});

peerServer.on("connection", (client) => {
  if (typeof client.token !== "string") {
    client.socket.close();
    return;
  }

  const [token, label] = client.token.split("~");

  const decoded = jwt.decode(token) as DecodedToken | false;
  if (!decoded) {
    client.socket.close();
    return;
  }

  axios
    .post(`https://${decoded.provider}/certify`, { token })
    .then((response) => {
      if (response.status === 200) {
        const id = `${decoded.provider} ${decoded.username} ${decoded.site} ${label}`
          .replaceAll(".", "_");
        console.log(client.id);
        console.log(id);
        if (client.id === id) {
          return;
        }
      }
      client.socket.close();
    });
});

peerServer.on("disconnect", (client) => {
  client.socket.close();
  console.log("disconnected...");
});
