#pragma once
#include <cstdint>
#include <windows.h>
#include <audioclient.h>
namespace Trace {
inline bool recoverableCaptureFailure(long error,uint32_t site) noexcept {
    if(site<2||site>6)return false;
    return error==AUDCLNT_E_DEVICE_INVALIDATED||error==AUDCLNT_E_RESOURCES_INVALIDATED||
           error==AUDCLNT_E_SERVICE_NOT_RUNNING||error==AUDCLNT_E_BUFFER_OPERATION_PENDING;
}
inline uint64_t frameDuration100ns(uint64_t frames,uint32_t rate) noexcept {
    return (frames/rate)*10000000ULL+(frames%rate)*10000000ULL/rate;
}
}
