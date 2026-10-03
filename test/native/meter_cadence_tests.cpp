#include "Meter.h"
#include "ReplayBuffer.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
namespace {
constexpr double pi=3.14159265358979323846;
void near(double actual,double expected){if(!std::isfinite(actual)||std::abs(actual-expected)>.1)throw std::runtime_error("Max M actual="+std::to_string(actual)+" expected="+std::to_string(expected));}
bool same(const Trace::Metric& a,const Trace::Metric& b){return a.status==b.status&&a.value==b.value;}
void identical(const Trace::MeterValues& a,const Trace::MeterValues& b){
 REQUIRE(a.frame==b.frame&&a.loudnessFrame==b.loudnessFrame);
 REQUIRE(same(a.momentary,b.momentary)&&same(a.shortTerm,b.shortTerm)&&same(a.integrated,b.integrated)&&same(a.range,b.range)&&same(a.maxTruePeak,b.maxTruePeak));
 for(size_t c=0;c<2;++c)REQUIRE(same(a.channels[c].peak,b.channels[c].peak)&&same(a.channels[c].rms,b.channels[c].rms)&&same(a.channels[c].truePeak,b.channels[c].truePeak));
}
std::vector<Trace::MeterValues> shifted(uint32_t rate,unsigned index,bool irregular){
 Trace::Meter meter(rate,2);std::vector<Trace::MeterValues> readings;
 const auto start=uint64_t(index)*rate/50,tone=uint64_t(rate)*4/10,total=start+tone+rate+7;
 const uint32_t pattern[]={1,7,137,2048,509,31,4093};std::vector<float> block(4093*2);size_t turn=0;
 meter.setFrameSink([&](const Trace::MeterValues& v,const Trace::WavePoint& w,bool loud){
  REQUIRE(loud&&v.frame==w.frame&&v.frame==v.loudnessFrame);readings.push_back(v);
 });
 for(uint64_t f=0;f<total;){const auto n=uint32_t(std::min<uint64_t>(irregular?pattern[turn++%7]:2048,total-f));
  for(uint32_t i=0;i<n;++i){const auto at=f+i;block[i*2]=block[i*2+1]=at>=start&&at<start+tone?float(std::pow(10.,-23./20)*std::sin(2*pi*1000*(at-start)/rate)):0;}
  meter.push(block.data(),n);f+=n;
 }
 meter.finish();meter.finish();REQUIRE(meter.frames()==total&&readings.back().frame==total);
 REQUIRE(readings.size()==(total*100+rate-1)/rate);
 double peak=-INFINITY;for(size_t i=0;i<readings.size();++i){const auto& v=readings[i];REQUIRE(v.frame==std::min<uint64_t>((i+1)*rate/100,total));if(v.momentary.status==Trace::MetricStatus::Ready)peak=std::max(peak,v.momentary.value);}
 near(peak,-23);return readings;
}
void successive(uint32_t rate){
 Trace::Meter meter(rate,2);std::vector<float> block(2048*2);std::vector<double> maxima(20,-INFINITY);
 meter.setFrameSink([&](const Trace::MeterValues& v,const Trace::WavePoint&,bool){
  REQUIRE(v.frame==v.loudnessFrame);const auto segment=(v.frame-1)*5/(uint64_t(rate)*4);
  if(v.momentary.status==Trace::MetricStatus::Ready&&segment<20)maxima[size_t(segment)]=std::max(maxima[size_t(segment)],v.momentary.value);
 });
 for(uint64_t f=0;f<uint64_t(rate)*16;){const auto n=uint32_t(std::min<uint64_t>(2048,uint64_t(rate)*16-f));
  for(uint32_t i=0;i<n;++i){const auto at=f+i;const auto segment=at*5/(uint64_t(rate)*4),base=segment*rate*4/5,start=base+segment*rate/50;
   block[i*2]=block[i*2+1]=at>=start&&at<start+uint64_t(rate)*4/10?float(std::pow(10.,(-38.+segment)/20)*std::sin(2*pi*1000*(at-start)/rate)):0;
  }
  meter.push(block.data(),n);f+=n;
 }
 meter.finish();for(size_t i=0;i<20;++i)near(maxima[i],-38.+i);
}
void boundedHistory(){
 constexpr uint32_t rate=8000;Trace::Meter meter(rate,1);Trace::ReplayBuffer replay({rate,1,32,32,4,0,true});
 std::vector<float> zeros(rate/100);meter.setFrameSink([&](const Trace::MeterValues& v,const Trace::WavePoint& w,bool loud){replay.remember(v,w,loud);});
 for(uint64_t f=0;f<uint64_t(rate)*65;){const auto n=rate/100;const uint32_t flags=f==uint64_t(rate)*10+rate/100?Trace::Gap:0;
  replay.push(zeros.data(),n,flags);meter.push(zeros.data(),n,flags);f+=n;
 }
 meter.finish();const auto history=meter.loudnessHistory(60);REQUIRE(history.size()==600&&history.back().frame==uint64_t(rate)*65);
 for(size_t i=1;i<history.size();++i)REQUIRE(history[i].frame>history[i-1].frame);
 REQUIRE(std::any_of(history.begin(),history.end(),[](const Trace::LoudnessPoint& p){return p.flags&Trace::Gap;}));
 REQUIRE(history.front().frame>=uint64_t(rate)*5&&meter.historyCapacity()==6000);
 const auto clip=replay.freeze();REQUIRE(clip->frames()<=uint64_t(rate)*60&&clip->history.size()<=6002);
 const auto view=clip->view(clip->frames(),0,clip->frames(),900);REQUIRE(view.loudness.size()<=600&&view.loudness.capacity()<=600&&view.loudness.back().frame==clip->frames());
 REQUIRE(std::any_of(view.loudness.begin(),view.loudness.end(),[](const Trace::LoudnessPoint& p){return p.flags&Trace::Gap;}));
 const auto at=clip->frames()-rate/100;
 const auto a=clip->view(at,0,clip->frames(),0),b=clip->view(at,0,clip->frames(),0);
 identical(a.meters,b.meters);REQUIRE(a.meters.frame==at&&a.meters.loudnessFrame==at);
}
}
int main(){unsigned passed=0,total=0;
 for(const uint32_t rate:{44100u,48000u,88200u,96000u}){
  for(unsigned i=0;i<20;++i){++total;try{const auto a=shifted(rate,i,false),b=shifted(rate,i,true);REQUIRE(a.size()==b.size());for(size_t n=0;n<a.size();++n)identical(a[n],b[n]);++passed;}catch(const std::exception& e){std::cerr<<"FAIL rate="<<rate<<" shift="<<i<<" "<<e.what()<<'\n';}}
  ++total;try{successive(rate);++passed;}catch(const std::exception& e){std::cerr<<"FAIL live Max M rate="<<rate<<" "<<e.what()<<'\n';}
 }
 ++total;try{boundedHistory();++passed;}catch(const std::exception& e){std::cerr<<"FAIL history "<<e.what()<<'\n';}
 std::cout<<passed<<'/'<<total<<" cadence cases passed: shifted Max M, four rates, exact block invariance, EOF, bounded/repeatable history\n";return passed==total?0:1;
}
