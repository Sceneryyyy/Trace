#pragma once
#include <array>
#include <cstdint>
#include <string>
namespace Trace {
constexpr uint32_t kBlockFrames = 2048;
constexpr uint32_t kQueueBlocks = 256;
enum BlockFlag : uint32_t {
    Silent = 1, EstimatedSilence = 2, Gap = 4, TimestampError = 8, Overlap = 16, Missing = 32
};
struct SourceFormat {
    uint32_t sampleRate = 0, channels = 0, containerBits = 0, validBits = 0, blockAlign = 0, channelMask = 0;
    bool floatingPoint = false;
};
struct Device {
    std::string id, label, error;
    bool isDefault = false;
    SourceFormat format;
};
struct AudioBlock {
    uint64_t sequence = 0, firstFrame = 0, deviceFrame = 0, qpc100ns = 0;
    uint32_t frames = 0, flags = 0, qpcOffsetFrames = 0;
    std::array<float, kBlockFrames * 2> samples{};
};
enum class MetricStatus { Ready, Silence, Insufficient, Gap, Error };
struct Metric {
    double value = 0;
    MetricStatus status = MetricStatus::Insufficient;
};
struct Levels { Metric peak, rms, truePeak; };
struct MeterValues {
    uint64_t frame = 0, loudnessFrame = 0;
    std::array<Levels, 2> channels;
    Metric momentary, shortTerm, integrated, range, maxTruePeak;
};
struct WavePoint {
    uint64_t frame = 0;
    std::array<float, 2> minimum{}, maximum{};
    uint32_t flags = 0;
};
struct LoudnessPoint {
    uint64_t frame = 0;
    Metric momentary, shortTerm, integrated;
    uint32_t flags = 0;
};
}
