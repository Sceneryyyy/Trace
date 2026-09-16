#pragma once
#include "AudioTypes.h"
#include <algorithm>
#include <cstdint>
namespace Trace {
struct ClockMapping {
    uint64_t firstFrame = 0, paddingFrames = 0;
    uint32_t flags = 0;
};
// Single capture-thread owner. Converts native 100 ns anchors, never UI time.
// Idle coverage lags native time by 50 ms to allow delayed real packets to arrive.
// If that estimate collides with late audio, retain the audio and report Overlap;
// it is never silently discarded or described as lossless.
class CaptureClock {
    uint32_t rate_;
    uint64_t origin_, end_ = 0, anchorQpc_, anchorFrame_ = 0, deviceEnd_ = 0;
    uint64_t lastPacketArrival_ = 0;
    bool havePacket_ = false, estimatedSincePacket_ = false, validAnchor_ = true;
    uint64_t framesBetween(uint64_t a, uint64_t b) const noexcept {
        if (b <= a) return 0;
        const auto delta = b - a;
        return (delta / 10000000) * rate_ + (delta % 10000000) * rate_ / 10000000;
    }
public:
    CaptureClock(uint32_t rate, uint64_t origin) : rate_(rate), origin_(origin), anchorQpc_(origin), lastPacketArrival_(origin) {}
    uint64_t end() const noexcept { return end_; }
    uint64_t qpcAtFrame(uint64_t frame) const noexcept {
        if(!validAnchor_)return 0;
        const auto delta=frame>=anchorFrame_?frame-anchorFrame_:anchorFrame_-frame;
        const auto whole=(delta/rate_)*10000000ULL;
        const auto remainder=(delta%rate_)*10000000ULL;
        if(frame>=anchorFrame_)return anchorQpc_+whole+remainder/rate_;
        const auto back=whole+(remainder+rate_-1)/rate_;
        return back>anchorQpc_?0:anchorQpc_-back;
    }
    ClockMapping packet(uint64_t device, uint64_t qpc, uint32_t frames, uint32_t wasapiFlags, uint64_t arrival) noexcept {
        ClockMapping result;
        if (wasapiFlags & 2) result.flags |= Silent;
        if ((wasapiFlags & 1) && havePacket_) result.flags |= Gap;
        const bool timestampValid = !(wasapiFlags & 4) && qpc > 0;
        if (!timestampValid) result.flags |= TimestampError | Gap;
        uint64_t target = end_;
        const uint64_t tolerance = std::max<uint64_t>(rate_ / 40, frames * 4ULL);
        if (timestampValid && validAnchor_) {
            const auto byQpc = anchorFrame_ + framesBetween(anchorQpc_, qpc);
            const bool jumped = byQpc > end_ && byQpc - end_ > tolerance;
            if (!havePacket_ || estimatedSincePacket_ || jumped) target = byQpc;
            if (havePacket_ && device != deviceEnd_) {
                result.flags |= Gap;
                if (device < deviceEnd_) result.flags |= Overlap;
                target = std::max(target, byQpc);
            }
            if (qpc < anchorQpc_) result.flags |= TimestampError | Gap;
        }
        if (target > end_) {
            result.paddingFrames = target - end_;
            if (!(result.flags & Gap)) result.flags |= EstimatedSilence;
        } else if (target < end_ && end_ - target > rate_ / 500) {
            result.flags |= Overlap | Gap;
        }
        result.firstFrame = std::max(end_, target);
        if (timestampValid) {
            anchorQpc_ = qpc;
            anchorFrame_ = result.firstFrame;
            validAnchor_ = true;
        } else {
            validAnchor_ = false;
        }
        end_ = result.firstFrame + frames;
        deviceEnd_ = device + frames;
        havePacket_ = true;
        estimatedSincePacket_ = false;
        lastPacketArrival_ = arrival;
        return result;
    }
    uint64_t idle(uint64_t now) noexcept {
        if (!validAnchor_ || now <= lastPacketArrival_ || now - lastPacketArrival_ < 1000000) return 0;
        const auto safeNow = now > 500000 ? now - 500000 : origin_;
        const auto target = anchorFrame_ + framesBetween(anchorQpc_, safeNow);
        if (target <= end_) return 0;
        const auto count = target - end_;
        end_ = target;
        estimatedSincePacket_ = true;
        return count;
    }
};
}
