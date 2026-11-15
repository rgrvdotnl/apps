/* RGSlicer on the main thread for pages without AudioWorklet (plain http). */

class SlicerFallback {
    constructor(audioContext, options = {}) {
        this.ctx = audioContext;
        this.wasmBase = options.wasmBase || '../synths/';
        this.wasmVersion = options.wasmVersion || '';
        this.listeners = new Map();
        this.module = null;
        this.memory = null;
        this.synth = 0;
        this.audioBufferPtr = 0;
        this.bufferSize = 1024;
        this.wasmReady = false;
        this.gain = null;
        this.node = null;
        this.sampleRate = audioContext.sampleRate;
    }

    on(type, cb) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(cb);
    }

    emit(type, data) {
        (this.listeners.get(type) || []).forEach((cb) => cb(data));
        (this.listeners.get('*') || []).forEach((cb) => cb({ type, data }));
    }

    async initialize() {
        const stamp = this.wasmVersion ? `?v=${this.wasmVersion}` : '';
        const [jsResponse, wasmResponse] = await Promise.all([
            fetch(`${this.wasmBase}rgslicer.js${stamp}`),
            fetch(`${this.wasmBase}rgslicer.wasm${stamp}`)
        ]);
        const code = await jsResponse.text();
        const wasmBytes = await wasmResponse.arrayBuffer();

        // The glue does not export its WebAssembly.Memory.
        const patched = code
            .replace(';return moduleRtn',
                     ';globalThis.__wasmMemory=wasmMemory;return moduleRtn')
            .replace(';return Module',
                     ';globalThis.__wasmMemory=wasmMemory;return Module');

        const exportsObject = {};
        const fakeModule = { exports: exportsObject };
        (function (module, exports) {
            eval(patched);
        })(fakeModule, exportsObject);

        const factory = fakeModule.exports;
        if (typeof factory !== 'function') {
            throw new Error('rgslicer.js did not export a module factory');
        }

        this.module = await factory({ wasmBinary: new Uint8Array(wasmBytes) });
        this.memory = globalThis.__wasmMemory;
        delete globalThis.__wasmMemory;
        if (!this.memory) {
            throw new Error('rgslicer.wasm memory was not captured');
        }

        this.bufferSize = 1024;
        this.audioBufferPtr = this.module._malloc(this.bufferSize * 2 * 4);
        this.synth = this.module._regroove_synth_create(4, this.sampleRate);
        if (!this.audioBufferPtr || !this.synth) {
            throw new Error('Could not create the RGSlicer engine');
        }

        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.ctx.destination);
        this.node = this.ctx.createScriptProcessor(this.bufferSize, 0, 2);
        this.node.onaudioprocess = (event) => this.process(event);
        this.node.connect(this.gain);

        this.wasmReady = true;
        this.emit('ready');
        return true;
    }

    process(event) {
        if (!this.wasmReady) return;
        const frames = event.outputBuffer.length;
        const heap = new Float32Array(this.memory.buffer, this.audioBufferPtr, frames * 2);
        heap.fill(0);
        this.module._regroove_synth_process_f32(this.synth, this.audioBufferPtr, frames);
        const left = event.outputBuffer.getChannelData(0);
        const right = event.outputBuffer.getChannelData(1);
        for (let i = 0; i < frames; i++) {
            left[i] = heap[i * 2];
            right[i] = heap[i * 2 + 1];
        }
    }

    loadWavFile(pcm, sampleRate, cuePoints = []) {
        if (!this.wasmReady) return false;

        const pcmPtr = this.module._malloc(pcm.length * 2);
        new Int16Array(this.memory.buffer, pcmPtr, pcm.length).set(pcm);

        const ok = this.module._rgslicer_load_wav_from_memory(
            this.synth, pcmPtr, pcm.length, sampleRate);
        this.module._free(pcmPtr);
        if (!ok) return false;

        let cuePtr = 0;
        if (cuePoints.length > 0) {
            cuePtr = this.module._malloc(cuePoints.length * 4);
            const heap = new Uint32Array(this.memory.buffer, cuePtr, cuePoints.length);
            cuePoints.forEach((cue, i) => { heap[i] = cue.position; });
        }
        this.module._rgslicer_set_slices_from_cues(this.synth, cuePtr, cuePoints.length);
        if (cuePtr) this.module._free(cuePtr);

        const numSlices = this.module._rgslicer_get_slice_count(this.synth);
        const slices = [];
        for (let i = 0; i < numSlices; i++) {
            slices.push({
                offset: this.module._rgslicer_get_slice_offset_at(this.synth, i),
                length: this.module._rgslicer_get_slice_length_at(this.synth, i),
                midiNote: 36 + i
            });
        }
        this.emit('sliceInfo', { numSlices, slices: slices.length ? slices : null });
        return true;
    }

    setParameter(index, value) {
        if (this.wasmReady) {
            this.module._regroove_synth_set_parameter(this.synth, index, value);
        }
    }

    noteOn(note, velocity) {
        if (this.wasmReady) this.module._regroove_synth_note_on(this.synth, note, velocity);
    }

    noteOff(note) {
        if (this.wasmReady) this.module._regroove_synth_note_off(this.synth, note);
    }

    stopAll() {
        if (this.wasmReady) this.module._regroove_synth_all_notes_off(this.synth);
    }

    async setAudible(audible) {
        if (audible && this.ctx.state === 'suspended') await this.ctx.resume();
        if (this.gain) {
            this.gain.gain.setValueAtTime(audible ? 1.0 : 0.0, this.ctx.currentTime);
        }
    }

    destroy() {
        if (this.node) { this.node.disconnect(); this.node = null; }
        if (this.gain) { this.gain.disconnect(); this.gain = null; }
        this.wasmReady = false;
    }
}
