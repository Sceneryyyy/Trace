#pragma once
#include "ReplayBuffer.h"
#include "InstrumentAnalysis.h"
namespace Trace {
enum class SpectralColumnStatus:uint8_t {Unavailable=0,Ready=1,Gap=2,Error=3};
struct SpectrogramTile {
 uint64_t firstFrame=0;
 uint32_t columns=0,fftSize=0,hop=0,bins=0,sampleRate=0,channels=0;
 std::vector<float> decibels;
 std::vector<uint8_t> status;
};
SpectrogramTile makeSpectrogramTile(const PcmWindow& pcm,uint64_t firstEndFrame,uint32_t columns,InstrumentConfig config);
}
