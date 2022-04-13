// wapi web client encryption library
{/* <script src="https://unpkg.com/bn.js@4.11.8/lib/bn.js" type="text/javascript"></script>
<script src="https://unpkg.com/@enumatech/secp256k1-js@1.0.0/src/secp256k1.js" type="text/javascript"></script> */}

// Generating private key
const privateKeyBuf = window.crypto.getRandomValues(new Uint8Array(32))
const privateKey = Secp256k1.uint256(privateKeyBuf, 16)

// Generating public key
const publicKey = Secp256k1.generatePublicKeyFromPrivateKeyData(privateKey)
const pubX = Secp256k1.uint256(publicKey.x, 16)
const pubY = Secp256k1.uint256(publicKey.y, 16)

// Signing a digest
const digest = Secp256k1.uint256("483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8", 16)
const sig = Secp256k1.ecsign(privateKey, digest)
const sigR = Secp256k1.uint256(sig.r,16)
const sigS = Secp256k1.uint256(sig.s,16)

// Verifying signature
const isValidSig = Secp256k1.ecverify(pubX, pubY, sigR, sigS, digest)
console.assert(isValidSig === true, 'Signature must be valid')