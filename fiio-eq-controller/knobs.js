/* ============================================================
   TONE KNOB
   A bipolar rotary knob styled after the Regroove pad knobs:
   circular track, 3px accent indicator sweeping -135deg..+135deg,
   where 0 dB points straight up.
   ============================================================ */

(function () {
    'use strict';

    const SWEEP = 135;          // degrees either side of centre
    const DRAG_RANGE = 180;     // px of vertical travel for the full sweep

    class ToneKnob extends HTMLElement {
        static get observedAttributes() {
            return ['value', 'label'];
        }

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this.dragging = false;
            this.moved = false;
            this.startY = 0;
            this.startValue = 0;
        }

        get min() { return parseFloat(this.getAttribute('min') ?? '-12'); }
        get max() { return parseFloat(this.getAttribute('max') ?? '12'); }
        get value() { return parseFloat(this.getAttribute('value') ?? '0'); }

        set value(v) {
            const clamped = Math.min(this.max, Math.max(this.min, v));
            this.setAttribute('value', String(Math.round(clamped * 10) / 10));
        }

        connectedCallback() {
            if (!this.shadowRoot.firstChild) this.render();
            this.paint();
            this.wire();
        }

        attributeChangedCallback() {
            if (this.shadowRoot.firstChild) this.paint();
        }

        render() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: flex; flex-direction: column; align-items: center;
                        gap: 10px; width: 100%; box-sizing: border-box;
                        user-select: none; -webkit-user-select: none;
                        touch-action: none; min-width: 0;
                    }
                    .knob-label {
                        font-size: 0.8em; font-weight: bold; color: #d0d0d0;
                        text-transform: uppercase; letter-spacing: 2px;
                        line-height: 1; height: 1em;
                    }
                    /* Fixed square, never sized from the text below it. */
                    .knob-container {
                        position: relative;
                        width: var(--knob-size, 140px);
                        height: var(--knob-size, 140px);
                        flex: 0 0 auto;
                        cursor: ns-resize;
                    }
                    .knob-face {
                        position: absolute; inset: 0; border-radius: 50%;
                        background: #1a1a1a; border: 2px solid #333;
                    }
                    .knob-indicator {
                        position: absolute; top: 10%; left: 50%; width: 3px; height: 40%;
                        background: #CF1A37; border-radius: 2px;
                        transform-origin: bottom center; transform: translateX(-50%);
                        transition: transform 0.05s linear;
                    }
                    .knob-cap {
                        position: absolute; inset: 30%; border-radius: 50%;
                        background: #2a2a2a;
                    }
                    /* Fixed width and tabular figures, so a value gaining a minus
                       sign or a second digit cannot reflow anything. */
                    .knob-value {
                        width: 84px; box-sizing: border-box;
                        font-size: 0.9em; font-weight: bold; color: #0066FF;
                        background: #0a0a0a; border-radius: 4px; padding: 3px 0;
                        text-align: center; letter-spacing: 1px;
                        font-variant-numeric: tabular-nums;
                    }
                    :host([killed]) .knob-indicator { background: #666; }
                    :host([killed]) .knob-value { color: #CF1A37; }
                </style>
                <div class="knob-label"></div>
                <div class="knob-container">
                    <div class="knob-face"></div>
                    <div class="knob-indicator"></div>
                    <div class="knob-cap"></div>
                </div>
                <div class="knob-value"></div>`;

            this.labelEl = this.shadowRoot.querySelector('.knob-label');
            this.indicator = this.shadowRoot.querySelector('.knob-indicator');
            this.valueEl = this.shadowRoot.querySelector('.knob-value');
            this.container = this.shadowRoot.querySelector('.knob-container');
        }

        paint() {
            const pct = (this.value - this.min) / (this.max - this.min);
            const rot = pct * (SWEEP * 2) - SWEEP;
            this.indicator.style.transform = `translateX(-50%) rotate(${rot}deg)`;

            const v = this.value;
            this.valueEl.textContent = `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
            this.labelEl.textContent = this.getAttribute('label') || '';
        }

        emit(kind) {
            this.dispatchEvent(new CustomEvent(kind, {
                detail: { value: this.value },
                bubbles: true,
                composed: true,
            }));
        }

        wire() {
            const onDown = (e) => {
                this.dragging = true;
                this.moved = false;
                this.startY = e.clientY;
                this.startValue = this.value;
                this.container.setPointerCapture?.(e.pointerId);
                e.preventDefault();
            };

            const onMove = (e) => {
                if (!this.dragging) return;
                e.preventDefault();
                this.moved = true;
                const span = this.max - this.min;
                const delta = ((this.startY - e.clientY) / DRAG_RANGE) * span;
                // Shift = fine adjust
                this.value = this.startValue + (e.shiftKey ? delta / 5 : delta);
                this.emit('knob-input');
            };

            const onUp = () => {
                if (!this.dragging) return;
                this.dragging = false;
                if (this.moved) this.emit('knob-change');
            };

            this.container.addEventListener('pointerdown', onDown);
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);

            this.container.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = e.shiftKey ? 0.1 : 0.5;
                this.value = this.value + (e.deltaY < 0 ? step : -step);
                this.emit('knob-input');
                this.emit('knob-change');
            }, { passive: false });

            // Double-click = back to centre, the DJ-mixer convention.
            this.container.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.value = 0;
                this.emit('knob-input');
                this.emit('knob-change');
            });

            this.container.tabIndex = 0;
            this.container.addEventListener('keydown', (e) => {
                const step = e.shiftKey ? 0.1 : 0.5;
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') this.value = this.value + step;
                else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') this.value = this.value - step;
                else if (e.key === 'Home' || e.key === '0') this.value = 0;
                else return;
                e.preventDefault();
                this.emit('knob-input');
                this.emit('knob-change');
            });
        }
    }

    customElements.define('tone-knob', ToneKnob);
})();
