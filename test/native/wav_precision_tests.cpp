#include "WavFile.h"
#include <windows.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
namespace fs=std::filesystem;
std::string bytes(const fs::path& p){std::ifstream f(p,std::ios::binary);return {std::istreambuf_iterator<char>(f),{}};}
int main(){
 LARGE_INTEGER counter;QueryPerformanceCounter(&counter);
 const auto root=fs::current_path()/("precision-tests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(counter.QuadPart));fs::create_directory(root);
 unsigned passed=0;
 for(const unsigned channels:{1u,2u})for(const auto encoding:{Trace::WavEncoding::Pcm16,Trace::WavEncoding::Pcm24,Trace::WavEncoding::Float32}){
  try{
   const auto dir=root/(std::to_string(channels)+"-"+std::to_string(static_cast<int>(encoding)));fs::create_directory(dir);
   const std::array<float,7> pattern{-1.25f,-1.0f,-.5f,0,.5f,1,1.25f};
   std::vector<float> input(2051*channels);uint64_t expectedClips=0;
   for(size_t i=0;i<input.size();++i){input[i]=pattern[i%pattern.size()];if(std::abs(input[i])>1&&encoding!=Trace::WavEncoding::Float32)++expectedClips;}
   Trace::WavOptions split;split.segmentBytes=601*channels*4;
   Trace::WavWriter source(dir/"source",48000,channels,Trace::WavEncoding::Float32,split);source.append(input.data(),2051);source.close();
   std::vector<fs::path> paths;std::vector<std::string> originals;for(const auto& s:source.segments()){paths.push_back(s.path);originals.push_back(bytes(s.path));}
   const unsigned sampleBytes=encoding==Trace::WavEncoding::Pcm16?2:encoding==Trace::WavEncoding::Pcm24?3:4;
   split.segmentBytes=333*channels*sampleBytes;
   const auto result=Trace::convertWavs(paths,dir/"output",encoding,split);
   REQUIRE(result.frames==2051&&result.clippedSamples==expectedClips&&result.segments.size()==7);
   uint64_t frame=0,totalClips=0;std::array<float,4096> decoded{};
   for(const auto& segment:result.segments){
    Trace::WavReader reader(segment.path);uint64_t segmentClips=0;
    for(;;){const auto count=reader.read(decoded.data(),2048);if(!count)break;
     for(size_t i=0;i<static_cast<size_t>(count)*channels;++i){
      const auto value=input[frame*channels+i];float expected=value;
      if(encoding!=Trace::WavEncoding::Float32){
       const int64_t scale=1LL<<(sampleBytes*8-1);
       expected=static_cast<float>(static_cast<double>(std::clamp<int64_t>(std::llround(std::clamp<double>(value,-1,1)*scale),-scale,scale-1))/scale);
       if(std::abs(value)>1)++segmentClips;
      }
      REQUIRE(decoded[i]==expected);
     }frame+=count;
    }
    REQUIRE(segment.clippedSamples==segmentClips);totalClips+=segmentClips;
   }
   REQUIRE(frame==2051&&totalClips==expectedClips);
   for(size_t i=0;i<paths.size();++i)REQUIRE(bytes(paths[i])==originals[i]);
   bool rejected=false;try{Trace::convertWavs(paths,dir/"output",encoding);}catch(...){rejected=true;}REQUIRE(rejected);
   ++passed;
  }catch(const std::exception& e){std::cerr<<"FAIL precision: "<<e.what()<<std::endl;}
 }
 try{
  Trace::WavWriter a(root/"rate-a",44100,1,Trace::WavEncoding::Float32),b(root/"rate-b",48000,1,Trace::WavEncoding::Float32);a.close();b.close();
  bool rejected=false;try{Trace::convertWavs({a.segments()[0].path,b.segments()[0].path},root/"mixed",Trace::WavEncoding::Pcm24);}catch(...){rejected=true;}
  REQUIRE(rejected&&!fs::exists(root/"mixed-1.wav"));++passed;
 }catch(const std::exception& e){std::cerr<<"FAIL mismatch: "<<e.what()<<std::endl;}
 std::cout<<passed<<"/7 precision cases passed (all encodings/channels, sample values, segmentation, clips, source retention, overwrite and rate rejection)"<<std::endl;
 return passed==7?0:1;
}
