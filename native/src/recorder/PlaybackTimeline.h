#pragma once
#include <algorithm>
#include <cstdint>
#include <intrin.h>
#include <stdexcept>
namespace Trace {
inline uint64_t playbackMulDiv(uint64_t value,uint64_t numerator,uint64_t denominator){
    if(!denominator)throw std::runtime_error("PLAYBACK_CLOCK_FREQUENCY_ZERO");
    unsigned __int64 high=0,remainder=0;
    const auto low=_umul128(value,numerator,&high);
    if(high>=denominator)throw std::runtime_error("PLAYBACK_CLOCK_OVERFLOW");
    return _udiv128(high,low,denominator,&remainder);
}
struct PlaybackPlan {
    uint64_t generation=0,position=0,totalFrames=0,loopStart=0,loopEnd=0;
    bool loop=false;
    void validate() const {
        if(position>totalFrames)throw std::runtime_error("PLAYBACK_POSITION_OUT_OF_RANGE");
        if(loop&&(loopStart>=loopEnd||loopEnd>totalFrames||position<loopStart||position>=loopEnd))
            throw std::runtime_error("INVALID_PLAYBACK_LOOP");
    }
    uint64_t fileFrame(uint64_t streamFrames) const {
        if(!loop)return position+std::min(streamFrames,totalFrames-position);
        const auto length=loopEnd-loopStart,relative=position-loopStart,advance=streamFrames%length;
        return loopStart+(advance>=length-relative?advance-(length-relative):relative+advance);
    }
    uint64_t remaining(uint64_t streamFrames) const {
        return loop?UINT64_MAX:totalFrames-position-std::min(streamFrames,totalFrames-position);
    }
    uint64_t loopsAt(uint64_t streamFrames) const {
        if(!loop)return 0;
        const auto length=loopEnd-loopStart,relative=position-loopStart;
        return streamFrames/length+(streamFrames%length>=length-relative?1:0);
    }
};
}
