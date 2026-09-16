#pragma once
#include "AudioTypes.h"
#include <cmath>
#include <cstring>
namespace Trace {
// Requires a SourceFormat validated at device-open time.
inline float decodeSample(const uint8_t* data, const SourceFormat& f) noexcept {
    if (f.floatingPoint) { float value; std::memcpy(&value, data, 4); return value; }
    uint32_t raw = 0;
    for (uint32_t b = 0; b < f.containerBits / 8; ++b) raw |= static_cast<uint32_t>(data[b]) << (b * 8);
    if (f.containerBits < 32 && (raw & (1u << (f.containerBits - 1)))) raw |= ~((1u << f.containerBits) - 1);
    int32_t value;
    std::memcpy(&value, &raw, 4);
    value >>= (f.containerBits - f.validBits);
    return static_cast<float>(static_cast<double>(value) / std::ldexp(1.0, static_cast<int>(f.validBits) - 1));
}
}
