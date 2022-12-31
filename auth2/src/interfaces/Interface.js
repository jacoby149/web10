import React from 'react';
// import mockContacts from '../mocks/MockContacts'
import { wapiInit, wapiAuthInit } from 'web10-npm';

function useInterface() {
    const I = {};

    I.setStatus = function(){
        return;
    }

    I.signup = function(provider,username,password,retype,betacode,phone){
        if (password !== retype) {
            I.setStatus("Failed to Sign Up : Passwords do not match.");
            return;
        }
        else if (username === "" || password === "") {
            I.setStatus("Failed to Sign Up : Must not leave username or password blank");
            return
        }
        else if (phone.length < 7) {
            I.setStatus("Must Enter Phone Number")
        }
        I.setStatus("Signing Up ...");
        I.wapiAuth
            .signUp(provider, username, password, betacode, phone)
            .then(() =>
                I.wapiAuth.logIn(
                    provider,
                    username,
                    password,
                )
                // TODO add a .then, that sets the status + changes the mode. 
                // because I modified this to return a promise.
            )
            .catch((error) =>
                I.setStatus(
                    "Failed to Sign Up : " + error.response.data.detail
                )
            );
    }
    return I;
}

export default useInterface;