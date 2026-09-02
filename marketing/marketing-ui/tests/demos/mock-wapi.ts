/**
 * Mock SDK for demo tests. Includes in-memory API store + fetch override.
 * Runs in the page's JS context (loaded as wapi.js), so fetch override works.
 */

export const FAKE_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJwcm92aWRlciI6InRlc3QiLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiZXhwaXJlcyI6IjIwOTktMTAtMTVUMDA6MDA6MDBaIn0.mock';

export const FAKE_TOKEN_PAYLOAD = {
  provider: 'test',
  username: 'testuser',
  expires: '2099-10-15T00:00:00Z',
};

export const MOCK_WAPI_JS = `
(function() {
  var FAKE_TOKEN = '${FAKE_TOKEN}';
  var FAKE_PAYLOAD = ${JSON.stringify(FAKE_TOKEN_PAYLOAD)};
  var authCallbacks = [];

  // In-memory mock store
  var mockStore = {
    notes: [],
    messages: [],
    tasks: [],
    groups: [],
    groupMembers: [],
    fetchCalls: 0,
  };

  function cookieDict() {
    return document.cookie.split(';').reduce(function(res, c) {
      var eq = c.indexOf('=');
      if (eq === -1) return res;
      var key = c.substring(0, eq).trim();
      var val = c.substring(eq + 1).trim();
      try { res[key] = JSON.parse(decodeURIComponent(val)); }
      catch(e) { res[key] = decodeURIComponent(val); }
      return res;
    }, {});
  }

  function readTokenCookie() {
    var cookies = cookieDict();
    var raw = cookies['token'];
    if (!raw) return null;
    try { return typeof raw === 'string' ? raw : String(raw); }
    catch(e) { return null; }
  }

  function setTokenCookie(token) {
    document.cookie = 'token=' + token + ';path=/;max-age=3600;SameSite=Lax;';
  }

  function scrubTokenCookie() {
    document.cookie = 'token=;path=/;max-age=-1;';
  }

  function decodeJwt(token) {
    if (!token) return null;
    try {
      var parts = token.split('.');
      if (parts.length < 2) return null;
      return JSON.parse(atob(parts[1]));
    } catch(e) { return null; }
  }

  // Mock API handler
  function handleMockApi(path, body) {
    body = body || {};
    if (path === 'groups/list') {
      return Promise.resolve([
        { group_id: 'test/groups/web10/discover', my_role: 'member', member_count: 42 },
        { group_id: 'test/groups/users/testuser/followers', my_role: 'owner', member_count: 1 },
      ]);
    }
    if (path === 'read') {
      var service = body.service || body.collection || '';
      if (service === 'web10-docs-note-demo') return Promise.resolve(mockStore.notes.slice());
      if (service === 'web10-docs-message-demo') return Promise.resolve(mockStore.messages.slice());
      if (service === 'web10-docs-task-demo') return Promise.resolve(mockStore.tasks.slice());
      return Promise.resolve([]);
    }
    if (path === 'create') {
      var service = body.service || body.collection || 'default';
      var docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      var created = { doc_id: docId, body: body.body || {}, service: service };
      if (service === 'web10-docs-note-demo') mockStore.notes.push(created);
      else if (service === 'web10-docs-message-demo') mockStore.messages.push(created);
      else if (service === 'web10-docs-task-demo') mockStore.tasks.push(created);
      return Promise.resolve(created);
    }
    if (path === 'update') {
      var docId = body.doc_id;
      var newBody = body.body;
      [mockStore.notes, mockStore.messages, mockStore.tasks].forEach(function(arr) {
        var doc = arr.find(function(d) { return d.doc_id === docId; });
        if (doc && newBody) {
          doc.body = Object.assign({}, doc.body, newBody);
        }
      });
      return Promise.resolve({ doc_id: docId, body: newBody });
    }
    if (path === 'delete') {
      var docId = body.doc_id;
      mockStore.notes = mockStore.notes.filter(function(d) { return d.doc_id !== docId; });
      mockStore.messages = mockStore.messages.filter(function(d) { return d.doc_id !== docId; });
      mockStore.tasks = mockStore.tasks.filter(function(d) { return d.doc_id !== docId; });
      return Promise.resolve({ ok: true });
    }
    if (path === 'app-contracts/add') return Promise.resolve({ ok: true });
    if (path === 'apps/register') return Promise.resolve({ ok: true });
    if (path === 'groups/create') {
      var newGroup = { group_id: 'test/groups/users/testuser/' + (body.name || 'group') };
      mockStore.groups.push(newGroup);
      if (body.members) {
        body.members.forEach(function(m) {
          mockStore.groupMembers.push({
            group_id: newGroup.group_id,
            member_key: m.member_key,
            role: m.role || 'member',
          });
        });
      }
      return Promise.resolve(newGroup);
    }
    if (path === 'groups/members/list') {
      var groupId = body.group_id;
      var members = mockStore.groupMembers.filter(function(m) { return m.group_id === groupId; });
      return Promise.resolve(members);
    }
    if (path === 'groups/invite') {
      var invited = {
        group_id: body.group_id,
        invited_key: body.member_key,
        role: body.role || 'member',
        status: 'invited',
      };
      mockStore.groupMembers.push({
        group_id: body.group_id,
        member_key: body.member_key,
        role: body.role || 'member',
      });
      return Promise.resolve(invited);
    }
    return Promise.resolve({ ok: true });
  }

  // Override fetch to intercept v3 API calls
  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    var urlStr = input instanceof Request ? input.url : (typeof input === 'string' ? input : String(input));
    if (typeof urlStr === 'string' && urlStr.indexOf('/v3/') !== -1) {
      var path = urlStr.split('/v3/')[1];
      if (path) path = path.split('?')[0].split('#')[0];
      var body = {};
      if (init && init.body) {
        try { body = JSON.parse(typeof init.body === 'string' ? init.body : ''); } catch(e) {}
      }
      console.log('[MOCK FETCH]', path, body);
      var result = handleMockApi(path, body);
      return result.then(function(json) {
        console.log('[MOCK RESPONSE]', path, json);
        return new Response(JSON.stringify(json), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });
    }
    return _origFetch(input, init);
  };

  function createV3Client(options) {
    options = options || {};
    var state = {
      apiOrigin: options.apiOrigin || 'https://api.web10.app',
      token: options.token || readTokenCookie(),
    };
    return {
      get state() { return Object.assign({}, state); },
      setToken: function(token) {
        state.token = token;
        setTokenCookie(token);
      },
      scrubToken: function() {
        state.token = null;
        scrubTokenCookie();
      },
      readToken: function() {
        var current = readTokenCookie() || state.token;
        return current ? decodeJwt(current) : null;
      },
      isSignedIn: function() {
        var current = readTokenCookie() || state.token;
        return current != null && current !== '';
      },
      signOut: function() {
        this.scrubToken();
      },
    };
  }

  function openAuthPortal(authOrigin) {
    // no-op in tests
  }

  function authListen(onSignedIn) {
    authCallbacks.push(onSignedIn);
    return function() {
      var idx = authCallbacks.indexOf(onSignedIn);
      if (idx !== -1) authCallbacks.splice(idx, 1);
    };
  }

  window.web10 = {
    createV3Client: createV3Client,
    openAuthPortal: openAuthPortal,
    authListen: authListen,
    cookieDict: cookieDict,
    readTokenCookie: readTokenCookie,
    setTokenCookie: setTokenCookie,
    scrubTokenCookie: scrubTokenCookie,
    decodeJwt: decodeJwt,
    __authCallbacks: authCallbacks,
    __FAKE_TOKEN: FAKE_TOKEN,
    __FAKE_PAYLOAD: FAKE_PAYLOAD,
    __mockStore: mockStore,
  };
})();
`;