/* KORG logue SDK2 SysEx client: identity, module info, slot status and upload. */

export const KORG = 0x42;

export const MODULES = {
  osc:       { id: 4, slots: 16 },
  modfx:     { id: 1, slots: 16 },
  delfx:     { id: 2, slots: 8  },
  revfx:     { id: 3, slots: 8  },
  genericfx: { id: 7, slots: 50 },
};
export const MODULE_BY_ID = {};
for (const [name, m] of Object.entries(MODULES)) MODULE_BY_ID[m.id] = name;

export const PLATFORMS = {
  1: 'prologue', 2: 'minilogue xd', 3: 'NTS-1 mkI', 4: 'drumlogue',
  5: 'NTS-1 mkII', 6: 'NTS-3', 7: 'microKORG2',
};

export const MSG = {
  USER_MODULE_INFO_REQUEST: 0x18,
  USER_SLOT_STATUS_REQUEST: 0x19,
  CLEAR_USER_SLOT:          0x1B,
  USER_MODULE_INFO:         0x48,
  USER_SLOT_STATUS:         0x49,
  USER_SLOT_DATA:           0x4A,
};
export const STATUS = {
  0x23: 'operation completed',
  0x24: 'operation error',
  0x26: 'data format error',
  0x27: 'user data size error',
  0x28: 'user data CRC error',
  0x29: 'unit is built for a different platform',
  0x2A: 'unit was built against a different API version',
  0x2B: 'unit is too large to load',
  0x2C: 'unknown module',
  0x2D: 'unknown slot',
  0x2E: 'bad unit format',
  0x2F: 'device internal error',
};

export const MAX_HOST_DATA_SIZE = 3573;

export const UNIT_HEADER_SIZE = 0x38;

export const UNIT_PARAM_SIZE = 32;

export const DEVICE_HINTS = [
  { label: 'NTS-1 mkII', pattern: /NTS-1 digital kit mkII/i },
  { label: 'NTS-3', pattern: /NTS-3 kaoss pad kit/i },
];

export function deviceHint(name) {
  const text = String(name || '');
  return DEVICE_HINTS.find((hint) => hint.pattern.test(text)) || null;
}

export class LogueError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'LogueError';
    this.code = code;
    if (details) Object.assign(this, details);
  }
}

export function hex(value, digits) {
  return '0x' + value.toString(16).padStart(digits, '0');
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function hostToMidi(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 7) {
    const n = Math.min(7, bytes.length - i);
    let msb = 0;
    const body = new Array(n);
    for (let b = 0; b < n; b++) {
      const v = bytes[i + b];
      if (v & 0x80) msb |= 1 << b;
      body[b] = v & 0x7F;
    }
    out.push(msb, ...body);
  }
  return out;
}

export function midiToHost(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 8) {
    const msb = data[i];
    for (let b = 0; b < 7 && i + 1 + b < data.length; b++) {
      out.push((data[i + 1 + b] & 0x7F) | (((msb >> b) & 1) << 7));
    }
  }
  return out;
}

export function ascii(bytes) {
  let s = '';
  for (const b of bytes) { if (b === 0) break; if (b >= 0x20 && b < 0x7F) s += String.fromCharCode(b); }
  return s;
}

export function deviceName(port) {
  const name = String((port && port.name) || '');

  if (port && port.group) return String(port.group);
  return name.split(':')[0].trim() || name;
}

export function toBytes(input) {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return Uint8Array.from(input);
}

export function statusText(code) {
  return STATUS[code] || hex(code, 2);
}

export function readUnitHeader(bytes) {
  const direct = parseUnitHeader(bytes, 0);
  if (direct) return direct;
  const section = sectionOffset(bytes, '.unit_header');
  return section === -1 ? null : parseUnitHeader(bytes, section);
}

