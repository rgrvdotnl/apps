/*
 * Read a logue unit's header and parameter descriptors.
 *
 * The header struct is the fixed part at +0x00, then one 32-byte descriptor
 * per parameter at +0x38: four int16 (min, max, center, init), the type byte,
 * the fraction byte, and a 22-byte name at +10.
 *
 * A unit file carries it in the ELF's .unit_header section. A device answers
 * a slot status with the header struct alone, so both shapes are accepted.
 */

import { parseUnitHeader, sectionOffset } from './vendor/logue.js';

function headerOffset(bytes) {
    if (parseUnitHeader(bytes, 0)) return 0;
    const at = sectionOffset(bytes, '.unit_header');
    return at === -1 ? -1 : at;
}

export function readParams(bytes) {
    const at = headerOffset(bytes);
    if (at < 0) return null;
    const header = parseUnitHeader(bytes, at);
    if (!header) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset + at,
                              header.headerSize);
    const params = [];
    for (let i = 0; i < header.numParams; i++) {
        const p = 0x38 + i * 32;
        let name = '';
        for (let c = 0; c < 22; c++) {
            const ch = view.getUint8(p + 10 + c);
            if (!ch) break;
            name += String.fromCharCode(ch);
        }
        params.push({
            index: i,
            min: view.getInt16(p, true),
            max: view.getInt16(p + 2, true),
            center: view.getInt16(p + 4, true),
            init: view.getInt16(p + 6, true),
            type: view.getUint8(p + 8),
            fraction: view.getUint8(p + 9),
            name: name.trim(),
        });
    }
    return { header, params };
}
