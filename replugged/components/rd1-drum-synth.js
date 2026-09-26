/**
 * RD1 Drum: the RS-1 in drum-machine mode, with a soundcart
 *
 * Six RS1 voices, one per pad, built on the same synth/rs1_poly.c the RGResonate1
 * above it plays: the kick is the RS1's 909-style resonator preset, the snare,
 * hats, clap and tom are the RS1's own, and each pad strikes its voice at note 60
 * whatever the pad was, because an RS1 preset carries its own pitch. That is
 * plugins/RD1_Drum/RD1_DrumPlugin.cpp exactly, and logue/rd1_* before it.
 *
 * The pad map is the machine's six and nothing else: 36 kick, 38 snare, 42
 * closed hat, 46 open hat, 39 clap, 50 tom. The page's Tom Low (41) and Tom Mid
 * (47) pads are silent, as they are on every RD-1 -- the panel says so rather
 * than leaving two dead pads unexplained.
 *
 * What this has that the other three drum components do not is the SOUNDCART:
 * loadCart() takes the .rs1cart that tools/rs1patcher's Drumkit mode exports --
 * 1592 bytes, six RS1 presets, one per pad -- and replaces the whole kit at
 * once. The kit that plays before any cartridge is loaded is the factory one,
 * compiled into the binding, so the pads sound the moment the engine is up.
 *
 * A cart is not merged, not per-pad, and not partial: a file that is not a
 * drumkit cart -- wrong size, wrong version, wrong slot count, or a slot that
 * will not parse -- is refused whole and the machine keeps playing what it was
 * playing. The binding returns a code for which check refused it and the panel
 * says which; see loadCart() and rd1-drum-ui.js.
 *
 * The panel is hand-written in rd1-drum-ui.js for the same reason RGHakkuh's is:
 * a generated <synth-ui> draws every parameter as a slider, and a file input is
 * not a slider.
 */

import { SynthRegistry } from '../synth-registry.js';

/** The cartridge layout, as plugins/RD1_Drum/wasm_bindings.c has it. Named here
 *  so the panel can say what it expected when a file is the wrong size. */
const CART_SIZE = 1592;