export function parseUnitHeader(bytes, offset) {
  if (offset < 0 || bytes.length - offset < UNIT_HEADER_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.length - offset);
  const headerSize = view.getUint32(0, true);
  const target = view.getUint32(4, true) & 0xFFFF;
  const platformId = target >> 8;
  const moduleId = target & 0xFF;

  if (headerSize < UNIT_HEADER_SIZE || headerSize % 4 !== 0 || headerSize > bytes.length - offset) return null;
  if (!MODULE_BY_ID[moduleId] || !PLATFORMS[platformId]) return null;

  const numParams = view.getUint32(0x34, true);
  if (numParams > (headerSize - UNIT_HEADER_SIZE) / UNIT_PARAM_SIZE) return null;
  return {
    headerSize, target, moduleId, platformId,
    api: view.getUint32(8, true),
    devId: view.getUint32(12, true),
    unitId: view.getUint32(16, true),
    version: view.getUint32(20, true),
    name: ascii(bytes.subarray(offset + 0x18, offset + 0x18 + 20)),
    numParams,
  };
}

export function sectionOffset(bytes, wanted) {
  if (bytes.length < 0x34) return -1;
  if (bytes[0] !== 0x7F || bytes[1] !== 0x45 || bytes[2] !== 0x4C || bytes[3] !== 0x46) return -1;
  if (bytes[4] !== 1 || bytes[5] !== 1) return -1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const table = view.getUint32(0x20, true);
  const entrySize = view.getUint16(0x2E, true);
  const count = view.getUint16(0x30, true);
  const names = view.getUint16(0x32, true);
  if (!entrySize || table + count * entrySize > bytes.length || names >= count) return -1;

  const strings = table + names * entrySize;
  const stringsAt = view.getUint32(strings + 16, true);
  const stringsEnd = stringsAt + view.getUint32(strings + 20, true);
  if (stringsEnd > bytes.length) return -1;

  for (let i = 0; i < count; i++) {
    const entry = table + i * entrySize;
    const nameAt = stringsAt + view.getUint32(entry, true);
    if (nameAt >= stringsEnd) continue;
    let name = '';
    for (let c = nameAt; c < stringsEnd && bytes[c] !== 0; c++) name += String.fromCharCode(bytes[c]);
    if (name === wanted) return view.getUint32(entry + 16, true);
  }
  return -1;
}

export function describe(header) {
  const platform = PLATFORMS[header.platformId] || hex(header.platformId, 2);
  const module = MODULE_BY_ID[header.moduleId] || hex(header.moduleId, 2);
  return header.name + '  [' + platform + ' ' + module +
    ', dev ' + hex(header.devId, 8) + ' unit ' + hex(header.unitId, 8) +
    ', v' + ((header.version >> 16) & 0xFF) + '.' + ((header.version >> 8) & 0xFF) + '.' + (header.version & 0xFF) +

    ', ' + header.numParams + ' params, ' + header.headerSize + 'B header]';
}

export function packUnit(bytes) {
  const host = new Uint8Array(8 + bytes.length);
  const view = new DataView(host.buffer);
  const crc = crc32(bytes);
  view.setUint32(0, bytes.length, true);
  view.setUint32(4, crc, true);
  host.set(bytes, 8);
  return { host, length: bytes.length, crc };
}

export async function readUnit(source, name) {
  let label = name;
  let contents = source;
  if (source && typeof source.arrayBuffer === 'function') {
    label = label || source.name;
    contents = await source.arrayBuffer();
  }
  const bytes = toBytes(contents);
  const header = readUnitHeader(bytes);
  if (!header) {
    throw new LogueError('bad-file',
      'No unit header in ' + (label || 'that file') + ' -- is it a .nts1mkiiunit or .nts3unit?');
  }
  return { name: label || header.name, bytes, header };
}

export function moduleOf(header) {
  const module = MODULE_BY_ID[header && header.moduleId];
  if (!module) {
    throw new LogueError('bad-file', 'That unit is for module id ' +
      hex((header && header.moduleId) || 0, 2) + ', which is not a logue user module.');
  }
  return module;
}

