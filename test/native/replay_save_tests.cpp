#include "ReplaySave.h"
#include "FileAnalysis.h"
#include "Meter.h"
#include <windows.h>
#include <cmath>
#include <fstream>
#include <iostream>
#include <vector>
using namespace Trace;
void check(bool value,const char* text){if(!value)throw std::runtime_error(text);}
float sample(uint64_t frame,uint32_t channel){return float((frame%997)+channel*17)/2048.f;}
int main(){try{
 const auto root=std::filesystem::current_path()/("replay-save-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));
 std::filesystem::create_directory(root);unsigned cases=0;
 for(auto rate:{44100U,48000U,96000U})for(auto channels:{1U,2U}){
  const auto directory=root/(std::to_string(rate)+"-"+std::to_string(channels));std::filesystem::create_directory(directory);
  SourceFormat format{rate,channels,32,32,channels*4,0,true};ReplayBuffer buffer(format);std::vector<float> input(kBlockFrames*channels);
  const uint64_t total=uint64_t(rate)*67+137;
  for(uint64_t position=0;position<total;){const auto count=uint32_t(std::min<uint64_t>(kBlockFrames,total-position));for(uint32_t f=0;f<count;f++)for(uint32_t c=0;c<channels;c++)input[f*channels+c]=sample(position+f,c);buffer.push(input.data(),count);position+=count;}
  const auto clip=buffer.freeze();const uint64_t a=17,b=clip->frames()-31;
  input.assign(input.size(),0);buffer.push(input.data(),kBlockFrames);
  const auto saved=saveReplay(*clip,directory/"saved",directory/"journal.jsonl",WavEncoding::Float32,a,b);
  check(saved.frames==b-a&&saved.format.sampleRate==rate&&saved.format.channels==channels,"saved identity or frame count");
  WavReader reader(saved.segments.front().path);uint64_t position=0;
  while(const auto count=reader.read(input.data(),kBlockFrames)){for(uint32_t f=0;f<count;f++)for(uint32_t c=0;c<channels;c++)check(input[f*channels+c]==sample(clip->originFrame+a+position+f,c),"saved PCM differs from fixed cache");position+=count;}
  check(position==b-a,"saved EOF");++cases;
 }
 ReplayClip clip;clip.format={48000,2,32,32,8,0,true};clip.samples.resize(2051*2);
 for(size_t i=0;i<clip.samples.size();i++)clip.samples[i]=i%2?-1.25f:1.25f;
 for(const auto encoding:{WavEncoding::Pcm16,WavEncoding::Pcm24,WavEncoding::Float32}){
  const auto dir=root/("precision-"+std::to_string(unsigned(encoding)));std::filesystem::create_directory(dir);
  const auto saved=saveReplay(clip,dir/"clip",dir/"journal.jsonl",encoding,1,2050);
  check(saved.frames==2049,"precision range");check(saved.format.containerBits==(encoding==WavEncoding::Pcm16?16U:encoding==WavEncoding::Pcm24?24U:32U),"precision header");
  check(saved.clippedSamples==(encoding==WavEncoding::Float32?0ULL:4098ULL),"saved clipping report");
  const auto size=std::filesystem::file_size(saved.segments.front().path);bool rejected=false;
  try{saveReplay(clip,dir/"clip",dir/"journal.jsonl",encoding,1,2050);}catch(...){rejected=true;}
  check(rejected&&std::filesystem::file_size(saved.segments.front().path)==size,"existing saved file overwritten");++cases;
 }
 {
  const auto dir=root/"failure";std::filesystem::create_directory(dir);WavOptions options;options.failAfterPayloadBytes=1200;bool rejected=false;
  try{saveReplay(clip,dir/"clip",dir/"journal.jsonl",WavEncoding::Pcm24,0,2051,options);}catch(...){rejected=true;}
  check(rejected,"disk fault ignored");const auto recovered=recoverWav(dir/"clip-1.wav",dir/"recovered.wav");
  check(recovered.frames>0&&recovered.frames<2051,"written prefix not recoverable");++cases;
 }
 {
  const auto dir=root/"analysis";std::filesystem::create_directory(dir);ReplayClip music;music.format={48000,2,32,32,8,0,true};music.samples.resize(48000*4*2);
  for(uint64_t f=0;f<48000*4;f++)for(uint32_t c=0;c<2;c++)music.samples[f*2+c]=float((f<48000*3?.1:.3)*std::sin(6.283185307179586*(c?1499:997)*double(f)/48000));
  const auto saved=saveReplay(music,dir/"clip",dir/"journal.jsonl",WavEncoding::Float32,48000*3,48000*4);
  const auto analyzed=analyzeFiles({saved.segments.front().path},dir/"cache");
  Meter fresh(48000,2),whole(48000,2);fresh.push(music.samples.data()+48000*3*2,48000);fresh.finish();whole.push(music.samples.data(),48000*4);whole.finish();
  check(std::abs(analyzed.summary.integrated.value-fresh.values().integrated.value)<1e-10,"saved program did not start with fresh loudness state");
  check(std::abs(analyzed.summary.integrated.value-whole.values().integrated.value)>1,"fixture does not distinguish original prefix");++cases;
 }
 bool rejected=false;try{saveReplay(clip,root/"invalid",root/"invalid.jsonl",WavEncoding::Float32,0,2052);}catch(...){rejected=true;}
 check(rejected&&!std::filesystem::exists(root/"invalid-1.wav"),"invalid range created audio");++cases;
 {
  ReplayBuffer buffer({48000,1,32,32,4,0,true});std::vector<float> pcm(100,0);
  buffer.push(pcm.data(),20);buffer.push(pcm.data(),30,EstimatedSilence);buffer.push(pcm.data(),50);
  const auto frozen=buffer.freeze();const auto dir=root/"quality";std::filesystem::create_directory(dir);
  saveReplay(*frozen,dir/"clip",dir/"journal.jsonl",WavEncoding::Float32,10,60);
  std::ifstream journal(dir/"journal.jsonl");const std::string text((std::istreambuf_iterator<char>(journal)),{});
  check(text.find("\"estimatedFrames\":\"30\"")!=std::string::npos&&text.find("\"unknown\":false")!=std::string::npos,"saved capture quality is absent from journal");++cases;
 }
 std::cout<<"REPLAY_SAVE_PASS "<<cases<<"\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
