#include "WavFile.h"
#include <windows.h>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <vector>
namespace fs=std::filesystem;
#define REQUIRE(x) do { if(!(x)) throw std::runtime_error(#x); } while(false)
std::vector<uint8_t> bytes(const fs::path& p){std::ifstream f(p,std::ios::binary);return {std::istreambuf_iterator<char>(f),{}};}
int main(){
    LARGE_INTEGER tick;QueryPerformanceCounter(&tick);
    const auto root=fs::current_path()/("wav-tests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(tick.QuadPart));
    fs::create_directories(root);
    std::vector<std::pair<const char*,std::function<void()>>> tests{
        {"WAV formats preserve rate, channels, frames and sample values",[&]{
            for(auto rate:{44100u,48000u,88200u,96000u})for(auto channels:{1u,2u})
            for(auto encoding:{Trace::WavEncoding::Pcm16,Trace::WavEncoding::Pcm24,Trace::WavEncoding::Float32}){
                const auto name=std::to_string(rate)+"-"+std::to_string(channels)+"-"+std::to_string(static_cast<int>(encoding));
                std::vector<float> input(5001*channels);
                for(size_t f=0;f<5001;++f)for(uint32_t c=0;c<channels;++c)
                    input[f*channels+c]=static_cast<float>(0.75*std::sin((c+1)*0.031*f));
                input[0]=-0.0f;
                Trace::WavWriter writer(root/name,rate,channels,encoding);
                writer.append(input.data(),203);writer.checkpoint();writer.append(input.data()+203*channels,4798);writer.close();
                REQUIRE(writer.frames()==5001);REQUIRE(writer.segments().size()==1);
                const auto path=writer.segments()[0].path;
                Trace::WavReader reader(path);
                REQUIRE(reader.info().frames==5001);REQUIRE(reader.info().format.sampleRate==rate);REQUIRE(reader.info().format.channels==channels);
                REQUIRE(fs::file_size(path)%2==0);
                std::vector<float> output(input.size());uint32_t total=0;
                for(;;){const auto count=reader.read(output.data()+total*channels,511);if(!count)break;total+=count;}
                REQUIRE(total==5001);
                if(encoding==Trace::WavEncoding::Float32)REQUIRE(std::memcmp(input.data(),output.data(),input.size()*sizeof(float))==0);
                else{const double tolerance=encoding==Trace::WavEncoding::Pcm16?1.0/32768:1.0/8388608;
                    for(size_t i=0;i<input.size();++i)REQUIRE(std::abs(input[i]-output[i])<=tolerance);}
                reader.seek(1234);float frame[2]{};REQUIRE(reader.read(frame,1)==1);
                for(uint32_t c=0;c<channels;++c)REQUIRE(frame[c]==output[1234*channels+c]);
            }
        }},
        {"segmentation neither duplicates nor loses boundary frames",[&]{
            std::vector<float> input(3501*2);
            for(size_t i=0;i<input.size();++i)input[i]=static_cast<float>(i)/16384;
            Trace::WavOptions options;options.segmentBytes=1000*8;
            Trace::WavWriter writer(root/"segments",48000,2,Trace::WavEncoding::Float32,options);
            writer.append(input.data(),3501);writer.close();
            REQUIRE(writer.frames()==3501);REQUIRE(writer.segments().size()==4);
            size_t total=0;
            for(const auto& segment:writer.segments()){
                Trace::WavReader reader(segment.path);std::vector<float> chunk(2048*2);
                for(;;){auto n=reader.read(chunk.data(),2048);if(!n)break;REQUIRE(std::memcmp(chunk.data(),input.data()+total*2,n*2*sizeof(float))==0);total+=n;}
            }
            REQUIRE(total==3501);
        }},
        {"integer overload is explicit while float keeps valid out-of-range samples",[&]{
            const float input[]{-2,-1,0,1,2};
            Trace::WavWriter integer(root/"clip",48000,1,Trace::WavEncoding::Pcm24);
            integer.append(input,5);integer.close();REQUIRE(integer.clippedSamples()==2);
            Trace::WavWriter floating(root/"float",48000,1,Trace::WavEncoding::Float32);
            floating.append(input,5);floating.close();REQUIRE(floating.clippedSamples()==0);
            Trace::WavReader reader(floating.segments()[0].path);float output[5]{};
            REQUIRE(reader.read(output,5)==5);REQUIRE(std::memcmp(input,output,sizeof(input))==0);
        }},
        {"existing audio is never overwritten",[&]{
            Trace::WavWriter first(root/"collision",48000,1,Trace::WavEncoding::Pcm16);
            const float input[]{0.25f,-0.25f};first.append(input,2);first.close();
            const auto path=first.segments()[0].path;const auto original=bytes(path);
            bool failed=false;try{Trace::WavWriter second(root/"collision",48000,1,Trace::WavEncoding::Pcm16);}catch(...){failed=true;}
            REQUIRE(failed);REQUIRE(bytes(path)==original);
        }},
        {"failed partial frame is excluded and recovery preserves the original",[&]{
            Trace::WavOptions options;options.failAfterPayloadBytes=1501;
            Trace::WavWriter writer(root/"partial",48000,1,Trace::WavEncoding::Pcm24,options);
            std::vector<float> input(1000,0.125f);bool failed=false;
            try{writer.append(input.data(),1000);}catch(...){failed=true;}
            REQUIRE(failed);writer.close();REQUIRE(writer.frames()==500);
            const auto source=writer.segments()[0].path;const auto original=bytes(source);
            const auto recovered=root/"recovered.wav";
            const auto info=Trace::recoverWav(source,recovered);
            REQUIRE(info.frames==500);REQUIRE(bytes(source)==original);
            Trace::WavReader reader(recovered);std::vector<float> data(500);
            REQUIRE(reader.read(data.data(),500)==500);
            for(float sample:data)REQUIRE(sample==0.125f);
        }},
        {"failed next-segment open retains exact usable duration",[&]{
            const auto collision=root/"rotation-2.wav";
            {std::ofstream out(collision,std::ios::binary);out<<"keep";}
            const auto original=bytes(collision);
            Trace::WavOptions options;options.segmentBytes=80;
            Trace::WavWriter writer(root/"rotation",48000,2,Trace::WavEncoding::Float32,options);
            std::vector<float> input(60,0.25f);bool failed=false;
            try{writer.append(input.data(),30);}catch(...){failed=true;}
            REQUIRE(failed);REQUIRE(writer.frames()==10);writer.close();
            REQUIRE(writer.frames()==10);REQUIRE(writer.segments().size()==1);
            REQUIRE(Trace::inspectWav(writer.segments()[0].path).frames==10);
            REQUIRE(bytes(collision)==original);
        }},
        {"Unicode output paths round-trip",[&]{
            Trace::WavWriter writer(root/fs::path(L"声迹录音"),96000,2,Trace::WavEncoding::Float32);
            float input[]{0.5f,-0.5f};writer.append(input,1);writer.close();
            Trace::WavReader reader(writer.segments()[0].path);float out[2]{};
            REQUIRE(reader.read(out,1)==1);REQUIRE(out[0]==input[0]&&out[1]==input[1]);
        }}
    };
    unsigned failed=0;
    for(const auto& [name,test]:tests)try{test();std::cout<<"PASS "<<name<<std::endl;}
    catch(const std::exception& e){++failed;std::cerr<<"FAIL "<<name<<": "<<e.what()<<std::endl;}
    std::cout<<tests.size()-failed<<"/"<<tests.size()<<" WAV cases passed"<<std::endl;
    return failed?1:0;
}
