/* ReGINE Pico web interface: unit, parameters, upload and keyboard. */

import { requestWebMidi, webMidiAccess } from './vendor/webmidi.js';
import { Logue, readUnit, midiToHost, hostToMidi } from './vendor/logue.js';
import { readParams } from './unitinfo.js';

const APPNAME = "ReGINE NT Pico"
/* Step selection auditions the note while stopped. Set false for silence. */
const AUDITION_ENABLED = true;
const OSC_MODULE = 4;
const CC_BASE = 21;          /* firmware's CC block for parameters 0..10 */
const NRPN_MSB = 0;          /* OSC EDIT PARAM block */

const $ = (id) => document.getElementById(id);
const connection = $('connection');
const connectionText = $('connectionText');
const unitName = $('unitName');
const unitMeta = $('unitMeta');
const unitFile = $('unitFile');
const uploadBtn = $('uploadBtn');
const knobs = $('knobs');
const knobsEmpty = $('knobsEmpty');
const effectSection = $('effect-section');
const configSection = $('config-section');
const fxName = $('fxName');
const fxKnobs = $('fxKnobs');
const fxEmpty = $('fxEmpty');
const configKnobs = $('configKnobs');
const envMode = $('envMode');
const transportMode = $('transportMode');
const seqSection = $('seq-section');
const seqGrid = $('seqGrid');
const seqKnobs = $('seqKnobs');
const seqStateEl = $('seqState');
const seqSel = $('seqSel');
const seqPlay = $('seqPlay');
const seqStop = $('seqStop');
const seqGate = $('seqGate');
const seqImport = $('seqImport');
const seqExport = $('seqExport');
const seqFile = $('seqFile');
const unitModules = $('unitModules');
const unitSlots = $('unitSlots');
const unitMgmtFile = $('unitMgmtFile');
const logBox = $('log');
const octaveLabel = $('octaveLabel');

let logue = null;
let current = null;        /* { header, params } the oscillator knobs control */
let currentEffect = null;  /* { header, params } the effect knobs control */
let currentConfig = null;  /* { master, depth } percentages */

let activeSlots = { osc: 0, fxModule: 0, fxSlot: 0 };

const UNIT_MODULES = [
    { name: 'osc',   id: 4, count: 16, label: 'OSC'   },
    { name: 'modfx', id: 1, count: 16, label: 'MODFX' },
    { name: 'delfx', id: 2, count: 8,  label: 'DELFX' },
    { name: 'revfx', id: 3, count: 8,  label: 'REVFX' },
];
let unitMgmt = { module: 'osc', pending: null };

const seq = {
    playing: false,
    current: 0,
    cells: Array.from({ length: 64 }, () => ({
        note: 60, velocity: 100, gate: false, length: 50,
    })),
    selected: 0,
    bpm: 120,
    steps: 64,
    built: false,
    cellEls: [],
    noteKnob: null,
    velKnob: null,
    bpmKnob: null,
    stepsKnob: null,
    lenKnob: null,
};
let pending = null;        /* a file read but not uploaded yet */
let piano = null;
let baseOctave = 4;
let logLines = 0;
let connecting = false;
let uploading = false;

/* ---------------------------------------------------------------- logging */

function addLog(text, cls) {
    if (!text) return;
    if (logLines === 0) logBox.innerHTML = '';
    const line = document.createElement('div');
    line.textContent = (cls === 'err' ? 'error: ' : cls === 'ok' ? 'ok: ' : '') + text;
    logBox.appendChild(line);
    if (++logLines > 120) { logBox.removeChild(logBox.firstChild); logLines--; }
    logBox.scrollTop = logBox.scrollHeight;
}

function setConnection(state, text) {
    connection.classList.remove('connected', 'connecting');
    if (state === 'on') connection.classList.add('connected');
    else if (state === 'busy') connection.classList.add('connecting');
    /* The unit and keyboard do nothing without a MIDI pair. The banner's
     * connection state is the only control until there is one. */
    document.body.classList.toggle('connected', state === 'on');
    connectionText.textContent = text;
}

function logMidiPorts() {
    const { outputs, inputs } = logue.access.ports();
    addLog('Outputs: ' + (outputs.map((p) => p.name).join(' | ') || 'none'));
    addLog('Inputs: ' + (inputs.map((p) => p.name).join(' | ') || 'none'));
}

function logSink(text, cls) {
    addLog(text, cls);
    const m = /^  packet (\d+)\/(\d+)/.exec(text || '');
    if (m) unitMeta.textContent = 'Uploading, packet ' + m[1] + '/' + m[2] + '...';
}

function hideDeviceSections() {
    effectSection.hidden = true;
    configSection.hidden = true;
    seqSection.hidden = true;
    currentEffect = null;
    currentConfig = null;
    fxKnobs.innerHTML = '';
    configKnobs.innerHTML = '';
    unitModules.innerHTML = '';
    unitSlots.innerHTML = '';
    unitMgmt.pending = null;
    activeSlots = { osc: 0, fxModule: 0, fxSlot: 0 };
    seqGrid.innerHTML = '';
    seqKnobs.innerHTML = '';
    seq.built = false;
    seq.cellEls = [];
    seq.noteKnob = null;
    seq.velKnob = null;
    seq.bpmKnob = null;
    seq.lenKnob = null;
}

function onStatus(state) {
    if (state === 'looking') {
        setConnection('busy', 'Looking...');
        hideDeviceSections();
    } else if (state === 'found') {
        setConnection('on', 'Connected');
        effectSection.hidden = false;
        configSection.hidden = false;
        seqSection.hidden = false;
        attachFeedback();
        /* The client has one pending request: two concurrent reads would
         * supersede each other. These run in sequence. */
        setTimeout(async () => {
            await refreshActiveSlots();
            await refreshStored();
            await refreshEffect();
            await refreshConfig();
            await refreshSeq();
            await refreshUnits();
        }, 0);
    } else if (state === 'none') {
        setConnection('off', 'Not connected');
        hideDeviceSections();
    } else if (state === 'ports-changed') {
        setConnection('busy', 'Ports changed');
        hideDeviceSections();
    }
}

/* ---------------------------------------------------------------- MIDI out */

function send(bytes) {
    const pair = logue && logue.selectedPair();
    if (!pair) return false;
    pair.out.send(bytes);
    return true;
}

/* ------------------------------------------------------------- MIDI feedback */

/* The device sends a changed parameter the same way the page writes it: NRPN
 * for a unit's block, CC 7/74 for the MIXER values. The page listens on the
 * selected input in addition to logue's reply handler, so a knob moved on the
 * Fire moves here too. Setting a pad-knob's value attribute is visual only;
 * it does not dispatch cc-change, so an echo cannot loop. */
const feedbackNrpn = { msb: null, lsb: null, lo: 0 };

function setKnobValue(state, index, raw) {
    const el = state && state.knobs && state.knobs.get(index);
    if (el) el.setAttribute('value', String(raw));
}

