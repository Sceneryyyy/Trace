#include "Meter.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
namespace Trace {
Metric loudnessMetric(double value,bool ready){
    if(!ready)return {};
    if(std::isnan(value)||value==std::numeric_limits<double>::infinity())return {0,MetricStatus::Error};
    if(!std::isfinite(value))return {0,MetricStatus::Silence};
    return {value,MetricStatus::Ready};
}
Metric amplitudeMetric(double value,bool ready){
    if(!ready)return {};
    if(!std::isfinite(value)||value<0)return {0,MetricStatus::Error};
    if(value==0)return {0,MetricStatus::Silence};
    return {20.0*std::log10(value),MetricStatus::Ready};
}
Meter::Meter(uint32_t rate,uint32_t channels):rate_(rate),channels_(channels){
    if(rate<8000||rate>96000||(channels!=1&&channels!=2))throw std::runtime_error("UNSUPPORTED_FORMAT");
    state_=ebur128_init(channels,rate,EBUR128_MODE_M|EBUR128_MODE_S|EBUR128_MODE_I|
        EBUR128_MODE_LRA|EBUR128_MODE_TRUE_PEAK|EBUR128_MODE_HISTOGRAM);
    if(!state_)throw std::runtime_error("METER_INIT_FAILED");
    tpDelayFrames_=rate<96000?6:12;
    if(ebur128_set_trace_tp_callback(state_,collectTruePeak,this)!=EBUR128_SUCCESS){
        ebur128_destroy(&state_);throw std::runtime_error("TRUE_PEAK_OBSERVER_FAILED");
    }
    minimum_.fill(INFINITY);maximum_.fill(-INFINITY);
    try{
        hop_.resize((rate/100+1)*channels);
        squares_.resize(static_cast<size_t>(rate*3/10)*channels,0);
    }catch(...){ebur128_destroy(&state_);throw;}
}
Meter::~Meter(){if(state_)ebur128_destroy(&state_);}
void Meter::collectTruePeak(void* context,const float* samples,size_t outputs,unsigned int channels,
        unsigned int factor,uint64_t firstInput,unsigned int delay) noexcept {
    auto& self=*static_cast<Meter*>(context);
    if(channels!=self.channels_||(factor!=2&&factor!=4)||delay!=self.tpDelayFrames_||outputs%factor){self.tpFault_=true;return;}
    const auto count=outputs/factor;
    for(size_t f=0;f<count;++f){
        const auto input=firstInput+f;
        uint64_t source=input<delay?0:input-delay;
        if(self.finalizing_&&source>=self.frame_)source=self.frame_-1;
        const auto window=((source+1)*100-1)/self.rate_;
        auto& bin=self.tpBins_[window%self.tpBins_.size()];
        if(bin.index!=window){
            if(bin.index!=UINT64_MAX){self.tpFault_=true;return;}
            bin.index=window;bin.peak={};
        }
        for(unsigned int phase=0;phase<factor;++phase)for(unsigned int channel=0;channel<channels;++channel){
            const auto value=std::abs(static_cast<double>(samples[(f*factor+phase)*channels+channel]));
            if(!std::isfinite(value)){self.tpFault_=true;return;}
            bin.peak[channel]=std::max(bin.peak[channel],value);
        }
    }
    self.tpInputFrames_=firstInput+count;
}
void Meter::publishReady(){
    if(tpFault_)throw std::runtime_error("TRUE_PEAK_TIMELINE_FAILED");
    while(pendingCount_){
        const auto& pending=pending_[pendingHead_];
        if(tpInputFrames_<pending.values.frame||tpInputFrames_-pending.values.frame<tpDelayFrames_)break;
        auto& bin=tpBins_[pending.window%tpBins_.size()];
        if(bin.index!=pending.window)throw std::runtime_error("TRUE_PEAK_WINDOW_MISSING");
        current_=pending.values;
        for(uint32_t c=0;c<channels_;++c){
            const auto samplePeak=std::max(std::abs(static_cast<double>(pending.wave.minimum[c])),std::abs(static_cast<double>(pending.wave.maximum[c])));
            const auto peak=std::max(bin.peak[c],samplePeak);
            current_.channels[c].truePeak=amplitudeMetric(peak);
            prefixTruePeak_=std::max(prefixTruePeak_,peak);
        }
        current_.maxTruePeak=amplitudeMetric(prefixTruePeak_);
        waves_[waveCount_++%waves_.size()]=pending.wave;
        if(pending.loud)loudness_[loudnessCount_++%loudness_.size()]={current_.loudnessFrame,current_.momentary,current_.shortTerm,current_.integrated,pending.loudFlags};
        const bool loud=pending.loud;
        bin.index=UINT64_MAX;bin.peak={};
        pendingHead_=(pendingHead_+1)%pending_.size();--pendingCount_;
        if(sink_)sink_(current_,*latestWave(),loud);
    }
}
void Meter::push(const float* samples,uint32_t frames,uint32_t flags){
    if(finished_||finalizing_)throw std::runtime_error("METER_ALREADY_FINISHED");
    const size_t rmsFrames=squares_.size()/channels_;
    for(uint32_t f=0;f<frames;++f){
        for(uint32_t c=0;c<channels_;++c){
            float sample=samples?samples[static_cast<size_t>(f)*channels_+c]:0;
            if(!std::isfinite(sample)){sample=0;flags|=Gap;}
            hop_[hopFrames_*channels_+c]=sample;
            minimum_[c]=std::min(minimum_[c],sample);maximum_[c]=std::max(maximum_[c],sample);
            squares_[rmsCursor_*channels_+c]=static_cast<double>(sample)*sample;
        }
        rmsCursor_=(rmsCursor_+1)%rmsFrames;rmsCount_=std::min(rmsCount_+1,rmsFrames);
        ++hopFrames_;++frame_;hopFlags_|=flags;
        if(frame_>=(hopIndex_+1)*rate_/100)finishHop();
    }
    feedPending();publishReady();
}
void Meter::feedPending(){
    if(hopFedFrames_==hopFrames_)return;
    if(ebur128_add_frames_float(state_,hop_.data()+hopFedFrames_*channels_,hopFrames_-hopFedFrames_)!=EBUR128_SUCCESS)throw std::runtime_error("METER_PROCESS_FAILED");
    hopFedFrames_=hopFrames_;
}
void Meter::finishHop(){
    feedPending();
    raw_.frame=frame_;
    for(uint32_t c=0;c<channels_;++c){
        raw_.channels[c].peak=amplitudeMetric(std::max(std::abs(minimum_[c]),std::abs(maximum_[c])));
        double sum=0;for(size_t i=c;i<squares_.size();i+=channels_)sum+=squares_[i];
        raw_.channels[c].rms=amplitudeMetric(std::sqrt(sum/static_cast<double>(rmsCount_)));
    }
    const auto window=hopIndex_++;
    loudnessFlags_|=hopFlags_;
    const bool loud=hopIndex_%10==0;
    if(loud)measureLoudness();
    if(pendingCount_==pending_.size())throw std::runtime_error("METER_PENDING_OVERFLOW");
    auto& pending=pending_[(pendingHead_+pendingCount_)%pending_.size()];
    pending={raw_,{frame_,minimum_,maximum_,hopFlags_},window,loud?loudnessFlags_:0,loud};
    ++pendingCount_;
    if(loud)loudnessFlags_=0;
    hopFrames_=hopFedFrames_=0;minimum_.fill(INFINITY);maximum_.fill(-INFINITY);hopFlags_=0;
    publishReady();
}
void Meter::measureLoudness(){
    double m=-INFINITY,s=-INFINITY,integrated=-INFINITY,range=0;
    if(ebur128_loudness_momentary(state_,&m)!=EBUR128_SUCCESS||
       ebur128_loudness_shortterm(state_,&s)!=EBUR128_SUCCESS||
       ebur128_loudness_global(state_,&integrated)!=EBUR128_SUCCESS||
       ebur128_loudness_range(state_,&range)!=EBUR128_SUCCESS)throw std::runtime_error("METER_QUERY_FAILED");
    raw_.loudnessFrame=frame_;
    raw_.momentary=loudnessMetric(m,frame_>=rate_*4ULL/10);
    raw_.shortTerm=loudnessMetric(s,frame_>=rate_*3ULL);
    raw_.integrated=loudnessMetric(integrated,frame_>=rate_*4ULL/10);
    raw_.range={range,frame_>=rate_*3ULL&&std::isfinite(integrated)?MetricStatus::Ready:MetricStatus::Insufficient};
}
void Meter::finish(){
    if(finished_)return;
    if(!frame_){finished_=true;return;}
    if(hopFrames_)finishHop();
    if(!pendingCount_)throw std::runtime_error("METER_EOF_FRAME_MISSING");
    auto& last=pending_[(pendingHead_+pendingCount_-1)%pending_.size()];
    if(raw_.loudnessFrame!=frame_){
        measureLoudness();last.values=raw_;last.loud=true;last.loudFlags=loudnessFlags_;loudnessFlags_=0;
    }
    // Zero extension resolves TP lookahead and the final LRA context. These
    // samples never change the real frame count or real-EOF M/S/I/RMS/Peak.
    finalizing_=true;
    std::array<float,kBlockFrames*2> zeros{};
    uint32_t remaining=std::max<uint32_t>(64,(rate_*3+1)/2);
    while(remaining){
        const auto count=std::min<uint32_t>(remaining,kBlockFrames);
        if(ebur128_add_frames_float(state_,zeros.data(),count)!=EBUR128_SUCCESS)throw std::runtime_error("METER_FINAL_CONTEXT_FAILED");
        if(tpFault_)throw std::runtime_error("TRUE_PEAK_TIMELINE_FAILED");
        remaining-=count;
    }
    if(raw_.range.status==MetricStatus::Ready){
        double range=0;
        if(ebur128_loudness_range(state_,&range)!=EBUR128_SUCCESS||!std::isfinite(range))throw std::runtime_error("LRA_QUERY_FAILED");
        last.values.range={range,MetricStatus::Ready};
    }
    publishReady();
    if(pendingCount_||current_.frame!=frame_)throw std::runtime_error("METER_EOF_NOT_DRAINED");
    finished_=true;
}
std::vector<WavePoint> Meter::waveform(unsigned seconds, size_t columns) const {
    seconds = std::clamp(seconds, 1u, 60u);
    columns = std::clamp<size_t>(columns, 1, 1200);
    const uint64_t count = std::min<uint64_t>(waveCount_, seconds * 100);
    std::vector<WavePoint> result;
    result.reserve(std::min<uint64_t>(count, columns));
    const uint64_t stride = std::max<uint64_t>(1, (count + columns - 1) / columns);
    for (uint64_t i = waveCount_ - count; i < waveCount_; i += stride) {
        WavePoint point = waves_[i % waves_.size()];
        for (uint64_t j = i + 1; j < std::min(waveCount_, i + stride); ++j) {
            const auto& next = waves_[j % waves_.size()];
            for (uint32_t c = 0; c < channels_; ++c) {
                point.minimum[c] = std::min(point.minimum[c], next.minimum[c]);
                point.maximum[c] = std::max(point.maximum[c], next.maximum[c]);
            }
            point.frame = next.frame;
            point.flags |= next.flags;
        }
        result.push_back(point);
    }
    return result;
}
std::vector<LoudnessPoint> Meter::loudnessHistory(unsigned seconds) const {
    const auto count = std::min<uint64_t>(loudnessCount_, std::clamp(seconds, 1u, 60u) * 10);
    std::vector<LoudnessPoint> result;
    result.reserve(static_cast<size_t>(count));
    for (uint64_t i = loudnessCount_ - count; i < loudnessCount_; ++i) result.push_back(loudness_[i % loudness_.size()]);
    return result;
}
}
