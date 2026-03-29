(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const twinSync = VF.modules.twinSync = {};
  const CHANNEL_PREFIX = 'byflow_twin_sync_v1_';
  const SNAPSHOT_PREFIX = 'byflow_twin_snapshot_v1_';

  function makeMessageId() {
    return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function channelName(sessionId) {
    return CHANNEL_PREFIX + String(sessionId || '').trim();
  }

  function snapshotKey(sessionId) {
    return SNAPSHOT_PREFIX + String(sessionId || '').trim();
  }

  function parseJSON(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  twinSync.createSessionId = function() {
    return 'twin_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  };

  twinSync.saveSnapshot = function(sessionId, payload) {
    if (!sessionId) return;
    try {
      localStorage.setItem(snapshotKey(sessionId), JSON.stringify(payload));
    } catch {}
  };

  twinSync.loadSnapshot = function(sessionId) {
    if (!sessionId) return null;
    try {
      return parseJSON(localStorage.getItem(snapshotKey(sessionId)));
    } catch {
      return null;
    }
  };

  twinSync.createTransport = function(sessionId, onMessage) {
    const cleanSessionId = String(sessionId || '').trim();
    const name = channelName(cleanSessionId);
    const listeners = [];
    let bc = null;

    function deliver(message) {
      if (!message || message.sessionId !== cleanSessionId) return;
      if (typeof onMessage === 'function') onMessage(message);
    }

    function onStorage(event) {
      if (event.key !== name || !event.newValue) return;
      const payload = parseJSON(event.newValue);
      deliver(payload);
    }

    window.addEventListener('storage', onStorage);
    listeners.push(() => window.removeEventListener('storage', onStorage));

    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(name);
      bc.onmessage = function(event) {
        deliver(event.data);
      };
      listeners.push(() => bc.close());
    }

    return {
      sessionId: cleanSessionId,
      send: function(type, payload) {
        const message = {
          id: makeMessageId(),
          type: type || 'state',
          sessionId: cleanSessionId,
          payload: payload || {},
          ts: Date.now()
        };

        if (bc) {
          try { bc.postMessage(message); } catch {}
        }

        try {
          localStorage.setItem(name, JSON.stringify(message));
          localStorage.removeItem(name);
        } catch {}

        if (type === 'snapshot' || type === 'state') twinSync.saveSnapshot(cleanSessionId, message);
        return message;
      },
      close: function() {
        while (listeners.length) {
          const dispose = listeners.pop();
          try { dispose(); } catch {}
        }
      }
    };
  };
})(window.VibeFlow);
