// RGBirds UI: FM birdsong aviary
//
// Six knobs, all 0..1, because that is what the engine takes. The sliders'
// HTML values are the sounding defaults (see rgbirds-synth.js), and assigning
// `synth` pushes them, so the page opens on a dawn chorus rather than on the
// engine's own silent BIRDS 0 -- which is right for a device and wrong for a
// page you just pressed a button to open.

class RGBirdsUI extends HTMLElement {
    constructor() {
        super();
        this._synth = null;
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() { this.render(); this.setupListeners(); }

    get synth() { return this._synth; }

    set synth(s) {
        this._synth = s;
        this.pushParameters();
    }

    setSynth(synth) { this.synth = synth; }

    /** Send every slider to the engine. The page's defaults win over the C ones. */
    pushParameters() {
        if (!this._synth) return;
        this.shadowRoot.querySelectorAll('[data-param]').forEach(el => {
            this._synth.setParameter(+el.dataset.param, +el.value);
        });
    }

    setSequencer() {}

    setupListeners() {
        const root = this.shadowRoot;

        root.querySelectorAll('[data-param]').forEach(el => {
            el.addEventListener('input', () => {
                const v = +el.value;
                const disp = root.getElementById(`v${el.dataset.param}`);
                if (disp) disp.textContent = Number(v).toFixed(+el.dataset.fmt);
                this._synth?.setParameter(+el.dataset.param, v);
            });
        });

        root.querySelector('#btnChorusOnce')?.addEventListener('click', () => {
            // A handful of calls across the keyboard, so the note-on path is
            // audible without a MIDI keyboard attached.
            for (const note of [79, 84, 88, 91]) this._synth?.noteOn(note, 100);
        });

        root.querySelector('#btnSilence')?.addEventListener('click', () => {
            this._synth?.allNotesOff();
        });
    }

    _slider(id, label, def, fmt = 2) {
        return `<div class="ctrl">
          <label>${label}</label>
          <input type="range" data-param="${id}" data-fmt="${fmt}"
                 min="0" max="1" step="0.005" value="${def}">
          <span class="val" id="v${id}">${Number(def).toFixed(fmt)}</span>
        </div>`;
    }

    render() {
        this.shadowRoot.innerHTML = `
<style>
  :host { display:block; background:#141414; border:1px solid #222; border-radius:8px; padding:16px; color:#ddd; font:13px/1.4 system-ui,sans-serif; }
  h3 { margin:0 0 4px; font-size:13px; color:#7c4; text-transform:uppercase; letter-spacing:2px; }
  .sub { font-size:11px; color:#666; margin-bottom:12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px; }
  .section { background:#0d0d0d; border:1px solid #222; border-radius:4px; padding:10px; }
  .sec-title { font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .ctrl { margin-bottom:6px; } .ctrl:last-child { margin-bottom:0; }
  label { display:block; font-size:10px; color:#888; margin-bottom:1px; }
  input[type=range] { width:100%; accent-color:#7c4; }
  .val { font-size:10px; color:#7c4; }
  .actions { display:flex; gap:8px; margin-top:12px; }
  .actions button { padding:6px 12px; font-size:11px; background:#1a1a1a; border:1px solid #333; color:#aaa; cursor:pointer; border-radius:3px; }
  .actions button:hover { border-color:#7c4; color:#7c4; }
  .info { font-size:11px; color:#555; margin-top:10px; }
</style>

<h3>RGBirds: Aviary</h3>
<div class="sub">FM birdsong. Play the keyboard for a call at that pitch, or raise BIRDS and let the chorus sing. AIR is a synthesized leaf-and-wind hiss and is off at 0: it is not the birds.</div>

<div class="grid">
  <div class="section">
    <div class="sec-title">The Aviary</div>
    ${this._slider(0, 'Birds: chorus density', 0.00)}
    ${this._slider(1, 'Size: wren .. crow', 0.45)}
  </div>
  <div class="section">
    <div class="sec-title">The Voice</div>
    ${this._slider(2, 'Timbre: FM index', 0.60)}
    ${this._slider(3, 'Phrase: syllables per call', 0.35)}
  </div>
  <div class="section">
    <div class="sec-title">The Air</div>
    ${this._slider(4, 'Air: leaf and wind bed (0 = off)', 0.00)}
    ${this._slider(5, 'Spread: stereo width', 0.70)}
  </div>
</div>

<div class="actions">
  <button id="btnChorusOnce">Call a few birds</button>
  <button id="btnSilence">Silence the calls</button>
</div>

<div class="info">
  A note-off is ignored: a bird that has been called does not stop because the
  key came up. Silence ends the calls that are sounding; the chorus carries on.
</div>`;
    }
}

customElements.define('rgbirds-ui', RGBirdsUI);
export default RGBirdsUI;
