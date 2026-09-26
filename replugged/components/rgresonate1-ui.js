/**
 * RGResonate1 Synth UI Component
 * UI for RS1 Resonant Synthesizer with preset loading and operator graph visualization
 */

import { rs1PresetsData } from '../../data/rsx/presets_data.js';
import { rs1Presets, base64ToBytes } from '../../data/rsx/presets.js';

class RGResonate1UI extends HTMLElement {
    constructor() {
        super();
        this.synthInstance = null;
        this.currentPreset = null;
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
        this.setupWorkletMessageListener();
        // DON'T auto-load preset - let default from C code work
        // this.loadPreset('default');
    }

    set synth(instance) {
        this.synthInstance = instance;
        this.setupWorkletMessageListener();
        // Load default preset when synth is ready
        setTimeout(() => {
            this.loadPreset('default');
        }, 100);
    }

    setupWorkletMessageListener() {
        if (!this.synthInstance || !this.synthInstance.workletNode) return;

        // Store the original onmessage handler
        const originalHandler = this.synthInstance.workletNode.port.onmessage;

        // Chain our handler with the original
        this.synthInstance.workletNode.port.onmessage = (event) => {
            // Call original handler first if it exists
            if (originalHandler) {
                originalHandler.call(this.synthInstance.workletNode.port, event);
            }

            // Then handle our specific messages
            const { type, error, presetData } = event.data;

            if (type === 'rs1LoadSuccess') {
                if (presetData) {
                    this.currentPreset = presetData;
                    const infoEl = this.querySelector('#presetInfo');
                    if (infoEl) {
                        infoEl.innerHTML = `<strong>${presetData.name}</strong> - Master Volume: ${presetData.masterVolume.toFixed(2)} - ${presetData.operators.length} operators`;
                    }
                    this.drawOperatorGraph(presetData.operators);
                    console.log(`[RS1 UI] Preset loaded: ${presetData.name}`);
                }
            } else if (type === 'rs1LoadError') {
                console.error('[RS1 UI] Error loading preset:', error);
            }
        };
    }

