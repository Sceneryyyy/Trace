// Trace M0 diagnostic only. No PCM files, Electron renderer, or product DSP.
// The upstream mode links the unmodified Prism capture core. Raw mode exposes
// the packet positions/flags that its current display-oriented API discards.
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <ksmedia.h>
#include <functiondiscoverykeys_devpkey.h>
#include <wrl/client.h>
#include "system_audio_capture.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>

using Microsoft::WRL::ComPtr;
using Clock = std::chrono::steady_clock;

namespace {
void check(HRESULT hr, const char* op) {
    if (FAILED(hr)) {
        std::ostringstream s;
        s << op << " failed: 0x" << std::hex << static_cast<unsigned long>(hr);
        throw std::runtime_error(s.str());
    }
}
struct ComScope {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    ComScope() { check(hr, "CoInitializeEx"); }
    ~ComScope() { if (SUCCEEDED(hr)) CoUninitialize(); }
};
struct FreeFormat { void operator()(WAVEFORMATEX* p) const { CoTaskMemFree(p); } };
using Format = std::unique_ptr<WAVEFORMATEX, FreeFormat>;
Format mixFormat(IAudioClient* client) {
    WAVEFORMATEX* p = nullptr;
    check(client->GetMixFormat(&p), "GetMixFormat");
    return Format(p);
}
std::string utf8(const wchar_t* s) {
    int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, nullptr, 0, nullptr, nullptr);
    if (n <= 0) return {};
    std::string out(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, s, -1, out.data(), n, nullptr, nullptr);
    out.pop_back();
    return out;
}
std::string quote(const std::string& s) {
    std::ostringstream out;
    out << '"';
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') out << '\\' << c;
        else if (c < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << unsigned(c);
        else out << c;
    }
    out << '"';
    return out.str();
}
std::string deviceId(IMMDevice* device) {
    LPWSTR id = nullptr;
    check(device->GetId(&id), "GetId");
    auto result = utf8(id);
    CoTaskMemFree(id);
    return result;
}
std::string label(IMMDevice* device) {
    ComPtr<IPropertyStore> store;
    check(device->OpenPropertyStore(STGM_READ, &store), "OpenPropertyStore");
    PROPVARIANT v;
    PropVariantInit(&v);
    const auto hr = store->GetValue(PKEY_Device_FriendlyName, &v);
    const auto result = SUCCEEDED(hr) && v.vt == VT_LPWSTR ? utf8(v.pwszVal) : std::string{};
    PropVariantClear(&v);
    return result;
}
ComPtr<IAudioClient> clientFor(IMMDevice* device) {
    ComPtr<IAudioClient> client;
    check(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
        reinterpret_cast<void**>(client.GetAddressOf())), "Activate(IAudioClient)");
    return client;
}
bool isFloat32(const WAVEFORMATEX* f) {
    if (f->wBitsPerSample != 32 || f->nBlockAlign != f->nChannels * sizeof(float)) return false;
    if (f->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
    return f->wFormatTag == WAVE_FORMAT_EXTENSIBLE && f->cbSize >= 22 &&
        IsEqualGUID(reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(f)->SubFormat,
                    KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
}
void printFormat(const WAVEFORMATEX* f) {
    WORD valid = f->wBitsPerSample;
    DWORD mask = 0;
    std::string encoding = f->wFormatTag == WAVE_FORMAT_PCM ? "pcm-int" : "unknown";
    if (f->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) encoding = "ieee-float";
    if (f->wFormatTag == WAVE_FORMAT_EXTENSIBLE && f->cbSize >= 22) {
        const auto* e = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(f);
        valid = e->Samples.wValidBitsPerSample;
        mask = e->dwChannelMask;
        if (IsEqualGUID(e->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT)) encoding = "ieee-float";
        if (IsEqualGUID(e->SubFormat, KSDATAFORMAT_SUBTYPE_PCM)) encoding = "pcm-int";
    }
    std::cout << "{\"sampleRate\":" << f->nSamplesPerSec << ",\"channelCount\":" << f->nChannels
        << ",\"containerBits\":" << f->wBitsPerSample << ",\"validBits\":" << valid
        << ",\"blockAlign\":" << f->nBlockAlign << ",\"channelMask\":" << mask
        << ",\"encoding\":" << quote(encoding) << '}';
}

// Uses a separate render stream with a low-amplitude deterministic 997 Hz tone.
// Stage 1: tone, stage 2: explicit silent packets, stage 3: stream stopped,
// stage 4: tone resumed. Scheduling times are diagnostic, not sample boundaries.
void fixture(const std::wstring& id, std::string& error) {
    try {
        ComScope com;
        ComPtr<IMMDeviceEnumerator> e;
        check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&e)), "Enumerator");
        ComPtr<IMMDevice> device;
        check(e->GetDevice(id.c_str(), &device), "Fixture GetDevice");
        auto client = clientFor(device.Get());
        auto f = mixFormat(client.Get());
        if (!isFloat32(f.get())) throw std::runtime_error("Fixture requires float32 mix format");
        check(client->Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 1000000, 0, f.get(), nullptr), "Render Initialize");
        ComPtr<IAudioRenderClient> render;
        check(client->GetService(IID_PPV_ARGS(&render)), "Render GetService");
        UINT32 capacity = 0;
        check(client->GetBufferSize(&capacity), "Render GetBufferSize");
        const auto begin = Clock::now();
        bool running = false;
        uint64_t frame = 0;
        for (;;) {
            const double t = std::chrono::duration<double>(Clock::now() - begin).count();
            if (t >= 5.0) break;
            const bool active = (t >= 0.5 && t < 2.5) || (t >= 3.5 && t < 4.5);
            if (!active) {
                if (running) { check(client->Stop(), "Render Stop"); check(client->Reset(), "Render Reset"); running = false; }
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
                continue;
            }
            const bool silent = t >= 1.5 && t < 2.5;
            UINT32 padding = 0;
            check(client->GetCurrentPadding(&padding), "Render padding");
            const UINT32 count = capacity - padding;
            if (count > 0) {
                BYTE* data = nullptr;
                check(render->GetBuffer(count, &data), "Render GetBuffer");
                auto* samples = reinterpret_cast<float*>(data);
                for (UINT32 i = 0; i < count; ++i, ++frame) {
                    const auto sample = static_cast<float>(0.025 * std::sin(6.283185307179586 * 997.0 *
                        static_cast<double>(frame) / f->nSamplesPerSec));
                    for (WORD c = 0; c < f->nChannels; ++c) samples[i * f->nChannels + c] = silent ? 0.0f : sample;
                }
                check(render->ReleaseBuffer(count, silent ? AUDCLNT_BUFFERFLAGS_SILENT : 0), "Render ReleaseBuffer");
            }
            if (!running) { check(client->Start(), "Render Start"); running = true; }
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
        check(client->Stop(), "Render Stop");
    } catch (const std::exception& ex) { error = ex.what(); }
}

