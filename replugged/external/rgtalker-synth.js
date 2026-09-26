// RGTalker: Amiga-style speech synthesizer WASM wrapper
// Follows the same AudioWorklet pattern as the other rfx synths.

class RGTalkerSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode  = null;
        this.masterGain   = null;
        this.speakerGain  = null;
        this.isActive     = false;
        this.isAudible    = false;
        this.wasmReady    = false;
        this.pendingNotes = [];
        this.listeners    = new Map();
        this.onPhonemes   = null; // callback(phonemeString)
    }

    async initialize() {
        console.log('[RGTalker] Initializing...');
        try {
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0;

            this.speakerGain = this.audioContext.createGain();
            this.speakerGain.gain.value = 1.0;
            this.speakerGain.connect(this.audioContext.destination);

            this.masterGain.connect(this.speakerGain);

            if (!this.audioContext._synthWorkletLoaded) {
                await this.audioContext.audioWorklet.addModule(
                    window.location.pathname.includes('/rfxsynths')
                        ? '../replugged/worklets/synth-worklet-processor.js?v=213'
                        : '../replugged/worklets/synth-worklet-processor.js?v=213'
                );
                this.audioContext._synthWorkletLoaded = true;
            }

            this.workletNode = new AudioWorkletNode(this.audioContext, 'synth-worklet-processor');
            this.workletNode.connect(this.masterGain);

            this.workletNode.port.onmessage = (event) => {
                const { type, data } = event.data;
                if (type === 'needWasm') {
                    this._loadWasm();
                } else if (type === 'ready') {
                    console.log('[RGTalker] WASM ready');
                    this.wasmReady = true;
                    for (const n of this.pendingNotes) {
                        n.type === 'on' ? this.noteOn(n.note, n.velocity) : this.noteOff(n.note);
                    }
                    this.pendingNotes = [];
                } else if (type === 'phonemes') {
                    if (this.onPhonemes) this.onPhonemes(data.phonemes);
                } else if (type === 'error') {
                    console.error('[RGTalker] Worklet error:', data);
                }
            };

            this.isActive  = true;
            this.isAudible = true;
            return true;
        } catch (err) {
            console.error('[RGTalker] Init failed:', err);
            this.wasmError = err.message;
            return false;
        }
    }

    async _loadWasm() {
        try {
            const base = window.location.pathname.includes('/rfxsynths/') ? '' : '../rfxsynths/';
            const [jsRes, wasmRes] = await Promise.all([
                fetch(base + 'rgtalker-synth.js'),
                fetch(base + 'rgtalker-synth.wasm'),
            ]);
            const jsCode   = await jsRes.text();
            const wasmBytes = await wasmRes.arrayBuffer();

            this.workletNode.port.postMessage({
                type: 'wasmBytes',
                data: { jsCode, wasmBytes, engineId: 0, engine: 0 },
            });
        } catch (err) {
            console.error('[RGTalker] WASM load failed:', err);
        }
    }

    /* ---- Speech control ---- */

    setText(text) {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'setText', data: { text } });
    }

    requestPhonemes() {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'getPhonemes' });
    }

    /* ---- MIDI ---- */

    noteOn(note, velocity) {
        if (!this.isActive) return;
        if (!this.wasmReady) { this.pendingNotes.push({ type: 'on', note, velocity }); return; }
        this.workletNode.port.postMessage({ type: 'noteOn', data: { note, velocity } });
    }

    noteOff(note) {
        if (!this.isActive) return;
        if (!this.wasmReady) { this.pendingNotes.push({ type: 'off', note }); return; }
        this.workletNode.port.postMessage({ type: 'noteOff', data: { note } });
    }

    stopAll() {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }

    /* ---- Parameters (0=Speed 1=Mouth 2=Throat 3=Volume 4=Breathiness 5=Loop) ---- */

    setParameter(index, value) {
        if (!this.workletNode) return;
        this.workletNode.port.postMessage({ type: 'setParam', data: { index, value } });
    }

    /* ---- Audio graph ---- */

    setSpeakerOutput(enabled) {
        this.isAudible = enabled;
        if (this.speakerGain) this.speakerGain.gain.value = enabled ? 1.0 : 0.0;
    }

    connect(destination) {
        if (this.masterGain) this.masterGain.connect(destination);
    }

    destroy() {
        this.stopAll();
        if (this.workletNode) { this.workletNode.disconnect(); this.workletNode = null; }
        if (this.speakerGain) { this.speakerGain.disconnect(); this.speakerGain = null; }
        if (this.masterGain)  { this.masterGain.disconnect();  this.masterGain = null; }
        this.isActive = false;
        this.wasmReady = false;
    }

    on(event, cb) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(cb);
    }
}

if (typeof window !== 'undefined' && window.SynthRegistry) {
    window.SynthRegistry.register({
        id: 'rgtalker',
        name: 'RGTalker',
        displayName: 'RGTalker: Amiga Speech Synthesizer',
        description: 'Amiga-style formant speech synthesizer',
        engineId: 99,
        class: RGTalkerSynth,
        wasmFiles: { js: 'rgtalker-synth.js', wasm: 'rgtalker-synth.wasm' },
        category: 'synthesizer',
    });
}
