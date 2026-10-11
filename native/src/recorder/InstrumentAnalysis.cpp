#include "InstrumentAnalysis.h"
#include "FFT.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <memory>
#include <stdexcept>
namespace Trace {
namespace {
struct SpectralWorkspace {
 uint32_t size;DSP::FFT fft;std::vector<float> window,input;std::vector<std::complex<float>> left,right;double windowSum=0;
 explicit SpectralWorkspace(uint32_t n):size(n),fft(n),window(n),input(n),left(n),right(n){
  for(uint32_t i=0;i<n;++i){window[i]=float(.5*(1-std::cos(2*3.14159265358979323846*i/n)));windowSum+=window[i];}
 }
};
// Two per worker, bounded by maximum FFT size. No PCM or measurement history
// survives a query. Never share the mutable FFT scratch across threads.
SpectralWorkspace& workspace(uint32_t size){
 thread_local std::unique_ptr<SpectralWorkspace> recent,previous;
 if(recent&&recent->size==size)return *recent;
 if(previous&&previous->size==size){recent.swap(previous);return *recent;}
 previous=std::move(recent);recent=std::make_unique<SpectralWorkspace>(size);return *recent;
}
void validate(uint32_t frames,uint32_t rate,uint32_t channels,const InstrumentConfig& c){
 if(rate<8000||rate>96000||channels<1||channels>2||frames>uint64_t(rate)*5||c.fftSize<512||c.fftSize>16384||
   (c.fftSize&(c.fftSize-1))||c.averageMs>2000||c.holdMs>2000||c.fieldMs<50||c.fieldMs>1000||
   c.channel<SpectrumChannel::Stereo||c.channel>SpectrumChannel::Side)throw std::runtime_error("INVALID_INSTRUMENT_CONFIG");
}
FieldAnalysis field(const float* pcm,uint32_t channels,uint32_t rate,uint64_t origin,uint64_t position,uint32_t ms){
 FieldAnalysis out;out.endFrame=position;const auto desired=uint64_t(rate)*ms/1000;
 out.firstFrame=std::max(origin,position>desired?position-desired:0);
 const auto count=position-out.firstFrame;out.partial=count<desired;
 if(channels!=2||!count)return out;
 double ll=0,rr=0,lr=0;const auto bucket=std::max<uint64_t>(1,(count+2047)/2048);
 FieldPoint point;double best=-1;
 for(uint64_t n=0;n<count;++n){
  const auto at=size_t(out.firstFrame-origin+n)*channels;const double l=pcm[at],r=pcm[at+1];
  ll+=l*l;rr+=r*r;lr+=l*r;
  const double x=(r-l)*.5,y=(l+r)*.5,radius=std::hypot(x,y);
  const auto angle=std::clamp(int(std::llround(std::atan2(y<0?-x:x,std::abs(y))*180/3.14159265358979323846))+90,0,180);
  out.polarRms[angle]+=radius*radius;out.polarPeak[angle]=std::max(out.polarPeak[angle],radius);
  const double decay=std::exp(-3.0*double(count-1-n)/double(std::max<uint64_t>(1,desired)));out.polarEnvelope[angle]=std::max(out.polarEnvelope[angle],radius*decay);
  const double energy=l*l+r*r;
  if(energy>best){best=energy;point={out.firstFrame+n,float((r-l)/2),float((l+r)/2),std::abs(l)>=1||std::abs(r)>=1};}
  if((n+1)%bucket==0||n+1==count){out.points.push_back(point);best=-1;}
 }
 for(auto& v:out.polarRms)v=std::sqrt(v/double(count));
 if(ll+rr==0){out.balance.status=out.correlation.status=MetricStatus::Silence;return out;}
 out.balance={std::clamp((rr-ll)/(rr+ll),-1.0,1.0),MetricStatus::Ready};
 if(ll>0&&rr>0)out.correlation={std::clamp(lr/std::sqrt(ll*rr),-1.0,1.0),MetricStatus::Ready};
 return out;
}
}
InstrumentAnalysis analyzeInstruments(const float* pcm,uint32_t frames,uint32_t rate,uint32_t channels,
 uint64_t origin,uint64_t position,const InstrumentConfig& c,bool includeField){
 validate(frames,rate,channels,c);
 if((frames&&!pcm)||origin>UINT64_MAX-frames||position<origin||position>origin+frames)throw std::runtime_error("INVALID_INSTRUMENT_RANGE");
 for(size_t i=0;i<size_t(frames)*channels;++i)if(!std::isfinite(pcm[i]))throw std::runtime_error("NONFINITE_INSTRUMENT_PCM");
 InstrumentAnalysis out;out.positionFrame=position;out.fftSize=c.fftSize;out.hop=std::min(c.fftSize/4,std::max(1u,rate/50));out.binHz=double(rate)/c.fftSize;
 if(includeField)out.field=field(pcm,channels,rate,origin,position,c.fieldMs);
 if(position-origin<c.fftSize)return out;
 if(channels==1&&c.channel!=SpectrumChannel::Stereo&&c.channel!=SpectrumChannel::Left)return out;
 out.windowStart=position-c.fftSize;
 const size_t bins=c.fftSize/2+1;
 out.current.resize(bins);out.average.resize(bins);out.peakHold.resize(bins);
 auto& work=workspace(c.fftSize);auto& window=work.window;auto& input=work.input;auto& left=work.left;auto& right=work.right;auto& fft=work.fft;const auto windowSum=work.windowSum;
 const uint64_t averageFrames=uint64_t(rate)*c.averageMs/1000,holdFrames=uint64_t(rate)*c.holdMs/1000,maxFrames=std::max(averageFrames,holdFrames);
 uint64_t end=position;
 while(true){
  const uint64_t age=position-end;
  if(age&&age>=maxFrames)break;
  if(end<origin||end-origin<c.fftSize)break;
  const auto offset=size_t(end-origin-c.fftSize)*channels;
  for(uint32_t n=0;n<c.fftSize;++n)input[n]=pcm[offset+size_t(n)*channels]*window[n];
  fft.forward(input.data(),left.data());
  if(channels==2){for(uint32_t n=0;n<c.fftSize;++n)input[n]=pcm[offset+size_t(n)*channels+1]*window[n];fft.forward(input.data(),right.data());}
  const bool avg=age==0||age<averageFrames,hold=age==0||age<holdFrames;
  if(avg)++out.averageWindows;if(hold)++out.holdWindows;
  for(size_t k=0;k<bins;++k){
   const std::complex<double> l=left[k],r=right[k];double power=0;
   switch(c.channel){
    case SpectrumChannel::Left:power=std::norm(l);break;
    case SpectrumChannel::Right:power=std::norm(r);break;
    case SpectrumChannel::Mid:power=std::norm((l+r)*.5);break;
    case SpectrumChannel::Side:power=std::norm((l-r)*.5);break;
    case SpectrumChannel::Stereo:power=channels==1?std::norm(l):(std::norm(l)+std::norm(r))*.5;break;
   }
   const double factor=(k==0||k==c.fftSize/2?1.0:2.0)/windowSum;power*=factor*factor;
   if(!std::isfinite(power))throw std::runtime_error("INSTRUMENT_NUMERIC_OVERFLOW");
   if(age==0)out.current[k]=power;if(avg)out.average[k]+=power;if(hold)out.peakHold[k]=std::max(out.peakHold[k],power);
  }
  if(end<out.hop)break;end-=out.hop;
 }
 for(auto& power:out.average)power/=out.averageWindows;
 const auto expected=[&](uint64_t count){return count?((count-1)/out.hop+1):1;};
 out.partialAverage=out.averageWindows<expected(averageFrames);out.partialHold=out.holdWindows<expected(holdFrames);
 out.status=*std::max_element(out.average.begin(),out.average.end())==0?MetricStatus::Silence:MetricStatus::Ready;
 return out;
}
}
