#include "ReplaySave.h"
#include <algorithm>
#include <array>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
namespace Trace {
namespace {
std::string quote(const std::string& text){
 std::ostringstream out;out<<'"';
 for(const unsigned char c:text){
  if(c=='"'||c=='\\')out<<'\\'<<char(c);
  else if(c<32)out<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<unsigned(c)<<std::dec;
  else out<<char(c);
 }
 out<<'"';return out.str();
}
}
WavConversion saveReplay(const ReplayClip& clip,const std::filesystem::path& base,
 const std::filesystem::path& journalPath,WavEncoding encoding,uint64_t start,uint64_t end,WavOptions options){
 if(clip.format.sampleRate<8000||clip.format.sampleRate>96000||clip.format.channels<1||clip.format.channels>2||
  clip.frames()>uint64_t(clip.format.sampleRate)*60||start>=end||end>clip.frames())throw std::runtime_error("INVALID_REPLAY_SELECTION");
 WavWriter writer(base,clip.format.sampleRate,clip.format.channels,encoding,options);
 std::ofstream journal(journalPath,std::ios::binary|std::ios::app);
 if(!journal)throw std::runtime_error("JOURNAL_OPEN_FAILED");
 uint64_t sequence=0,nextCheckpoint=clip.format.sampleRate;
 auto checkpoint=[&](){
  writer.checkpoint();
  journal<<"{\"seq\":"<<++sequence<<",\"event\":\"checkpoint\",\"frames\":\""<<writer.frames()<<"\",\"segments\":[";
  bool first=true;for(const auto& part:writer.segments()){
   if(!first)journal<<',';first=false;
   journal<<"{\"file\":"<<quote(part.path.filename().u8string())<<",\"frames\":\""<<part.frames<<"\"}";
  }
  journal<<"]}\n";journal.flush();if(!journal)throw std::runtime_error("JOURNAL_WRITE_FAILED");
 };
 journal<<"{\"seq\":"<<++sequence<<",\"event\":\"prepared\",\"origin\":\"memory\"}\n";
 journal<<"{\"seq\":"<<++sequence<<",\"event\":\"begin\",\"captureStartFrame\":\"0\"}\n";journal.flush();
 std::array<float,kBlockFrames*2> block{};
 try{
  for(auto frame=start;frame<end;){
   const auto count=static_cast<uint32_t>(std::min<uint64_t>(kBlockFrames,end-frame));
   if(clip.read(frame,block.data(),count)!=count)throw std::runtime_error("REPLAY_READ_INCOMPLETE");
   writer.append(block.data(),count);frame+=count;
   if(writer.frames()>=nextCheckpoint){checkpoint();nextCheckpoint=writer.frames()+clip.format.sampleRate;}
  }
  writer.close();
  journal<<"{\"seq\":"<<++sequence<<",\"event\":\"close\",\"frames\":\""<<writer.frames()<<"\",\"startQpc100ns\":null,\"endQpc100ns\":null}\n";journal.flush();
  if(!journal)throw std::runtime_error("JOURNAL_WRITE_FAILED");
 }catch(...){
  try{writer.close();journal<<"{\"seq\":"<<++sequence<<",\"event\":\"close\",\"frames\":\""<<writer.frames()<<"\",\"error\":\"CACHE_SAVE_INCOMPLETE\"}\n";journal.flush();}catch(...){}
  throw;
 }
 WavConversion result;result.format=inspectWav(writer.segments().front().path).format;
 result.frames=writer.frames();result.clippedSamples=writer.clippedSamples();result.segments=writer.segments();
 if(result.frames!=end-start)throw std::runtime_error("CACHE_SAVE_FRAME_MISMATCH");
 return result;
}
}