function updateFrom14(state, index, v14) {
    if (!state) return;
    const p = state.params[index];
    if (!p) return;
    const lo = Math.min(p.min, p.max);
    const hi = Math.max(p.min, p.max);
    const raw = hi > lo ? Math.round(lo + (v14 * (hi - lo)) / 16383) : lo;
    setKnobValue(state, index, raw);
}

function updateFrom7(state, index, value) {
    if (!state) return;
    const p = state.params[index];
    if (!p) return;
    const lo = Math.min(p.min, p.max);
    const hi = Math.max(p.min, p.max);
    const raw = hi > lo ? Math.round(lo + (value * (hi - lo)) / 127) : lo;
    setKnobValue(state, index, raw);
}

function handleFeedback(data) {
    if (!data || data.length < 3) return;
    if (data[0] === 0xF0) {
        handleSeqSysEx(data);
        return;
    }
    if ((data[0] & 0xF0) !== 0xB0) return;
    const cc = data[1];
    const value = data[2];

    if (cc === 99) { feedbackNrpn.msb = value; feedbackNrpn.lo = 0; return; }
    if (cc === 98) { feedbackNrpn.lsb = value; return; }
    if (cc === 38) { feedbackNrpn.lo = value; return; }
    if (cc === 6) {
        if (feedbackNrpn.msb === null || feedbackNrpn.lsb === null) return;
        const v = ((value & 0x7F) << 7) | (feedbackNrpn.lo & 0x7F);
        if (feedbackNrpn.msb === 0) {
            updateFrom14(current, feedbackNrpn.lsb, v);
        } else if (currentEffect &&
                   currentEffect.header.moduleId === feedbackNrpn.msb) {
            updateFrom14(currentEffect, feedbackNrpn.lsb, v);
        }
        feedbackNrpn.msb = null;
        feedbackNrpn.lsb = null;
        feedbackNrpn.lo = 0;
        return;
    }
    if (cc === 7) {
        if (currentConfig && currentConfig.knobs.master) {
            currentConfig.knobs.master.setAttribute(
                'value', String(Math.round(value * 100 / 127)));
        }
        return;
    }
    if (cc === 74) {
        if (currentConfig && currentConfig.knobs.depth) {
            currentConfig.knobs.depth.setAttribute(
                'value', String(Math.round(value * 100 / 127)));
        }
        return;
    }
    if (cc >= 21 && cc <= 30) {
        updateFrom7(current, cc - 21, value);
    }
}

function attachFeedback() {
    const pair = logue && logue.selectedPair();
    if (!pair || !pair.input || !pair.input.port) return;
    const port = pair.input.port;
    if (port.__repicoFeedback) return;
    port.__repicoFeedback = (event) => handleFeedback(event.data);
    port.addEventListener('midimessage', port.__repicoFeedback);
}

/* The active slot selection: OSC, and the effect module/slot (module 0 when
 * none). */
async function readActiveSlots() {
    if (!logue || logue.family === null) return null;
    const family = logue.family;
    const reply = await logue.send(
        [0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x1E, 0xF7], 2000,
        (d) => d.length > 8 && d[1] === 0x42 && d[2] === 0x30 &&
               d[5] === family && d[6] === 0x4E);
    const p = reply.slice(7, reply.length - 1);
    if (p.length < 3) return null;
    return { osc: p[0], fxModule: p[1], fxSlot: p[2] };
}

async function refreshActiveSlots() {
    try {
        const active = await readActiveSlots();
        if (active) activeSlots = active;
    } catch (e) {
        /* Older firmware has no selection request; the defaults stay. */
    }
}

/* -------------------------------------------------------------- parameters */

function isPlaceholder(p) {
    return !p.name && p.min === p.max;
}

function visibleParams(info) {
    return (info.params || []).filter((p) => !isPlaceholder(p));
}

function showUnit(info, note) {
    current = info;
    if (current) current.knobs = new Map();
    knobs.innerHTML = '';

    if (!info) {
        unitName.textContent = 'No unit stored';
        document.title = APPNAME;
        unitMeta.textContent = note || 'Connect to the native USB-C port, then upload a unit.';
        knobsEmpty.hidden = false;
        return;
    }

    unitName.textContent = info.header.name;
    document.title = APPNAME + " - " + info.header.name;
    /* The name is the heading; the line below is for status only. */
    unitMeta.textContent = note || '';

    /* A unit may declare a slot it does not use: rg1piano's index 1 has an
     * empty name and min == max. It is not a knob, so it is not drawn. The
     * unfiltered info.params array stays index-aligned with the MIDI CC, which
     * is what sendParam and the cc-change handler address. */
    const params = visibleParams(info);
    if (!params.length) {
        knobsEmpty.hidden = false;
        return;
    }
    knobsEmpty.hidden = true;

    for (const p of params) {
        const lo = Math.min(p.min, p.max);
        const hi = Math.max(p.min, p.max);
        const value = Math.max(lo, Math.min(hi, p.init));

        const el = document.createElement('pad-knob');
        el.setAttribute('label', p.name || ('PARAM ' + (p.index + 1)));
        el.setAttribute('sublabel',
            p.index < 8 ? 'NRPN ' + (p.index + 1) : 'CC ' + (CC_BASE + p.index));
        el.setAttribute('cc', String(p.index));
        el.setAttribute('min', String(lo));
        el.setAttribute('max', String(hi));
        el.setAttribute('value', String(value));
        el.setAttribute('default', String(value));
        knobs.appendChild(el);
        current.knobs.set(p.index, el);
    }
}

function sendParam(p, value) {
    const lo = Math.min(p.min, p.max);
    const hi = Math.max(p.min, p.max);
    if (hi === lo) return;

    const norm = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    if (p.index < 8) {
        /* NRPN: 14-bit data, low byte first (CC 38 before CC 6). */
        const v = Math.round(norm * 16383);
        send([0xB0, 99, NRPN_MSB, 0xB0, 98, p.index,
              0xB0, 38, v & 0x7F, 0xB0, 6, (v >> 7) & 0x7F]);
    } else {
        send([0xB0, CC_BASE + p.index, Math.round(norm * 127)]);
    }
}

knobs.addEventListener('cc-change', (e) => {
    if (!current) return;
    const p = current.params[e.detail.cc];
    if (p) sendParam(p, e.detail.value);
});

/* ----------------------------------------------------------------- effect */

/* One effect position, holding a modfx, delfx or revfx. The device answers the
 * other modules' slot 0 as empty, so asking all three finds the one that is
 * there without a private request. */
async function readEffectSlot(module, slot) {
    if (!logue || logue.family === null) return null;
    const family = logue.family;
    const reply = await logue.send(
        [0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x19, module, slot, 0xF7],
        2000,
        (d) => d.length > 8 && d[1] === 0x42 && d[2] === 0x30 &&
               d[5] === family && d[6] === 0x49);
    const payload = reply.slice(7, reply.length - 1);
    if (payload.length <= 2) return null;
    return readParams(Uint8Array.from(midiToHost(payload.slice(3))));
}

async function readEffect() {
    if (!activeSlots.fxModule) return null;
    return readEffectSlot(activeSlots.fxModule, activeSlots.fxSlot);
}

