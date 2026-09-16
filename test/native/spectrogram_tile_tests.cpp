#include "SpectrogramTile.h"
#include <chrono>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
using namespace Trace;
namespace {
void check(bool ok,const char* name){if(!ok)throw std::runtime_error(name);}
PcmWindow signal(uint32_t n,uint32_t columns,uint32_t rate,double amp=.5){
 PcmWindow p;p.format={rate,2,32,32,8,0,true};const auto hop=std::min(n/4,rate/50);p.positionFrame=n+uint64_t(columns-1)*hop;p.samples.resize(size_t(p.positionFrame)*2);
 for(size_t i=0;i<p.samples.size()/2;++i){const auto v=float(amp*std::sin(2*3.14159265358979323846*23*i/n));p.samples[i*2]=v;p.samples[i*2+1]=-v;}return p;
}
}
int main(){try{
 unsigned cases=0;
 for(auto n:{512u,2048u,16384u})for(auto rate:{8000u,44100u,48000u,96000u}){
  auto pcm=signal(n,8,rate);InstrumentConfig cfg;cfg.fftSize=n;const auto t=makeSpectrogramTile(pcm,n,8,cfg);
  check(t.columns==8&&t.bins==n/2+1&&t.decibels.size()==size_t(8)*t.bins,"tile dimensions");
  for(uint32_t col=0;col<t.columns;++col){check(t.status[col]==1,"valid column");const auto end=t.firstFrame+uint64_t(col)*t.hop;
   auto direct=analyzeInstruments(pcm.samples.data(),static_cast<uint32_t>(pcm.samples.size()/2),rate,2,0,end,cfg);
   for(uint32_t bin=0;bin<t.bins;++bin){const auto power=direct.current[bin];const auto db=t.decibels[size_t(col)*t.bins+bin];if(power==0)check(db==-std::numeric_limits<float>::infinity(),"true zero is silence");else check(std::abs(db-10*std::log10(power))<=.0001,"tile/M8 numerical agreement");}
  }++cases;
 }
 InstrumentConfig cfg;cfg.fftSize=2048;auto pcm=signal(2048,4,48000);
 auto missing=makeSpectrogramTile(pcm,0,1,cfg);check(missing.status[0]==0,"insufficient window mask");++cases;
 pcm.gap=true;pcm.gapFrames={2048};auto gap=makeSpectrogramTile(pcm,2048,4,cfg);check(gap.status[0]==2,"gap mask");pcm.gap=false;pcm.gapFrames.clear();++cases;
 pcm.samples.back()=std::numeric_limits<float>::quiet_NaN();auto bad=makeSpectrogramTile(pcm,2048,4,cfg);check(bad.status[0]==1&&bad.status[3]==3,"local corrupt PCM column");++cases;
 pcm=signal(2048,4,48000,1e-30);auto quiet=makeSpectrogramTile(pcm,2048,4,cfg);check(std::isfinite(quiet.decibels[23])&&quiet.decibels[23]<-590,"quiet finite spectrum not lost to power underflow");++cases;
 std::fill(pcm.samples.begin(),pcm.samples.end(),0.f);auto zero=makeSpectrogramTile(pcm,2048,4,cfg);check(zero.status[0]==1&&std::isinf(zero.decibels[23])&&zero.decibels[23]<0,"silence distinct from missing");++cases;
 bool rejected=false;try{makeSpectrogramTile(pcm,2048,65,cfg);}catch(...){rejected=true;}check(rejected,"column bound");++cases;
 pcm=signal(2048,4,48000);auto ordinary=makeSpectrogramTile(pcm,2048,4,cfg);const auto offset=uint64_t(1)<<60;pcm.firstFrame+=offset;pcm.positionFrame+=offset;const auto large=makeSpectrogramTile(pcm,offset+2048,4,cfg);check(large.firstFrame==offset+2048&&large.decibels==ordinary.decibels,"large frame identity");++cases;
 pcm=signal(16384,64,96000);cfg.fftSize=16384;const auto start=std::chrono::steady_clock::now();const auto maximum=makeSpectrogramTile(pcm,16384,64,cfg);
 check(maximum.decibels.size()*sizeof(float)<4*1024*1024,"bounded native payload");++cases;
 std::cout<<"MAX_TILE_MS "<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()<<"\nSPECTROGRAM_TILE_PASS "<<cases<<" cases\n";return 0;
}catch(const std::exception& e){std::cerr<<"SPECTROGRAM_TILE_FAIL "<<e.what()<<"\n";return 1;}}
