// Test-only streaming decoder on portable builds. Windows uses the real
// Trace WavReader. Neither path changes gain, sample rate or channel layout.
#include "Meter.h"
#include "MeasurementConfig.h"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef TRACE_EBU_NATIVE_READER
#include "WavFile.h"
#endif

namespace {
constexpr uint32_t maxBlock=4093;
#ifdef TRACE_EBU_NATIVE_READER
class Reader {
    Trace::WavReader source_;
public:
    uint32_t rate,channels;uint64_t frames;
    explicit Reader(const std::filesystem::path& path):source_(path) {
        const auto& info=source_.info();rate=info.format.sampleRate;
        channels=info.format.channels;frames=info.frames;
    }
    uint32_t read(float* out,uint32_t count){return source_.read(out,count);}
};
constexpr const char* readerKind="Trace::WavReader";
#else
uint16_t u16(const unsigned char* p){return uint16_t(p[0])|uint16_t(p[1])<<8;}
uint32_t u32(const unsigned char* p){return uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
class Reader {
    std::ifstream source_;
    uint32_t bits_=0,align_=0;uint64_t remaining_=0;
    std::vector<unsigned char> bytes_;
    void exact(char* out,size_t n) {
        source_.read(out,static_cast<std::streamsize>(n));
        if(source_.gcount()!=static_cast<std::streamsize>(n))throw std::runtime_error("truncated WAV");
    }
public:
    uint32_t rate=0,channels=0;uint64_t frames=0;
    explicit Reader(const std::filesystem::path& path):source_(path,std::ios::binary) {
        if(!source_)throw std::runtime_error("cannot open WAV");
        unsigned char head[12];exact(reinterpret_cast<char*>(head),12);
        if(std::string(reinterpret_cast<char*>(head),4)!="RIFF"||std::string(reinterpret_cast<char*>(head+8),4)!="WAVE")throw std::runtime_error("not RIFF/WAVE");
        source_.seekg(0,std::ios::end);const auto length=source_.tellg();
        if(length<12||uint64_t(length)!=uint64_t(u32(head+4))+8)throw std::runtime_error("RIFF length mismatch");
        source_.seekg(12);uint64_t dataOffset=0,dataBytes=0;
        while(uint64_t(source_.tellg())+8<=uint64_t(length)) {
            unsigned char chunk[8];exact(reinterpret_cast<char*>(chunk),8);
            const auto id=std::string(reinterpret_cast<char*>(chunk),4);
            const auto n=u32(chunk+4);const auto at=uint64_t(source_.tellg());
            if(at+n>uint64_t(length))throw std::runtime_error("truncated chunk");
            if(id=="fmt ") {
                if(n<16||rate)throw std::runtime_error("invalid/duplicate fmt");
                unsigned char fmt[16];exact(reinterpret_cast<char*>(fmt),16);
                if(u16(fmt)!=1)throw std::runtime_error("expected original PCM WAV");
                channels=u16(fmt+2);rate=u32(fmt+4);align_=u16(fmt+12);bits_=u16(fmt+14);
                if((channels!=1&&channels!=2)||(bits_!=16&&bits_!=24)||!rate||align_!=channels*(bits_/8)||u32(fmt+8)!=rate*align_)throw std::runtime_error("unsupported/inconsistent PCM format");
            }else if(id=="data") {
                if(dataOffset)throw std::runtime_error("duplicate data");
                dataOffset=at;dataBytes=n;
            }
            source_.seekg(static_cast<std::streamoff>(at+n+(n%2)));
        }
        if(!rate||!dataOffset||dataBytes%align_)throw std::runtime_error("missing/partial PCM data");
        frames=dataBytes/align_;remaining_=frames;
        bytes_.resize(maxBlock*align_);source_.seekg(static_cast<std::streamoff>(dataOffset));
    }
    uint32_t read(float* out,uint32_t requested) {
        const auto count=static_cast<uint32_t>(std::min<uint64_t>(requested,remaining_));
        exact(reinterpret_cast<char*>(bytes_.data()),size_t(count)*align_);
        for(size_t i=0;i<size_t(count)*channels;++i) {
            const auto* p=bytes_.data()+i*(bits_/8);
            const uint32_t raw=bits_==16?u16(p):(uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16);
            const int32_t value=bits_==16?(raw>=0x8000?int32_t(raw)-0x10000:int32_t(raw)):(raw>=0x800000?int32_t(raw)-0x1000000:int32_t(raw));
            out[i]=static_cast<float>(value)/(bits_==16?32768.f:8388608.f);
        }
        remaining_-=count;return count;
    }
};
constexpr const char* readerKind="test-only PCM decoder";
#endif
void metric(const Trace::Metric& value) {
    std::cout<<"{\"status\":"<<static_cast<int>(value.status)<<",\"value\":";
    if(std::isfinite(value.value))std::cout<<value.value;else std::cout<<"null";
    std::cout<<'}';
}
void values(const Trace::MeterValues& v) {
    std::cout<<"{\"frame\":"<<v.frame<<",\"loudnessFrame\":"<<v.loudnessFrame;
    std::cout<<",\"M\":";metric(v.momentary);std::cout<<",\"S\":";metric(v.shortTerm);
    std::cout<<",\"I\":";metric(v.integrated);std::cout<<",\"LRA\":";metric(v.range);
    std::cout<<",\"TP\":";metric(v.maxTruePeak);std::cout<<",\"channels\":[";
    for(size_t c=0;c<2;++c){if(c)std::cout<<',';std::cout<<'[';metric(v.channels[c].peak);std::cout<<',';metric(v.channels[c].rms);std::cout<<',';metric(v.channels[c].truePeak);std::cout<<']';}
    std::cout<<"]}";
}
}
int run(const std::filesystem::path& path,const std::string& pattern) {
    try {
        if(pattern!="regular"&&pattern!="irregular")throw std::runtime_error("invalid input pattern");
        Reader reader(path);Trace::Meter meter(reader.rate,reader.channels);
        const std::vector<uint32_t> sizes=pattern=="regular"?std::vector<uint32_t>{2048}:std::vector<uint32_t>{1,7,137,2048,509,31,4093};
        std::vector<float> data(maxBlock*reader.channels);size_t block=0;bool first=true;
        std::cout<<std::setprecision(std::numeric_limits<double>::max_digits10)
                 <<"{\"configuration\":\""<<Trace::kMeasurementConfigId<<"\",\"reader\":\""<<readerKind<<"\",\"rate\":"<<reader.rate<<",\"channels\":"<<reader.channels<<",\"sourceFrames\":"<<reader.frames<<",\"readings\":[";
        meter.setFrameSink([&](const Trace::MeterValues& v,const Trace::WavePoint& wave,bool loud){
            if(!loud||v.frame!=v.loudnessFrame||v.frame!=wave.frame)throw std::runtime_error("unaligned measurement endpoint");
            if(!first)std::cout<<',';first=false;values(v);
        });
        for(;;){const auto n=reader.read(data.data(),sizes[block++%sizes.size()]);if(!n)break;meter.push(data.data(),n);}
        meter.finish();std::cout<<"],\"frames\":"<<meter.frames()<<",\"final\":";values(meter.values());std::cout<<"}\n";
        if(meter.frames()!=reader.frames||meter.values().frame!=reader.frames)throw std::runtime_error("EOF frame mismatch");
        return 0;
    }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
#ifdef _WIN32
int wmain(int argc,wchar_t** argv) {
    if(argc!=3){std::cerr<<"Usage: ebu_wav_probe path.wav regular|irregular\n";return 2;}
    const std::wstring pattern=argv[2];
    if(pattern!=L"regular"&&pattern!=L"irregular")return 2;
    return run(std::filesystem::path(argv[1]),pattern==L"regular"?"regular":"irregular");
}
#else
int main(int argc,char** argv) {
    if(argc!=3){std::cerr<<"Usage: ebu_wav_probe path.wav regular|irregular\n";return 2;}
    return run(std::filesystem::path(argv[1]),argv[2]);
}
#endif
