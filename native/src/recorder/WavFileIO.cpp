#include "WavFileIO.h"

#include <stdexcept>
#include <string>

#ifdef _WIN32
#include <windows.h>
#else
#include <cerrno>
#include <fcntl.h>
#include <limits>
#include <unistd.h>
#endif

namespace Trace {
namespace {

[[noreturn]] void ioError(const char* operation, uint32_t code) {
#ifdef _WIN32
    throw std::runtime_error(std::string(operation) + " (Win32 " + std::to_string(code) + ")");
#else
    const char* name = code == EEXIST ? "EEXIST" : code == ENOSPC ? "ENOSPC" :
                       code == EACCES ? "EACCES" : code == EPERM ? "EPERM" : "ERROR";
    throw std::runtime_error(std::string(operation) + " (" + name + ", POSIX " + std::to_string(code) + ")");
#endif
}

} // namespace

struct WavFileIO::Impl {
#ifdef _WIN32
    HANDLE value = INVALID_HANDLE_VALUE;
#else
    int value = -1;
#endif
};

WavFileIO::WavFileIO() : impl_(std::make_unique<Impl>()) {}
WavFileIO::~WavFileIO() { close(); }

bool WavFileIO::isOpen() const noexcept {
#ifdef _WIN32
    return impl_->value != INVALID_HANDLE_VALUE;
#else
    return impl_->value >= 0;
#endif
}

void WavFileIO::openNew(const std::filesystem::path& path) {
    if (isOpen()) throw std::runtime_error("WAV_FILE_ALREADY_OPEN");
#ifdef _WIN32
    impl_->value = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ,
                               nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (!isOpen()) ioError("WAV_CREATE_FAILED", GetLastError());
#else
    impl_->value = ::open(path.c_str(), O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC, 0666);
    if (!isOpen()) ioError("WAV_CREATE_FAILED", static_cast<uint32_t>(errno));
#endif
}

void WavFileIO::position(uint64_t offset) {
#ifdef _WIN32
    LARGE_INTEGER distance;
    distance.QuadPart = static_cast<LONGLONG>(offset);
    if (!SetFilePointerEx(impl_->value, distance, nullptr, FILE_BEGIN))
        ioError("WAV_SEEK_FAILED", GetLastError());
#else
    if (offset > static_cast<uint64_t>(std::numeric_limits<off_t>::max()))
        throw std::runtime_error("WAV_SEEK_FAILED: offset out of range");
    if (::lseek(impl_->value, static_cast<off_t>(offset), SEEK_SET) == static_cast<off_t>(-1))
        ioError("WAV_SEEK_FAILED", static_cast<uint32_t>(errno));
#endif
}

WavFileIO::WriteResult WavFileIO::writeSome(const void* bytes, uint32_t count) {
    if (!count) return {};
#ifdef _WIN32
    DWORD written = 0;
    const BOOL ok = WriteFile(impl_->value, bytes, count, &written, nullptr);
    return {written, ok ? 0u : GetLastError()};
#else
    ssize_t written;
    do {
        written = ::write(impl_->value, bytes, count);
    } while (written < 0 && errno == EINTR);
    if (written < 0) return {0, static_cast<uint32_t>(errno)};
    return {static_cast<uint32_t>(written), 0};
#endif
}

void WavFileIO::write(const void* bytes, uint32_t count) {
    uint32_t offset = 0;
    while (offset < count) {
        const auto result = writeSome(static_cast<const uint8_t*>(bytes) + offset, count - offset);
        offset += result.written;
        if (result.error) writeFailure(result.error);
        if (!result.written) throw std::runtime_error("WAV_WRITE_NO_PROGRESS");
    }
}

void WavFileIO::flush() {
#ifdef _WIN32
    if (!FlushFileBuffers(impl_->value)) ioError("WAV_FLUSH_FAILED", GetLastError());
#else
    if (::fsync(impl_->value) != 0) ioError("WAV_FLUSH_FAILED", static_cast<uint32_t>(errno));
#endif
}

void WavFileIO::close() noexcept {
    if (!isOpen()) return;
#ifdef _WIN32
    CloseHandle(impl_->value);
    impl_->value = INVALID_HANDLE_VALUE;
#else
    ::close(impl_->value);
    impl_->value = -1;
#endif
}

void WavFileIO::writeFailure(uint32_t error) { ioError("WAV_WRITE_FAILED", error); }

void publishNewFileAtomic(const std::filesystem::path& source,
                          const std::filesystem::path& target) {
#ifdef _WIN32
    if (!MoveFileW(source.c_str(), target.c_str()))
        ioError("PUBLISH_NEW_FILE_FAILED", GetLastError());
#else
    // A hard link makes the destination visible atomically and fails if it exists.
    // The temporary and final files are expected to be on the same filesystem.
    if (::link(source.c_str(), target.c_str()) != 0)
        ioError("PUBLISH_NEW_FILE_FAILED", static_cast<uint32_t>(errno));
    if (::unlink(source.c_str()) != 0)
        ioError("PUBLISH_NEW_FILE_FAILED", static_cast<uint32_t>(errno));
#endif
}

} // namespace Trace
