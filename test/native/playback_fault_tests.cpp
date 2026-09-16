#include "Playback.h"
#include "WavFile.h"
#include <windows.h>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <thread>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
std::string narrow(const wchar_t* text){
 const int count=WideCharToMultiByte(CP_UTF8,0,text,-1,nullptr,0,nullptr,nullptr);std::string result(count,0);
 WideCharToMultiByte(CP_UTF8,0,text,-1,result.data(),count,nullptr,nullptr);result.pop_back();return result;
}
int wmain(int argc,wchar_t** argv){
 if(argc!=3){std::cerr<<"Device ID and float fixture path required\n";return 2;}
 unsigned passed=0;const std::filesystem::path input=argv[2];
 try{
  Trace::Playback player;player.volume(.05f);
  Trace::PlaybackOptions options;options.id="slow-decoder";options.deviceId=narrow(argv[1]);options.sources={input};options.decoderDelayMs=150;
  std::cout<<"SLOW_OPEN"<<std::endl;player.open(options);std::cout<<"SLOW_PLAY"<<std::endl;player.play();
  Trace::PlaybackSnapshot value;
  for(const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(4);std::chrono::steady_clock::now()<deadline;){value=player.snapshot();if(!value.error.empty())break;std::this_thread::sleep_for(std::chrono::milliseconds(5));}
  std::cout<<"SLOW_RESULT phase="<<value.phase<<" error="<<value.error<<" position="<<value.positionFrame<<" submitted="<<value.submittedFrames<<" total="<<value.totalFrames<<" padding="<<value.paddingFrames<<std::endl;
  std::cout<<"SLOW_CLOSE"<<std::endl;player.close();std::cout<<"SLOW_CLOSED"<<std::endl;
  REQUIRE(value.error=="PLAYBACK_UNDERRUN"&&value.phase=="failed"&&!value.playing);
  REQUIRE(value.submittedFrames<value.totalFrames&&value.positionFrame<=value.submittedFrames);
  player.close();++passed;std::cout<<"PASS slow decoder explicitly fails without advancing over unheard samples\n";
 }catch(const std::exception& error){std::cerr<<"FAIL slow decoder: "<<error.what()<<'\n';}
 try{
  const auto directory=std::filesystem::current_path()/("invalid-playback-"+std::to_string(GetCurrentProcessId()));std::filesystem::create_directory(directory);
  const auto invalid=directory/"nonfinite.wav";std::filesystem::copy_file(input,invalid);
  const auto info=Trace::inspectWav(invalid);REQUIRE(info.format.floatingPoint);
  {std::fstream file(invalid,std::ios::in|std::ios::out|std::ios::binary);file.seekp(info.dataOffset);const unsigned char nan[]{0,0,0xc0,0x7f};file.write(reinterpret_cast<const char*>(nan),4);}
  Trace::Playback player;Trace::PlaybackOptions options;options.id="invalid-audio";options.deviceId=narrow(argv[1]);options.sources={invalid};
  bool rejected=false;std::cout<<"INVALID_OPEN"<<std::endl;try{
   player.open(options);
   for(unsigned i=0;i<200;++i){if(player.snapshot().error=="PLAYBACK_NONFINITE_AUDIO"){rejected=true;break;}std::this_thread::sleep_for(std::chrono::milliseconds(5));}
  }catch(const std::exception& error){rejected=std::string(error.what())=="PLAYBACK_NONFINITE_AUDIO";}
  std::cout<<"INVALID_CHECK "<<rejected<<std::endl;REQUIRE(rejected);player.close();++passed;std::cout<<"PASS invalid file samples are rejected before being rendered\n";
 }catch(const std::exception& error){std::cerr<<"FAIL invalid audio: "<<error.what()<<'\n';}
 {std::ofstream report(std::filesystem::current_path()/"output-fault-result.json");report<<"{\"status\":\""<<(passed==2?"pass":"fail")<<"\",\"checks\":"<<passed<<"}";report.flush();}
 std::cout<<passed<<"/2 real-output fault cases passed"<<std::endl;return passed==2?0:1;
}
