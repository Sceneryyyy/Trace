#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/AudioHardwareTapping.h>
#import <CoreAudio/CATapDescription.h>
#include <mach/mach_time.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {

struct Device {
    AudioDeviceID id = kAudioObjectUnknown;
    std::string uid;
    std::string name;
    double nominalRate = 0;
    UInt32 channels = 0;
    bool isDefault = false;
};

std::string json(const std::string& value) {
    std::string result = "\"";
    for (unsigned char c : value) {
        switch (c) {
            case '"': result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default:
                if (c < 0x20) result += '?';
                else result += static_cast<char>(c);
        }
    }
    return result + '"';
}

template <typename T>
bool property(AudioObjectID object, AudioObjectPropertySelector selector,
              AudioObjectPropertyScope scope, T& value) {
    AudioObjectPropertyAddress address{selector, scope, kAudioObjectPropertyElementMain};
    UInt32 size = sizeof(T);
    return AudioObjectGetPropertyData(object, &address, 0, nullptr, &size, &value) == noErr;
}

std::string stringProperty(AudioObjectID object, AudioObjectPropertySelector selector) {
    CFStringRef value = nullptr;
    if (!property(object, selector, kAudioObjectPropertyScopeGlobal, value) || !value) return {};
    char buffer[1024]{};
    const bool converted = CFStringGetCString(value, buffer, sizeof(buffer), kCFStringEncodingUTF8);
    CFRelease(value);
    return converted ? std::string(buffer) : std::string{};
}

UInt32 outputChannels(AudioDeviceID id) {
    AudioObjectPropertyAddress address{kAudioDevicePropertyStreamConfiguration,
        kAudioDevicePropertyScopeOutput, kAudioObjectPropertyElementMain};
    UInt32 size = 0;
    if (AudioObjectGetPropertyDataSize(id, &address, 0, nullptr, &size) != noErr || !size) return 0;
    std::vector<uint8_t> bytes(size);
    auto* list = reinterpret_cast<AudioBufferList*>(bytes.data());
    if (AudioObjectGetPropertyData(id, &address, 0, nullptr, &size, list) != noErr) return 0;
    UInt32 count = 0;
    for (UInt32 i = 0; i < list->mNumberBuffers; ++i) count += list->mBuffers[i].mNumberChannels;
    return count;
}

std::vector<Device> devices() {
    AudioObjectPropertyAddress address{kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
    UInt32 size = 0;
    if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, nullptr, &size) != noErr)
        throw std::runtime_error("device enumeration failed");
    std::vector<AudioDeviceID> ids(size / sizeof(AudioDeviceID));
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, nullptr, &size, ids.data()) != noErr)
        throw std::runtime_error("device list read failed");
    AudioDeviceID defaultId = kAudioObjectUnknown;
    property(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice,
             kAudioObjectPropertyScopeGlobal, defaultId);
    std::vector<Device> result;
    for (AudioDeviceID id : ids) {
        const UInt32 channels = outputChannels(id);
        const std::string uid = stringProperty(id, kAudioDevicePropertyDeviceUID);
        if (!channels || uid.empty()) continue;
        Float64 rate = 0;
        property(id, kAudioDevicePropertyNominalSampleRate, kAudioObjectPropertyScopeGlobal, rate);
        auto name = stringProperty(id, kAudioObjectPropertyName);
        result.push_back({id, uid, name.empty() ? uid : name, rate, channels, id == defaultId});
    }
    return result;
}

struct Counters {
    std::atomic<uint64_t> callbacks{0}, frames{0}, audibleFrames{0};
    std::atomic<uint64_t> missingHostTime{0}, missingSampleTime{0}, invalidBuffer{0}, gaps{0}, overlaps{0};
    std::atomic<uint64_t> firstHost{0}, lastHost{0};
    std::atomic<int64_t> nextSampleFrame{-1};
    AudioStreamBasicDescription format{};
};

