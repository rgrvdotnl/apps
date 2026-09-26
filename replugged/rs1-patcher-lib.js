// RS1 Patcher Library - Reusable components for RS1 unit patching
// Can be used by rs1patcher and other web apps

const RS1Patcher = {
    // Constants
    PRESET_SIZE: 264,  // RS1 preset size in bytes
    CART_HEADER_SIZE: 2,
    SLOT_SIZE: 265,  // 1 byte fixed note + 264 bytes preset
    NUM_SLOTS: 6,

    CABLE_COLORS: [
        '#53BAAE', // Teal
        '#F97900', // Orange
        '#8852BA', // Purple
        '#5390BA', // Blue
        '#90BA53', // Green
        '#BAB153'  // Yellow
    ],

    DRUM_LABELS: ['Kick', 'Snare', 'Closed Hat', 'Open Hat', 'Clap', 'Tom'],

    /**
     * Validate RS1 preset file
     * @param {Uint8Array} data - Preset file data
     * @returns {boolean} True if valid
     */
    validatePreset(data) {
        if (!data || data.length !== this.PRESET_SIZE) {
            return false;
        }
        // Could add more validation here (checksum, etc.)
        return true;
    },

    /**
     * Parse RS1 cart file
     * @param {Uint8Array} data - Cart file data
     * @returns {Object} Parsed cart data { version, presets[] }
     */
    parseCart(data) {
        if (data.length !== (this.CART_HEADER_SIZE + this.NUM_SLOTS * this.SLOT_SIZE)) {
            throw new Error(`Invalid cart size: ${data.length} bytes`);
        }

        const version = data[0];
        const numPresets = data[1];
        const presets = [];

        let offset = this.CART_HEADER_SIZE;
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            const fixedNote = data[offset];
            const presetData = data.slice(offset + 1, offset + this.SLOT_SIZE);

            // Check if slot is empty (all zeros)
            const isEmpty = presetData.every(b => b === 0);

            if (!isEmpty) {
                presets.push({
                    index: i,
                    fixedNote: fixedNote,
                    data: presetData,
                    name: `Preset ${i + 1}`  // Could parse actual name from preset data
                });
            }

            offset += this.SLOT_SIZE;
        }

        return {
            version,
            numPresets,
            presets
        };
    },

    /**
     * Create RS1 cart file from presets
     * @param {Array} slots - Array of 6 preset objects (can be null)
     * @param {string} mode - 'synth' or 'drumkit'
     * @returns {Uint8Array} Cart file data
     */
    createCart(slots, mode = 'synth') {
        const cartSize = this.CART_HEADER_SIZE + (this.NUM_SLOTS * this.SLOT_SIZE);
        const cart = new Uint8Array(cartSize);

        // Header
        cart[0] = 1;  // Version
        cart[1] = slots.filter(s => s !== null).length;  // Number of loaded presets

        let offset = this.CART_HEADER_SIZE;
        for (let i = 0; i < this.NUM_SLOTS; i++) {
            if (slots[i] && slots[i].data) {
                cart[offset] = slots[i].fixedNote || 60;  // Fixed note (C4 default)
                cart.set(slots[i].data, offset + 1);
            } else {
                // Empty slot - fill with zeros
                cart.fill(0, offset, offset + this.SLOT_SIZE);
            }
            offset += this.SLOT_SIZE;
        }

        return cart;
    },

    /**
     * Extract presets from unit file
     * Note: This is a simplified version. Full ELF parsing would be needed for real implementation.
     * @param {Uint8Array} unitData - Unit file data
     * @returns {Array} Array of preset objects
     */
    extractPresetsFromUnit(unitData) {
        // TODO: Implement ELF section parsing to extract .unit_header and preset data
        // For now, return empty array
        console.warn('extractPresetsFromUnit: ELF parsing not implemented in web version');
        return [];
    },

    /**
     * Patch presets into unit file
     * Note: This is a simplified version. Full ELF patching would require native code.
     * @param {Uint8Array} unitData - Original unit file data
     * @param {Array} presets - Array of preset objects
     * @param {Object} options - { mode, unitName }
     * @returns {Uint8Array} Patched unit file data
     */
    patchUnit(unitData, presets, options = {}) {
        // TODO: Implement ELF section patching
        // For now, just return original data with a warning
        console.warn('patchUnit: ELF patching not implemented in web version - use desktop app');
        return unitData;
    },

    /**
     * Get slot label based on mode
     * @param {number} index - Slot index (0-5)
     * @param {string} mode - 'synth' or 'drumkit'
     * @returns {string} Label
     */
    getSlotLabel(index, mode) {
        return mode === 'drumkit' ? this.DRUM_LABELS[index] : `Slot ${index + 1}`;
    },

    /**
     * Get cable color for slot
     * @param {number} index - Slot index (0-5)
     * @returns {string} CSS color
     */
    getCableColor(index) {
        return this.CABLE_COLORS[index % this.CABLE_COLORS.length];
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RS1Patcher;
}
