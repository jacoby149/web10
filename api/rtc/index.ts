import axios from "axios";
import jwt from "jsonwebtoken";
import { PeerServer } from "peer";

interface DecodedToken {
  provider: string;
  username: string;
  site: string;
  [key: string]: unknown;
}

// The base URL the node's /certify endpoint is reached at. Defaults to the
// token's provider over HTTPS (the production shape: https://{provider}/certify).
// Overridable so an HTTP-only stack (the e2e + local dev compose, where the API
// is reachable by its docker service name on the shared network) can point the
// gate at the real API instead of an unreachable https:// host. Without this,
// the gate could never be reached on an HTTP stack and the fail-closed .catch
// below would drop every connection — P2P dead.
const CERTIFY_BASE_URL = process.env.CERTIFY_BASE_URL;

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

  // The node's /certify verifies the token (signature + provider + expiry) and
  // returns 200 only for a valid one. This is the gate: the socket is kept ONLY
  // on a 200. Everything else — a non-200, or the call failing to reach the
  // node at all — closes the socket (fail-closed). The .catch is load-bearing:
  // without it, a certify that can't be reached (e.g. an https:// call against
  // an HTTP-only stack) rejects, the socket is never closed, and P2P "works"
  // for the wrong reason — a corrupted measure that masked the missing
  // /certify endpoint (3.183.2).
  const base = CERTIFY_BASE_URL ?? `https://${decoded.provider}`;
  axios
    .post(`${base}/certify`, { token })
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
    })
    .catch((err) => {
      console.error("certify failed — closing socket:", err?.message ?? err);
      client.getSocket()?.close();
    });
});

peerServer.on("disconnect", (client) => {
  client.getSocket()?.close();
  console.log("disconnected...");
});