class RD1DrumSynth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.workletNode = null;
        this.masterGain = null;
        this.wasmModule = null;
        this.wasmInstance = null;
        this.wasmError = null;
        this.isInitialized = false;

        /** Called with {ok, names} or {ok:false, code, error} after a cart load.
         *  The panel sets it; nothing here needs a UI to work. */
        this.onCartResult = null;

        this.parameterInfo = RD1DrumSynth.getParameterInfo();
    }

    /**
     * The seven controls, in DistrhoPluginInfo.h's own order: the six pad levels
     * and the master. 0..1, which is what the binding takes and what the worklet
     * forwards untouched.
     *
     * All seven open at 0.80, which is the DPF plugin's own default for every
     * one of them (RD1_DrumPlugin.cpp:29-30) and what the binding's create()
     * sets. The page and the plugin are the same machine, so they open on the
     * same panel. Six pads landing together are held inside full scale by the
     * soft clip after the sum (tanh(x * 0.4)), not by these -- six pads struck
     * at once peak at 0.63 of full scale here and 0.90 with all seven at the top
     * (test/rd1_web, on the shipped Default drumkit).
     */
    static getParameterInfo() {
        return [
            { index: 0, name: 'Kick', min: 0, max: 1, default: 0.80,
              description: 'Kick pad (36) level' },
            { index: 1, name: 'Snare', min: 0, max: 1, default: 0.80,
              description: 'Snare pad (38) level' },
            { index: 2, name: 'CH', min: 0, max: 1, default: 0.80,
              description: 'Closed hat pad (42) level' },
            { index: 3, name: 'OH', min: 0, max: 1, default: 0.80,
              description: 'Open hat pad (46) level' },
            { index: 4, name: 'Clap', min: 0, max: 1, default: 0.80,
              description: 'Clap pad (39) level' },
            { index: 5, name: 'Tom', min: 0, max: 1, default: 0.80,
              description: 'Tom pad (50) level: the machine has one tom, not three' },
            { index: 6, name: 'Master', min: 0, max: 1, default: 0.80,
              description: 'Master level, after the soft clip' },
        ];
    }

    async initialize() {
        try {
            console.log('[RD1] Loading WASM module...');

            const paths = SynthRegistry.getPaths();
            // Cache-busted, for the reason spelled out in rgstorm-synth.js.
            const v = '?v=' + Date.now();
            const wasmJsPath = paths.wasm + 'rd1-drum-synth.js' + v;
            const wasmBinaryPath = paths.wasm + 'rd1-drum-synth.wasm' + v;

            const [jsResponse, wasmResponse] = await Promise.all([
                fetch(wasmJsPath),
                fetch(wasmBinaryPath)
            ]);

            if (!jsResponse.ok || !wasmResponse.ok) {
                throw new Error('Failed to fetch WASM files');
            }

            const jsCode = await jsResponse.text();
            const wasmBytes = await wasmResponse.arrayBuffer();

            console.log('[RD1] WASM files loaded');

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
                                // The context's rate. Every voice is created at
                                // this number and the binding then ignores the
                                // rate it is handed per block, so a loaded cart
                                // survives a session that thinks it is at 44.1
                                // kHz. The worklet's own default is 48000.
                                sampleRate: this.audioContext.sampleRate
                            }
                        });
                    } else if (event.data.type === 'ready') {
                        clearTimeout(timeout);
                        resolve();
                    } else if (event.data.type === 'error') {
                        clearTimeout(timeout);
                        reject(new Error(event.data.data.message));
                    } else if (event.data.type === 'cartLoaded') {
                        this.onCartResult?.({ ok: true, names: event.data.names || [] });
                    } else if (event.data.type === 'cartError') {
                        this.onCartResult?.({
                            ok: false,
                            code: event.data.code,
                            error: event.data.error
                        });
                    }
                };
            });

            this.workletNode.connect(this.masterGain);

            this.isInitialized = true;
            console.log('[RD1] Initialized successfully');
            return true;

        } catch (error) {
            console.error('[RD1] Initialization error:', error);
            this.wasmError = error.message;
            return false;
        }
    }

    /** 36 kick, 38 snare, 42 CH, 46 OH, 39 clap, 50 tom. Anything else is silent. */
    noteOn(note, velocity = 100) {
        if (!this.isInitialized) return;
        this.workletNode?.port.postMessage({
            type: 'noteOn',
            data: { note, velocity }
        });
    }

    /**
     * What the drum pads, the channel-10 MIDI branch and playKeyboardNote all
     * call; the other drum components carry this alias too.
     */
    triggerDrum(note, velocity = 100) {
        this.noteOn(note, velocity);
    }

    /** Intentionally empty; a hit decays on its own and the binding's note_off
     *  is documented as doing nothing at all. */
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

    /**
     * Replace the whole kit from a drumkit soundcart.
     *
     * The bytes go to the binding untouched -- it is the one that decides what a
     * cart is, and it decides before it touches a voice, so a refusal here costs
     * nothing and cannot half-load a kit. The answer arrives on onCartResult
     * rather than as a return value, because the load happens in the audio
     * worklet.
     *
     * The size check below is a courtesy, not a gate: it catches the common
     * mistake (a .rs1 preset, a chromatic cart) with a sentence that names the
     * number, and everything else is the binding's call.
     */
    loadCart(bytes, fileName = '') {
        if (!this.isInitialized) {
            this.onCartResult?.({ ok: false, error: 'the engine is not loaded' });
            return;
        }

        if (!bytes || bytes.length !== CART_SIZE) {
            this.onCartResult?.({
                ok: false,
                code: -2,
                error: `${fileName || 'that file'} is ${bytes ? bytes.length : 0} bytes; ` +
                       `a drumkit soundcart is ${CART_SIZE}`
            });
            return;
        }

        this.workletNode?.port.postMessage({
            type: 'loadCart',
            data: { bytes: bytes, fileName: fileName }
        });
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
        console.log('[RD1] Destroyed');
    }
}

SynthRegistry.register({
    id: 'rd1drum',
    name: 'RD1Drum',
    displayName: 'RD1 Drum: RS-1 Drum Machine',
    description: 'Six RS-1 voices on the six RD-1 pads, factory kit at launch, soundcart loader',
    engineId: 14,   // one engine per module, unused by the binding
    class: RD1DrumSynth,
    category: 'drum',
    wasmFiles: {
        js: 'rd1-drum-synth.js',
        wasm: 'rd1-drum-synth.wasm'
    },
    getParameterInfo: RD1DrumSynth.getParameterInfo
});

export { RD1DrumSynth, CART_SIZE };
