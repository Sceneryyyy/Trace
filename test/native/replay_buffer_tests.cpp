#include "ReplayBuffer.h"
#include "WaveSequence.h"
#include "Meter.h"
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace Trace;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
float sample(uint64_t f,uint32_t c){return static_cast<float>((f%997)+c*17)/2048.f;}
int main(){try{
 unsigned cases=0;
 for(auto rate:{44100U,48000U,96000U})for(auto channels:{1U,2U}){
  SourceFormat format{rate,channels,32,32,channels*4,0,true};ReplayBuffer buffer(format);
  std::vector<float> input(kBlockFrames*channels);const uint64_t total=uint64_t(rate)*67+137;
  for(uint64_t pos=0;pos<total;){const auto n=static_cast<uint32_t>(std::min<uint64_t>(kBlockFrames,total-pos));for(uint32_t f=0;f<n;++f)for(uint32_t c=0;c<channels;++c)input[f*channels+c]=sample(pos+f,c);buffer.push(input.data(),n);pos+=n;}
  check(buffer.retainedFrames()==uint64_t(rate)*60,"unbounded PCM retention");const auto clip=buffer.freeze();const auto range=buffer.range();check(range.start==clip->originFrame&&range.end-range.start==clip->frames(),"range does not match frozen PCM");
  check(clip->frames()==uint64_t(rate)*60&&clip->originFrame==total-clip->frames(),"rolling frame boundary");
  WaveSequence reader(clip);std::vector<float> actual(257*channels);
  for(const auto pos:{0ULL,17ULL,static_cast<unsigned long long>(clip->frames()-257)}){
   reader.seek(pos);check(reader.read(actual.data(),257)==257,"memory decoder read");
   for(uint32_t f=0;f<257;++f)for(uint32_t c=0;c<channels;++c)check(actual[f*channels+c]==sample(clip->originFrame+pos+f,c),"wrapped PCM mismatch");
  }
  input.assign(input.size(),0);buffer.push(input.data(),128);reader.seek(0);reader.read(actual.data(),1);
  check(actual[0]==sample(clip->originFrame,0),"frozen audio changed");
  buffer.reset();check(buffer.retainedFrames()==0,"reset retained old audio");bool rejected=false;try{buffer.freeze();}catch(...){rejected=true;}check(rejected,"empty replay accepted");++cases;
 }
 SourceFormat format{48000,2,32,32,8,0,true};ReplayBuffer buffer(format);Meter meter(48000,2);
 std::vector<MeterValues> reference;meter.setFrameSink([&](const MeterValues& m,const WavePoint& w,bool loud){reference.push_back(m);buffer.remember(m,w,loud);});
 std::vector<float> input(kBlockFrames*2);const uint64_t total=48000*5+37;
 for(uint64_t f=0;f<total;){const auto n=static_cast<uint32_t>(std::min<uint64_t>(kBlockFrames,total-f));for(uint32_t i=0;i<n;++i)for(uint32_t c=0;c<2;++c)input[i*2+c]=float(.05*std::sin(6.283185307179586*(c?1499:997)*(f+i)/48000));buffer.push(input.data(),n);meter.push(input.data(),n);f+=n;}
 const auto running=buffer.freeze(true);const auto published=buffer.range(true);check(published.start==running->originFrame&&published.end-published.start==running->frames(),"published range mismatch");check(running->frames()==meter.values().frame,"active freeze includes unmeasured tail");check(running->frames()<total,"fixture lacks pending lookahead");++cases;
  meter.finish();const auto clip=buffer.freeze();
 for(const auto& m:reference){const auto first=clip->view(m.frame,0,clip->frames(),900),again=clip->view(m.frame,0,clip->frames(),0);check(first.meters.frame==m.frame&&again.meters.frame==m.frame,"history index changed");check(first.meters.integrated.status==m.integrated.status&&first.meters.integrated.value==m.integrated.value,"historical I changed");check(first.meters.channels[0].truePeak.value==m.channels[0].truePeak.value,"historical true peak changed");}
 check(clip->view(0,0,clip->frames(),900).waveform.size()<=900,"unbounded waveform");++cases;
 const auto selection=clip->analyze(24000,120000);Meter cut(48000,2);cut.push(clip->samples.data()+24000*2,96000);cut.finish();check(selection.integrated.value==cut.values().integrated.value&&selection.maxTruePeak.value==cut.values().maxTruePeak.value,"selection not independent");++cases;
 std::cout<<"REPLAY_BUFFER_PASS "<<cases<<"\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
