#pragma once
#include "AudioTypes.h"
#include "Meter.h"
#include "ReplayBuffer.h"
#include "Recorder.h"
#include "SpscQueue.h"
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>
namespace Trace {
std::vector<Device> listDevices();
struct Snapshot {
    SourceFormat format;
    std::string deviceId, error;
    uint64_t replayFrames=0,replayCapacityFrames=0;
    uint64_t captureEpoch = 0, measurementEpoch = 0, position = 0, measurementFrames = 0;
    uint64_t capturedFrames = 0, analyzedFrames = 0, estimatedFrames = 0, droppedFrames = 0;
    uint64_t discontinuities = 0, timestampErrors = 0, overlapEvents = 0, meterLagFrames = 0;
    size_t queueDepth = 0, queueHighWater = 0;
    uint32_t endpointBufferFrames = 0, errorSite = 0, truePeakLookaheadFrames = 0, sourceErrorCode = 0;
    bool active = false, estimated = false, gaps = false, sourceRecoverable = false;
    MeterValues meters;
    std::vector<WavePoint> waveform;
    std::vector<LoudnessPoint> loudness;
};
class Engine {
    using Queue = SpscQueue<AudioBlock, kQueueBlocks>;
    std::unique_ptr<Queue> queue_;
    std::unique_ptr<Meter> meter_;
    Recorder recorder_;
    std::unique_ptr<ReplayBuffer> replay_;
    std::shared_ptr<const ReplayClip> frozenReplay_;
    std::thread captureThread_, analysisThread_;
    std::atomic<bool> stopCapture_{false}, stopAnalysis_{false}, active_{false};
    std::atomic<uint64_t> resetRequest_{0};
    std::atomic<uint64_t> captured_{0}, analyzed_{0}, estimated_{0}, dropped_{0};
    std::atomic<uint64_t> discontinuities_{0}, timestampErrors_{0}, overlaps_{0}, highWater_{0};
    std::atomic<long> failure_{0};
    std::atomic<uint32_t> failureSite_{0};
    std::mutex startupMutex_, meterMutex_;
    std::condition_variable startupCondition_;
    bool startupDone_ = false;
    std::string startupError_, deviceId_;
    SourceFormat format_;
    uint32_t endpointBufferFrames_ = 0;
    uint64_t captureEpoch_ = 0, measurementEpoch_ = 0, analysisEnd_ = 0, analysisBase_ = 0;
    bool measurementGap_ = false, measurementEstimated_ = false;
    void captureLoop(std::string id);
    void analysisLoop();
    void started(const std::string& error = {});
public:
    ~Engine();
    std::shared_ptr<const ReplayClip> freezeReplay(bool recording=false);
    void releaseReplay(){frozenReplay_.reset();}
    std::shared_ptr<const ReplayClip> frozenReplay()const;
    void start(const std::string& deviceId);
    void stop(bool force = false);
    void recordStart(const std::string& id, const std::filesystem::path& path, WavEncoding encoding, WavOptions options = {}, const std::filesystem::path& journal = {});
    void recordStop();
    RecordSnapshot recordSnapshot() const;
    void reset();
    Snapshot snapshot(unsigned seconds = 30, size_t columns = 800);
};
}