struct Bucket {
    uint64_t frames = 0, packets = 0, silentFrames = 0, nonzeroSamples = 0;
    float peak = 0.0f;
};
struct Packet {
    UINT64 position = 0, qpc100ns = 0;
    UINT32 frames = 0;
    DWORD flags = 0;
};

int rawProbe(IMMDevice* device, double seconds, bool playFixture) {
    auto client = clientFor(device);
    auto f = mixFormat(client.Get());
    if (f->nChannels < 1 || f->nChannels > 2) throw std::runtime_error("Trace supports mono/stereo only");
    check(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 0, 0, f.get(), nullptr), "Capture Initialize");
    ComPtr<IAudioCaptureClient> capture;
    check(client->GetService(IID_PPV_ARGS(&capture)), "Capture GetService");
    ComPtr<IAudioClock> audioClock;
    check(client->GetService(IID_PPV_ARGS(&audioClock)), "GetService(IAudioClock)");
    UINT64 frequency = 0;
    check(audioClock->GetFrequency(&frequency), "Clock frequency");
    LPWSTR wideId = nullptr;
    check(device->GetId(&wideId), "GetId");
    std::wstring id(wideId);
    CoTaskMemFree(wideId);
    // All diagnostic storage is fixed before Start. No writes or JS callbacks
    // between GetBuffer and ReleaseBuffer; packet metadata is flushed at end.
    std::array<Packet, 16384> packets{};
    std::array<Bucket, 120> buckets{};
    size_t packetCount = 0;
    uint64_t metadataOverflow = 0, totalFrames = 0, emptyPolls = 0;
    HRESULT captureError = S_OK;
    std::string fixtureError;
    check(client->Start(), "Capture Start");
    const auto begin = Clock::now();
    std::thread renderThread;
    if (playFixture) renderThread = std::thread(fixture, id, std::ref(fixtureError));
    UINT64 clockStart = 0, qpcStart = 0, clockEnd = 0, qpcEnd = 0;
    const HRESULT clockStartHr = audioClock->GetPosition(&clockStart, &qpcStart);
    while (std::chrono::duration<double>(Clock::now() - begin).count() < seconds) {
        UINT32 next = 0;
        captureError = capture->GetNextPacketSize(&next);
        if (FAILED(captureError)) break;
        if (next == 0) ++emptyPolls;
        while (next > 0) {
            BYTE* data = nullptr;
            Packet p;
            captureError = capture->GetBuffer(&data, &p.frames, &p.flags, &p.position, &p.qpc100ns);
            if (FAILED(captureError) || captureError == AUDCLNT_S_BUFFER_EMPTY) break;
            if (packetCount < packets.size()) packets[packetCount++] = p;
            else ++metadataOverflow;
            totalFrames += p.frames;
            const double elapsed = std::chrono::duration<double>(Clock::now() - begin).count();
            auto& b = buckets[std::min<size_t>(static_cast<size_t>(elapsed * 2), buckets.size() - 1)];
            b.frames += p.frames;
            ++b.packets;
            if (p.flags & AUDCLNT_BUFFERFLAGS_SILENT) b.silentFrames += p.frames;
            else if (data && isFloat32(f.get())) {
                for (size_t i = 0; i < static_cast<size_t>(p.frames) * f->nChannels; ++i) {
                    float value;
                    std::memcpy(&value, data + i * sizeof(float), sizeof(float));
                    if (std::isfinite(value)) {
                        b.peak = std::max(b.peak, std::abs(value));
                        if (value != 0) ++b.nonzeroSamples;
                    }
                }
            }
            captureError = capture->ReleaseBuffer(p.frames);
            if (FAILED(captureError)) break;
            captureError = capture->GetNextPacketSize(&next);
            if (FAILED(captureError)) break;
        }
        if (FAILED(captureError)) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
    const HRESULT clockEndHr = audioClock->GetPosition(&clockEnd, &qpcEnd);
    const HRESULT stopHr = client->Stop();
    const auto elapsed = std::chrono::duration<double>(Clock::now() - begin).count();
    if (renderThread.joinable()) renderThread.join();
    uint64_t discontinuities = 0, timestampErrors = 0, forwardGapFrames = 0, overlapFrames = 0;
    for (size_t i = 0; i < packetCount; ++i) {
        const auto& p = packets[i];
        if (p.flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) ++discontinuities;
        if (p.flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR) ++timestampErrors;
        if (i > 0 && !(p.flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR) &&
            !(packets[i - 1].flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR)) {
            const auto end = packets[i - 1].position + packets[i - 1].frames;
            if (p.position > end) forwardGapFrames += p.position - end;
            if (p.position < end) overlapFrames += end - p.position;
        }
    }
    std::cout << "{\"kind\":\"raw-wasapi\",\"format\":";
    printFormat(f.get());
    std::cout << ",\"fixture\":" << (playFixture ? "true" : "false")
        << ",\"fixtureError\":" << quote(fixtureError) << ",\"wallSeconds\":" << elapsed
        << ",\"frames\":\"" << totalFrames << "\",\"packetCount\":" << packetCount
        << ",\"metadataOverflow\":" << metadataOverflow << ",\"emptyPolls\":" << emptyPolls
        << ",\"discontinuities\":" << discontinuities << ",\"timestampErrors\":" << timestampErrors
        << ",\"forwardGapFrames\":\"" << forwardGapFrames << "\",\"overlapFrames\":\"" << overlapFrames
        << "\",\"clockFrequency\":\"" << frequency << "\",\"clockStart\":\"" << clockStart
        << "\",\"clockEnd\":\"" << clockEnd << "\",\"qpcStart100ns\":\"" << qpcStart
        << "\",\"qpcEnd100ns\":\"" << qpcEnd << "\",\"clockStartHr\":" << clockStartHr
        << ",\"clockEndHr\":" << clockEndHr << ",\"captureHr\":" << captureError
        << ",\"stopHr\":" << stopHr << ",\"samplePeakAvailable\":" << (isFloat32(f.get()) ? "true" : "false")
        << ",\"bucketsHalfSecond\":[";
    for (size_t i = 0; i < static_cast<size_t>(std::ceil(seconds * 2)); ++i) {
        if (i) std::cout << ',';
        const auto& b = buckets[i];
        std::cout << "{\"frames\":" << b.frames << ",\"packets\":" << b.packets
            << ",\"silentFrames\":" << b.silentFrames << ",\"nonzeroSamples\":" << b.nonzeroSamples
            << ",\"samplePeak\":" << b.peak << '}';
    }
    std::cout << "],\"packets\":[";
    for (size_t i = 0; i < packetCount; ++i) {
        if (i) std::cout << ',';
        const auto& p = packets[i];
        std::cout << "{\"deviceFrame\":\"" << p.position << "\",\"qpc100ns\":\"" << p.qpc100ns
            << "\",\"frames\":" << p.frames << ",\"flags\":" << p.flags << '}';
    }
    std::cout << "]}\n" << std::flush;
    return FAILED(captureError) || FAILED(stopHr) || !fixtureError.empty() || metadataOverflow || !totalFrames ? 2 : 0;
}

