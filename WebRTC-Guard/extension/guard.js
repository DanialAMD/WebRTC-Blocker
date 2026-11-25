/* WebRTC Guard: injected at document_start into the page's MAIN world.
 * Intentional until-reload patch: a website must not be able to switch it off
 * by dispatching DOM events, sending postMessages, or writing storage keys.
 */
(() => {
  'use strict';

  const MESSAGE = 'Blocked by WebRTC Guard';
  const deniedError = () => new DOMException(MESSAGE, 'NotAllowedError');
  function denyConstructor() { throw deniedError(); }
  const denyPromise = () => Promise.reject(deniedError());

  function lockProperty(object, property, replacement) {
    if (!object) return;
    try {
      const original = Object.getOwnPropertyDescriptor(object, property);
      if (original && !original.configurable) return;
      Object.defineProperty(object, property, {
        configurable: false,
        enumerable: original ? original.enumerable : false,
        writable: false,
        value: replacement
      });
    } catch (_) {
      // Browser-owned non-configurable property — cannot safely override.
    }
  }

  // Creating an RTCPeerConnection can gather ICE candidates and discover IPs.
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    if (name in window) lockProperty(window, name, denyConstructor);
  }

  // Deny device and screen capture; these are separate from ICE/IP leakage.
  const devices = navigator.mediaDevices;
  if (devices) {
    for (const name of ['getUserMedia', 'getDisplayMedia']) {
      let owner = devices;
      while (owner && !Object.prototype.hasOwnProperty.call(owner, name)) {
        owner = Object.getPrototypeOf(owner);
      }
      if (owner && owner !== Object.prototype) {
        lockProperty(owner, name, denyPromise);
      }
    }
  }

  // Legacy media capture entry points in older browser/site code.
  for (const name of ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia']) {
    if (!(name in navigator)) continue;
    let owner = navigator;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, name)) {
      owner = Object.getPrototypeOf(owner);
    }
    if (owner && owner !== Object.prototype) {
      lockProperty(owner, name, function (_constraints, _success, failure) {
        if (typeof failure === 'function') failure(deniedError());
        else throw deniedError();
      });
    }
  }
})();
