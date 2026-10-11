#include "InstrumentAnalysis.h"
#include "SpectrogramTile.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <vector>
// Bounded PCM windows at real long-file frame positions. Synthetic deterministic
// signals exercise production kernels; this is not WASAPI or file-I/O evidence.
int main(){
 using namespace Trace;using Clock=std::chrono::steady_clock;
 for(auto rate:{44100u,48000u,96000u})for(auto seconds:{30u,600u,7200u})for(auto size:{2048u,16384u}){
  InstrumentConfig c;c.fftSize=size;PcmWindow pcm;pcm.format.sampleRate=rate;pcm.format.channels=2;
  const auto hop=std::min(size/4,rate/50),frames=size+63*hop;
  pcm.samples.resize(size_t(frames)*2);std::vector<double> timings;
  for(unsigned seek=0;seek<24;++seek){
   const uint64_t end=uint64_t(rate)*seconds*(seek+1)/24;
   pcm.firstFrame=end>frames?end-frames:0;pcm.positionFrame=pcm.firstFrame+frames;
   for(unsigned n=0;n<frames;++n){pcm.samples[2*n]=float(.2*std::sin(2*3.141592653589793*997*double(pcm.firstFrame+n)/rate));pcm.samples[2*n+1]=pcm.samples[2*n]*.5f;}
   const auto begin=Clock::now();const auto tile=makeSpectrogramTile(pcm,pcm.firstFrame+size,64,c);
   if(tile.status.back()!=1)return 2;
   timings.push_back(std::chrono::duration<double,std::milli>(Clock::now()-begin).count());
  }
  std::sort(timings.begin(),timings.end());
  std::cout<<"{\"rate\":"<<rate<<",\"durationSeconds\":"<<seconds<<",\"fftSize\":"<<size<<",\"queries\":24,\"pcmBytes\":"<<pcm.samples.size()*sizeof(float)<<",\"p50Ms\":"<<timings[11]<<",\"p95Ms\":"<<timings[22]<<",\"p99Ms\":"<<timings[23]<<"}\n";
 }
}
