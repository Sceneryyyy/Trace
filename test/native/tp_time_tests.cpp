#include "Meter.h"
#include <algorithm>
#include <cmath>
#include <functional>
#include <iostream>
#include <map>
#include <vector>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
constexpr double pi=3.14159265358979323846;
double amplitude(const Trace::Metric& m){return m.status==Trace::MetricStatus::Ready?std::pow(10.0,m.value/20):0;}
struct Reference { std::vector<std::array<double,2>> windows; };
Reference reconstruct(const std::vector<float>& data,uint32_t rate,uint32_t channels){
    const uint32_t factor=rate<96000?4:2,delay=24/factor;const uint64_t frames=data.size()/channels;
    Reference result;result.windows.resize(static_cast<size_t>((frames*100+rate-1)/rate));
    // Direct zero-phase convolution, with absolute source positions. This does
    // not call the library's ring interpolator or previous-block peak API.
    for(int64_t frame=-static_cast<int64_t>(delay);frame<static_cast<int64_t>(frames+delay);++frame){
        const auto clamped=static_cast<uint64_t>(std::clamp<int64_t>(frame,0,static_cast<int64_t>(frames)-1));
        const auto bin=((clamped+1)*100-1)/rate;
        for(uint32_t phase=0;phase<factor;++phase)for(uint32_t c=0;c<channels;++c){
            double sum=0;
            for(uint32_t tap=phase;tap<49;tap+=factor){
                const auto source=frame+delay-static_cast<int64_t>(tap/factor);
                if(source<0||source>=static_cast<int64_t>(frames))continue;
                const double offset=double(tap)-24;
                const double sinc=std::abs(offset)<1e-12?1.0:std::sin(offset*pi/factor)/(offset*pi/factor);
                const double coefficient=sinc*.5*(1-std::cos(2*pi*tap/48));
                sum+=data[static_cast<size_t>(source)*channels+c]*coefficient;
            }
            result.windows[bin][c]=std::max(result.windows[bin][c],std::abs(static_cast<double>(static_cast<float>(sum))));
        }
    }
    return result;
}
void verifyData(const std::vector<float>& data,uint32_t rate,uint32_t channels,uint32_t block){
    const uint32_t frames=static_cast<uint32_t>(data.size()/channels);
    const auto expected=reconstruct(data,rate,channels);
    Trace::Meter meter(rate,channels);std::map<uint64_t,Trace::MeterValues> rows;
    meter.setFrameSink([&](const Trace::MeterValues& values,const Trace::WavePoint& point,bool){REQUIRE(values.frame==point.frame);rows[values.frame]=values;});
    for(uint32_t f=0;f<frames;){const auto n=std::min(block,frames-f);meter.push(data.data()+static_cast<size_t>(f)*channels,n);f+=n;
        REQUIRE(meter.values().frame<=meter.frames());
        REQUIRE(meter.frames()-meter.values().frame<=(rate+99)/100+meter.truePeakLookaheadFrames());}
    meter.finish();
    REQUIRE(rows.size()==expected.windows.size());
    std::array<double,2> maximum{};size_t index=0;
    for(const auto& row:rows){
        const auto expectedEnd=std::min<uint64_t>((index+1)*rate/100,frames);REQUIRE(row.first==expectedEnd);
        for(uint32_t c=0;c<channels;++c){
            const auto actual=amplitude(row.second.channels[c].truePeak),wanted=expected.windows[index][c];
            if(std::abs(actual-wanted)>0.000002)throw std::runtime_error("rate="+std::to_string(rate)+" end="+std::to_string(row.first)+" ch="+std::to_string(c)+" actual="+std::to_string(actual)+" expected="+std::to_string(wanted));
            maximum[c]=std::max(maximum[c],wanted);
        }
        const auto wanted=*std::max_element(maximum.begin(),maximum.begin()+channels);
        if(std::abs(amplitude(row.second.maxTruePeak)-wanted)>0.000002)throw std::runtime_error("prefix true peak not aligned to its frame");
        ++index;
    }
    REQUIRE(meter.frames()==frames&&meter.values().frame==frames);
}
void verify(uint32_t rate,uint32_t channels,int offset,uint32_t block,bool partial){
    const uint32_t hop=rate/100,frames=hop*3+(partial?1:0);
    std::vector<float> data(static_cast<size_t>(frames)*channels);
    const float pulse[]={0.8f,0.8f,-0.8f,-0.8f};
    for(uint32_t c=0;c<channels;++c){
        const int64_t first=static_cast<int64_t>(hop)-4+offset+static_cast<int>(c)*7;
        for(int i=0;i<4;++i)if(first+i>=0&&first+i<frames)data[static_cast<size_t>(first+i)*channels+c]=pulse[i]*(c?-.7f:1.0f);
    }
    data[(frames-1)*channels]=0.91f;
    verifyData(data,rate,channels,block);
}
int main(){
    unsigned total=0,passed=0;
    for(const uint32_t rate:{44100u,48000u,88200u,96000u})for(const uint32_t channels:{1u,2u})for(const int offset:{-3,0,3,8})for(const bool partial:{false,true})for(const uint32_t block:{1u,137u,2048u}){
        ++total;try{verify(rate,channels,offset,block,partial);++passed;}catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';}
    }
    for(const uint32_t rate:{44100u,48000u,88200u,96000u})for(const uint32_t channels:{1u,2u})for(const uint32_t frames:{1u,3u,rate/100-1,rate/100,rate/100+1}){
        ++total;try{
            std::vector<float> data(static_cast<size_t>(frames)*channels);
            for(uint32_t c=0;c<channels;++c){data[c]=c?-.83f:.87f;if(frames>1)data[(frames-1)*channels+c]=c?.69f:-.67f;}
            verifyData(data,rate,channels,1);++passed;
        }catch(const std::exception& e){std::cerr<<"FAIL leading/short "<<e.what()<<'\n';}
    }
    ++total;try{Trace::Meter empty(48000,2);empty.finish();empty.finish();REQUIRE(empty.frames()==0&&!empty.latestWave());REQUIRE(empty.values().maxTruePeak.status==Trace::MetricStatus::Insufficient);++passed;}catch(const std::exception& e){std::cerr<<"FAIL empty "<<e.what()<<'\n';}
    if(passed==total)std::cout<<"PASS aligned TP windows, prefix maxima, all rates/channels/block sizes, leading/short/empty files and bounded publication lag\n";
    std::cout<<passed<<"/"<<total<<" TP time cases passed\n";return passed==total?0:1;
}
