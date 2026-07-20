import { wapiInit, wapiAuthInit } from 'web10-npm';
import { config } from '../config';

// Backend origins for non-local builds come from build-time env
// (REACT_APP_AUTH_ORIGIN/REACT_APP_API_ORIGIN/REACT_APP_RTC_ORIGIN or their
// VITE_ aliases — see config.ts), falling back to the web10.app production
// origins. This is what lets a single image serve staging, dev, and prod
// without a code edit — see ubuntu-deployment/AGENT-OPS.md §4.1 and
// .context/laneE-ui-build-args.md for the Dockerfile ARGs a deploy must pass.
function web10AuthAdapterInit() {
    const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const wapi = local ?
        wapiInit("http://auth.localhost", ["http://api.localhost"],"rtc.localhost") :
        wapiInit(config.REACT_APP_AUTH_ORIGIN, [config.REACT_APP_API_ORIGIN], config.REACT_APP_RTC_ORIGIN);
    const wapiAuth = wapiAuthInit(wapi);
    return { wapi, wapiAuth };
}

export default web10AuthAdapterInit;