#pragma once
#include "ReplayBuffer.h"
#include "WavFile.h"
namespace Trace {
// Offline materialization of an immutable, bounded clip. No capture-thread I/O.
WavConversion saveReplay(const ReplayClip& clip,const std::filesystem::path& base,
    const std::filesystem::path& journal,WavEncoding encoding,uint64_t start,uint64_t end,
    WavOptions options={});
}
