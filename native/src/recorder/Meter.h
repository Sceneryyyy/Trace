#pragma once
#include "AudioTypes.h"
#include "ebur128.h"
#include <array>
#include <functional>
#include <utility>
#include <vector>
namespace Trace {
using MeterFrameSink=std::function<void(const MeterValues&,const WavePoint&,bool)>;
class Meter {
    ebur128_state* state_ = nullptr;
    uint32_t rate_, channels_;
    uint64_t frame_ = 0, hopIndex_ = 0;
    std::vector<float> hop_;
    size_t hopFrames_ = 0,hopFedFrames_=0;
    std::vector<double> squares_;
    size_t rmsCursor_ = 0, rmsCount_ = 0;
    std::array<float,2> minimum_{},maximum_{};
    uint32_t hopFlags_ = 0;
    MeterValues raw_,current_;
    std::array<WavePoint,6000> waves_{};
    // 60 seconds at the 10 ms measurement cadence; allocated once on owner init.
    std::vector<LoudnessPoint> loudness_;
    uint64_t waveCount_ = 0,loudnessCount_ = 0;
    struct TpBin {uint64_t index=UINT64_MAX;std::array<double,2> peak{};};
    struct PendingFrame {MeterValues values;WavePoint wave;uint64_t window=0;uint32_t loudFlags=0;bool loud=false;};
    std::array<TpBin,4> tpBins_{};
    std::array<PendingFrame,3> pending_{};
    size_t pendingHead_=0,pendingCount_=0;
    uint64_t tpInputFrames_=0;
    uint32_t tpDelayFrames_=0;
    double prefixTruePeak_=0;
    bool tpFault_=false,finalizing_=false,finished_=false;
    MeterFrameSink sink_;
    static void collectTruePeak(void*,const float*,size_t,unsigned int,unsigned int,uint64_t,unsigned int) noexcept;
    void publishReady();
    void feedPending();
    void finishHop();
    void measureLoudness();
public:
    Meter(uint32_t rate,uint32_t channels);
    ~Meter();
    Meter(const Meter&)=delete;
    Meter& operator=(const Meter&)=delete;
    void push(const float* interleaved,uint32_t frames,uint32_t flags=0);
    void finish();
    // Receives every complete, time-aligned frame, including multiple EOF frames.
    // The callback runs on the analysis owner thread, never the capture thread.
    void setFrameSink(MeterFrameSink sink){sink_=std::move(sink);}
    const WavePoint* latestWave()const{return waveCount_?&waves_[(waveCount_-1)%waves_.size()]:nullptr;}
    const LoudnessPoint* latestLoudness()const{return loudnessCount_?&loudness_[(loudnessCount_-1)%loudness_.size()]:nullptr;}
    const MeterValues& values()const{return current_;}
    uint64_t frames()const{return frame_;}
    uint32_t channels()const{return channels_;}
    uint32_t sampleRate()const{return rate_;}
    uint32_t truePeakLookaheadFrames()const{return tpDelayFrames_;}
    std::vector<WavePoint> waveform(unsigned seconds,size_t columns)const;
    std::vector<LoudnessPoint> loudnessHistory(unsigned seconds)const;
    size_t historyCapacity()const{return waves_.size();}
};
Metric loudnessMetric(double value,bool ready);
Metric amplitudeMetric(double value,bool ready=true);
}
