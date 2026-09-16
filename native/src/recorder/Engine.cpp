#include "Engine.h"
#include "CaptureRecovery.h"
#include "CaptureClock.h"
#include "Decode.h"
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <functiondiscoverykeys_devpkey.h>
#include <ksmedia.h>
#include <wrl/client.h>
#include <avrt.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iomanip>
#include <sstream>
#include <stdexcept>
namespace Trace {
namespace {
using Microsoft::WRL::ComPtr;
struct CoScope {
    HRESULT result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    CoScope() {
        if (FAILED(result) && result != RPC_E_CHANGED_MODE) throw std::runtime_error("COM_INIT_FAILED");
    }
    ~CoScope() { if (SUCCEEDED(result)) CoUninitialize(); }
};
void check(HRESULT result, const char* operation) {
    if (FAILED(result)) {
        std::ostringstream s;
        s << operation << " (0x" << std::hex << static_cast<unsigned long>(result) << ")";
        throw std::runtime_error(s.str());
    }
}
uint64_t nativeTime() noexcept {
    LARGE_INTEGER counter, frequency;
    QueryPerformanceCounter(&counter);
    QueryPerformanceFrequency(&frequency);
    const auto ticks = static_cast<uint64_t>(counter.QuadPart), hz = static_cast<uint64_t>(frequency.QuadPart);
    return ticks / hz * 10000000 + ticks % hz * 10000000 / hz;
}
std::wstring wide(const std::string& s) {
    const int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), static_cast<int>(s.size()), nullptr, 0);
    if (count <= 0) throw std::runtime_error("INVALID_DEVICE_ID");
    std::wstring out(static_cast<size_t>(count), 0);
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), static_cast<int>(s.size()), out.data(), count);
    return out;
}
std::string narrow(const wchar_t* s) {
    const int count = WideCharToMultiByte(CP_UTF8, 0, s, -1, nullptr, 0, nullptr, nullptr);
    if (count <= 0) return {};
    std::string out(static_cast<size_t>(count), 0);
    WideCharToMultiByte(CP_UTF8, 0, s, -1, out.data(), count, nullptr, nullptr);
    out.pop_back(); return out;
}
ComPtr<IMMDeviceEnumerator> enumerator() {
    ComPtr<IMMDeviceEnumerator> result;
    check(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&result)), "DEVICE_ENUMERATION_FAILED");
    return result;
}
std::string idFor(IMMDevice* device) {
    LPWSTR id = nullptr;
    check(device->GetId(&id), "DEVICE_ID_FAILED");
    auto result = narrow(id);
    CoTaskMemFree(id); return result;
}
ComPtr<IAudioClient> clientFor(IMMDevice* device) {
    ComPtr<IAudioClient> client;
    check(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
        reinterpret_cast<void**>(client.GetAddressOf())), "DEVICE_UNAVAILABLE");
    return client;
}
struct FormatFree { void operator()(WAVEFORMATEX* f) const { CoTaskMemFree(f); } };
using Mix = std::unique_ptr<WAVEFORMATEX, FormatFree>;
Mix getMix(IAudioClient* client) {
    WAVEFORMATEX* f = nullptr;
    check(client->GetMixFormat(&f), "MIX_FORMAT_FAILED");
    return Mix(f);
}
SourceFormat parseFormat(const WAVEFORMATEX* f) {
    SourceFormat out{f->nSamplesPerSec, f->nChannels, f->wBitsPerSample, f->wBitsPerSample, f->nBlockAlign, 0, false};
    bool pcm = f->wFormatTag == WAVE_FORMAT_PCM;
    out.floatingPoint = f->wFormatTag == WAVE_FORMAT_IEEE_FLOAT;
    if (f->wFormatTag == WAVE_FORMAT_EXTENSIBLE && f->cbSize >= 22) {
        const auto* e = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(f);
        out.validBits = e->Samples.wValidBitsPerSample ? e->Samples.wValidBitsPerSample : f->wBitsPerSample;
        out.channelMask = e->dwChannelMask;
        pcm = IsEqualGUID(e->SubFormat, KSDATAFORMAT_SUBTYPE_PCM);
        out.floatingPoint = IsEqualGUID(e->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
    }
    if ((!pcm && !out.floatingPoint) || out.sampleRate < 8000 || out.sampleRate > 96000 ||
        out.channels < 1 || out.channels > 2 ||
        (out.containerBits != 16 && out.containerBits != 24 && out.containerBits != 32) ||
        out.validBits == 0 || out.validBits > out.containerBits ||
        out.blockAlign != out.channels * out.containerBits / 8 ||
        (out.floatingPoint && (out.containerBits != 32 || out.validBits != 32)))
        throw std::runtime_error("UNSUPPORTED_FORMAT: mono/stereo, PCM16/24/32 or float32, up to 96 kHz");
    return out;
}

}
std::vector<Device> listDevices() {
    CoScope com;
    auto e = enumerator();
    ComPtr<IMMDevice> defaultDevice;
    const auto defaultResult = e->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice);
    const auto defaultId = SUCCEEDED(defaultResult) ? idFor(defaultDevice.Get()) : std::string{};
    ComPtr<IMMDeviceCollection> collection;
    check(e->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection), "DEVICE_ENUMERATION_FAILED");
    UINT count = 0;
    check(collection->GetCount(&count), "DEVICE_COUNT_FAILED");
    std::vector<Device> devices;
    for (UINT i = 0; i < count; ++i) {
        ComPtr<IMMDevice> device;
        check(collection->Item(i, &device), "DEVICE_QUERY_FAILED");
        Device result;
        result.id = idFor(device.Get());
        result.isDefault = result.id == defaultId;
        ComPtr<IPropertyStore> properties;
        if (SUCCEEDED(device->OpenPropertyStore(STGM_READ, &properties))) {
            PROPVARIANT value;
            PropVariantInit(&value);
            if (SUCCEEDED(properties->GetValue(PKEY_Device_FriendlyName, &value)) && value.vt == VT_LPWSTR) result.label = narrow(value.pwszVal);
            PropVariantClear(&value);
        }
        if (result.label.empty()) result.label = "Playback device";
        try { auto client = clientFor(device.Get()); auto f = getMix(client.Get()); result.format = parseFormat(f.get()); }
        catch (const std::exception& ex) { result.error = ex.what(); }
        devices.push_back(std::move(result));
    }
    return devices;
}
Engine::~Engine() { stop(true); }
void Engine::start(const std::string& id) {
    stop();
    queue_ = std::make_unique<Queue>();
    format_ = {}; meter_.reset();replay_.reset(); endpointBufferFrames_ = 0;
    deviceId_ = id;
    startupDone_ = false; startupError_.clear();
    stopCapture_ = false; stopAnalysis_ = false; failure_ = 0; failureSite_ = 0;
    captured_ = 0; analyzed_ = 0; estimated_ = 0; dropped_ = 0;
    discontinuities_ = 0; timestampErrors_ = 0; overlaps_ = 0; highWater_ = 0; resetRequest_ = 0;
    analysisEnd_ = 0; analysisBase_ = 0; measurementGap_ = false; measurementEstimated_ = false;
    ++captureEpoch_; measurementEpoch_ = 0;
    captureThread_ = std::thread(&Engine::captureLoop, this, id);
    std::unique_lock<std::mutex> lock(startupMutex_);
    if (!startupCondition_.wait_for(lock, std::chrono::seconds(8), [&] { return startupDone_; })) {
        lock.unlock(); stop(); throw std::runtime_error("DEVICE_START_TIMEOUT");
    }
    const auto error = startupError_;
    lock.unlock();
    if (!error.empty()) { stop(); throw std::runtime_error(error); }
    try { analysisThread_ = std::thread(&Engine::analysisLoop, this); }
    catch (...) { stop(); throw; }
}
void Engine::started(const std::string& error) {
    { std::lock_guard<std::mutex> lock(startupMutex_); startupError_ = error; startupDone_ = true; }
    startupCondition_.notify_all();
}
void Engine::stop(bool force) {
    if (!force && recorder_.busy()) throw std::runtime_error("RECORDING_ACTIVE");
    stopCapture_ = true;
    if (captureThread_.joinable()) captureThread_.join();
    recorder_.finishAfterProducerStopped();
    stopAnalysis_ = true;
    if (analysisThread_.joinable()) analysisThread_.join();
    active_ = false;
}
std::shared_ptr<const ReplayClip> Engine::freezeReplay(bool recording){
    if(recording){frozenReplay_=recorder_.freezeReplay();return frozenReplay_;}
    std::lock_guard<std::mutex> lock(meterMutex_);
    if(!replay_)throw std::runtime_error("REPLAY_EMPTY");
    auto clip=replay_->freeze(true);
    clip->sourceId=deviceId_;clip->captureEpoch=captureEpoch_;clip->measurementEpoch=measurementEpoch_;
    clip->captureStartFrame=analysisBase_+clip->originFrame;
    frozenReplay_=clip;return frozenReplay_;
}
std::shared_ptr<const ReplayClip> Engine::frozenReplay()const{if(!frozenReplay_)throw std::runtime_error("REPLAY_NOT_READY");return frozenReplay_;}
void Engine::reset() {
    if (!active_ || recorder_.busy()) throw std::runtime_error("INVALID_STATE");
    resetRequest_.fetch_add(1);
}
void Engine::captureLoop(std::string id) {
    bool announced = false;
    uint32_t site = 1;
    try {
        CoScope com;
        auto e = enumerator();
        ComPtr<IMMDevice> device;
        check(e->GetDevice(wide(id).c_str(), &device), "DEVICE_UNAVAILABLE");
        auto client = clientFor(device.Get());
        auto mix = getMix(client.Get());
        format_ = parseFormat(mix.get());
        meter_ = std::make_unique<Meter>(format_.sampleRate, format_.channels);
        replay_=std::make_unique<ReplayBuffer>(format_);
        meter_->setFrameSink([this](const MeterValues& m,const WavePoint& w,bool l){replay_->remember(m,w,l);});
        // A 100 ms endpoint buffer absorbs scheduling jitter; event notification still
        // wakes for new packets. There is no UI timer in the capture path.
        struct EventScope { HANDLE handle = CreateEventW(nullptr, FALSE, FALSE, nullptr); ~EventScope() { if (handle) CloseHandle(handle); } };
        EventScope audioReady;
        if (!audioReady.handle) check(HRESULT_FROM_WIN32(GetLastError()), "CAPTURE_EVENT_FAILED");
        check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            1000000, 0, mix.get(), nullptr), "CAPTURE_INITIALIZE_FAILED");
        check(client->SetEventHandle(audioReady.handle), "CAPTURE_EVENT_HANDLE_FAILED");
        check(client->GetBufferSize(&endpointBufferFrames_), "CAPTURE_BUFFER_SIZE_FAILED");
        ComPtr<IAudioCaptureClient> capture;
        check(client->GetService(IID_PPV_ARGS(&capture)), "CAPTURE_SERVICE_FAILED");
        CaptureClock clock(format_.sampleRate, nativeTime());
        uint64_t sequence = 0;
        bool pendingGap = false;
        AudioBlock scratch;
        const auto publish = [&](uint64_t first, uint32_t count, uint32_t flags, const BYTE* data, uint64_t deviceFrame, uint64_t qpc, uint32_t qpcOffset) {
            AudioBlock* block = &scratch;
            block->firstFrame = first; block->frames = count; block->flags = flags;
            block->sequence = ++sequence; block->deviceFrame = deviceFrame; block->qpc100ns = qpc; block->qpcOffsetFrames = qpcOffset;
            for (uint32_t frame = 0; frame < count; ++frame) {
                for (uint32_t c = 0; c < format_.channels; ++c) {
                    float value = data ? decodeSample(data + static_cast<size_t>(frame) * format_.blockAlign + c * format_.containerBits / 8, format_) : 0;
                    if (!std::isfinite(value)) { value = 0; block->flags |= Gap; }
                    block->samples[static_cast<size_t>(frame) * format_.channels + c] = value;
                }
            }
            recorder_.push(scratch);
            auto* target = queue_->write();
            if (!target) { dropped_.fetch_add(count); pendingGap = true; return; }
            *target = scratch;
            if (pendingGap) target->flags |= Gap;
            pendingGap = false;
            queue_->publish();
            const auto depth = queue_->size();
            if (depth > highWater_.load()) highWater_.store(depth);
        };
        const auto silence = [&](uint64_t first, uint64_t count, uint32_t flags) {
            if (count > format_.sampleRate * 2ULL) { dropped_.fetch_add(count); pendingGap = true; recorder_.sourceFailed(RecordFailure::CaptureGap); return; }
            for (uint64_t offset = 0; offset < count;) {
                const auto size = static_cast<uint32_t>(std::min<uint64_t>(kBlockFrames, count - offset));
                publish(first + offset, size, flags | Silent, nullptr, 0, clock.qpcAtFrame(first+offset), 0); offset += size;
            }
            if (flags & EstimatedSilence) estimated_.fetch_add(count);
        };
        DWORD taskIndex = 0;
        struct MmcssScope { HANDLE handle; ~MmcssScope() { if (handle) AvRevertMmThreadCharacteristics(handle); } };
        MmcssScope mmcss{AvSetMmThreadCharacteristicsW(L"Audio", &taskIndex)};
        check(client->Start(), "CAPTURE_START_FAILED");
        active_ = true; started(); announced = true;
        HRESULT result = S_OK;
        while (!stopCapture_) {
            recorder_.boundary();
            UINT32 next = 0;
            site = 2;
            result = capture->GetNextPacketSize(&next);
            if (FAILED(result)) break;
            if (next == 0) {
                const auto first = clock.end();
                const auto count = clock.idle(nativeTime());
                if (count) silence(first, count, EstimatedSilence);
            }
            while (next && !stopCapture_) {
                BYTE* data = nullptr;
                UINT32 frames = 0; DWORD flags = 0; UINT64 position = 0, qpc = 0;
                site = 3;
                result = capture->GetBuffer(&data, &frames, &flags, &position, &qpc);
                if (FAILED(result) || result == AUDCLNT_S_BUFFER_EMPTY) break;
                const auto mapping = clock.packet(position, qpc, frames, flags, nativeTime());
                if (flags & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY) discontinuities_++;
                if (flags & AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR) timestampErrors_++;
                if (mapping.flags & Overlap) overlaps_++;
                if (mapping.paddingFrames) silence(mapping.firstFrame - mapping.paddingFrames, mapping.paddingFrames,
                    mapping.flags & Gap ? Gap | Missing : EstimatedSilence);
                for (uint32_t offset = 0; offset < frames;) {
                    const uint32_t count = std::min(kBlockFrames, frames - offset);
                    publish(mapping.firstFrame + offset, count, mapping.flags & ~EstimatedSilence,
                        (flags & AUDCLNT_BUFFERFLAGS_SILENT) || !data ? nullptr : data + static_cast<size_t>(offset) * format_.blockAlign,
                        position + offset, qpc, offset);
                    offset += count;
                }
                captured_.fetch_add(frames);
                site = 4;
                result = capture->ReleaseBuffer(frames);
                if (FAILED(result)) break;
                site = 2;
                result = capture->GetNextPacketSize(&next);
                if (FAILED(result)) break;
            }
            if (FAILED(result)) break;
            site = 5;
            const DWORD wake = WaitForSingleObject(audioReady.handle, 10);
            if (wake == WAIT_FAILED) { result = HRESULT_FROM_WIN32(GetLastError()); break; }
        }
        const auto stopResult = client->Stop();
        if (FAILED(result)) { failureSite_ = site; failure_ = result; }
        else if (FAILED(stopResult)) { failureSite_ = 6; failure_ = stopResult; }
        if (FAILED(result) || FAILED(stopResult)) recorder_.sourceFailed();
        else { recorder_.requestStop(); recorder_.boundary(); }
        active_ = false;
    } catch (const std::exception& ex) {
        recorder_.sourceFailed();
        active_ = false; failureSite_ = site; failure_ = E_FAIL;
        if (!announced) started(ex.what());
    }
}
void Engine::analysisLoop() {
    uint64_t appliedReset = 0;
    try {
        while (!stopAnalysis_ || queue_->size() > 0) {
            const auto* block = queue_->read();
            if (!block) { std::this_thread::sleep_for(std::chrono::milliseconds(1)); continue; }
            {
                std::lock_guard<std::mutex> lock(meterMutex_);
                const auto requested = resetRequest_.load();
                const bool gap = (block->flags & Gap) || block->firstFrame != analysisEnd_;
                const bool userReset = requested != appliedReset;
                if (requested != appliedReset || gap) {
                    meter_ = std::make_unique<Meter>(format_.sampleRate, format_.channels);
                    replay_->reset();meter_->setFrameSink([this](const MeterValues& m,const WavePoint& w,bool l){replay_->remember(m,w,l);});
                    analysisBase_ = block->firstFrame;
                    ++measurementEpoch_;
                    appliedReset = requested;
                    if (userReset) { measurementGap_ = false; measurementEstimated_ = false; }
                }
                if (gap) measurementGap_ = true;
                if (block->flags & EstimatedSilence) measurementEstimated_ = true;
                // Unknown missing samples are not silently made into measured silence.
                if (block->flags & Missing) {
                    analysisBase_ = block->firstFrame + block->frames;
                } else {
                    replay_->push(block->samples.data(),block->frames);
                    meter_->push(block->samples.data(), block->frames, block->flags);
                    analyzed_.fetch_add(block->frames);
                }
                analysisEnd_ = block->firstFrame + block->frames;
            }
            queue_->release();
        }
        { std::lock_guard<std::mutex> lock(meterMutex_); if (meter_) meter_->finish(); }
    } catch (...) {
        failureSite_ = 7; failure_ = E_FAIL; stopCapture_ = true;
    }
}
Snapshot Engine::snapshot(unsigned seconds, size_t columns) {
    Snapshot result;
    result.format = format_; result.deviceId = deviceId_; result.captureEpoch = captureEpoch_;
    result.active = active_; result.capturedFrames = captured_; result.analyzedFrames = analyzed_;
    result.estimatedFrames = estimated_; result.droppedFrames = dropped_; result.queueHighWater = highWater_;
    result.discontinuities = discontinuities_; result.timestampErrors = timestampErrors_; result.overlapEvents = overlaps_;
    result.queueDepth = queue_ ? queue_->size() : 0;
    result.endpointBufferFrames = endpointBufferFrames_;
    result.errorSite = failureSite_;
    const auto error = failure_.load();
    result.sourceErrorCode=static_cast<uint32_t>(error);
    result.sourceRecoverable=recoverableCaptureFailure(error,result.errorSite);
    if (error) { std::ostringstream message; message << "DEVICE_OR_ANALYSIS_ERROR (0x" << std::hex << static_cast<unsigned long>(error) << ")"; result.error = message.str(); }
    std::lock_guard<std::mutex> lock(meterMutex_);
    if(replay_){result.replayFrames=replay_->retainedFrames();result.replayCapacityFrames=replay_->capacityFrames();}
    result.position = analysisEnd_; result.measurementEpoch = measurementEpoch_;
    result.gaps = measurementGap_; result.estimated = measurementEstimated_;
    if (meter_) {
        result.measurementFrames = meter_->frames();
        result.meterLagFrames = meter_->frames()-meter_->values().frame;
        result.truePeakLookaheadFrames = meter_->truePeakLookaheadFrames();
        result.meters = meter_->values();
        result.meters.frame += analysisBase_; result.meters.loudnessFrame += analysisBase_;
        result.waveform = meter_->waveform(seconds, columns); result.loudness = meter_->loudnessHistory(seconds);
        for (auto& p : result.waveform) p.frame += analysisBase_;
        for (auto& p : result.loudness) p.frame += analysisBase_;
    }
    return result;
}
}

namespace Trace {
void Engine::recordStart(const std::string& id,const std::filesystem::path& path,WavEncoding encoding,WavOptions options,const std::filesystem::path& journal) {
    if(!active_) throw std::runtime_error("DEVICE_UNAVAILABLE");
    RecordOptions record;record.id=id;record.basePath=path;record.format=format_;record.encoding=encoding;record.wav=options;record.journalPath=journal;
    recorder_.prepare(std::move(record));
    if(!active_) { recorder_.sourceFailed();recorder_.finishAfterProducerStopped();throw std::runtime_error("DEVICE_UNAVAILABLE"); }
}
void Engine::recordStop() {
    recorder_.requestStop();
    if(!active_) { if(captureThread_.joinable())captureThread_.join();recorder_.finishAfterProducerStopped(); }
}
RecordSnapshot Engine::recordSnapshot() const {return recorder_.snapshot();}
}
