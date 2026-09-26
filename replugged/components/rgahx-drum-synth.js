/**
 * RGAHX Drum: the AHX one-shot kick and snare
 *
 * A kick and a snare built from the Amiga tracker's own synthesis, the presets in
 * plugins/RGAHX_Drum/ compiled in and played through tracker_voice.c and
 * tracker_modulator.c. Same instrument as before; it now speaks the shared
 * regroove_synth_* ABI through the one synth worklet rather than its own
 * rgahxdrum_* entry points on the drum worklet.
 *
 * There are no parameters and no panel. The engine has no setter of any kind --
 * the two presets are compiled in and that is the whole instrument -- so
 * getParameterInfo() returns an empty list and <synth-ui> has nothing to draw.
 * The class this replaces returned an empty list for the same reason; the
 * difference is that the engine can no longer be reached by an ABI nobody
 * maintains.
 *
 * Note map: 36 kick, 38 snare, and nothing else (rgahxdrum.c). The engine looks
 * the note up in its two-entry map and returns for anything it does not find.
 *
 * The module is MONO -- rgahxdrum_process writes one channel -- and the binding
 * spreads it across both lanes of the worklet's interleaved buffer. Nothing here
 * has to know that.
 */

import { SynthRegistry } from '../synth-registry.js';

class RGAHXDrumSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.wasmModule = null;
        this.wasmInstance = null;
        this.wasmError = null;
        this.isInitialized = false;

        this.parameterInfo = RGAHXDrumSynth.getParameterInfo();
    }

    /** None, and that is the engine's shape rather than an omission. */
    static getParameterInfo() {
        return [];
    }

    async initialize() {
        try {
            console.log('[RGAHXDrum] Loading WASM module...');

            const paths = SynthRegistry.getPaths();
            // Cache-busted, for the reason spelled out in rgstorm-synth.js.
            const v = '?v=' + Date.now();
            const wasmJsPath = paths.wasm + 'rgahx-drum-synth.js' + v;
            const wasmBinaryPath = paths.wasm + 'rgahx-drum-synth.wasm' + v;

            const [jsResponse, wasmResponse] = await Promise.all([
                fetch(wasmJsPath),
                fetch(wasmBinaryPath)
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to fetch WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            console.log('[RGAHXDrum] WASM files loaded');

            await this.audioContext.audioWorklet.addModule(
                paths.worklets + 'synth-worklet-processor.js' + v);

            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0;

            this.workletNode = new AudioWorkletNode(
                this.audioContext, 'synth-worklet-processor', {
                    outputChannelCount: [2]
                });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Worklet timeout')), 5000);

                this.workletNode.port.onmessage = (event) => {
                    if (event.data.type === 'needWasm') {
                        this.workletNode.port.postMessage({
                            type: 'wasmBytes',
                            data: {
                                jsCode: jsCode,
                                wasmBytes: wasmBytes,
                                engineId: 0,   // one engine per module
                                // This one matters more than on the other three.
                                // rgahxdrum_create() is the ONLY place a rate goes
                                // in -- there is no setter -- so the presets'
                                // envelopes are derived from this number once and
                                // never again. The binding ignores the rate it is
                                // sent per block for that reason, and says so; get
                                // this wrong and the drum plays at the wrong speed
                                // for the rest of the session. The worklet's own
                                // default is 48000, which would be silently wrong
                                // on a 44.1 kHz context.
                                sampleRate: this.audioContext.sampleRate
                            }
                        });
                    } else if (event.data.type === 'ready') {
                        clearTimeout(timeout);
                        resolve();
                    } else if (event.data.type === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(event.data.data.message));
                    }
                };
            });

            this.workletNode.connect(this.masterGain);

            this.isInitialized = true;
            console.log('[RGAHXDrum] Initialized successfully');
            return true;

        } catch (error) {
            console.error('[RGAHXDrum] Initialization error:', error);
            this.wasmError = error.message;
            return false;
        }
    }

    /** 36 kick, 38 snare. Anything else is silent. */
    noteOn(note, velocity = 100) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'noteOn',
            data: { note, velocity }
        });
    }

    /**
     * What the drum pads, the channel-10 MIDI branch and playKeyboardNote all
     * call; the class this replaces carried this alias too.
     */
    triggerDrum(note, velocity = 100) {
        this.noteOn(note, velocity);
    }

    /** Intentionally empty; a hit decays on its own. */
    noteOff(note) {
        // Nothing to release.
    }

    /** There are no parameters; accepted and dropped, as the binding does. */
    setParameter(paramId, value) {
        // No controls on this instrument.
    }

    allNotesOff() {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({ type: 'allNotesOff' });
    }

    setSpeakerOutput(enabled) {
        if (this.masterGain) {
            this.masterGain.gain.value = enabled ? 1.0 : 0.0;
        }
    }

    destroy() {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        this.isInitialized = false;
        console.log('[RGAHXDrum] Destroyed');
    }
}

SynthRegistry.register({
    id: 'rgahxdrum',
    name: 'RGAHXDrum',
    displayName: 'RGAHX Drum: Amiga AHX Drums',
    description: 'Amiga AHX-style drum machine: one-shot kick and snare, no controls',
    engineId: 12,   // one engine per module, unused by the binding
    class: RGAHXDrumSynth,
    category: 'drum',
    wasmFiles: {
        js: 'rgahx-drum-synth.js',
        wasm: 'rgahx-drum-synth.wasm'
    },
    getParameterInfo: RGAHXDrumSynth.getParameterInfo
});

export { RGAHXDrumSynth };