function showEffect(info) {
    currentEffect = info;
    if (currentEffect) currentEffect.knobs = new Map();
    fxKnobs.innerHTML = '';

    if (!info) {
        fxName.textContent = 'Effects';
        fxEmpty.textContent = 'No effect loaded.';
        fxEmpty.hidden = false;
        return;
    }

    fxName.textContent = info.header.name;

    const params = info.params.filter((p) => !isPlaceholder(p));
    if (!params.length) {
        fxEmpty.textContent = 'This effect declares no parameters.';
        fxEmpty.hidden = false;
        return;
    }
    fxEmpty.hidden = true;

    for (const p of params) {
        const lo = Math.min(p.min, p.max);
        const hi = Math.max(p.min, p.max);
        const value = Math.max(lo, Math.min(hi, p.init));

        const el = document.createElement('pad-knob');
        el.setAttribute('label', p.name || ('PARAM ' + (p.index + 1)));
        el.setAttribute('sublabel', 'NRPN ' + (p.index + 1));
        el.setAttribute('cc', String(p.index));
        el.setAttribute('min', String(lo));
        el.setAttribute('max', String(hi));
        el.setAttribute('value', String(value));
        el.setAttribute('default', String(value));
        fxKnobs.appendChild(el);
        currentEffect.knobs.set(p.index, el);
    }
}

async function refreshEffect() {
    if (!logue || logue.family === null) return;
    try {
        showEffect(await readEffect());
    } catch (e) {
        showEffect(null);
        addLog('Could not read the effect: ' + e.message, 'err');
    }
}

/* The effect's parameter block is the unit's module (1 for modfx, 2 for delfx,
 * 3 for revfx) and the LSB is the parameter index. The oscillator's block is
 * MSB 0. */
function sendFxParam(p, value, moduleId) {
    const lo = Math.min(p.min, p.max);
    const hi = Math.max(p.min, p.max);
    if (hi === lo || p.index > 7) return;

    const norm = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    const v = Math.round(norm * 16383);
    send([0xB0, 99, moduleId, 0xB0, 98, p.index,
          0xB0, 38, v & 0x7F, 0xB0, 6, (v >> 7) & 0x7F]);
}

fxKnobs.addEventListener('cc-change', (e) => {
    if (!currentEffect) return;
    const p = currentEffect.params[e.detail.cc];
    if (p) sendFxParam(p, e.detail.value, currentEffect.header.moduleId);
});

/* ----------------------------------------------------------------- config */

/* The MIXER controls: overall volume (CC 7) and effect depth (CC 74). The
 * values are read with a private request so a change made on the Fire shows
 * here. */
async function readConfig() {
    if (!logue || logue.family === null) return null;
    const family = logue.family;
    const reply = await logue.send(
        [0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x1C, 0xF7],
        2000,
        (d) => d.length > 8 && d[1] === 0x42 && d[2] === 0x30 &&
               d[5] === family && d[6] === 0x4C);
    const p = reply.slice(7, reply.length - 1);
    if (p.length < 2) return null;
    return {
        master: p[0], depth: p[1],
        envMode: p.length >= 10 ? p[2] : 0,
        envA: p.length >= 10 ? (p[4] << 7) | p[3] : 13,
        envD: p.length >= 10 ? (p[6] << 7) | p[5] : 0,
        envS: p.length >= 10 ? p[7] : 100,
        envR: p.length >= 10 ? (p[9] << 7) | p[8] : 267,
        transport: p.length >= 11 ? p[10] : 0,
        channel: p.length >= 12 ? p[11] : 0,
    };
}

function defaultConfig() {
    return { master: 100, depth: 100, envMode: 0,
             envA: 13, envD: 0, envS: 100, envR: 267, transport: 0,
             channel: 0 };
}

function showConfig(config) {
    currentConfig = { ...config, knobs: {} };
    configKnobs.innerHTML = '';
    envMode.textContent = config.envMode ? 'ENV OPEN' : 'ENV ADSR';
    transportMode.textContent = config.transport
        ? 'TRANSPORT SLAVE' : 'TRANSPORT MASTER';

    const items = [
        { label: 'VOLUME', sub: 'MASTER', cc: 0, min: 0, max: 100, value: config.master },
        { label: 'FX DEPTH', sub: 'FX', cc: 1, min: 0, max: 100, value: config.depth },
        { label: 'ATTACK', sub: 'ENV', cc: 2, min: 0, max: 2000, value: config.envA },
        { label: 'DECAY', sub: 'ENV', cc: 3, min: 0, max: 2000, value: config.envD },
        { label: 'SUSTAIN', sub: 'ENV', cc: 4, min: 0, max: 100, value: config.envS },
        { label: 'RELEASE', sub: 'ENV', cc: 5, min: 0, max: 4000, value: config.envR },
        { label: 'CHANNEL', sub: '0 = OMNI', cc: 6, min: 0, max: 16, value: config.channel },
    ];
    for (const item of items) {
        const el = document.createElement('pad-knob');
        el.setAttribute('label', item.label);
        el.setAttribute('sublabel', item.sub);
        el.setAttribute('cc', String(item.cc));
        el.setAttribute('min', String(item.min));
        el.setAttribute('max', String(item.max));
        el.setAttribute('value', String(item.value));
        el.setAttribute('default', String(item.value));
        configKnobs.appendChild(el);
        currentConfig.knobs[item.cc] = el;
    }
}

function applyConfig(config) {
    if (!currentConfig || !currentConfig.knobs || !currentConfig.knobs[0]) {
        showConfig(config);
        return;
    }
    currentConfig.master = config.master;
    currentConfig.depth = config.depth;
    currentConfig.envMode = config.envMode;
    currentConfig.envA = config.envA;
    currentConfig.envD = config.envD;
    currentConfig.envS = config.envS;
    currentConfig.envR = config.envR;
    currentConfig.transport = config.transport;
    currentConfig.channel = config.channel;
    const values = { 0: config.master, 1: config.depth, 2: config.envA,
                     3: config.envD, 4: config.envS, 5: config.envR,
                     6: config.channel };
    for (const cc of Object.keys(values)) {
        const el = currentConfig.knobs[cc];
        if (el) el.setAttribute('value', String(values[cc]));
    }
    envMode.textContent = config.envMode ? 'ENV OPEN' : 'ENV ADSR';
    transportMode.textContent = config.transport
        ? 'TRANSPORT SLAVE' : 'TRANSPORT MASTER';
}

async function refreshConfig() {
    if (!logue || logue.family === null) return;
    attachFeedback();
    try {
        const config = await readConfig();
        showConfig(config || defaultConfig());
    } catch (e) {
        showConfig(defaultConfig());
    }
}

function setEnv(field, value) {
    if (!logue || logue.family === null) return;
    const v = Math.max(0, Math.round(value));
    send([0xF0, 0x42, 0x30, 0x00, 0x01, logue.family, 0x1D, field,
          v & 0x7F, (v >> 7) & 0x7F, 0xF7]);
}

