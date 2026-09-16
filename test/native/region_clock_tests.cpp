#include "Recorder.h"
#include "CaptureClock.h"
#include "CaptureRecovery.h"
#include <windows.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int main(){
    unsigned passed=0;
    try{
        Trace::CaptureClock clock(48000,100000000);
        REQUIRE(clock.qpcAtFrame(48000)==110000000);
        const auto map=clock.packet(0,100010000,480,0,100012000);
        REQUIRE(map.firstFrame==48&&clock.qpcAtFrame(0)==100000000);
        REQUIRE(clock.qpcAtFrame(map.firstFrame+480)==100110000);
        clock.packet(480,0,480,4,100120000);
        REQUIRE(clock.qpcAtFrame(960)==0);++passed;std::cout<<"PASS native clock anchors and invalid timestamp state\n";
        REQUIRE(Trace::recoverableCaptureFailure(AUDCLNT_E_DEVICE_INVALIDATED,3));
        REQUIRE(Trace::recoverableCaptureFailure(AUDCLNT_E_RESOURCES_INVALIDATED,2));
        REQUIRE(Trace::recoverableCaptureFailure(AUDCLNT_E_SERVICE_NOT_RUNNING,6));
        REQUIRE(!Trace::recoverableCaptureFailure(E_POINTER,3));
        REQUIRE(!Trace::recoverableCaptureFailure(AUDCLNT_E_OUT_OF_ORDER,3));
        REQUIRE(!Trace::recoverableCaptureFailure(AUDCLNT_E_DEVICE_INVALIDATED,7));++passed;std::cout<<"PASS device recovery excludes programming and DSP failures\n";
        LARGE_INTEGER value;QueryPerformanceCounter(&value);
        const auto root=std::filesystem::current_path()/("region-clock-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(value.QuadPart));
        std::filesystem::create_directory(root);
        Trace::RecordOptions options;options.id="clock";options.basePath=root/"clip";options.format={96000,1,32,32,4,0,true};
        options.encoding=Trace::WavEncoding::Pcm24;options.wav.failAfterPayloadBytes=1501;
        Trace::Recorder recorder;recorder.prepare(options);
        Trace::AudioBlock block;block.firstFrame=5;block.frames=1000;block.qpc100ns=100000000;block.qpcOffsetFrames=4800;
        block.samples.fill(.125f);recorder.push(block);recorder.requestStop();recorder.boundary();recorder.finishAfterProducerStopped();
        const auto result=recorder.snapshot();
        REQUIRE(result.writtenFrames==500&&result.endFrame==505);
        REQUIRE(result.startQpc100ns==100500000&&result.endQpc100ns==100552083);
        REQUIRE(!result.startQpcEstimated&&!result.endQpcEstimated);
        std::ifstream file(root/"journal.jsonl",std::ios::binary);
        std::string text{std::istreambuf_iterator<char>(file),{}};
        REQUIRE(text.find("\"seq\":1")!=std::string::npos&&text.find("\"seq\":2")!=std::string::npos&&text.find("\"seq\":3")!=std::string::npos);
        REQUIRE(text.find("\"startQpc100ns\":\"100500000\"")!=std::string::npos);
        REQUIRE(text.find("\"endQpc100ns\":\"100552083\"")!=std::string::npos);
        ++passed;std::cout<<"PASS written-prefix QPC includes packet offset and excludes partial frame\n";
        Trace::Recorder estimated;options.id="estimated";options.basePath=root/"estimated";options.wav.failAfterPayloadBytes=UINT64_MAX;
        estimated.prepare(options);block.firstFrame=0;block.qpcOffsetFrames=0;block.frames=96;block.flags=Trace::EstimatedSilence;
        estimated.push(block);estimated.requestStop();estimated.boundary();estimated.finishAfterProducerStopped();
        const auto e=estimated.snapshot();REQUIRE(e.startQpcEstimated&&e.endQpcEstimated&&e.endQpc100ns==100010000);
        ++passed;std::cout<<"PASS estimated source time remains explicitly estimated\n";
    }catch(const std::exception& error){std::cerr<<"FAIL "<<error.what()<<'\n';}
    std::cout<<passed<<"/4 region clock cases passed\n";return passed==4?0:1;
}
