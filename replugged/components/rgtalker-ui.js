/**
 * RGTalker UI Component
 * Text input + voice parameter sliders for the Amiga speech synthesizer.
 */

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiNoteName(n) { return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1); }

class RGTalkerUI extends HTMLElement {
    constructor() {
        super();
        this._synth = null;
    }

    /* Called by synth.js after the synth instance is ready */
    set synth(instance) {
        this._synth = instance;
        if (instance) {
            instance.onPhonemes = (ph) => this._showPhonemes(ph);
            instance.setText(this._text());
            instance.requestPhonemes();
        }
    }

    connectedCallback() { this._render(); }

    _text()  { return this.querySelector('#rgt-text')?.value ?? 'Hello World'; }

    _render() {
        this.innerHTML = `
<div style="
    margin-top:14px;
    padding:16px 18px;
    background:#0f0f0f;
    border:1px solid #2a2a2a;
    border-radius:6px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    color:#fff;
">
  <!-- Text row -->
  <div style="margin-bottom:10px;">
    <div style="font-size:.68em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
                color:#aaa;margin-bottom:8px;">Text to Speak</div>
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="rgt-text" type="text" value="Hello World" maxlength="511"
             autocomplete="off" spellcheck="false"
             style="flex:1;background:#1a1a1a;border:1px solid #333;border-radius:5px;
                    color:#fff;font-size:1em;padding:8px 12px;outline:none;">
      <button id="rgt-apply" style="
          background:#CF1A37;color:#fff;border:none;border-radius:5px;
          cursor:pointer;font-weight:600;padding:8px 16px;white-space:nowrap;">
        Apply
      </button>
    </div>
    <div id="rgt-phonemes" style="margin-top:7px;font-size:.75em;font-family:monospace;
         letter-spacing:.05em;color:#8ecfff;min-height:1.3em;">-</div>
  </div>

  <div style="border-top:1px solid #222;margin:12px 0;"></div>

  <!-- Voice sliders -->
  <div style="font-size:.68em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
              color:#aaa;margin-bottom:10px;">Voice</div>
  ${['Speed|0|0.25|4|1|2','Mouth|1|0.5|2|1|2','Throat|2|0.5|1.5|1|2',
     'Breathiness|4|0|1|0.0|2','Volume|3|0|1|0.8|2']
    .map(s => { const [lbl,idx,mn,mx,def,dec] = s.split('|');
      return `<div style="display:grid;grid-template-columns:100px 1fr 50px;
                          align-items:center;gap:8px;margin-bottom:8px;">
        <div style="font-size:.83em;color:#aaa;text-align:right;">${lbl}</div>
        <input type="range" id="rgt-sl-${idx}" min="${mn}" max="${mx}"
               step="0.01" value="${def}" style="accent-color:#CF1A37;">
        <div id="rgt-val-${idx}" style="font-size:.83em;text-align:right;
             font-variant-numeric:tabular-nums;">${parseFloat(def).toFixed(dec)}</div>
      </div>`; }).join('')}

  <div style="border-top:1px solid #222;margin:12px 0;"></div>

  <!-- Pitch / velocity / loop -->
  <div style="font-size:.68em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
              color:#aaa;margin-bottom:10px;">Playback</div>
  <div style="display:grid;grid-template-columns:100px 1fr 80px;
              align-items:center;gap:8px;margin-bottom:8px;">
    <div style="font-size:.83em;color:#aaa;text-align:right;">Pitch</div>
    <input type="range" id="rgt-pitch" min="0" max="127" step="1" value="60"
           style="accent-color:#CF1A37;">
    <div id="rgt-pitch-val" style="font-size:.83em;text-align:right;">60 C4</div>
  </div>
  <div style="display:grid;grid-template-columns:100px 1fr 50px;
              align-items:center;gap:8px;margin-bottom:10px;">
    <div style="font-size:.83em;color:#aaa;text-align:right;">Velocity</div>
    <input type="range" id="rgt-vel" min="1" max="127" step="1" value="100"
           style="accent-color:#CF1A37;">
    <div id="rgt-vel-val" style="font-size:.83em;text-align:right;">100</div>
  </div>
  <div style="display:flex;gap:10px;align-items:center;">
    <label style="display:flex;align-items:center;gap:6px;font-size:.85em;color:#aaa;cursor:pointer;">
      <input type="checkbox" id="rgt-loop" style="accent-color:#CF1A37;"> Loop
    </label>
    <button id="rgt-speak" style="
        flex:1;background:#CF1A37;color:#fff;border:none;border-radius:5px;
        cursor:pointer;font-weight:600;font-size:.95em;padding:9px 0;">
      &#9654; Speak
    </button>
    <button id="rgt-stop" style="
        background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:5px;
        cursor:pointer;padding:9px 16px;font-size:.95em;">
      &#9632; Stop
    </button>
  </div>
</div>`;

        this._wire();
    }

    _wire() {
        /* Apply text */
        const applyFn = () => {
            if (!this._synth) return;
            this._synth.setText(this._text());
            this._synth.requestPhonemes();
        };
        this.querySelector('#rgt-apply').addEventListener('click', applyFn);
        this.querySelector('#rgt-text').addEventListener('keydown', e => {
            if (e.key === 'Enter') applyFn();
        });

        /* Voice sliders */
        [[0,2],[1,2],[2,2],[4,2],[3,2]].forEach(([idx, dec]) => {
            const sl  = this.querySelector(`#rgt-sl-${idx}`);
            const val = this.querySelector(`#rgt-val-${idx}`);
            sl.addEventListener('input', () => {
                const v = parseFloat(sl.value);
                val.textContent = v.toFixed(dec);
                if (this._synth) this._synth.setParameter(idx, v);
            });
        });

        /* Pitch */
        const pitchSl  = this.querySelector('#rgt-pitch');
        const pitchVal = this.querySelector('#rgt-pitch-val');
        pitchSl.addEventListener('input', () => {
            pitchVal.textContent = pitchSl.value + ' ' + midiNoteName(parseInt(pitchSl.value));
        });

        /* Velocity */
        const velSl  = this.querySelector('#rgt-vel');
        const velVal = this.querySelector('#rgt-vel-val');
        velSl.addEventListener('input', () => { velVal.textContent = velSl.value; });

        /* Loop */
        this.querySelector('#rgt-loop').addEventListener('change', (e) => {
            if (this._synth) this._synth.setParameter(5, e.target.checked ? 1 : 0);
        });

        /* Speak / Stop */
        this.querySelector('#rgt-speak').addEventListener('click', () => {
            if (!this._synth) return;
            this._synth.noteOn(parseInt(pitchSl.value), parseInt(velSl.value));
        });
        this.querySelector('#rgt-stop').addEventListener('click', () => {
            if (this._synth) this._synth.stopAll();
        });
    }

    _showPhonemes(ph) {
        const el = this.querySelector('#rgt-phonemes');
        if (el) el.textContent = ph || '-';
    }
}

customElements.define('rgtalker-ui', RGTalkerUI);
