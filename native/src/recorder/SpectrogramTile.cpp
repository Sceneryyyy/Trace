#include "SpectrogramTile.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
namespace Trace {
SpectrogramTile makeSpectrogramTile(const PcmWindow& pcm,uint64_t first,uint32_t columns,InstrumentConfig config){
 if(!columns||columns>64||pcm.format.channels<1||pcm.format.channels>2||pcm.samples.size()%pcm.format.channels)throw std::runtime_error("INVALID_SPECTROGRAM_TILE");
 config.averageMs=config.holdMs=0;config.fieldMs=50;
 const auto init=analyzeInstruments(nullptr,0,pcm.format.sampleRate,pcm.format.channels,0,0,config);
 const auto frames=pcm.samples.size()/pcm.format.channels;
 if(frames>uint64_t(pcm.format.sampleRate)*5||pcm.firstFrame>UINT64_MAX-frames||pcm.positionFrame<pcm.firstFrame||pcm.positionFrame>pcm.firstFrame+frames||
  first>UINT64_MAX-uint64_t(columns-1)*init.hop)throw std::runtime_error("INVALID_SPECTROGRAM_RANGE");
 SpectrogramTile tile;tile.firstFrame=first;tile.columns=columns;tile.fftSize=config.fftSize;tile.hop=init.hop;tile.bins=config.fftSize/2+1;tile.sampleRate=pcm.format.sampleRate;tile.channels=pcm.format.channels;
 tile.status.resize(columns,static_cast<uint8_t>(SpectralColumnStatus::Unavailable));tile.decibels.resize(size_t(columns)*tile.bins);
 for(uint32_t col=0;col<columns;++col){
  const auto end=first+uint64_t(col)*tile.hop;
  if(end<pcm.firstFrame||end>pcm.positionFrame||end-pcm.firstFrame<config.fftSize)continue;
  const auto begin=end-config.fftSize;
  if((pcm.gap&&pcm.gapFrames.empty())||std::any_of(pcm.gapFrames.begin(),pcm.gapFrames.end(),[&](uint64_t at){return at>=begin&&at<=end;})){tile.status[col]=static_cast<uint8_t>(SpectralColumnStatus::Gap);continue;}
  try{
   const auto result=analyzeInstruments(pcm.samples.data()+size_t(begin-pcm.firstFrame)*pcm.format.channels,config.fftSize,pcm.format.sampleRate,pcm.format.channels,begin,end,config);
   if(result.current.empty())continue;
   for(uint32_t bin=0;bin<tile.bins;++bin){const auto power=result.current[bin];tile.decibels[size_t(col)*tile.bins+bin]=power>0?static_cast<float>(10*std::log10(power)):-std::numeric_limits<float>::infinity();}
   tile.status[col]=static_cast<uint8_t>(SpectralColumnStatus::Ready);
  }catch(const std::exception&){tile.status[col]=static_cast<uint8_t>(SpectralColumnStatus::Error);}
 }
 return tile;
}
}
