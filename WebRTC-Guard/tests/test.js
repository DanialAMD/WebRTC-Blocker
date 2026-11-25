const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'extension');

async function testBackground() {
  const handlers = {};
  const store = {};
  const scripts = new Map();
  let privacyValue = 'default';
  let owned = false;
  const reloaded = [];
  const calls = [];
  const chrome = {
    runtime: {
      onInstalled: {addListener: f => handlers.installed = f},
      onStartup: {addListener: f => handlers.startup = f},
      onMessage: {addListener: f => handlers.message = f}
    },
    storage: {local: {
      async get(defaults) {
        if (Array.isArray(defaults)) return Object.fromEntries(defaults.map(k => [k, store[k]]));
        return {...defaults, ...store};
      },
      async set(v) {Object.assign(store, v);}
    }},
    scripting: {
      async getRegisteredContentScripts() {return [...scripts.values()];},
      async registerContentScripts(items) {
        for (const i of items) scripts.set(i.id, i);
        calls.push('register');
      },
      async unregisterContentScripts({ids}) {
        ids.forEach(id => scripts.delete(id)); calls.push('unregister');
      }
    },
    privacy: {network: {webRTCIPHandlingPolicy: {
      async set({value}) {owned = true; privacyValue = value; calls.push('privacy.set');},
      async clear() {owned = false; privacyValue = 'default'; calls.push('privacy.clear');},
      async get() {return {value: privacyValue, levelOfControl: owned ? 'controlled_by_this_extension' : 'controllable_by_this_extension'};}
    }}},
    action: {
      async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {}
    },
    tabs: {
      async query() {return [{id: 1, url: 'https://example.com'}, {id: 2, url: 'chrome://extensions'}, {id: 3, url: 'http://example.org'}];},
      async reload(id) {reloaded.push(id);}
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), {chrome, console});

  function message(payload) {
    return new Promise((resolve, reject) => {
      assert.equal(handlers.message(payload, null, resolve), true);
      setTimeout(() => reject(new Error('message timeout')), 1500);
    });
  }

  let r = await message({type: 'getStatus'});
  assert.equal(r.ok, true);
  assert.equal(r.data.enabled, true);
  assert.equal(r.data.registered, true);
  assert.equal(r.data.policy.value, 'disable_non_proxied_udp');
  assert.equal(scripts.size, 1);
  const script = [...scripts.values()][0];
  assert.equal(script.world, 'MAIN');
  assert.equal(script.runAt, 'document_start');
  assert.equal(script.allFrames, true);
  assert.equal(script.matchOriginAsFallback, true);

  r = await message({type: 'setProtection', enabled: false});
  assert.equal(r.ok, true);
  assert.equal(r.data.enabled, false);
  assert.equal(r.data.registered, false);
  assert.equal(privacyValue, 'default');
  assert.equal(r.data.pendingReload, true);

  r = await message({type: 'reloadTabs'});
  assert.equal(r.data.pendingReload, false);
  assert.deepEqual(reloaded, [1,3]);

  r = await message({type: 'setProtection', enabled: true});
  assert.equal(r.data.registered, true);
  assert.equal(r.data.policy.value, 'disable_non_proxied_udp');
  assert.deepEqual(calls, ['register','privacy.set','unregister','privacy.clear','register','privacy.set']);
  console.log('PASS background: install-state, toggles, privacy restore, persistent script, tab reload');
}

async function testGuard() {
  let peerCreated = 0;
  let mediaCalled = 0;
  const window = {RTCPeerConnection: function () {peerCreated++;}};
  const devicesProto = {
    getUserMedia: function () {mediaCalled++; return Promise.resolve('ok');},
    getDisplayMedia: function () {mediaCalled++; return Promise.resolve('ok');}
  };
  const navigator = {mediaDevices: Object.create(devicesProto)};
  const ctx = {window, navigator, DOMException};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'guard.js'), 'utf8'), ctx);
  assert.throws(() => new window.RTCPeerConnection(), {name:'NotAllowedError'});
  assert.equal(peerCreated, 0);
  assert.equal(Object.getOwnPropertyDescriptor(window,'RTCPeerConnection').configurable, false);
  assert.equal(Object.getOwnPropertyDescriptor(window,'RTCPeerConnection').writable, false);
  await assert.rejects(navigator.mediaDevices.getUserMedia(), {name:'NotAllowedError'});
  await assert.rejects(navigator.mediaDevices.getDisplayMedia(), {name:'NotAllowedError'});
  assert.equal(mediaCalled, 0);
  console.log('PASS page guard: peer connection denied, immutable global, media capture rejected');
}

(async () => {await testBackground(); await testGuard();})().catch(err => {console.error(err); process.exit(1);});
