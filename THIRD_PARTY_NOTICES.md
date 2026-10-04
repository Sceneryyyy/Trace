# Third-Party Notices

## FFmpeg Windows codec runtime

Trace builds Windows x64 FFmpeg 9.0.2 from official commit
946fcce07b6dcd0331c8cc609192aeff5e1924f8 and unmodified LAME 3.100 source.
Only libmp3lame is enabled as an external media library. Exact source archives,
MSVC/SDK/tool hashes, flags, recipe and output EXEs are bound by ffmpeg.lock.json
and references/trace-ffmpeg/{build-lock,build-report,source-manifest}.json.
The build enables GPL and version3. Original FFmpeg GPL/upstream licensing and
LAME LGPL notices accompany the application and the source bundle.

Matching FFmpeg/LAME archives, Trace project source with the build scripts,
configuration, build report and system input inventory accompany candidates.
The corresponding-source field covers FFmpeg, LAME and the Trace build recipe.
Microsoft compiler/CRT/SDK inputs and Windows system libraries are separately
identified; their proprietary code is not claimed as open source. Public
release still requires the component security and Microsoft/GPL system-library
licensing review recorded in docs/76-RELEASE-CHECKLIST.md.

Historical Gyan 9.0.2 binary/source inventory remains in references/ffmpeg-9.0.2/.
Its missing producer inputs remain explicitly incomplete; new source-build
verification does not apply to that old binary. Reproduction and current
verification are described in docs/81-SELF-BUILT-FFMPEG.md.

## EBU Loudness Test Set (internal research material)

© EBU. The private development repository contains the EBU Loudness Test Set
v5.0 and official reference documents under
`references/ebu-loudness-test-set-v5/`. They retain their original rights and
are not covered by the project's GPL license. Use is limited by the EBU Audio
Test Sequences Terms of Use included in that directory. These files are internal
technical test material and must not be included in application packages or
public source/release distributions. See that directory's README for exact
sources, SHA-256 values, and permitted-use information.

## Prism-derived code and retained FFT

Trace was developed from [Boof2015/Prism](https://github.com/Boof2015/prism),
pinned at `df0755b8caaaab85157ac51aefffca0526974fc1`. The original author
and project attribution are retained in README-Prism.md and docs/14-SOURCES.md.
The project remains GPL-3.0-only; the complete license is in LICENSE.

The maintained FFT extraction under `native/vendor/prism-fft/` retains the
original `DSP::FFT` class and function bodies. COPYING preserves the complete
original GPL license; SOURCE.json records source and extraction hashes, the
revision and the exact changes. Trace builds that local component directly.
Prism's standalone application, capture addon, TUI and VST build are not Trace
build dependencies. FTXUI/JUCE belonged to those removed upstream targets.

## libebur128 (Trace native engine)

Version 1.2.6, commit 67b33abe1558160ed76ada1322329b0e9e058b02.
Source: https://github.com/jiixyj/libebur128

Copyright (c) 2011 Jan Kokemüller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## BSD queue header used by libebur128

/*
 * Copyright (c) 1991, 1993
 *	The Regents of the University of California.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the University nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE REGENTS AND CONTRIBUTORS ``AS IS'' AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED.  IN NO EVENT SHALL THE REGENTS OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
 * OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 *
 *	@(#)queue.h	8.5 (Berkeley) 8/20/94
 */

### Trace metering modification

The vendored libebur128 1.2.6 includes a local 10 Hz LRA histogram patch. Original licensing is unchanged. See native/vendor/libebur128/TRACE-PATCHES.md and SOURCE.json for the exact upstream revision and modifications.