envMode.addEventListener('click', () => {
    if (!currentConfig) return;
    const mode = currentConfig.envMode ? 0 : 1;
    currentConfig.envMode = mode;
    envMode.textContent = mode ? 'ENV OPEN' : 'ENV ADSR';
    setEnv(0, mode);
});

transportMode.addEventListener('click', () => {
    if (!logue || logue.family === null || !currentConfig) return;
    const mode = currentConfig.transport ? 0 : 1;
    currentConfig.transport = mode;
    transportMode.textContent = mode
        ? 'TRANSPORT SLAVE' : 'TRANSPORT MASTER';
    send([0xF0, 0x42, 0x30, 0x00, 0x01, logue.family, 0x26, mode, 0xF7]);
});

configKnobs.addEventListener('cc-change', (e) => {
    const cc = e.detail.cc;
    const value = e.detail.value;
    if (cc === 0) {
        send([0xB0, 7, Math.round(Math.max(0, Math.min(100, value)) * 127 / 100)]);
    } else if (cc === 1) {
        send([0xB0, 74, Math.round(Math.max(0, Math.min(100, value)) * 127 / 100)]);
    } else if (cc === 6) {
        if (!logue || logue.family === null) return;
        const channel = Math.max(0, Math.min(16, Math.round(value)));
        currentConfig.channel = channel;
        send([0xF0, 0x42, 0x30, 0x00, 0x01, logue.family, 0x27,
              channel, 0xF7]);
    } else {
        setEnv(cc - 1, value);
    }
});

/* --------------------------------------------------------------- sequencer */

function seqMakeKnob(label, sublabel, cc) {
    const el = document.createElement('pad-knob');
    el.setAttribute('label', label);
    el.setAttribute('sublabel', sublabel);
    el.setAttribute('cc', String(cc));
    el.setAttribute('min', '1');
    el.setAttribute('max', '127');
    el.setAttribute('value', '60');
    el.setAttribute('default', '60');
    return el;
}

async function readSeqState() {
    if (!logue || logue.family === null) return null;
    const family = logue.family;
    const reply = await logue.send(
        [0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x20, 0xF7], 2000,
        (d) => d.length > 8 && d[1] === 0x42 && d[2] === 0x30 &&
               d[5] === family && d[6] === 0x50);
    const p = reply.slice(7, reply.length - 1);
    if (p.length < 5) return null;
    const steps = p[2] >= 1 && p[2] <= 64 ? p[2] : 64;
    return { playing: p[0] !== 0, current: p[1], steps,
             bpm: (p[4] << 7) | p[3] };
}

async function readSeqCells() {
    if (!logue || logue.family === null) return null;
    const family = logue.family;
    const reply = await logue.send(
        [0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x21, 0xF7], 3000,
        (d) => d.length > 8 && d[1] === 0x42 && d[2] === 0x30 &&
               d[5] === family && d[6] === 0x51);
    const host = Uint8Array.from(midiToHost(reply.slice(7, reply.length - 1)));
    if (host.length < 256) return null;
    return Array.from({ length: 64 }, (_, i) => ({
        note: host[i * 4],
        velocity: host[i * 4 + 1],
        gate: host[i * 4 + 2] !== 0,
        length: (host[i * 4 + 3] || 1) * 50,
    }));
}

function paintSeqCell(step) {
    const el = seq.cellEls[step];
    if (!el) return;
    const c = seq.cells[step];
    el.classList.toggle('gate', c.gate);
    el.title = 'Step ' + (step + 1) + ', note ' + c.note +
               ', velocity ' + c.velocity + ', length ' + c.length + '%' +
               (c.gate ? ', on' : ', off') +
               (step >= seq.steps ? ', outside the pattern' : '');
}

function paintSeqState() {
    for (let i = 0; i < 64; i++) {
        paintSeqCell(i);
        const el = seq.cellEls[i];
        if (!el) continue;
        el.classList.toggle('selected', i === seq.selected);
        el.classList.toggle('current', seq.playing && i === seq.current);
        el.classList.toggle('out', i >= seq.steps);
    }
    seqStateEl.textContent = (seq.playing ? 'Playing' : 'Stopped') +
        ', step ' + (seq.current + 1) + '/' + seq.steps + ', ' +
        seq.bpm + ' BPM';
    if (seq.bpmKnob) seq.bpmKnob.setAttribute('value', String(seq.bpm));
    if (seq.stepsKnob) {
        seq.stepsKnob.setAttribute('value', String(seq.steps));
    }
    seqPlay.disabled = seq.playing;
    seqStop.disabled = !seq.playing;
}

function updateSeqEditor() {
    const c = seq.cells[seq.selected];
    if (!c) return;
    seqSel.textContent = 'Step ' + (seq.selected + 1) +
        ', note ' + c.note + ', velocity ' + c.velocity +
        ', length ' + c.length + '%';
    if (seq.noteKnob) seq.noteKnob.setAttribute('value', String(c.note));
    if (seq.velKnob) seq.velKnob.setAttribute('value', String(c.velocity));
    if (seq.lenKnob) seq.lenKnob.setAttribute('value', String(c.length));
    if (seqGate) seqGate.textContent = c.gate ? 'Gate On' : 'Gate Off';
}

function showSeq() {
    if (!seq.built) {
        seqGrid.innerHTML = '';
        seq.cellEls = [];
        for (let i = 0; i < 64; i++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'seq-cell';
            cell.addEventListener('click', () => onSeqCellClick(i));
            seqGrid.appendChild(cell);
            seq.cellEls.push(cell);
        }

        seqKnobs.innerHTML = '';
        seq.noteKnob = seqMakeKnob('NOTE', 'STEP', 0);
        seq.velKnob = seqMakeKnob('VELOCITY', 'STEP', 1);
        seq.bpmKnob = seqMakeKnob('BPM', 'TEMPO', 2);
        seq.bpmKnob.setAttribute('min', '30');
        seq.bpmKnob.setAttribute('max', '300');
        seq.bpmKnob.setAttribute('value', String(seq.bpm));
        seq.bpmKnob.setAttribute('default', String(seq.bpm));
        seq.stepsKnob = seqMakeKnob('STEPS', 'PATTERN', 4);
        seq.stepsKnob.setAttribute('min', '1');
        seq.stepsKnob.setAttribute('max', '64');
        seq.stepsKnob.setAttribute('value', String(seq.steps));
        seq.stepsKnob.setAttribute('default', '64');
        seq.lenKnob = seqMakeKnob('LENGTH', 'STEP', 3);
        seq.lenKnob.setAttribute('min', '50');
        seq.lenKnob.setAttribute('max', '6350');
        seq.lenKnob.setAttribute('value', String(seq.cells[seq.selected].length));
        seq.lenKnob.setAttribute('default', '50');
        seqKnobs.appendChild(seq.noteKnob);
        seqKnobs.appendChild(seq.velKnob);
        seqKnobs.appendChild(seq.bpmKnob);
        seqKnobs.appendChild(seq.stepsKnob);
        seqKnobs.appendChild(seq.lenKnob);
        seq.built = true;
    }
    updateSeqEditor();
    paintSeqState();
}

