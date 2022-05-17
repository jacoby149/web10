//does all of the encryption via async storage

// Example : https://github.com/enumatech/secp256k1-js
const crypto = require('crypto')
const assert = require('assert')
const Secp256k1 = require('@enumatech/secp256k1-js')

// Generating private key
const privateKeyBuf = crypto.randomBytes(32)
const privateKey = Secp256k1.uint256(privateKeyBuf, 16)

// Generating public key
const publicKey = Secp256k1.generatePublicKeyFromPrivateKeyData(privateKey)
const pubX = Secp256k1.uint256(publicKey.x, 16)
const pubY = Secp256k1.uint256(publicKey.y, 16)

// Signing a digest
const digest = Secp256k1.uint256("483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8", 16)
const sig = Secp256k1.ecsign(privateKey, digest)

// Verifying signature
const sigR = Secp256k1.uint256(sig.r,16)
const sigS = Secp256k1.uint256(sig.s,16)
const isValidSig = Secp256k1.ecverify(pubX, pubY, sigR, sigS, digest)
assert(isValidSig === true, 'Signature must be valid')


// get a public key from the keychain
function pubKey(label){
  return;
}

// decrypt data with keys from the keychain
// the mask holds the labels to the keys and what fields to decrypt
function decrypt(data,mask){
  return;
}

// decrypt data with keys from the keychain
// the mask holds the labels to the keys and what fields to sign
function sign(data,mask)

// mint a regular key on the keychain, triggers a client error if already minted
function mintKey(label){
  return;
}

// delete a key on the keychain
function deleteKey(label){
  return;
}