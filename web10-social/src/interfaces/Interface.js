import React from 'react';
import mockContacts from '../mocks/MockContacts'
import mockFeed from '../mocks/MockFeed';
import mockWall from '../mocks/MockWall';
import mockChat from '../mocks/MockChat';
import mockIdentity from '../mocks/MockIdentity';
import mockBulletin from '../mocks/MockBulletin';
import web10SocialAdapterInit from './Web10SocialAdapter';
import defaultIdentity from '../mocks/defaultIdentity';
import { onlySettled, sortSettled } from './settledHelpers';
import useState from 'react-usestateref';

function useInterface() {
    const I = {};

    //initialize web10
    I._socialAdapter = React.useRef(null);//initialize this in app initialization.
    I.socialAdapter = I._socialAdapter.current;

    //initialize frontend states
    [I.theme, I.setTheme] = React.useState("dark");
    [I.menuCollapsed, I.setMenuCollapsed] = React.useState(true);
    [I.mode, I._setMode] = React.useState("login");
    [I.search, I.setSearch] = React.useState("");

    [I.contactAddresses, I.setContactAddresses] = React.useState([]);
    [I.contacts, I.setContacts] = React.useState([]);
    [I.currentContact, I.setCurrentContact,I.currentContactRef] = useState(null);
    [I.searchContact, I.setSearchContact] = React.useState(null);

    [I.feedPosts, I.setFeedPosts] = React.useState([]);
    [I.wallPosts, I.setWallPosts] = React.useState([]);

    [I.bulletin, I.setBulletin] = React.useState(mockBulletin);

    [I.identity, I.setIdentity] = React.useState();
    [I.draftIdentity, I.setDraftIdentity] = React.useState(I.identity);

    [I.currentMessages, I.setCurrentMessages,I.currentMessagesRef] = useState([]);
    [I.selectedMessages, I.setSelectedMessages] = React.useState([]);
    [I.typingIndicator, I.setTypingIndicator] = React.useState("Emily is typing ...");

    //frontend functionality
    I.help = function () {
        console.log("the real web10 interface!")
    }

    I.initApp = function () {
        I.socialAdapter.initP2P(I.reloadMessages, "web10-social-device");
        I.setMode("contacts");
        // load contacts
        I.socialAdapter.loadContacts()
            .then((response) => {
                onlySettled(response).then((contacts) => I.setContacts(contacts))
            })
        //load identity
        I.socialAdapter.loadIdentity()
            .then((response) => {
                const provider = I.socialAdapter.readToken()["provider"]
                const username = I.socialAdapter.readToken()["username"]
                const web10 = `${provider}/${username}`
                const id = response.data.length > 0 ?
                    response.data[0] : defaultIdentity(web10)
                I.setIdentity(id);
                I.setDraftIdentity(id);
                return id
            }).then((myID) => {

                //load feed posts
                I.socialAdapter.loadContactAddresses().then((response) => {
                    const feedContacts = [...response.data, myID]
                    onlySettled(feedContacts.map((c) => I.socialAdapter.loadPosts(c.web10)))
                        .then((contactPostsList) => {
                            const feedPosts = [...contactPostsList, I.wallPosts];
                            const sortedPosts = sortSettled(feedPosts)
                            I.setFeedPosts(sortedPosts)
                        })
                })

            })
        //load wall posts
        I.socialAdapter.loadMyPosts().then((response) => {
            I.setWallPosts(response.data.reverse());
        })
    }

    I.login = function () {
        I.socialAdapter.login();
    }
    I.logout = function () {
        I.socialAdapter.signOut();
        I.setMode("login");
        window.location.reload();
    }

    I.runSearch = function (query) {
        function chatFilter(m) {
            return m.message.toLowerCase().includes(query.toLowerCase());
        }
        function contactFilter(c) {
            return c.name.toLowerCase().includes(query.toLowerCase());
        }
        function postFilter(p) {
            return p.html.toLowerCase().includes(query.toLowerCase());
        }

        function filter() {
            switch (I.mode) {

                // chat like pages, that have private messages
                case "chat": return I.setCurrentMessages(mockChat.filter(chatFilter));
                case "chat-edit": return I.setCurrentMessages(mockChat.filter(chatFilter));

                // bio like pages, that have a social-identity and social-bulletin 
                case "bio": return I.setFeedPosts(mockFeed.filter(postFilter));
                case "my-bio": return I.setWallPosts(mockWall.filter(postFilter));
                case "bio-edit": return I.setWallPosts(mockWall.filter(postFilter));
                case "bulletin-edit": return I.setWallPosts(mockWall.filter(postFilter));

                // feed like pages, that consist of posts with images,vids,audio, and html
                case "feed": return I.setFeedPosts(mockFeed.filter(postFilter));

                //case "contacts": return I.setContacts(mockContacts.filter(contactFilter));
            }
        }
        if (I.mode === "contacts") {
            const web10 = query.includes("/") ? query : `api.web10.app/${query}`;
            const [provider, user] = web10.split("/")
            I.socialAdapter.read("identity", {}, user, provider)
                .then((r) => {
                    if (r.data.length > 0) I.setSearchContact(r.data[0])
                })
                .catch((e) => I.setSearchContact(null))
        }
        I.setSearch(query);
    }

    I.getPosts = function (web10) {
        return I.feedPosts.filter((p) => p.web10 === web10)
    }
    I.getContact = function (web10) {
        const cMap = {};
        I.contacts.map((c) => cMap[c.web10] = c);
        return cMap[web10];
    }

    I.isMe = function (web10) {
        return web10 === I.identity.web10
    }


    I.savePostChanges = function (draftPost) {
        I.socialAdapter.editPost(draftPost._id, draftPost.html, draftPost.media).then(() => {
            I.setWallPosts(I.wallPosts.map(p => draftPost._id === p._id ? draftPost : p))
            I.setFeedPosts(I.feedPosts.map(p => draftPost._id === p._id ? draftPost : p))
        })
    }
    I.deletePost = function (id) {
        I.socialAdapter.deletePost(id).then(() => {
            I.setWallPosts(I.wallPosts.filter(p => id !== p._id))
            I.setFeedPosts(I.feedPosts.filter(p => id !== p._id))
        })
    }
    I.createPost = function (draftPost) {
        // for now, randomly generate an id...
        I.socialAdapter.createPost(draftPost).then((response) => {
            const IDedDraftPost = { ...draftPost, id: response.data._id }
            I.setWallPosts([IDedDraftPost].concat(I.wallPosts));
            I.setFeedPosts([IDedDraftPost].concat(I.feedPosts));
        })
    }

    I.addContact = function () {

        I.socialAdapter.addContact(I.searchContact.web10).then((response) => {
            I.setContacts([...I.contacts, I.searchContact]);
            I.runSearch("");
        })
    }

    I.deleteCurrentContact = function () {
        I.setContacts(I.contacts.filter((c) => c._id !== I.currentContact._id));
        I.setMode("contacts");
    }

    I.cancelIdentityChanges = function () {
        I.setDraftIdentity(I.identity);
    }
    I.saveIdentityChanges = function () {
        I.socialAdapter.editIdentity(I.draftIdentity).then(response => {
            console.log(response)
        }).catch((error) => {
            console.log(error)
        });
    }

    I.deleteBulletin = function (id) {
        I.setBulletin(I.bulletin.filter((b) => b._id !== id));
    }

    I.getMessages = function (web10) {
        const messageRequests = [
            I.socialAdapter.loadSentMessages(web10),
            I.socialAdapter.loadRecievedMessages(web10)
        ]
        onlySettled(messageRequests).then((messages) => {
            const sortedMessages = sortSettled(messages, "sentTime", -1);
            I.setCurrentMessages(sortedMessages);
        })
    }

    I.chat = function (web10) {
        I.setCurrentContact(I.getContact(web10))
        I.setMode("chat");
        I.getMessages(web10);
    }

    I.selectMessage = function (id) {
        I.setSelectedMessages(I.currentMessages.filter((m) => m._id === id).concat(I.selectedMessages))
    }
    I.deSelectMessage = function (id) {
        I.setSelectedMessages(I.selectedMessages.filter((m) => m._id !== id))
    }

    I.deleteSelectedMessages = function () {
        I.socialAdapter.deleteMessages(I.selectedMessages).then(() => {
            const current = I.currentMessages.filter((m) => !I.selectedMessages.includes(m))
            I.setCurrentMessages(current);
            I.setSelectedMessages([]);
        })
    }

    I.resetSelectedMessages = function () {
        I.setSelectedMessages([]);
    }

    I.sendMessage = function (messageString) {
        I.socialAdapter.createMessage(messageString, I.currentContact.web10).then(
            (m) => {
                I.setCurrentMessages([...I.currentMessages].concat([m]));
            }
        )
    }

    I.reloadMessages = function (conn, data) {
        const rtcMessage = {...data,direction:"in"};
        if (I.currentContactRef.current.web10===data.web10) I.setCurrentMessages((s)=> [...s,data])
    }

    I.setMode = function (mode) {
        I.setMenuCollapsed(true);
        I.setSearch("")
        I._setMode(mode);
    }

    I.toggleMenuCollapsed = function () {
        I.setMenuCollapsed(!I.menuCollapsed)
    }

    I.toggleTheme = function () {
        I.theme == "dark" ? I.setTheme("light") : I.setTheme("dark")
    }

    React.useEffect(() => {
        const socialAdapter = web10SocialAdapterInit()
        I._socialAdapter.current = socialAdapter
        I.socialAdapter = socialAdapter;
        // inits the web10 portion of the app
        if (I.socialAdapter.isSignedIn()) I.initApp()
        else I.socialAdapter.authListen(I.initApp)
    }, []
    )

    return I;
}

export default useInterface;