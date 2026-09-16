#include "WaveSequence.h"
#include <algorithm>
#include <stdexcept>
namespace Trace {
WaveSequence::WaveSequence(std::vector<std::filesystem::path> sources,uint64_t start,uint64_t end):sources_(std::move(sources)){
    if(sources_.empty()||sources_.size()>10000)throw std::runtime_error("INVALID_PLAYBACK_SOURCES");
    for(const auto& source:sources_){
        const auto info=inspectWav(source);
        if(ends_.empty())format_=info.format;
        if(info.format.sampleRate!=format_.sampleRate||info.format.channels!=format_.channels)
            throw std::runtime_error("PLAYBACK_REQUIRES_UNIFIED_FORMAT");
        if(info.frames>UINT64_MAX-frames_)throw std::runtime_error("PLAYBACK_FILE_TOO_LONG");
        frames_+=info.frames;ends_.push_back(frames_);
    }
    const auto finish=end==UINT64_MAX?frames_:end;
    if(start>finish||finish>frames_)throw std::runtime_error("INVALID_PLAYBACK_SOURCE_RANGE");
    origin_=start;position_=start;frames_=finish-start;
}
WaveSequence::WaveSequence(std::shared_ptr<const ReplayClip> memory):memory_(std::move(memory)){if(!memory_)throw std::runtime_error("REPLAY_NOT_READY");format_=memory_->format;frames_=memory_->frames();}
void WaveSequence::seek(uint64_t frame){
    if(frame>frames_)throw std::runtime_error("PLAYBACK_POSITION_OUT_OF_RANGE");
    if(frame==frames_){position_=origin_+frame;return;}
    if(memory_){position_=frame;return;}
    frame+=origin_;
    const auto index=static_cast<size_t>(std::upper_bound(ends_.begin(),ends_.end(),frame)-ends_.begin());
    if(index_!=index){
        reader_=std::make_unique<WavReader>(sources_[index]);index_=index;
        const auto expected=ends_[index]-(index?ends_[index-1]:0);
        if(reader_->info().frames!=expected||reader_->info().format.sampleRate!=format_.sampleRate||reader_->info().format.channels!=format_.channels)
            throw std::runtime_error("PLAYBACK_SOURCE_CHANGED");
    }
    reader_->seek(frame-(index?ends_[index-1]:0));position_=frame;
}
uint32_t WaveSequence::read(float* output,uint32_t maximum){
    if(memory_){const auto count=memory_->read(position_,output,maximum);position_+=count;return count;}
    const auto target=static_cast<uint32_t>(std::min<uint64_t>(maximum,frames_-(position_-origin_)));
    uint32_t done=0;
    while(done<target){
        if(index_==SIZE_MAX||position_==ends_[index_])seek(position_-origin_);
        const auto count=reader_->read(output+static_cast<size_t>(done)*format_.channels,
            static_cast<uint32_t>(std::min<uint64_t>(target-done,ends_[index_]-position_)));
        if(!count)throw std::runtime_error("PLAYBACK_SOURCE_TRUNCATED");
        done+=count;position_+=count;
    }
    return done;
}
}
