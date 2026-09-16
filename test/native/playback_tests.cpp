#include "PlaybackTimeline.h"
#include "WaveSequence.h"
#include "Playback.h"
#include <windows.h>
#include <array>
#include <filesystem>
#include <functional>
#include <iostream>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
namespace fs=std::filesystem;
int main(){
 LARGE_INTEGER counter;QueryPerformanceCounter(&counter);const auto root=fs::current_path()/("playback-tests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(counter.QuadPart));fs::create_directory(root);
 std::vector<std::pair<const char*,std::function<void()>>> tests{
  {"opaque device-clock units map by frequency without 64-bit overflow",[]{
   REQUIRE(Trace::playbackMulDiv(10000000,44100,10000000)==44100);
   REQUIRE(Trace::playbackMulDiv(99996,48000,192000)==24999);
   REQUIRE(Trace::playbackMulDiv(UINT64_MAX,44100,44100)==UINT64_MAX);
   REQUIRE(Trace::playbackMulDiv(UINT64_MAX,UINT64_MAX,UINT64_MAX)==UINT64_MAX);
   bool rejected=false;try{Trace::playbackMulDiv(UINT64_MAX,2,1);}catch(...){rejected=true;}REQUIRE(rejected);
   rejected=false;try{Trace::playbackMulDiv(1,1,0);}catch(...){rejected=true;}REQUIRE(rejected);
  }},
  {"seek starts at the exact file frame and EOF never exceeds the asset",[]{
   Trace::PlaybackPlan plan{7,96001,192000,0,0,false};plan.validate();
   REQUIRE(plan.fileFrame(0)==96001&&plan.fileFrame(47999)==144000&&plan.remaining(47999)==48000);
   REQUIRE(plan.fileFrame(UINT64_MAX)==192000&&plan.remaining(UINT64_MAX)==0);
  }},
  {"loop mapping uses submitted stream order and repeated wraps",[]{
   Trace::PlaybackPlan plan{11,130,1000,100,160,true};plan.validate();
   REQUIRE(plan.fileFrame(0)==130&&plan.fileFrame(29)==159&&plan.fileFrame(30)==100);
   REQUIRE(plan.fileFrame(600)==130&&plan.loopsAt(600)==10&&plan.loopsAt(30)==1);
   Trace::PlaybackPlan tiny{12,5,8,5,6,true};tiny.validate();
   REQUIRE(tiny.fileFrame(UINT64_MAX)==5&&tiny.loopsAt(UINT64_MAX)==UINT64_MAX);
  }},
  {"invalid seek and empty loop cannot enter the output plan",[]{
   for(const auto plan:{Trace::PlaybackPlan{1,11,10},Trace::PlaybackPlan{1,0,10,0,0,true},Trace::PlaybackPlan{1,5,10,6,8,true},Trace::PlaybackPlan{1,9,10,0,11,true}}){
    bool failed=false;try{plan.validate();}catch(...){failed=true;}REQUIRE(failed);
   }
   Trace::PlaybackPlan empty{1,0,0};empty.validate();REQUIRE(empty.fileFrame(100)==0);
  }},
  {"streaming read and seek cross segment boundaries without repeat or loss",[&]{
   Trace::WavOptions options;options.segmentBytes=137*2*4;
   Trace::WavWriter writer(root/"sequence",48000,2,Trace::WavEncoding::Float32,options);
   std::array<float,4000> input{};for(unsigned f=0;f<2000;++f){input[f*2]=f/4096.0f;input[f*2+1]=-input[f*2];}
   writer.append(input.data(),2000);writer.close();std::vector<fs::path> paths;for(const auto& s:writer.segments())paths.push_back(s.path);
   Trace::WaveSequence source(paths);REQUIRE(source.frames()==2000&&source.format().channels==2);
   std::array<float,1000> out{};uint64_t frame=0;
   for(;;){const auto count=source.read(out.data(),311);if(!count)break;for(uint32_t i=0;i<count*2;++i)REQUIRE(out[i]==input[frame*2+i]);frame+=count;}
   REQUIRE(frame==2000);
   Trace::WaveSequence clipped(paths,133,1749);REQUIRE(clipped.frames()==1616);clipped.seek(137);
   REQUIRE(clipped.read(out.data(),311)==311);for(unsigned i=0;i<622;++i)REQUIRE(out[i]==input[(133+137)*2+i]);
   clipped.seek(1615);REQUIRE(clipped.read(out.data(),2)==1);REQUIRE(out[0]==input[1748*2]);
   bool badRange=false;try{Trace::WaveSequence invalid(paths,200,100);}catch(...){badRange=true;}REQUIRE(badRange);

   for(const unsigned position:{0u,136u,137u,138u,274u,1900u,1999u,2000u}){
    source.seek(position);const auto count=source.read(out.data(),53);REQUIRE(count==std::min(53u,2000-position));
    for(uint32_t i=0;i<count*2;++i)REQUIRE(out[i]==input[position*2+i]);
   }
  }},
  {"file source refuses mixed sample rates before playback",[&]{
   Trace::WavWriter first(root/"a",48000,1,Trace::WavEncoding::Float32),second(root/"b",96000,1,Trace::WavEncoding::Float32);first.close();second.close();
   bool failed=false;try{Trace::WaveSequence source({first.segments()[0].path,second.segments()[0].path});}catch(...){failed=true;}REQUIRE(failed);
  }},
  {"closed player rejects transport and validates independent monitor gain",[]{
   Trace::Playback player;player.close();player.close();REQUIRE(player.snapshot().phase=="idle");
   bool failed=false;try{player.play();}catch(...){failed=true;}REQUIRE(failed);
   failed=false;try{player.volume(1.01f);}catch(...){failed=true;}REQUIRE(failed);
   player.volume(0);player.volume(1);
  }}
 };
 unsigned passed=0;for(const auto& [name,test]:tests){try{test();++passed;std::cout<<"PASS "<<name<<std::endl;}catch(const std::exception& e){std::cerr<<"FAIL "<<name<<": "<<e.what()<<std::endl;}}
 std::cout<<passed<<"/"<<tests.size()<<" playback foundation cases passed"<<std::endl;return passed==tests.size()?0:1;
}