export function platformOf(header) {
  return PLATFORMS[header && header.platformId] || null;
}

function isSdk2(data, family) {
  return data.length >= 8 && family !== null &&
         data[1] === KORG && data[2] === 0x30 && data[3] === 0x00 && data[4] === 0x01 && data[5] === family;
}

export function payloadOf(data, family) {
  if (!isSdk2(data, family)) return null;
  return { id: data[6], payload: data.slice(7, data.length - 1) };
}

export const isStatusReply = (family) => (d) => isSdk2(d, family) && d[6] >= 0x23 && d[6] <= 0x2F;

export const isIdentityReply = (d) => d.length > 8 && d[1] === 0x7E && d[3] === 0x06 && d[4] === 0x02;
export const isSearchReply = (d) => d.length > 8 && d[1] === KORG && d[2] === 0x50 && d[3] === 0x01;

export const DEFAULT_TIMEOUTS = {
  inquire:    1500,
  probe:       600,
  moduleInfo: 2000,
  slot:       2000,
  clear:      3000,
  packet:     8000,
  verify:     6000,
};

export class Logue {

  constructor({ access, log = () => {}, onStatus = () => {}, autoRelocate = true, autoFind = true, timeouts = {} } = {}) {
    if (!access) throw new LogueError('no-access', 'A transport is required.');
    this.access = access;
    this.log = log;
    this.onStatus = onStatus;
    this.autoFind = autoFind;
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
    this.family = null;
    this.wanted = null;
    this.current = null;
    this.pending = null;
    this.reader = null;
    this.relocating = null;

    this.access.onchange(() => {
      this.family = null;
      this.onStatus('ports-changed');
      this.log('MIDI ports changed; looking for the device again.');
      if (!autoRelocate) return;
      clearTimeout(this.relocating);
      this.relocating = setTimeout(() => { this.findDevice().catch(() => {}); }, 400);
    });
  }

  get connected() {
    return this.selectedPair() !== null;
  }

  listDevices() {
    const { outputs, inputs } = this.access.ports();
    const byName = new Map();
    const entry = (port) => {
      const name = deviceName(port);
      let found = byName.get(name);
      if (!found) byName.set(name, found = { name, outs: [], ins: [] });
      return found;
    };
    for (const out of outputs) entry(out).outs.push(out);
    for (const input of inputs) entry(input).ins.push(input);

    return Array.from(byName.values()).filter((d) => d.outs.length && d.ins.length);
  }

  selectedPair() {
    if (!this.access || !this.current) return null;
    const { outputs, inputs } = this.access.ports();
    const out = outputs.find((o) => o.id === this.current.outId);
    const input = inputs.find((i) => i.id === this.current.inputId);
    return out && input ? { out, input } : null;
  }

  openPorts(chosen) {
    const pair = chosen || this.selectedPair();
    if (!pair) throw new LogueError('no-device', 'No MIDI device selected. Connect first.');
    return { out: pair.out, input: pair.input };
  }

