# Motion Sequencer Export Features

The motion sequencer now supports exporting recorded patterns to **MIDI files** and **Korg Volca Sample patterns**.

## Features

### 💾 MIDI Export

Click the **"💾 MIDI"** button to export your pattern as a Standard MIDI File (.mid).

**What gets exported:**
- All recorded notes on a 16th-note grid
- Note timing and pitch from each step
- Motion data as MIDI Control Change (CC) messages
- Tempo setting from the sequencer BPM
- Compatible with any DAW or MIDI player

**Technical Details:**
- Format: Standard MIDI File (SMF) Format 0
- Resolution: 480 ticks per quarter note
- Channel: MIDI Channel 1 (configurable)
- Gate time: 80% note length
- Motion mapping: CC 20+ (parameter index + 20)

### 💾 Volca Sample Export

Click the **"💾 Volca"** button to export your pattern for Korg Volca Sample.

**What gets exported:**
- 16-step pattern with note gates
- Motion sequencing data (parameter automation)
- Volca Sample-compatible .dat file
- Ready for Syro audio conversion

**How to transfer to Volca Sample:**

1. Export pattern as `.dat` file from the web app
2. Convert to Syro audio using the SDK:
   ```bash
   cd reveng/volcasample/example/execute_gnulinux
   ./syro_volcasample_example output.wav "p01:pattern.dat"
   ```
3. Play the generated `output.wav` into Volca Sample's SYNC IN port
4. Volca Sample receives and stores the pattern

**Technical Details:**
- Format: Volca Sample Pattern Data (matches Syro SDK spec)
- Parts: Uses Part 0 by default
- Steps: 16 steps per pattern
- Motion: Full parameter automation support
- Sample: Set to Sample 0 by default

## Recording Workflow

### Step Recording (REC only)
1. Press **REC** button (without PLAY)
2. Current step highlights (starts at step 1)
3. Play notes on keyboard - each note advances to next step
4. Stop recording with **REC** again
5. Export as MIDI or Volca pattern

### Live Recording (REC + PLAY)
1. Press **REC** + **PLAY**
2. Pattern plays and records notes in real-time
3. Adjust synth parameters while recording for motion sequencing
4. Stop with **STOP**
5. Export with motion data included

## Implementation Details

### C Libraries (Backend)

Located in `common/`:
- `midi_writer.h/c` - MIDI file generation
- `volca_pattern_writer.h/c` - Volca pattern generation
- `pattern_export_wasm.c` - WebAssembly bindings
- Can be compiled natively or to WebAssembly

### JavaScript (Frontend)

Located in `web/replugged/external/`:
- `pattern-export.js` - Pure JS implementation
  - `MIDIFileWriter` class
  - `VolcaPatternWriter` class
- No compilation required
- Identical API to WASM version

### Motion Sequencer Integration

The export functions are integrated into `motion-sequencer.js`:
- `exportMIDI()` - Creates and downloads .mid file
- `exportVolca()` - Creates and downloads .dat file
- Dynamic import of pattern-export library
- Automatic tempo and timing conversion

## Examples

### CLI Example (C)

Build and run the example:
```bash
cd common
make -f Makefile.examples
./example_pattern_export
```

This generates:
- `example_pattern.mid` - MIDI file with 4/4 kick pattern
- `example_pattern.dat` - Volca pattern with motion sequencing

### Web Example

1. Open `web/rfxsynths/index.html`
2. Initialize a synth (e.g., RS1)
3. Open Motion Sequencer section
4. Press **REC** and play notes
5. Click **💾 MIDI** to download MIDI file
6. Click **💾 Volca** to download Volca pattern

## Future Enhancements

Planned features:
- [ ] Multi-part Volca patterns (currently uses Part 0)
- [ ] Note-to-sample mapping for drum patterns
- [ ] MIDI file import
- [ ] Volca pattern import
- [ ] Parameter name mapping configuration
- [ ] Custom MIDI CC mapping
- [ ] MIDI Export with multiple channels
- [ ] Sysex export for other Volca models

## Syro Integration

The Volca pattern export creates files compatible with the Korg Syro SDK (included in `reveng/volcasample/`).

**Syro SDK Workflow:**
1. Create pattern using motion sequencer or C library
2. Convert pattern to Syro audio stream
3. Transfer to Volca Sample via audio cable

The pattern structure exactly matches the official Volca Sample specification, including:
- Header/footer markers (PTST/PTED)
- Device code (0x33b8)
- 10 parts × 16 steps structure
- Motion sequencing data layout
- Parameter encoding

## References

- C implementation: `common/PATTERN_EXPORT_README.md`
- Syro SDK docs: `reveng/volcasample/readme.markdown`
- Volca pattern format: `reveng/volcasample/pattern/volcasample_pattern.h`
- Motion sequencer code: `web/replugged/components/motion-sequencer.js`
