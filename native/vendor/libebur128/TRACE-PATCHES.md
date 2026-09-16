# Trace local libebur128 modification

Upstream remains libebur128 1.2.6, commit 67b33abe1558160ed76ada1322329b0e9e058b02. Original copyright, COPYING and BSD queue notices are preserved.

## trace-lra10hz-histogram-v1

The upstream add-frames macro resets the 3-second short-term counter to 2 seconds after each LRA sample, yielding a one-second hop. Trace's bounded histogram mode now resets it to 2.9 seconds, yielding a 100 ms hop. The non-histogram branch retains the upstream behaviour; Trace always enables histogram mode.

This change addresses the minimum 10 Hz short-term sampling in EBU Tech 3342, November 2023, section 3.1:
https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3342.pdf

The wrapper also supplies 1.5 seconds of zero analysis context at finalisation for LRA/TP only. These zeros are not written as audio, do not increment file/capture frames, and do not replace the real-EOF M/S/I/RMS values. That wrapper change is in native/src/recorder/Meter.cpp, not in this upstream file.

Configuration: trace-meter-v3-ebur128-1.2.6-lra10hz-eof.
The patch's upstream/local SHA256 values are recorded in SOURCE.json.
Regression: test/native/ebu_reference_tests.cpp. Before correction, the 10 Hz comparison measured 0.0 versus 3.009767 LU; the EOF comparison measured 1.8 versus 4.727904 LU.
Generated reference checks do not represent execution of the unavailable original EBU WAV programme files.

## trace-tp-observer-v1 (v4)

The existing interpolator output is exposed through an optional native-only borrowed-view callback with absolute input positions and group delay. Original scalar APIs remain unchanged. The wrapper uses source-aligned bins and bounded publication queues; the capture callback never calls this observer.

Current configuration: trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned.
See docs/21-M3-TP-TIMING.md and test/native/tp_time_tests.cpp for the boundary policy and independent convolution checks.

## trace-constants-once-v1

Shared constants and histogram tables were previously rewritten on every constructor call. Their unchanged formulas now run once through native/src/recorder/EburConstants.cpp before any instance is returned. Processing readers need no additional synchronization. The parallel-construction test verifies one initialization and 32 successful meter lifecycles.

SOURCE.json records each patch's predecessor and resulting hashes. The observer patch also normalized line endings to LF.