OSStatus capture(AudioObjectID, const AudioTimeStamp*, const AudioBufferList* input,
                 const AudioTimeStamp* inputTime, AudioBufferList*, const AudioTimeStamp*, void* context) {
    auto& c = *static_cast<Counters*>(context);
    c.callbacks.fetch_add(1, std::memory_order_relaxed);
    const auto& f = c.format;
    if (!input || !input->mNumberBuffers || !input->mBuffers[0].mData || !f.mBytesPerFrame) {
        c.invalidBuffer.fetch_add(1, std::memory_order_relaxed);
        return noErr;
    }
    const UInt32 frames = input->mBuffers[0].mDataByteSize / f.mBytesPerFrame;
    if (!frames) return noErr;
    const bool planar = (f.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0;
    const UInt32 requiredBuffers = planar ? f.mChannelsPerFrame : 1;
    for (UInt32 buffer = 0; buffer < requiredBuffers; ++buffer) {
        if (buffer >= input->mNumberBuffers || !input->mBuffers[buffer].mData ||
            input->mBuffers[buffer].mDataByteSize < frames * f.mBytesPerFrame) {
            c.invalidBuffer.fetch_add(1, std::memory_order_relaxed);
            return noErr;
        }
    }
    c.frames.fetch_add(frames, std::memory_order_relaxed);
    if (inputTime && (inputTime->mFlags & kAudioTimeStampHostTimeValid)) {
        uint64_t empty = 0;
        c.firstHost.compare_exchange_strong(empty, inputTime->mHostTime, std::memory_order_relaxed);
        c.lastHost.store(inputTime->mHostTime, std::memory_order_relaxed);
    } else {
        c.missingHostTime.fetch_add(1, std::memory_order_relaxed);
    }
    if (inputTime && (inputTime->mFlags & kAudioTimeStampSampleTimeValid) &&
        std::isfinite(inputTime->mSampleTime) && inputTime->mSampleTime >= 0 &&
        inputTime->mSampleTime < static_cast<double>(std::numeric_limits<int64_t>::max() - frames)) {
        const auto start = static_cast<int64_t>(std::llround(inputTime->mSampleTime));
        const auto expected = c.nextSampleFrame.exchange(start + frames, std::memory_order_relaxed);
        if (expected >= 0 && start > expected) c.gaps.fetch_add(start - expected, std::memory_order_relaxed);
        if (expected >= 0 && start < expected) c.overlaps.fetch_add(expected - start, std::memory_order_relaxed);
    } else {
        c.missingSampleTime.fetch_add(1, std::memory_order_relaxed);
    }
    // Diagnostic only: inspect float32 samples in place. No PCM is copied, queued or written.
    uint64_t audible = 0;
    for (UInt32 frame = 0; frame < frames; ++frame) {
        bool active = false;
        for (UInt32 channel = 0; channel < f.mChannelsPerFrame; ++channel) {
            const UInt32 buffer = planar ? channel : 0;
            const auto* data = static_cast<const uint8_t*>(input->mBuffers[buffer].mData);
            const size_t index = planar ? frame : static_cast<size_t>(frame) * f.mChannelsPerFrame + channel;
            float sample = 0;
            std::memcpy(&sample, data + index * sizeof(float), sizeof(sample));
            active |= std::isfinite(sample) && std::fabs(sample) > 0.0001f;
        }
        audible += active;
    }
    c.audibleFrames.fetch_add(audible, std::memory_order_relaxed);
    return noErr;
}

class Tap {
public:
    Tap() = default;
    Tap(const Tap&) = delete;
    Tap& operator=(const Tap&) = delete;
    ~Tap() { close(); }

    void start(const Device& device, Counters& counters) {
        @autoreleasepool {
            NSString* uid = [NSString stringWithUTF8String:device.uid.c_str()];
            CATapDescription* description = [[CATapDescription alloc]
                initExcludingProcesses:@[] andDeviceUID:uid withStream:0];
            description.name = @"Trace M-MAC0 Probe";
            description.UUID = [NSUUID UUID];
            description.privateTap = YES;
            description.muteBehavior = CATapUnmuted;
            check(AudioHardwareCreateProcessTap(description, &tap_), "AudioHardwareCreateProcessTap");

            NSString* aggregateUid = [NSString stringWithFormat:@"local.trace.mac0.%@", [NSUUID UUID].UUIDString];
            NSDictionary* aggregate = @{
                [NSString stringWithUTF8String:kAudioAggregateDeviceNameKey]: @"Trace M-MAC0 Aggregate",
                [NSString stringWithUTF8String:kAudioAggregateDeviceUIDKey]: aggregateUid,
                [NSString stringWithUTF8String:kAudioAggregateDeviceIsPrivateKey]: @YES,
                [NSString stringWithUTF8String:kAudioAggregateDeviceMainSubDeviceKey]: uid,
                [NSString stringWithUTF8String:kAudioAggregateDeviceTapAutoStartKey]: @YES,
                [NSString stringWithUTF8String:kAudioAggregateDeviceSubDeviceListKey]: @[
                    @{[NSString stringWithUTF8String:kAudioSubDeviceUIDKey]: uid,
                      [NSString stringWithUTF8String:kAudioSubDeviceNameKey]:
                          [NSString stringWithUTF8String:device.name.c_str()],
                      [NSString stringWithUTF8String:kAudioSubDeviceDriftCompensationKey]: @YES}
                ],
                [NSString stringWithUTF8String:kAudioAggregateDeviceTapListKey]: @[
                    @{[NSString stringWithUTF8String:kAudioSubTapUIDKey]: description.UUID.UUIDString,
                      [NSString stringWithUTF8String:kAudioSubTapDriftCompensationKey]: @YES}
                ]
            };
            check(AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)aggregate, &aggregate_),
                  "AudioHardwareCreateAggregateDevice");
            AudioObjectPropertyAddress formatAddress{kAudioTapPropertyFormat,
                kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
            UInt32 size = sizeof(counters.format);
            check(AudioObjectGetPropertyData(tap_, &formatAddress, 0, nullptr, &size, &counters.format),
                  "AudioObjectGetPropertyData(kAudioTapPropertyFormat)");
            const auto& f = counters.format;
            if (f.mFormatID != kAudioFormatLinearPCM || !(f.mFormatFlags & kAudioFormatFlagIsFloat) ||
                f.mBitsPerChannel != 32 || f.mChannelsPerFrame < 1 || f.mChannelsPerFrame > 2 ||
                !std::isfinite(f.mSampleRate) || f.mSampleRate <= 0 ||
                f.mBytesPerFrame != sizeof(float) *
                    ((f.mFormatFlags & kAudioFormatFlagIsNonInterleaved) ? 1 : f.mChannelsPerFrame)) {
                throw std::runtime_error("unsupported tap format for diagnostic sample inspection");
            }
            check(AudioDeviceCreateIOProcID(aggregate_, capture, &counters, &ioProc_),
                  "AudioDeviceCreateIOProcID");
            check(AudioDeviceStart(aggregate_, ioProc_), "AudioDeviceStart");
            started_ = true;
        }
    }

    void close() {
        if (aggregate_ != kAudioObjectUnknown && ioProc_) {
            if (started_) AudioDeviceStop(aggregate_, ioProc_);
            AudioDeviceDestroyIOProcID(aggregate_, ioProc_);
            ioProc_ = nullptr;
        }
        started_ = false;
        if (aggregate_ != kAudioObjectUnknown) {
            AudioHardwareDestroyAggregateDevice(aggregate_);
            aggregate_ = kAudioObjectUnknown;
        }
        if (tap_ != kAudioObjectUnknown) {
            AudioHardwareDestroyProcessTap(tap_);
            tap_ = kAudioObjectUnknown;
        }
    }

private:
    static void check(OSStatus status, const char* operation) {
        if (status != noErr)
            throw std::runtime_error(std::string(operation) + " failed: " + std::to_string(status));
    }
    AudioObjectID tap_ = kAudioObjectUnknown;
    AudioObjectID aggregate_ = kAudioObjectUnknown;
    AudioDeviceIOProcID ioProc_ = nullptr;
    bool started_ = false;
};

} // namespace

