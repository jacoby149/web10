import { createSHA256 } from 'hash-wasm';
const checkedFiles = new WeakMap<Blob, string>();

export async function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('The original file could not be read. Select it again.'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Bounded-memory full-file identity; no whole-movie ArrayBuffer. */
export async function fileChecksum(file: Blob, check: () => void = () => {}) {
  check();
  const cached = checkedFiles.get(file);
  if (cached) return cached;
  const hash = await createSHA256();
  hash.init();
  const chunkSize = 8 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    check();
    const chunk = await readBlob(file.slice(offset, offset + chunkSize));
    check();
    hash.update(new Uint8Array(chunk));
  }
  check();
  const checksum = hash.digest('hex');
  checkedFiles.set(file, checksum);
  return checksum;
}

export async function partChecksum(blob: Blob) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await readBlob(blob)));
  return btoa(String.fromCharCode(...hash));
}
