/* RegrooveFX Slicer: cue points, pads and WAV+CUE export on the RGSlicer WASM. */

(() => {
    'use strict';

    const WHITE = [0, 2, 4, 5, 7, 9, 11];
    const PAD_COUNT = 16;
    const RULER = 30;
    const PEAK_BINS = 2048;

    /* Slice count is normalized: value * 63 + 1 = 1..64. */
    const PARAM_SLICE_MODE = 3;
    const PARAM_SLICE_COUNT = 4;
    const PARAM_SENSITIVITY = 5;
    const AUTO_SLICE_COUNT = 1.0;

    const SLICE_PALETTE = [
        { hex: '#cf1a37', rgb: '207, 26, 55' },
        { hex: '#00e5ff', rgb: '0, 229, 255' },
        { hex: '#00e676', rgb: '0, 230, 118' },
        { hex: '#ffab00', rgb: '255, 171, 0' },
        { hex: '#b388ff', rgb: '179, 136, 255' },
        { hex: '#ff6e40', rgb: '255, 110, 64' },
        { hex: '#ff4081', rgb: '255, 64, 129' },
        { hex: '#c6ff00', rgb: '198, 255, 0' },
        { hex: '#448aff', rgb: '68, 138, 255' },
        { hex: '#1de9b6', rgb: '29, 233, 182' },
        { hex: '#ff5252', rgb: '255, 82, 82' },
        { hex: '#ffd740', rgb: '255, 215, 64' },
        { hex: '#69f0ae', rgb: '105, 240, 174' },
        { hex: '#e040fb', rgb: '224, 64, 251' },
        { hex: '#40c4ff', rgb: '64, 196, 255' },
        { hex: '#ff9e80', rgb: '255, 158, 128' }
    ];

    const palette = (i) => SLICE_PALETTE[i % SLICE_PALETTE.length];

    const sliceNote = (i) => 36 + Math.floor(i / 7) * 12 + WHITE[i % 7];

    const noteName = (n) => {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[n % 12] + Math.floor(n / 12 - 1);
    };

    const ascii = (view, offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    const concat = (parts) => {
        const length = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(length);
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        return out;
    };

    class SlicerPage {
        constructor() {
            this.ctx = null;
            this.synth = null;
            this.pcm = null;
            this.sampleRate = 48000;
            this.fileName = '';
            this.fileInfo = null;
            this.cues = [];
            this.slices = [];
            this.peaks = [];
            this.flags = [];
            this.dragging = null;
            this.hovered = -1;
            this.selected = 0;
            this.autoPending = false;
            this.audioReady = false;
            this.resliceTimer = 0;
            this.playTimer = 0;
            this.playNote = -1;
            this.worklet = false;
            this.sens = 0.5;
            this.padPage = 0;
        }

        maxPage() {
            return Math.max(0, Math.ceil(this.cues.length / PAD_COUNT) - 1);
        }

        changePage(delta) {
            const next = Math.min(this.maxPage(), Math.max(0, this.padPage + delta));
            if (next === this.padPage) return;
            this.padPage = next;
            this.updatePads();
        }

        async init() {
            this.canvas = document.getElementById('waveform');
            this.g = this.canvas.getContext('2d');
            this.statusEl = document.getElementById('status');
            this.countEl = document.getElementById('sliceCount');
            this.fileLabel = document.getElementById('fileLabel');
            this.padsEl = document.getElementById('pads');

            this.buildPads();
            this.wireToolbar();
            this.wireWaveform();
            this.wireFullscreen();
            this.wirePaging();
            this.updatePads();
            window.addEventListener('resize', () => this.draw());

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            try {
                this.ctx = new AudioCtx({ sampleRate: 48000 });
            } catch (error) {
                this.ctx = new AudioCtx();
            }

            /* The published web folder carries rgslicer.js/.wasm in rfxsynths. */
            const options = { wasmBase: '../rfxsynths/', wasmVersion: '20251116a' };
            if (this.ctx.audioWorklet) {
                this.synth = new RGSlicerSynth(this.ctx, options);
                this.worklet = true;
            } else {
                this.synth = new SlicerFallback(this.ctx, options);
                this.worklet = false;
            }
            this.synth.on('sliceInfo', (data) => this.onSliceInfo(data));
            this.synth.on('ready', () => this.onEngineReady());
            await this.synth.initialize();
            this.setStatus(this.worklet ? 'Loading slicer…'
                : 'HTTP audio path (no AudioWorklet). Import a WAV.');
        }

        setStatus(text) {
            this.statusEl.textContent = text;
        }

        async ensureAudio() {
            if (!this.audioReady) {
                this.audioReady = true;
                await this.ctx.resume();
                await this.synth.setAudible(true);
            }
        }

        onEngineReady() {
            this.applySliceParameters();
            this.setStatus('Slicer ready. Import a WAV.');
            if (this.pcm) this.resliceNow();
        }

        parseWav(buffer) {
            const view = new DataView(buffer);
            if (view.getUint32(0, false) !== 0x52494646) return null;
            if (view.getUint32(8, false) !== 0x57415645) return null;
            const info = { sampleRate: 48000, cues: [] };
            let offset = 12;
            while (offset + 8 <= view.byteLength) {
                const id = String.fromCharCode(
                    view.getUint8(offset), view.getUint8(offset + 1),
                    view.getUint8(offset + 2), view.getUint8(offset + 3));
                const size = view.getUint32(offset + 4, true);
                if (id === 'fmt ') {
                    info.sampleRate = view.getUint32(offset + 12, true);
                } else if (id === 'cue ') {
                    const count = view.getUint32(offset + 8, true);
                    for (let i = 0; i < count; i++) {
                        info.cues.push(view.getUint32(offset + 12 + i * 24 + 20, true));
                    }
                }
                offset += 8 + size + (size & 1);
            }
            return info;
        }

        async importFile(file) {
            try {
                await this.ensureAudio();
                this.setStatus(`Decoding ${file.name}…`);
                const buffer = await file.arrayBuffer();
                this.fileInfo = this.parseWav(buffer);
                const audio = await this.ctx.decodeAudioData(buffer.slice(0));

                const frames = audio.length;
                const mono = new Float32Array(frames);
                for (let c = 0; c < audio.numberOfChannels; c++) {
                    const data = audio.getChannelData(c);
                    for (let i = 0; i < frames; i++) mono[i] += data[i];
                }
                const scale = 1 / Math.max(1, audio.numberOfChannels);
                const pcm = new Int16Array(frames);
                for (let i = 0; i < frames; i++) {
                    const v = mono[i] * scale;
                    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
                }

                this.pcm = pcm;
                this.sampleRate = audio.sampleRate;
                this.fileName = file.name.replace(/\.[^.]+$/, '');
                this.fileLabel.textContent = file.name;
                this.computePeaks();

                const sourceRate = this.fileInfo?.sampleRate || audio.sampleRate;
                const factor = audio.sampleRate / sourceRate;
                const cues = (this.fileInfo?.cues || [])
                    .map((p) => Math.round(p * factor))
                    .filter((p) => p >= 0 && p < frames);
                this.cues = [...new Set(cues)].sort((a, b) => a - b);
                this.slices = [];
                this.selected = 0;
                this.enableControls(true);
                this.updatePads();
                this.draw();

                this.setStatus('');
                if (this.cues.length > 0) {
                    this.autoPending = false;
                    this.resliceNow();
                } else {
                    this.autoSlice();
                }
            } catch (error) {
                console.error('[Slicer] Import failed:', error);
                this.setStatus(`Import failed: ${error.message}`);
            }
        }

        computePeaks() {
            const bins = PEAK_BINS;
            this.peaks = new Array(bins);
            if (!this.pcm || this.pcm.length === 0) return;
            const step = this.pcm.length / bins;
            for (let b = 0; b < bins; b++) {
                const from = Math.floor(b * step);
                const to = Math.min(this.pcm.length, Math.floor((b + 1) * step) + 1);
                let min = 0, max = 0;
                for (let i = from; i < to; i++) {
                    const v = this.pcm[i];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
                this.peaks[b] = { min: min / 32768, max: max / 32768 };
            }
        }

        applySliceParameters() {
            this.synth.setParameter(PARAM_SLICE_MODE, 0);
            this.synth.setParameter(PARAM_SLICE_COUNT, AUTO_SLICE_COUNT);
            this.synth.setParameter(PARAM_SENSITIVITY, this.sens);
        }

        autoSlice() {
            if (!this.pcm) return;
            this.applySliceParameters();
            this.cues = [];
            this.autoPending = true;
            this.draw();
            this.sendSlices([]);
        }

        resliceNow() {
            if (!this.pcm) return;
            if (this.cues.length === 0) { this.autoSlice(); return; }
            this.sendSlices(this.cues);
        }

        scheduleReslice() {
            clearTimeout(this.resliceTimer);
            this.resliceTimer = setTimeout(() => this.resliceNow(), 180);
        }

        sendSlices(positions) {
            if (!this.synth || !this.synth.wasmReady || !this.pcm) return;
            const cuePoints = positions.map((position, i) => ({
                id: i + 1,
                position: Math.round(position),
                label: ''
            }));
            this.synth.loadWavFile(this.pcm, this.sampleRate, cuePoints);
        }

        onSliceInfo(data) {
            this.slices = Array.isArray(data?.slices) ? data.slices : [];
            if (this.autoPending) {
                this.cues = this.slices.map((s) => s.offset).sort((a, b) => a - b);
                this.autoPending = false;
            }
            if (this.selected >= this.cues.length) {
                this.selected = Math.max(0, this.cues.length - 1);
            }
            this.updatePads();
            this.draw();
            this.setStatus('');
        }

        starts() {
            return this.cues;
        }

        updatePads() {
            const count = this.cues.length;
            this.padPage = Math.min(this.padPage, this.maxPage());
            const offset = this.padPage * PAD_COUNT;
            for (let j = 0; j < PAD_COUNT; j++) {
                const pad = this.pads[j];
                if (!pad) continue;
                const i = offset + j;
                const note = sliceNote(i);
                const active = i < count;
                const color = palette(i);
                pad.classList.toggle('off', !active);
                pad.style.borderColor = active ? color.hex : '#2b2b2b';
                pad.style.backgroundColor = active
                    ? `rgba(${color.rgb}, ${i === this.selected ? 0.26 : 0.10})`
                    : '#141414';
                pad.querySelector('.drum-pad-name').textContent = noteName(note);
                pad.querySelector('.drum-pad-name').style.color = active ? color.hex : '#555';
                pad.querySelector('.drum-pad-note').textContent =
                    active ? `S${String(i + 1).padStart(2, '0')} · ${note}` : 'EMPTY';
                pad.querySelector('.drum-pad-bar > div').style.width = active ? '100%' : '0%';
                pad.querySelector('.drum-pad-bar > div').style.background = active ? color.hex : '#000';
            }
            this.countEl.textContent = `SLICES ${count}`;
            const pageEl = document.getElementById('padPage');
            if (pageEl) {
                const from = count === 0 ? 0 : Math.min(count, offset + 1);
                const to = Math.min(count, offset + PAD_COUNT);
                pageEl.textContent = count === 0 ? 'PAGE 0/0'
                    : `PAD ${from}-${to} / ${count}`;
            }
            const down = document.getElementById('octDown');
            const up = document.getElementById('octUp');
            if (down) down.disabled = this.padPage <= 0;
            if (up) up.disabled = this.padPage >= this.maxPage();
        }

        draw() {
            const dpr = window.devicePixelRatio || 1;
            const rect = this.canvas.getBoundingClientRect();
            const cw = Math.max(1, rect.width);
            const ch = Math.max(1, rect.height);
            const w = Math.floor(cw * dpr);
            const h = Math.floor(ch * dpr);
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
            }
            const g = this.g;
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.fillStyle = '#000';
            g.fillRect(0, 0, cw, ch);

            g.fillStyle = '#191919';
            g.fillRect(0, 0, cw, RULER);
            g.strokeStyle = '#262626';
            g.beginPath();
            g.moveTo(0, RULER);
            g.lineTo(cw, RULER);
            g.stroke();

            this.flags = [];
            if (!this.pcm || this.pcm.length === 0 || this.peaks.length === 0) {
                g.fillStyle = '#666';
                g.font = '12px monospace';
                g.fillText('No sample', 12, RULER + 18);
                return;
            }

            const len = this.pcm.length;
            const starts = this.starts();
            const waveTop = RULER;
            const waveH = ch - RULER;
            const mid = waveTop + waveH / 2;
            const amp = waveH * 0.44;

            const idxAt = (pos) => {
                let idx = -1;
                for (let i = 0; i < starts.length; i++) {
                    if (starts[i] <= pos) idx = i; else break;
                }
                return idx;
            };

            for (let i = 0; i < starts.length; i++) {
                const x1 = (starts[i] / len) * cw;
                const x2 = ((i + 1 < starts.length ? starts[i + 1] : len) / len) * cw;
                const color = palette(i);
                const alpha = i === this.selected ? 0.18 : 0.07;
                g.fillStyle = `rgba(${color.rgb}, ${alpha})`;
                g.fillRect(x1, waveTop, Math.max(0, x2 - x1), waveH);
                if (i === this.selected) {
                    g.fillStyle = color.hex;
                    g.fillRect(x1, waveTop, Math.max(1, x2 - x1), 2);
                }
            }

            const bins = this.peaks.length;
            for (let x = 0; x < cw; x++) {
                const pos = (x / cw) * len;
                const idx = idxAt(pos);
                const peak = this.peaks[Math.min(bins - 1, Math.floor((x / cw) * bins))];
                const y0 = mid - peak.max * amp;
                const y1 = mid - peak.min * amp;
                const color = idx >= 0 ? palette(idx) : SLICE_PALETTE[0];
                g.fillStyle = (idx === this.selected)
                    ? color.hex
                    : `rgba(${color.rgb}, 0.82)`;
                g.fillRect(x, Math.min(y0, y1), 1.4, Math.max(1, Math.abs(y1 - y0)));
            }

            for (let i = 0; i < this.cues.length; i++) {
                const x = (this.cues[i] / len) * cw;
                const color = palette(i);
                const active = i === this.selected || i === this.hovered || i === this.dragging;

                g.strokeStyle = active ? '#fff' : color.hex;
                g.lineWidth = active ? 2 : 1.5;
                g.beginPath();
                g.moveTo(x, RULER);
                g.lineTo(x, ch);
                g.stroke();

                const text = `${noteName(sliceNote(i))}  S${i + 1}`;
                g.font = '700 11px monospace';
                const textW = g.measureText(text).width;
                const flagW = textW + 12;
                const flagH = 20;
                const flagX = Math.min(cw - flagW - 2, Math.max(1, x));
                const flagY = 5;

                g.fillStyle = active ? color.hex : '#000';
                g.fillRect(flagX, flagY, flagW, flagH);
                g.strokeStyle = active ? '#fff' : color.hex;
                g.lineWidth = 1.5;
                g.strokeRect(flagX, flagY, flagW, flagH);
                g.fillStyle = active ? '#000' : color.hex;
                g.fillText(text, flagX + 6, flagY + 14);

                this.flags.push({ x: flagX, y: flagY, w: flagW, h: flagH });
            }
        }

        sampleAt(clientX) {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
            return Math.round((x / rect.width) * this.pcm.length);
        }

        hitCue(clientX, clientY) {
            if (!this.pcm) return -1;
            const rect = this.canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            for (let i = 0; i < this.flags.length; i++) {
                const f = this.flags[i];
                if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return i;
            }
            let best = -1;
            let bestDistance = 7;
            this.cues.forEach((pos, i) => {
                const cx = (pos / this.pcm.length) * rect.width;
                const d = Math.abs(cx - x);
                if (d < bestDistance) { best = i; bestDistance = d; }
            });
            return best;
        }

        wireWaveform() {
            const canvas = this.canvas;
            canvas.addEventListener('pointerdown', (e) => {
                if (!this.pcm || e.button !== 0) return;
                e.preventDefault();
                this.ensureAudio();
                const hit = this.hitCue(e.clientX, e.clientY);
                if (hit >= 0) {
                    this.dragging = hit;
                    this.selected = hit;
                } else {
                    const pos = Math.max(0, Math.min(this.pcm.length - 1, this.sampleAt(e.clientX)));
                    if (this.cues.some((c) => Math.abs(c - pos) < 4)) return;
                    this.cues.push(pos);
                    this.cues.sort((a, b) => a - b);
                    this.dragging = this.cues.indexOf(pos);
                    this.selected = this.dragging;
                    this.scheduleReslice();
                }
                canvas.setPointerCapture(e.pointerId);
                this.updatePads();
                this.draw();
            });

            canvas.addEventListener('pointermove', (e) => {
                if (!this.pcm) return;
                if (this.dragging !== null) {
                    e.preventDefault();
                    this.cues[this.dragging] = Math.max(0,
                        Math.min(this.pcm.length - 1, this.sampleAt(e.clientX)));
                    this.draw();
                    this.scheduleReslice();
                } else {
                    const hit = this.hitCue(e.clientX, e.clientY);
                    if (hit !== this.hovered) {
                        this.hovered = hit;
                        this.draw();
                    }
                }
            });

            const endDrag = (e) => {
                if (this.dragging === null) return;
                this.dragging = null;
                this.cues.sort((a, b) => a - b);
                this.draw();
                this.resliceNow();
                if (e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
                    canvas.releasePointerCapture(e.pointerId);
                }
            };
            canvas.addEventListener('pointerup', endDrag);
            canvas.addEventListener('pointercancel', endDrag);
            canvas.addEventListener('pointerleave', () => {
                if (this.hovered !== -1) { this.hovered = -1; this.draw(); }
            });

            canvas.addEventListener('contextmenu', (e) => {
                if (!this.pcm) return;
                const hit = this.hitCue(e.clientX, e.clientY);
                if (hit < 0) return;
                e.preventDefault();
                this.cues.splice(hit, 1);
                if (this.cues.length === 0) this.cues.push(0);
                if (this.selected >= this.cues.length) this.selected = this.cues.length - 1;
                this.updatePads();
                this.draw();
                this.resliceNow();
            });
        }

        buildPads() {
            this.padsEl.innerHTML = '';
            this.pads = [];
            for (let i = 0; i < PAD_COUNT; i++) {
                const note = sliceNote(i);
                const pad = document.createElement('div');
                pad.className = 'drum-pad off';
                pad.innerHTML =
                    `<div class="drum-pad-name">${noteName(note)}</div>` +
                    `<div class="drum-pad-note">EMPTY</div>` +
                    `<div class="drum-pad-bar"><div></div></div>`;

                const press = (e) => {
                    const slice = this.padPage * PAD_COUNT + i;
                    if (slice >= this.cues.length) return;
                    e.preventDefault();
                    this.ensureAudio();
                    pad.classList.add('active');
                    this.selected = slice;
                    this.updatePads();
                    this.draw();
                    this.synth.noteOn(sliceNote(slice), 127);
                };
                const release = (e) => {
                    const slice = this.padPage * PAD_COUNT + i;
                    if (slice >= this.cues.length) return;
                    e.preventDefault();
                    pad.classList.remove('active');
                    this.synth.noteOff(sliceNote(slice));
                };
                pad.addEventListener('pointerdown', press);
                pad.addEventListener('pointerup', release);
                pad.addEventListener('pointerleave', release);
                pad.addEventListener('pointercancel', release);
                this.padsEl.appendChild(pad);
                this.pads.push(pad);
            }
        }

        wirePaging() {
            document.getElementById('octDown').addEventListener('click', () => this.changePage(-1));
            document.getElementById('octUp').addEventListener('click', () => this.changePage(1));
            document.addEventListener('keydown', (e) => {
                const tag = e.target?.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
                if (e.key === 'ArrowLeft') this.changePage(-1);
                else if (e.key === 'ArrowRight') this.changePage(1);
                else return;
                if (this.maxPage() > 0) e.preventDefault();
            });
        }

        wireFullscreen() {
            const button = document.getElementById('fsPads');
            button.addEventListener('click', async () => {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    await this.padsEl.requestFullscreen();
                }
            });
            this.padsEl.addEventListener('click', (e) => {
                if (!document.fullscreenElement) return;
                if (e.clientX > window.innerWidth - 60 && e.clientY < 60) {
                    document.exitFullscreen();
                }
            });
        }

        wireToolbar() {
            const fileInput = document.getElementById('fileInput');
            document.getElementById('importBtn').addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files?.[0];
                fileInput.value = '';
                if (file) await this.importFile(file);
            });

            document.getElementById('autoSliceBtn').addEventListener('click', () => {
                this.ensureAudio();
                this.autoSlice();
            });
            document.getElementById('exportBtn').addEventListener('click', () => this.exportWav());
            document.getElementById('stopBtn').addEventListener('click', () => this.stopAll());

            const sens = document.getElementById('sens');
            const sensVal = document.getElementById('sensVal');
            /* Engine threshold is 0.1 + sens * 0.4: 0 is most sensitive. */
            const engineSens = () => Number(sens.value) / 100;
            this.sens = engineSens();
            const applySens = () => {
                this.sens = engineSens();
                sensVal.textContent = sens.value;
                this.synth.setParameter(PARAM_SENSITIVITY, this.sens);
            };
            sens.addEventListener('input', applySens);
            sens.addEventListener('change', () => {
                applySens();
                if (this.pcm) this.autoSlice();
            });

            this.bindHold(document.getElementById('playWholeBtn'), 37);
            this.bindHold(document.getElementById('playRandomBtn'), 39);
        }

        bindHold(button, note) {
            const press = (e) => {
                e.preventDefault();
                this.ensureAudio();
                button.classList.add('active');
                this.synth.noteOn(note, 127);
            };
            const release = (e) => {
                e.preventDefault();
                button.classList.remove('active');
                this.synth.noteOff(note);
            };
            button.addEventListener('pointerdown', press);
            button.addEventListener('pointerup', release);
            button.addEventListener('pointerleave', release);
            button.addEventListener('pointercancel', release);
        }

        enableControls(on) {
            ['exportBtn', 'autoSliceBtn', 'playWholeBtn', 'playRandomBtn', 'stopBtn']
                .forEach((id) => { document.getElementById(id).disabled = !on; });
        }

        stopAll() {
            this.synth.stopAll();
            this.pads.forEach((p) => p.classList.remove('active'));
            document.getElementById('playWholeBtn').classList.remove('active');
            document.getElementById('playRandomBtn').classList.remove('active');
        }

        buildWav() {
            const pcm = this.pcm;
            const rate = this.sampleRate;
            const cues = [...this.cues].sort((a, b) => a - b);

            const fmt = new Uint8Array(16);
            const fmtView = new DataView(fmt.buffer);
            fmtView.setUint16(0, 1, true);
            fmtView.setUint16(2, 1, true);
            fmtView.setUint32(4, rate, true);
            fmtView.setUint32(8, rate * 2, true);
            fmtView.setUint16(12, 2, true);
            fmtView.setUint16(14, 16, true);

            const data = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);

            const cue = new Uint8Array(4 + cues.length * 24);
            const cueView = new DataView(cue.buffer);
            cueView.setUint32(0, cues.length, true);
            cues.forEach((pos, i) => {
                const at = 4 + i * 24;
                cueView.setUint32(at + 0, i + 1, true);
                cueView.setUint32(at + 4, 0, true);
                ascii(cueView, at + 8, 'data');
                cueView.setUint32(at + 12, 0, true);
                cueView.setUint32(at + 16, 0, true);
                cueView.setUint32(at + 20, pos, true);
            });

            const labels = cues.map((_, i) => String(Math.min(127, sliceNote(i))));
            const labl = labels.map((text, i) => {
                const payload = new Uint8Array(4 + text.length + 1);
                new DataView(payload.buffer).setUint32(0, i + 1, true);
                for (let j = 0; j < text.length; j++) payload[4 + j] = text.charCodeAt(j);
                return this.chunk('labl', payload);
            });
            const listPayload = concat([new Uint8Array([0x61, 0x64, 0x74, 0x6c]), ...labl]);

            const chunks = [
                this.chunk('fmt ', fmt),
                this.chunk('data', data),
                this.chunk('cue ', cue),
                this.chunk('LIST', listPayload)
            ];
            const body = concat(chunks);
            const riff = new Uint8Array(12 + body.length);
            const riffView = new DataView(riff.buffer);
            ascii(riffView, 0, 'RIFF');
            riffView.setUint32(4, 4 + body.length, true);
            ascii(riffView, 8, 'WAVE');
            riff.set(body, 12);
            return riff;
        }

        chunk(id, payload) {
            const size = payload.length;
            const out = new Uint8Array(8 + size + (size & 1));
            const view = new DataView(out.buffer);
            ascii(view, 0, id);
            view.setUint32(4, size, true);
            out.set(payload, 8);
            return out;
        }

        exportWav() {
            if (!this.pcm) return;
            const wav = this.buildWav();
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.fileName || 'sample'}-sliced.wav`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.setStatus(`Exported ${a.download}.`);
        }
    }

    const page = new SlicerPage();
    page.init().catch((error) => {
        console.error('Slicer init failed:', error);
        const status = document.getElementById('status');
        if (status) status.textContent = `Init failed: ${error.message}`;
    });
})();
