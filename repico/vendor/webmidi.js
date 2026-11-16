/* Web MIDI transport for logue.js. */

import { Logue, LogueError } from './logue.js';

/* Cached per port id so an installed reader survives a ports() refresh. */
class Output {
  constructor(port) { this.port = port; }
  get id() { return this.port.id; }
  get name() { return this.port.name; }
  open() { return this.port.open ? this.port.open() : Promise.resolve(); }
  send(bytes) { this.port.send(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)); }
}

class Input {
  constructor(port) { this.port = port; }
  get id() { return this.port.id; }
  get name() { return this.port.name; }
  open() { return this.port.open ? this.port.open() : Promise.resolve(); }
  get onmidimessage() { return this.port.onmidimessage; }
  set onmidimessage(handler) { this.port.onmidimessage = handler; }
}

/* Wrap a MIDIAccess into the transport logue.js expects. */
export function webMidiAccess(midi) {
  /* One cache per direction: the same id can name an input and an output. */
  const outCache = new Map();
  const inCache = new Map();

  const wrap = (cache, port, make) => {
    let wrapper = cache.get(port.id);
    if (!wrapper) cache.set(port.id, wrapper = make(port));
    wrapper.port = port;
    return wrapper;
  };

  return {
    ports() {
      const outputs = Array.from(midi.outputs.values(), (port) => wrap(outCache, port, (p) => new Output(p)));
      const inputs = Array.from(midi.inputs.values(), (port) => wrap(inCache, port, (p) => new Input(p)));
      /* Drop wrappers for ports that are gone. */
      const liveOut = new Set(outputs.map((wrapper) => wrapper.id));
      for (const id of outCache.keys()) if (!liveOut.has(id)) outCache.delete(id);
      const liveIn = new Set(inputs.map((wrapper) => wrapper.id));
      for (const id of inCache.keys()) if (!liveIn.has(id)) inCache.delete(id);
      return { outputs, inputs };
    },
    onchange(handler) {
      midi.onstatechange = handler;
      return () => { if (midi.onstatechange === handler) midi.onstatechange = null; };
    },
  };
}

/* Request Web MIDI and normalise access errors. */
export async function requestWebMidi({ sysex = true } = {}) {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
    throw new LogueError('no-access',
      'This browser has no Web MIDI. Use Chrome, Chromium or Firefox over https:// or http://localhost.');
  }
  try {
    return await navigator.requestMIDIAccess({ sysex });
  } catch (e) {
    throw new LogueError('no-access',
      'MIDI access refused: ' + e.name + '. Web MIDI needs https:// or http://localhost, and sysEx permission.');
  }
}

/* A Logue session over Web MIDI. */
export async function connectMidi({ sysex = true, log = () => {}, ...options } = {}) {
  const midi = await requestWebMidi({ sysex });
  log('MIDI ready. ' + midi.outputs.size + ' output(s), ' + midi.inputs.size + ' input(s).');
  return new Logue({ access: webMidiAccess(midi), log, ...options });
}