int upstreamProbe(const std::string& id, double seconds) {
    auto capture = Prism::Capture::createSystemAudioCapture();
    Prism::Capture::StartResult start;
    std::string error;
    if (!capture->start(id, &start, &error)) throw std::runtime_error(error);
    const auto begin = Clock::now();
    uint64_t frames = 0, chunks = 0, overwritten = 0, sequenceGaps = 0, lastSequence = 0;
    size_t maxDepth = 0;
    float peak = 0;
    const auto consume = [&]() {
        auto result = capture->drain(256);
        overwritten = std::max(overwritten, result.overwriteCount);
        maxDepth = std::max(maxDepth, result.queueDepth);
        for (const auto& c : result.chunks) {
            if (lastSequence && c.sequence != lastSequence + 1) ++sequenceGaps;
            lastSequence = c.sequence;
            frames += c.left.size();
            ++chunks;
            for (auto sample : c.left) peak = std::max(peak, std::abs(sample));
            for (auto sample : c.right) peak = std::max(peak, std::abs(sample));
        }
        return result.chunks.size();
    };
    while (std::chrono::duration<double>(Clock::now() - begin).count() < seconds) {
        consume();
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    capture->stop(); // Upstream clears its queue on stop; not a recorder boundary.
    std::cout << "{\"kind\":\"upstream-native-consumer\",\"sampleRate\":" << start.sampleRate
        << ",\"channelCount\":" << start.channelCount << ",\"frames\":\"" << frames
        << "\",\"chunks\":" << chunks << ",\"overwrites\":" << overwritten
        << ",\"sequenceGaps\":" << sequenceGaps << ",\"maxRemainingQueueDepth\":" << maxDepth
        << ",\"samplePeak\":" << peak << ",\"wallSeconds\":"
        << std::chrono::duration<double>(Clock::now() - begin).count()
        << ",\"continuity\":\"unknown-upstream-drops-timestamps-and-synthesizes-silence\"}\n" << std::flush;
    return frames && !overwritten && !sequenceGaps ? 0 : 2;
}
}

