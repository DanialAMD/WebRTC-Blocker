/* WebRTC Guard — Manifest V3 background worker.
 * No server, telemetry, or external requests.
 * Registration is persistent; existing documents require a reload on mode changes.
 */
'use strict';

const SCRIPT_ID = 'webrtc-guard-main-world';
const PRIVACY_VALUE = 'disable_non_proxied_udp';
let operation = Promise.resolve();

// Prevent concurrent popup/startup messages from changing mode out of order.
function serialized(task) {
  const result = operation.then(task, task);
  operation = result.catch(() => {});
  return result;
}

async function savedState() {
  const data = await chrome.storage.local.get({
    enabled: true,
    pendingReload: false
  });
  return {
    enabled: data.enabled !== false,
    pendingReload: Boolean(data.pendingReload)
  };
}

async function scriptIsRegistered() {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ids: [SCRIPT_ID]});
  return scripts.length > 0;
}

async function applyProtection(enabled) {
  const registered = await scriptIsRegistered();
  if (enabled && !registered) {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: ['<all_urls>'],
      js: ['guard.js'],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: 'document_start',
      world: 'MAIN',
      persistAcrossSessions: true
    }]);
  } else if (!enabled && registered) {
    await chrome.scripting.unregisterContentScripts({ids: [SCRIPT_ID]});
  }

  // Independent layer: restrict the WebRTC IP handling policy.
  // Failure (e.g. administrator policy) is surfaced in the popup.
  let privacyError = null;
  try {
    const setting = chrome.privacy.network.webRTCIPHandlingPolicy;
    if (enabled) {
      await setting.set({value: PRIVACY_VALUE, scope: 'regular'});
    } else {
      // Only removes this extension's preference, does not force Chrome to "default".
      await setting.clear({scope: 'regular'});
    }
  } catch (error) {
    privacyError = error?.message || String(error);
  }

  await chrome.action.setBadgeText({text: enabled ? 'BLOCK' : 'ALLOW'});
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? '#15803d' : '#b45309'
  });
  await chrome.action.setTitle({
    title: enabled ? 'WebRTC Guard: blocking enabled' : 'WebRTC Guard: blocking disabled'
  });
  return privacyError;
}

async function eligibleTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(tab =>
    Number.isInteger(tab.id) && /^https?:\/\//i.test(tab.url || '')
  );
}

async function status(privacyError = null) {
  const state = await savedState();
  const [registered, tabs] = await Promise.all([
    scriptIsRegistered(), eligibleTabs()
  ]);
  let policy = null;
  try {
    const data = await chrome.privacy.network.webRTCIPHandlingPolicy.get({});
    policy = {
      value: data.value,
      control: data.levelOfControl,
      effective: data.value === PRIVACY_VALUE
    };
  } catch (error) {
    privacyError ||= error?.message || String(error);
  }
  return {
    ...state,
    registered,
    tabCount: tabs.length,
    policy,
    privacyError
  };
}

async function initialize(forceReloadFlag = false) {
  const data = await chrome.storage.local.get(['enabled', 'pendingReload']);
  const firstInstall = typeof data.enabled !== 'boolean';
  const enabled = firstInstall ? true : data.enabled;
  if (firstInstall || forceReloadFlag) {
    await chrome.storage.local.set({enabled, pendingReload: true});
  }
  return applyProtection(enabled);
}

chrome.runtime.onInstalled.addListener(() => {
  serialized(() => initialize(true)).catch(error => console.error('Initialization failed:', error));
});

chrome.runtime.onStartup.addListener(() => {
  serialized(() => initialize(false)).catch(error => console.error('Startup sync failed:', error));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !['getStatus', 'setProtection', 'reloadTabs'].includes(message.type)) {
    return false;
  }

  serialized(async () => {
    if (message.type === 'setProtection') {
      if (typeof message.enabled !== 'boolean') {
        throw new Error('Invalid enabled value.');
      }
      await chrome.storage.local.set({
        enabled: message.enabled,
        pendingReload: true
      });
      const error = await applyProtection(message.enabled);
      return status(error);
    }

    if (message.type === 'reloadTabs') {
      const tabs = await eligibleTabs();
      let reloaded = 0;
      for (const tab of tabs) {
        try {
          await chrome.tabs.reload(tab.id);
          reloaded++;
        } catch (error) {
          console.warn('Could not reload tab', tab.id, error);
        }
      }
      if (reloaded === tabs.length) {
        await chrome.storage.local.set({pendingReload: false});
      }
      return {...(await status()), reloaded, attempted: tabs.length};
    }

    // Also repairs any lost registration without changing saved mode.
    const {enabled} = await savedState();
    const error = await applyProtection(enabled);
    return status(error);
  }).then(
    result => sendResponse({ok: true, data: result}),
    error => sendResponse({ok: false, error: error?.message || String(error)})
  );
  return true;
});
