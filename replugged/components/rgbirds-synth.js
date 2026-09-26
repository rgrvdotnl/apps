/**
 * RGBirds Synth - Web Audio FM birdsong aviary
 *
 * The web half of rfx/effects/fx_birds.c: an FM two-operator birdsong engine
 * with a self-singing dawn chorus. The engine is the same C file the logue
 * units build from, so the drumlogue and this page sing the same birds.
 *
 * This is a *playing* instrument first: a note-on sings one short phrase at
 * that key and stops. The chorus -- birds singing with nobody playing -- is
 * the second way a bird gets into the air, and it is what BIRDS turns up.
 *
 * BIRDS defaults to 0 here and in the engine, and that matters more than a
 * default usually does. The chorus never stops once it is running, by design
 * -- it is the ambience when nobody is playing -- so a page that opened with
 * it on made every played note sound like it was the thing that would not
 * end. Silence until you play is the honest default for an instrument.
 *
 * A note-off is deliberately not forwarded: a call outlives the key, though
 * only by a fraction of a second now. See the header for why (fx_birds.h)
 * and for the parameter list.
 */

import { SynthRegistry } from '../synth-registry.js';

class RGBirdsSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.wasmModule = null;
        this.wasmInstance = null;
        this.wasmError = null;
        this.isInitialized = false;

        this.parameterInfo = RGBirdsSynth.getParameterInfo();
    }

    /**
     * All six parameters are 0..1 because that is what the engine takes and
     * what the worklet forwards untouched, and the UI element pushes exactly
     * these on connect, so the page's defaults -- not the C ones -- are what
     * you hear.
     *
     * BIRDS defaults to 0 here, and that is the point. The engine's chorus
     * sings in an endless loop by design -- it is what the unit does when it
     * is the ambience and nobody is playing it -- and having it on when the
     * page opens means a played bird arrives inside someone else's song and
     * outlives it. An instrument you have to play should be silent until you
     * play it; turn BIRDS up, or press "Call a few birds", for the aviary.
     */
    static getParameterInfo() {
        return [
            { id: 0, name: 'Birds', min: 0, max: 1, default: 0.00,
              description: 'Chorus density -- 0 is silence until you play' },
            { id: 1, name: 'Size', min: 0, max: 1, default: 0.45,
              description: 'Wren at 0, crow at 1 -- the call\'s shape, not its pitch' },
            { id: 2, name: 'Timbre', min: 0, max: 1, default: 0.60,
              description: 'FM index -- 0 is every bird a pure sine' },
            { id: 3, name: 'Phrase', min: 0, max: 1, default: 0.35,
              description: 'Syllables per call -- one at 0, eight at 1' },
            // Off by default, and that is deliberate. The bed is filtered
            // white noise; the first version opened at 0.15 and the player
            // quite reasonably asked "are you playing noise?!". A hiss under
            // a birdsong is only wanted when it has been asked for.
            { id: 4, name: 'Air', min: 0, max: 1, default: 0.00,
              description: 'Leaf and wind bed -- filtered noise, 0 is off' },
            { id: 5, name: 'Spread', min: 0, max: 1, default: 0.70,
              description: 'Stereo width of the aviary' },
        ];
    }

    async initialize() {
        try {
            console.log('[RGBirds] Loading WASM module...');

            const paths = SynthRegistry.getPaths();
            // Cache-busted. The plugin build overwrites these two files
            // in place, and python -m http.server sends no Cache-Control, so
            // a browser is free to serve the previous build from its
            // heuristic cache -- which is exactly how a fixed engine keeps
            // sounding broken. This class is itself loaded with ?v=<now> by
            // SynthRegistry, so the stamp below is always the current one.
            const v = '?v=' + Date.now();
            const wasmJsPath = paths.wasm + 'rgbirds-synth.js' + v;
            const wasmBinaryPath = paths.wasm + 'rgbirds-synth.wasm' + v;

            const [jsResponse, wasmResponse] = await Promise.all([
                fetch(wasmJsPath),
                fetch(wasmBinaryPath)
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to fetch WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            console.log('[RGBirds] WASM files loaded');

            await this.audioContext.audioWorklet.addModule(
                paths.worklets + 'synth-worklet-processor.js');

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
                        // The sample rate goes through: unlike the other synths
                        // here this engine tunes itself to it (fx_birds.h).
                        this.workletNode.port.postMessage({
                            type: 'wasmBytes',
                            data: {
                                jsCode: jsCode,
                                wasmBytes: wasmBytes,
                                engineId: 0,   // one engine per module
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
            console.log('[RGBirds] Initialized successfully');
            return true;

        } catch (error) {
            console.error('[RGBirds] Initialization error:', error);
            this.wasmError = error.message;
            return false;
        }
    }

    /** A note-on is one call at that pitch. See fx_birds_note_on(). */
    noteOn(note, velocity) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'noteOn',
            data: { note, velocity }
        });
    }

    /**
     * Accepted and dropped, deliberately. A bird that has been called does not
     * stop because the key came up, and a call is short enough that there is
     * nothing to stop -- the built-in envelope is the release.
     */
    noteOff(note) {
        // Intentionally empty; see the class comment.
    }

    setParameter(paramId, value) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'setParameter',
            data: { index: paramId, value: value }
        });
    }

    /**
     * Every call in the air, now. The chorus is left alone -- it is the
     * aviary, not a note that is being held (fx_birds_all_notes_off).
     */
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
        console.log('[RGBirds] Destroyed');
    }
}

SynthRegistry.register({
    id: 'rgbirds',
    name: 'RGBirds',
    displayName: 'RGBirds Aviary',
    description: 'FM birdsong and dawn chorus -- nature environment synthesizer',
    engineId: 0,   // one engine per module, unused by the binding
    class: RGBirdsSynth,
    category: 'synthesizer',
    wasmFiles: {
        js: 'rgbirds-synth.js',
        wasm: 'rgbirds-synth.wasm'
    },
    getParameterInfo: RGBirdsSynth.getParameterInfo
});

export { RGBirdsSynth };
