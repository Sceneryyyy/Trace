#pragma once
#include "AudioTypes.h"
#include <filesystem>
#include <memory>
#include <vector>
namespace Trace {
enum class WavEncoding { Pcm16, Pcm24, Float32 };
struct WavInfo {
    SourceFormat format;
    uint64_t dataOffset = 0, dataBytes = 0, frames = 0;
};
struct WavSegment {
    std::filesystem::path path;
    uint64_t frames = 0, bytes = 0, clippedSamples = 0;
};
struct WavOptions {
    uint64_t segmentBytes = 2ULL * 1024 * 1024 * 1024;
    // Fault injection for file-unit tests, not exposed to the renderer.
    uint64_t failAfterPayloadBytes = UINT64_MAX;
};
class WavWriter {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    WavWriter(const std::filesystem::path& basePath, uint32_t rate, uint32_t channels,
              WavEncoding encoding, WavOptions options = {});
    ~WavWriter();
    void append(const float* interleaved, uint32_t frames);
    void checkpoint();
    void close();
    uint64_t frames() const;
    uint64_t clippedSamples() const;
    const std::vector<WavSegment>& segments() const;
    uint32_t bytesPerFrame() const;
};
WavInfo inspectWav(const std::filesystem::path& path, bool allowUnfinished = false);
class WavReader {
    struct Impl;
    std::unique_ptr<Impl> impl_;
public:
    explicit WavReader(const std::filesystem::path& path);
    ~WavReader();
    const WavInfo& info() const;
    uint32_t read(float* interleaved, uint32_t maximumFrames);
    void seek(uint64_t frame);
};
// Atomic same-volume publish; fails if the destination already exists.
void publishNewFile(const std::filesystem::path& source,const std::filesystem::path& target);
// Writes a NEW copy; never changes the only surviving source.
WavInfo recoverWav(const std::filesystem::path& source, const std::filesystem::path& target);

struct WavConversion {
    SourceFormat format;
    uint64_t frames=0,clippedSamples=0;
    std::vector<WavSegment> segments;
};
// Stream continuous same-rate files through the same quantizer used by REC.
// This does not resample; callers normalize the rate/layout first.
WavConversion convertWavs(const std::vector<std::filesystem::path>& sources,
                          const std::filesystem::path& base,WavEncoding encoding,WavOptions options={});
}
