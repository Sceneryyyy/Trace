#pragma once
#include "WavFile.h"
#include "ReplayBuffer.h"
namespace Trace {
// Owned exclusively by the file decoder, never called by the render thread.
class WaveSequence {
    std::vector<std::filesystem::path> sources_;
    std::vector<uint64_t> ends_;
    std::unique_ptr<WavReader> reader_;
    SourceFormat format_;
    std::shared_ptr<const ReplayClip> memory_;
    uint64_t frames_=0,position_=0,origin_=0;
    size_t index_=SIZE_MAX;
public:
    explicit WaveSequence(std::vector<std::filesystem::path> sources,uint64_t start=0,uint64_t end=UINT64_MAX);
    explicit WaveSequence(std::shared_ptr<const ReplayClip> memory);
    const SourceFormat& format() const{return format_;}
    uint64_t frames() const{return frames_;}
    void seek(uint64_t frame);
    uint32_t read(float* output,uint32_t maximumFrames);
};
}
