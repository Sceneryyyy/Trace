#pragma once
#include "AudioTypes.h"
#include <memory>
#include <vector>
namespace Trace {
struct PcmWindow {SourceFormat format;uint64_t firstFrame=0,positionFrame=0;bool gap=false;std::vector<float> samples;};
struct ReplayRange {uint64_t start=0,end=0;};
struct ReplayPoint {MeterValues meters;WavePoint wave;bool loud=false;};
struct ReplayView {MeterValues meters;std::vector<WavePoint> waveform;std::vector<LoudnessPoint> loudness;};
struct ReplayClip {
 SourceFormat format;
 uint64_t originFrame=0,captureStartFrame=0,captureEpoch=0,measurementEpoch=0;
 std::string sourceId;
 std::vector<float> samples;
 std::vector<ReplayPoint> history;
 uint64_t frames()const{return format.channels?samples.size()/format.channels:0;}
 PcmWindow window(uint64_t position,uint32_t beforeFrames)const;
 uint32_t read(uint64_t position,float* output,uint32_t maximum)const;
 ReplayView view(uint64_t position,uint64_t start,uint64_t end,size_t columns)const;
 MeterValues analyze(uint64_t start,uint64_t end)const;
};
// Single analysis-thread owner. Allocated before capture starts; no disk or JS.
class ReplayBuffer {
 SourceFormat format_;
 std::vector<float> samples_;
 std::vector<ReplayPoint> history_;
 uint64_t frames_=0,rows_=0,capacity_=0;
public:
 explicit ReplayBuffer(SourceFormat format);
 void reset()noexcept{frames_=rows_=0;}
 void push(const float* samples,uint32_t frames);
 void remember(const MeterValues&,const WavePoint&,bool loud)noexcept;
 uint64_t retainedFrames()const{return frames_<capacity_?frames_:capacity_;}
 uint64_t capacityFrames()const{return capacity_;}
 ReplayRange range(bool publishedOnly=false)const;
 PcmWindow window(uint64_t position,uint32_t beforeFrames)const;
 std::shared_ptr<ReplayClip> freeze(bool publishedOnly=false)const;
};
}