async function refreshSeq() {
    if (!logue || logue.family === null) return;
    try {
        const state = await readSeqState();
        if (state) {
            seq.playing = state.playing;
            seq.current = state.current;
            seq.steps = state.steps;
            seq.bpm = state.bpm;
        }
        const cells = await readSeqCells();
        if (cells) seq.cells = cells;
    } catch (e) {
        addLog('Could not read the sequencer: ' + e.message, 'err');
    }
    showSeq();
}

/* Edits are fire-and-forget, like electrik's page: the device broadcasts the
 * resulting cell and state, and that is what settles the grid. A request/reply
 * per knob movement would also collide with the client's one pending request. */
function setSeqCell(step, field, value) {
    if (!logue || logue.family === null || step >= 64) return;
    const family = logue.family;
    const cell = seq.cells[step];

    if (field === 0) cell.note = Math.max(1, Math.min(127, value));
    else if (field === 1) cell.velocity = Math.max(1, Math.min(127, value));
    else if (field === 2) cell.gate = value !== 0;
    else if (field === 3) {
        const units = Math.max(1, Math.min(127, Math.round(value / 50)));
        cell.length = units * 50;
        value = units;
    }
    paintSeqState();
    if (seq.selected === step) updateSeqEditor();

    send([0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x22, step, field, value,
          0xF7]);
}

function sendSeqBpm(value) {
    if (!logue || logue.family === null) return;
    const family = logue.family;
    const bpm = Math.max(30, Math.min(300, Math.round(value)));
    seq.bpm = bpm;
    paintSeqState();
    send([0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x24,
          bpm & 0x7F, (bpm >> 7) & 0x7F, 0xF7]);
}

function sendSeqSteps(value) {
    if (!logue || logue.family === null) return;
    const family = logue.family;
    const steps = Math.max(1, Math.min(64, Math.round(value)));
    if (steps === seq.steps) return;
    seq.steps = steps;
    if (seq.current >= seq.steps) seq.current = seq.current % seq.steps;
    paintSeqState();
    send([0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x25, steps, 0xF7]);
}

function sendSeqTransport(play) {
    if (!logue || logue.family === null) return;
    const family = logue.family;
    seq.playing = !!play;
    if (play) seq.current = 0;
    paintSeqState();
    send([0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x23, play ? 1 : 0, 0xF7]);
}

/* ---------------------------------------------------- MIDI file transfer */

/* A Standard MIDI File, format 0 (one track), 480 ticks per quarter note.
 * A step is a 16th, 120 ticks. The web keeps a step's length as a percentage
 * of the step, so the note-off lands length/100 of 120 ticks after the note-on,
 * which is where the sequencer releases it. A length over 100% puts the
 * note-off into the following step, and the file keeps that overlap. */
const MIDI_PPQN = 480;
const MIDI_STEP_TICKS = MIDI_PPQN / 4;

function midiVarLen(value) {
    const out = [value & 0x7F];
    value = Math.floor(value / 128);
    while (value > 0) {
        out.unshift((value & 0x7F) | 0x80);
        value = Math.floor(value / 128);
    }
    return out;
}

function midiMeta(type, data) {
    return [0xFF, type, ...midiVarLen(data.length), ...data];
}

