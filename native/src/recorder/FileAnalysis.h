#pragma once
#include "AudioTypes.h"
#include <filesystem>
#include <functional>
#include <vector>
namespace Trace {
inline constexpr uint32_t kAnalysisSchema = 1;
inline constexpr uint32_t kAnalysisPageRecords = 1024;
inline constexpr uint32_t kAnalysisHeaderBytes = 64;
inline constexpr uint32_t kLevelRecordBytes = 128;
inline constexpr uint32_t kLoudnessRecordBytes = 96;
inline constexpr uint32_t kWaveRecordBytes = 40;
inline constexpr uint32_t kWaveLodCount = 6;
struct FileAnalysisOptions {
    uint32_t readFrames = 2048;
    std::function<bool()> cancelled;
    std::function<void(uint64_t, uint64_t)> progress;
    uint64_t startFrame=0,endFrame=UINT64_MAX;
};
struct AnalysisStreamInfo {
    std::string file;
    uint32_t kind = 0, recordBytes = 0, stride = 1;
    uint64_t records = 0, pages = 0;
};
struct FileAnalysisResult {
    uint32_t sampleRate = 0, channels = 0;
    uint64_t frames = 0;
    MeterValues summary;
    std::vector<AnalysisStreamInfo> streams;
};
// All sources must share rate and channel layout. A new directory is required.
// PCM stays in fixed buffers; no cache is published as ready by this function.
FileAnalysisResult analyzeFiles(const std::vector<std::filesystem::path>& sources,
    const std::filesystem::path& newDirectory, const FileAnalysisOptions& options = {});
uint32_t analysisCrc32(const uint8_t* bytes, size_t count);
}
