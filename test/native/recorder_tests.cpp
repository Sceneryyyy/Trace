#include "Recorder.h"
#include <windows.h>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <functional>
#include <iostream>
#include <thread>
namespace fs=std::filesystem;
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
Trace::RecordOptions options(const fs::path& root,const std::string& name) {
    const auto dir=root/name;fs::create_directories(dir);
    Trace::RecordOptions o;o.id=name;o.basePath=dir/"audio";
    o.format={48000,2,32,32,8,3,true};o.encoding=Trace::WavEncoding::Float32;
    return o;
}
Trace::AudioBlock block(uint64_t first,uint32_t frames,float amplitude=0.125f) {
    Trace::AudioBlock b;b.firstFrame=first;b.frames=frames;
    for(uint32_t f=0;f<frames;++f)for(uint32_t c=0;c<2;++c)
        b.samples[f*2+c]=amplitude*static_cast<float>(std::sin(6.283185307179586*997.0*(first+f)/48000.0));
    return b;
}
int main(){
    LARGE_INTEGER q;QueryPerformanceCounter(&q);
    const auto root=fs::current_path()/("record-tests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(q.QuadPart));fs::create_directories(root);
    std::vector<std::pair<const char*,std::function<void()>>> tests{
        {"REC boundary excludes pre-roll and preserves accepted frames",[&]{
            Trace::Recorder r;r.push(block(0,480));REQUIRE(fs::is_empty(root));
            auto o=options(root,"normal");o.wav.segmentBytes=4800*8;r.prepare(o);
            for(unsigned i=0;i<100;++i)r.push(block(10000+i*480,480));
            r.requestStop();r.boundary();r.finishAfterProducerStopped();
            const auto s=r.snapshot();REQUIRE(s.phase==Trace::RecordPhase::Complete);
            REQUIRE(s.startFrame==10000&&s.endFrame==58000);REQUIRE(s.writtenFrames==48000&&s.acceptedFrames==48000);
            REQUIRE(s.meters.frame==48000);REQUIRE(s.segments.size()==10);REQUIRE(s.error.empty());
            uint64_t total=0;for(const auto& p:s.segments)total+=Trace::inspectWav(p.path).frames;REQUIRE(total==48000);
            REQUIRE(s.waveform.size()<=901&&s.loudness.size()<=601);
        }},
        {"slow writer fails explicitly without overwriting its queued prefix",[&]{
            Trace::Recorder r;auto o=options(root,"slow");o.writerDelayMs=2;r.prepare(o);
            const auto start=std::chrono::steady_clock::now();
            for(unsigned i=0;i<1000;++i){auto b=block(i*480,480);for(auto& sample:b.samples)sample=i*0.0001f;r.push(b);}
            const auto pushTime=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
            r.requestStop();r.boundary();r.finishAfterProducerStopped();const auto s=r.snapshot();
            REQUIRE(pushTime<0.5);REQUIRE(s.phase==Trace::RecordPhase::Failed);REQUIRE(s.error=="DISK_BACKPRESSURE");
            REQUIRE(s.writtenFrames==s.acceptedFrames&&s.acceptedFrames<480000);REQUIRE(s.queueHighWater<=256);
            Trace::WavReader reader(s.segments[0].path);std::vector<float> values(4096);uint64_t frame=0;
            for(;;){auto count=reader.read(values.data(),2048);if(!count)break;for(uint32_t i=0;i<count;++i)REQUIRE(values[i*2]==static_cast<float>((frame+i)/480)*0.0001f);frame+=count;}
            REQUIRE(frame==s.writtenFrames);
        }},
        {"disk failure reports only complete written frames",[&]{
            Trace::Recorder r;auto o=options(root,"disk");o.format.channels=1;o.format.blockAlign=4;o.encoding=Trace::WavEncoding::Pcm24;o.wav.failAfterPayloadBytes=1501;
            r.prepare(o);auto b=block(9000,1000);std::fill(b.samples.begin(),b.samples.end(),0.125f);r.push(b);
            r.requestStop();r.boundary();r.finishAfterProducerStopped();const auto s=r.snapshot();
            REQUIRE(s.phase==Trace::RecordPhase::Failed);REQUIRE(s.writtenFrames==500);REQUIRE(s.endFrame==9500);
            REQUIRE(Trace::inspectWav(s.segments[0].path).frames==500);
        }},
        {"capture gap closes usable prefix and repeated stop is safe",[&]{
            Trace::Recorder r;r.prepare(options(root,"gap"));r.push(block(1000,200));
            auto bad=block(1200,100);bad.flags=Trace::Gap;r.push(bad);
            r.finishAfterProducerStopped();r.finishAfterProducerStopped();const auto s=r.snapshot();
            REQUIRE(s.phase==Trace::RecordPhase::Failed&&s.error=="CAPTURE_GAP");
            REQUIRE(s.writtenFrames==200&&s.endFrame==1200);
        }},
        {"meter finalizes sub-hop tail without counting TP padding",[&]{
            Trace::Meter m(48000,1);std::vector<float> data(47999);
            for(size_t i=0;i<data.size();++i)data[i]=0.1f*static_cast<float>(std::sin(6.283185307179586*997*i/48000));
            data.back()=0.9f;
            m.push(data.data(),static_cast<uint32_t>(data.size()));m.finish();
            REQUIRE(m.frames()==47999&&m.values().frame==47999&&m.values().loudnessFrame==47999);
            REQUIRE(m.latestWave()->frame==47999);REQUIRE(m.values().maxTruePeak.value>=20*std::log10(0.89999));
            auto* ref=ebur128_init(1,48000,EBUR128_MODE_M|EBUR128_MODE_S|EBUR128_MODE_I|EBUR128_MODE_LRA|EBUR128_MODE_TRUE_PEAK|EBUR128_MODE_HISTOGRAM);
            REQUIRE(ref);ebur128_add_frames_float(ref,data.data(),data.size());double integrated=0;ebur128_loudness_global(ref,&integrated);
            REQUIRE(std::abs(m.values().integrated.value-integrated)<1e-12);
            ebur128_destroy(&ref);m.finish();REQUIRE(m.frames()==47999);
            bool failed=false;try{m.push(data.data(),1);}catch(...){failed=true;}REQUIRE(failed);
        }},
        {"overview remains bounded while retaining extrema",[&]{
            Trace::Overview<Trace::WavePoint> overview;
            for(uint64_t i=1;i<=200000;++i){Trace::WavePoint p;p.frame=i;p.minimum={0,0};p.maximum={i==1?1.0f:0.1f,0.1f};overview.append(p);}
            auto points=overview.points(900);REQUIRE(points.size()<=901);REQUIRE(points.front().maximum[0]==1);REQUIRE(points.back().frame==200000);
        }}
    };
    unsigned failed=0;for(const auto& [name,test]:tests)try{test();std::cout<<"PASS "<<name<<std::endl;}catch(const std::exception& e){++failed;std::cerr<<"FAIL "<<name<<": "<<e.what()<<std::endl;}
    std::cout<<tests.size()-failed<<"/"<<tests.size()<<" recorder cases passed"<<std::endl;return failed?1:0;
}
