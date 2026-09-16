// Deterministic signals from the numeric definitions in EBU Tech 3341/3342
// (November 2023, Table 1). These are generated checks, not the downloaded
// EBU programme recordings. Sources:
// https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3341.pdf
// https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3342.pdf
#include "Meter.h"
#include <algorithm>
#include <cmath>
#include <functional>
#include <iostream>
#include <memory>
#include <vector>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
constexpr double pi=3.14159265358979323846;
void near(double actual,double expected,double tolerance){
    if(!std::isfinite(actual)||std::abs(actual-expected)>tolerance)
        throw std::runtime_error("actual="+std::to_string(actual)+" expected="+std::to_string(expected)+" tolerance="+std::to_string(tolerance));
}
using Signal=std::function<float(uint64_t)>;
void feed(Trace::Meter& meter,uint32_t rate,uint64_t count,const Signal& signal,
          const std::function<void(const Trace::MeterValues&)>& observe={}){
    std::vector<float> block(static_cast<size_t>(rate/10)*2);
    uint64_t f=0;
    while(f<count){
        const auto n=static_cast<uint32_t>(std::min<uint64_t>(rate/10,count-f));
        for(uint32_t i=0;i<n;++i)block[i*2]=block[i*2+1]=signal(f+i);
        meter.push(block.data(),n);f+=n;if(observe)observe(meter.values());
    }
}
struct Part{double seconds,db;};
Trace::MeterValues segmented(const std::vector<Part>& parts){
    constexpr uint32_t rate=48000;Trace::Meter meter(rate,2);uint64_t origin=0;
    for(const auto part:parts){
        const auto frames=static_cast<uint64_t>(std::llround(part.seconds*rate));const auto amplitude=std::pow(10.0,part.db/20);
        feed(meter,rate,frames,[&](uint64_t f){return static_cast<float>(amplitude*std::sin(2*pi*1000*(f+origin)/rate));});origin+=frames;
    }
    meter.finish();return meter.values();
}
double referenceRange(std::vector<double> values){
    values.erase(std::remove_if(values.begin(),values.end(),[](double v){return !std::isfinite(v)||v< -70;}),values.end());
    REQUIRE(!values.empty());double energy=0;for(const auto v:values)energy+=std::pow(10.0,v/10);
    const auto gate=10*std::log10(energy/values.size())-20;
    values.erase(std::remove_if(values.begin(),values.end(),[&](double v){return v<gate;}),values.end());
    REQUIRE(!values.empty());std::sort(values.begin(),values.end());
    const auto low=static_cast<size_t>(std::llround((values.size()-1)*0.10));
    const auto high=static_cast<size_t>(std::llround((values.size()-1)*0.95));
    return values[high]-values[low];
}
int main(){
    std::vector<std::pair<std::string,std::function<void()>>> tests;
    for(const auto spec:std::vector<std::pair<int,double>>{{1,-23},{2,-33}}){
        tests.push_back({"3341-"+std::to_string(spec.first),[=]{const auto m=segmented({{20,spec.second}});
            near(m.momentary.value,spec.second,0.1);near(m.shortTerm.value,spec.second,0.1);near(m.integrated.value,spec.second,0.1);
            REQUIRE(m.integrated.status==Trace::MetricStatus::Ready);}});
    }
    tests.push_back({"3341-3",[&]{near(segmented({{10,-36},{60,-23},{10,-36}}).integrated.value,-23,0.1);}});
    tests.push_back({"3341-4",[&]{near(segmented({{10,-72},{10,-36},{60,-23},{10,-36},{10,-72}}).integrated.value,-23,0.1);}});
    tests.push_back({"3341-5",[&]{near(segmented({{20,-26},{20.1,-20},{20,-26}}).integrated.value,-23,0.1);}});
    tests.push_back({"3341-9",[&]{
        Trace::Meter meter(48000,2);feed(meter,48000,48000*15,[](uint64_t f){const auto amplitude=std::pow(10.0,((f%144000)<64320?-20.0:-30.0)/20);return static_cast<float>(amplitude*std::sin(2*pi*1000*f/48000));},
            [](const Trace::MeterValues& m){if(m.frame>=144000){REQUIRE(m.shortTerm.status==Trace::MetricStatus::Ready);near(m.shortTerm.value,-23,0.1);}});
    }});
    tests.push_back({"3341-12",[&]{
        Trace::Meter meter(48000,2);feed(meter,48000,48000*10,[](uint64_t f){const auto amplitude=std::pow(10.0,((f%19200)<8640?-20.0:-30.0)/20);return static_cast<float>(amplitude*std::sin(2*pi*1000*f/48000));},
            [](const Trace::MeterValues& m){if(m.frame>=48000){REQUIRE(m.momentary.status==Trace::MetricStatus::Ready);near(m.momentary.value,-23,0.1);}});
    }});
    struct PeakCase{int id,divisor;double amplitude,phase,expected;};
    for(const auto spec:std::vector<PeakCase>{{15,4,.5,0,-6},{16,4,.5,45,-6},{17,6,.5,60,-6},{18,8,.5,67.5,-6},{19,4,1.41,45,3}}){
        tests.push_back({"3341-"+std::to_string(spec.id),[=]{
            for(const uint32_t rate:{44100u,48000u,88200u,96000u}){
                Trace::Meter meter(rate,2);feed(meter,rate,rate,[&](uint64_t f){
                    const double taper=std::min({1.0,double(f)/(rate*.01),double(rate-1-f)/(rate*.01)});
                    return static_cast<float>(taper*spec.amplitude*std::sin(2*pi*f/spec.divisor+spec.phase*pi/180));
                });meter.finish();const auto peak=meter.values().maxTruePeak;
                REQUIRE(peak.status==Trace::MetricStatus::Ready);
                if(peak.value<spec.expected-.4||peak.value>spec.expected+.2)throw std::runtime_error("rate="+std::to_string(rate)+" TP="+std::to_string(peak.value));
            }
        }});
    }
    const std::vector<std::vector<Part>> ranges={{{20,-20},{20,-30}},{{20,-20},{20,-15}},{{20,-40},{20,-20}},{{20,-50},{20,-35},{20,-20},{20,-35},{20,-50}}};
    const std::vector<double> expected={10,5,20,15};
    for(size_t i=0;i<ranges.size();++i)tests.push_back({"3342-"+std::to_string(i+1),[=]{near(segmented(ranges[i]).range.value,expected[i],1);}});
    tests.push_back({"LRA samples the 3-second window at 10 Hz",[&]{
        Trace::Meter meter(48000,2);std::vector<double> shortTerm;
        feed(meter,48000,48000*60,[](uint64_t f){return (f%192000)<19200?static_cast<float>(.1*std::sin(2*pi*1000*f/48000)):0.0f;},
            [&](const Trace::MeterValues& m){if(m.shortTerm.status==Trace::MetricStatus::Ready)shortTerm.push_back(m.shortTerm.value);});
        near(meter.values().range.value,referenceRange(shortTerm),0.21);
    }});
    tests.push_back({"EOF LRA includes 1.5 seconds of analysis context without adding audio frames",[&]{
        Trace::Meter result(48000,2),reference(48000,2);std::vector<double> shortTerm;
        const Signal signal=[](uint64_t f){const auto amplitude=f<240000?.1:.01;return static_cast<float>(amplitude*std::sin(2*pi*1000*f/48000));};
        feed(result,48000,288000,signal);result.finish();
        const auto observe=[&](const Trace::MeterValues& m){if(m.shortTerm.status==Trace::MetricStatus::Ready)shortTerm.push_back(m.shortTerm.value);};
        feed(reference,48000,288000,signal,observe);feed(reference,48000,72000,[](uint64_t){return 0.0f;},observe);
        // Complete the delayed 7.5 s reading; the reference distribution still
        // ends at 7.5 s, not at the extra lookahead input position.
        feed(reference,48000,480,[](uint64_t){return 0.0f;},observe);
        near(result.values().range.value,referenceRange(shortTerm),0.21);
        REQUIRE(result.frames()==288000&&result.values().frame==288000&&result.values().loudnessFrame==288000);
    }});
    unsigned passed=0;
    for(const auto& test:tests){try{test.second();std::cout<<"PASS "<<test.first<<'\n';++passed;}catch(const std::exception& e){std::cerr<<"FAIL "<<test.first<<": "<<e.what()<<'\n';}}
    std::cout<<passed<<"/"<<tests.size()<<" generated reference cases passed; official EBU WAV files not exercised\n";
    return passed==tests.size()?0:1;
}