    render() {
        this.innerHTML = `
            <style>
                .rgresonate1-container {
                    padding: 20px;
                    background: #1a1a1a;
                    border-radius: 8px;
                    color: #fff;
                    font-family: 'Segoe UI', sans-serif;
                }

                .rgresonate1-header {
                    font-size: 20px;
                    font-weight: bold;
                    color: #CF1A37;
                    margin: 0 0 20px 0;
                    letter-spacing: 1px;
                }

                .preset-section {
                    margin-bottom: 20px;
                    padding: 15px;
                    background: #0f0f0f;
                    border: 1px solid #2a2a2a;
                    border-radius: 4px;
                }

                .preset-section h3 {
                    margin: 0 0 10px 0;
                    font-size: 14px;
                    color: #CF1A37;
                    text-transform: uppercase;
                }

                .preset-controls {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }

                .preset-controls select {
                    flex: 1;
                    background: #333;
                    color: #fff;
                    border: 1px solid #CF1A37;
                    padding: 8px;
                    border-radius: 4px;
                    font-size: 12px;
                }

                .preset-controls button {
                    padding: 8px 16px;
                    background: #CF1A37;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                }

                .preset-controls button:hover {
                    background: #e61a3f;
                }

                .graph-section {
                    margin-bottom: 20px;
                }

                .graph-section h3 {
                    margin: 0 0 10px 0;
                    font-size: 14px;
                    color: #CF1A37;
                    text-transform: uppercase;
                }

                #operatorGraph {
                    width: 100%;
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 4px;
                }

                .preset-info {
                    font-size: 11px;
                    color: #888;
                    margin-top: 10px;
                }

                .preset-info strong {
                    color: #CF1A37;
                }
            </style>

            <div class="rgresonate1-container">
                <h2 class="rgresonate1-header">RS1 - Resonant Synthesizer</h2>

                <div class="preset-section">
                    <h3>Preset</h3>
                    <div class="preset-controls">
                        <select id="presetSelector">
                            <optgroup label="Synth Presets">
                                <option value="default">Default</option>
                                <option value="bell">Bell</option>
                                <option value="lead">Lead</option>
                                <option value="supersaw">Supersaw</option>
                                <option value="bass">Bass</option>
                                <option value="pad">Pad</option>
                            </optgroup>
                            <optgroup label="Drum Presets">
                                <option value="kick">Kick</option>
                                <option value="snare">Snare</option>
                                <option value="closedhat">Closed Hat</option>
                                <option value="openhat">Open Hat</option>
                                <option value="clap">Clap</option>
                                <option value="tom">Tom</option>
                            </optgroup>
                        </select>
                        <button id="loadPresetBtn">Load</button>
                        <button id="loadRS1FileBtn">📂 Load .rs1</button>
                    </div>
                    <div class="preset-info" id="presetInfo">
                        <strong>Default</strong> - Master Volume: 0.60 - 2 operators
                    </div>
                    <input type="file" id="rs1FileInput" accept=".rs1" style="display: none;">
                </div>

                <div class="graph-section">
                    <h3>Operator Graph</h3>
                    <svg id="operatorGraph" width="800" height="300"></svg>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const loadBtn = this.querySelector('#loadPresetBtn');
        const selector = this.querySelector('#presetSelector');
        const loadRS1FileBtn = this.querySelector('#loadRS1FileBtn');
        const rs1FileInput = this.querySelector('#rs1FileInput');

        if (loadBtn) {
            loadBtn.addEventListener('click', () => {
                const presetKey = selector.value;
                this.loadPreset(presetKey);
            });
        }

        // Don't auto-load on dropdown change - only load when button is clicked

        if (loadRS1FileBtn && rs1FileInput) {
            loadRS1FileBtn.addEventListener('click', () => {
                rs1FileInput.click();
            });

            rs1FileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                await this.loadRS1File(file);
                // Clear the input so the same file can be loaded again
                rs1FileInput.value = '';
            });
        }
    }

    loadPreset(presetKey) {
        const presetData = rs1PresetsData[presetKey];
        if (!presetData) {
            console.error(`Preset ${presetKey} not found`);
            return;
        }

        this.currentPreset = presetData;

        // Update info
        const infoEl = this.querySelector('#presetInfo');
        if (infoEl) {
            infoEl.innerHTML = `<strong>${presetData.name}</strong> - Master Volume: ${presetData.masterVolume.toFixed(2)} - ${presetData.operators.length} operators`;
        }

        // Update graph
        this.drawOperatorGraph(presetData.operators);

        // Send binary .rs1 preset to WASM synth
        if (this.synthInstance && this.synthInstance.workletNode) {
            const binaryPreset = rs1Presets[presetKey];
            if (binaryPreset) {
                const bytes = base64ToBytes(binaryPreset);
                this.synthInstance.workletNode.port.postMessage({
                    type: 'loadRS1Binary',
                    data: { bytes: bytes }
                });
            } else {
                console.error(`[RS1 UI] Binary preset not found for: ${presetKey}`);
            }
        } else {
            console.warn('[RS1 UI] Synth not initialized, cannot load preset');
        }
    }

    async loadRS1File(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);

            // Send to WASM synth via worklet
            if (this.synthInstance && this.synthInstance.workletNode) {
                this.synthInstance.workletNode.port.postMessage({
                    type: 'loadRS1Binary',
                    data: {
                        bytes: data,
                        fileName: file.name
                    }
                });

                // Update info
                const infoEl = this.querySelector('#presetInfo');
                if (infoEl) {
                    infoEl.innerHTML = `<strong>${file.name}</strong> - Loaded from file (${data.length} bytes)`;
                }

                // Clear graph since we don't know the structure
                const svg = this.querySelector('#operatorGraph');
                if (svg) {
                    svg.innerHTML = '';
                    svg.setAttribute('height', 150);
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', 400);
                    text.setAttribute('y', 75);
                    text.setAttribute('fill', '#CF1A37');
                    text.setAttribute('font-size', '14');
                    text.setAttribute('font-family', 'monospace');
                    text.setAttribute('text-anchor', 'middle');
                    text.textContent = `Loaded: ${file.name}`;
                    svg.appendChild(text);
                }

                console.log(`[RS1 UI] Sent .rs1 file to WASM synth (${data.length} bytes)`);
            } else {
                console.error('[RS1 UI] Synth not initialized');
            }

        } catch (error) {
            console.error('[RS1 UI] Error loading .rs1 file:', error);
        }
    }

    drawOperatorGraph(operators) {
        const svg = this.querySelector('#operatorGraph');
        if (!svg) return;

        if (!operators || operators.length === 0) {
            svg.innerHTML = '<text x="400" y="75" fill="#CF1A37" font-size="14" text-anchor="middle">No operators to display</text>';
            return;
        }

        const width = 800;
        svg.innerHTML = '';
        svg.setAttribute('width', width);

        if (!operators || operators.length === 0) {
            const minHeight = 150;
            svg.setAttribute('height', minHeight);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', width / 2);
            text.setAttribute('y', minHeight / 2);
            text.setAttribute('fill', '#666');
            text.setAttribute('font-size', '16');
            text.setAttribute('font-family', 'monospace');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = 'No operators';
            svg.appendChild(text);
            return;
        }

        // Operator type info
        const opTypeInfo = {
            'RSX_OP_SINE': { name: 'Sine', hasFreq: true, hasParams: false, isModifier: false },
            'RSX_OP_SAW': { name: 'Saw', hasFreq: true, hasParams: false, isModifier: false },
            'RSX_OP_SQUARE': { name: 'Square', hasFreq: true, hasParams: true, param: 'pulse_width', isModifier: false },
            'RSX_OP_TRIANGLE': { name: 'Triangle', hasFreq: true, hasParams: false, isModifier: false },
            'RSX_OP_NOISE': { name: 'Noise', hasFreq: false, hasParams: false, isModifier: false },
            'RSX_OP_FILTER_LP': { name: 'LP Filter', hasFreq: false, hasParams: true, param: 'filter', isModifier: true },
            'RSX_OP_FILTER_HP': { name: 'HP Filter', hasFreq: false, hasParams: true, param: 'filter', isModifier: true },
            'RSX_OP_RESONATOR': { name: 'Resonator', hasFreq: true, hasParams: true, param: 'resonator', isModifier: false }
        };

        // Draw legend at top (horizontal layout)
        const legendY = 15;
        const legendItems = [
            { label: 'Source', stroke: '#4a4aff' },
            { label: 'Mixer', stroke: '#ff4a4a' },
            { label: 'Filter', stroke: '#4aff4a' },
            { label: 'Output', stroke: '#ffaa00' }
        ];

        let legendX = 50;
        legendItems.forEach((item, i) => {
            // Box
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', legendX);
            rect.setAttribute('y', legendY);
            rect.setAttribute('width', 16);
            rect.setAttribute('height', 16);
            rect.setAttribute('fill', 'none');
            rect.setAttribute('stroke', item.stroke);
            rect.setAttribute('stroke-width', item.label === 'Output' ? '3' : '2');
            svg.appendChild(rect);

            // Label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', legendX + 24);
            text.setAttribute('y', legendY + 12);
            text.setAttribute('fill', '#aaa');
            text.setAttribute('font-size', '11');
            text.setAttribute('font-family', 'monospace');
            text.textContent = item.label;
            svg.appendChild(text);

            legendX += 100;
        });

        // Calculate layout
        const boxWidth = 140;
        const boxHeight = 80;
        const colSpacing = 180;
        const rowSpacing = 40;
        const startX = 50;
        const startY = 50;

        // Organize operators into columns by dependency
        const opLevels = new Array(operators.length).fill(-1);

        const calculateLevel = (idx) => {
            if (opLevels[idx] !== -1) return opLevels[idx];
            const op = operators[idx];
            if (op.inputOp === -1) {
                opLevels[idx] = 0;
                return 0;
            }
            opLevels[idx] = calculateLevel(op.inputOp) + 1;
            return opLevels[idx];
        };

        operators.forEach((op, idx) => calculateLevel(idx));

        // Group operators by level
        const maxLevel = Math.max(...opLevels);
        const columns = [];
        for (let level = 0; level <= maxLevel; level++) {
            columns[level] = [];
        }
        operators.forEach((op, idx) => {
            const level = opLevels[idx];
            if (!columns[level]) {
                columns[level] = [];
            }
            columns[level].push(idx);
        });

        // Calculate positions
        const opPositions = [];
        let maxOpY = startY;
        for (let colIdx = 0; colIdx <= maxLevel; colIdx++) {
            const col = columns[colIdx];
            if (!col) continue;
            col.forEach((opIdx, rowIdx) => {
                const y = startY + rowIdx * (boxHeight + rowSpacing);
                opPositions[opIdx] = {
                    x: startX + colIdx * colSpacing,
                    y: y
                };
                maxOpY = Math.max(maxOpY, y + boxHeight);
            });
        }

        // Find output operators
        const outputOps = [];
        operators.forEach((op, idx) => {
            const isUsedAsInput = operators.some(o => o.inputOp === idx);
            if (!isUsedAsInput) {
                outputOps.push(idx);
            }
        });

        // Output block position
        const outputX = startX + (maxLevel + 1) * colSpacing + 30;
        const outputY = startY + 10;
        const outputWidth = 120;
        const outputHeight = 60;

        // Calculate final SVG height
        const graphHeight = Math.max(maxOpY, outputY + outputHeight) + 20;
        svg.setAttribute('height', graphHeight);

        // Draw connections first (behind boxes)
        operators.forEach((op, idx) => {
            if (op.inputOp >= 0 && op.inputOp < operators.length) {
                const fromPos = opPositions[op.inputOp];
                const toPos = opPositions[idx];
                if (!fromPos || !toPos) return;
                const fromX = fromPos.x + boxWidth;
                const fromY = fromPos.y + boxHeight / 2;
                const toX = toPos.x;
                const toY = toPos.y + boxHeight / 2;

                // Line
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', fromX);
                line.setAttribute('y1', fromY);
                line.setAttribute('x2', toX);
                line.setAttribute('y2', toY);
                line.setAttribute('stroke', '#CF1A37');
                line.setAttribute('stroke-width', '2');
                svg.appendChild(line);

                // Arrow head
                const angle = Math.atan2(toY - fromY, toX - fromX);
                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const points = [
                    [toX, toY],
                    [toX - 10 * Math.cos(angle - 0.3), toY - 10 * Math.sin(angle - 0.3)],
                    [toX - 10 * Math.cos(angle + 0.3), toY - 10 * Math.sin(angle + 0.3)]
                ].map(p => p.join(',')).join(' ');
                arrow.setAttribute('points', points);
                arrow.setAttribute('fill', '#CF1A37');
                svg.appendChild(arrow);
            }
        });

        // Connections to output block
        outputOps.forEach((opIdx) => {
            const fromPos = opPositions[opIdx];
            if (!fromPos) return;
            const fromX = fromPos.x + boxWidth;
            const fromY = fromPos.y + boxHeight / 2;
            const toX = outputX;
            const toY = outputY + outputHeight / 2;

            // Line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', fromX);
            line.setAttribute('y1', fromY);
            line.setAttribute('x2', toX);
            line.setAttribute('y2', toY);
            line.setAttribute('stroke', '#ffaa00');
            line.setAttribute('stroke-width', '3');
            svg.appendChild(line);

            // Arrow head
            const angle = Math.atan2(toY - fromY, toX - fromX);
            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const points = [
                [toX, toY],
                [toX - 10 * Math.cos(angle - 0.3), toY - 10 * Math.sin(angle - 0.3)],
                [toX - 10 * Math.cos(angle + 0.3), toY - 10 * Math.sin(angle + 0.3)]
            ].map(p => p.join(',')).join(' ');
            arrow.setAttribute('points', points);
            arrow.setAttribute('fill', '#ffaa00');
            svg.appendChild(arrow);
        });

        // Draw operator boxes
        operators.forEach((op, idx) => {
            const pos = opPositions[idx];
            const x = pos.x;
            const y = pos.y;

            const opType = opTypeInfo[op.type];
            const isSource = op.inputOp === -1;
            const isModifier = opType && opType.isModifier;

            // Create group for operator
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

            // Box background
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', boxWidth);
            rect.setAttribute('height', boxHeight);
            rect.setAttribute('fill', isModifier ? '#1a3a1a' : (isSource ? '#1a1a2a' : '#2a1a1a'));
            rect.setAttribute('stroke', isSource ? '#4a4aff' : (isModifier ? '#4aff4a' : '#ff4a4a'));
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('rx', '4');
            group.appendChild(rect);

            // Op number
            const opNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            opNum.setAttribute('x', x + 8);
            opNum.setAttribute('y', y + 20);
            opNum.setAttribute('fill', '#fff');
            opNum.setAttribute('font-size', '14');
            opNum.setAttribute('font-weight', 'bold');
            opNum.setAttribute('font-family', 'monospace');
            opNum.textContent = `Operator ${idx + 1}`;
            group.appendChild(opNum);

            // Op type
            const opTypeName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            opTypeName.setAttribute('x', x + 8);
            opTypeName.setAttribute('y', y + 38);
            opTypeName.setAttribute('fill', '#CF1A37');
            opTypeName.setAttribute('font-size', '12');
            opTypeName.setAttribute('font-family', 'monospace');
            opTypeName.textContent = opType ? opType.name : 'Unknown';
            group.appendChild(opTypeName);

            // Frequency or params
            if (opType && opType.hasFreq) {
                const freqText = op.fixedPitch ? `${op.frequency.toFixed(0)}Hz` : `${op.frequency >= 0 ? '+' : ''}${op.frequency.toFixed(1)}st`;
                const freq = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                freq.setAttribute('x', x + 8);
                freq.setAttribute('y', y + 52);
                freq.setAttribute('fill', '#aaa');
                freq.setAttribute('font-size', '10');
                freq.setAttribute('font-family', 'monospace');
                freq.textContent = freqText;
                group.appendChild(freq);
            } else if (opType && opType.param === 'resonator') {
                const q = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                q.setAttribute('x', x + 8);
                q.setAttribute('y', y + 52);
                q.setAttribute('fill', '#aaa');
                q.setAttribute('font-size', '10');
                q.setAttribute('font-family', 'monospace');
                q.textContent = `Q=${op.params.resonatorResonance.toFixed(1)}`;
                group.appendChild(q);
            } else if (opType && opType.param === 'filter') {
                const cut = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                cut.setAttribute('x', x + 8);
                cut.setAttribute('y', y + 52);
                cut.setAttribute('fill', '#aaa');
                cut.setAttribute('font-size', '10');
                cut.setAttribute('font-family', 'monospace');
                cut.textContent = `Cut=${op.params.filterCutoff.toFixed(2)}`;
                group.appendChild(cut);
            }

            // Level
            const level = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            level.setAttribute('x', x + 8);
            level.setAttribute('y', y + 66);
            level.setAttribute('fill', '#aaa');
            level.setAttribute('font-size', '10');
            level.setAttribute('font-family', 'monospace');
            level.textContent = `Lvl=${op.level.toFixed(2)}`;
            group.appendChild(level);

            svg.appendChild(group);
        });

        // Draw output box
        const outputGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const outputRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        outputRect.setAttribute('x', outputX);
        outputRect.setAttribute('y', outputY);
        outputRect.setAttribute('width', outputWidth);
        outputRect.setAttribute('height', outputHeight);
        outputRect.setAttribute('fill', '#2a2a1a');
        outputRect.setAttribute('stroke', '#ffaa00');
        outputRect.setAttribute('stroke-width', '3');
        outputRect.setAttribute('rx', '4');
        outputGroup.appendChild(outputRect);

        const outputText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        outputText.setAttribute('x', outputX + outputWidth / 2);
        outputText.setAttribute('y', outputY + 25);
        outputText.setAttribute('fill', '#fff');
        outputText.setAttribute('font-size', '14');
        outputText.setAttribute('font-weight', 'bold');
        outputText.setAttribute('font-family', 'monospace');
        outputText.setAttribute('text-anchor', 'middle');
        outputText.textContent = 'OUTPUT';
        outputGroup.appendChild(outputText);

        const volumeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        volumeText.setAttribute('x', outputX + outputWidth / 2);
        volumeText.setAttribute('y', outputY + 45);
        volumeText.setAttribute('fill', '#aaa');
        volumeText.setAttribute('font-size', '10');
        volumeText.setAttribute('font-family', 'monospace');
        volumeText.setAttribute('text-anchor', 'middle');
        volumeText.textContent = `Vol=${this.currentPreset.masterVolume.toFixed(2)}`;
        outputGroup.appendChild(volumeText);

        svg.appendChild(outputGroup);
    }
}

customElements.define('rgresonate1-ui', RGResonate1UI);

export { RGResonate1UI };
