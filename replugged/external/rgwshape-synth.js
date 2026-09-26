// RGWShape: 01/W-style Waveshaping Bass Synthesizer

class RGWShapeSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.speakerGain = null;
        this.isActive = false;
        this.isAudible = false;
        this.listeners = new Map();
        this.wasmReady = false;
        this.wasmError = null;
        this.pendingNotes = [];
    }

    static getParameterInfo() {
        return [
            // Oscillator
            { index: 0,  name: "Shape",       type: "enum",  group: "Oscillator", default: 2,
              options: [{value:0,label:"Sine"},{value:1,label:"Cheb3"},{value:2,label:"Cheb35"},{value:3,label:"ODD"},{value:4,label:"Fold"},{value:5,label:"Freq3"}] },
            { index: 3,  name: "Sub Level",   type: "float", group: "Oscillator", min: 0, max: 1,   default: 0.0 },
            { index: 4,  name: "Sub Ratio",   type: "float", group: "Oscillator", min: 0, max: 3,   default: 0.5 },
            { index: 5,  name: "Sub2 Level",  type: "float", group: "Oscillator", min: 0, max: 1,   default: 0.0 },
            { index: 6,  name: "Sub2 Ratio",  type: "float", group: "Oscillator", min: 0, max: 3,   default: 1.5 },
            // Drive
            { index: 1,  name: "Drive Base",  type: "float", group: "Drive",      min: 0, max: 1,   default: 0.0 },
            { index: 2,  name: "Drive Amt",   type: "float", group: "Drive",      min: 0, max: 1,   default: 1.0 },
            // Drive Envelope
            { index: 17, name: "D-ST",        type: "float", group: "Drive Env",  min: 0, max: 1,   default: 1.0 },
            { index: 18, name: "D-A",         type: "float", group: "Drive Env",  min: 0, max: 1,   default: 0.0 },
            { index: 19, name: "D-H",         type: "float", group: "Drive Env",  min: 0, max: 0.5, default: 0.0 },
            { index: 20, name: "D-D",         type: "float", group: "Drive Env",  min: 0, max: 2,   default: 0.35 },
            { index: 21, name: "D-S",         type: "float", group: "Drive Env",  min: 0, max: 1,   default: 0.2 },
            { index: 22, name: "D-R",         type: "float", group: "Drive Env",  min: 0, max: 1,   default: 0.1 },
            // Filter
            { index: 7,  name: "Cutoff",      type: "float", group: "Filter",     min: 0, max: 1,   default: 0.95 },
            { index: 8,  name: "Resonance",   type: "float", group: "Filter",     min: 0, max: 1,   default: 0.05 },
            { index: 9,  name: "Filter Amt",  type: "float", group: "Filter",     min: 0, max: 1,   default: 0.0 },
            // Amp Envelope
            { index: 11, name: "A-ST",        type: "float", group: "Amp Env",    min: 0, max: 1,   default: 0.49 },
            { index: 12, name: "A-A",         type: "float", group: "Amp Env",    min: 0, max: 2,   default: 0.03 },
            { index: 13, name: "A-D",         type: "float", group: "Amp Env",    min: 0, max: 10,  default: 10.0 },
            { index: 14, name: "A-S",         type: "float", group: "Amp Env",    min: 0, max: 1,   default: 0.99 },
            { index: 15, name: "A-R",         type: "float", group: "Amp Env",    min: 0, max: 2,   default: 0.15 },
        ];
    }

    getParameterInfo() { return RGWShapeSynth.getParameterInfo(); }

    async initialize() {
        const workletPath = window.location.pathname.includes('/replugged/')
            ? 'worklets/' : '../replugged/worklets/';
        await this.audioContext.audioWorklet.addModule(
            `${workletPath}synth-worklet-processor.js?v=210`);

        this.workletNode = new AudioWorkletNode(this.audioContext, 'synth-worklet-processor');
        this.masterGain  = this.audioContext.createGain();
        this.speakerGain = this.audioContext.createGain();
        this.masterGain.gain.value  = 0.8;
        this.speakerGain.gain.value = 0;

        this.workletNode.connect(this.masterGain);
        this.masterGain.connect(this.speakerGain);
        this.speakerGain.connect(this.audioContext.destination);

        this.workletNode.port.onmessage = (e) => {
            if (e.data.type === 'wasmReady') {
                this.wasmReady = true;
                this._applyDefaults();
                this.pendingNotes.forEach(n => {
                    if (n.type === 'on') this.noteOn(n.note, n.velocity);
                    else this.noteOff(n.note);
                });
                this.pendingNotes = [];
                this._emit('ready');
            } else if (e.data.type === 'wasmError') {
                this.wasmError = e.data.error;
                this._emit('error', e.data.error);
            }
        };

        await this._loadWasm();
        this.isActive = true;
        return this;
    }

    _applyDefaults() {
        RGWShapeSynth.getParameterInfo().forEach(p => this.setParameter(p.index, p.default));
    }

    async _loadWasm() {
        const base = window.location.pathname.includes('/rfxsynths/') ? '' : '../rfxsynths/';
        const [jsResp, wasmResp] = await Promise.all([
            fetch(`${base}rgwshape-synth.js`),
            fetch(`${base}rgwshape-synth.wasm`)
        ]);
        if (!jsResp.ok)   throw new Error(`rgwshape-synth.js: ${jsResp.status}`);
        if (!wasmResp.ok) throw new Error(`rgwshape-synth.wasm: ${wasmResp.status}`);

        this.workletNode.port.postMessage({
            type: 'wasmBytes',
            data: {
                jsCode:     await jsResp.text(),
                wasmBytes:  await wasmResp.arrayBuffer(),
                sampleRate: this.audioContext.sampleRate,
                moduleName: 'RGWShapeModule',
                engineId:   0
            }
        });
    }

    noteOn(note, velocity = 100) {
        if (!this.wasmReady) { this.pendingNotes.push({type:'on', note, velocity}); return; }
        this.workletNode.port.postMessage({ type: 'noteOn', data: { note, velocity } });
    }

    noteOff(note) {
        if (!this.wasmReady) { this.pendingNotes.push({type:'off', note}); return; }
        this.workletNode.port.postMessage({ type: 'noteOff', data: { note } });
    }

    setParameter(index, value) {
        if (!this.wasmReady) return;
        this.workletNode.port.postMessage({ type: 'setParameter', data: { index, value } });
    }

    setMasterGain(v)        { if (this.masterGain)  this.masterGain.gain.value  = v; }
    setSpeakerOutput(on)    { if (this.speakerGain) this.speakerGain.gain.value = on ? 1 : 0; }
    connect(node)           { this.masterGain?.connect(node); }
    disconnect()            { this.masterGain?.disconnect(); }
    getParameterCount()     { return 29; }
    handleControlChange()   {}

    on(event, cb)  { if (!this.listeners.has(event)) this.listeners.set(event, []); this.listeners.get(event).push(cb); }
    _emit(event, data) { (this.listeners.get(event) || []).forEach(cb => cb(data)); }

    destroy() {
        this.workletNode?.disconnect();
        this.masterGain?.disconnect();
        this.workletNode = null;
        this.masterGain  = null;
        this.isActive    = false;
    }
}

export { RGWShapeSynth };
export default RGWShapeSynth;
