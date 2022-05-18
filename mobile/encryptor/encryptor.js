import axios from 'axios';
import { Peer } from 'peerJS';
import crypto from 'crypto';
import { AsyncStorage } from 'react-native';


/*
encryptor.js - returns an interface object for the encryptor app.
the frontend can do all of it's business with it  
*/

function initEncryptor() {
    var encryptor = {};

    /************************
     **** web10 management **
     ************************/

    //TODO will it be NULL if not initted?? 
    encryptor.token = AsyncStorage.getItem(`@manage:token`);

    encryptor.readToken = function () {
        if (!encryptor.token) return null;
        return JSON.parse(atob(encryptor.token.split(".")[1]));
    };


    //TODO is this good enough? should overwrites be allowed?
    encryptor.setToken = function (token) {
        encryptor.token = token;
        await AsyncStorage.setItem(
            `@keychain:${label}`,
            token
        );
    };

    //TODO is it scrubbed? or should the key be deleted
    encryptor.scrubToken = function () {
        await AsyncStorage.setItem(
            `@keychain:${label}`,
            null
        );
        encryptor.token = null;
    };

    //checks if wapi is currently signed in
    wapi.isSignedIn = () => encryptor.token != null;
    //signs out wapi
    wapi.signOut = () => encryptor.scrubToken();

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

    /************************************* 
     * * Encrpytion woo! ******************
    **************************************/

    //gets and sets keys from the keychain
    //TODO associate tokens with hostname
    encryptor.getKeyChain = function (label) {
        AsyncStorage.getItem(`@keychain:${label}`);
    }
    encryptor.setKeyChain = function (label, dump) {
        //should overwrites be allowed???
        //TODO associate tokens with hostname
        await AsyncStorage.setItem(
            `@keychain:${label}`,
            dump
        );
    }

    //mint a key
    encryptor.mintKey = function (label) {
        const keyPair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 520,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: ''
            }
        });
        encryptor.setKeyChain(label, keyPair)
    }

    //decrypt some data via. a keychain mask
    encryptor.decrypt = function (data, mask) {
        data.map((entry) => {
            for (label in mask) {
                const keyPair = encryptor.getKeyChain(label)
                entry[label] = crypto.privateDecrypt(keyPair.privateKey, entry[label])
            }
        })
        return data;
    }

    //sign some data via a keychain mask
    encryptor.sign = function (data, mask) {
        data.map((entry) => {
            for (label in mask) {
                const keyPair = encryptor.getKeyChain(label)
                entry[label] = crypto.sign('SHA256', keyPair.privateKey, entry[label])
            }
        })
        return data;
    }

    //get a public key from the keychain
    encryptor.getPubKey = function (label) {
        return encryptor.getKeyChain(label).publicKey
    }


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

    //req is sent as {type:'blah',data:data,mask:mask,label:label}
    encryptor.listen = function () {
        const inbound = function (conn, req) {
            function process() {
                switch (req["type"]) {
                    case 'mint':
                        return encryptor.mintKey(req["label"])
                    case 'public':
                        return encryptor.getPubKey(req["label"])
                    case 'sign':
                        return encryptor.sign(req["data"], req["mask"])
                    case 'decrypt':
                        return encryptor.decrypt(req["data"], req["mask"])
                    default:
                        return
                }
            }
            conn.peer(process)
        }
        encryptor.initP2P()
    }


    return encryptor
}