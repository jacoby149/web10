// The real source-control hook owns one stable SDK client; keep the fixture's
// client identity stable too, rather than restarting its effect every render.
export * from './harness/mock-v3';
import { getV3Client as createClient } from './harness/mock-v3';
const client = createClient();
export function getV3Client() { return client; }
