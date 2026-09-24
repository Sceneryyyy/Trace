#pragma once

#include <cstdint>
#include <filesystem>
#include <memory>

namespace Trace {

// The WAV writer owns a file exclusively. Capture callbacks never use this API.
class WavFileIO {
public:
    struct WriteResult {
        uint32_t written = 0;
        uint32_t error = 0;
    };

    WavFileIO();
    ~WavFileIO();
    WavFileIO(const WavFileIO&) = delete;
    WavFileIO& operator=(const WavFileIO&) = delete;

    bool isOpen() const noexcept;
    void openNew(const std::filesystem::path& path);
    void position(uint64_t offset);
    WriteResult writeSome(const void* bytes, uint32_t count);
    void write(const void* bytes, uint32_t count);
    void flush();
    void close() noexcept;
    [[noreturn]] static void writeFailure(uint32_t error);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

// Publish a completed file without replacing an existing target.
void publishNewFileAtomic(const std::filesystem::path& source,
                          const std::filesystem::path& target);

} // namespace Trace
