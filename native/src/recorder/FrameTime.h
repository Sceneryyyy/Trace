#pragma once

#include <cstdint>

namespace Trace {

inline uint64_t frameDuration100ns(uint64_t frames, uint32_t rate) noexcept {
    return (frames / rate) * 10000000ULL + (frames % rate) * 10000000ULL / rate;
}

} // namespace Trace
