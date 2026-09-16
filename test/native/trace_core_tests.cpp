#include "CaptureClock.h"
#include "Decode.h"
#include "Meter.h"
#include "SpscQueue.h"
#include <atomic>
#include <cmath>
#include <functional>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <vector>
#define REQUIRE(x) do { if (!(x)) throw std::runtime_error(#x); } while (false)
void near(double a,double b,double tolerance) {
    if(std::abs(a-b)>tolerance) throw std::runtime_error("Expected "+std::to_string(b)+", got "+std::to_string(a));
}
std::vector<float> tone(uint32_t rate,uint32_t channels,double seconds) {
    std::vector<float> data(static_cast<size_t>(rate*seconds)*channels);
    for(size_t f=0;f<data.size()/channels;++f)
        for(uint32_t c=0;c<channels;++c) data[f*channels+c]=static_cast<float>(0.125*std::sin(6.283185307179586*997.0*f/rate));
    return data;
}
int main() {
    std::vector<std::pair<const char*,std::function<void()>>> tests{
        {"PCM normalization and valid-bit alignment",[]{
            Trace::SourceFormat f{48000,1,16,16,2,0,false};
            const uint8_t n16[]{0,128}; near(Trace::decodeSample(n16,f),-1,0);
            f.containerBits=24; f.validBits=24; const uint8_t n24[]{0,0,128}; near(Trace::decodeSample(n24,f),-1,0);
            f.containerBits=32; f.validBits=24; const uint8_t half[]{0,0,0,64}; near(Trace::decodeSample(half,f),0.5,0);
            const uint8_t min32[]{0,0,0,128}; near(Trace::decodeSample(min32,f),-1,0);
        }},
        {"queue rejects full without replacing unread samples",[]{
            Trace::SpscQueue<uint64_t,8> queue;
            for(uint64_t i=0;i<8;++i){auto* p=queue.write();REQUIRE(p);*p=i;queue.publish();}
            REQUIRE(queue.write()==nullptr);
            for(uint64_t i=0;i<8;++i){REQUIRE(queue.read() && *queue.read()==i);queue.release();}
            REQUIRE(queue.read()==nullptr);
        }},
        {"queue preserves order across concurrent wraparounds",[]{
            Trace::SpscQueue<uint64_t,256> queue;std::atomic<bool> wrong{false};
            std::thread producer([&]{for(uint64_t i=0;i<200000;++i){uint64_t* p;while(!(p=queue.write()))std::this_thread::yield();*p=i;queue.publish();}});
            for(uint64_t i=0;i<200000;++i){const uint64_t* p;while(!(p=queue.read()))std::this_thread::yield();if(*p!=i)wrong=true;queue.release();}
            producer.join();REQUIRE(!wrong);REQUIRE(queue.size()==0);
        }},
        {"clock ignores packet jitter but preserves actual frames",[]{
            Trace::CaptureClock clock(48000,1000000);
            auto a=clock.packet(9007199254740993ULL,1000000,480,1,1000100);
            REQUIRE(a.firstFrame==0 && !(a.flags&Trace::Gap));
            auto b=clock.packet(9007199254741473ULL,1101200,480,0,1101300);
            REQUIRE(b.firstFrame==480 && b.paddingFrames==0 && clock.end()==960);
        }},
        {"Realtek idle with continuous device counter uses QPC and no duplicate padding",[]{
            Trace::CaptureClock clock(48000,1000000);
            clock.packet(0,1000000,480,0,1000000);
            const auto initial=clock.idle(2000000);REQUIRE(initial==1920);
            REQUIRE(clock.idle(2000000)==0);
            const auto resumed=clock.packet(480,11100000,480,0,11200000);
            REQUIRE(resumed.firstFrame==48480);
            REQUIRE(resumed.paddingFrames==46080);
            REQUIRE(resumed.flags&Trace::EstimatedSilence);
            REQUIRE(!(resumed.flags&Trace::Overlap));
            REQUIRE(clock.end()==48960);
        }},
        {"fractional idle time is accumulated from anchor not truncated per poll",[]{
            Trace::CaptureClock clock(44100,1000000);
            for(uint64_t time=2000000;time<10000000;time+=17003)clock.idle(time);
            clock.idle(10000000);
            REQUIRE(clock.end()==37485);
        }},
        {"late real audio survives but overlapping silence is flagged",[]{
            Trace::CaptureClock clock(48000,1000000);
            clock.packet(0,1000000,480,0,1000000);
            clock.idle(3000000);
            const auto before=clock.end();
            const auto late=clock.packet(480,1100000,480,0,3100000);
            REQUIRE(late.flags&Trace::Overlap);REQUIRE(late.flags&Trace::Gap);
            REQUIRE(late.firstFrame==before && clock.end()==before+480);
        }},
        {"untrusted timestamps never generate inferred silence",[]{
            Trace::CaptureClock clock(48000,1000000);
            const auto p=clock.packet(0,999999999999ULL,480,4,1000000);
            REQUIRE(p.flags&Trace::TimestampError);REQUIRE(p.flags&Trace::Gap);
            REQUIRE(clock.idle(50000000)==0);
        }},
        {"silence and warmup are distinct",[]{
            Trace::Meter meter(48000,2);
            meter.push(nullptr,4800);
            REQUIRE(meter.values().momentary.status==Trace::MetricStatus::Insufficient);
            meter.push(nullptr,14400);
            REQUIRE(meter.frames()==19200&&meter.values().frame<19200);
            REQUIRE(meter.values().momentary.status==Trace::MetricStatus::Insufficient);
            meter.push(nullptr,meter.truePeakLookaheadFrames()); // Only the FIR lookahead is needed.
            REQUIRE(meter.values().frame==19200&&meter.values().loudnessFrame==19200);
            REQUIRE(meter.values().momentary.status==Trace::MetricStatus::Silence);
            REQUIRE(meter.values().shortTerm.status==Trace::MetricStatus::Insufficient);
            REQUIRE(meter.values().integrated.status==Trace::MetricStatus::Silence);
            REQUIRE(meter.values().channels[0].peak.status==Trace::MetricStatus::Silence);
        }},
        {"RMS/sample peak at all product rates and channel counts",[]{
            for(auto rate:{44100u,48000u,88200u,96000u})for(auto channels:{1u,2u}){
                Trace::Meter meter(rate,channels);auto input=tone(rate,channels,4);
                meter.push(input.data(),rate*4);
                REQUIRE(meter.frames()==rate*4ULL);
                near(meter.values().channels[0].rms.value,20*std::log10(0.125/std::sqrt(2.0)),0.03);
                near(meter.values().channels[0].peak.value,20*std::log10(0.125),0.02);
                REQUIRE(meter.values().shortTerm.status==Trace::MetricStatus::Ready);
                REQUIRE(meter.values().integrated.status==Trace::MetricStatus::Ready);
            }
        }},
        {"mono is not duplicated into a stereo loudness programme",[]{
            Trace::Meter mono(48000,1),stereo(48000,2);
            auto a=tone(48000,1,4),b=tone(48000,2,4);
            mono.push(a.data(),192000);stereo.push(b.data(),192000);
            near(stereo.values().integrated.value-mono.values().integrated.value,3.0102999566,0.11);
        }},
        {"arbitrary input blocks preserve the sample-indexed analysis",[]{
            const auto input=tone(44100,2,4);Trace::Meter a(44100,2),b(44100,2);
            a.push(input.data(),176400);
            const uint32_t sizes[]{1,37,441,2053,17};uint32_t offset=0,index=0;
            while(offset<176400){const auto count=std::min(sizes[index++%5],176400-offset);b.push(input.data()+offset*2,count);offset+=count;}
            REQUIRE(a.values().frame==175959&&b.values().frame==175959);
            REQUIRE(a.waveform(10,1200).size()==399&&b.waveform(10,1200).size()==399);
            a.finish();b.finish();
            REQUIRE(a.values().frame==176400&&b.values().frame==176400);
            near(a.values().integrated.value,b.values().integrated.value,1e-12);
            near(a.values().channels[0].rms.value,b.values().channels[0].rms.value,1e-12);
            near(a.values().maxTruePeak.value,b.values().maxTruePeak.value,1e-12);
            const auto wa=a.waveform(10,1200),wb=b.waveform(10,1200);
            REQUIRE(wa.size()==400 && wb.size()==400);
            for(size_t i=0;i<wa.size();++i){REQUIRE(wa[i].frame==wb[i].frame);REQUIRE(wa[i].minimum==wb[i].minimum);REQUIRE(wa[i].maximum==wb[i].maximum);}
        }},
        {"waveform extrema do not insert a zero into positive DC",[]{
            Trace::Meter meter(48000,1);std::vector<float> input(4800,0.25f);meter.push(input.data(),4800);
            for(const auto& p:meter.waveform(10,1200)){REQUIRE(p.minimum[0]==0.25f);REQUIRE(p.maximum[0]==0.25f);}
        }},
        {"RMS returns exact digital silence after a nonzero window",[]{
            Trace::Meter meter(48000,2);auto input=tone(48000,2,1);
            meter.push(input.data(),48000);meter.push(nullptr,48000);
            REQUIRE(meter.values().channels[0].rms.status==Trace::MetricStatus::Silence);
            REQUIRE(meter.values().channels[1].rms.status==Trace::MetricStatus::Silence);
        }},
        {"RMS retains genuinely quiet samples after loud samples expire",[]{
            Trace::Meter meter(48000,1);auto input=tone(48000,1,1);
            meter.push(input.data(),48000);std::vector<float> quiet(19200,1e-10f);
            meter.push(quiet.data(),19200);
            REQUIRE(meter.values().channels[0].rms.status==Trace::MetricStatus::Ready);
            near(meter.values().channels[0].rms.value,-200.0,0.001);
        }},
        {"history and long-running histogram remain bounded",[]{
            Trace::Meter meter(48000,2);
            for(unsigned i=0;i<700;++i)meter.push(nullptr,4800);
            REQUIRE(meter.historyCapacity()==6000);
            REQUIRE(meter.waveform(60,1200).size()<=1200);
            REQUIRE(meter.waveform(10,1200).size()==1000);
            REQUIRE(meter.loudnessHistory(60).size()==600);
            REQUIRE(meter.frames()==3360000);
        }}
    };
    unsigned failures=0;
    for(const auto& [name,test]:tests)try{test();std::cout<<"PASS "<<name<<std::endl;}
    catch(const std::exception& e){++failures;std::cerr<<"FAIL "<<name<<": "<<e.what()<<std::endl;}
    std::cout<<tests.size()-failures<<"/"<<tests.size()<<" cases passed"<<std::endl;
    return failures?1:0;
}
