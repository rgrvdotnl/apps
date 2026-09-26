/**
 * Pattern Export Wrapper
 * Automatically uses WebAssembly version if available, falls back to JavaScript
 */

// Try to load WebAssembly version first, fallback to pure JavaScript
let useWasm = false;
let wasmModule = null;

// Pure JavaScript implementation (fallback)
class MIDIFileWriter {
    constructor(ticksPerQuarterNote = 480) {
        this.format = 0;
        this.numTracks = 1;
        this.division = ticksPerQuarterNote;
        this.events = [];
    }

    addNoteOn(timeTicks, channel, note, velocity) {
        if (channel > 15 || note > 127 || velocity > 127) {
            throw new Error('Invalid MIDI parameters');
        }
        this.events.push({
            time: timeTicks,
            type: 'noteOn',
            status: 0x90 | channel,
            data1: note,
            data2: velocity
        });
    }

    addNoteOff(timeTicks, channel, note, velocity = 64) {
        if (channel > 15 || note > 127 || velocity > 127) {
            throw new Error('Invalid MIDI parameters');
        }
        this.events.push({
            time: timeTicks,
            type: 'noteOff',
            status: 0x80 | channel,
            data1: note,
            data2: velocity
        });
    }

    addControlChange(timeTicks, channel, controller, value) {
        if (channel > 15 || controller > 127 || value > 127) {
            throw new Error('Invalid MIDI parameters');
        }
        this.events.push({
            time: timeTicks,
            type: 'cc',
            status: 0xB0 | channel,
            data1: controller,
            data2: value
        });
    }

    addTempo(timeTicks, microsecondsPerQuarterNote) {
        this.events.push({
            time: timeTicks,
            type: 'tempo',
            isMeta: true,
            metaType: 0x51,
            data: [
                (microsecondsPerQuarterNote >> 16) & 0xFF,
                (microsecondsPerQuarterNote >> 8) & 0xFF,
                microsecondsPerQuarterNote & 0xFF
            ]
        });
    }

    static bpmToTempo(bpm) {
        return Math.floor(60000000 / bpm);
    }

    _writeVarLen(value) {
        let buffer = value & 0x7F;
        const bytes = [];
        while (value >>= 7) {
            buffer <<= 8;
            buffer |= ((value & 0x7F) | 0x80);
        }
        while (true) {
            bytes.push(buffer & 0xFF);
            if (buffer & 0x80) {
                buffer >>= 8;
            } else {
                break;
            }
        }
        return bytes;
    }

    _writeBE32(value) {
        return [
            (value >> 24) & 0xFF,
            (value >> 16) & 0xFF,
            (value >> 8) & 0xFF,
            value & 0xFF
        ];
    }

    _writeBE16(value) {
        return [
            (value >> 8) & 0xFF,
            value & 0xFF
        ];
    }

    toBuffer() {
        this.events.sort((a, b) => a.time - b.time);
        let prevTime = 0;
        const eventsWithDeltas = this.events.map(evt => {
            const delta = evt.time - prevTime;
            prevTime = evt.time;
            return { ...evt, delta };
        });
        eventsWithDeltas.push({
            delta: 0,
            isMeta: true,
            metaType: 0x2F,
            data: []
        });
        const trackData = [];
        for (const evt of eventsWithDeltas) {
            trackData.push(...this._writeVarLen(evt.delta));
            if (evt.isMeta) {
                trackData.push(0xFF);
                trackData.push(evt.metaType);
                trackData.push(...this._writeVarLen(evt.data.length));
                trackData.push(...evt.data);
            } else {
                trackData.push(evt.status);
                trackData.push(evt.data1);
                trackData.push(evt.data2);
            }
        }
        const output = [];
        output.push(0x4D, 0x54, 0x68, 0x64);
        output.push(...this._writeBE32(6));
        output.push(...this._writeBE16(this.format));
        output.push(...this._writeBE16(this.numTracks));
        output.push(...this._writeBE16(this.division));
        output.push(0x4D, 0x54, 0x72, 0x6B);
        output.push(...this._writeBE32(trackData.length));
        output.push(...trackData);
        return new Uint8Array(output);
    }
}