int main(int argc, char** argv) {
    @autoreleasepool {
        try {
            if (@available(macOS 14.2, *)) {
                bool listOnly = false;
                std::string requested;
                unsigned seconds = 15;
                for (int i = 1; i < argc; ++i) {
                    const std::string arg = argv[i];
                    if (arg == "--list") listOnly = true;
                    else if (arg == "--device" && i + 1 < argc) requested = argv[++i];
                    else if (arg == "--seconds" && i + 1 < argc) {
                        const std::string value = argv[++i];
                        size_t parsedCharacters = 0;
                        const auto parsed = std::stoul(value, &parsedCharacters);
                        if (parsedCharacters != value.size()) throw std::runtime_error("invalid seconds");
                        if (parsed == 0 || parsed > 3600) throw std::runtime_error("seconds must be 1..3600");
                        seconds = static_cast<unsigned>(parsed);
                    } else throw std::runtime_error("usage: TraceCoreAudioProbe [--list] [--device UID] [--seconds 1..3600]");
                }
                const auto available = devices();
                for (const auto& d : available) {
                    std::cout << "{\"kind\":\"device\",\"uid\":" << json(d.uid)
                              << ",\"name\":" << json(d.name) << ",\"nominalRate\":" << d.nominalRate
                              << ",\"channels\":" << d.channels << ",\"default\":"
                              << (d.isDefault ? "true" : "false") << "}" << std::endl;
                }
                if (listOnly) return 0;
                const Device* selected = nullptr;
                for (const auto& d : available)
                    if ((!requested.empty() && d.uid == requested) || (requested.empty() && d.isDefault)) {
                        selected = &d;
                        break;
                    }
                if (!selected) throw std::runtime_error("selected output device unavailable");
                Counters counters;
                Tap tap;
                tap.start(*selected, counters);
                const auto& f = counters.format;
                mach_timebase_info_data_t timebase{};
                if (mach_timebase_info(&timebase) != KERN_SUCCESS || !timebase.denom)
                    throw std::runtime_error("mach_timebase_info failed");
                std::cout << "{\"kind\":\"capture_start\",\"deviceUid\":" << json(selected->uid)
                          << ",\"tapRate\":" << f.mSampleRate << ",\"channels\":" << f.mChannelsPerFrame
                          << ",\"bitsPerChannel\":" << f.mBitsPerChannel << ",\"bytesPerFrame\":" << f.mBytesPerFrame
                          << ",\"formatFlags\":" << f.mFormatFlags << "}" << std::endl;
                uint64_t previousFrames = 0, previousAudible = 0;
                for (unsigned second = 1; second <= seconds; ++second) {
                    std::this_thread::sleep_for(std::chrono::seconds(1));
                    const uint64_t frames = counters.frames.load();
                    const uint64_t audible = counters.audibleFrames.load();
                    const uint64_t firstHost = counters.firstHost.load();
                    const uint64_t lastHost = counters.lastHost.load();
                    std::cout << "{\"kind\":\"second\",\"elapsed\":" << second
                              << ",\"frames\":" << frames << ",\"deltaFrames\":" << frames - previousFrames
                              << ",\"audibleFrames\":" << audible << ",\"deltaAudibleFrames\":" << audible - previousAudible
                              << ",\"callbacks\":" << counters.callbacks.load()
                              << ",\"firstHost\":" << firstHost
                              << ",\"lastHost\":" << lastHost
                              << ",\"hostSpanNs\":";
                    if (firstHost && lastHost >= firstHost) {
                        const auto span = static_cast<uint64_t>(
                            static_cast<long double>(lastHost - firstHost) * timebase.numer / timebase.denom);
                        std::cout << span;
                    } else std::cout << "null";
                    std::cout << ",\"nextSampleFrame\":" << counters.nextSampleFrame.load()
                              << ",\"gapFrames\":" << counters.gaps.load()
                              << ",\"overlapFrames\":" << counters.overlaps.load()
                              << ",\"missingHostTime\":" << counters.missingHostTime.load()
                              << ",\"missingSampleTime\":" << counters.missingSampleTime.load()
                              << ",\"invalidBuffer\":" << counters.invalidBuffer.load() << "}" << std::endl;
                    previousFrames = frames;
                    previousAudible = audible;
                }
                tap.close();
                if (!counters.callbacks.load() || !counters.frames.load()) {
                    std::cerr << "M-MAC0 probe: capture returned no audio frames" << std::endl;
                    return 2;
                }
                return 0;
            }
            throw std::runtime_error("macOS 14.2 or newer is required");
        } catch (const std::exception& error) {
            std::cerr << "M-MAC0 probe: " << error.what() << std::endl;
            return 1;
        }
    }
}
