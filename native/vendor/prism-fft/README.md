# Trace's retained Prism FFT

This local component extracts only `DSP::FFT` from Prism, pinned at
[`df0755b8caaaab85157ac51aefffca0526974fc1`](https://github.com/Boof2015/prism/tree/df0755b8caaaab85157ac51aefffca0526974fc1).
Trace builds these local files directly; it does not fetch or build Prism,
load its addon, or require the original Prism source layout.

`SOURCE.json` records the original complete file SHA256 values, source line
ranges, local file SHA256 values and exported API. The original FFT class and
every FFT function body are retained byte for byte. The only extraction edits
are removal of unrelated DSP declarations/implementations, the local include
name and closing the namespace. The original file hashes match the pinned Git
revision. `COPYING` is the complete, unchanged Prism GPLv3 license; the pinned
Prism package declares `GPL-3.0-only`. The extraction does not change licensing
or authorship. Upstream source files do not carry an additional per-file
copyright notice; no replacement authorship is asserted here.

The component retains the existing radix-2 transform and both `forward`
overloads, including the original magnitude `2/N` scaling. Trace's caller is
`InstrumentAnalysis.cpp`, whose configuration validation restricts FFT sizes
to powers of two from 512 to 16384. Trace applies its own Hann-window and
DC/Nyquist amplitude calibration to the complex output. The extraction does
not change those numerical definitions, Meter v5 or libebur128.

`test/native/fft_tests.cpp` independently compares the complex transform and
magnitude API with direct double-precision DFTs, covering all supported sizes,
DC, Nyquist, shifted impulses, tones, fixed-seed noise and buffer reuse.
`instrument_analysis_tests.cpp` continues to check Trace's actual instrument
calibration, channel selections and averaging. Both are registered in the
portable and Windows-native CMake projects.

Future changes belong here and must update this provenance record and the
numerical regression evidence. A new upstream release is not fetched during
installation or compilation.