class VolcaPatternWriter {
    constructor() {
        this.HEADER = 0x54535450;
        this.FOOTER = 0x44455450;
        this.DEVCODE = 0x33b8;
        this.NUM_PARTS = 10;
        this.NUM_STEPS = 16;
        this.NUM_PARAMS = 11;
        this.NUM_MOTION = 14;
        this.init();
    }

    init() {
        this.activeStep = 0xFFFF;
        this.parts = [];
        for (let i = 0; i < this.NUM_PARTS; i++) {
            this.parts.push({
                sampleNum: i,
                stepOn: 0,
                accent: 0,
                level: 127,
                params: [127, 64, 64, 0, 127, 64, 0, 127, 0, 127, 127],
                funcMemoryPart: 0,
                motion: Array(this.NUM_MOTION).fill(null).map(() => Array(this.NUM_STEPS).fill(0))
            });
        }
    }

    setStep(part, step, on) {
        if (part >= this.NUM_PARTS || step >= this.NUM_STEPS) {
            throw new Error('Invalid part or step');
        }
        if (on) {
            this.parts[part].stepOn |= (1 << step);
        } else {
            this.parts[part].stepOn &= ~(1 << step);
        }
    }

    setSample(part, sampleNum) {
        if (part >= this.NUM_PARTS || sampleNum > 99) {
            throw new Error('Invalid part or sample number');
        }
        this.parts[part].sampleNum = sampleNum;
    }

    setParam(part, paramId, value) {
        if (part >= this.NUM_PARTS || paramId >= this.NUM_PARAMS || value > 127) {
            throw new Error('Invalid parameters');
        }
        this.parts[part].params[paramId] = value;
    }

    setMotion(part, motionId, step, value) {
        if (part >= this.NUM_PARTS || motionId >= this.NUM_MOTION || step >= this.NUM_STEPS) {
            throw new Error('Invalid motion parameters');
        }
        this.parts[part].motion[motionId][step] = value;
    }

    setMotionEnable(part, enable) {
        if (part >= this.NUM_PARTS) {
            throw new Error('Invalid part');
        }
        if (enable) {
            this.parts[part].funcMemoryPart |= 0x01;
        } else {
            this.parts[part].funcMemoryPart &= ~0x01;
        }
    }

    setActiveSteps(activeStepBits) {
        if (activeStepBits === 0) {
            throw new Error('At least one step must be active');
        }
        this.activeStep = activeStepBits;
    }

    _writeLE32(value) {
        return [
            value & 0xFF,
            (value >> 8) & 0xFF,
            (value >> 16) & 0xFF,
            (value >> 24) & 0xFF
        ];
    }

    _writeLE16(value) {
        return [
            value & 0xFF,
            (value >> 8) & 0xFF
        ];
    }

    toBuffer() {
        const output = [];
        output.push(...this._writeLE32(this.HEADER));
        output.push(...this._writeLE16(this.DEVCODE));
        output.push(0, 0);
        output.push(...this._writeLE16(this.activeStep));
        for (let i = 0; i < 0x16; i++) {
            output.push(0);
        }
        for (const part of this.parts) {
            output.push(...this._writeLE16(part.sampleNum));
            output.push(...this._writeLE16(part.stepOn));
            output.push(...this._writeLE16(part.accent));
            output.push(...this._writeLE16(0));
            output.push(part.level);
            output.push(...part.params);
            output.push(part.funcMemoryPart);
            for (let i = 0; i < 11; i++) {
                output.push(0);
            }
            for (let m = 0; m < this.NUM_MOTION; m++) {
                for (let s = 0; s < this.NUM_STEPS; s++) {
                    output.push(part.motion[m][s]);
                }
            }
        }
        for (let i = 0; i < 0x1c; i++) {
            output.push(0);
        }
        output.push(...this._writeLE32(this.FOOTER));
        return new Uint8Array(output);
    }
}

// Export based on what's available
export { MIDIFileWriter, VolcaPatternWriter };
