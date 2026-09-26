// Generic AudioWorklet Processor for WASM Synths
// Handles MIDI events and audio generation for RGResonate1, RG1Piano, etc.
// VERSION v213 - Fixed inputOp to read int8 instead of int32

class SynthWorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.wasmModule = null;
        this.synthPtr = null;
        this.audioBufferPtr = null;
        this.bufferSize = 128; // AudioWorklet quantum size
        this.sampleRate = 48000;

        // WASM function name mappings (will be filled after examining WASM exports)
        this.wasmFuncs = {
            create: null,
            destroy: null,
            note_on: null,
            note_off: null,
            all_notes_off: null,
            process: null,
            reset: null,
            set_parameter_value: null
        };

        this.port.onmessage = this.handleMessage.bind(this);

        // Request WASM bytes from main thread
        this.port.postMessage({ type: 'needWasm' });
    }

    handleMessage(event) {
        const { type, data } = event.data;

        if (type === 'wasmBytes') {
            this.initWasm(data, data.sampleRate || 48000);
        } else if (type === 'noteOn') {
            this.handleNoteOn(data.note, data.velocity);
        } else if (type === 'noteOff') {
            this.handleNoteOff(data.note);
        } else if (type === 'allNotesOff') {
            this.allNotesOff();
        } else if (type === 'setParam' || type === 'setParameter') {
            this.setParameter(data.index, data.value);
        } else if (type === 'setParameterInt') {
            this.setParameterInt(data.index, data.value);
        } else if (type === 'reset') {
            this.reset();
        } else if (type === 'loadSysex') {
            this.loadSysex(data.sysexData, data.patchNum || 0);
        } else if (type === 'selectPatch') {
            this.selectPatch(data.sysexData, data.patchNum);
        } else if (type === 'plist_import') {
            this.importPreset(data.buffer);
        } else if (type === 'plist_export') {
            this.exportPreset(data.presetName || 'MyPreset');
        } else if (type === 'plist_set_speed') {
            this.setPListSpeed(data.speed);
        } else if (type === 'plist_get_state') {
            this.getPListState();
        } else if (type === 'loadWav') {
            this.loadWavFile(data);
        } else if (type === 'getPresetCount') {
            this.getPresetCount();
        } else if (type === 'getPresetName') {
            this.getPresetName(data.index);
        } else if (type === 'loadPreset') {
            this.loadPreset(data.index, data.voice);
        } else if (type === 'loadRS1Binary') {
            this.loadRS1Binary(data.bytes);
        } else if (type === 'loadCart') {
            this.loadCart(data.bytes);
        } else if (type === 'setText') {
            this.setText(data.text);
        } else if (type === 'getPhonemes') {
            this.getPhonemes();
        }
    }

    importPreset(buffer) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot import preset: WASM not initialized');
            return;
        }

        try {
            // Stop all notes before importing
            this.allNotesOff();

            console.log(`[SynthWorklet] importPreset: buffer size=${buffer.length} bytes`);
            console.log(`[SynthWorklet] synthPtr=0x${this.synthPtr.toString(16)}`);
            console.log(`[SynthWorklet] First 16 bytes:`, Array.from(buffer.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));

            // Check PList state BEFORE import
            const lengthBefore = this.wasmModule._regroove_synth_get_plist_length ?
                this.wasmModule._regroove_synth_get_plist_length(this.synthPtr) : -1;
            console.log(`[SynthWorklet] PList length BEFORE import: ${lengthBefore}`);

            // Allocate buffer in WASM memory
            const bufferPtr = this.wasmModule._malloc(buffer.length);
            const heapU8 = new Uint8Array(this.wasmMemory.buffer, bufferPtr, buffer.length);
            heapU8.set(buffer);

            console.log(`[SynthWorklet] Calling _regroove_synth_import_preset(0x${this.synthPtr.toString(16)}, 0x${bufferPtr.toString(16)}, ${buffer.length})`);

            // Try clearing PList first (in case old data is blocking import)
            if (this.wasmModule._regroove_synth_clear_plist) {
                console.log('[SynthWorklet] Clearing PList before import...');
                this.wasmModule._regroove_synth_clear_plist(this.synthPtr);
            }

            // Call C import function (handles all parsing)
            const result = this.wasmModule._regroove_synth_import_preset(this.synthPtr, bufferPtr, buffer.length);
            console.log(`[SynthWorklet] _regroove_synth_import_preset returned: ${result}`);

            // Free buffer
            this.wasmModule._free(bufferPtr);

            if (result) {
                console.log('[SynthWorklet] .ahxp preset imported successfully');

                // Get parameter values from synth to update UI
                const parameters = [];
                if (this.wasmFuncs.get_parameter_count && this.wasmFuncs.get_parameter) {
                    const paramCount = this.wasmFuncs.get_parameter_count(this.synthPtr);
                    for (let i = 0; i < paramCount; i++) {
                        const value = this.wasmFuncs.get_parameter(this.synthPtr, i);
                        parameters.push({ index: i, value: value });
                    }
                }

                this.port.postMessage({ type: 'preset_imported', data: { success: true, parameters } });

                // Also send PList state if available
                this.getPListState();
            } else {
                console.error('[SynthWorklet] Preset import failed');
                this.port.postMessage({ type: 'preset_imported', data: { success: false } });
            }
        } catch (error) {
            console.error('[SynthWorklet] Import error:', error);
            this.port.postMessage({ type: 'preset_imported', data: { success: false, error: error.message } });
        }
    }

    setPListSpeed(speed) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot set PList speed: WASM not initialized');
            return;
        }

        try {
            if (this.wasmModule._regroove_synth_set_plist_speed) {
                this.wasmModule._regroove_synth_set_plist_speed(this.synthPtr, speed);
                console.log(`[SynthWorklet] PList speed set to ${speed}`);
            } else {
                console.error('[SynthWorklet] _regroove_synth_set_plist_speed not available');
            }
        } catch (error) {
            console.error('[SynthWorklet] Error setting PList speed:', error);
        }
    }

    getPListState() {
        console.log('[SynthWorklet] getPListState() called');
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot get PList state: WASM not initialized');
            return;
        }

        try {
            // Check if functions exist
            if (!this.wasmModule._regroove_synth_get_plist_length) {
                console.error('[SynthWorklet] _regroove_synth_get_plist_length not found!');
                return;
            }
            if (!this.wasmModule._regroove_synth_get_plist_speed) {
                console.error('[SynthWorklet] _regroove_synth_get_plist_speed not found!');
                return;
            }

            const length = this.wasmModule._regroove_synth_get_plist_length(this.synthPtr);
            const speed = this.wasmModule._regroove_synth_get_plist_speed(this.synthPtr);
            console.log(`[SynthWorklet] PList length: ${length}, speed: ${speed}`);

            // Get all entries
            const entries = [];
            for (let i = 0; i < length; i++) {
                const entryPtr = this.wasmModule._malloc(8); // PList entry struct size
                this.wasmModule._regroove_synth_get_plist_entry(this.synthPtr, i, entryPtr);

                const heapU8 = new Uint8Array(this.wasmMemory.buffer, entryPtr, 8);
                entries.push({
                    note: heapU8[0] | (heapU8[1] << 8),
                    fixed: heapU8[2],
                    waveform: heapU8[3],
                    fx: [heapU8[4], heapU8[5]],
                    fx_param: [heapU8[6], heapU8[7]]
                });

                this.wasmModule._free(entryPtr);
            }

            console.log(`[SynthWorklet] Sending PList state: ${entries.length} entries`);
            // Send state to main thread
            this.port.postMessage({
                type: 'plist_state',
                data: { length, speed, entries }
            });
        } catch (error) {
            console.error('[SynthWorklet] Error getting PList state:', error);
        }
    }

    loadWavFile(data) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot load WAV: WASM not initialized');
            return;
        }

        try {
            const { pcmData, sampleRate, cuePoints } = data;
            console.log(`[SynthWorklet] Loading WAV: ${pcmData.length} samples, ${cuePoints.length} cue points`);

            // Allocate PCM data in WASM memory
            const pcmPtr = this.wasmModule._malloc(pcmData.length * 2); // Int16 = 2 bytes
            const heapI16 = new Int16Array(this.wasmMemory.buffer, pcmPtr, pcmData.length);
            heapI16.set(pcmData);

            // Call rgslicer_load_wav_from_memory to load the WAV data
            // Function signature: rgslicer_load_wav_from_memory(synth*, pcm_data*, num_samples, sample_rate) -> int
            if (this.wasmModule._rgslicer_load_wav_from_memory) {
                const result = this.wasmModule._rgslicer_load_wav_from_memory(
                    this.synthPtr,
                    pcmPtr,
                    pcmData.length,
                    sampleRate
                );

                if (!result) {
                    console.error('[SynthWorklet] Failed to load sample into RGSlicer');
                    this.wasmModule._free(pcmPtr);
                    return;
                }

                // Prepare CUE positions for slicing
                let cuePtr = 0;
                let numCues = 0;

                if (cuePoints && cuePoints.length > 0) {
                    console.log(`[SynthWorklet] Creating ${cuePoints.length} slices from CUE points`);
                    numCues = cuePoints.length;
                    cuePtr = this.wasmModule._malloc(numCues * 4); // uint32 array
                    const heapU32 = new Uint32Array(this.wasmMemory.buffer, cuePtr, numCues);
                    for (let i = 0; i < numCues; i++) {
                        heapU32[i] = cuePoints[i].position;
                    }
                }

                // Call rgslicer_set_slices_from_cues to create slices
                // This handles both CUE-based slicing and auto-slicing
                if (this.wasmModule._rgslicer_set_slices_from_cues) {
                    const numSlicesCreated = this.wasmModule._rgslicer_set_slices_from_cues(
                        this.synthPtr,
                        cuePtr,
                        numCues
                    );
                    console.log(`[SynthWorklet] Created ${numSlicesCreated} slices`);
                }

                // Free CUE pointer if allocated
                if (cuePtr) {
                    this.wasmModule._free(cuePtr);
                }

                // Get slice info from WASM
                const numSlices = this.wasmModule._rgslicer_get_slice_count
                    ? this.wasmModule._rgslicer_get_slice_count(this.synthPtr)
                    : 0;

                // Get slice details
                const slices = [];
                if (this.wasmModule._rgslicer_get_slice_offset_at && this.wasmModule._rgslicer_get_slice_length_at) {
                    for (let i = 0; i < numSlices; i++) {
                        const offset = this.wasmModule._rgslicer_get_slice_offset_at(this.synthPtr, i);
                        const length = this.wasmModule._rgslicer_get_slice_length_at(this.synthPtr, i);
                        slices.push({
                            offset: offset,
                            length: length,
                            midiNote: 36 + i  // White key mapping starts at C2 (MIDI 36)
                        });
                    }
                }

                console.log(`[SynthWorklet] WAV loaded: ${numSlices} slices`);

                // Send slice info back to main thread
                this.port.postMessage({
                    type: 'sliceInfo',
                    data: {
                        numSlices: numSlices,
                        slices: slices.length > 0 ? slices : null
                    }
                });
            } else {
                console.error('[SynthWorklet] _rgslicer_load_wav_from_memory not found in WASM exports');
            }

            // Free allocated memory
            this.wasmModule._free(pcmPtr);
        } catch (error) {
            console.error('[SynthWorklet] Error loading WAV:', error);
            this.port.postMessage({
                type: 'error',
                data: error.message
            });
        }
    }

    exportPreset(presetName) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot export preset: WASM not initialized');
            return;
        }

        try {
            // Allocate size output parameter
            const sizePtr = this.wasmModule._malloc(4);
            const heapU32 = new Uint32Array(this.wasmMemory.buffer, sizePtr, 1);

            // Call C export function (writes preset + PList data to buffer)
            const namePtr = this.wasmModule._malloc(presetName.length + 1);
            const heapU8Name = new Uint8Array(this.wasmMemory.buffer, namePtr, presetName.length + 1);
            for (let i = 0; i < presetName.length; i++) {
                heapU8Name[i] = presetName.charCodeAt(i);
            }
            heapU8Name[presetName.length] = 0;

            const bufferPtr = this.wasmModule._regroove_synth_export_preset(this.synthPtr, namePtr, sizePtr);
            const size = heapU32[0];

            this.wasmModule._free(namePtr);
            this.wasmModule._free(sizePtr);

            if (!bufferPtr || size === 0) {
                console.error('[SynthWorklet] Export failed - no data');
                return;
            }

            // Copy buffer to JavaScript
            const buffer = new Uint8Array(size);
            const heapU8 = new Uint8Array(this.wasmMemory.buffer, bufferPtr, size);
            buffer.set(heapU8);

            // Free C buffer
            this.wasmModule._regroove_synth_free_preset_buffer(bufferPtr);

            console.log(`[SynthWorklet] Exported preset (${size} bytes)`);

            // Send to main thread
            this.port.postMessage({
                type: 'preset_exported',
                data: {
                    name: presetName,
                    buffer: buffer,
                    format: 'binary'
                }
            });
        } catch (error) {
            console.error('[SynthWorklet] Export error:', error);
        }
    }

    async initWasm(wasmData, sampleRate) {
        try {
            console.log('[SynthWorklet] Loading Emscripten module...');
            this.sampleRate = sampleRate;

            const moduleCode = wasmData.jsCode;
            const wasmBytes = wasmData.wasmBytes;
            const engineId = wasmData.engineId || wasmData.engine || 0;

            // Create fake CommonJS environment to capture the module export
            // Emscripten modules end with: if(typeof exports==="object"&&typeof module==="object"){module.exports=...}
            const fakeExports = {};
            const fakeModule = { exports: fakeExports };

            // Inject code to capture wasmMemory and eval in a scope with fake module/exports.
            //
            // Two anchors, because emscripten renamed the factory's tail between
            // versions: an older emcc ends `;return moduleRtn`, the current one
            // ends `;return Module`, and neither string occurs in the other's
            // output. Matching only the old one is not a load-time failure -- the
            // factory still runs and the synth still makes sound -- it fails
            // later, when the first `new Uint8Array(this.wasmMemory.buffer)`
            // throws on undefined. So a module built today would load and then
            // break on the first note, which is exactly the kind of thing that
            // looks like an engine bug. `wasmMemory` is the local holding the
            // WebAssembly.Memory in both, so only the name after `return` differs.
            const modifiedCode = moduleCode
                .replace(';return moduleRtn',
                         ';globalThis.__wasmMemory=wasmMemory;return moduleRtn')
                .replace(';return Module',
                         ';globalThis.__wasmMemory=wasmMemory;return Module');

            // Execute in a function scope with module and exports defined
            (function(module, exports) {
                eval(modifiedCode);
            })(fakeModule, fakeExports);

            // Get the module factory from the fake exports
            const ModuleFactory = fakeModule.exports || fakeModule.exports.default;
            if (!ModuleFactory) {
                throw new Error('Failed to capture WASM module factory');
            }

            // Call the factory with WASM bytes.
            //
            // `wasmBinary` alone is not enough, and this is the subtle one. It
            // used to be: an older emcc's getBinarySync opened with
            //   if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}
            // and current emcc dropped that line, leaving
            //   function getBinarySync(file){if(readBinary){return readBinary(file)}throw"..."}
            // So a module built today ignores the option and tries to *fetch*
            // its own .wasm. In this AudioWorklet that cannot work at all:
            // ENVIRONMENT_IS_WORKER is false because an AudioWorkletGlobalScope
            // is not a WorkerGlobalScope, and document/window are absent, so
            // neither readAsync nor readBinary is ever defined -- the fetch
            // 404s and then getBinarySync throws "both async and sync fetching
            // of the wasm failed", which is what the console shows. The URL it
            // resolves against is this worklet's own directory, so the file it
            // wants is never there either.
            //
            // instantiateWasm is checked before any of that, in both versions,
            // so supplying it skips the whole path. It is the hook emscripten
            // documents for callers who already hold the bytes, which is
            // precisely this case. The signature is (imports, successCallback)
            // in both; the older one also passes the module as a second
            // callback argument and accepts a returned exports object, so
            // returning {} and resolving through the callback satisfies both.
            this.wasmModule = await ModuleFactory({
                wasmBinary: wasmBytes,
                instantiateWasm: function (imports, successCallback) {
                    WebAssembly.instantiate(wasmBytes, imports).then(function (result) {
                        successCallback(result.instance);
                    });
                    return {};
                }
            });

            // Capture the memory reference
            this.wasmMemory = globalThis.__wasmMemory;
            delete globalThis.__wasmMemory;

            console.log('[SynthWorklet] WASM ready');

            // Map function names
            this.mapWasmFunctions();

            // Allocate audio buffer (stereo interleaved)
            this.audioBufferPtr = this.wasmModule._malloc(this.bufferSize * 2 * 4);

            if (!this.audioBufferPtr) {
                throw new Error('_malloc returned null - memory allocation failed');
            }

            console.log(`[SynthWorklet] Buffer: 0x${this.audioBufferPtr.toString(16)}`);

            // Create synth instance (engine ID passed from main thread)
            console.log(`[SynthWorklet] Creating synth with engine ID: ${engineId}, sample rate: ${this.sampleRate}`);
            if (this.wasmFuncs.create) {
                this.synthPtr = this.wasmFuncs.create(engineId, this.sampleRate);
                if (!this.synthPtr) {
                    throw new Error(`regroove_synth_create(${engineId}) returned null/undefined`);
                }
                console.log(`[SynthWorklet] ✅ Synth created (engine ${engineId}): 0x${this.synthPtr.toString(16)}`);

                // Get parameter count to verify synth is correct
                if (this.wasmFuncs.get_parameter_count) {
                    const paramCount = this.wasmFuncs.get_parameter_count(this.synthPtr);
                    console.log(`[SynthWorklet] Synth has ${paramCount} parameters`);
                }

                // Initialize all parameters to their default values
                if (this.wasmFuncs.get_parameter_count && this.wasmFuncs.get_parameter_default && this.wasmFuncs.set_parameter) {
                    const paramCount = this.wasmFuncs.get_parameter_count(this.synthPtr);
                    for (let i = 0; i < paramCount; i++) {
                        const defaultValue = this.wasmFuncs.get_parameter_default(this.synthPtr, i);
                        this.wasmFuncs.set_parameter(this.synthPtr, i, defaultValue);
                    }
                    console.log(`[SynthWorklet] Initialized ${paramCount} parameters to defaults`);
                }
            } else {
                throw new Error('regroove_synth_create not found in WASM exports');
            }

            this.port.postMessage({ type: 'ready' });
            console.log('[SynthWorklet] ✅ Ready!');
        } catch (error) {
            console.error('[SynthWorklet] ❌ Failed:', error);
            this.port.postMessage({ type: 'error', data: { message: error.message || String(error) } });
        }
    }

    mapWasmFunctions() {

        // Map Emscripten Module exports
        this.wasmFuncs.create = this.wasmModule._regroove_synth_create;
        this.wasmFuncs.destroy = this.wasmModule._regroove_synth_destroy;
        this.wasmFuncs.reset = this.wasmModule._regroove_synth_reset;
        this.wasmFuncs.note_on = this.wasmModule._regroove_synth_note_on;
        this.wasmFuncs.note_off = this.wasmModule._regroove_synth_note_off;
        this.wasmFuncs.all_notes_off = this.wasmModule._regroove_synth_all_notes_off;
        this.wasmFuncs.process = this.wasmModule._regroove_synth_process_f32;
        this.wasmFuncs.set_parameter_value = this.wasmModule._regroove_synth_set_parameter;

        console.log('[SynthWorklet] ✓ Mapped synth functions');
    }

    handleNoteOn(note, velocity) {
        if (!this.synthPtr || !this.wasmFuncs.note_on) return;
        // Convert normalized velocity (0-1) to MIDI velocity (0-127)
        // If velocity > 1.0, assume it's already in MIDI range (0-127)
        const midiVelocity = velocity > 1.0 ? Math.floor(velocity) : Math.floor(velocity * 127);
        this.wasmFuncs.note_on(this.synthPtr, note, midiVelocity);
    }

    handleNoteOff(note) {
        if (!this.synthPtr || !this.wasmFuncs.note_off) return;
        this.wasmFuncs.note_off(this.synthPtr, note);
    }

    allNotesOff() {
        if (!this.synthPtr || !this.wasmFuncs.all_notes_off) return;
        this.wasmFuncs.all_notes_off(this.synthPtr);
    }

    setParameter(index, value) {
        if (!this.synthPtr || !this.wasmFuncs.set_parameter_value) return;
        this.wasmFuncs.set_parameter_value(this.synthPtr, index, value);
    }

    setParameterInt(index, value) {
        if (!this.synthPtr) return;
        // Use integer API if available, otherwise convert to normalized
        if (this.wasmModule._regroove_synth_set_parameter_int) {
            this.wasmModule._regroove_synth_set_parameter_int(this.synthPtr, index, value);
        } else if (this.wasmFuncs.set_parameter_value) {
            // Fallback: get max value and normalize
            const maxValue = this.wasmModule._regroove_synth_get_parameter_max_value ?
                this.wasmModule._regroove_synth_get_parameter_max_value(index) : 127;
            this.wasmFuncs.set_parameter_value(this.synthPtr, index, value / maxValue);
        }
    }

    reset() {
        if (!this.synthPtr || !this.wasmFuncs.reset) return;
        this.wasmFuncs.reset(this.synthPtr);
    }

    setText(text) {
        if (!this.wasmModule || !this.synthPtr) return;
        const fn = this.wasmModule._regroove_synth_set_text;
        if (!fn) return;
        // Convert JS string → WASM char* using ccall (handles UTF-8 allocation)
        this.wasmModule.ccall('regroove_synth_set_text', null,
            ['number', 'string'], [this.synthPtr, text]);
    }

    getPhonemes() {
        if (!this.wasmModule || !this.synthPtr) return;
        const fn = this.wasmModule._regroove_synth_get_phoneme_string;
        if (!fn) return;
        const buf = this.wasmModule._malloc(1024);
        fn(this.synthPtr, buf, 1024);
        const phonemes = this.wasmModule.UTF8ToString(buf);
        this.wasmModule._free(buf);
        this.port.postMessage({ type: 'phonemes', data: { phonemes } });
    }

    loadSysex(sysexData, patchNum) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot load SysEx: WASM not initialized');
            return;
        }

        if (!this.wasmModule._rgdx7_load_sysex) {
            console.warn('[SynthWorklet] rgdx7_load_sysex not available');
            return;
        }

        // Allocate memory for SysEx data
        const dataPtr = this.wasmModule._malloc(sysexData.length);
        const heapU8 = new Uint8Array(this.wasmMemory.buffer, dataPtr, sysexData.length);
        heapU8.set(sysexData);

        // Call WASM function to load SysEx
        const result = this.wasmModule._rgdx7_load_sysex(this.synthPtr, dataPtr, sysexData.length, patchNum || 0);

        // Free allocated memory
        this.wasmModule._free(dataPtr);

        if (!result) {
            console.error('[SynthWorklet] Failed to load SysEx');
        }
    }

    selectPatch(sysexData, patchNum) {
        // Just reload with new patch number
        this.loadSysex(sysexData, patchNum);
    }

    getPresetCount() {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot get preset count: WASM not initialized');
            return;
        }

        if (this.wasmModule._regroove_synth_get_preset_count) {
            const count = this.wasmModule._regroove_synth_get_preset_count();
            console.log(`[SynthWorklet] Preset count: ${count}`);
            this.port.postMessage({ type: 'presetCount', count });
        } else {
            console.warn('[SynthWorklet] _regroove_synth_get_preset_count not available');
        }
    }

    getPresetName(index) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot get preset name: WASM not initialized');
            return;
        }

        if (this.wasmModule._regroove_synth_get_preset_name) {
            const namePtr = this.wasmModule._regroove_synth_get_preset_name(index);
            if (namePtr) {
                // Read C string from memory (manually decode - TextDecoder not available in AudioWorklet)
                const heapU8 = new Uint8Array(this.wasmMemory.buffer);
                let length = 0;
                while (heapU8[namePtr + length] !== 0 && length < 256) {
                    length++;
                }
                // Manually convert bytes to string (ASCII/UTF-8)
                let name = '';
                for (let i = 0; i < length; i++) {
                    name += String.fromCharCode(heapU8[namePtr + i]);
                }
                console.log(`[SynthWorklet] Preset ${index}: "${name}"`);
                this.port.postMessage({ type: 'presetName', index, name });
            }
        } else {
            console.warn('[SynthWorklet] _regroove_synth_get_preset_name not available');
        }
    }

    loadPreset(index, voice = 0) {
        if (!this.wasmModule || !this.synthPtr) {
            console.error('[SynthWorklet] Cannot load preset: WASM not initialized');
            return;
        }

        if (this.wasmModule._regroove_synth_load_preset) {
            console.log(`[SynthWorklet] ======================================`);
            console.log(`[SynthWorklet] loadPreset() called in worklet`);
            console.log(`[SynthWorklet]   index = ${index} (type: ${typeof index})`);
            console.log(`[SynthWorklet]   voice = ${voice} (type: ${typeof voice})`);
            console.log(`[SynthWorklet]   0=Voice1, 1=Voice2, 2=Voice3`);
            console.log(`[SynthWorklet] Calling WASM: _regroove_synth_load_preset(${this.synthPtr}, ${index}, ${voice})`);
            console.log(`[SynthWorklet] ======================================`);
            this.wasmModule._regroove_synth_load_preset(this.synthPtr, index, voice);

            // Get updated parameters ONLY for the voice that was loaded
            const parameters = [];
            if (this.wasmModule._regroove_synth_get_parameter) {
                // Voice parameter mapping:
                // Voice 1 (0): params 0-7
                // Voice 2 (1): params 8-15
                // Voice 3 (2): params 16-23
                const startParam = voice * 8;
                const endParam = startParam + 8;

                console.log(`[SynthWorklet] Reading back parameters ${startParam}-${endParam-1} for voice ${voice}`);

                // Read all 42 parameters but only log the voice-specific ones
                for (let i = 0; i < 42; i++) {
                    const value = this.wasmModule._regroove_synth_get_parameter(this.synthPtr, i);
                    parameters.push(value);

                    // Log voice-specific parameters for debugging
                    if (i >= startParam && i < endParam) {
                        console.log(`[SynthWorklet]   Param ${i} = ${value}`);
                    }
                }
            }

            this.port.postMessage({ type: 'presetLoaded', index, parameters, voice });
            console.log(`[SynthWorklet] ✅ Preset ${index} loaded to voice ${voice}`);
        } else {
            console.warn('[SynthWorklet] _regroove_synth_load_preset not available');
        }
    }

    loadRS1Binary(bytes) {
        if (!this.wasmModule || !this.synthPtr) {
            this.port.postMessage({ type: 'rs1LoadError', error: 'WASM not initialized' });
            return;
        }

        try {

            // Allocate buffer in WASM memory
            const bufferPtr = this.wasmModule._malloc(bytes.length);
            const heapU8 = new Uint8Array(this.wasmMemory.buffer, bufferPtr, bytes.length);
            heapU8.set(bytes);

            // Deserialize using WASM function
            let result = -1;
            if (this.wasmModule._regroove_synth_bank_deserialize) {
                result = this.wasmModule._regroove_synth_bank_deserialize(bufferPtr, bytes.length);
            } else {
                this.wasmModule._free(bufferPtr);
                this.port.postMessage({ type: 'rs1LoadError', error: 'Deserialization function not found' });
                return;
            }

            // Free buffer
            this.wasmModule._free(bufferPtr);

            if (result !== 0) {
                this.port.postMessage({ type: 'rs1LoadError', error: `Deserialization failed: ${result}` });
                return;
            }

            // Apply preset to synth instance
            if (this.wasmModule._regroove_synth_bank_apply) {
                this.wasmModule._regroove_synth_bank_apply(this.synthPtr);
                // Read back preset data for UI visualization
                const presetData = this.extractPresetData();
                this.port.postMessage({ type: 'rs1LoadSuccess', presetData: presetData });
            } else {
                this.port.postMessage({ type: 'rs1LoadError', error: 'Apply function not found' });
            }

        } catch (error) {
            console.error('[SynthWorklet] Error loading .rs1:', error);
            this.port.postMessage({ type: 'rs1LoadError', error: error.message });
        }
    }

    /**
     * A drumkit soundcart: the RD-1's whole kit in one file, the .rs1cart that
     * tools/rs1patcher's Drumkit mode exports.
     *
     * Not loadRS1Binary, and deliberately not sharing its names. That one
     * deserialises the RS-1's own private bank format -- sizeof(RS1_Preset)
     * memcpy'd, a different layout from the file's 264 bytes a slot -- and then
     * applies only the first chromatic preset, which is a documented TODO in
     * plugins/RGResonate1_Synth/wasm_bindings.c. A drumkit cart is a different
     * file with different semantics, so it has its own entry point on the engine
     * (regroove_synth_load_cart) and its own message here.
     *
     * Guarded on the export existing, so sending this to a synth that has no
     * cart gets an answer rather than a TypeError in the audio thread.
     *
     * The engine validates the file before it touches a voice and answers with a
     * code for whichever check refused it, so a bad cartridge cannot half-load a
     * kit and cannot silence the machine. The slot names come back with the
     * success so the panel can say what it is playing.
     */
    loadCart(bytes) {
        if (!this.wasmModule || !this.synthPtr) {
            this.port.postMessage({ type: 'cartError', error: 'WASM not initialized' });
            return;
        }

        if (!this.wasmModule._regroove_synth_load_cart) {
            this.port.postMessage({ type: 'cartError', error: 'this engine has no soundcart' });
            return;
        }

        if (!bytes || bytes.length === 0) {
            this.port.postMessage({ type: 'cartError', error: 'the file is empty' });
            return;
        }

        try {
            const bufferPtr = this.wasmModule._malloc(bytes.length);
            const heapU8 = new Uint8Array(this.wasmMemory.buffer, bufferPtr, bytes.length);
            heapU8.set(bytes);

            const result = this.wasmModule._regroove_synth_load_cart(
                this.synthPtr, bufferPtr, bytes.length);

            this.wasmModule._free(bufferPtr);

            if (result !== 0) {
                console.warn(`[SynthWorklet] Soundcart refused (code ${result}); the kit is unchanged`);
                this.port.postMessage({ type: 'cartError', code: result });
                return;
            }

            // Six slots, in pad order. The pointers are the engine's own and are
            // read here before anything else can upload over them.
            const heap = new Uint8Array(this.wasmMemory.buffer);
            const names = [];
            for (let slot = 0; slot < 6; slot++) {
                const ptr = this.wasmModule._regroove_synth_get_cart_preset_name(this.synthPtr, slot);
                let name = '';
                for (let i = ptr; heap[i] !== 0 && name.length < 64; i++) {
                    name += String.fromCharCode(heap[i]);
                }
                names.push(name);
            }

            console.log(`[SynthWorklet] ✅ Soundcart loaded: ${names.join(', ')}`);
            this.port.postMessage({ type: 'cartLoaded', names: names });

        } catch (error) {
            console.error('[SynthWorklet] Error loading soundcart:', error);
            this.port.postMessage({ type: 'cartError', error: error.message });
        }
    }

    extractPresetData() {
        if (!this.wasmModule) return null;

        const opTypeMap = ['RSX_OP_SINE', 'RSX_OP_SAW', 'RSX_OP_SQUARE', 'RSX_OP_TRIANGLE',
                          'RSX_OP_NOISE', 'RSX_OP_FILTER_LP', 'RSX_OP_FILTER_HP', 'RSX_OP_RESONATOR'];
        const mixModeMap = ['RSX_MIX_ADD', 'RSX_MIX_MUL'];

        // Helper to read null-terminated string from WASM memory
        const readString = (ptr) => {
            const heap = new Uint8Array(this.wasmMemory.buffer);
            let str = '';
            let i = ptr;
            while (heap[i] !== 0) {
                str += String.fromCharCode(heap[i]);
                i++;
            }
            return str;
        };

        try {
            if (!this.wasmModule._regroove_synth_get_preset_name) {
                console.error('[SynthWorklet] Preset query functions not available');
                return null;
            }

            const namePtr = this.wasmModule._regroove_synth_get_preset_name();
            const nameStr = readString(namePtr);
            const masterVolume = this.wasmModule._regroove_synth_get_preset_master_volume();
            const numOps = this.wasmModule._regroove_synth_get_preset_num_operators();

            const operators = [];
            for (let i = 0; i < numOps; i++) {
                const opPtr = this.wasmModule._regroove_synth_get_preset_operator(i);
                if (!opPtr) continue;

                // Read RS1_Operator struct from memory
                const heap = new Uint8Array(this.wasmMemory.buffer, opPtr, 200); // Rough size
                const view = new DataView(this.wasmMemory.buffer, opPtr, 200);

                let offset = 0;
                const type = view.getUint32(offset, true); offset += 4;
                const startTime = view.getFloat32(offset, true); offset += 4;
                const duration = view.getFloat32(offset, true); offset += 4;
                const frequency = view.getFloat32(offset, true); offset += 4;
                const fixedPitch = view.getUint8(offset); offset += 1;
                offset += 3; // padding
                const level = view.getFloat32(offset, true); offset += 4;

                // Envelope
                const attack = view.getFloat32(offset, true); offset += 4;
                const decay = view.getFloat32(offset, true); offset += 4;
                const sustain = view.getFloat32(offset, true); offset += 4;
                const release = view.getFloat32(offset, true); offset += 4;

                // Params union (read all)
                const pulseWidth = view.getFloat32(offset, true);
                const filterCutoff = view.getFloat32(offset, true);
                const filterResonance = view.getFloat32(offset + 4, true);
                const resonatorResonance = view.getFloat32(offset, true);
                const resonatorBandwidth = view.getFloat32(offset + 4, true);
                offset += 8;

                const inputOp = view.getInt8(offset); offset += 1;  // int8_t, not int32!
                offset += 3;  // padding to align mix_mode
                const mixMode = view.getUint32(offset, true); offset += 4;

                operators.push({
                    type: opTypeMap[type] || 'RSX_OP_SINE',
                    startTime, duration, frequency, fixedPitch: !!fixedPitch, level,
                    envelope: { attack, decay, sustain, release },
                    params: { pulseWidth, filterCutoff, filterResonance, resonatorResonance, resonatorBandwidth },
                    inputOp, mixMode: mixModeMap[mixMode] || 'RSX_MIX_ADD'
                });
            }

            return { name: nameStr, masterVolume, operators };
        } catch (error) {
            return null;
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.wasmModule || !this.synthPtr || !this.audioBufferPtr || !this.wasmFuncs.process) {
            return true;
        }

        const output = outputs[0];
        if (!output || output.length === 0) {
            return true;
        }

        const frames = output[0].length;

        // Reuse heap view if buffer hasn't been resized
        if (!this.heapF32 || this.heapF32.length !== frames * 2) {
            this.heapF32 = new Float32Array(
                this.wasmMemory.buffer,
                this.audioBufferPtr,
                frames * 2
            );
        }

        // Zero the buffer
        this.heapF32.fill(0);

        // Process audio through synth
        this.wasmFuncs.process(this.synthPtr, this.audioBufferPtr, frames, this.sampleRate);

        // De-interleave output
        const outputL = output[0];
        const outputR = output[1] || output[0];
        const heapF32 = this.heapF32;

        for (let i = 0; i < frames; i++) {
            outputL[i] = heapF32[i * 2];
            outputR[i] = heapF32[i * 2 + 1];
        }

        return true;
    }
}

registerProcessor('synth-worklet-processor', SynthWorkletProcessor);
