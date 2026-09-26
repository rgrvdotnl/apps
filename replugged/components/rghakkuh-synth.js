/**
 * RGHakkuh: the 909 kick and snare behind a drive and a PQ-4 EQ
 *
 * The pq4 drumlogue's instrument (logue/rghakkuh_pq4_drumlogue): DRIVE, the
 * three-band parametric EQ with its sweepable MID and HI frequencies, the two
 * drum levels and the EQ ROUTE switch, over the two fully synthesized 909 voices
 * (synth/rg909_bd.c and synth/rg909_sd.c) rather than over samples. See
 * plugins/RGHakkuh_Synth/wasm_bindings.c for the chain, for the parameter
 * indices, and for why it is those two voices under that panel.
 *
 * Two things about it are worth knowing before playing it, and both surprise
 * people who expect a 909:
 *
 *   Only two of the ten drums are here. This is the Hakkuh instrument, not the
 *   full kit -- 36 is the kick, 38 the snare, 60 and 64 both together, and every
 *   other note plays NOTHING. The drumlogue reached the same place from the other
 *   direction: it has one recorded kick and the sample engine's snare, and
 *   nothing else.
 *
 *   Velocity reaches the snare and only the snare. rg909_bd_trigger discards it
 *   (synth/rg909_bd.c), rg909_sd_trigger scales by velocity/127. The on-screen
 *   keyboard is velocity-sensitive by where on the key you click, so a soft click
 *   on the kick pad doing nothing is the engine being faithful, not a bug.
 *
 * A note-off is not forwarded: a hit decays on its own, and fading a ringing kick
 * out because a pad was released would be wrong on a page played from pads.
 */

import { SynthRegistry } from '../synth-registry.js';

class RGHakkuhSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.wasmModule = null;
        this.wasmInstance = null;
        this.wasmError = null;
        this.isInitialized = false;

        this.parameterInfo = RGHakkuhSynth.getParameterInfo();
    }

    /**
     * The pq4 drumlogue's nine, in the unit's own slots and at its own starting
     * positions (logue/rghakkuh_pq4_drumlogue/header.c: EQ levels 50/50/50,
     * sweeps 50/50, DRIVE 50, BD LVL 70, SD LVL 100, EQ ROUTE 0).
     *
     * The indices are the unit's, so they skip 3, 6 and 7. Slot 6 held BD TUNE
     * until the kick's playback rate was dropped, and the header left the gap
     * rather than moving every knob below it; this list follows suit so that a
     * slot number means the same thing here as on the machine. <rghakkuh-ui>
     * draws its own panel and reads the indices off the DOM, so nothing here
     * depends on the list being dense.
     *
     * All nine are 0..1 because that is what the binding takes; the unit's panel
     * reads 0..100 and the hardware divides by a hundred, so the numbers here are
     * the hardware's own over a hundred -- BD LVL 70 is /100 = 0.7 exactly, which
     * is the pq4 build's own init too. EQ ROUTE is the exception in kind rather
     * than in range: it is an INDEX, 0 the whole drum, 1 the kick alone, 2 the
     * snare alone, which is why the panel draws it as a select and why the
     * binding rejects anything outside 0..2 rather than guessing.
     */
    static getParameterInfo() {
        return [
            { index: 0, name: 'EQ Low Level', min: 0, max: 1, default: 0.50,
              description: 'Low band: 0.5 is neutral, below kills it, above boosts it' },
            { index: 1, name: 'EQ Mid Level', min: 0, max: 1, default: 0.50,
              description: 'Mid band: 0.5 is neutral, below kills it, above boosts it' },
            { index: 2, name: 'EQ High Level', min: 0, max: 1, default: 0.50,
              description: 'High band: 0.5 is neutral, below kills it, above boosts it' },
            { index: 4, name: 'EQ Mid Freq', min: 0, max: 1, default: 0.50,
              description: 'Where the mid band sits: 100 Hz at 0, 1.6 kHz at 1, 400 Hz at 0.5' },
            { index: 5, name: 'EQ High Freq', min: 0, max: 1, default: 0.50,
              description: 'Where the high band sits: 500 Hz at 0, 8 kHz at 1, 2 kHz at 0.5' },
            { index: 8, name: 'Drive', min: 0, max: 1, default: 0.50,
              description: 'Clean drum at 0, fully saturated at 1 (the kick only, as on the machine)' },
            { index: 9, name: 'BD Level', min: 0, max: 1, default: 0.70,
              description: 'Level of the finished kick, applied after the drive, so it does not change its shape' },
            { index: 10, name: 'SD Level', min: 0, max: 1, default: 1.00,
              description: 'Level of the snare: 1.0 is the loudest the engine has' },
            { index: 11, name: 'EQ Route', min: 0, max: 2, default: 0, type: 'enum',
              options: ['BD+SD', 'BD', 'SD'],
              description: 'What the EQ hears: 0 = kick and snare, 1 = kick only, 2 = snare only' },
        ];
    }

    async initialize() {
        try {
            console.log('[RGHakkuh] Loading WASM module...');

            const paths = SynthRegistry.getPaths();
            // Cache-busted, for the reason spelled out in rgstorm-synth.js: the
            // plugin build overwrites these files in place, and the dev server
            // sends no Cache-Control, so a browser may serve the previous build
            // from its heuristic cache and keep sounding broken.
            const v = '?v=' + Date.now();
            const wasmJsPath = paths.wasm + 'rghakkuh-synth.js' + v;
            const wasmBinaryPath = paths.wasm + 'rghakkuh-synth.wasm' + v;

            const [jsResponse, wasmResponse] = await Promise.all([
                fetch(wasmJsPath),
                fetch(wasmBinaryPath)
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to fetch WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            console.log('[RGHakkuh] WASM files loaded');

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
                                // The context's rate, which the binding passes to
                                // the kick and the snare per call. Not optional:
                                // the worklet defaults to 48000 and would keep
                                // that default silently, playing every hit at the
                                // wrong pitch on a 44.1 kHz context.
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
            console.log('[RGHakkuh] Initialized successfully');
            return true;

        } catch (error) {
            console.error('[RGHakkuh] Initialization error:', error);
            this.wasmError = error.message;
            return false;
        }
    }

    /** 36 kick, 38 snare, 60/64 both. Anything else plays nothing. */
    noteOn(note, velocity = 100) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'noteOn',
            data: { note, velocity }
        });
    }

    /**
     * What the drum pads, the channel-10 MIDI branch and playKeyboardNote all
     * call. The three drum classes this replaces each carried this alias, so the
     * page's drum plumbing does not have to learn a second name.
     */
    triggerDrum(note, velocity = 100) {
        this.noteOn(note, velocity);
    }

    /** Intentionally empty; a hit decays on its own. See the class comment. */
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
        console.log('[RGHakkuh] Destroyed');
    }
}

SynthRegistry.register({
    id: 'rghakkuh',
    name: 'RGHakkuh',
    displayName: 'RGHakkuh: 909 Kick & Snare',
    description: 'Synthesized 909 bass drum and snare through a drive and a PQ-4 parametric EQ',
    engineId: 13,   // one engine per module, unused by the binding
    class: RGHakkuhSynth,
    category: 'drum',
    wasmFiles: {
        js: 'rghakkuh-synth.js',
        wasm: 'rghakkuh-synth.wasm'
    },
    getParameterInfo: RGHakkuhSynth.getParameterInfo
});

export { RGHakkuhSynth };
