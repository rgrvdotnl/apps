/**
 * RD404: the four-voice synthesized drum machine
 *
 * A synthesized kick, snare and a pair of hi-hats on synth/rg404_drum_synth.c.
 * Same instrument as before; what changed is how the browser talks to it. It used
 * to be a class on the drum worklet with its own rg404_* entry points, and it is
 * now the shared synth worklet and the regroove_synth_* ones -- so the drum
 * engines and the melodic instruments finally speak the same language, and there
 * is one worklet stack on the page instead of two.
 *
 * The fifteen controls are new to the page. The class this replaces returned an
 * empty parameter list, so the engine's controls were unreachable from the web
 * even though the LV2 and VST3 builds have always exposed them. They are
 * generated here by <synth-ui> from getParameterInfo() below.
 *
 * Note map: 36 kick, 38 snare, 42 closed hat, 46 open hat. Everything else is
 * silent -- rg404_synth_trigger_drum() rejects the note itself.
 */

import { SynthRegistry } from '../synth-registry.js';

class RD404Synth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.wasmModule = null;
        this.wasmInstance = null;
        this.wasmError = null;
        this.isInitialized = false;

        this.parameterInfo = RD404Synth.getParameterInfo();
    }

    /**
     * The engine's fifteen, in its own index order (synth/rg404_drum_synth.c), at
     * the positions rg404_synth_create() starts them at. 0..100 with
     * scale:'normalized', so the panel reads as percentages and synth-ui sends
     * them divided by a hundred, which is what the engine takes.
     *
     * These are what the page sounds like on load: the worklet's attempt to seed
     * parameters from the engine is dead code (see rg909-synth.js for the longer
     * note). They agree with the engine, because the engine's create is where they
     * were read from.
     */
    static getParameterInfo() {
        return [
            { index: 0, name: 'BD Level', type: 'float', group: 'Bass Drum',
              min: 0, max: 100, default: 80, scale: 'normalized',
              description: 'Bass drum level' },
            { index: 1, name: 'BD Tune', type: 'float', group: 'Bass Drum',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Bass drum pitch' },
            { index: 2, name: 'BD Decay', type: 'float', group: 'Bass Drum',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Bass drum length' },
            { index: 3, name: 'BD Attack', type: 'float', group: 'Bass Drum',
              min: 0, max: 100, default: 0, scale: 'normalized',
              description: 'Click level at the front of the hit' },

            { index: 4, name: 'SD Level', type: 'float', group: 'Snare',
              min: 0, max: 100, default: 70, scale: 'normalized',
              description: 'Snare level' },
            { index: 5, name: 'SD Tone', type: 'float', group: 'Snare',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Snare body' },
            { index: 6, name: 'SD Snappy', type: 'float', group: 'Snare',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Snare rattle: the noise under the head' },
            { index: 7, name: 'SD Tuning', type: 'float', group: 'Snare',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Snare pitch' },

            { index: 8, name: 'CH Level', type: 'float', group: 'Closed Hat',
              min: 0, max: 100, default: 60, scale: 'normalized',
              description: 'Closed hi-hat level' },
            { index: 9, name: 'CH Tone', type: 'float', group: 'Closed Hat',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Closed hi-hat tone' },
            { index: 10, name: 'CH Decay', type: 'float', group: 'Closed Hat',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Closed hi-hat length' },

            { index: 11, name: 'OH Level', type: 'float', group: 'Open Hat',
              min: 0, max: 100, default: 60, scale: 'normalized',
              description: 'Open hi-hat level' },
            { index: 12, name: 'OH Tone', type: 'float', group: 'Open Hat',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Open hi-hat tone' },
            { index: 13, name: 'OH Decay', type: 'float', group: 'Open Hat',
              min: 0, max: 100, default: 50, scale: 'normalized',
              description: 'Open hi-hat length' },

            { index: 14, name: 'Master', type: 'float', group: 'Global',
              min: 0, max: 100, default: 60, scale: 'normalized',
              description: 'Output level of the whole kit' },
        ];
    }

    async initialize() {
        try {
            console.log('[RD404] Loading WASM module...');

            const paths = SynthRegistry.getPaths();
            // Cache-busted, for the reason spelled out in rgstorm-synth.js: the
            // module is overwritten in place by the build and the dev server sends
            // no Cache-Control.
            const v = '?v=' + Date.now();
            const wasmJsPath = paths.wasm + 'rd404-synth.js' + v;
            const wasmBinaryPath = paths.wasm + 'rd404-synth.wasm' + v;

            const [jsResponse, wasmResponse] = await Promise.all([
                fetch(wasmJsPath),
                fetch(wasmBinaryPath)
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to fetch WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            console.log('[RD404] WASM files loaded');

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
                                // The engine takes the rate per call, so this one
                                // is not a fixed tuning -- but the worklet also
                                // passes its own rate to every process() call, and
                                // a trigger has no rate of its own to carry, so the
                                // two have to be the same number or a hit lands
                                // scaled by the ratio.
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
            console.log('[RD404] Initialized successfully');
            return true;

        } catch (error) {
            console.error('[RD404] Initialization error:', error);
            this.wasmError = error.message;
            return false;
        }
    }

    /** 36 kick, 38 snare, 42 closed hat, 46 open hat. Anything else is silent. */
    noteOn(note, velocity = 100) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'noteOn',
            data: { note, velocity }
        });
    }

    /**
     * What the drum pads, the channel-10 MIDI branch and playKeyboardNote all
     * call; the class this replaces carried this alias too, so the page's drum
     * plumbing does not have to change.
     */
    triggerDrum(note, velocity = 100) {
        this.noteOn(note, velocity);
    }

    /** Intentionally empty; a hit decays on its own. */
    noteOff(note) {
        // Nothing to release.
    }

    setParameter(paramId, value) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'setParameter',
            data: { index: paramId, value: value }
        });
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
        console.log('[RD404] Destroyed');
    }
}

SynthRegistry.register({
    id: 'rd404',
    name: 'RD404',
    displayName: 'RD404: Drum Machine',
    description: 'Four-voice synthesized drum machine: kick, snare, closed and open hi-hats',
    engineId: 11,   // one engine per module, unused by the binding
    class: RD404Synth,
    category: 'drum',
    wasmFiles: {
        js: 'rd404-synth.js',
        wasm: 'rd404-synth.wasm'
    },
    getParameterInfo: RD404Synth.getParameterInfo
});

export { RD404Synth };
