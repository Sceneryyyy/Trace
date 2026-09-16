#pragma once
#include "AudioTypes.h"
#include "Meter.h"
#include "Overview.h"
#include "ReplayBuffer.h"
#include "SpscQueue.h"
#include "WavFile.h"
#include <atomic>
#include <condition_variable>
#include <filesystem>
#include <mutex>
#include <thread>
namespace Trace {
enum class RecordPhase { Idle, Preparing, Armed, Recording, Draining, Complete, Failed };
enum class RecordFailure { None, Backpressure, CaptureGap, SourceStopped, Disk, StartTimeout };
struct RecordOptions {
    std::string id;
    std::filesystem::path basePath,journalPath;
    SourceFormat format;
    WavEncoding encoding=WavEncoding::Pcm24;
    WavOptions wav;
    unsigned writerDelayMs=0; // Native fault tests only.
};
struct RecordSnapshot {
    RecordPhase phase=RecordPhase::Idle;
    std::string id,error;
    SourceFormat format;
    WavEncoding encoding=WavEncoding::Pcm24;
    uint64_t startFrame=UINT64_MAX,endFrame=UINT64_MAX,acceptedFrames=0,writtenFrames=0,estimatedFrames=0,clippedSamples=0;
    uint64_t startQpc100ns=UINT64_MAX,endQpc100ns=UINT64_MAX;
    bool startQpcEstimated=false,endQpcEstimated=false;
    size_t queueDepth=0,queueHighWater=0;
    MeterValues meters;
    std::vector<WavSegment> segments;
    std::vector<WavePoint> waveform;
    std::vector<LoudnessPoint> loudness;
};
class Recorder {
    using Queue=SpscQueue<AudioBlock,kQueueBlocks>;
    std::unique_ptr<Queue> queue_;
    std::thread worker_;
    std::atomic<RecordPhase> phase_{RecordPhase::Idle};
    std::atomic<RecordFailure> failure_{RecordFailure::None};
    std::atomic<bool> stopRequested_{false};
    std::atomic<unsigned> inFlight_{0};
    std::atomic<uint64_t> generation_{0};
    std::atomic<uint64_t> startFrame_{UINT64_MAX},endFrame_{UINT64_MAX},accepted_{0},estimated_{0},highWater_{0};
    mutable std::mutex mutex_;
    std::condition_variable ready_;
    bool readyDone_=false;
    RecordSnapshot published_;
    std::unique_ptr<ReplayBuffer> replay_;
    Overview<WavePoint> waves_;
    Overview<LoudnessPoint> loudness_;
    void run(RecordOptions options);
public:
    ~Recorder();
    bool busy() const noexcept;
    void prepare(RecordOptions options);
    void requestStop() noexcept;
    // Only the single capture producer calls these during a stream.
    void boundary() noexcept;
    void push(const AudioBlock& block) noexcept;
    void sourceFailed(RecordFailure failure=RecordFailure::SourceStopped) noexcept;
    // Call only after capture has joined (or in a producer-free test).
    void finishAfterProducerStopped();
    RecordSnapshot snapshot() const;
    std::shared_ptr<const ReplayClip> freezeReplay() const;
};
const char* recordPhaseName(RecordPhase phase);
}
