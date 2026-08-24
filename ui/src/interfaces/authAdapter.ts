import { createV3Client } from 'web10-npm';
import { config } from '../config';

function web10AuthAdapterInit() {
    const host = window.location.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
    const isDev = host === "dev.web10.app" || host.endsWith(".dev.web10.app");
    // Port-aware: isolated e2e stacks (E2E_HTTP_PORT) serve *.localhost on a
    // non-80 port; the API origin must carry the same port. Empty on :80.
    const port = window.location.port ? `:${window.location.port}` : "";
    const v3 = createV3Client({
        apiOrigin: local ? `http://api.localhost${port}` : isDev ? "https://api.dev.web10.app" : config.REACT_APP_API_ORIGIN,
    });
    return { v3 };
}

export default web10AuthAdapterInit;