function exportSeqMidi() {
    if (!seq.cells) return;
    const events = [];
    let endTick = seq.steps * MIDI_STEP_TICKS;

    for (let i = 0; i < seq.steps; i++) {
        const c = seq.cells[i];
        if (!c.gate) continue;
        const on = i * MIDI_STEP_TICKS;
        const off = on + Math.max(1,
            Math.round(c.length * MIDI_STEP_TICKS / 100));
        events.push({ tick: on, rank: 1, msg: [0x90, c.note, c.velocity] });
        events.push({ tick: off, rank: 0, msg: [0x80, c.note, 0] });
        if (off > endTick) endTick = off;
    }
    /* At one tick a note-off comes first, as the playback releases the old
     * note before it starts the new one. */
    events.sort((a, b) => (a.tick - b.tick) || (a.rank - b.rank));

    const track = [];
    const title = [...APPNAME].map((ch) => ch.charCodeAt(0) & 0x7F);
    track.push(...midiVarLen(0), ...midiMeta(0x03, title));
    const tempo = Math.max(1, Math.round(60000000 / seq.bpm));
    track.push(...midiVarLen(0),
        ...midiMeta(0x51, [(tempo >> 16) & 0xFF,
                           (tempo >> 8) & 0xFF, tempo & 0xFF]));
    track.push(...midiVarLen(0), ...midiMeta(0x58, [4, 2, 24, 8]));

    let at = 0;
    for (const e of events) {
        track.push(...midiVarLen(e.tick - at), ...e.msg);
        at = e.tick;
    }
    track.push(...midiVarLen(Math.max(0, endTick - at)), 0xFF, 0x2F, 0x00);

    const file = [
        0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6,
        0, 0, 0, 1,
        (MIDI_PPQN >> 8) & 0xFF, MIDI_PPQN & 0xFF,
        0x4D, 0x54, 0x72, 0x6B,
        (track.length >>> 24) & 0xFF, (track.length >>> 16) & 0xFF,
        (track.length >>> 8) & 0xFF, track.length & 0xFF,
        ...track,
    ];
    const blob = new Blob([new Uint8Array(file)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regine-pattern-' + Date.now() + '.mid';
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported the pattern as a MIDI file', 'ok');
}

function midiReadVarLen(data, pos) {
    let value = 0;
    for (let i = 0; i < 4; i++) {
        if (pos >= data.length) throw new Error('Truncated MIDI file');
        const b = data[pos++];
        value = (value << 7) | (b & 0x7F);
        if ((b & 0x80) === 0) return { value, pos };
    }
    throw new Error('Invalid variable-length value');
}

/* One track to note-ons with their durations. Note-offs pair with the oldest
 * open note of the same pitch, so an overlap does not steal the wrong off. */
function parseMidiTrack(data, division) {
    const ticksPerStep = division / 4;
    const notes = [];
    const open = new Map();
    let pos = 0;
    let tick = 0;
    let running = 0;

    while (pos < data.length) {
        let v = midiReadVarLen(data, pos);
        pos = v.pos;
        tick += v.value;
        if (pos >= data.length) break;

        let status = data[pos];
        if (status < 0x80) {
            if (!running) throw new Error('Running status without a status byte');
            status = running;
        } else {
            pos++;
            if (status < 0xF0) running = status;
        }

        if (status === 0xFF) {
            if (pos >= data.length) break;
            pos++;
            v = midiReadVarLen(data, pos);
            pos = v.pos + v.value;
            continue;
        }
        if (status === 0xF0 || status === 0xF7) {
            v = midiReadVarLen(data, pos);
            pos = v.pos + v.value;
            continue;
        }
        if (status >= 0xF1) {
            pos += status === 0xF2 ? 2 : (status === 0xF1 || status === 0xF3) ? 1 : 0;
            continue;
        }

        const type = status & 0xF0;
        const size = (type === 0xC0 || type === 0xD0) ? 1 : 2;
        if (pos + size > data.length) break;
        const d1 = data[pos++];
        const d2 = size === 2 ? data[pos++] : 0;

        if (type === 0x90 && d2 > 0) {
            notes.push({ tick, note: d1, velocity: d2, lengthTicks: 0 });
            if (!open.has(d1)) open.set(d1, []);
            open.get(d1).push(notes.length - 1);
        } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
            const list = open.get(d1);
            if (list && list.length) {
                const idx = list.shift();
                notes[idx].lengthTicks = tick - notes[idx].tick;
            }
        }
    }
    return notes;
}

function parseSeqMidi(bytes) {
    if (bytes.length < 14 ||
        String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') {
        throw new Error('Not a Standard MIDI File');
    }
    const headerLen = ((bytes[4] << 24) >>> 0) + (bytes[5] << 16) +
                      (bytes[6] << 8) + bytes[7];
    const format = (bytes[8] << 8) | bytes[9];
    const tracks = (bytes[10] << 8) | bytes[11];
    const division = (bytes[12] << 8) | bytes[13];
    if (division & 0x8000) throw new Error('SMPTE timing is not supported');
    if (division < 4) throw new Error('Unsupported time division');
    if (format > 1) throw new Error('Only MIDI formats 0 and 1 are supported');

    let pos = 8 + headerLen;
    let notes = [];
    for (let t = 0; t < tracks && pos + 8 <= bytes.length; t++) {
        if (String.fromCharCode(...bytes.slice(pos, pos + 4)) !== 'MTrk') break;
        const len = ((bytes[pos + 4] << 24) >>> 0) + (bytes[pos + 5] << 16) +
                    (bytes[pos + 6] << 8) + bytes[pos + 7];
        pos += 8;
        const end = Math.min(bytes.length, pos + len);
        const found = parseMidiTrack(bytes.subarray(pos, end), division);
        pos = end;
        /* Format 1 puts the tempo in track 0, so import the track that
         * actually has notes. */
        if (found.length > notes.length) notes = found;
    }
    if (!notes.length) throw new Error('No notes in the file');

    const ticksPerStep = division / 4;
    const cells = Array.from({ length: 64 }, () => ({
        note: 60, velocity: 100, gate: false, length: 50,
    }));
    let last = -1;

    for (const n of notes) {
        const step = Math.round(n.tick / ticksPerStep);
        if (step < 0 || step >= 64) continue;
        const half = Math.round(n.lengthTicks / (ticksPerStep / 2));
        const cell = cells[step];
        cell.note = Math.max(1, Math.min(127, n.note));
        cell.velocity = Math.max(1, Math.min(127, n.velocity));
        cell.gate = true;
        cell.length = Math.max(1, Math.min(127, half || 1)) * 50;
        last = Math.max(last, step);
    }
    if (last < 0) throw new Error('No notes in the first 64 steps');

    const steps = Math.max(1, Math.min(64, last + 1));
    const host = new Uint8Array(64 * 4);
    for (let i = 0; i < 64; i++) {
        host[i * 4] = cells[i].note;
        host[i * 4 + 1] = cells[i].velocity;
        host[i * 4 + 2] = cells[i].gate ? 1 : 0;
        host[i * 4 + 3] = Math.max(1, Math.min(127,
            Math.round(cells[i].length / 50)));
    }
    return { cells, steps, host };
}

function importSeqMidiFile(file) {
    if (!logue || logue.family === null) {
        addLog('Connect a device before importing a MIDI file', 'err');
        return;
    }
    const reader = new FileReader();
    const family = logue.family;
    reader.onload = () => {
        try {
            const parsed = parseSeqMidi(new Uint8Array(reader.result));
            const frame = [0xF0, 0x42, 0x30, 0x00, 0x01, family,
                           0x28, parsed.steps, ...hostToMidi(parsed.host),
                           0xF7];
            send(frame);
            seq.cells = parsed.cells;
            seq.steps = parsed.steps;
            if (seq.current >= seq.steps) seq.current = 0;
            if (seq.selected >= seq.steps) seq.selected = 0;
            updateSeqEditor();
            paintSeqState();
            addLog('Imported ' + file.name, 'ok');
        } catch (e) {
            addLog('Could not import ' + file.name + ': ' + e.message, 'err');
        }
    };
    reader.onerror = () => addLog('Could not read the file', 'err');
    reader.readAsArrayBuffer(file);
}

seqExport.addEventListener('click', exportSeqMidi);
seqImport.addEventListener('click', () => seqFile.click());
seqFile.addEventListener('change', () => {
    const file = seqFile.files && seqFile.files[0];
    seqFile.value = '';
    if (file) importSeqMidiFile(file);
});

function onSeqCellClick(step) {
    /* Select, do not toggle. The gate is the button beside the editor, the
     * same split as the Fire's pads and its fourth encoder. */
    seq.selected = step;
    paintSeqState();
    updateSeqEditor();

    /* Audition the step while the transport is stopped, so selecting a cell
     * lets the note be heard. The note-off is short; this does not edit it. */
    if (AUDITION_ENABLED && !seq.playing && logue &&
        logue.family !== null) {
        const cell = seq.cells[step];
        send([0x90, cell.note, cell.velocity]);
        setTimeout(() => send([0x80, cell.note, 0]), 200);
    }
}

seqGate.addEventListener('click', () => {
    const cell = seq.cells[seq.selected];
    if (cell) setSeqCell(seq.selected, 2, cell.gate ? 0 : 1);
});

function handleSeqSysEx(data) {
    if (!logue || !data || data.length < 8) return;
    if (data[1] !== 0x42 || data[2] !== 0x30 || data[5] !== logue.family) return;

    if (data[6] === 0x50 && data.length >= 13) {
        seq.playing = data[7] !== 0;
        seq.current = data[8];
        if (data[9] >= 1 && data[9] <= 64) seq.steps = data[9];
        seq.bpm = (data[11] << 7) | data[10];
        paintSeqState();
    } else if (data[6] === 0x4C && data.length >= 18) {
        applyConfig({
            master: data[7], depth: data[8], envMode: data[9],
            envA: (data[11] << 7) | data[10],
            envD: (data[13] << 7) | data[12],
            envS: data[14],
            envR: (data[16] << 7) | data[15],
            transport: data.length >= 19 ? data[17] : 0,
            channel: data.length >= 20 ? data[18] : 0,
        });
    } else if (data[6] === 0x4E && data.length >= 11) {
        const prev = activeSlots;
        activeSlots = { osc: data[7], fxModule: data[8], fxSlot: data[9] };
        markUnitRows();
        if (activeSlots.osc !== prev.osc) setTimeout(refreshStored, 30);
        if (activeSlots.fxModule !== prev.fxModule ||
            activeSlots.fxSlot !== prev.fxSlot) {
            setTimeout(refreshEffect, 30);
        }
    } else if (data[6] === 0x52 && data.length >= 13) {
        const step = data[7];
        if (step >= 64) return;
        seq.cells[step] = {
            note: data[8], velocity: data[9], gate: data[10] !== 0,
            length: (data[11] || 1) * 50,
        };
        paintSeqState();
        if (seq.selected === step) updateSeqEditor();
    }
}

seqPlay.addEventListener('click', () => sendSeqTransport(1));
seqStop.addEventListener('click', () => sendSeqTransport(0));

seqKnobs.addEventListener('cc-change', (e) => {
    if (e.detail.cc === 2) {
        sendSeqBpm(e.detail.value);
        return;
    }
    if (e.detail.cc === 4) {
        sendSeqSteps(e.detail.value);
        return;
    }
    if (e.detail.cc === 3) {
        setSeqCell(seq.selected, 3, e.detail.value);
        return;
    }
    const field = e.detail.cc === 0 ? 0 : 1;
    setSeqCell(seq.selected, field, e.detail.value);
});

/* -------------------------------------------------------- unit management */

function unitModule() {
    return UNIT_MODULES.find((m) => m.name === unitMgmt.module) || UNIT_MODULES[0];
}

function isUnitActive(moduleName, slot) {
    if (moduleName === 'osc') return activeSlots.osc === slot;
    const module = UNIT_MODULES.find((m) => m.name === moduleName);
    return !!module && activeSlots.fxModule === module.id &&
           activeSlots.fxSlot === slot;
}

function markUnitRows() {
    for (const row of unitSlots.querySelectorAll('.unit-slot')) {
        row.classList.toggle('active',
            isUnitActive(row.dataset.module, Number(row.dataset.slot)));
    }
}

function selectUnit(moduleName, slot) {
    if (!logue || logue.family === null) return;
    const module = UNIT_MODULES.find((m) => m.name === moduleName);
    if (!module) return;
    send([0xF0, 0x42, 0x30, 0x00, 0x01, logue.family, 0x1F,
          module.id, slot, 0xF7]);
}

async function clearUnit(moduleName, slot) {
    if (!logue || logue.family === null) return;
    try {
        await logue.clear(moduleName, slot);
        await refreshUnits();
        if (isUnitActive(moduleName, slot)) {
            setTimeout(refreshStored, 30);
            setTimeout(refreshEffect, 30);
        }
    } catch (e) {
        addLog('Clear failed: ' + e.message, 'err');
    }
}

async function refreshUnits() {
    if (!logue || logue.family === null) return;

    unitModules.innerHTML = '';
    for (const module of UNIT_MODULES) {
        const button = document.createElement('button');
        button.className = 'octave-btn' +
            (module.name === unitMgmt.module ? ' active' : '');
        button.textContent = module.label;
        button.addEventListener('click', () => {
            unitMgmt.module = module.name;
            refreshUnits();
        });
        unitModules.appendChild(button);
    }

    const module = unitModule();
    unitSlots.innerHTML = '';
    for (let slot = 0; slot < module.count; slot++) {
        let status = null;
        try {
            status = await logue.slotStatus(module.name, slot);
        } catch (e) {
            status = null;
        }

        const row = document.createElement('div');
        row.className = 'unit-slot';
        row.dataset.module = module.name;
        row.dataset.slot = String(slot);
        if (isUnitActive(module.name, slot)) row.classList.add('active');

        const index = document.createElement('span');
        index.className = 'idx';
        index.textContent = String(slot + 1).padStart(2, '0');
        row.appendChild(index);

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = status && status.present && status.header
            ? status.header.name : '(empty)';
        row.appendChild(name);

        const select = document.createElement('button');
        select.className = 'octave-btn';
        select.textContent = 'Select';
        select.addEventListener('click', () => selectUnit(module.name, slot));
        row.appendChild(select);

        const upload = document.createElement('button');
        upload.className = 'octave-btn';
        upload.textContent = 'Upload';
        upload.addEventListener('click', () => {
            unitMgmt.pending = { module: module.name, slot };
            unitMgmtFile.value = '';
            unitMgmtFile.click();
        });
        row.appendChild(upload);

        const clear = document.createElement('button');
        clear.className = 'octave-btn';
        clear.textContent = 'Clear';
        clear.disabled = !(status && status.present);
        clear.addEventListener('click', () => clearUnit(module.name, slot));
        row.appendChild(clear);

        unitSlots.appendChild(row);
    }
}

async function uploadToUnitSlot() {
    const file = unitMgmtFile.files && unitMgmtFile.files[0];
    const pending = unitMgmt.pending;
    if (!file || !pending) return;

    try {
        const unit = await readUnit(file);
        await logue.install(unit.bytes, {
            module: pending.module,
            slot: pending.slot,
            name: unit.header.name,
            checkModule: true,
        });
        addLog('Installed ' + unit.header.name + ' in ' + pending.module +
               ' slot ' + pending.slot + '.', 'ok');
        await refreshUnits();
        if (isUnitActive(pending.module, pending.slot)) {
            setTimeout(refreshStored, 30);
            setTimeout(refreshEffect, 30);
        }
    } catch (e) {
        addLog('Upload failed: ' + e.message, 'err');
    }
    unitMgmt.pending = null;
    unitMgmtFile.value = '';
}

unitMgmtFile.addEventListener('change', uploadToUnitSlot);

/* ----------------------------------------------------------------- upload */

/* The button opens the picker and uploads the chosen file. */
uploadBtn.addEventListener('click', () => {
    closeMenu();
    if (!logue || !logue.selectedPair()) {
        unitMeta.textContent = 'Not connected. Press the connection state to look again.';
        return;
    }
    unitFile.click();
});

async function uploadPending() {
    if (!pending || uploading) return;
    if (!logue || !logue.selectedPair()) {
        unitMeta.textContent = 'Not connected. Press the connection state to look again.';
        return;
    }
    const unit = pending;
    uploading = true;
    unitMeta.textContent = 'Uploading ' + unit.header.name + '...';
    try {
        const result = await logue.place(unit, { slot: 0, overwrite: true });
        addLog('Stored ' + result.name + ': ' + result.bytes + ' bytes, ' +
               result.packets + ' packet(s), verified=' + result.verified,
               result.verified ? 'ok' : 'err');
        pending = null;
        unitFile.value = '';
        await refreshStored();
        await refreshEffect();
    } catch (e) {
        addLog((e.code ? e.code + ': ' : '') + e.message, 'err');
        unitMeta.textContent = 'Upload failed: ' + e.message;
    } finally {
        uploading = false;
    }
}

unitFile.addEventListener('change', async () => {
    const file = unitFile.files && unitFile.files[0];
    if (!file) return;
    try {
        const unit = await readUnit(file);
        const parsed = readParams(unit.bytes);
        pending = { ...unit, params: parsed ? parsed.params : [] };
        await uploadPending();
    } catch (e) {
        pending = null;
        unitFile.value = '';
        unitMeta.textContent = 'Not a unit file: ' + e.message;
        addLog(e.message, 'err');
    }
});

/* ------------------------------------------------------------- fullscreen */

/* The icon enters fullscreen; the red corner button leaves it. */
function wireFullscreen(button, target) {
    button.addEventListener('click', async () => {
        if (document.fullscreenElement) {
            if (document.exitFullscreen) await document.exitFullscreen();
        } else if (target.requestFullscreen) {
            await target.requestFullscreen().catch(() => {});
        }
    });

    target.addEventListener('click', async (e) => {
        if (!document.fullscreenElement) return;
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x >= rect.width - 42 && x <= rect.width - 10 &&
            y >= 10 && y <= 42) {
            if (document.exitFullscreen) await document.exitFullscreen();
        }
    });
}

