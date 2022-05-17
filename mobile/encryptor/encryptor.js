import axios from 'axios';
import { Peer } from 'peerJS';
import crypto from 'crypto';
import Secp256k1 from '@enumatech/secp256k1-js';
import { AsyncStorage } from 'react-native';


/*
encryptor.js - returns an interface object for the encryptor app.
the frontend can do all of it's business with it  
*/

function initEncryptor() {
    var encryptor = {};

    //sends a verification code to a phone number
    encryptor.sendCode = function (phoneNumber) {
        axios.post('https://api.web10.app/send_code', { phone_number: phoneNumber })
            .then((resp) => {
                console.log("sent a code brah")
            })
            .catch((resp) => {
                console.log("idk")
            })
    }

    //logs in with a phone number using a code IF it is associated with a web10 acct.
    encryptor.logIn = function (code, phoneNumber) {
        axios.post('https://api.web10.app/send_code', { phone_number: phoneNumber })
            .then((resp) => {
                console.log("sent a code brah")
            })
            .catch((resp) => {
                console.log("idk")
            })
    }

    //change the password of the wapi encryptor
    encryptor.changePass = function (oldPass, newPass) {

    }

    //export all of the encryptor stored keys.
    encryptor.export() = function () { }

    //import all of the encryptor stored keys.
    encryptor.import() = function () { }

    /********************************************************
     **** P2P (WARN.. duplicated wapi code. its fine tho! )**
    *********************************************************/

    encryptor.peer = null;

    encryptor.peerID = function (provider, user, origin, label) {
        return `${provider} ${user} ${origin} ${label}`.replaceAll(".", "_")
    }

    // initializes the peer and listens for inbound connections
    encryptor.inBound = {}
    encryptor.initP2P = function (onInbound = null, label = "mobile", secure = true) {
        const token = encryptor.readToken();
        var id = encryptor.peerID(token.provider, token.username, token.site, label)
        encryptor.peer = new Peer(id, {
            host: rtcOrigin,
            secure: secure,
            port: secure ? 443 : 80,
            path: '/',
            token: `${encryptor.token}~${label}`,
        })
        if (onInbound) {
            encryptor.peer.on('connection', function (conn) {
                encryptor.inBound[conn.peer] = conn;
                conn.on('data', (data) => onInbound(conn, data));
                conn.on('close', () => delete encryptor.inBound[conn.peer])
            });
        }
    }

    /************************************* 
     * * Encrpytion woo! ******************
    **************************************/

    encryptor.mintKey = function(label){
        // Generating private key
        const privateKeyBuf = crypto.randomBytes(32)
        const privateKey = Secp256k1.uint256(privateKeyBuf, 16)
        //TODO check if the key exists... throw an error if it does
        await AsyncStorage.setItem(
            `@keychain:${label}`,
            privateKey
        );
    }

    encryptor.privKey = function(label){
        const privateKey = await AsyncStorage.getItem(
            `@keychain:${label}`,
        );
        //TODO throw error if private key doesn't exist
        return privateKey
    }

    // get a public key from the keychain
    encryptor.pubKey = function(label) {
        const privateKey = encryptor.privKey(label)
        return Secp256k1.generatePublicKeyFromPrivateKeyData(privateKey)
    }

    // decrypt data with keys from the keychain
    // the mask holds the labels to the keys and what fields to decrypt
    function decrypt(data, mask) {
        data.map((entry)=>{
            for (key in mask){
                const privateKey = encryptor.privKey(mask[key])
                entry[key] = 
            }
        })
        return;
    }

    // decrypt data with keys from the keychain
    // the mask holds the labels to the keys and what fields to sign
    function sign(data, mask)

    // mint a regular key on the keychain, triggers a client error if already minted
    function mintKey(label) {
        return;
    }

    // delete a key on the keychain
    function deleteKey(label) {
        return;
    }

    return encryptor

}