import { wapiInit, wapiAuthInit } from 'web10-npm';
import { config } from '../config';

// Backend origins for non-local builds come from build-time env
// (REACT_APP_AUTH_ORIGIN/REACT_APP_API_ORIGIN/REACT_APP_RTC_ORIGIN or their
// VITE_ aliases — see config.ts), falling back to the web10.app production
// origins. This is what lets a single image serve staging, dev, and prod
// without a code edit — see ubuntu-deployment/AGENT-OPS.md §4.1 and
// .context/laneE-ui-build-args.md for the Dockerfile ARGs a deploy must pass.
function web10AuthAdapterInit() {
    // Treat any *.localhost host as local — the auth app is served at
    // auth.localhost, NOT "localhost", so the old exact-match check sent it
    // to the production branch and it tried to talk to api.web10.app.
    const host = window.location.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
    const wapi = local ?
        wapiInit("http://auth.localhost", ["http://api.localhost"],"rtc.localhost") :
        wapiInit(config.REACT_APP_AUTH_ORIGIN, [config.REACT_APP_API_ORIGIN], config.REACT_APP_RTC_ORIGIN);

    // Robustness: the published web10-npm SDK builds signup/login/CRUD URLs
    // from `wapi.defaultAPIProtocol`, a field wapiInit never sets (it sets
    // `wapi.APIProtocol`), so those URLs came out "undefined://…" → axios
    // "Unsupported protocol undefined:". The Dockerfile carries a brittle sed
    // to rename the field; make the adapter authoritative instead so it works
    // regardless of whether that sed ran or which SDK build is loaded.
    (wapi as any).defaultAPIProtocol = (wapi as any).APIProtocol;

    const wapiAuth = wapiAuthInit(wapi);
    return { wapi, wapiAuth };
}

export default web10AuthAdapterInit;