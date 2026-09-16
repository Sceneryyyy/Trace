#include "WavFile.h"
#include "Decode.h"
#include <windows.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <limits>
#include <sstream>
#include <stdexcept>
namespace Trace {
namespace {
void ioError(const char* operation) {
    throw std::runtime_error(std::string(operation) + " (Win32 " + std::to_string(GetLastError()) + ")");
}
struct File {
    HANDLE value = INVALID_HANDLE_VALUE;
    ~File() { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    void open(const std::filesystem::path& path) {
        value = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ,
                            nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (value == INVALID_HANDLE_VALUE) ioError("WAV_CREATE_FAILED");
    }
    void position(uint64_t offset) {
        LARGE_INTEGER distance; distance.QuadPart = static_cast<LONGLONG>(offset);
        if (!SetFilePointerEx(value, distance, nullptr, FILE_BEGIN)) ioError("WAV_SEEK_FAILED");
    }
    void write(const void* bytes, uint32_t count) {
        uint32_t offset = 0;
        while (offset < count) {
            DWORD written = 0;
            if (!WriteFile(value, static_cast<const uint8_t*>(bytes) + offset, count - offset, &written, nullptr))
                ioError("WAV_WRITE_FAILED");
            if (!written) throw std::runtime_error("WAV_WRITE_NO_PROGRESS");
            offset += written;
        }
    }
    void flush() { if (!FlushFileBuffers(value)) ioError("WAV_FLUSH_FAILED"); }
    void close() { if (value != INVALID_HANDLE_VALUE) { CloseHandle(value); value = INVALID_HANDLE_VALUE; } }
};
void put16(std::vector<uint8_t>& out, uint16_t value) {
    out.push_back(static_cast<uint8_t>(value)); out.push_back(static_cast<uint8_t>(value >> 8));
}
void put32(std::vector<uint8_t>& out, uint32_t value) {
    for (unsigned i = 0; i < 4; ++i) out.push_back(static_cast<uint8_t>(value >> (i * 8)));
}
void fourcc(std::vector<uint8_t>& out, const char* value) { out.insert(out.end(), value, value + 4); }
uint16_t u16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
uint32_t u32(const uint8_t* p) {
    return uint32_t(p[0]) | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
}
void readExact(std::istream& in, void* output, size_t bytes) {
    in.read(static_cast<char*>(output), static_cast<std::streamsize>(bytes));
    if (static_cast<size_t>(in.gcount()) != bytes) throw std::runtime_error("WAV_TRUNCATED");
}
std::vector<uint8_t> header(uint32_t rate, uint32_t channels, WavEncoding encoding, uint32_t dataBytes, bool padded) {
    const bool floating = encoding == WavEncoding::Float32;
    const uint32_t bits = floating ? 32 : encoding == WavEncoding::Pcm24 ? 24 : 16;
    const uint32_t align = channels * bits / 8, offset = floating ? 58 : 44;
    std::vector<uint8_t> out; out.reserve(offset);
    fourcc(out, "RIFF"); put32(out, offset - 8 + dataBytes + (padded ? dataBytes % 2 : 0));
    fourcc(out, "WAVE"); fourcc(out, "fmt "); put32(out, floating ? 18 : 16);
    put16(out, floating ? 3 : 1); put16(out, static_cast<uint16_t>(channels));
    put32(out, rate); put32(out, rate * align); put16(out, static_cast<uint16_t>(align)); put16(out, static_cast<uint16_t>(bits));
    if (floating) { put16(out, 0); fourcc(out, "fact"); put32(out, 4); put32(out, dataBytes / align); }
    fourcc(out, "data"); put32(out, dataBytes); return out;
}
}
struct WavWriter::Impl {
    std::filesystem::path base;
    uint32_t rate, channels, align, bits, dataOffset;
    WavEncoding encoding;
    WavOptions options;
    File file;
    std::vector<uint8_t> buffer;
    std::vector<WavSegment> segments;
    uint64_t currentBytes = 0, totalBytes = 0, completeFrames = 0, clips = 0;
    bool closed = false, failed = false;
    Impl(const std::filesystem::path& path, uint32_t r, uint32_t c, WavEncoding e, WavOptions o)
        : base(path), rate(r), channels(c), encoding(e), options(o) {
        if (r < 8000 || r > 96000 || (c != 1 && c != 2)) throw std::runtime_error("UNSUPPORTED_WAV_FORMAT");
        bits = e == WavEncoding::Float32 ? 32 : e == WavEncoding::Pcm24 ? 24 : 16;
        align = c * bits / 8; dataOffset = e == WavEncoding::Float32 ? 58 : 44;
        options.segmentBytes = std::min<uint64_t>(options.segmentBytes, 2ULL * 1024 * 1024 * 1024);
        options.segmentBytes -= options.segmentBytes % align;
        if (options.segmentBytes < align) throw std::runtime_error("WAV_SEGMENT_LIMIT_TOO_SMALL");
        buffer.resize(kBlockFrames * align);
        openSegment();
    }
    void openSegment() {
        const auto index = segments.size() + 1;
        std::wostringstream suffix; suffix << L"-" << index << L".wav";
        auto output = base.parent_path() / (base.stem().wstring() + suffix.str());
        file.open(output);
        segments.push_back({output, 0, 0}); currentBytes = 0;
        const auto initial = header(rate, channels, encoding, 0, false);
        file.write(initial.data(), static_cast<uint32_t>(initial.size()));
    }
    void updateHeader(bool final) {
        const auto goodBytes = static_cast<uint32_t>(currentBytes - currentBytes % align);
        const auto h = header(rate, channels, encoding, goodBytes, final);
        file.position(0); file.write(h.data(), static_cast<uint32_t>(h.size()));
        file.position(dataOffset + currentBytes + (final ? goodBytes % 2 : 0));
        segments.back().frames = goodBytes / align;
        segments.back().bytes = goodBytes;
    }
    void closeSegment() {
        if (file.value == INVALID_HANDLE_VALUE) return;
        const auto goodBytes = currentBytes - currentBytes % align;
        if (!failed && goodBytes % 2) {
            file.position(dataOffset + goodBytes);
            const uint8_t pad = 0; file.write(&pad, 1);
        }
        updateHeader(!failed);
        file.flush(); file.close();
        completeFrames += goodBytes / align;
        currentBytes = 0;
    }
    void countClips(const float* input, uint32_t frames) {
        if (encoding == WavEncoding::Float32) return;
        for (size_t i=0;i<static_cast<size_t>(frames)*channels;++i)
            if (input[i] > 1 || input[i] < -1) { ++clips; ++segments.back().clippedSamples; }
    }
    void encode(const float* input, uint32_t frames) {
        for (size_t i = 0; i < static_cast<size_t>(frames) * channels; ++i) {
            const float sample = input[i];
            if (!std::isfinite(sample)) throw std::runtime_error("WAV_NONFINITE_AUDIO");
            if (encoding == WavEncoding::Float32) std::memcpy(buffer.data() + i * 4, &sample, 4);
            else {
                const int64_t scale = 1LL << (bits - 1);
                const double clamped = std::clamp<double>(sample, -1, 1);
                const auto value = std::clamp<int64_t>(std::llround(clamped * static_cast<double>(scale)), -scale, scale - 1);
                const uint32_t raw = static_cast<uint32_t>(static_cast<int32_t>(value));
                for (uint32_t b = 0; b < bits / 8; ++b) buffer[i * bits / 8 + b] = static_cast<uint8_t>(raw >> (b * 8));
            }
        }
    }
    void append(const float* input, uint32_t frames) {
        if (closed || failed) throw std::runtime_error("WAV_WRITER_CLOSED");
        uint32_t offset = 0;
        try {
            while (offset < frames) {
                if (currentBytes == options.segmentBytes) { closeSegment(); openSegment(); }
                const auto count = static_cast<uint32_t>(std::min<uint64_t>(
                    std::min<uint32_t>(kBlockFrames, frames - offset), (options.segmentBytes - currentBytes) / align));
                encode(input + static_cast<size_t>(offset) * channels, count);
                const uint32_t bytes = count * align;
                uint32_t done = 0;
                try { while (done < bytes) {
                    if (totalBytes >= options.failAfterPayloadBytes) throw std::runtime_error("TEST_DISK_WRITE_FAILURE");
                    const auto writable = static_cast<uint32_t>(std::min<uint64_t>(bytes - done, options.failAfterPayloadBytes - totalBytes));
                    DWORD written = 0;
                    const BOOL ok = WriteFile(file.value, buffer.data() + done, writable, &written, nullptr);
                    if (written) { done += written; currentBytes += written; totalBytes += written; }
                    if (!ok) ioError("WAV_WRITE_FAILED");
                    if (!written) throw std::runtime_error("WAV_WRITE_NO_PROGRESS");
                }
                } catch (...) { countClips(input + static_cast<size_t>(offset)*channels, done/align); throw; }
                countClips(input + static_cast<size_t>(offset)*channels, count);
                offset += count;
                segments.back().frames = currentBytes / align; segments.back().bytes = currentBytes;
            }
        } catch (...) { failed = true; throw; }
    }
};
WavWriter::WavWriter(const std::filesystem::path& p, uint32_t r, uint32_t c, WavEncoding e, WavOptions o)
    : impl_(std::make_unique<Impl>(p,r,c,e,o)) {}
WavWriter::~WavWriter() { try { close(); } catch (...) {} }
void WavWriter::append(const float* data, uint32_t frames) { impl_->append(data, frames); }
void WavWriter::checkpoint() { if (!impl_->closed) { impl_->updateHeader(false); impl_->file.flush(); } }
void WavWriter::close() {
    if (impl_->closed) return;
    try { impl_->closeSegment(); impl_->closed = true; }
    catch (...) { impl_->file.close(); impl_->completeFrames += impl_->currentBytes/impl_->align; impl_->currentBytes=0; impl_->closed=true; throw; }
}
uint64_t WavWriter::frames() const { return impl_->completeFrames + (impl_->closed ? 0 : impl_->currentBytes / impl_->align); }
uint64_t WavWriter::clippedSamples() const { return impl_->clips; }
const std::vector<WavSegment>& WavWriter::segments() const { return impl_->segments; }
uint32_t WavWriter::bytesPerFrame() const { return impl_->align; }

WavInfo inspectWav(const std::filesystem::path& path, bool allowUnfinished) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("WAV_OPEN_FAILED");
    const uint64_t size = std::filesystem::file_size(path);
    std::array<uint8_t, 40> bytes{};
    readExact(in, bytes.data(), 12);
    if (std::memcmp(bytes.data(),"RIFF",4) || std::memcmp(bytes.data()+8,"WAVE",4)) throw std::runtime_error("UNSUPPORTED_WAV_CONTAINER");
    const uint64_t riffEnd = uint64_t(u32(bytes.data()+4)) + 8;
    if (!allowUnfinished && (riffEnd < 12 || riffEnd > size)) throw std::runtime_error("WAV_TRUNCATED_RIFF");
    WavInfo result; bool haveFormat = false;
    uint64_t offset = 12;
    const uint64_t scanEnd = allowUnfinished ? size : riffEnd;
    while (offset + 8 <= scanEnd) {
        in.seekg(static_cast<std::streamoff>(offset)); readExact(in, bytes.data(), 8);
        const uint32_t chunk = u32(bytes.data()+4);
        if (!std::memcmp(bytes.data(),"fmt ",4)) {
            if (chunk < 16 || chunk > 65536 || offset + 8 + chunk > scanEnd) throw std::runtime_error("INVALID_WAV_FORMAT");
            const auto readBytes = std::min<uint32_t>(chunk, 40);
            readExact(in, bytes.data(), readBytes);
            uint16_t tag = u16(bytes.data());
            auto& f = result.format;
            f.channels = u16(bytes.data()+2); f.sampleRate = u32(bytes.data()+4);
            f.blockAlign = u16(bytes.data()+12); f.containerBits = u16(bytes.data()+14); f.validBits = f.containerBits;
            if (tag == 0xfffe) {
                if (chunk < 40 || u16(bytes.data()+16) < 22) throw std::runtime_error("INVALID_EXTENSIBLE_WAV");
                f.validBits = u16(bytes.data()+18); f.channelMask = u32(bytes.data()+20);
                const uint8_t suffix[]{0,0,0x10,0,0x80,0,0,0xaa,0,0x38,0x9b,0x71};
                if (std::memcmp(bytes.data()+28,suffix,12)) throw std::runtime_error("UNSUPPORTED_WAV_SUBFORMAT");
                const auto subtype = u32(bytes.data()+24);
                if (subtype != 1 && subtype != 3) throw std::runtime_error("UNSUPPORTED_WAV_SUBFORMAT");
                tag = static_cast<uint16_t>(subtype);
            }
            f.floatingPoint = tag == 3;
            if ((tag != 1 && tag != 3) || (f.channels != 1 && f.channels != 2) || f.sampleRate < 8000 || f.sampleRate > 96000 ||
                (f.containerBits != 16 && f.containerBits != 24 && f.containerBits != 32) ||
                !f.validBits || f.validBits > f.containerBits || f.blockAlign != f.channels * f.containerBits/8 || u32(bytes.data()+8) != f.sampleRate*f.blockAlign ||
                (f.floatingPoint && (f.containerBits != 32 || f.validBits != 32))) throw std::runtime_error("UNSUPPORTED_WAV_FORMAT");
            haveFormat = true;
        } else if (!std::memcmp(bytes.data(),"data",4)) {
            if (!haveFormat) throw std::runtime_error("WAV_DATA_BEFORE_FORMAT");
            result.dataOffset = offset + 8;
            const uint64_t available = size - result.dataOffset;
            if (!allowUnfinished && (chunk > available || result.dataOffset + chunk > riffEnd || chunk % result.format.blockAlign)) throw std::runtime_error("WAV_TRUNCATED_DATA");
            result.dataBytes = allowUnfinished ? available - available % result.format.blockAlign : chunk;
            result.frames = result.dataBytes / result.format.blockAlign;
            return result;
        }
        if (offset + 8 + chunk + chunk % 2 > scanEnd) throw std::runtime_error("WAV_TRUNCATED_CHUNK");
        offset += 8 + chunk + chunk % 2;
    }
    throw std::runtime_error("WAV_DATA_MISSING");
}
struct WavReader::Impl {
    std::ifstream input;
    WavInfo info;
    uint64_t position = 0;
    std::vector<uint8_t> buffer;
    explicit Impl(const std::filesystem::path& p) : input(p,std::ios::binary), info(inspectWav(p)) {
        buffer.resize(kBlockFrames * info.format.blockAlign);
        input.seekg(static_cast<std::streamoff>(info.dataOffset));
    }
};
WavReader::WavReader(const std::filesystem::path& p) : impl_(std::make_unique<Impl>(p)) {}
WavReader::~WavReader() = default;
const WavInfo& WavReader::info() const { return impl_->info; }
uint32_t WavReader::read(float* output, uint32_t maximum) {
    const auto count = static_cast<uint32_t>(std::min<uint64_t>(std::min(kBlockFrames,maximum),impl_->info.frames-impl_->position));
    const auto& f = impl_->info.format;
    readExact(impl_->input,impl_->buffer.data(),static_cast<size_t>(count)*f.blockAlign);
    for (size_t i=0;i<static_cast<size_t>(count)*f.channels;++i) output[i]=decodeSample(impl_->buffer.data()+i*f.containerBits/8,f);
    impl_->position += count; return count;
}
void WavReader::seek(uint64_t frame) {
    if (frame > impl_->info.frames) throw std::runtime_error("WAV_SEEK_OUT_OF_RANGE");
    impl_->input.clear(); impl_->input.seekg(static_cast<std::streamoff>(impl_->info.dataOffset+frame*impl_->info.format.blockAlign));
    if (!impl_->input) throw std::runtime_error("WAV_SEEK_FAILED"); impl_->position=frame;
}
void publishNewFile(const std::filesystem::path& source,const std::filesystem::path& target){
    if(!MoveFileW(source.c_str(),target.c_str()))ioError("PUBLISH_NEW_FILE_FAILED");
}
WavInfo recoverWav(const std::filesystem::path& source,const std::filesystem::path& target) {
    if (std::filesystem::exists(target)) throw std::runtime_error("RECOVERY_REQUIRES_NEW_FILE");
    const auto info=inspectWav(source,true);
    if (info.dataBytes > 2ULL*1024*1024*1024) throw std::runtime_error("RECOVERY_SEGMENT_TOO_LARGE");
    const auto encoding=info.format.floatingPoint?WavEncoding::Float32:info.format.containerBits==24?WavEncoding::Pcm24:WavEncoding::Pcm16;
    if (!info.format.floatingPoint && info.format.containerBits==32) throw std::runtime_error("RECOVERY_UNSUPPORTED_ENCODING");
    File output; output.open(target);
    const auto h=header(info.format.sampleRate,info.format.channels,encoding,static_cast<uint32_t>(info.dataBytes),true);
    output.write(h.data(),static_cast<uint32_t>(h.size()));
    std::ifstream input(source,std::ios::binary); input.seekg(static_cast<std::streamoff>(info.dataOffset));
    std::array<uint8_t,65536> buffer{};
    uint64_t remaining=info.dataBytes;
    while(remaining){const auto count=static_cast<uint32_t>(std::min<uint64_t>(remaining,buffer.size()));readExact(input,buffer.data(),count);output.write(buffer.data(),count);remaining-=count;}
    if(info.dataBytes%2){const uint8_t pad=0;output.write(&pad,1);}
    output.flush();output.close();return inspectWav(target);
}

WavConversion convertWavs(const std::vector<std::filesystem::path>& sources,
                          const std::filesystem::path& base,WavEncoding encoding,WavOptions options) {
    if(sources.empty()||sources.size()>10000)throw std::runtime_error("INVALID_CONVERSION_SOURCES");
    const auto first=inspectWav(sources.front());
    uint64_t expected=0;
    for(const auto& source:sources){
        const auto info=inspectWav(source);
        if(info.format.sampleRate!=first.format.sampleRate||info.format.channels!=first.format.channels)
            throw std::runtime_error("CONVERSION_FORMAT_MISMATCH");
        if(info.frames>UINT64_MAX-expected)throw std::runtime_error("CONVERSION_TOO_LONG");
        expected+=info.frames;
    }
    WavWriter writer(base,first.format.sampleRate,first.format.channels,encoding,options);
    std::array<float,kBlockFrames*2> samples{};
    for(const auto& source:sources){
        WavReader reader(source);
        if(reader.info().format.sampleRate!=first.format.sampleRate||reader.info().format.channels!=first.format.channels)
            throw std::runtime_error("CONVERSION_SOURCE_CHANGED");
        for(;;){const auto count=reader.read(samples.data(),kBlockFrames);if(!count)break;writer.append(samples.data(),count);}
    }
    writer.close();
    if(writer.frames()!=expected)throw std::runtime_error("CONVERSION_FRAME_MISMATCH");
    WavConversion result;result.frames=writer.frames();result.clippedSamples=writer.clippedSamples();result.segments=writer.segments();
    result.format=inspectWav(result.segments.front().path).format;
    return result;
}
}
