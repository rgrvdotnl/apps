/* ============================================================
   SNOWSKY TINY A CONTROLLER
   WebHID controller with live (instant) 10-band PEQ editing.
   ============================================================ */

(function () {
    'use strict';

    const P = window.FiiO;
    const { REPORT_ID, VENDOR_ID, ADDR, CMD, MOD, LIMITS, FILTERS, PRESETS } = P;

    const REQUEST_TIMEOUT = 1500;
    const OPTIONAL_GRACE  = 250;  // ms to wait on addresses that never reply
    const NAME_LENGTH     = 8;    // the device stores 8 characters, upper-cased

    /* The device stores gain on a 0.2 dB grid. Targets are rounded onto that
       same grid before being sent, so a slider never claims a tenth of a dB the
       device cannot hold — and so the reconciler compares two grid-aligned
       numbers, which makes "is this band already there?" exact. Comparing
       off-grid values made it a coin toss: 0.5 - 0.4 is 0.09999999999999998,
       which slipped under this threshold exactly, leaving the 500 Hz band
       reading 0.5 dB while the device held 0.4. */
    const GRID = 0.2;
    const WRITE_THRESHOLD = GRID / 2;

    /* How long a reconcile pass stays open after its writes land, so a knob
       drag's events coalesce into the next pass rather than each starting one.
       See the reconciler. */
    const RECONCILE_BEAT = 40;

    /* ---- Tone knobs ----
       LOW / MID / HIGH are not three extra filters: they are three overlapping
       windows over the ten real bands. Each band takes a share of each knob,
       and the knob's value times that share is the dB added to the band.

       A knob holds its owned bands at FULL and tapers only where it reaches
       into its neighbour's. Not a bell: a bell peaks at one band and decays on
       both sides, which means the outermost band — 32 Hz, or 16 kHz — only ever
       got ~70% of its own knob. It has no neighbour beyond it to blend with, so
       decaying there is not a crossfade, it is just the knob failing to reach
       its own edge. The plateau is also what the regions actually are: LOW owns
       the lowest three, and "owns" means all three move together by the knob's
       full value.

       The share is keyed off the band's *position* — its slot in the ten — and
       never off the frequency the device reports for it. Slot 8 is the 8 kHz
       band whatever the hardware happens to say it is at. Keying off the
       reported frequency looked more principled and was a trap: a profile that
       wrote 1 kHz into every band made all ten slots evaluate the same three
       bells, so one knob moved all ten sliders in lockstep. The ten bands are
       fixed slots; the knobs should not be able to lose track of that. */
    const TONE_KEYS  = ['low', 'mid', 'high'];
    /* The slots each knob owns outright. LOW takes 32/64/125, MID the middle
       four, HIGH 4k/8k/16k. */
    const TONE_OWNED = { low: [0, 2], mid: [3, 6], high: [7, 9] };
    /* How much of the knob a slot takes one step outside its owner's span, and
       the next step after that (0.4, 0.16, ...). Two bands of real overlap
       either side, fading to nothing by the third — enough to keep the regions
       joined rather than stepping at a boundary. */
    const TONE_TAPER = 0.4;

    /* The ten slots, in order. Used for the tone shares (by position) and to
       put a collapsed layout back. */
    const STOCK_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    /* The gain floor doubles as the kill depth: killing a region drives its
       bands to the hardware minimum rather than to silence. */
    const KILL_DB = LIMITS.gain.min;

    /* The device does not store the values we send verbatim: gain lands on a
       0.2 dB grid (5.5 read back as 5.6, 0.1 as 0.0) and Q is rounded too.
       Verification compares against what the hardware can represent, and the
       read-back values are adopted so the UI never claims more precision than
       the device actually holds. */
    const TOLERANCE = { gain: 0.11, q: 0.06 };

    function closeEnough(got, want) {
        return Math.abs(got.gain - want.gain) <= TOLERANCE.gain
            && got.freq === want.freq
            && Math.abs(got.q - want.q) <= TOLERANCE.q
            && got.type === want.type;
    }

    /* ----------------------------------------------------------
       Device transport
       ---------------------------------------------------------- */

    class TinyA {
        constructor() {
            this.device = null;
            this.seq = 0;
            this.pending = null;
            this.chain = Promise.resolve();
            this.recent = [];          // burst writes awaiting acknowledgement
            this.burstWaiters = [];    // drain() callers
            this.burstLost = [];       // burst frames the device never answered
            this.onDisconnect = null;

            // Registered once — a new listener per connect() would stack up.
            if (navigator.hid) {
                navigator.hid.addEventListener('disconnect', (e) => {
                    if (e.device === this.device) {
                        this.device = null;
                        if (this.onDisconnect) this.onDisconnect();
                    }
                });
            }
        }

        get connected() { return !!this.device; }

        get productName() {
            return this.device ? this.device.productName : '';
        }

        _nextSeq() {
            const s = this.seq;
            this.seq = (this.seq + 1) & 0xffff;
            return s;
        }

        async connect() {
            if (!navigator.hid) throw new Error('WebHID is not available in this browser.');

            const chosen = await navigator.hid.requestDevice({
                filters: [{ vendorId: VENDOR_ID }],
            });
            if (!chosen.length) return null;

            // Prefer the TINY A if several FiiO devices are connected.
            const device = chosen.find((d) => /TINY\s*A/i.test(d.productName)) || chosen[0];
            if (!device.opened) await device.open();

            this.device = device;
            this.seq = 0;
            this.chain = Promise.resolve();
            this.recent = [];
            this.burstWaiters = [];
            this.burstLost = [];
            device.addEventListener('inputreport', (e) => this._onReport(e));

            return device;
        }

        _onReport(event) {
            const view = event.data;
            const data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
            const frame = P.parseReport(data);
            if (!frame) return;

            // The device answers unimplemented addresses (25/26/27) with a NACK:
            // cmd 0x00, mod 0xEE, and the rest of the buffer left stale. Ignore
            // those, and ignore anything that is not a real reply — otherwise a
            // stale buffer can be mistaken for a response to the current command.
            if (frame.cmd !== CMD.GET && frame.cmd !== CMD.SET) return;

            // Burst writes first: they were sent without waiting, and their
            // acks carry an address and band that a later read would otherwise
            // claim for itself.
            const at = this.recent.findIndex((r) =>
                r.addr === frame.addr && (r.band === null || frame.payload[0] === r.band));
            if (at !== -1) {
                clearTimeout(this.recent[at].timer);
                this.recent.splice(at, 1);
                this._settleBurst();
                return;
            }

            const pending = this.pending;
            if (!pending) return;
            if (frame.addr !== pending.addr) return;
            if (pending.band !== null && frame.payload[0] !== pending.band) return;

            this.pending = null;
            clearTimeout(pending.timer);
            pending.resolve(frame.payload);
        }

        /* ---- Burst writes ----

           The TINY A takes about 32 ms to acknowledge a SET, and a ten-band
           move is ten SETs. Awaiting each one applies a knob move band by band
           over roughly a third of a second, so for most of that time the curve
           on the device is neither the old shape nor the new one — which is
           audible as a smear or a step while the knob is moving.

           A burst sends every frame of the new curve back-to-back and collects
           the acknowledgements afterwards, so the whole curve lands within a
           few milliseconds of the knob moving. The acks are still consumed, so
           nothing is left dangling and drain() can wait for them before any
           read — a late ack must never be mistaken for a read's reply, since
           it carries the same address and band. */
        _burst(addr, payload, band) {
            if (!this.device) return Promise.reject(new Error('Not connected'));

            const frame = P.buildFrame(CMD.SET, MOD.SET, addr, payload, this._nextSeq());
            const entry = { addr, band, timer: null };
            entry.timer = setTimeout(() => {
                const at = this.recent.indexOf(entry);
                if (at !== -1) this.recent.splice(at, 1);
                // Nobody answered. A burst is the one place a lost frame is not
                // obvious — the knob still reads what you asked for — so record
                // it and let the caller put the band back.
                this.burstLost.push({ addr, band });
                this._settleBurst();
            }, REQUEST_TIMEOUT);

            this.recent.push(entry);
            return this.device.sendReport(REPORT_ID, frame).catch((err) => {
                const at = this.recent.indexOf(entry);
                if (at !== -1) this.recent.splice(at, 1);
                this._settleBurst();
                throw err;
            });
        }

        _settleBurst() {
            if (this.recent.length) return;
            const waiters = this.burstWaiters;
            this.burstWaiters = [];
            for (const w of waiters) w();
        }

        /* Bands whose burst frame was never acknowledged, and clears the list. */
        takeBurstLosses() {
            const lost = this.burstLost;
            this.burstLost = [];
            return lost;
        }

        /* Resolves once every burst write has been acknowledged. */
        drain() {
            if (!this.recent.length) return Promise.resolve();
            return new Promise((resolve) => this.burstWaiters.push(resolve));
        }

        /* Serialised request — one outstanding command at a time.
           `optional` is for addresses the device never answers: we give it a
           short grace period, then carry on with a null result rather than
           stalling the UI on a reply that is never coming. */
        _request(cmd, mod, addr, payload, { band = null, optional = false } = {}) {
            const run = () => new Promise((resolve, reject) => {
                if (!this.device) { reject(new Error('Not connected')); return; }

                const frame = P.buildFrame(cmd, mod, addr, payload, this._nextSeq());
                const timer = setTimeout(() => {
                    this.pending = null;
                    if (optional) resolve(null);
                    else reject(new Error(`No reply from the device for address ${addr}`));
                }, optional ? OPTIONAL_GRACE : REQUEST_TIMEOUT);

                this.pending = { addr, band, timer, resolve };
                this.device.sendReport(REPORT_ID, frame).catch((err) => {
                    this.pending = null;
                    clearTimeout(timer);
                    reject(err);
                });
            });

            const queued = this.chain.then(run, run);
            this.chain = queued.catch(() => {});
            return queued;
        }

        _get(addr, payload = [], band = null) {
            // A read must not race a burst write: a SET ack and a GET reply for
            // the same address and band are indistinguishable, so a read that
            // overtook an unanswered write could adopt that write's own payload
            // as if it had come off the hardware.
            return this.drain().then(() =>
                this._request(CMD.GET, MOD.GET, addr, payload, { band }));
        }

        _set(addr, payload = [], optional = false) {
            return this._request(CMD.SET, MOD.SET, addr, payload, { optional });
        }

        /* ---- Reads ---- */
        getCount()   { return this._get(ADDR.PEQ_COUNT).then((p) => p[0]); }
        getPreset()  { return this._get(ADDR.PEQ_PRE).then((p) => p.reduce((a, b) => a * 256 + b, 0)); }
        getGlobal()  { return this._get(ADDR.GLOBAL_GAIN).then((p) => P.readInt16(p, true) / 10); }
        getBand(i)   { return this._get(ADDR.PEQ_PARAMS, [i], i).then(P.decodeBand); }

        async getFirmware() {
            const p = await this._get(ADDR.FIRMWARE);
            return Array.from(p).filter((c) => c >= 32 && c < 127).map((c) => String.fromCharCode(c)).join('');
        }

        /* ---- Writes ----
           There is no "save" command on the TINY A: addresses 25/26/27 are not
           implemented and never answer. Writing into the currently selected
           USER slot is what stores the curve — verified on hardware by writing
           a band, switching preset away and back, and reading it unchanged. */
        setBand(i, b)     { return this._set(ADDR.PEQ_PARAMS, P.encodeBand(i, b)); }

        /* The same write, without waiting for the acknowledgement — see
           _burst(). Only the band reconciler uses it, because only a knob move
           rewrites enough bands at once for the waits to add up. */
        setBandFast(i, b) { return this._burst(ADDR.PEQ_PARAMS, P.encodeBand(i, b), i); }
        setPreset(v)      { return this._set(ADDR.PEQ_PRE, P.uc(v)); }
        setGlobal(g)      { return this._set(ADDR.GLOBAL_GAIN, P.int16(Math.round(g * 10) & 0xffff)); }
        setSwitch(v)      { return this._set(ADDR.PEQ_SWITCH, P.uc(v), true); }

        setName(index, name) {
            const ascii = Array.from(name).map((c) => c.charCodeAt(0) & 0x7f);
            return this._set(ADDR.PEQ_NAME, [...P.uc(index), ...ascii]);
        }
    }

    /* ----------------------------------------------------------
       FiiO XML profile import / export
       ---------------------------------------------------------- */

    function clamp(v, lo, hi) {
        return Math.min(hi, Math.max(lo, v));
    }

    function escapeXml(text) {
        return String(text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    /* Round-trips the same FiiO_DSP XML the official app and the FiiO
       community profiles use, so files like "ALFIAN.xml" import as-is. */
    const Xml = {
        toXml(state, name, description) {
            const bands = state.bands.map((b, i) => `        <eq index="${i}">
          <param name="type">${b.type}</param>
          <param name="freq">${b.freq}</param>
          <param name="gain">${b.gain}</param>
          <param name="q">${b.q}</param>
        </eq>`).join('\n');

            return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FiiO_DSP model="SNOWSKY TINY A" version="0.0.1">
  <module name="EQ">
    <eqGroup>
      <param name="masterGain">${state.globalGain}</param>
      <eqList>
${bands}
      </eqList>
    </eqGroup>
  </module>
  <styleName>${escapeXml(name)}</styleName>
  <description>${escapeXml(description)}</description>
</FiiO_DSP>
`;
        },

        fromXml(text) {
            const doc = new DOMParser().parseFromString(text, 'application/xml');
            if (doc.querySelector('parsererror')) throw new Error('Not a valid XML file');

            const nodes = [...doc.querySelectorAll('eqList > eq')];
            if (!nodes.length) throw new Error('No EQ bands found in file');

            const num = (el, attr, fallback) => {
                const n = el.querySelector(`param[name="${attr}"]`);
                const v = n ? parseFloat(n.textContent) : NaN;
                return Number.isFinite(v) ? v : fallback;
            };

            // Values outside the TINY A's range are clamped, not rejected.
            const bands = nodes.map((el) => ({
                type: clamp(Math.round(num(el, 'type', 0)), 0, FILTERS.length - 1),
                freq: Math.round(clamp(num(el, 'freq', 1000), LIMITS.freq.min, LIMITS.freq.max)),
                gain: clamp(num(el, 'gain', 0), LIMITS.gain.min, LIMITS.gain.max),
                q: clamp(num(el, 'q', 1), LIMITS.q.min, LIMITS.q.max),
            }));

            const master = doc.querySelector('eqGroup > param[name="masterGain"]');
            return {
                bands,
                globalGain: clamp(master ? parseFloat(master.textContent) || 0 : 0,
                                  LIMITS.gain.min, LIMITS.gain.max),
                name: ((doc.querySelector('styleName') || {}).textContent || 'Imported').trim(),
                description: ((doc.querySelector('description') || {}).textContent || '').trim(),
            };
        },
    };

    /* ----------------------------------------------------------
       Controller / UI
       ---------------------------------------------------------- */

    const device = new TinyA();

    const state = {
            bands: [],          // the effective curve — what the device should hold
            globalGain: 0,
            preset: 0,
            eqEnabled: 1,
            count: 10,
            dirty: false,
            name: 'Custom',
            deviceName: '',

            // Tone view. `toneBase` is the curve the knobs act on; the knobs
            // never read back from `bands`, so moving one twice cannot compound.
            toneBase: [],
            tone: { low: 0, mid: 0, high: 0 },
            kill: { low: false, mid: false, high: false },
            gainKnob: 0,
            mute: false,
            view: 'parametric',
    };

    const el = (id) => document.getElementById(id);

    /* Last gain we actually sent per band, so the reconciler can skip bands that
       are already where they need to be. Deliberately what we *sent*, not what
       the device read back: the device quantises, and comparing against its
       rounded value would make every pass look like it still had work to do. */
    const writtenGain = [];

    /* The gain knob's position before MUTE slammed it to the floor. */
    let gainBeforeMute = 0;

    function setStatus(text, kind) {
        const line = el('logLine');
        if (line) line.textContent = text;
        document.body.classList.toggle('error', kind === 'error');

        // The Status panel is hidden while gated, so anything that goes wrong
        // before the device is attached has to surface on the connect card —
        // otherwise a failed connect is a button that silently does nothing.
        const promptError = el('connectError');
        if (promptError) {
            const show = !device.connected && kind === 'error';
            promptError.textContent = show ? text : '';
            promptError.style.display = show ? 'block' : 'none';
        }

        const log = el('log');
        if (log) {
            const stamp = new Date().toLocaleTimeString();
            log.textContent += `[${stamp}] ${kind === 'error' ? 'ERR ' : ''}${text}\n`;
            log.scrollTop = log.scrollHeight;
        }

        if (kind === 'error') console.error('[TinyA]', text);
        else console.log('[TinyA]', text);
    }

    function setConnected(connected, name) {
        const ind = el('connectionIndicator');
        ind.classList.toggle('connected', connected);
        ind.querySelector('.indicator-text').textContent = connected ? (name || 'Connected') : 'Disconnected';
        document.body.classList.toggle('is-connected', connected);

        applyGating();
        updateSaveLabel();
    }

    /* Nothing but Connect is usable without a device. */
    function applyGating() {
        const live = device.connected;
        document.querySelectorAll('.needs-device').forEach((node) => { node.disabled = !live; });
    }

    function markDirty(dirty) {
        state.dirty = dirty;
        el('saveBtn').classList.toggle('attention', dirty);
        const badge = el('dirtyBadge');
        if (badge) badge.style.display = dirty ? 'inline' : 'none';
    }

    /* Factory presets (0-6) cannot be written to, so saving always targets a
       USER slot. The user picks which one — defaulting to the slot already
       loaded, but never silently choosing one that holds someone's profile. */
    const USER_SLOTS = [160, 161, 162];

    function currentUserSlot() {
        return USER_SLOTS.includes(state.preset) ? state.preset : null;
    }

    function saveSlot() {
        const picked = parseInt(el('slotSelect').value, 10);
        return USER_SLOTS.includes(picked) ? picked : (currentUserSlot() ?? 160);
    }

    function slotLabel(value) {
        const preset = PRESETS.find((p) => p.value === value);
        return preset ? preset.label : `Slot ${value}`;
    }

    function updateSaveLabel() {
        const slot = saveSlot();
        const picker = el('slotSelect');

        // Whatever slot is loaded becomes the default destination, so the
        // common case — tweak the curve you are on, save — touches nothing else.
        const current = currentUserSlot();
        if (current !== null && picker.value !== String(current)) {
            picker.value = String(current);
        }

        el('saveBtn').textContent = device.connected
            ? `Save to ${slotLabel(saveSlot())}`
            : 'Save to Device';

        const target = el('saveTarget');
        if (!target) return;

        if (!device.connected) {
            target.textContent = 'Connect the device to edit or save.';
        } else if (current === null) {
            target.textContent = `${slotLabel(state.preset)} is a factory preset and cannot be written to. ` +
                `Your curve will be copied into ${slotLabel(saveSlot())}, overwriting what is stored there.`;
        } else {
            target.textContent = `Your curve will be written to ${slotLabel(current)}, ` +
                'overwriting what is stored there.';
        }
    }

    /* ---- Band rendering ---- */

    function buildBands(count) {
        const container = el('eqBands');
        container.innerHTML = '';
        state.bands = state.bands.slice(0, count);
        while (state.bands.length < count) {
            state.bands.push({ gain: 0, freq: 1000, q: 1, type: 0 });
        }

        for (let i = 0; i < count; i++) {
            const band = document.createElement('div');
            band.className = 'band';
            band.dataset.band = i;

            band.innerHTML = `
                <div class="band-readout"><span data-role="gain">0.0</span><small>dB</small></div>
                <input type="range" class="eq-slider needs-device" data-role="slider"
                       min="${LIMITS.gain.min}" max="${LIMITS.gain.max}" step="0.1" value="0">
                <label class="band-field">Freq
                    <input type="number" class="needs-device" data-role="freq" min="${LIMITS.freq.min}" max="${LIMITS.freq.max}" step="1">
                </label>
                <label class="band-field">Q
                    <input type="number" class="needs-device" data-role="q" min="${LIMITS.q.min}" max="${LIMITS.q.max}" step="0.01">
                </label>
                <label class="band-field">Type
                    <select class="needs-device" data-role="type">
                        ${FILTERS.map((f, idx) => `<option value="${idx}">${f.replace('_', ' ')}</option>`).join('')}
                    </select>
                </label>`;

            container.appendChild(band);

            const slider = band.querySelector('[data-role="slider"]');
            slider.addEventListener('input', () => {
                readBandInputs(i);
                setBaseGain(i, state.bands[i].gain);
                reconcile(`Band ${i + 1}`);
            });

            const onFieldChange = () => {
                readBandInputs(i);
                applyBandNow(i);
            };

            band.querySelector('[data-role="freq"]').addEventListener('change', onFieldChange);
            band.querySelector('[data-role="q"]').addEventListener('change', onFieldChange);
            band.querySelector('[data-role="type"]').addEventListener('change', onFieldChange);
        }

        applyGating();
    }

    function readBandInputs(i) {
        const band = document.querySelector(`.band[data-band="${i}"]`);
        const b = state.bands[i];
        b.gain = parseFloat(band.querySelector('[data-role="slider"]').value);
        b.freq = Math.round(parseFloat(band.querySelector('[data-role="freq"]').value) || b.freq);
        b.q = parseFloat(band.querySelector('[data-role="q"]').value) || b.q;
        b.type = parseInt(band.querySelector('[data-role="type"]').value, 10) || 0;
        band.querySelector('[data-role="gain"]').textContent = b.gain.toFixed(1);
    }

    function renderBand(i) {
        const band = document.querySelector(`.band[data-band="${i}"]`);
        if (!band) return;
        const b = state.bands[i];
        band.querySelector('[data-role="slider"]').value = b.gain;
        band.querySelector('[data-role="freq"]').value = b.freq;
        band.querySelector('[data-role="q"]').value = b.q;
        band.querySelector('[data-role="type"]').value = b.type;
        band.querySelector('[data-role="gain"]').textContent = Number(b.gain).toFixed(1);
    }

    /* ---- Instant apply ----

       A band write costs a round trip (~32 ms measured on hardware) and a single
       tone knob move can need all ten bands rewritten. Firing one write per
       input event would build a backlog the device could never drain, so the
       writes are reconciled instead: a pass walks the bands in order and sends
       only those that differ, re-reading the target as it goes. If the target
       moved while the pass was in flight, another pass follows. The device
       therefore always converges on where the knob actually is, and goes quiet
       once it gets there. */
    let reconciling = false;
    let reconcileAgain = false;

    async function reconcile(label) {
        if (!device.connected) return 0;
        if (reconciling) { reconcileAgain = true; return 0; }

        reconciling = true;
        let total = 0;
        let retry = true;
        try {
            do {
                reconcileAgain = false;
                for (let i = 0; i < state.count; i++) {
                    const want = state.bands[i].gain;
                    if (Math.abs(want - writtenGain[i]) < WRITE_THRESHOLD) continue;

                    // Snapshot before sending: the target may move again while
                    // this write is in flight, and the device must receive the
                    // value we believed we were sending.
                    const payload = { ...state.bands[i] };
                    await device.setBandFast(i, payload);
                    writtenGain[i] = payload.gain;
                    total++;
                }
                // Let the burst's acknowledgements land before deciding whether
                // another pass is owed, so two passes cannot interleave.
                await device.drain();

                // A frame the device never answered would otherwise leave that
                // one band on its old gain while the knob says it moved. Put
                // those bands back — once — before trusting the pass.
                const lost = device.takeBurstLosses();
                if (lost.length && retry) {
                    retry = false;
                    for (const { band } of lost) {
                        if (band === null || band >= state.count) continue;
                        await device.setBandFast(band, state.bands[band]);
                        total++;
                    }
                    await device.drain();
                    const stillLost = device.takeBurstLosses();
                    if (stillLost.length) {
                        const which = stillLost.map((l) => `band ${l.band + 1}`).join(', ');
                        setStatus(`The device did not acknowledge ${which} — ` +
                                  `that part of the curve may not have taken`, 'error');
                    }
                }

                // Hold the pass open for a beat. A burst lands in a few
                // milliseconds, so without this the reconciler finishes between
                // two of a drag's events and every event starts its own pass —
                // which is more writes, not fewer, and more curve updates to
                // hear. The beat lets a drag's events pile into the next pass,
                // so the device gets about 25 coherent updates a second.
                await new Promise((r) => setTimeout(r, RECONCILE_BEAT));
            } while (reconcileAgain && device.connected);

            // Log once per drain, not once per pass — a knob drag would
            // otherwise write a line every few milliseconds.
            if (total) {
                markDirty(true);
                setStatus(`${label}: ${total} band${total === 1 ? '' : 's'} written to device`);
            }
        } catch (err) {
            setStatus(`Apply failed: ${err.message}`, 'error');
        } finally {
            reconciling = false;
        }
        return total;
    }

    /* Frequency, Q and filter type are changed one at a time and are not
       dragged the way gain is, so they are written in place. */
    async function applyBandNow(i) {
        if (!device.connected) return;
        try {
            const payload = { ...state.bands[i] };
            await device.setBand(i, payload);
            writtenGain[i] = payload.gain;
            markDirty(true);
            setStatus(`Band ${i + 1}: ${payload.gain.toFixed(1)} dB @ ${payload.freq} Hz — applied to device`);
        } catch (err) {
            setStatus(`Apply failed: ${err.message}`, 'error');
        }
    }

    /* ---- Tone mapping ----

       A knob is a plateau over the slots it owns, tapering into its neighbour,
       and all it does is add dB to the ten bands:

           offset(i) = SUM over knobs  value x share(knob, slot i)

       A knob's value *is* the dB it puts on every band it owns. +6 MID adds +6
       to 250 Hz, 500 Hz, 1 kHz and 2 kHz alike, +2.4 to 125 Hz and 4 kHz, +1 to
       32 Hz and 8 kHz, and nothing past that. That is the whole mapping: the
       offset goes on top of the curve the knobs are working from and is written
       to the bands, exactly as if the sliders had been set by hand.

       Nothing is normalised or compensated. Earlier versions divided each
       region by the response its own bands produced, and trimmed the pre-gain
       by the resulting peak, to stop ten summed filters overshooting and stop a
       boost clipping. Both were wrong. Trimming the *peak* offset meant a
       +12 HIGH left the top band no higher than it started and pulled the rest
       of the spectrum down 7.9 dB — which sounds like the treble being removed,
       not added. A tone control that cannot raise its own region's level is not
       a tone control. Level is the GAIN knob's job. */

    /* How much of knob `k` lands on band `i`, in 0..1.

       1 everywhere inside the knob's span, then falling off by TONE_TAPER per
       slot past either end. A band the knob owns takes its full value; a band
       one slot into the neighbour takes 40%, two slots 16%. */
    function knobShare(k, i) {
        const [lo, hi] = TONE_OWNED[k];
        const out = i < lo ? lo - i : (i > hi ? i - hi : 0);
        return Math.pow(TONE_TAPER, out);
    }

    /* How far the knobs move band `i`, in dB. Derived from the knob positions
       and the band's slot, never from the band's current gain or its reported
       frequency, so moving a knob twice cannot compound and a band that has
       wandered in frequency still answers the knob that owns its slot. */
    function toneOffset(i) {
        if (!state.bands[i]) return 0;
        const value = (k) => (state.kill[k] ? KILL_DB : state.tone[k]);
        let offset = 0;
        for (const k of TONE_KEYS) offset += value(k) * knobShare(k, i);
        return offset;
    }

    function computeEffectiveGains() {
        for (let i = 0; i < state.count; i++) {
            if (!state.toneBase[i]) continue;
            const g = clamp(state.toneBase[i].gain + toneOffset(i),
                            LIMITS.gain.min, LIMITS.gain.max);
            state.bands[i].gain = Math.round(g / GRID) * GRID;
            renderBandGain(i);
        }
        renderToneReadout();
    }

    /* The shape, drawn. One column per band, in order, labelled with the slot
       the knob is keying off. The row of bars IS the shape the knobs are
       applying: a knob lifts every column it owns and leaves the far ends
       alone. If a band's device frequency has wandered off its slot the column
       is flagged, because the shape will be right while the sound is not — the
       filter sits somewhere other than where the knob thinks.

       The number shown is what actually lands on the band, i.e. net of the
       ±12 dB limit. Summing two knobs can ask for more than the hardware can
       hold (+12 MID and +12 HIGH both reach the middle), and printing the
       request when the device got the clamped value would be the same kind of
       lie as a slider reading 0.5 dB while the device holds 0.4. */
    function renderToneReadout() {
        const node = el('toneReadout');
        if (!node) return;

        const hz = (f) => (f >= 1000
            ? `${(f / 1000).toFixed(f % 1000 ? 1 : 0)}k`
            : `${Math.round(f)}`);

        const cells = state.bands.map((b, i) => {
            const base = state.toneBase[i] ? state.toneBase[i].gain : b.gain;
            const off = clamp(base + toneOffset(i), LIMITS.gain.min, LIMITS.gain.max) - base;
            const pct = Math.min(100, (Math.abs(off) / LIMITS.gain.max) * 100);
            const dir = off > 0.05 ? 'up' : (off < -0.05 ? 'down' : '');
            const moved = b.freq !== STOCK_FREQS[i];
            const f = moved ? `${hz(b.freq)}` : `${hz(STOCK_FREQS[i])}`;
            return `<span class="rsp-col ${dir}${moved ? ' drifted' : ''}">` +
                     `<span class="rsp-track">` +
                       `<span class="rsp-bar" style="height:${pct.toFixed(1)}%"></span>` +
                     `</span>` +
                     `<span class="rsp-db">${off >= 0 ? '+' : ''}${off.toFixed(1)}</span>` +
                     `<span class="rsp-freq"${moved ? ' title="this band sits at ' + hz(b.freq) +
                        ' Hz, not ' + hz(STOCK_FREQS[i]) + ' Hz"' : ''}>${f}</span>` +
                   `</span>`;
        });

        const knobs = TONE_KEYS.map((k) => {
            const v = state.kill[k] ? KILL_DB : state.tone[k];
            return `<span class="rsp-knob">${k.toUpperCase()} ` +
                   `<b>${v >= 0 ? '+' : ''}${v.toFixed(1)}</b></span>`;
        }).join('');

        node.innerHTML = `<span class="rsp-knobs">${knobs}</span>` +
                         `<span class="rsp-row">${cells.join('')}</span>` +
                         `<span class="rsp-caption">what the knobs are adding, per band` +
                         ` &middot; one column per band, 32 Hz to 16 kHz, left to right</span>`;

        renderHeadroom();
    }

    /* ---- Headroom ----

       A boost has to fit. Each band is clamped to +12 dB, so MID and HIGH
       together can ask for more level than the DAC has: a curve peaking at
       +10 dB clips anything recorded near full scale, and the clip is harsh
       because it happens at the very end of the chain.

       The only thing that can absorb a boost is the pre-gain, which is exactly
       what GAIN is — the TINY A applies it ahead of the PEQ, so pulling it down
       is what buys the headroom. That move is deliberately NOT automatic. It
       makes the whole spectrum quieter, which is the trade every boost makes,
       and a tone control that silently cancels its own boost is precisely what
       this app got wrong before. So: say what the peak is, offer the move, and
       leave the knob under the user's hand. */
    let headroomTrim = 0;

    function renderHeadroom() {
        const box = el('toneHeadroom');
        const text = el('headroomText');
        const btn = el('headroomFix');
        if (!box || !text || !btn) return;

        let peak = 0;
        for (let i = 0; i < state.count; i++) {
            peak = Math.max(peak, state.bands[i].gain);
        }

        const trim = clamp(-peak, LIMITS.gain.min, LIMITS.gain.max);
        const over = peak + state.globalGain;
        headroomTrim = trim;

        btn.style.display = 'none';
        box.classList.toggle('clipping', false);

        if (peak <= WRITE_THRESHOLD) {
            text.textContent = 'the curve peaks at 0 dB — nothing to clip';
            return;
        }
        if (over <= WRITE_THRESHOLD) {
            text.textContent = `peak +${peak.toFixed(1)} dB, GAIN ${state.globalGain.toFixed(1)} dB — fits`;
            return;
        }

        box.classList.toggle('clipping', true);
        text.textContent = `peak +${peak.toFixed(1)} dB with GAIN at ` +
            `${state.globalGain.toFixed(1)} — ${over.toFixed(1)} dB over full scale, this clips`;

        btn.textContent = `Set GAIN to ${trim.toFixed(1)}`;
        btn.style.display = '';
    }

    /* The slider and the knobs must not fight: the knobs work from `toneBase`,
       so a slider edit is written back into the base, net of whatever offset the
       knobs are currently applying. */
    function setBaseGain(i, gain) {
        if (!state.toneBase[i]) return;
        state.toneBase[i].gain = clamp(gain - toneOffset(i), -24, 24);
    }

    /* Capture the curve the knobs act on and park them at centre. Anything that
       replaces the whole curve — sync, import, flatten — has to re-base, or the
       knobs would keep applying an offset to a curve the user never shaped with
       them. */
    function rebaseTone(resetKnobs = true) {
        // With the knobs kept, the gains on screen are base + tone, so the tone
        // has to come back out — otherwise the next recompute adds it a second
        // time. With the knobs reset, the gains are the raw curve the device
        // reported and the tone is about to be zeroed, so they are the base.
        state.toneBase = state.bands.map((b, i) => resetKnobs
            ? { ...b }
            : { ...b, gain: b.gain - toneOffset(i) });
        if (resetKnobs) {
            state.tone = { low: 0, mid: 0, high: 0 };
            state.kill = { low: false, mid: false, high: false };
        }
        syncToneControls();
    }

    /* Moves just the slider and its readout — used while a knob is being
       dragged, where touching freq/Q/type inputs would be wasted work. */
    function renderBandGain(i) {
        const band = document.querySelector(`.band[data-band="${i}"]`);
        if (!band) return;
        const g = Number(state.bands[i].gain);
        band.querySelector('[data-role="slider"]').value = g;
        band.querySelector('[data-role="gain"]').textContent = g.toFixed(1);
    }

    /* ---- Tone controls ---- */

    function paintKillButtons() {
        const view = el('toneView');
        if (!view) return;

        const button = (which) => view.querySelector(`.kill-btn[data-kill="${which}"]`);
        const knob = (id) => el(id);

        const gainBtn = button('gain');
        if (gainBtn) gainBtn.classList.toggle('active', state.mute);
        const gainKnob = knob('toneGain');
        if (gainKnob) gainKnob.toggleAttribute('killed', state.mute);

        for (const k of TONE_KEYS) {
            const btn = button(k);
            if (btn) btn.classList.toggle('active', state.kill[k]);
            const node = knob(`tone${k[0].toUpperCase()}${k.slice(1)}`);
            if (node) node.toggleAttribute('killed', state.kill[k]);
        }
    }

    function syncToneControls() {
        el('toneGain').value = state.gainKnob;
        el('toneLow').value = state.tone.low;
        el('toneMid').value = state.tone.mid;
        el('toneHigh').value = state.tone.high;
        paintKillButtons();
        renderToneReadout();
    }

    /* The toolbar slider and the GAIN knob are two handles on one value, so
       both are updated whenever either moves. */
    function setGainLocal(v) {
        state.gainKnob = clamp(v, LIMITS.gain.min, LIMITS.gain.max);
        state.globalGain = state.gainKnob;
        el('toneGain').value = state.gainKnob;
        el('globalGain').value = state.globalGain;
        el('globalGainValue').textContent = Number(state.globalGain).toFixed(1);
    }

    /* Same coalescing trick as the band reconciler: a gain drag outruns the
       device, so newer values replace the pending one instead of queueing. */
    let gainBusy = false;
    let gainPending = null;

    async function flushGain() {
        if (gainBusy) return;
        gainBusy = true;
        let last = null;
        try {
            while (gainPending !== null && device.connected) {
                last = gainPending;
                gainPending = null;
                await device.setGlobal(last);
                markDirty(true);
            }
            if (last !== null) setStatus(`Gain ${Number(last).toFixed(1)} dB`);
        } catch (err) {
            setStatus(`Gain failed: ${err.message}`, 'error');
        } finally {
            gainBusy = false;
        }
    }

    function pushGain() {
        if (!device.connected) return;
        gainPending = state.globalGain;
        flushGain();
    }

    function toggleKill(which) {
        if (which === 'gain') {
            // MUTE is a real −12 dB on a single value, so it slams the knob to
            // the floor and leaves it there. The tone kills below cannot do
            // that: they are weighted offsets, so the knob keeps its position
            // and only the resulting offset changes.
            if (state.mute) {
                state.mute = false;
                setGainLocal(gainBeforeMute);
            } else {
                gainBeforeMute = state.gainKnob;
                state.mute = true;
                setGainLocal(KILL_DB);
            }
            paintKillButtons();
            pushGain();
            return;
        }

        state.kill[which] = !state.kill[which];
        paintKillButtons();
        computeEffectiveGains();
        reconcile(`Kill ${which.toUpperCase()}`);
    }

    /* Everything to 0 dB, from either view. Filter types are left alone — a
       shelf at 0 dB is just as flat as a peak at 0 dB, and changing them would
       throw away the shape a user had dialled in. */
    async function flattenAll(reason) {
        state.tone = { low: 0, mid: 0, high: 0 };
        state.kill = { low: false, mid: false, high: false };
        for (let i = 0; i < state.count; i++) {
            state.toneBase[i] = { ...state.toneBase[i], gain: 0 };
            state.bands[i].gain = 0;
            renderBandGain(i);
        }
        state.mute = false;
        setGainLocal(0);
        syncToneControls();

        const written = await reconcile('Flattened');
        pushGain();
        if (device.connected && written) {
            setStatus(typeof reason === 'string' ? reason : 'All bands flattened to 0 dB');
        }
    }

    function setView(view) {
        state.view = view;
        const tone = view === 'tone';
        document.body.classList.toggle('mode-tone', tone);
        el('viewParametric').classList.toggle('active', !tone);
        el('viewTone').classList.toggle('active', tone);
        el('eqTitle').textContent = tone ? 'Tone' : 'Parametric EQ';

        // Opening Tone starts from flat. The knobs are an adjustment of the EQ,
        // not of whatever happened to be loaded — a curve left over from a
        // preset or an import would be sitting under the knobs, so a "+4 MID"
        // would mean something different every time you came back to the tab.
        // Starting at zero makes the four numbers the whole state.
        //
        // This is a write to the device, and it is deliberate: the tab is not a
        // read-only lens. Anything on the bands is replaced, so save or export
        // a curve before opening Tone if you want to keep it.
        if (tone) flattenAll('Tone view starts from a flat EQ — all ten bands at 0 dB');
    }

    function wireTone() {
        const knobs = { low: el('toneLow'), mid: el('toneMid'), high: el('toneHigh') };

        for (const k of TONE_KEYS) {
            const apply = () => {
                computeEffectiveGains();
                reconcile(`Tone ${k.toUpperCase()}`);
            };

            knobs[k].addEventListener('knob-input', (e) => {
                state.tone[k] = e.detail.value;
                state.kill[k] = false;    // moving a knob releases its kill
                paintKillButtons();
                apply();
            });
            knobs[k].addEventListener('knob-change', apply);
        }

        el('toneGain').addEventListener('knob-input', (e) => {
            state.mute = false;
            setGainLocal(e.detail.value);
            paintKillButtons();
            pushGain();
        });
        el('toneGain').addEventListener('knob-change', pushGain);

        el('toneView').querySelectorAll('.kill-btn').forEach((btn) => {
            btn.addEventListener('click', () => toggleKill(btn.dataset.kill));
        });

        el('viewParametric').addEventListener('click', () => setView('parametric'));
        el('viewTone').addEventListener('click', () => setView('tone'));
    }

    /* ---- Sync / refresh ---- */

    async function refreshFromDevice() {
        setStatus('Reading state from device…');
        try {
            state.count = await device.getCount();
            state.preset = await device.getPreset();
            // PEQ_SWITCH (26) is not readable on the TINY A — it never answers,
            // so the toggle is write-only and starts from whatever is on screen.
            try { state.globalGain = await device.getGlobal(); } catch (_) { state.globalGain = 0; }

            const bands = [];
            for (let i = 0; i < state.count; i++) {
                bands.push(await device.getBand(i));
            }
            state.bands = bands;

            el('presetSelect').value = String(state.preset);
            buildBands(state.count);
            for (let i = 0; i < state.count; i++) renderBand(i);

            // Nothing is dirty yet: record what the device already holds so the
            // reconciler does not turn round and write the whole curve back.
            for (let i = 0; i < state.count; i++) writtenGain[i] = state.bands[i].gain;

            state.mute = false;
            state.gainKnob = state.globalGain;
            gainBeforeMute = state.globalGain;
            el('globalGain').value = state.globalGain;
            el('globalGainValue').textContent = Number(state.globalGain).toFixed(1);
            rebaseTone();

            markDirty(false);
            updateSaveLabel();
            setStatus(`Synced ${state.count} bands from ${state.deviceName}`);
        } catch (err) {
            setStatus(`Sync failed: ${err.message}`, 'error');
        }
    }

    /* ---- Save / preset ---- */

    async function saveToDevice() {
        const slot = saveSlot();
        const name = state.name.slice(0, NAME_LENGTH);
        try {
            setStatus(`Saving to ${slotLabel(slot)}…`);

            // Selecting a USER slot loads its stored curve into the working
            // buffer; we then overwrite it with the curve on screen.
            await device.setPreset(slot);
            state.preset = slot;
            el('presetSelect').value = String(slot);

            await device.setName(slot, name);
            for (let i = 0; i < state.count; i++) await device.setBand(i, state.bands[i]);
            await device.setGlobal(state.globalGain);
            await device.setSwitch(state.eqEnabled);

            // No separate save command exists — writing into the selected USER
            // slot is the save. Read it back to confirm the device took it.
            const written = [];
            for (let i = 0; i < state.count; i++) written.push(await device.getBand(i));

            const bad = written.findIndex((b, i) => !closeEnough(b, state.bands[i]));
            if (bad !== -1) {
                setStatus(`Save unconfirmed: band ${bad + 1} read back as ` +
                          `${written[bad].gain.toFixed(1)} dB @ ${written[bad].freq} Hz`, 'error');
                return;
            }

            // Adopt what the device actually stored, so the sliders show the
            // quantised values rather than what was asked for. The tone knobs
            // keep their positions: their base is unchanged, so the next knob
            // move still recomputes from the curve the user shaped.
            state.bands = written;
            for (let i = 0; i < state.count; i++) {
                renderBand(i);
                writtenGain[i] = written[i].gain;
            }

            // Re-base on what the device stored, keeping the knobs where they
            // are. The device lands gains on a 0.2 dB grid, so a base captured
            // before the save holds the pre-quantisation values: recomputing
            // from it would ask for a curve a tenth of a dB away from the one
            // just verified, and rewrite bands that never needed touching.
            rebaseTone(false);
            state.globalGain = await device.getGlobal();
            state.gainKnob = state.globalGain;
            el('toneGain').value = state.gainKnob;
            el('globalGain').value = state.globalGain;
            el('globalGainValue').textContent = Number(state.globalGain).toFixed(1);

            // The device upper-cases names, so show what is actually stored.
            state.name = name.toUpperCase();
            el('nameInput').value = state.name;

            markDirty(false);
            updateSaveLabel();
            setStatus(`Saved to ${slotLabel(slot)} as "${state.name}" — read back and verified`);
        } catch (err) {
            setStatus(`Save failed: ${err.message}`, 'error');
        }
    }

    /* ---- File import / export ---- */

    function exportXml() {
        const xml = Xml.toXml(state, state.name, 'Exported from TINY A Controller');
        const blob = new Blob([xml], { type: 'application/xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${state.name || 'profile'}.xml`;
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus('Exported XML profile');
    }

    /* A file carries a curve; it does not get to redesign the instrument. The
       TINY A's PEQ is ten bands, and the tone knobs key off where those bands
       sit in frequency — so a profile that supplies fewer than ten bands is
       *missing* them, not asking for them to be moved. Padding the gaps used to
       invent 1000 Hz per band and write that straight to the device, which
       flattened the whole layout onto one frequency: every band then took the
       same share of every knob, so moving one knob moved all ten sliders, and a
       kill dropped all ten. Keep the device's own band for anything the file
       does not supply, and leave those bands unwritten. */
    function bandsFromImport(parsed) {
        const live = state.bands.slice();
        const merged = [];
        for (let i = 0; i < state.count; i++) {
            const src = parsed.bands[i];
            const fallback = live[i] || { gain: 0, freq: 1000, q: 1, type: 0 };
            merged.push(src
                ? { type: src.type, freq: src.freq, q: src.q, gain: src.gain }
                : { ...fallback });
        }
        return { merged, supplied: Math.min(parsed.bands.length, state.count) };
    }

    function importXml(file) {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = Xml.fromXml(reader.result);
                const { merged, supplied } = bandsFromImport(parsed);
                state.bands = merged;
                state.globalGain = parsed.globalGain;
                state.name = (parsed.name || 'Imported').slice(0, NAME_LENGTH);
                const credit = parsed.description ? ` (${parsed.description})` : '';

                el('nameInput').value = state.name;
                state.mute = false;
                state.gainKnob = state.globalGain;
                gainBeforeMute = state.globalGain;
                el('globalGain').value = state.globalGain;
                el('globalGainValue').textContent = Number(state.globalGain).toFixed(1);
                for (let i = 0; i < state.count; i++) renderBand(i);
                rebaseTone();

                // Push only what the file actually supplied; the bands it left
                // out are already on the device and must stay as they are.
                for (let i = 0; i < supplied; i++) {
                    await device.setBand(i, state.bands[i]);
                    writtenGain[i] = state.bands[i].gain;
                }
                await device.setGlobal(state.globalGain);
                markDirty(true);
                const short = supplied < state.count
                    ? ` — file had ${supplied} of ${state.count} bands, the rest left as they were`
                    : '';
                setStatus(`Imported "${state.name}"${credit} and applied to device${short}`);
            } catch (err) {
                setStatus(`Import failed: ${err.message}`, 'error');
            }
        };
        reader.readAsText(file);
    }

    /* Put the ten slots back on their real centres (STOCK_FREQS, above). The
       tone shares no longer read these frequencies, so a collapsed layout can
       no longer scramble the knobs — but it still scrambles the *sound*: a
       "32 Hz" band that is really at 1 kHz is a 1 kHz filter however the knob
       labels it. Only the frequencies are touched: gain, Q and type are left
       exactly as they are, so this cannot undo a curve. */
    async function restoreFrequencies() {
        if (!device.connected) return;
        setStatus('Restoring band frequencies…');
        try {
            let fixed = 0;
            for (let i = 0; i < state.count; i++) {
                const want = STOCK_FREQS[i];
                if (!want || state.bands[i].freq === want) continue;
                state.bands[i].freq = want;
                if (state.toneBase[i]) state.toneBase[i] = { ...state.toneBase[i], freq: want };
                await device.setBand(i, state.bands[i]);
                renderBand(i);
                fixed++;
            }
            computeEffectiveGains();
            setStatus(fixed
                ? `Restored ${fixed} band${fixed === 1 ? '' : 's'} to the standard centres ` +
                  `(32 Hz – 16 kHz). Gains, Q and filter types were left alone.`
                : 'All ten bands were already at the standard centres.');
        } catch (err) {
            setStatus(`Restore failed: ${err.message}`, 'error');
        }
    }

    /* ---- Wiring ---- */

    async function doConnect() {
        const button = el('connectBtn');
        button.disabled = true;
        el('connectError').style.display = 'none';   // clear the previous failure
        try {
            const dev = await device.connect();
            if (!dev) { button.disabled = false; return; }   // picker dismissed
            device.onDisconnect = () => { setConnected(false); setStatus('Device disconnected', 'error'); };
            state.deviceName = dev.productName;
            setConnected(true, dev.productName);
            await refreshFromDevice();
        } catch (err) {
            setStatus(`Connect failed: ${err.message}`, 'error');
        } finally {
            button.disabled = false;
        }
    }

    function wire() {
        wireTone();

        el('connectBtn').addEventListener('click', doConnect);

        el('syncBtn').addEventListener('click', refreshFromDevice);

        el('presetSelect').addEventListener('change', async (e) => {
            state.preset = parseInt(e.target.value, 10);
            if (!device.connected) return;
            try {
                await device.setPreset(state.preset);
                await refreshFromDevice();
                setStatus(`Preset: ${e.target.selectedOptions[0].textContent}`);
            } catch (err) {
                setStatus(`Preset failed: ${err.message}`, 'error');
            }
        });

        el('eqSwitch').addEventListener('change', async (e) => {
            state.eqEnabled = e.target.checked ? 1 : 0;
            if (!device.connected) return;
            try { await device.setSwitch(state.eqEnabled); markDirty(true); setStatus(`EQ ${state.eqEnabled ? 'on' : 'off'}`); }
            catch (err) { setStatus(`EQ switch failed: ${err.message}`, 'error'); }
        });

        // One value, two handles — this slider and the GAIN knob.
        const gg = el('globalGain');
        gg.addEventListener('input', () => {
            state.mute = false;
            setGainLocal(parseFloat(gg.value) || 0);
            paintKillButtons();
        });
        gg.addEventListener('change', pushGain);

        el('flatBtn').addEventListener('click', () => flattenAll());

        // The headroom offer: pull GAIN down so the peak lands at full scale
        // instead of past it. One click, and the GAIN knob visibly moves.
        el('headroomFix').addEventListener('click', () => {
            setGainLocal(headroomTrim);
            renderHeadroom();
            pushGain();
        });

        el('saveBtn').addEventListener('click', saveToDevice);
        el('exportBtn').addEventListener('click', exportXml);
        el('importBtn').addEventListener('click', () => el('importFile').click());
        el('fixFreqsBtn').addEventListener('click', restoreFrequencies);
        el('importFile').addEventListener('change', (e) => {
            if (e.target.files[0]) importXml(e.target.files[0]);
            e.target.value = '';
        });

        el('nameInput').addEventListener('input', (e) => {
            state.name = e.target.value.slice(0, NAME_LENGTH);
            markDirty(true);
        });

        el('slotSelect').addEventListener('change', updateSaveLabel);

        el('logToggle').addEventListener('click', () => {
            el('log').classList.toggle('open');
        });

        // Drop an .xml profile anywhere on the page.
        ['dragenter', 'dragover'].forEach((type) => {
            document.addEventListener(type, (e) => {
                e.preventDefault();
                document.body.classList.add('dragging');
            });
        });
        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) document.body.classList.remove('dragging');
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            document.body.classList.remove('dragging');
            const file = e.dataTransfer && e.dataTransfer.files[0];
            if (file) importXml(file);
        });
    }

    /* ---- Init ---- */

    document.addEventListener('DOMContentLoaded', () => {
        buildBands(10);
        for (let i = 0; i < 10; i++) renderBand(i);

        const sel = el('presetSelect');
        sel.innerHTML = PRESETS.map((p) => `<option value="${p.value}">${p.label}</option>`).join('');

        wire();
        setView('parametric');
        rebaseTone();
        setConnected(false);

        if (!navigator.hid) {
            setStatus('This browser does not support WebHID. Use Chrome, Edge or another Chromium browser.', 'error');
        } else {
            setStatus('Ready — connect the SNOWSKY TINY A and press Connect.');
        }
    });
})();
