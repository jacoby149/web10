import { createV3Client } from 'web10-npm';
import { config } from '../config';

function web10AuthAdapterInit() {
    const host = window.location.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
    const v3 = createV3Client({
        apiOrigin: local ? "http://api.localhost" : config.REACT_APP_API_ORIGIN,
    });
    return { v3 };
}

export default web10AuthAdapterInit;
