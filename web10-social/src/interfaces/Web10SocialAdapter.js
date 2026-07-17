import { wapiInit } from 'web10-npm';
import contactIco from "../assets/images/Contact.png"

function web10SocialAdapterInit() {
    // ports in the convenient web10 functionality into the social adapter.
    const queryParameters = new URLSearchParams(window.location.search)
    const local = queryParameters.get("local")

    const web10SocialAdapter = local ?
        { ...wapiInit("http://auth.localhost", undefined, "rtc.localhost") } :
        { ...wapiInit("https://auth.web10.app", undefined, "rtc.web10.app") }


    web10SocialAdapter.login = function () {
        return web10SocialAdapter.openAuthPortal();
    }

    const sirs = [
        {
            service: "identity",
            cross_origins: ["localhost", "web10social.netlify.app", "social.web10.app"],
            whitelist: [
                {
                    provider: ".*",
                    username: ".*",
                    read: true
                }
            ]
        },
        {
            service: "bulletin",
            cross_origins: ["localhost", "web10social.netlify.app", "social.web10.app"],
            provider: ".*",
            username: ".*",
            read: true
        },
        {
            service: "contact-addresses",
            cross_origins: ["localhost", "web10social.netlify.app", "social.web10.app"],
        },
        {
            service: "message-inbox",
            cross_origins: ["localhost", "web10social.netlify.app", "social.web10.app"],
            whitelist: [
                {
                    provider: ".*",
                    username: ".*",
                    create: true
                }
            ]
        },
        {
            service: "message-outbox",
            cross_origins: ["localhost", "web10social.netlify.app", "social.web10.app"],
        },
        {
            service: "posts",
            cross_origins: ["localhost", "web10social.netlify.app", "social.web10.app"],
            whitelist: [
                {
                    provider: ".*",
                    username: ".*",
                    read: true
                }
            ]
        },
    ];
    web10SocialAdapter.SMROnReady(sirs, []);

    //contact related functions
    web10SocialAdapter.loadContact = function (web10) {
        const [provider, user] = web10.split("/");
        return web10SocialAdapter.read("identity", {}, user, provider).then((response) => {
            //TODO add validation of data...
            if (response.data.length > 0) {
                const webContact = response.data[0]
                return webContact
            }
            else {
                return {
                    //TODO find a cool anonymous PNG
                    web10: web10,
                    name: "anonymous",
                    pic: contactIco,
                    bio: "anonymous"
                }
            }
        })
    }
    web10SocialAdapter.loadContactAddresses = function () {
        return web10SocialAdapter.read("contact-addresses");
    }

    web10SocialAdapter.loadContacts = function () {
        return web10SocialAdapter.loadContactAddresses().then((response) => {
            return response.data.map((c) => web10SocialAdapter.loadContact(c.web10))
        });
    }

    web10SocialAdapter.addContact = function (web10) {
        return web10SocialAdapter
            .create("contact-addresses", {
                web10: web10,
                date_added: new Date(),
            })
    }
    web10SocialAdapter.deleteContact = function (contactID) {
        return web10SocialAdapter.delete("contacts", { _id: contactID })
    }

    web10SocialAdapter.loadIdentity = function () {
        return web10SocialAdapter.read("identity")
    }
    web10SocialAdapter.editIdentity = function ({ web10, pic, name, bio }) {
        const newId = { web10: web10, pic: pic, name: name, bio: bio }
        return web10SocialAdapter.update("identity", {}, { $set: newId })
            .then((response) => {
                if (response.data.matchedCount === 0) {
                    web10SocialAdapter.create("identity", newId)
                }
            })
    }

    //messaging related functions
    web10SocialAdapter.createMessage = function (message, recipient) {
        const [recipientProvider, recipientUsername] = recipient.split("/");
        const toMyOutbox = {
            message: message,
            sentTime: new Date(),
            web10: `${recipientProvider}/${recipientUsername}`
        }
        const toRecipientInbox = {
            message: message,
            sentTime: new Date(),
            web10: `${web10SocialAdapter.readToken().provider}/${web10SocialAdapter.readToken().username}`
        }

        // create the message to the inbox of recipient + your outbox
        return web10SocialAdapter.create("message-inbox", toRecipientInbox, recipientUsername, recipientProvider)
            .then((r) => {
                web10SocialAdapter.send(
                    recipientProvider,
                    recipientUsername,
                    window.location.hostname,
                    "web10-social-device",
                    r.data
                );
                return web10SocialAdapter.create("message-outbox", toMyOutbox);
            }).then((r) => {
                // return the message for the UI
                return {
                    ...r.data,
                    web10: `${web10SocialAdapter.readToken().provider}/${web10SocialAdapter.readToken().username}`,
                    direction: "out"
                }
            })
    }
    web10SocialAdapter.loadRecievedMessages = function (web10) {
        return web10SocialAdapter.read("message-inbox", { web10: web10 })
            .then((r) => {
                return r.data.map(e => {
                    return {
                        ...e,
                        direction: "in"
                    }
                })
            });
    }
    web10SocialAdapter.loadSentMessages = function (web10) {
        return web10SocialAdapter.read("message-outbox", { web10: web10 })
            .then((r) => {
                return r.data.map(e => {
                    return {
                        ...e,
                        direction: "out",
                        web10: `${web10SocialAdapter.readToken().provider}/${web10SocialAdapter.readToken().username}`
                    }
                })
            });
    }

    web10SocialAdapter.deleteMessages = function (messages) {
        const mOut = messages.filter((m) => m.direction === "out")
        const mIn = messages.filter((m) => m.direction === "in")
        const responsesIn = mIn.map((m) => {
            return web10SocialAdapter.delete("message-inbox", { _id: m._id })
        })
        const responsesOut = mOut.map((m) => {
            return web10SocialAdapter.delete("message-outbox", { _id: m._id })
        })
        return Promise.allSettled([responsesIn, responsesOut])
    }

    //post related functions
    web10SocialAdapter.createPost = function ({ html, media }) {
        return web10SocialAdapter.create("posts", {
            html: html,
            media: media,
            time: new Date(),
            web10: `${web10SocialAdapter.readToken().provider}/${web10SocialAdapter.readToken().username}`
        })
    }
    web10SocialAdapter.loadMyPosts = function () {
        return web10SocialAdapter.read("posts");
    }
    web10SocialAdapter.loadPosts = function (web10) {
        const [provider, user] = web10.split("/");
        return web10SocialAdapter.read("posts", {}, user, provider)
            .then((response) => {
                return response.data
            })
    }
    web10SocialAdapter.editPost = function (id, html, media) {
        return web10SocialAdapter.update("posts", { _id: id }, {
            $set: {
                html: html,
                media: media,
            }
        })
    }
    web10SocialAdapter.deletePost = function (id) {
        return web10SocialAdapter.delete("posts", { _id: id })
    }

    web10SocialAdapter.loadBulletins = function () {
        return web10SocialAdapter.read("bulletin");
    }
    web10SocialAdapter.deleteBulletin = function (id) {
        return web10SocialAdapter.delete("bulletin", { _id: id })
    }

    return web10SocialAdapter;
}

export default web10SocialAdapterInit;