wireFullscreen($('paramsFullscreen'), $('params-section'));
wireFullscreen($('fxFullscreen'), $('effect-section'));
wireFullscreen($('configFullscreen'), $('config-section'));
wireFullscreen($('seqFullscreen'), $('seq-section'));
wireFullscreen($('keyboardFullscreen'), $('keyboard-section'));

/* ---------------------------------------------------------------- keyboard */

function octaveName() {
    return 'C' + (baseOctave - 1) + ' - B' + baseOctave;
}

function makePiano() {
    if (piano) piano.destroy();
    piano = new PianoKeyboard('piano', {
        octaves: 2,
        baseOctave,
        showLabels: true,
    });
    piano.addEventListener('noteon', (e) => {
        send([0x90, e.detail.note, e.detail.velocity]);
    });
    piano.addEventListener('noteoff', (e) => {
        send([0x80, e.detail.note, 0]);
    });
    octaveLabel.textContent = octaveName();
}

function setOctave(o) {
    baseOctave = Math.max(1, Math.min(6, o));
    makePiano();
}

$('octaveDown').addEventListener('click', () => setOctave(baseOctave - 1));
$('octaveUp').addEventListener('click', () => setOctave(baseOctave + 1));

/* ------------------------------------------------------------------- views */

const menu = $('nav-menu');
const overlay = $('nav-overlay');

