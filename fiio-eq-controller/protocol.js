/* ============================================================
   SNOWSKY TINY A - PROTOCOL
   Reverse-engineered from the FiiO web control bundle and
   verified against the device (2972:0147) over HID.

   Transport : WebHID, report ID 7, 64-byte input reports
   Frame     : [cmd, mod, seqHi, seqLo, addr, len, ...payload, crc, 0xEE]
   Commands  : GET = 0xBB/0x0B, SET = 0xAA/0x0A
   ============================================================ */

(function (global) {
'use strict';

    const REPORT_ID = 7;
    const VENDOR_ID = 0x2972;
    const PRODUCT_ID = 0x0147;

    const CMD = { SET: 0xaa, GET: 0xbb };
    const MOD = { SET: 0x0a, GET: 0x0b };

    /* Address map. Note which ones the SNOWSKY TINY A actually implements —
       probed on hardware: 25, 26 and 27 never answer (the device returns a NACK
       with cmd 0x00 / mod 0xEE and the rest of the buffer left stale), so they
       must be treated as fire-and-forget, and an unreadable value can never be
       displayed. In particular there is NO save command: writing into the
       currently selected USER slot is what stores a curve. */
    const ADDR = {
        PEQ_PARAMS: 21,     // read + write
        PEQ_PRE: 22,        // read + write
        GLOBAL_GAIN: 23,    // read + write
        PEQ_COUNT: 24,      // read
        PEQ_SAVE: 25,       // NOT IMPLEMENTED on TINY A
        PEQ_SWITCH: 26,     // NOT IMPLEMENTED on TINY A (write-only at best)
        RESET_PRE: 27,      // NOT IMPLEMENTED on TINY A
        PEQ_NAME: 48,       // write; reads are unreliable (stale buffer)
        FIRMWARE: 11,       // read
    };

    /* Addresses that never produce a valid reply. */
    const NO_REPLY_ADDRS = [25, 26, 27];

    const FILTERS = [
        'PEAK', 'LOW_SHELF', 'HIGH_SHELF', 'BAND_PASS',
        'LOW_PASS', 'HIGH_PASS', 'ALL_PASS',
    ];

    const PRESETS = [
        { label: 'Jazz', value: 0 },
        { label: 'Pop', value: 1 },
        { label: 'Rock', value: 2 },
        { label: 'Dance', value: 3 },
        { label: 'R&B', value: 4 },
        { label: 'Classic', value: 5 },
        { label: 'Hip-Hop', value: 6 },
        { label: 'USER 1', value: 160 },
        { label: 'USER 2', value: 161 },
        { label: 'USER 3', value: 162 },
        { label: 'Off', value: 240 },
    ];

    const LIMITS = {
        freq: { min: 20, max: 20000 },
        gain: { min: -12, max: 12 },   // SNOWSKY TINY A
        q: { min: 0.25, max: 8 },
    };

    /* CRC-8 used by the FiiO "ut" protocol. */
    const CRC = [
        0, 94, 188, 226, 97, 63, 221, 131, 194, 156, 126, 32, 163, 253, 31, 65,
        157, 195, 33, 127, 252, 162, 64, 30, 95, 1, 227, 189, 62, 96, 130, 220,
        35, 125, 159, 193, 66, 28, 254, 160, 225, 191, 93, 3, 128, 222, 60, 98,
        190, 224, 2, 92, 223, 129, 99, 61, 124, 34, 192, 158, 29, 67, 161, 255,
        70, 24, 250, 164, 39, 121, 155, 197, 132, 218, 56, 102, 229, 187, 89, 7,
        219, 133, 103, 57, 186, 228, 6, 88, 25, 71, 165, 251, 120, 38, 196, 154,
        101, 59, 217, 135, 4, 90, 184, 230, 167, 249, 27, 69, 198, 152, 122, 36,
        248, 166, 68, 26, 153, 199, 37, 123, 58, 100, 134, 216, 91, 5, 231, 185,
        140, 210, 48, 110, 237, 179, 81, 15, 78, 16, 242, 172, 47, 113, 147, 205,
        17, 79, 173, 243, 112, 46, 204, 146, 211, 141, 111, 49, 178, 236, 14, 80,
        175, 241, 19, 77, 206, 144, 114, 44, 109, 51, 209, 143, 12, 82, 176, 238,
        50, 108, 142, 208, 83, 13, 239, 177, 240, 174, 76, 18, 145, 207, 45, 115,
        202, 148, 118, 40, 171, 245, 23, 73, 8, 86, 180, 234, 105, 55, 213, 139,
        87, 9, 235, 181, 54, 104, 138, 212, 149, 203, 41, 119, 244, 170, 72, 22,
        233, 183, 85, 11, 136, 214, 52, 106, 43, 117, 151, 201, 74, 20, 246, 168,
        116, 42, 200, 150, 21, 75, 169, 247, 182, 232, 10, 84, 215, 137, 107, 53,
    ];

    function crc8(bytes) {
        let t = 0;
        for (const b of bytes) t = CRC[(t ^ b) & 0xff];
        return t;
    }

    /* Minimal big-endian encoding of a non-negative integer. */
    function uc(value) {
        const out = [];
        let v = value >>> 0;
        do { out.unshift(v & 0xff); v >>>= 8; } while (v > 0);
        return out;
    }

    function int16(v) {
        return [(v >> 8) & 0xff, v & 0xff];
    }

    function readInt16(bytes, signed = false) {
        const v = (bytes[0] << 8) | bytes[1];
        return signed ? (v << 16) >> 16 : v;
    }

    /* Build an outgoing frame (without the HID report-ID prefix). */
    function buildFrame(cmd, mod, addr, payload, seq) {
        const body = [cmd, mod, (seq >> 8) & 0xff, seq & 0xff, addr, payload.length, ...payload];
        return Uint8Array.from([...body, crc8(body), 0xee]);
    }

    /* Parse an incoming input-report payload (WebHID strips the report ID).
       Layout: [cmd, mod, seqHi, seqLo, addr, len, ...payload, crc, 0xEE]

       Note: the device echoes PEQ_NAME (addr 48) with the len field copied
       from the request while the stored name is upper-cased and NUL-padded,
       so that one response is a byte longer than `len` claims. We do not
       validate CRCs or read names back, so this is harmless — just do not
       trust `len` blindly if you ever start parsing name responses. */
    function parseReport(data) {
        if (data.length < 8) return null;
        const len = data[5];
        if (data.length < 6 + len) return null;
        return {
            cmd: data[0],
            mod: data[1],
            seq: (data[2] << 8) | data[3],
            addr: data[4],
            payload: data.slice(6, 6 + len),
        };
    }

    /* ---- High-level encoders ---------------------------------- */

    function encodeBand(band, b) {
        return [
            band,
            ...int16(Math.round(b.gain * 10) & 0xffff),
            ...int16(b.freq & 0xffff),
            ...int16(Math.round(b.q * 100) & 0xffff),
            b.type & 0xff,
        ];
    }

    function decodeBand(payload) {
        return {
            band: payload[0],
            gain: readInt16(payload.slice(1, 3), true) / 10,
            freq: readInt16(payload.slice(3, 5)),
            q: readInt16(payload.slice(5, 7)) / 100,
            type: payload[7],
        };
    }

    global.FiiO = {
        REPORT_ID, VENDOR_ID, PRODUCT_ID, CMD, MOD, ADDR, NO_REPLY_ADDRS,
        FILTERS, PRESETS, LIMITS, NAME_LENGTH: 8,
        crc8, uc, int16, readInt16, buildFrame, parseReport, encodeBand, decodeBand,
    };
})(window);