  send(message, timeoutMs, expect, ports) {
    const { out, input } = this.openPorts(ports);

    if (this.reader && this.reader !== input) this.reader.onmidimessage = null;
    this.reader = input;
    return new Promise((resolve, reject) => {
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new Error('superseded by a newer request'));
      }

      let strays = 0;
      const done = (settle, value) => {
        if (strays) this.log('  ' + strays + ' other message' + (strays === 1 ? '' : 's') +
                             ' arrived while waiting, so a reply may be coming in late.');
        settle(value);
      };
      const timer = setTimeout(() => {
        this.pending = null;
        done(reject, new LogueError('no-reply', 'no reply after ' + ((timeoutMs || 5000) / 1000) + 's'));
      }, timeoutMs || 5000);
      this.pending = { resolve: (m) => done(resolve, m), reject, timer };
      const received = [];
      input.onmidimessage = (event) => {
        for (const byte of event.data) {
          if (byte >= 0xF8) continue;
          if (byte === 0xF0) { received.length = 0; received.push(byte); continue; }
          if (!received.length) continue;
          received.push(byte);
          if (byte !== 0xF7) continue;
          const message = Uint8Array.from(received);
          received.length = 0;
          if (expect && !expect(message)) {
            if (this.pending) this.log('ignored a stray ' + hex(message[1], 2) + ' ' + hex(message[2] || 0, 2) + ' message');
            continue;
          }
          if (!this.pending) continue;
          const slot = this.pending;
          this.pending = null;
          clearTimeout(slot.timer);
          slot.resolve(message);
          return;
        }
      };
      out.send(message);
    });
  }

  header() {
    if (this.family === null) throw new LogueError('no-device', 'Not inquired yet.');
    return [KORG, 0x30, 0x00, 0x01, this.family];
  }

  async probe(timeoutMs, ports) {
    const requests = [
      [[0xF0, 0x7E, 0x00, 0x06, 0x01, 0xF7], isIdentityReply],
      [[0xF0, KORG, 0x50, 0x00, 0x55, 0xF7], isSearchReply],
    ];
    for (const [request, matches] of requests) {
      let reply;
      try {
        reply = await this.send(request, timeoutMs, matches, ports);
      } catch (e) {
        continue;
      }

      const identity = reply[1] === 0x7E;
      if ((identity ? reply[5] : reply[1]) !== KORG || reply[6] > 0x7F) continue;
      return {
        family: reply[6],
        major: (reply[13] << 7) | reply[12],
        minor: (reply[11] << 7) | reply[10],
        identity,
      };
    }
    return null;
  }

  showDevice(found) {
    this.log('Device answered (' + (found.identity ? 'identity' : 'search') + ' reply), family ' +
             hex(found.family, 2) + ', SDK ' + found.major + '.' + found.minor + '.', 'ok');
    this.onStatus('found', found);
  }

  async inquire() {
    const ports = this.openPorts();
    this.family = null;
    const found = await this.probe(this.timeouts.inquire, ports);
    if (!found) {

      this.family = null;
      this.onStatus('none');
      throw new LogueError('no-device', 'No SDK2 reply on these ports.');
    }
    this.family = found.family;
    this.showDevice(found);
    return found;
  }

  async inquireIfNeeded() {
    if (this.family !== null) return;
    if (!this.connected && this.autoFind) await this.findDevice();
    if (!this.connected) throw new LogueError('no-device', 'Not connected to a device yet.');
    await this.inquire();
  }

  async findDevice({ name } = {}) {
    this.onStatus('looking');
    const selected = this.selectedPair();

    const inUse = name || this.wanted || (selected ? deviceName(selected.out) : null);
    const keep = selected && inUse && deviceName(selected.out) === inUse;

    const rank = (device) => (device.name === inUse ? 0 : (deviceHint(device.name) ? 1 : 2));
    const groups = this.listDevices().sort((a, b) => rank(a) - rank(b));

    const ordered = [];
    if (keep) ordered.push({ ...selected, first: true });
    for (const device of groups) {
      for (const pair of this.pairsOf(device)) {
        if (keep && pair.out.id === selected.out.id && pair.input.id === selected.input.id) continue;
        ordered.push(pair);
      }
    }

    let answeredOnly = null;

    for (const pair of ordered) {
      const found = await this.probe(pair.first ? this.timeouts.inquire : this.timeouts.probe, pair);
      if (!found) continue;
      this.family = found.family;
      if (!await this.speaksSdk2(pair)) {
        if (!answeredOnly) answeredOnly = { pair, found };
        continue;
      }
      return this.adopt(pair, found);
    }

    if (answeredOnly) {
      const device = this.adopt(answeredOnly.pair, answeredOnly.found);
      this.log('That device answered the identity request but not an SDK2 one, so it is probably not a ' +
               'logue unit. Its family id is in every request now, which is why the slots will read empty.', 'err');
      return device;
    }
    this.family = null;
    this.onStatus('none');
    this.log('No SDK2 device answered on any port pair -- check it is plugged in and awake.', 'err');
    return null;
  }

  pairsOf(device) {
    const pairs = [];
    for (const out of device.outs) {
      for (const input of device.ins) pairs.push({ out, input, device });
    }
    return pairs;
  }

  adopt(pair, found) {
    this.family = found.family;
    this.current = { outId: pair.out.id, inputId: pair.input.id };
    this.wanted = deviceName(pair.out);
    this.log('Device found: ' + this.wanted + '  (' + pair.out.name + ' / ' + pair.input.name + ')');
    this.showDevice(found);
    return this.listDevices().find((d) => d.name === this.wanted) || null;
  }

  async use(deviceOrName) {
    const name = typeof deviceOrName === 'string' ? deviceOrName : deviceOrName && deviceOrName.name;
    this.wanted = name || null;
    this.current = null;
    this.family = null;
    return this.findDevice({ name });
  }

  async speaksSdk2(pair) {
    try {
      const reply = await this.send([0xF0, ...this.header(), MSG.USER_MODULE_INFO_REQUEST, MODULES.osc.id, 0xF7],
                                    this.timeouts.inquire, (d) => isSdk2(d, this.family) && d[6] === MSG.USER_MODULE_INFO, pair);
      return !!payloadOf(reply, this.family);
    } catch (e) {
      return false;
    }
  }

  async moduleInfo(moduleName, timeoutMs) {
    if (!this.access || this.family === null) return null;
    const module = MODULES[moduleName].id;
    let reply;
    try {
      reply = await this.send([0xF0, ...this.header(), MSG.USER_MODULE_INFO_REQUEST, module, 0xF7],
                              timeoutMs || this.timeouts.moduleInfo,
                              (d) => isSdk2(d, this.family) && d[6] === MSG.USER_MODULE_INFO);
    } catch (e) {
      return null;
    }
    const body = payloadOf(reply, this.family);
    if (!body || body.id !== MSG.USER_MODULE_INFO) return null;

    if (body.payload.length <= 1) return { present: false, slots: 0 };
    const host = Uint8Array.from(midiToHost(body.payload.slice(1)));
    const slots = host.length >= 4
      ? new DataView(host.buffer, host.byteOffset + host.length - 4).getUint32(0, true) : 0;
    return { present: true, slots };
  }

  async requireModule(moduleName) {
    if (!MODULES[moduleName]) throw new LogueError('bad-module', 'No such logue module: ' + moduleName);
    const info = await this.moduleInfo(moduleName);
    if (info === null || info.present) return info;
    const have = [];
    for (const name of Object.keys(MODULES)) {
      const other = await this.moduleInfo(name);
      if (other && other.present) have.push(name);
    }
    throw new LogueError('module-missing',
      moduleName + ' is module ' + MODULES[moduleName].id +
      ', and this device has no such module' +
      (have.length ? ' -- it has ' + have.join(', ') + '.' : '.'));
  }

  async slotStatus(moduleName, slot, timeoutMs) {
    await this.inquireIfNeeded();
    const module = MODULES[moduleName].id;
    const reply = await this.send([0xF0, ...this.header(), MSG.USER_SLOT_STATUS_REQUEST, module, slot, 0xF7],
                                  timeoutMs || this.timeouts.slot,
                                  (d) => isSdk2(d, this.family) && d[6] === MSG.USER_SLOT_STATUS);
    const body = payloadOf(reply, this.family);
    if (!body || body.id !== MSG.USER_SLOT_STATUS) throw new LogueError('no-reply', 'unexpected reply');
    if (body.payload.length <= 2) return { present: false, header: null };

    const host = Uint8Array.from(midiToHost(body.payload.slice(3)));
    return { present: true, header: readUnitHeader(host) };
  }

  async scan(moduleName, options = {}) {

    await this.inquireIfNeeded();
    const known = await this.requireModule(moduleName);
    if (known === null) {
      throw new LogueError('no-reply', 'the device did not answer the ' + moduleName + ' question, ' +
        'so its slots cannot be read');
    }
    return this.walk(moduleName, { ...options, known });
  }

  async walk(moduleName, { onSlot, timeoutMs, known } = {}) {
    const count = MODULES[moduleName].slots;
    if (known && known.slots && known.slots !== count) {
      this.log('note: the device reports ' + known.slots + ' ' + moduleName + ' slots, not ' + count, 'err');
    }

    const rows = [];
    const emit = (row) => { rows.push(row); if (onSlot) onSlot(row); };
    let missed = 0;
    let stopped = false;

    for (let slot = 0; slot < count; slot++) {
      const row = { slot, present: null, header: null, answered: false, skipped: false, error: null };
      try {
        const status = await this.slotStatus(moduleName, slot, timeoutMs);
        missed = 0;
        row.answered = true;
        row.present = status.present;
        row.header = status.header;
      } catch (e) {
        row.error = e;
        if (++missed >= 3) {
          stopped = true;
          emit(row);
          for (let rest = slot + 1; rest < count; rest++) {
            emit({ slot: rest, present: null, header: null, answered: false, skipped: true, error: null });
          }
          break;
        }
      }
      emit(row);
    }

    return {
      module: moduleName,
      count,
      rows,
      slots: known.slots,
      answered: rows.filter((r) => r.answered).length,
      filled: rows.filter((r) => r.present).length,
      stopped,
    };
  }

  async clear(moduleName, slot, timeoutMs) {
    await this.inquireIfNeeded();
    const reply = await this.send([0xF0, ...this.header(), MSG.CLEAR_USER_SLOT, MODULES[moduleName].id, slot, 0xF7],
                                  timeoutMs || this.timeouts.clear, isStatusReply(this.family));
    const status = statusOf(reply, this.family);
    if (status !== 0x23) {
      throw new LogueError('rejected', statusText(status), { status, statusText: statusText(status) });
    }
    return true;
  }

  async install(bytes, { module, slot, name = 'unit', checkModule = true, timeoutMs } = {}) {
    if (!MODULES[module]) throw new LogueError('bad-module', 'No such logue module: ' + module);
    const count = MODULES[module].slots;
    if (!Number.isInteger(slot) || slot < 0 || slot >= count) {
      throw new LogueError('bad-slot',
        'Slot "' + slot + '" is outside ' + module + "'s 0.." + (count - 1) + '.');
    }
    await this.inquireIfNeeded();
    if (checkModule) await this.requireModule(module);

    const moduleId = MODULES[module].id;
    const { host, crc } = packUnit(bytes);

    const sequenceMax = Math.floor(host.length / MAX_HOST_DATA_SIZE);
    this.log('Uploading ' + name + ' (' + bytes.length + ' bytes, CRC ' + hex(crc, 8) + ') to ' +
             module + ' slot ' + slot + ' as ' + (sequenceMax + 1) + ' packet(s).');

    for (let sequence = 0; sequence <= sequenceMax; sequence++) {
      const start = sequence * MAX_HOST_DATA_SIZE;
      const chunk = host.subarray(start, Math.min(start + MAX_HOST_DATA_SIZE, host.length));
      const message = [0xF0, ...this.header(), MSG.USER_SLOT_DATA, moduleId, slot, sequence, sequenceMax,
                       ...hostToMidi(chunk), 0xF7];
      let reply;
      try {
        reply = await this.send(message, timeoutMs || this.timeouts.packet, isStatusReply(this.family));
      } catch (e) {
        throw new LogueError(e.code || 'no-reply',
          'packet ' + sequence + '/' + sequenceMax + ' failed: ' + e.message, { sequence, sequenceMax });
      }
      const status = statusOf(reply, this.family);
      if (status !== 0x23) {
        const text = statusText(status);
        throw new LogueError('rejected', 'packet ' + sequence + '/' + sequenceMax + ' rejected: ' + text,
                             { status, statusText: text, sequence, sequenceMax });
      }
      this.log('  packet ' + sequence + '/' + sequenceMax + ' (' + chunk.length + ' bytes) accepted.');
    }
    this.log('Installed ' + name + ' into ' + module + ' slot ' + slot + '.', 'ok');
    return { bytes: bytes.length, crc, packets: sequenceMax + 1 };
  }

  readUnit(source, name) {
    return readUnit(source, name);
  }

  async place(source, { slot, overwrite = false, replaceSameName = true, verify = true, timeoutMs } = {}) {
    const unit = source && source.header ? source : await this.readUnit(source);
    const header = unit.header;
    const module = moduleOf(header);
    const count = MODULES[module].slots;

    await this.inquireIfNeeded();
    await this.requireModule(module);

    const same = (other) => !!other && other.name === header.name;
    let target;
    let previous = null;
    let replaced = false;

    if (slot !== undefined && slot !== null) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= count) {
        throw new LogueError('bad-slot',
          'Slot "' + slot + '" is outside ' + module + "'s 0.." + (count - 1) + '.');
      }
      let status;
      try {
        status = await this.slotStatus(module, slot, timeoutMs);
      } catch (e) {
        throw new LogueError('no-reply', 'slot ' + slot + ' did not answer: ' + e.message);
      }
      if (status.present) {
        previous = status.header;
        if (!overwrite && !(replaceSameName && same(status.header))) {
          throw new LogueError('occupied', module + ' slot ' + slot + ' already holds ' +
            (status.header ? '"' + status.header.name + '"' : 'a unit whose header cannot be read') +
            '. Pass overwrite to replace it.', { slot, module, previous });
        }
        replaced = true;
      }
      target = slot;
      this.log('Placing ' + unit.name + ' in ' + module + ' slot ' + slot +
               (replaced ? ' (replacing ' + (previous ? '"' + previous.name + '"' : 'an unreadable unit') + ')' : '') + '.');
    } else {
      const found = await this.scan(module, { timeoutMs });
      const free = found.rows.find((row) => row.answered && row.present === false);
      if (free) {
        target = free.slot;
      } else {

        if (found.stopped || found.answered === 0) {
          throw new LogueError('no-reply',
            'only ' + found.answered + ' of ' + count + ' ' + module + ' slots answered, so there is no ' +
            'telling which are free. Nothing was written.');
        }
        const match = found.rows.find((row) => row.present && same(row.header));
        if (match && replaceSameName) {
          target = match.slot;
          previous = match.header;
          replaced = true;
        } else {
          throw new LogueError('no-free-slot',
            'all ' + count + ' ' + module + ' slots are taken' +
            (match ? '' : ', and none holds "' + header.name + '"') + '. Nothing was written.');
        }
      }
      this.log('Placing ' + unit.name + ' in ' + module + ' slot ' + target +
               (replaced ? ' (replacing "' + previous.name + '")' : '') + '.');
    }

    const written = await this.install(unit.bytes, {
      module, slot: target, name: unit.name, checkModule: false,
      ...(timeoutMs ? { timeoutMs } : {}),
    });

    let verified = false;
    if (verify) {
      try {
        const status = await this.slotStatus(module, target, this.timeouts.verify);
        verified = !!status.header && status.header.name === header.name;
      } catch (e) {
        verified = false;
      }
      if (!verified) this.log('The device did not report that unit back for ' + module + ' slot ' + target + '.', 'err');
    }

    return {
      module, slot: target, name: unit.name,
      bytes: written.bytes, crc: written.crc, packets: written.packets,
      replaced, previous, verified, header,
    };
  }
}

function statusOf(reply, family) {
  const body = payloadOf(reply, family);
  return body ? body.id : -1;
}
