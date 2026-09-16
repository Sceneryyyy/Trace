#pragma once
#include "AudioTypes.h"
#include <vector>
namespace Trace {
enum class SpectrumChannel {Stereo,Left,Right,Mid,Side};
struct InstrumentConfig {
 uint32_t fftSize=2048,averageMs=300,holdMs=1000,fieldMs=300;
 SpectrumChannel channel=SpectrumChannel::Stereo;
};
struct FieldPoint {uint64_t frame=0;float x=0,y=0;bool clipped=false;};
struct FieldAnalysis {
 Metric correlation,balance;
 uint64_t firstFrame=0,endFrame=0;
 bool partial=false;
 std::vector<FieldPoint> points;
};
struct InstrumentAnalysis {
 MetricStatus status=MetricStatus::Insufficient;
 uint64_t positionFrame=0,windowStart=0;
 uint32_t fftSize=0,hop=0,averageWindows=0,holdWindows=0;
 double binHz=0;
 bool partialAverage=false,partialHold=false;
 std::vector<double> current,average,peakHold;
 FieldAnalysis field;
};
// Read-only bounded PCM. This function owns no device, playback or accumulation lifecycle.
InstrumentAnalysis analyzeInstruments(const float* interleaved,uint32_t frames,uint32_t rate,uint32_t channels,
 uint64_t firstFrame,uint64_t position,const InstrumentConfig& config={});
}
