// RGWShape UI: 01/W-style Waveshaping Bass Synthesizer

class RGWShapeUI extends HTMLElement {
    constructor() {
        super();
        this.synth = null;
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() { this.render(); this.setupListeners(); }

    setSynth(synth) {
        this.synth = synth;
        this.shadowRoot.querySelectorAll('[data-param]').forEach(el => {
            this.synth?.setParameter(+el.dataset.param, +el.value);
        });
    }

    setSequencer() {}

    setupListeners() {
        const root = this.shadowRoot;

        root.querySelectorAll('[data-param]').forEach(el => {
            el.addEventListener('input', () => {
                const v = +el.value;
                const disp = root.getElementById(`v${el.dataset.param}`);
                if (disp) disp.textContent = v.toFixed(+(el.dataset.fmt || 2));
                this.synth?.setParameter(+el.dataset.param, v);
            });
        });

        root.querySelectorAll('[data-shape]').forEach(btn => {
            btn.addEventListener('click', () => {
                root.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.synth?.setParameter(0, +btn.dataset.shape);
            });
        });
    }

    _slider(id, label, min, max, def, fmt = '2') {
        return `<div class="ctrl">
          <label>${label}</label>
          <input type="range" data-param="${id}" data-fmt="${fmt}"
                 min="${min}" max="${max}" step="${(max - min) / 200}" value="${def}">
          <span class="val" id="v${id}">${Number(def).toFixed(+fmt)}</span>
        </div>`;
    }

    render() {
        this.shadowRoot.innerHTML = `
<style>
  :host { display:block; background:#141414; border:1px solid #222; border-radius:8px; padding:16px; color:#ddd; font:13px/1.4 system-ui,sans-serif; }
  h3 { margin:0 0 12px; font-size:13px; color:#e05; text-transform:uppercase; letter-spacing:2px; }
  .shapes { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; }
  .shape-btn { padding:5px 10px; font-size:11px; background:#1a1a1a; border:1px solid #333; color:#aaa; cursor:pointer; border-radius:3px; }
  .shape-btn.active { background:#e05; border-color:#e05; color:#fff; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:10px; }
  .section { background:#0d0d0d; border:1px solid #222; border-radius:4px; padding:10px; }
  .sec-title { font-size:10px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .ctrl { margin-bottom:6px; } .ctrl:last-child { margin-bottom:0; }
  label { display:block; font-size:10px; color:#888; margin-bottom:1px; }
  input[type=range] { width:100%; accent-color:#e05; }
  .val { font-size:10px; color:#e05; }
</style>

<h3>RGWShape: 01/W Bass</h3>

<div class="shapes">
  <button class="shape-btn" data-shape="0">Sine</button>
  <button class="shape-btn" data-shape="1">Cheb3</button>
  <button class="shape-btn active" data-shape="2">Cheb35</button>
  <button class="shape-btn" data-shape="3">ODD</button>
  <button class="shape-btn" data-shape="4">Fold</button>
  <button class="shape-btn" data-shape="5">Freq3</button>
</div>

<div class="grid">
  <div class="section">
    <div class="sec-title">Drive</div>
    ${this._slider(1,  'Base',      0, 1,    0.0)}
    ${this._slider(2,  'Env Amt',   0, 1,    1.0)}
    ${this._slider(3,  'Sub Lvl',   0, 1,    0.0)}
    ${this._slider(4,  'Sub Ratio', 0, 3,    0.5)}
  </div>
  <div class="section">
    <div class="sec-title">Drive Envelope</div>
    ${this._slider(17, 'ST',  0, 1,   1.0)}
    ${this._slider(18, 'A',   0, 1,   0.0)}
    ${this._slider(19, 'H',   0, 0.5, 0.0)}
    ${this._slider(20, 'D',   0, 2,   0.35)}
    ${this._slider(21, 'S',   0, 1,   0.2)}
    ${this._slider(22, 'R',   0, 1,   0.1)}
  </div>
  <div class="section">
    <div class="sec-title">Filter</div>
    ${this._slider(7,  'Cutoff',    0, 1, 0.95)}
    ${this._slider(8,  'Resonance', 0, 1, 0.05)}
    ${this._slider(9,  'Env Amt',   0, 1, 0.0)}
    ${this._slider(26, 'F-D',       0, 1, 0.18)}
    ${this._slider(27, 'F-S',       0, 1, 0.2)}
  </div>
  <div class="section">
    <div class="sec-title">Amp Envelope</div>
    ${this._slider(11, 'ST', 0, 1,  0.49)}
    ${this._slider(12, 'A',  0, 2,  0.03)}
    ${this._slider(13, 'D',  0, 10, 10.0, '1')}
    ${this._slider(14, 'S',  0, 1,  0.99)}
    ${this._slider(15, 'R',  0, 2,  0.15)}
  </div>
</div>`;
    }
}

customElements.define('rgwshape-ui', RGWShapeUI);
export default RGWShapeUI;
