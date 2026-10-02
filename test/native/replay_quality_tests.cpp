#include "ReplayBuffer.h"
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace Trace;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(){try{
 unsigned cases=0;
 for(auto rate:{8000U,44100U,48000U,96000U})for(auto channels:{1U,2U}){
  ReplayBuffer buffer({rate,channels,32,32,channels*4,0,true});std::vector<float> pcm(kBlockFrames*channels,.25f);
  buffer.push(pcm.data(),7,Silent);buffer.push(pcm.data(),11,EstimatedSilence|Silent);buffer.push(pcm.data(),13,Gap|Missing);buffer.push(pcm.data(),17);
  const auto clip=buffer.freeze();const auto q=clip->quality(5,23);
  check(q.estimatedFrames==11&&q.gapFrames==5&&!q.unknown,"selected quality counts do not match exact frames");
  check(clip->quality(31,48).estimatedFrames==0&&clip->quality(31,48).gapFrames==0,"clean range inherits outside quality");
  for(uint64_t count=0;count<uint64_t(rate)*60;){const auto n=uint32_t(std::min<uint64_t>(kBlockFrames,uint64_t(rate)*60-count));buffer.push(pcm.data(),n);count+=n;}
  const auto wrapped=buffer.freeze();check(wrapped->frames()==uint64_t(rate)*60,"PCM exceeded 60-second bound");
  check(wrapped->qualityFlags.size()==wrapped->frames()&&wrapped->quality(0,wrapped->frames()).estimatedFrames==0&&wrapped->quality(0,wrapped->frames()).gapFrames==0,"expired flags survived ring wrap");
  check(clip->quality(7,18).estimatedFrames==11,"fixed clip quality changed with live buffer");
  buffer.reset();buffer.push(pcm.data(),9,EstimatedSilence);const auto reset=buffer.freeze();check(reset->frames()==9&&reset->quality(0,9).estimatedFrames==9,"reset retained stale quality");
  bool invalid=false;try{clip->quality(0,49);}catch(...){invalid=true;}check(invalid,"out-of-range selection accepted");
  invalid=false;try{clip->quality(20,10);}catch(...){invalid=true;}check(invalid,"reversed selection accepted");
  ++cases;
 }
 {
  ReplayBuffer buffer({48000,1,32,32,4,0,true});std::vector<float> pcm(64,0);
  buffer.push(pcm.data(),20);MeterValues meters;meters.frame=12;WavePoint wave;wave.frame=12;buffer.remember(meters,wave,false);
  buffer.push(pcm.data(),10,EstimatedSilence);const auto published=buffer.freeze(true);
  check(published->frames()==12&&published->quality(0,12).estimatedFrames==0,"unpublished tail contaminates quality");++cases;
 }
 {
  ReplayClip legacy;legacy.format={8000,1,32,32,4,0,true};legacy.samples.resize(5);
  check(legacy.quality(0,5).unknown,"missing quality claims complete");++cases;
 }
 std::cout<<"REPLAY_QUALITY_PASS "<<cases<<" cases\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
