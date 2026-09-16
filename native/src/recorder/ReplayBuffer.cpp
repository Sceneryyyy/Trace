#include "ReplayBuffer.h"
#include "Meter.h"
#include <algorithm>
#include <cstring>
#include <stdexcept>
namespace Trace {
ReplayBuffer::ReplayBuffer(SourceFormat format):format_(format),history_(6002){
 if(format.sampleRate<8000||format.sampleRate>96000||!format.channels||format.channels>2)throw std::runtime_error("INVALID_REPLAY_FORMAT");
 capacity_=uint64_t(format.sampleRate)*60;samples_.resize(static_cast<size_t>(capacity_)*format.channels);
}
void ReplayBuffer::push(const float* input,uint32_t frames){
 for(uint32_t offset=0;offset<frames;){
  const auto at=frames_%capacity_;const auto count=static_cast<uint32_t>(std::min<uint64_t>(frames-offset,capacity_-at));
  std::copy_n(input+size_t(offset)*format_.channels,size_t(count)*format_.channels,samples_.data()+size_t(at)*format_.channels);
  frames_+=count;offset+=count;
 }
}
void ReplayBuffer::remember(const MeterValues& values,const WavePoint& wave,bool loud)noexcept{
 history_[rows_++%history_.size()]={values,wave,loud};
}
ReplayRange ReplayBuffer::range(bool publishedOnly)const{
 ReplayRange value;value.end=publishedOnly?(rows_?history_[(rows_-1)%history_.size()].meters.frame:0):frames_;
 value.start=frames_-retainedFrames();
 const auto first=rows_>history_.size()?rows_-history_.size():0;
 if(value.start)for(auto i=first;i<rows_;++i){const auto& p=history_[i%history_.size()];if(p.wave.frame>=value.start){value.start=p.wave.frame;break;}}
 if(value.end<value.start)value.start=value.end;
 return value;
}
std::shared_ptr<ReplayClip> ReplayBuffer::freeze(bool publishedOnly)const{
 const auto bounds=range(publishedOnly);const auto end=bounds.end;
 if(end<=bounds.start)throw std::runtime_error("REPLAY_EMPTY");
 auto out=std::make_shared<ReplayClip>();out->format=format_;out->format.containerBits=out->format.validBits=32;out->format.blockAlign=format_.channels*4;out->format.floatingPoint=true;
 out->originFrame=bounds.start;
 const auto first=rows_>history_.size()?rows_-history_.size():0;
 const auto count=end-out->originFrame;out->samples.resize(static_cast<size_t>(count)*format_.channels);
 const auto at=out->originFrame%capacity_,head=std::min(count,capacity_-at);
 std::copy_n(samples_.data()+size_t(at)*format_.channels,size_t(head)*format_.channels,out->samples.data());
 if(head<count)std::copy_n(samples_.data(),size_t(count-head)*format_.channels,out->samples.data()+size_t(head)*format_.channels);
 out->history.reserve(static_cast<size_t>(rows_-first));
 for(auto i=first;i<rows_;++i){const auto& p=history_[i%history_.size()];if(p.wave.frame>=out->originFrame&&p.wave.frame<=end)out->history.push_back(p);}
 return out;
}
uint32_t ReplayClip::read(uint64_t position,float* output,uint32_t maximum)const{
 if(position>frames())throw std::runtime_error("REPLAY_POSITION_OUT_OF_RANGE");
 const auto count=static_cast<uint32_t>(std::min<uint64_t>(maximum,frames()-position));
 std::copy_n(samples.data()+size_t(position)*format.channels,size_t(count)*format.channels,output);return count;
}
ReplayView ReplayClip::view(uint64_t position,uint64_t start,uint64_t end,size_t columns)const{
 if(position>frames()||start>end||end>frames()||columns>2400)throw std::runtime_error("INVALID_REPLAY_RANGE");
 ReplayView result;
 const auto absolute=originFrame+position;
 auto row=std::upper_bound(history.begin(),history.end(),absolute,[](uint64_t f,const ReplayPoint& p){return f<p.meters.frame;});
 if(row!=history.begin()){result.meters=(--row)->meters;result.meters.frame-=originFrame;result.meters.loudnessFrame=result.meters.loudnessFrame>=originFrame?result.meters.loudnessFrame-originFrame:0;}
 if(!columns)return result;
 std::vector<WavePoint> points;
 for(const auto& p:history){
  if(p.wave.frame<originFrame+start||p.wave.frame>originFrame+end)continue;
  auto wave=p.wave;wave.frame-=originFrame;points.push_back(wave);
  if(p.loud)result.loudness.push_back({p.meters.loudnessFrame>=originFrame?p.meters.loudnessFrame-originFrame:0,p.meters.momentary,p.meters.shortTerm,p.meters.integrated,p.wave.flags});
 }
 const auto group=std::max<size_t>(1,(points.size()+columns-1)/columns);
 for(size_t i=0;i<points.size();i+=group){auto p=points[i];for(size_t j=i+1;j<std::min(points.size(),i+group);++j){p.frame=points[j].frame;p.flags|=points[j].flags;for(uint32_t c=0;c<format.channels;++c){p.minimum[c]=std::min(p.minimum[c],points[j].minimum[c]);p.maximum[c]=std::max(p.maximum[c],points[j].maximum[c]);}}result.waveform.push_back(p);}
 return result;
}
MeterValues ReplayClip::analyze(uint64_t start,uint64_t end)const{
 if(start>=end||end>frames())throw std::runtime_error("INVALID_REPLAY_SELECTION");
 Meter meter(format.sampleRate,format.channels);
 for(auto f=start;f<end;){const auto count=static_cast<uint32_t>(std::min<uint64_t>(kBlockFrames,end-f));meter.push(samples.data()+size_t(f)*format.channels,count);f+=count;}
 meter.finish();return meter.values();
}
}
