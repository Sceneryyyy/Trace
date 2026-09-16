#include "FileAnalysis.h"
#include "Meter.h"
#include "WavFile.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <limits>
#include <memory>
#include <stdexcept>
namespace Trace {
uint32_t analysisCrc32(const uint8_t* data,size_t size) {
    static const auto table=[]{
        std::array<uint32_t,256> values{};
        for(uint32_t i=0;i<256;++i){uint32_t c=i;for(unsigned j=0;j<8;++j)c=(c>>1)^(0xedb88320u&(0u-(c&1)));values[i]=c;}
        return values;
    }();
    uint32_t crc=0xffffffffu;
    for(size_t i=0;i<size;++i)crc=table[(crc^data[i])&255]^(crc>>8);
    return crc^0xffffffffu;
}
namespace {
void u32(uint8_t* p,uint32_t v){for(unsigned i=0;i<4;++i)p[i]=static_cast<uint8_t>(v>>(8*i));}
void u64(uint8_t* p,uint64_t v){for(unsigned i=0;i<8;++i)p[i]=static_cast<uint8_t>(v>>(8*i));}
void f32(uint8_t* p,float v){uint32_t bits;std::memcpy(&bits,&v,4);u32(p,bits);}
void f64(uint8_t* p,double v){uint64_t bits;std::memcpy(&bits,&v,8);u64(p,bits);}
void metric(uint8_t* p,const Metric& value) {
    const bool valid=value.status==MetricStatus::Ready&&std::isfinite(value.value);
    f64(p,valid?value.value:0);
    u32(p+8,static_cast<uint32_t>(value.status==MetricStatus::Ready&&!valid?MetricStatus::Error:value.status));
    u32(p+12,0);
}
class PageWriter {
    std::ofstream file_;
    std::vector<uint8_t> page_;
    uint32_t count_=0;
    uint64_t first_=0,last_=0;
    AnalysisStreamInfo info_;
    bool finished_=false;
    void flush() {
        if(!count_)return;
        std::memcpy(page_.data(),"TRPAGE01",8);
        u32(page_.data()+8,kAnalysisSchema);u32(page_.data()+12,info_.kind);
        u32(page_.data()+16,info_.recordBytes);u32(page_.data()+20,count_);
        u32(page_.data()+24,info_.stride);u32(page_.data()+28,0);
        u64(page_.data()+32,first_);u64(page_.data()+40,last_);
        u32(page_.data()+28,analysisCrc32(page_.data(),page_.size()));
        file_.write(reinterpret_cast<const char*>(page_.data()),static_cast<std::streamsize>(page_.size()));
        if(!file_)throw std::runtime_error("CACHE_WRITE_FAILED");
        ++info_.pages;count_=0;std::fill(page_.begin(),page_.end(),uint8_t{0});
    }
public:
    PageWriter(const std::filesystem::path& root,std::string name,uint32_t kind,uint32_t size,uint32_t stride):
        page_(kAnalysisHeaderBytes+static_cast<size_t>(kAnalysisPageRecords)*size,0) {
        info_.file=std::move(name);info_.kind=kind;info_.recordBytes=size;info_.stride=stride;
        file_.open(root/info_.file,std::ios::binary|std::ios::out|std::ios::trunc);
        if(!file_)throw std::runtime_error("CACHE_OPEN_FAILED");
    }
    void append(const uint8_t* record,uint64_t frame) {
        if(finished_)throw std::runtime_error("CACHE_ALREADY_FINISHED");
        if(count_==kAnalysisPageRecords)flush();
        if(!count_)first_=frame;
        last_=frame;
        std::memcpy(page_.data()+kAnalysisHeaderBytes+static_cast<size_t>(count_)*info_.recordBytes,record,info_.recordBytes);
        ++count_;++info_.records;
    }
    void replaceLast(const uint8_t* record) {
        if(!count_||finished_)throw std::runtime_error("CACHE_REPLACE_WITHOUT_RECORD");
        std::memcpy(page_.data()+kAnalysisHeaderBytes+static_cast<size_t>(count_-1)*info_.recordBytes,record,info_.recordBytes);
    }
    AnalysisStreamInfo finish() {
        if(!finished_){flush();file_.flush();if(!file_)throw std::runtime_error("CACHE_FLUSH_FAILED");file_.close();finished_=true;}
        return info_;
    }
};
std::array<uint8_t,kLevelRecordBytes> levelRecord(const MeterValues& values,const WavePoint& wave,uint32_t channels) {
    std::array<uint8_t,kLevelRecordBytes> result{};
    u64(result.data(),values.frame);u32(result.data()+8,wave.flags);u32(result.data()+12,channels);
    for(uint32_t c=0;c<2;++c){
        f32(result.data()+16+c*8,c<channels?wave.minimum[c]:0);
        f32(result.data()+20+c*8,c<channels?wave.maximum[c]:0);
        const Levels empty;const auto& levels=c<channels?values.channels[c]:empty;
        metric(result.data()+32+c*48,levels.peak);metric(result.data()+48+c*48,levels.rms);metric(result.data()+64+c*48,levels.truePeak);
    }
    return result;
}
std::array<uint8_t,kLoudnessRecordBytes> loudnessRecord(const MeterValues& values,uint32_t flags) {
    std::array<uint8_t,kLoudnessRecordBytes> result{};
    u64(result.data(),values.loudnessFrame);u32(result.data()+8,flags);
    const Metric metrics[]={values.momentary,values.shortTerm,values.integrated,values.range,values.maxTruePeak};
    for(unsigned i=0;i<5;++i)metric(result.data()+16+i*16,metrics[i]);
    return result;
}
struct WaveCell {
    uint64_t start=0,end=0;
    std::array<float,2> low{},high{};
    uint32_t flags=0;
};
class Pyramid {
    std::array<std::unique_ptr<PageWriter>,kWaveLodCount> writers_;
    std::array<WaveCell,kWaveLodCount> pending_{};
    std::array<unsigned,kWaveLodCount> counts_{};
    void emit(unsigned level) {
        const auto value=pending_[level];
        std::array<uint8_t,kWaveRecordBytes> record{};
        u64(record.data(),value.end);u64(record.data()+8,value.start);
        for(unsigned c=0;c<2;++c){f32(record.data()+16+c*8,value.low[c]);f32(record.data()+20+c*8,value.high[c]);}
        u32(record.data()+32,value.flags);
        writers_[level]->append(record.data(),value.end);counts_[level]=0;
        if(level+1<kWaveLodCount)push(level+1,value);
    }
    void push(unsigned level,const WaveCell& cell) {
        auto& target=pending_[level];
        if(!counts_[level])target=cell;
        else{
            target.end=cell.end;target.flags|=cell.flags;
            for(unsigned c=0;c<2;++c){target.low[c]=std::min(target.low[c],cell.low[c]);target.high[c]=std::max(target.high[c],cell.high[c]);}
        }
        if(++counts_[level]==10)emit(level);
    }
public:
    explicit Pyramid(const std::filesystem::path& root) {
        uint32_t stride=10;
        for(unsigned i=0;i<kWaveLodCount;++i,stride*=10)
            writers_[i]=std::make_unique<PageWriter>(root,"wave-"+std::to_string(i)+".bin",3,kWaveRecordBytes,stride);
    }
    void append(uint64_t start,const WavePoint& wave,uint32_t channels) {
        WaveCell cell{start,wave.frame,wave.minimum,wave.maximum,wave.flags};
        if(channels==1){cell.low[1]=0;cell.high[1]=0;}
        push(0,cell);
    }
    void finish(std::vector<AnalysisStreamInfo>& output) {
        for(unsigned i=0;i<kWaveLodCount;++i)if(counts_[i])emit(i);
        for(auto& writer:writers_)output.push_back(writer->finish());
    }
};
}
FileAnalysisResult analyzeFiles(const std::vector<std::filesystem::path>& sources,
        const std::filesystem::path& newDirectory,const FileAnalysisOptions& options) {
    if(sources.empty()||sources.size()>10000||!options.readFrames||options.readFrames>65536)
        throw std::runtime_error("INVALID_ANALYSIS_ARGUMENT");
    FileAnalysisResult result;
    std::vector<uint64_t> sourceLengths;
    for(const auto& source:sources){
        const auto info=inspectWav(source);
        if(!result.sampleRate){result.sampleRate=info.format.sampleRate;result.channels=info.format.channels;}
        if(result.sampleRate!=info.format.sampleRate||result.channels!=info.format.channels)
            throw std::runtime_error("ANALYSIS_FORMAT_CHANGE");
        if(info.frames>UINT64_MAX-result.frames)throw std::runtime_error("ANALYSIS_LENGTH_OVERFLOW");
        result.frames+=info.frames;sourceLengths.push_back(info.frames);
    }
    const auto rangeEnd=options.endFrame==UINT64_MAX?result.frames:options.endFrame;
    if(options.startFrame>rangeEnd||rangeEnd>result.frames||(options.endFrame!=UINT64_MAX&&rangeEnd<=options.startFrame))throw std::runtime_error("INVALID_ANALYSIS_RANGE");
    result.frames=rangeEnd-options.startFrame;
    // Count/index arithmetic below is bounded explicitly, not silently wrapped.
    if(result.frames>UINT64_MAX/1000)throw std::runtime_error("ANALYSIS_TOO_LONG");
    if(!std::filesystem::create_directory(newDirectory))throw std::runtime_error("CACHE_DIRECTORY_EXISTS");
    auto meter=std::make_unique<Meter>(result.sampleRate,result.channels);
    PageWriter levels(newDirectory,"levels.bin",1,kLevelRecordBytes,1);
    PageWriter loudness(newDirectory,"loudness.bin",2,kLoudnessRecordBytes,10);
    Pyramid pyramid(newDirectory);
    std::vector<float> buffer(static_cast<size_t>(options.readFrames)*result.channels);
    uint64_t lastLevel=0,lastLoudness=0,nextProgress=result.sampleRate;
    meter->setFrameSink([&](const MeterValues& values,const WavePoint& wave,bool loud){
        if(values.frame<=lastLevel)throw std::runtime_error("ANALYSIS_NON_MONOTONIC_FRAME");
        const auto record=levelRecord(values,wave,result.channels);
        levels.append(record.data(),values.frame);pyramid.append(lastLevel,wave,result.channels);lastLevel=values.frame;
        if(loud){
            if(values.loudnessFrame<=lastLoudness)throw std::runtime_error("ANALYSIS_NON_MONOTONIC_LOUDNESS");
            const auto* point=meter->latestLoudness();
            const auto item=loudnessRecord(values,point?point->flags:0);
            loudness.append(item.data(),values.loudnessFrame);lastLoudness=values.loudnessFrame;
        }
    });
    uint64_t sourceOffset=0;
    for(size_t sourceIndex=0;sourceIndex<sources.size();++sourceIndex){
        const auto sourceFrames=sourceLengths[sourceIndex],sourceEnd=sourceOffset+sourceFrames;
        if(sourceEnd<=options.startFrame||sourceOffset>=rangeEnd){sourceOffset=sourceEnd;continue;}
        WavReader reader(sources[sourceIndex]);
        if(reader.info().frames!=sourceFrames||reader.info().format.sampleRate!=result.sampleRate||reader.info().format.channels!=result.channels)
            throw std::runtime_error("ANALYSIS_SOURCE_CHANGED");
        const auto localStart=options.startFrame>sourceOffset?options.startFrame-sourceOffset:0;
        const auto localEnd=std::min(rangeEnd,sourceEnd)-sourceOffset;
        reader.seek(localStart);uint64_t remaining=localEnd-localStart;
        while(remaining){
            if(options.cancelled&&options.cancelled())throw std::runtime_error("ANALYSIS_CANCELLED");
            const auto count=reader.read(buffer.data(),static_cast<uint32_t>(std::min<uint64_t>(options.readFrames,remaining)));
            if(!count)throw std::runtime_error("ANALYSIS_SOURCE_CHANGED");
            remaining-=count;
            for(size_t i=0;i<static_cast<size_t>(count)*result.channels;++i)
                if(!std::isfinite(buffer[i]))throw std::runtime_error("INVALID_AUDIO_SAMPLE");
            uint32_t offset=0;
            while(offset<count){
                const auto frame=meter->frames();
                const auto next=(frame*100/result.sampleRate+1)*result.sampleRate/100;
                const auto amount=static_cast<uint32_t>(std::min<uint64_t>(count-offset,std::max<uint64_t>(1,next-frame)));
                meter->push(buffer.data()+static_cast<size_t>(offset)*result.channels,amount);offset+=amount;
            }
            if(meter->frames()>=nextProgress){
                if(options.progress)options.progress(meter->frames(),result.frames);
                nextProgress=meter->frames()+result.sampleRate;
            }
        }
        sourceOffset=sourceEnd;
    }
    if(meter->frames()!=result.frames)throw std::runtime_error("ANALYSIS_SOURCE_CHANGED");
    meter->finish();
    if(result.frames){
        // TP flush may amend an EOF record even when EOF landed on a full hop.
        const auto level=levelRecord(meter->values(),*meter->latestWave(),result.channels);
        const auto loud=loudnessRecord(meter->values(),meter->latestLoudness()?meter->latestLoudness()->flags:0);
        levels.replaceLast(level.data());loudness.replaceLast(loud.data());
    }
    result.summary=meter->values();
    result.streams.push_back(levels.finish());result.streams.push_back(loudness.finish());pyramid.finish(result.streams);
    if(options.progress)options.progress(result.frames,result.frames);
    return result;
}
}
