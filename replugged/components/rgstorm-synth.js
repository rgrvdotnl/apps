/**
 * RGStorm Synth - Web Audio rain and thunder
 *
 * The web half of rfx/effects/fx_weather.c: Andy Farnell's thunder model plus
 * the ambifx rain bed, the same C file the NTS-1 mkII, NTS-3 and drumlogue units
 * build from, so the page and the hardware are the same weather.
 *
 * This is not a keyboard instrument the way RGFrogs and RGBirds are. There is no
 * pitch: the rain is a bed that runs on its own, from the moment the engine is
 * alive, whether or not anything is playing -- the worklet calls process() every
 * block for exactly that reason. A note is a thunderclap, and it is the only way
 * one is fired; there is no strike button, because the keyboard is what a clap
 * is played with (see rgstorm-ui.js).
 *
 * RAIN defaults to 0 here and in the engine, so a page you have just clicked
 * opens dry: silence until you turn it up. Same call the drumlogue makes, and
 * the same lesson Birds learned the hard way by opening with its noise bed at
 * 0.15.
 *
 * A note-off is not forwarded, and allNotesOff does nothing: the model has no
 * gate to close, and a clap already in the air rings out on its own for as long
 * as its rumble and its echoes last. See the header for the parameter list.
 *
 * The sample rate matters more here than anywhere else in rfx/web, and for a
 * different reason than on RGFrogs. fx_weather.c is hardcoded for 48 kHz, so
 * the binding runs the engine at 48000 and resamples to whatever this context
 * is -- which is why the rate below must be the AudioContext's own and not a
 * default. web/replugged/player.js posts its wasmBytes without a rate at all,
 * and the worklet then falls back to 48000 for both the engine and the
 * process() call, so nothing downstream can detect the lie.
 */

import { SynthRegistry } from '../synth-registry.js';

class RGStormSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.wasmModule = null;
        this.wasmInstance = null;
        this.wasmError = null;
        this.isInitialized = false;

        this.parameterInfo = RGStormSynth.getParameterInfo();
    }

    /**
     * All four parameters are 0..1 because that is what the engine takes and
     * what the worklet forwards untouched, and the UI element pushes exactly
     * these on connect, so the page's defaults -- not the C ones -- are what you
     * hear.
     *
     * RAIN defaults to 0, and that is the point: a loaded Storm is silent until
     * its knob is turned. The bed is synthesized water -- filtered noise and
     * gated drops -- and having it on when the page opens means the first thing
     * you hear is a noise floor you did not ask for.
     *
     * DIST defaults to 1 (far off), which is the NTS-1 build's own init: a
     * clap you have to turn up to bring closer is a better first clap than one
     * directly overhead.
     */
    static getParameterInfo() {
        return [
            { id: 0, name: 'Rain', min: 0, max: 1, default: 0.00,
              description: 'The rain bed -- dry at 0, a downpour at 1' },
            { id: 1, name: 'Dist', min: 0, max: 1, default: 1.00,
              description: 'How far off the thunder is -- overhead at 0, distant at 1' },
            { id: 2, name: 'Intn', min: 0, max: 1, default: 0.50,
              description: 'Thunder intensity -- a low thump at 0, a sharp crackle at 1' },
            // The one knob the drumlogue adds to the NTS-3's set, and the
            // reason it exists is worth keeping in view: on the Kaoss pad the
            // model chooses the clap count from intensity, which is right for a
            // hand on a pad and wrong for anything that wants the same thunder
            // every time. Here you name the count outright and intensity goes
            // back to deciding only what each clap sounds like.
            { id: 3, name: 'Strikes', min: 0, max: 1, default: 0.40,
              description: 'Claps per storm -- one at 0, six at 1' },
        ];
    }

    async initialize() {
        try {
            console.log('[RGStorm] Loading WASM module...');

            const paths = SynthRegistry.getPaths();
            // Cache-busted. The plugin build overwrites these two files
            // in place, and python -m http.server sends no Cache-Control, so
            // a browser is free to serve the previous build from its
            // heuristic cache -- which is exactly how a fixed engine keeps
            // sounding broken. This class is itself loaded with ?v=<now> by
            // SynthRegistry, so the stamp below is always the current one.
            const v = '?v=' + Date.now();
            const wasmJsPath = paths.wasm + 'rgstorm-synth.js' + v;
            const wasmBinaryPath = paths.wasm + 'rgstorm-synth.wasm' + v;

            const [jsResponse, wasmResponse] = await Promise.all([
                fetch(wasmJsPath),
                fetch(wasmBinaryPath)
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to fetch WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            console.log('[RGStorm] WASM files loaded');

            // Cache-busted for the same reason the wasm pair is, and via the
            // same stamp: addModule caches its module by URL, so a page that
            // reused a cached worklet would keep running the previous build of
            // the processor no matter what was fixed in it.
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
                        // The context's own rate goes through, and it is not
                        // optional here. The engine is fixed at 48000 and the
                        // binding resamples from it, so this number is what
                        // decides whether the storm plays at the speed it was
                        // tuned to. The worklet defaults to 48000 and would
                        // silently keep that default if this were omitted --
                        // and then pass 48000 to process() too, so the binding
                        // would have no way to tell.
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
            console.log('[RGStorm] Initialized successfully');
            return true;

        } catch (error) {
            console.error('[RGStorm] Initialization error:', error);
            this.wasmError = error.message;
            return false;
        }
    }

    /**
     * A note-on is one thunderclap. Neither the note nor the velocity is read --
     * DIST, INTN and STRIKES are the whole description of a clap, exactly as on
     * the drumlogue. The on-screen keyboard is velocity-sensitive by where on
     * the key you click, so this is a deliberate choice rather than an omission;
     * see the binding's note_on for the longer version.
     */
    noteOn(note, velocity) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'noteOn',
            data: { note, velocity }
        });
    }

    /**
     * Accepted and dropped, deliberately. Thunder is a transient: a clap already
     * in the air does not stop because the key came up, and a key still down does
     * not keep it going. The model ends it on its own.
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
     * Nothing to do. There are no held voices to release -- all-notes-off is
     * the same as note-off here (fx_weather.h) -- and the rain bed is the pond,
     * not a note: silencing it means turning RAIN down, not this.
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
        console.log('[RGStorm] Destroyed');
    }
}

SynthRegistry.register({
    id: 'rgstorm',
    name: 'RGStorm',
    displayName: 'RGStorm Weather',
    description: 'Rain and thunder environment -- noise-based weather synthesizer',
    engineId: 0,   // one engine per module, unused by the binding
    class: RGStormSynth,
    category: 'synthesizer',
    wasmFiles: {
        js: 'rgstorm-synth.js',
        wasm: 'rgstorm-synth.wasm'
    },
    getParameterInfo: RGStormSynth.getParameterInfo
});

export { RGStormSynth };
