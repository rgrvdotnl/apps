// RGStorm UI: rain and thunder
//
// Four knobs, all 0..1, because that is what the engine takes. The sliders' HTML
// values are the sounding defaults (see rgstorm-synth.js), and assigning `synth`
// pushes them, so the page opens on the panel's settings rather than on the
// engine's own.
//
// There are no buttons, and that is the one structural difference from the
// RGFrogs and RGBirds panels. Those have a "call a few" button because their
// instruments are choruses that need starting; Storm's trigger is the note
// itself, and the keyboard below the panel is already the thing you play it
// with. This is the NTS-1 mkII build's model -- strikes fire on note on, from
// the keyboard or from anything playing the unit's MIDI channel -- and it is
// why the panel reads as four sliders and nothing else.
//
// RAIN opens at 0, so the panel is silent until it is turned up. That is
// deliberate and is the same call the drumlogue makes; the alternative is a
// noise floor nobody asked for, which is what Birds' first version did with its
// air bed at 0.15.

class RGStormUI extends HTMLElement {
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

    /**
     * STRIKES is a count, not a level, so it reads 1..6 rather than 0.00..1.00
     * -- the slider is still 0..1 because that is what the binding takes, but
     * showing the fraction would tell the player nothing about what they are
     * about to hear. The mapping is the binding's: 1 + round(v * 5).
     */
    _display(v, fmt, count) {
        return count ? String(1 + Math.round(v * 5)) : Number(v).toFixed(fmt);
    }

    setupListeners() {
        const root = this.shadowRoot;

        root.querySelectorAll('[data-param]').forEach(el => {
            el.addEventListener('input', () => {
                const v = +el.value;
                const disp = root.getElementById(`v${el.dataset.param}`);
                if (disp) {
                    disp.textContent = this._display(v, +el.dataset.fmt, el.dataset.count === '1');
                }
                this._synth?.setParameter(+el.dataset.param, v);
            });
        });
    }

    _slider(id, label, def, fmt = 2, count = false) {
        return `<div class="ctrl">
          <label>${label}</label>
          <input type="range" data-param="${id}" data-fmt="${fmt}"${count ? ' data-count="1"' : ''}
                 min="0" max="1" step="0.005" value="${def}">
          <span class="val" id="v${id}">${this._display(def, fmt, count)}</span>
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
  .info { font-size:11px; color:#555; margin-top:10px; }
</style>

<h3>RGStorm: Weather</h3>
<div class="sub">Rain and thunder. RAIN is a bed that runs on its own; a <em>note</em> calls down the thunder: play the keyboard, or anything sending on this channel. There is no strike button: the keys are the trigger.</div>

<div class="grid">
  <div class="section">
    <div class="sec-title">The Rain</div>
    ${this._slider(0, 'Rain: dry .. downpour (0 = silence)', 0.00)}
  </div>
  <div class="section">
    <div class="sec-title">The Thunder</div>
    ${this._slider(1, 'Dist: overhead .. far off', 1.00)}
    ${this._slider(2, 'Intn: thump .. crackle', 0.50)}
    ${this._slider(3, 'Strikes: claps per storm', 0.40, 2, true)}
  </div>
</div>

<div class="info">
  Every key is the same thunder: the note is not a pitch and the velocity is not
  used, so DIST, INTN and STRIKES are the whole description of a clap. The rain
  plays on underneath, with nothing held down; turn RAIN to 0 to stop it.
</div>`;
    }
}

customElements.define('rgstorm-ui', RGStormUI);
export default RGStormUI;
