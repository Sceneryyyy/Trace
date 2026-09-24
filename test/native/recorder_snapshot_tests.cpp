#include "Recorder.h"
#include "FrameTime.h"
#include <windows.h>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <thread>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int main(){
    LARGE_INTEGER counter;QueryPerformanceCounter(&counter);
    const auto root=std::filesystem::current_path()/("snapshot-tests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(counter.QuadPart));
    std::filesystem::create_directory(root);
    unsigned passed=0;
    for(const unsigned rate:{44100u,48000u,96000u}){
        try{
            Trace::Recorder recorder;
            Trace::RecordOptions options;options.id=std::to_string(rate);options.basePath=root/options.id;
            options.format={rate,2,32,32,8,3,true};options.encoding=Trace::WavEncoding::Float32;
            recorder.prepare(options);
            std::atomic<bool> done{false};
            std::atomic<uint64_t> reads{0},violations{0};
            std::string firstViolation;
            auto inspect=[&](const Trace::RecordSnapshot& s){
                std::string issue;
                for(const auto& wave:s.waveform)if(wave.frame>s.writtenFrames){issue="wave "+std::to_string(wave.frame)+" > written "+std::to_string(s.writtenFrames);break;}
                for(const auto& loud:s.loudness)if(loud.frame>s.writtenFrames){issue="loudness exceeds written prefix";break;}
                if(s.meters.frame>s.writtenFrames||s.meters.loudnessFrame>s.writtenFrames)issue="meter exceeds written prefix";
                if(!s.waveform.empty()&&s.waveform.back().frame!=s.meters.frame)issue="wave and meter belong to different publications";
                if(s.estimatedFrames>s.writtenFrames)issue="estimated frames exceed written prefix";
                if(s.replayStartFrame>s.replayEndFrame||s.replayEndFrame>s.writtenFrames||s.replayEndFrame-s.replayStartFrame>uint64_t(rate)*60)issue="replay range exceeds written or retained prefix";
                if(s.replayEndFrame!=s.meters.frame)issue="replay range and meter belong to different publications";
                if(s.writtenFrames){
                    const auto end=100000000+Trace::frameDuration100ns(s.writtenFrames,rate);
                    if(s.startQpc100ns!=100000000||s.endQpc100ns!=end)issue="QPC "+std::to_string(s.endQpc100ns)+" does not match written "+std::to_string(s.writtenFrames);
                    if(s.endFrame!=10000+s.writtenFrames)issue="capture end does not match written prefix";
                }else if(s.startQpc100ns!=UINT64_MAX||s.endQpc100ns!=UINT64_MAX)issue="zero prefix already has QPC endpoints";
                if(!issue.empty()){if(violations.fetch_add(1)==0)firstViolation=issue;}
                ++reads;
            };
            std::shared_ptr<const Trace::ReplayClip> frozen;
            Trace::MeterValues historical;
            std::thread reader([&]{while(!done.load()){
                const auto current=recorder.snapshot();inspect(current);
                if(!frozen&&current.meters.frame>rate){
                    frozen=recorder.freezeReplay();historical=frozen->view(frozen->frames(),0,frozen->frames(),0).meters;
                    if(frozen->sourceId!=options.id||frozen->captureStartFrame!=10000+frozen->originFrame||historical.frame!=frozen->frames())violations++;
                }
                std::this_thread::yield();
            }});
            uint64_t produced=0;
            bool producerFailed=false;
            for(unsigned i=0;i<1800;++i){
                // Pace only this test producer, so its bounded queue cannot overflow.
                while(recorder.snapshot().queueDepth>32)std::this_thread::sleep_for(std::chrono::milliseconds(1));
                if(!recorder.busy()){producerFailed=true;break;}
                Trace::AudioBlock block;block.firstFrame=10000+produced;
                block.frames=i%3==0?137:(i%3==1?1024:2048);
                block.qpc100ns=100000000;block.qpcOffsetFrames=static_cast<uint32_t>(produced);
                block.flags=i%2?Trace::EstimatedSilence:0;block.samples.fill(i%2?0.0f:0.125f);
                recorder.push(block);produced+=block.frames;
            }
            recorder.requestStop();recorder.boundary();recorder.finishAfterProducerStopped();
            done=true;reader.join();const auto final=recorder.snapshot();inspect(final);
            std::cout<<"rate="<<rate<<" snapshots="<<reads<<" violations="<<violations<<std::endl;
            if(violations.load())throw std::runtime_error(firstViolation);
            REQUIRE(!producerFailed&&final.phase==Trace::RecordPhase::Complete&&final.error.empty());
            REQUIRE(final.acceptedFrames==produced&&final.writtenFrames==produced);
            REQUIRE(final.meters.frame==produced&&reads.load()>100);
            REQUIRE(frozen&&frozen->frames()<produced);
            const auto again=frozen->view(frozen->frames(),0,frozen->frames(),0).meters;
            REQUIRE(again.integrated.value==historical.integrated.value&&again.channels[0].rms.value==historical.channels[0].rms.value);
            uint64_t reopened=0;for(const auto& segment:final.segments)reopened+=Trace::inspectWav(segment.path).frames;
            REQUIRE(reopened==produced);
            ++passed;
        }catch(const std::exception& error){std::cerr<<"FAIL "<<rate<<": "<<error.what()<<std::endl;}
    }
    std::cout<<passed<<"/3 concurrent snapshot rates passed"<<std::endl;return passed==3?0:1;
}
