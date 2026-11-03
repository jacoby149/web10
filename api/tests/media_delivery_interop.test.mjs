import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createVerifier } from '../../media-delivery/core.mjs';

test('Python-issued direct and HLS capabilities verify with the real JS verifier', async () => {
  const output = execFileSync('uv', ['run', 'python', '-c', `
import json
import time
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import app.settings as s
from app.services import media_delivery as d
s.MEDIA_DELIVERY_ENABLED = True
s.MEDIA_DELIVERY_BASE = "https://delivery.example"
s.MEDIA_DELIVERY_ISSUER = "interop-node"
s.MEDIA_DELIVERY_AUDIENCE = "interop-media"
s.MEDIA_DELIVERY_KID = "interop-key"
s.MEDIA_DELIVERY_TTL = 60
s.MEDIA_DELIVERY_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
).decode()
now = int(time.time())
d.time.time = lambda: now
key = "alice/../opaque//%2f?# +/" + chr(0x2603)
print(json.dumps({"now": now, "key": key, "bucket": s.S3_BUCKET, "jwks": d.public_jwks(),
    "direct": d.get_url(key), "segment": d.get_url(key, parent_exp=now + 600),
    "longParent": d.get_url(key, parent_exp=now + 900),
    "shortParent": d.get_url(key, parent_exp=now + 120)}))
`], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 30000 });
  const data = JSON.parse(output);
  const verify = await createVerifier({
    issuer: 'interop-node', audience: 'interop-media', bucket: data.bucket,
    jwks: data.jwks, crypto: webcrypto,
  });
  const scope = { bucket: data.bucket, key: data.key };
  assert.deepEqual(await verify(new Request(data.direct), data.now + 59), scope);
  await assert.rejects(verify(new Request(data.direct), data.now + 60));
  for (const url of [data.segment, data.longParent]) {
    assert.deepEqual(await verify(new Request(url), data.now + 61), scope);
    assert.deepEqual(await verify(new Request(url), data.now + 599), scope);
    await assert.rejects(verify(new Request(url), data.now + 600));
  }
  assert.deepEqual(await verify(new Request(data.shortParent), data.now + 61), scope);
  await assert.rejects(verify(new Request(data.shortParent), data.now + 120));
});
