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
  const rawToken = client.getToken();
  if (typeof rawToken !== "string") {
    client.getSocket()?.close();
    return;
  }

  const [token, label] = rawToken.split("~");

  const decoded = jwt.decode(token) as DecodedToken | false;
  if (!decoded) {
    client.getSocket()?.close();
    return;
  }

  axios
    .post(`https://${decoded.provider}/certify`, { token })
    .then((response) => {
      if (response.status === 200) {
        const id = `${decoded.provider} ${decoded.username} ${decoded.site} ${label}`
          .replaceAll(".", "_");
        console.log(client.getId());
        console.log(id);
        if (client.getId() === id) {
          return;
        }
      }
      client.getSocket()?.close();
    });
});

peerServer.on("disconnect", (client) => {
  client.getSocket()?.close();
  console.log("disconnected...");
});
