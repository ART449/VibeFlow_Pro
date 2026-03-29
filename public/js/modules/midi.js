(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const midi = VF.modules.midi = {};
  const stateListeners = new Set();
  const messageListeners = new Set();

  let midiAccess = null;
  let learnTicket = null;
  let sysexEnabled = false;

  const state = {
    accessGranted: false,
    sysexEnabled: false,
    inputs: [],
    outputs: [],
    lastMessage: null,
    lastError: '',
    updatedAt: Date.now()
  };

  function now() {
    return Date.now();
  }

  function cleanString(value) {
    return String(value || '').trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hasNavigatorApi(name) {
    return typeof navigator !== 'undefined' && name in navigator;
  }

  function capabilities() {
    return {
      webMidi: hasNavigatorApi('requestMIDIAccess'),
      webHid: hasNavigatorApi('hid'),
      webSerial: hasNavigatorApi('serial')
    };
  }

  function normalizePort(port) {
    return {
      id: cleanString(port && port.id),
      name: cleanString(port && port.name) || 'Sin nombre',
      manufacturer: cleanString(port && port.manufacturer) || 'Fabricante desconocido',
      state: cleanString(port && port.state) || 'unknown',
      connection: cleanString(port && port.connection) || 'unknown',
      type: cleanString(port && port.type) || 'unknown'
    };
  }

  function sortedPorts(collection) {
    if (!collection) return [];
    return Array.from(collection.values())
      .map(normalizePort)
      .sort((a, b) => (a.name + a.manufacturer).localeCompare(b.name + b.manufacturer, 'es', { sensitivity: 'base' }));
  }

  function notifyState() {
    state.updatedAt = now();
    const snapshot = midi.getState();
    stateListeners.forEach((listener) => {
      try { listener(snapshot); } catch {}
    });
  }

  function notifyMessage(message) {
    messageListeners.forEach((listener) => {
      try { listener(clone(message)); } catch {}
    });
  }

  function statusToType(status, data2) {
    const command = status >> 4;
    if (command === 0x8) return 'noteoff';
    if (command === 0x9) return data2 === 0 ? 'noteoff' : 'noteon';
    if (command === 0xA) return 'poly-aftertouch';
    if (command === 0xB) return 'cc';
    if (command === 0xC) return 'program';
    if (command === 0xD) return 'channel-aftertouch';
    if (command === 0xE) return 'pitchbend';
    return 'unknown';
  }

  function messageSignature(message) {
    return [
      cleanString(message.portId) || 'any-port',
      cleanString(message.type) || 'unknown',
      'ch' + String(message.channel || 1),
      'd1-' + String(message.data1 || 0)
    ].join('|');
  }

  function normalizeMessage(bytes, port) {
    const data = Array.isArray(bytes) ? bytes : Array.from(bytes || []);
    const status = Number(data[0] || 0) & 0xFF;
    const data1 = Number(data[1] || 0) & 0xFF;
    const data2 = Number(data[2] || 0) & 0xFF;
    const channel = (status & 0x0F) + 1;
    const type = statusToType(status, data2);
    const pitchValue = type === 'pitchbend' ? ((data2 << 7) | data1) - 8192 : null;

    const message = {
      status,
      channel,
      type,
      data1,
      data2,
      pitchValue,
      bytes: data.map((value) => Number(value) & 0xFF),
      portId: cleanString(port && port.id),
      portName: cleanString(port && port.name),
      manufacturer: cleanString(port && port.manufacturer),
      timestamp: now()
    };

    message.signature = messageSignature(message);
    return message;
  }

  function settleLearn(message, error) {
    if (!learnTicket) return;
    const ticket = learnTicket;
    learnTicket = null;
    clearTimeout(ticket.timerId);
    if (error) ticket.reject(error);
    else ticket.resolve(clone(message));
  }

  function onMidiMessage(event, port) {
    const message = normalizeMessage(event && event.data, port);
    state.lastMessage = message;
    state.lastError = '';
    notifyState();
    settleLearn(message);
    notifyMessage(message);
  }

  function bindInputs() {
    if (!midiAccess || !midiAccess.inputs) return;
    Array.from(midiAccess.inputs.values()).forEach((input) => {
      if (!input || input.__byflowMidiBound) return;
      input.onmidimessage = function(event) {
        onMidiMessage(event, input);
      };
      input.__byflowMidiBound = true;
    });
  }

  function refreshPorts() {
    bindInputs();
    state.accessGranted = !!midiAccess;
    state.sysexEnabled = sysexEnabled;
    state.inputs = midiAccess ? sortedPorts(midiAccess.inputs) : [];
    state.outputs = midiAccess ? sortedPorts(midiAccess.outputs) : [];
    notifyState();
  }

  function sanitizeBytes(bytes) {
    return (Array.isArray(bytes) ? bytes : [])
      .map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))));
  }

  midi.getCapabilityReport = function() {
    return capabilities();
  };

  midi.getState = function() {
    return clone({
      accessGranted: state.accessGranted,
      sysexEnabled: state.sysexEnabled,
      inputs: state.inputs,
      outputs: state.outputs,
      lastMessage: state.lastMessage,
      lastError: state.lastError,
      updatedAt: state.updatedAt,
      capabilities: capabilities()
    });
  };

  midi.subscribe = function(listener) {
    if (typeof listener !== 'function') return function() {};
    stateListeners.add(listener);
    try { listener(midi.getState()); } catch {}
    return function() {
      stateListeners.delete(listener);
    };
  };

  midi.subscribeMessages = function(listener) {
    if (typeof listener !== 'function') return function() {};
    messageListeners.add(listener);
    return function() {
      messageListeners.delete(listener);
    };
  };

  midi.requestAccess = async function(options) {
    if (!hasNavigatorApi('requestMIDIAccess')) {
      const error = new Error('Web MIDI no esta disponible en este navegador.');
      state.lastError = error.message;
      notifyState();
      throw error;
    }

    sysexEnabled = !!(options && options.sysex);

    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: sysexEnabled });
      midiAccess.onstatechange = refreshPorts;
      state.lastError = '';
      refreshPorts();
      return midi.getState();
    } catch (error) {
      state.lastError = error && error.message ? error.message : 'No se pudo abrir Web MIDI.';
      notifyState();
      throw error;
    }
  };

  midi.refreshPorts = function() {
    refreshPorts();
    return midi.getState();
  };

  midi.describeMessage = function(message) {
    if (!message) return 'Sin mensaje capturado';

    const label = {
      noteon: 'Note On',
      noteoff: 'Note Off',
      cc: 'Control Change',
      program: 'Program Change',
      'poly-aftertouch': 'Poly Aftertouch',
      'channel-aftertouch': 'Channel Aftertouch',
      pitchbend: 'Pitch Bend',
      unknown: 'Mensaje desconocido'
    }[cleanString(message.type)] || 'Mensaje MIDI';

    const parts = [label, 'Canal ' + String(message.channel || 1), 'Data1 ' + String(message.data1 || 0)];
    if (cleanString(message.type) === 'pitchbend' && Number.isFinite(message.pitchValue)) {
      parts.push('Valor ' + String(message.pitchValue));
    } else {
      parts.push('Data2 ' + String(message.data2 || 0));
    }
    if (cleanString(message.portName)) parts.push(cleanString(message.portName));
    return parts.join(' · ');
  };

  midi.learnNextMessage = function(timeoutMs) {
    if (learnTicket) {
      return Promise.reject(new Error('Ya hay una captura MIDI en progreso.'));
    }

    const waitMs = Math.max(2000, Math.round(Number(timeoutMs) || 12000));
    return new Promise((resolve, reject) => {
      learnTicket = {
        resolve,
        reject,
        timerId: setTimeout(() => {
          settleLearn(null, new Error('Tiempo agotado esperando mensaje MIDI.'));
        }, waitMs)
      };
    });
  };

  midi.cancelLearn = function() {
    settleLearn(null, new Error('Captura MIDI cancelada.'));
  };

  midi.send = function(outputId, bytes) {
    if (!midiAccess || !midiAccess.outputs) return false;
    const port = Array.from(midiAccess.outputs.values()).find((item) => cleanString(item && item.id) === cleanString(outputId));
    if (!port) return false;
    const payload = sanitizeBytes(bytes);
    if (!payload.length) return false;
    try {
      port.send(payload);
      return true;
    } catch {
      return false;
    }
  };

  midi.messageToBinding = function(message, extras) {
    const source = message || state.lastMessage;
    if (!source) return null;

    return {
      transport: 'midi',
      portId: cleanString(source.portId),
      portName: cleanString(source.portName),
      signature: cleanString(source.signature),
      type: cleanString(source.type),
      channel: Number(source.channel) || 1,
      data1: Number(source.data1) || 0,
      data2Min: Number.isFinite(Number(extras && extras.data2Min)) ? Math.round(Number(extras.data2Min)) : 0,
      data2Max: Number.isFinite(Number(extras && extras.data2Max)) ? Math.round(Number(extras.data2Max)) : 127
    };
  };
})(window.VibeFlow);
