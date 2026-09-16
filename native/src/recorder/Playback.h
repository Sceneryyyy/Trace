#pragma once
#include "AudioTypes.h"
#include "ReplayBuffer.h"
#include <filesystem>
#include <memory>
#include <vector>
namespace Trace {
struct PlaybackOptions {
    std::string id,deviceId;
    std::vector<std::filesystem::path> sources;
    std::shared_ptr<const ReplayClip> memory;
    uint64_t startFrame=0,endFrame=UINT64_MAX;
    bool rawMode=true;
    unsigned decoderDelayMs=0; // Explicit native fault tests only.
};
struct PlaybackSnapshot {
    std::string id,deviceId,phase="idle",error;
    SourceFormat format;
    uint64_t generation=0,positionFrame=0,totalFrames=0,presentedStreamFrames=0,submittedFrames=0;
    uint64_t clockPosition=0,clockFrequency=0,clockQpc100ns=0,loopStart=0,loopEnd=0,loops=0;
    uint32_t outputRate=0,outputChannels=0,bufferFrames=0,paddingFrames=0;
    size_t queueDepth=0,queueHighWater=0;
    bool playing=false,loop=false,clockAccurate=false,rawModeApplied=false;
};
class Playback {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    Playback();
    ~Playback();
    // Run open/close on a non-UI worker; neither operation renders audio itself.
    PlaybackSnapshot open(PlaybackOptions options);
    void close();
    void play();
    void pause();
    uint64_t seek(uint64_t position,bool resume,bool loop,uint64_t loopStart,uint64_t loopEnd);
    void volume(float gain);
    PlaybackSnapshot snapshot() const;
};
}
