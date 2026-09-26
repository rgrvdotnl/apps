// RX7 Patcher Library - Reusable components for DX7 unit patching
// Can be used by rx7patcher and other web apps

const RX7Patcher = {
    // Constants
    VOICE_SIZE: 128,  // DX7 voice size (packed format)
    CART_SIZE: 4104,  // 32-voice cartridge size
    NUM_VOICES: 32,
    SYSEX_HEADER: [0xF0, 0x43, 0x00, 0x09, 0x20, 0x00],
    SYSEX_FOOTER: 0xF7,

    // RX7 Colors
    COLORS: {
        teal: '#5a979a',
        pink: '#be3b65',
        purple: '#8B4789'
    },

    /**
     * Validate DX7 SysEx cartridge file
     * @param {Uint8Array} data - SysEx file data
     * @returns {boolean} True if valid
     */
    validateCartridge(data) {
        if (data.length !== this.CART_SIZE) {
            return false;
        }

        // Check SysEx header
        for (let i = 0; i < this.SYSEX_HEADER.length; i++) {
            if (data[i] !== this.SYSEX_HEADER[i]) {
                return false;
            }
        }

        // Check footer
        if (data[data.length - 1] !== this.SYSEX_FOOTER) {
            return false;
        }

        return true;
    },

    /**
     * Calculate DX7 checksum
     * @param {Uint8Array} data - Voice data
     * @returns {number} Checksum byte
     */
    calculateChecksum(data) {
        let sum = 0;
        for (let i = 6; i < data.length - 2; i++) {
            sum += data[i];
        }
        return (~sum + 1) & 0x7F;
    },

    /**
     * Parse DX7 cartridge
     * @param {Uint8Array} data - Cartridge file data
     * @returns {Array} Array of voice objects
     */
    parseCartridge(data) {
        if (!this.validateCartridge(data)) {
            throw new Error('Invalid DX7 cartridge file');
        }

        const voices = [];

        for (let i = 0; i < this.NUM_VOICES; i++) {
            const offset = 6 + (i * this.VOICE_SIZE);
            const voiceData = data.slice(offset, offset + this.VOICE_SIZE);

            // Patch name is in bytes 118-127 (10 characters, ASCII)
            const nameBytes = voiceData.slice(118, 128);
            const name = String.fromCharCode(...nameBytes)
                .replace(/[^\x20-\x7E]/g, ' ')  // Replace non-printable
                .trim() || `INIT VOICE ${i + 1}`;

            voices.push({
                index: i,
                name: name,
                data: voiceData,
                algorithm: voiceData[4] + 1,  // Algorithm (1-32)
                feedback: voiceData[5]  // Feedback (0-7)
            });
        }

        return voices;
    },

    /**
     * Create DX7 cartridge from voices
     * @param {Array} voices - Array of 32 voice objects
     * @returns {Uint8Array} Cartridge file data
     */
    createCartridge(voices) {
        if (voices.length !== this.NUM_VOICES) {
            throw new Error(`Expected ${this.NUM_VOICES} voices, got ${voices.length}`);
        }

        const cart = new Uint8Array(this.CART_SIZE);

        // Header
        cart.set(this.SYSEX_HEADER, 0);

        // Voices
        for (let i = 0; i < this.NUM_VOICES; i++) {
            const offset = 6 + (i * this.VOICE_SIZE);
            if (voices[i] && voices[i].data) {
                cart.set(voices[i].data, offset);
            } else {
                // Fill with INIT VOICE data if slot is empty
                cart.fill(0, offset, offset + this.VOICE_SIZE);
            }
        }

        // Checksum
        const checksum = this.calculateChecksum(cart);
        cart[this.CART_SIZE - 2] = checksum;

        // Footer
        cart[this.CART_SIZE - 1] = this.SYSEX_FOOTER;

        return cart;
    },

    /**
     * Parse single DX7 voice (from .syx file)
     * @param {Uint8Array} data - Voice file data
     * @returns {Object} Voice object
     */
    parseSingleVoice(data) {
        // Single voice SysEx format: F0 43 00 00 01 1B [155 bytes] [checksum] F7
        if (data.length !== 163) {
            throw new Error('Invalid single voice file size');
        }

        // Extract voice data (bytes 6-160)
        const voiceData = data.slice(6, 161);
        const nameBytes = voiceData.slice(145, 155);
        const name = String.fromCharCode(...nameBytes)
            .replace(/[^\x20-\x7E]/g, ' ')
            .trim() || 'INIT VOICE';

        return {
            name: name,
            data: voiceData,
            algorithm: voiceData[134] + 1,
            feedback: voiceData[135]
        };
    },

    /**
     * Extract cartridge from unit file
     * Note: Simplified version. Full ELF parsing needed for real implementation.
     * @param {Uint8Array} unitData - Unit file data
     * @returns {Uint8Array|null} Cartridge data or null
     */
    extractCartridgeFromUnit(unitData) {
        // TODO: Implement ELF section parsing to extract embedded cartridge
        console.warn('extractCartridgeFromUnit: ELF parsing not implemented in web version');
        return null;
    },

    /**
     * Patch cartridge into unit file
     * Note: Simplified version. Full ELF patching requires native code.
     * @param {Uint8Array} unitData - Original unit file data
     * @param {Uint8Array} cartridge - Cartridge data to patch in
     * @param {Object} options - { unitName }
     * @returns {Uint8Array} Patched unit file data
     */
    patchUnit(unitData, cartridge, options = {}) {
        // TODO: Implement ELF section patching
        console.warn('patchUnit: ELF patching not implemented in web version - use desktop app');
        return unitData;
    },

    /**
     * Get algorithm structure info
     * @param {number} algorithm - Algorithm number (1-32)
     * @returns {Object} { carriers: [], modulators: [] }
     */
    getAlgorithmInfo(algorithm) {
        // Simplified - would need full algorithm definitions for accuracy
        return {
            algorithm: algorithm,
            description: `Algorithm ${algorithm}`,
            carriers: [6],  // Operator 6 is always a carrier in most algorithms
            modulators: [1, 2, 3, 4, 5]
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RX7Patcher;
}