function closeMenu() {
    menu.classList.remove('open');
    overlay.classList.remove('active');
}

$('menu-btn').addEventListener('click', () => {
    menu.classList.add('open');
    overlay.classList.add('active');
});

$('close-menu').addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);

for (const item of document.querySelectorAll('.nav-item[data-scene]')) {
    item.addEventListener('click', () => {
        for (const scene of document.querySelectorAll('.scene')) {
            scene.classList.remove('active');
        }
        for (const other of document.querySelectorAll('.nav-item')) {
            other.classList.remove('active');
        }
        const scene = document.getElementById('scene-' + item.dataset.scene);
        if (scene) scene.classList.add('active');
        item.classList.add('active');
        closeMenu();
    });
}

/* About / Credits, the same modal the other tools use. */
const aboutModal = $('aboutModal');
const aboutOverlay = $('aboutOverlay');

function closeAbout() {
    aboutModal.classList.remove('active');
    aboutOverlay.classList.remove('active');
}

$('aboutBtn').addEventListener('click', () => {
    closeMenu();
    aboutModal.classList.add('active');
    aboutOverlay.classList.add('active');
});
$('aboutClose').addEventListener('click', closeAbout);
aboutOverlay.addEventListener('click', closeAbout);

/* -------------------------------------------------------------- connection */

async function readActiveUnit() {
    if (!logue || logue.family === null) return null;
    const family = logue.family;
    try {
        const reply = await logue.send(
            [0xF0, 0x42, 0x30, 0x00, 0x01, family, 0x1A, 0xF7], 2000,
            (d) => d.length > 8 && d[1] === 0x42 && d[2] === 0x30 &&
                   d[5] === family && d[6] === 0x4B);
        const payload = reply.slice(7, reply.length - 1);
        if (!payload.length) return null;
        return readParams(Uint8Array.from(midiToHost(payload)));
    } catch (e) {
        return null;
    }
}

async function refreshStored() {
    try {
        showUnit(await readActiveUnit());
    } catch (e) {
        addLog('Could not read the unit: ' + e.message, 'err');
    }
}

async function connect() {
    if (connecting) return;
    connecting = true;
    setConnection('busy', 'Connecting...');
    try {
        const midi = await requestWebMidi({ sysex: true });
        addLog('MIDI ready. ' + midi.outputs.size + ' output(s), ' +
               midi.inputs.size + ' input(s).');

        /* Expose only ReGINE ports, and only report changes to that set. Other
         * devices can answer identity without the protocol, and Chrome's own
         * ports would otherwise cause a probe loop. */
        const base = webMidiAccess(midi);
        const reginePorts = () => {
            const { outputs, inputs } = base.ports();
            return {
                outputs: outputs.filter((p) => /ReGINE/i.test(p.name)),
                inputs: inputs.filter((p) => /ReGINE/i.test(p.name)),
            };
        };
        const signature = (p) =>
            p.outputs.map((x) => x.id).sort().join(',') + '|' +
            p.inputs.map((x) => x.id).sort().join(',');
        let last = signature(reginePorts());
        const access = {
            ports: reginePorts,
            onchange(handler) {
                return base.onchange(() => {
                    const now = signature(reginePorts());
                    if (now === last) return;
                    last = now;
                    handler();
                });
            },
        };
        logue = new Logue({ access, log: logSink, onStatus, autoRelocate: false });
        logMidiPorts();

        const ports = access.ports();
        try {
            await Promise.all([...ports.outputs, ...ports.inputs]
                .map((p) => p.open()));
        } catch (e) {
            addLog('Port open failed: ' + (e.name || 'error') + ' ' + e.message,
                   'err');
        }
        /* findDevice() returns null, it does not throw. */
        const device = await logue.findDevice();
        if (!device) {
            /* Send one identity request and show the result. */
            const outs = access.ports().outputs;
            const ins = access.ports().inputs;
            if (ins[0]) {
                ins[0].onmidimessage = (e) => {
                    const hex = Array.from(e.data, (b) =>
                        b.toString(16).padStart(2, '0')).join(' ');
                    addLog('received: ' + hex);
                };
            }
            if (outs[0]) {
                try {
                    outs[0].send([0xF0, 0x7E, 0x00, 0x06, 0x01, 0xF7]);
                    addLog('identity request sent on ' + outs[0].name + '.');
                } catch (e) {
                    addLog('send failed: ' + (e.name || 'error') + ' ' +
                           e.message, 'err');
                }
            }
            setConnection('off', 'Not connected');
            return;
        }
        const pair = logue.selectedPair();
        if (pair) addLog('Ready on ' + pair.out.name + '.');
    } catch (e) {
        logue = null;
        setConnection('off', 'Not connected');
        addLog(e && e.message ? e.message : String(e), 'err');
    } finally {
        connecting = false;
    }
}

/* Click the state to reconnect. */
connection.addEventListener('click', () => {
    if (!logue || !logue.selectedPair()) connect();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch((e) => {
            addLog('Service worker: ' + e.message, 'err');
        });
    });
}

makePiano();
connect();