int main(int argc, char** argv) {
    try {
        std::string mode = "list";
        int index = -1;
        double seconds = 5;
        bool playFixture = false;
        if (argc > 1) mode = argv[1];
        for (int i = 2; i < argc; ++i) {
            const std::string arg = argv[i];
            if (arg == "--fixture") playFixture = true;
            else if (arg == "--device-index" && i + 1 < argc) index = std::stoi(argv[++i]);
            else if (arg == "--seconds" && i + 1 < argc) seconds = std::stod(argv[++i]);
            else throw std::runtime_error("Unknown or incomplete argument");
        }
        if (!std::isfinite(seconds) || seconds < 1 || seconds > 60) throw std::runtime_error("seconds must be 1..60");
        if (playFixture && (mode != "raw" || seconds < 5.5)) throw std::runtime_error("--fixture requires raw and --seconds >= 5.5");
        if (mode != "list" && mode != "raw" && mode != "upstream") throw std::runtime_error("mode must be list, raw, or upstream");
        ComScope com;
        ComPtr<IMMDeviceEnumerator> e;
        check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&e)), "Enumerator");
        ComPtr<IMMDeviceCollection> collection;
        check(e->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection), "EnumAudioEndpoints");
        UINT count = 0;
        check(collection->GetCount(&count), "GetCount");
        ComPtr<IMMDevice> defaultDevice;
        const auto defaultHr = e->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice);
        const auto defaultId = SUCCEEDED(defaultHr) ? deviceId(defaultDevice.Get()) : std::string{};
        if (mode == "list") {
            std::cout << "{\"kind\":\"devices\",\"devices\":[";
            for (UINT i = 0; i < count; ++i) {
                ComPtr<IMMDevice> device;
                check(collection->Item(i, &device), "Item");
                if (i) std::cout << ',';
                std::cout << "{\"index\":" << i << ",\"id\":" << quote(deviceId(device.Get()))
                    << ",\"label\":" << quote(label(device.Get())) << ",\"isDefault\":"
                    << (deviceId(device.Get()) == defaultId ? "true" : "false") << ",\"format\":";
                try { auto client = clientFor(device.Get()); auto f = mixFormat(client.Get()); printFormat(f.get()); }
                catch (const std::exception& ex) { std::cout << "null,\"formatError\":" << quote(ex.what()); }
                std::cout << '}';
            }
            std::cout << "]}\n" << std::flush;
            return count ? 0 : 2;
        }
        ComPtr<IMMDevice> device;
        if (index >= 0) {
            if (static_cast<UINT>(index) >= count) throw std::runtime_error("Device index out of range");
            check(collection->Item(static_cast<UINT>(index), &device), "Item");
        } else { check(defaultHr, "GetDefaultAudioEndpoint"); device = defaultDevice; }
        if (mode == "raw") return rawProbe(device.Get(), seconds, playFixture);
        return upstreamProbe(deviceId(device.Get()), seconds);
    } catch (const std::exception& ex) {
        std::cerr << "{\"error\":" << quote(ex.what()) << "}\n";
        return 1;
    }
}
