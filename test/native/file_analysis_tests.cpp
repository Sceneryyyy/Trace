#include "FileAnalysis.h"
#include "WavFile.h"
#include "Meter.h"
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
namespace fs=std::filesystem;
#define REQUIRE(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
std::vector<uint8_t> bytes(const fs::path& path){std::ifstream file(path,std::ios::binary);return {std::istreambuf_iterator<char>(file),{}};}
uint32_t u32(const uint8_t* p){return uint32_t(p[0])|(uint32_t(p[1])<<8)|(uint32_t(p[2])<<16)|(uint32_t(p[3])<<24);}
uint64_t u64(const uint8_t* p){return uint64_t(u32(p))|(uint64_t(u32(p+4))<<32);}
double f64(const uint8_t* p){auto bits=u64(p);double v;std::memcpy(&v,&bits,8);return v;}
float f32(const uint8_t* p){auto bits=u32(p);float v;std::memcpy(&v,&bits,4);return v;}
fs::path wave(const fs::path& root,const std::string& name,const std::vector<float>& data,uint32_t rate,uint32_t channels){
    Trace::WavWriter writer(root/name,rate,channels,Trace::WavEncoding::Float32);
    if(!data.empty())writer.append(data.data(),static_cast<uint32_t>(data.size()/channels));writer.close();
    return writer.segments().at(0).path;
}
std::vector<float> signal(uint32_t frames,uint32_t rate,uint32_t channels){
    std::vector<float> result(static_cast<size_t>(frames)*channels);
    for(uint32_t f=0;f<frames;++f)for(uint32_t c=0;c<channels;++c){
        const float amplitude=f<rate*2?0.5f:f<rate*4?0.0f:0.08f;
        result[static_cast<size_t>(f)*channels+c]=amplitude*static_cast<float>(std::sin(6.283185307179586*(997+c*311)*f/rate));
    }
    return result;
}
std::vector<std::vector<uint8_t>> records(const fs::path& path,const Trace::AnalysisStreamInfo& info){
    auto data=bytes(path);const size_t pageSize=Trace::kAnalysisHeaderBytes+Trace::kAnalysisPageRecords*info.recordBytes;
    REQUIRE(data.size()==pageSize*info.pages);
    std::vector<std::vector<uint8_t>> result;
    for(size_t offset=0;offset<data.size();offset+=pageSize){
        auto* p=data.data()+offset;REQUIRE(std::memcmp(p,"TRPAGE01",8)==0);REQUIRE(u32(p+8)==1);
        REQUIRE(u32(p+12)==info.kind&&u32(p+16)==info.recordBytes&&u32(p+24)==info.stride);
        const auto crc=u32(p+28);std::fill(p+28,p+32,uint8_t{0});REQUIRE(Trace::analysisCrc32(p,pageSize)==crc);
        const auto count=u32(p+20);REQUIRE(count>0&&count<=1024);
        for(uint32_t i=0;i<count;++i){const auto* value=p+64+static_cast<size_t>(i)*info.recordBytes;result.emplace_back(value,value+info.recordBytes);}
    }
    REQUIRE(result.size()==info.records);return result;
}
int main(){
    LARGE_INTEGER q;QueryPerformanceCounter(&q);
    const auto root=fs::current_path()/("analysis-tests-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(q.QuadPart));fs::create_directories(root);
    std::vector<std::pair<const char*,std::function<void()>>> tests{
        {"file cache is byte-identical across arbitrary input chunk sizes",[&]{
            const auto data=signal(48000*12+137,48000,2);const auto input=wave(root,"tone",data,48000,2);
            Trace::FileAnalysisOptions a;a.readFrames=127;Trace::FileAnalysisOptions b;b.readFrames=4093;
            const auto first=Trace::analyzeFiles({input},root/"chunks-a",a),second=Trace::analyzeFiles({input},root/"chunks-b",b);
            REQUIRE(first.frames==data.size()/2&&first.streams.size()==8);
            REQUIRE(first.streams[0].records==1201&&first.streams[0].pages==2);
            REQUIRE(first.streams[1].records==1201&&first.streams[1].stride==1&&first.summary.frame==first.frames&&first.summary.loudnessFrame==first.frames);
            for(const auto& stream:first.streams){REQUIRE(bytes(root/"chunks-a"/stream.file)==bytes(root/"chunks-b"/stream.file));records(root/"chunks-a"/stream.file,stream);}
            Trace::Meter reference(48000,2);reference.push(data.data(),static_cast<uint32_t>(data.size()/2));reference.finish();
            REQUIRE(first.summary.integrated.value==reference.values().integrated.value);
            REQUIRE(second.summary.maxTruePeak.value==reference.values().maxTruePeak.value);
            const auto loud=records(root/"chunks-a"/first.streams[1].file,first.streams[1]);
            REQUIRE(u64(loud.back().data())==first.frames);
            REQUIRE(f64(loud.back().data()+48)==reference.values().integrated.value);
        }},
        {"same-format WAV segments preserve the continuous prefix and waveform extrema",[&]{
            const auto data=signal(48000*6+301,48000,1);const uint32_t split=12347;
            std::vector<float> head(data.begin(),data.begin()+split),tail(data.begin()+split,data.end());
            const auto input=wave(root,"full",data,48000,1),one=wave(root,"part-one",head,48000,1),two=wave(root,"part-two",tail,48000,1);
            const auto first=Trace::analyzeFiles({input},root/"full-cache"),second=Trace::analyzeFiles({one,two},root/"split-cache");
            REQUIRE(first.frames==second.frames);
            for(const auto& stream:first.streams)REQUIRE(bytes(root/"full-cache"/stream.file)==bytes(root/"split-cache"/stream.file));
            const auto coarse=records(root/"full-cache"/first.streams.back().file,first.streams.back());
            REQUIRE(coarse.size()==1);REQUIRE(u64(coarse[0].data())==first.frames);REQUIRE(u64(coarse[0].data()+8)==0);
            REQUIRE(f32(coarse[0].data()+16)==*std::min_element(data.begin(),data.end()));
            REQUIRE(f32(coarse[0].data()+20)==*std::max_element(data.begin(),data.end()));
            REQUIRE(f32(coarse[0].data()+24)==0&&f32(coarse[0].data()+28)==0);
        }},
        {"EOF true peak amends a full final page without adding fake frames",[&]{
            std::vector<float> data(1024*480,0);data.back()=0.99f;
            const auto input=wave(root,"tail",data,48000,1);const auto result=Trace::analyzeFiles({input},root/"tail-cache");
            REQUIRE(result.streams[0].records==1024&&result.streams[0].pages==1);
            Trace::Meter reference(48000,1);reference.push(data.data(),static_cast<uint32_t>(data.size()));reference.finish();
            const auto levels=records(root/"tail-cache"/result.streams[0].file,result.streams[0]);
            REQUIRE(u64(levels.back().data())==data.size());
            REQUIRE(f64(levels.back().data()+64)==reference.values().channels[0].truePeak.value);
            REQUIRE(result.summary.maxTruePeak.value==reference.values().maxTruePeak.value);
        }},
        {"silence and short-file readiness remain distinct at all supported rates",[&]{
            for(const uint32_t rate:{44100u,48000u,88200u,96000u}){
                std::vector<float> data(rate*4,0);
                const auto input=wave(root,"zero-"+std::to_string(rate),data,rate,1);
                const auto result=Trace::analyzeFiles({input},root/("zero-cache-"+std::to_string(rate)));
                REQUIRE(result.summary.momentary.status==Trace::MetricStatus::Silence);
                REQUIRE(result.summary.channels[0].rms.status==Trace::MetricStatus::Silence);
                data.resize(17);const auto shortInput=wave(root,"short-"+std::to_string(rate),data,rate,1);
                const auto tiny=Trace::analyzeFiles({shortInput},root/("short-cache-"+std::to_string(rate)));
                REQUIRE(tiny.frames==17&&tiny.streams[0].records==1&&tiny.streams[1].records==1);
                REQUIRE(tiny.summary.integrated.status==Trace::MetricStatus::Insufficient);
            }
        }},
        {"selection cache matches a freshly cut file across source segments", [&]{
            const auto data=signal(48000*6+301,48000,2);
            const uint32_t split=150137,start=70003,end=250129;
            const auto one=wave(root,"selection-a",{data.begin(),data.begin()+split*2},48000,2);
            const auto two=wave(root,"selection-b",{data.begin()+split*2,data.end()},48000,2);
            const auto cut=wave(root,"selection-cut",{data.begin()+start*2,data.begin()+end*2},48000,2);
            Trace::FileAnalysisOptions selection;selection.startFrame=start;selection.endFrame=end;selection.readFrames=137;
            const auto selected=Trace::analyzeFiles({one,two},root/"selection-cache",selection);
            const auto independent=Trace::analyzeFiles({cut},root/"selection-cut-cache");
            REQUIRE(selected.frames==end-start&&selected.summary.frame==end-start);
            REQUIRE(selected.summary.integrated.status==independent.summary.integrated.status);
            REQUIRE(selected.summary.integrated.value==independent.summary.integrated.value);
            for(const auto& stream:selected.streams)REQUIRE(bytes(root/"selection-cache"/stream.file)==bytes(root/"selection-cut-cache"/stream.file));
        }},
        {"invalid selection is rejected before cache creation", [&]{
            const auto input=wave(root,"range-input",signal(48000,48000,1),48000,1);
            for(const auto range:{std::pair<uint64_t,uint64_t>{40000,30000},{0,48001},{17,17}}){
                Trace::FileAnalysisOptions options;options.startFrame=range.first;options.endFrame=range.second;
                const auto target=root/("invalid-range-"+std::to_string(range.first)+"-"+std::to_string(range.second));
                bool rejected=false;try{Trace::analyzeFiles({input},target,options);}catch(...){rejected=true;}
                REQUIRE(rejected&&!fs::exists(target));
            }
        }},
        {"cancel and invalid format never produce a complete cache or overwrite input",[&]{
            const auto data=signal(48000*2,48000,1);const auto input=wave(root,"cancel",data,48000,1);const auto original=bytes(input);
            unsigned checks=0;Trace::FileAnalysisOptions options;options.cancelled=[&]{return ++checks>4;};
            bool cancelled=false;try{Trace::analyzeFiles({input},root/"cancelled",options);}catch(const std::exception& e){cancelled=std::string(e.what())=="ANALYSIS_CANCELLED";}
            REQUIRE(cancelled&&bytes(input)==original);
            bool collision=false;try{Trace::analyzeFiles({input},root/"cancelled");}catch(const std::exception& e){collision=std::string(e.what())=="CACHE_DIRECTORY_EXISTS";}
            REQUIRE(collision);
            const auto other=wave(root,"other-rate",data,44100,1);bool formatError=false;
            try{Trace::analyzeFiles({input,other},root/"mixed");}catch(const std::exception& e){formatError=std::string(e.what())=="ANALYSIS_FORMAT_CHANGE";}
            REQUIRE(formatError&&!fs::exists(root/"mixed"));
            REQUIRE(Trace::analysisCrc32(reinterpret_cast<const uint8_t*>("123456789"),9)==0xcbf43926u);
        }},
    };
    unsigned passed=0;for(const auto& test:tests){try{test.second();std::cout<<"PASS "<<test.first<<'\n';++passed;}catch(const std::exception& e){std::cerr<<"FAIL "<<test.first<<": "<<e.what()<<'\n';}}
    std::cout<<passed<<"/"<<tests.size()<<" file analysis cases passed\n";
    return passed==tests.size()?0:1;
}
