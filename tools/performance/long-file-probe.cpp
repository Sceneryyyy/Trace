#include "SpectrogramTile.h"
#include <fstream>
#include <iostream>
#include <vector>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <stdexcept>
// Test-only float32 mono WAV transport around the production spectral kernel.
// Large fixture files are streamed, never loaded in full; not Trace::WavReader.
int main(int argc,char** argv){try{
 if(argc!=5)throw std::runtime_error("generate|serve file rate seconds");const std::string mode=argv[1];const uint32_t rate=std::stoul(argv[3]),seconds=std::stoul(argv[4]);const uint64_t frames=uint64_t(rate)*seconds;
 if(rate<8000||rate>96000||frames*4>0xffffffff-36)throw std::runtime_error("fixture range");
 if(mode=="generate"){
  std::ofstream out(argv[2],std::ios::binary);uint32_t size=uint32_t(frames*4+36),fmtBytes=16,byteRate=rate*4,dataBytes=uint32_t(frames*4);uint16_t tag=3,channels=1,align=4,bits=32;
  out.write("RIFF",4);out.write(reinterpret_cast<char*>(&size),4);out.write("WAVEfmt ",8);out.write(reinterpret_cast<char*>(&fmtBytes),4);out.write(reinterpret_cast<char*>(&tag),2);out.write(reinterpret_cast<char*>(&channels),2);out.write(reinterpret_cast<char*>(const_cast<uint32_t*>(&rate)),4);out.write(reinterpret_cast<char*>(&byteRate),4);out.write(reinterpret_cast<char*>(&align),2);out.write(reinterpret_cast<char*>(&bits),2);out.write("data",4);out.write(reinterpret_cast<char*>(&dataBytes),4);
  std::vector<float> chunk(rate);for(uint32_t i=0;i<rate;i++)chunk[i]=float((i<rate/100?.8:.2)*std::sin(2*3.141592653589793*997*i/rate));for(uint32_t i=0;i<seconds;i++)out.write(reinterpret_cast<const char*>(chunk.data()),chunk.size()*4);if(!out)throw std::runtime_error("fixture write failed");return 0;
 }
 if(mode!="serve")throw std::runtime_error("fixture mode");std::ifstream in(argv[2],std::ios::binary);if(!in)throw std::runtime_error("fixture open failed");uint64_t first;uint32_t columns,n;
 while(std::cin>>first>>columns>>n){
  Trace::InstrumentConfig config;config.fftSize=n;config.averageMs=config.holdMs=0;const auto hop=std::min(n/4,rate/50);if(!columns||columns>64||n<512||n>16384||(n&(n-1)))throw std::runtime_error("fixture request");
  const uint64_t begin=first>=n?first-n:0,end=std::min(frames,first+uint64_t(columns-1)*hop);if(end<begin||end-begin>uint64_t(rate)*5)throw std::runtime_error("fixture PCM window");
  Trace::PcmWindow pcm;pcm.format.sampleRate=rate;pcm.format.channels=1;pcm.firstFrame=begin;pcm.positionFrame=end;pcm.samples.resize(end-begin);
  in.clear();in.seekg(44+begin*4);in.read(reinterpret_cast<char*>(pcm.samples.data()),pcm.samples.size()*4);if(size_t(in.gcount())!=pcm.samples.size()*4)throw std::runtime_error("fixture read failed");
  const auto tile=Trace::makeSpectrogramTile(pcm,first,columns,config);const uint32_t header[]={tile.columns,tile.fftSize,tile.hop,tile.bins,tile.sampleRate,tile.channels};std::cout.write(reinterpret_cast<const char*>(header),24);std::cout.write(reinterpret_cast<const char*>(&first),8);std::cout.write(reinterpret_cast<const char*>(tile.status.data()),tile.status.size());std::cout.write(reinterpret_cast<const char*>(tile.decibels.data()),tile.decibels.size()*4);std::cout.flush();
 }
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
