// Node-only acceptance tooling. Never imported by the deployed Worker.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createCacheEvidence(expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw Error('expected hash');
  const warmed = new Set(), cached = new Set(), expired = new Set();
  const unmatched = new Set(), missed = new Set(), controls = new Set();
  const location = observation => {
    if (!/^[A-Z]{3}$/.test(observation.colo ?? '')) throw Error('missing location');
    return observation.colo;
  };
  const body = observation => {
    if (observation.sha256 !== expectedHash) throw Error('body mismatch');
  };
  return {
    warm(observation) {
      if (observation.status !== 200) throw Error('warming failed');
      body(observation);
      warmed.add(location(observation));
    },
    control(kind, observation) {
      if (!['cold', 'range'].includes(kind) || observation.status !== 502) throw Error('origin control failed');
      controls.add(kind);
    },
    disabled(observation) {
      const colo = location(observation);
      if (![200, 502].includes(observation.status)) throw Error('unexpected disabled response');
      if (observation.status === 200) body(observation);
      if (!warmed.has(colo)) unmatched.add(colo);
      else if (observation.status === 200) cached.add(colo);
      else missed.add(colo); // Eviction/cache-write failures remain visible, not a false pass.
    },
    expired(observation) {
      if (observation.status !== 403) throw Error('expired capability accepted');
      expired.add(location(observation));
    },
    result() {
      const proven = [...cached].filter(colo => expired.has(colo));
      return {
        outcome: controls.size === 2 && proven.length ? 'pass' : 'inconclusive',
        warmed: [...warmed].sort(), cached: [...cached].sort(),
        expiredDenied: [...expired].sort(), proven: proven.sort(),
        unmatched: [...unmatched].sort(), matchedMisses: [...missed].sort(),
        originControls: [...controls].sort(),
      };
    },
  };
}

// Exclusive creation: even identical timestamps cannot overwrite earlier evidence.
// Callers supply redacted receipts only; this helper never accepts raw HTTP data.
export async function writeRunReceipt(directory, stage, receipt) {
  if (!/^[a-z][a-z-]{0,40}$/.test(stage)) throw Error('receipt stage');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${stage}-${Date.now()}-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return file;
}
