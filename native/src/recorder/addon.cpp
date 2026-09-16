#include <napi.h>
#include <windows.h>
#include "Engine.h"
#include "ReplaySave.h"
#include "InstrumentAddon.h"
#include "PlaybackAddon.h"
#include "FileAnalysis.h"
#include "MeasurementConfig.h"
#include <chrono>
#include <cmath>
#include <functional>
namespace {
Trace::Engine& engine() { static Trace::Engine instance; return instance; }
Napi::Value guard(const Napi::CallbackInfo& info, const std::function<Napi::Value()>& action) {
    try { return action(); } catch (const std::exception& e) {
        Napi::Error::New(info.Env(), e.what()).ThrowAsJavaScriptException(); return info.Env().Undefined();
    }
}
Napi::Object format(Napi::Env env, const Trace::SourceFormat& f) {
    auto o=Napi::Object::New(env);
    o.Set("sampleRate",f.sampleRate); o.Set("channelCount",f.channels);
    o.Set("containerBits",f.containerBits); o.Set("validBits",f.validBits);
    o.Set("blockAlign",f.blockAlign); o.Set("channelMask",f.channelMask);
    o.Set("encoding",f.floatingPoint ? "ieee-float" : "pcm-int"); return o;
}
Napi::Object metric(Napi::Env env, Trace::Metric m, const char* unit, bool failed=false) {
    auto o=Napi::Object::New(env); const char* status="insufficient";
    if(failed) m.status=Trace::MetricStatus::Error;
    switch(m.status) {
        case Trace::MetricStatus::Ready: status="ready"; break;
        case Trace::MetricStatus::Silence: status="silence"; break;
        case Trace::MetricStatus::Gap: status="gap"; break;
        case Trace::MetricStatus::Error: status="error"; break;
        default: break;
    }
    o.Set("status",status); o.Set("unit",unit);
    if(m.status==Trace::MetricStatus::Ready && std::isfinite(m.value)) o.Set("value",m.value);
    else o.Set("value",env.Null());
    return o;
}
void frame(Napi::Object o,const char* key,uint64_t v) { o.Set(key,std::to_string(v)); }
Napi::Value devices(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        const auto list=Trace::listDevices(); auto a=Napi::Array::New(info.Env(),list.size());
        for(size_t i=0;i<list.size();++i) {
            const auto& d=list[i]; auto o=Napi::Object::New(info.Env());
            o.Set("id",d.id); o.Set("label",d.label); o.Set("isDefault",d.isDefault); o.Set("supported",d.error.empty());
            if(d.error.empty()){ o.Set("format",format(info.Env(),d.format)); o.Set("error",info.Env().Null()); }
            else { o.Set("format",info.Env().Null()); o.Set("error",d.error); }
            a.Set(static_cast<uint32_t>(i),o);
        }
        return a;
    });
}
Napi::Value start(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        if(info.Length()!=1 || !info[0].IsString()) throw std::runtime_error("INVALID_DEVICE_ID");
        const auto id=info[0].As<Napi::String>().Utf8Value();
        if(id.empty() || id.size()>1024 || id.find('\0') != std::string::npos) throw std::runtime_error("INVALID_DEVICE_ID");
        engine().start(id); return format(info.Env(),engine().snapshot(10,1).format);
    });
}
Napi::Value stop(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{engine().stop(); return info.Env().Undefined();});
}
Napi::Value reset(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{engine().reset(); return info.Env().Undefined();});
}
Napi::Value snapshot(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        unsigned seconds=30; size_t columns=800;
        if(info.Length()>0) {
            if(!info[0].IsNumber()) throw std::runtime_error("INVALID_WINDOW");
            const double v=info[0].As<Napi::Number>().DoubleValue();
            if(!std::isfinite(v)||v<5||v>60) throw std::runtime_error("INVALID_WINDOW");
            seconds=static_cast<unsigned>(std::ceil(v));
        }
        if(info.Length()>1) {
            if(!info[1].IsNumber()) throw std::runtime_error("INVALID_WIDTH");
            const double v=info[1].As<Napi::Number>().DoubleValue();
            if(!std::isfinite(v)||v<1||v>1200||std::floor(v)!=v) throw std::runtime_error("INVALID_WIDTH");
            columns=static_cast<size_t>(v);
        }
        const auto s=engine().snapshot(seconds,columns); auto env=info.Env(); auto o=Napi::Object::New(env);
        o.Set("protocolVersion",1); o.Set("sourceKind","live"); o.Set("sourceId",s.deviceId);
        frame(o,"epochId",s.captureEpoch); frame(o,"measurementEpoch",s.measurementEpoch);
        o.Set("measurementConfigId",Trace::kMeasurementConfigId);
        o.Set("active",s.active);
        if(s.error.empty()) o.Set("error",env.Null()); else o.Set("error",s.error);
        o.Set("format",format(env,s.format));
        o.Set("continuity",!s.error.empty()?"unknown":s.gaps||s.droppedFrames?"gaps":s.estimated?"estimated-silence":"complete");
        frame(o,"positionFrame",s.position); frame(o,"measurementFrames",s.measurementFrames);
        frame(o,"levelIndexFrame",s.meters.frame); frame(o,"loudnessIndexFrame",s.meters.loudnessFrame);
        const bool failed=!s.error.empty(); auto channels=Napi::Array::New(env,s.format.channels);
        for(uint32_t c=0;c<s.format.channels;++c) {
            auto item=Napi::Object::New(env);
            item.Set("samplePeak",metric(env,s.meters.channels[c].peak,"dBFS",failed));
            item.Set("rms",metric(env,s.meters.channels[c].rms,"dBFS",failed));
            item.Set("truePeak",metric(env,s.meters.channels[c].truePeak,"dBTP",failed));
            channels.Set(c,item);
        }
        o.Set("channels",channels);
        o.Set("momentary",metric(env,s.meters.momentary,"LUFS",failed));
        o.Set("shortTerm",metric(env,s.meters.shortTerm,"LUFS",failed));
        o.Set("integratedToCursor",metric(env,s.meters.integrated,"LUFS",failed));
        o.Set("loudnessRange",metric(env,s.meters.range,"LU",failed));
        o.Set("maxTruePeak",metric(env,s.meters.maxTruePeak,"dBTP",failed));
        o.Set("lraProvisional",s.measurementFrames<s.format.sampleRate*60ULL);
        auto wave=Napi::Array::New(env,s.waveform.size());
        for(size_t i=0;i<s.waveform.size();++i) {
            const auto& p=s.waveform[i]; auto item=Napi::Object::New(env);
            frame(item,"frame",p.frame); item.Set("flags",p.flags);
            auto low=Napi::Array::New(env,s.format.channels),high=Napi::Array::New(env,s.format.channels);
            for(uint32_t c=0;c<s.format.channels;++c){low.Set(c,p.minimum[c]);high.Set(c,p.maximum[c]);}
            item.Set("min",low);item.Set("max",high);wave.Set(static_cast<uint32_t>(i),item);
        }
        o.Set("waveform",wave);
        auto history=Napi::Array::New(env,s.loudness.size());
        for(size_t i=0;i<s.loudness.size();++i) {
            const auto& p=s.loudness[i];auto item=Napi::Object::New(env);
            frame(item,"frame",p.frame);item.Set("flags",p.flags);
            item.Set("m",metric(env,p.momentary,"LUFS"));item.Set("s",metric(env,p.shortTerm,"LUFS"));
            item.Set("i",metric(env,p.integrated,"LUFS"));history.Set(static_cast<uint32_t>(i),item);
        }
        o.Set("loudnessHistory",history);
        auto d=Napi::Object::New(env);
        frame(d,"replayFrames",s.replayFrames);frame(d,"replayCapacityFrames",s.replayCapacityFrames);frame(d,"replayStartFrame",s.replayStartFrame);frame(d,"replayEndFrame",s.replayEndFrame);
        frame(d,"capturedFrames",s.capturedFrames);frame(d,"analyzedFrames",s.analyzedFrames);
        frame(d,"estimatedFrames",s.estimatedFrames);frame(d,"droppedFrames",s.droppedFrames);
        frame(d,"discontinuities",s.discontinuities);frame(d,"timestampErrors",s.timestampErrors);frame(d,"overlapEvents",s.overlapEvents);
        frame(d,"meterLagFrames",s.meterLagFrames);d.Set("truePeakLookaheadFrames",s.truePeakLookaheadFrames);
        d.Set("sourceRecoverable",s.sourceRecoverable);d.Set("sourceErrorCode",s.sourceErrorCode);
        d.Set("errorSite",s.errorSite);d.Set("captureMode","wasapi-event-100ms-v1");d.Set("endpointBufferFrames",s.endpointBufferFrames);
        d.Set("queueDepth",static_cast<double>(s.queueDepth));d.Set("queueHighWater",static_cast<double>(s.queueHighWater));
        o.Set("diagnostics",d);return o;
    });
}

Napi::Object recordObject(Napi::Env env,const Trace::RecordSnapshot& s) {
    auto o=Napi::Object::New(env);
    o.Set("phase",Trace::recordPhaseName(s.phase));o.Set("id",s.id);
    if(s.error.empty())o.Set("error",env.Null());else o.Set("error",s.error);
    o.Set("sourceFormat",format(env,s.format));
    o.Set("encoding",s.encoding==Trace::WavEncoding::Float32?"float32":s.encoding==Trace::WavEncoding::Pcm24?"pcm24":"pcm16");
    if(s.startFrame==UINT64_MAX)o.Set("startFrame",env.Null());else frame(o,"startFrame",s.startFrame);
    if(s.endFrame==UINT64_MAX)o.Set("endFrameExclusive",env.Null());else frame(o,"endFrameExclusive",s.endFrame);
    if(s.startQpc100ns==UINT64_MAX)o.Set("startQpc100ns",env.Null());else frame(o,"startQpc100ns",s.startQpc100ns);
    if(s.endQpc100ns==UINT64_MAX)o.Set("endQpc100ns",env.Null());else frame(o,"endQpc100ns",s.endQpc100ns);
    o.Set("startQpcEstimated",s.startQpcEstimated);o.Set("endQpcEstimated",s.endQpcEstimated);
    frame(o,"acceptedFrames",s.acceptedFrames);frame(o,"writtenFrames",s.writtenFrames);
    frame(o,"estimatedFrames",s.estimatedFrames);frame(o,"clippedSamples",s.clippedSamples);
    o.Set("queueDepth",static_cast<double>(s.queueDepth));o.Set("queueHighWater",static_cast<double>(s.queueHighWater));
    auto meters=Napi::Object::New(env);auto channels=Napi::Array::New(env,s.format.channels);
    for(uint32_t c=0;c<s.format.channels;++c){
        auto v=Napi::Object::New(env);v.Set("samplePeak",metric(env,s.meters.channels[c].peak,"dBFS"));
        v.Set("rms",metric(env,s.meters.channels[c].rms,"dBFS"));v.Set("truePeak",metric(env,s.meters.channels[c].truePeak,"dBTP"));channels.Set(c,v);
    }
    meters.Set("channels",channels);meters.Set("momentary",metric(env,s.meters.momentary,"LUFS"));
    meters.Set("shortTerm",metric(env,s.meters.shortTerm,"LUFS"));meters.Set("integratedToCursor",metric(env,s.meters.integrated,"LUFS"));
    meters.Set("loudnessRange",metric(env,s.meters.range,"LU"));meters.Set("maxTruePeak",metric(env,s.meters.maxTruePeak,"dBTP"));
    frame(meters,"levelIndexFrame",s.meters.frame);frame(meters,"loudnessIndexFrame",s.meters.loudnessFrame);
    o.Set("meters",meters);
    auto segments=Napi::Array::New(env,s.segments.size());
    for(size_t i=0;i<s.segments.size();++i){
        auto v=Napi::Object::New(env);v.Set("file",s.segments[i].path.filename().u8string());
        frame(v,"frames",s.segments[i].frames);frame(v,"bytes",s.segments[i].bytes);frame(v,"clippedSamples",s.segments[i].clippedSamples);
        segments.Set(static_cast<uint32_t>(i),v);
    }
    o.Set("segments",segments);frame(o,"replayStartFrame",s.replayStartFrame);frame(o,"replayEndFrame",s.replayEndFrame);
    auto wave=Napi::Array::New(env,s.waveform.size());
    for(size_t i=0;i<s.waveform.size();++i){
        const auto& p=s.waveform[i];auto v=Napi::Object::New(env);frame(v,"frame",p.frame);v.Set("flags",p.flags);
        auto low=Napi::Array::New(env,s.format.channels),high=Napi::Array::New(env,s.format.channels);
        for(uint32_t ch=0;ch<s.format.channels;++ch){low.Set(ch,p.minimum[ch]);high.Set(ch,p.maximum[ch]);}
        v.Set("min",low);v.Set("max",high);wave.Set(static_cast<uint32_t>(i),v);
    }
    o.Set("waveform",wave);
    auto history=Napi::Array::New(env,s.loudness.size());
    for(size_t i=0;i<s.loudness.size();++i){
        const auto& p=s.loudness[i];auto v=Napi::Object::New(env);frame(v,"frame",p.frame);v.Set("flags",p.flags);
        v.Set("m",metric(env,p.momentary,"LUFS"));v.Set("s",metric(env,p.shortTerm,"LUFS"));v.Set("i",metric(env,p.integrated,"LUFS"));
        history.Set(static_cast<uint32_t>(i),v);
    }
    o.Set("loudnessHistory",history);
    return o;
}
Napi::Value recordStart(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        if(info.Length()<3||!info[0].IsString()||!info[1].IsString()||!info[2].IsString())throw std::runtime_error("INVALID_RECORD_OPTIONS");
        const auto id=info[0].As<Napi::String>().Utf8Value(),path=info[1].As<Napi::String>().Utf8Value(),name=info[2].As<Napi::String>().Utf8Value();
        if(id.empty()||id.size()>128||path.empty()||path.size()>32767||id.find('\0')!=std::string::npos||path.find('\0')!=std::string::npos)
            throw std::runtime_error("INVALID_RECORD_OPTIONS");
        Trace::WavEncoding encoding;
        if(name=="pcm16")encoding=Trace::WavEncoding::Pcm16;
        else if(name=="pcm24")encoding=Trace::WavEncoding::Pcm24;
        else if(name=="float32")encoding=Trace::WavEncoding::Float32;
        else throw std::runtime_error("INVALID_RECORD_ENCODING");
        Trace::WavOptions options;
        if(info.Length()>3){
            if(!info[3].IsNumber())throw std::runtime_error("INVALID_SEGMENT_LIMIT");
            const auto v=info[3].As<Napi::Number>().DoubleValue();
            if(!std::isfinite(v)||v<8||v>2147483648.0||v!=std::floor(v))throw std::runtime_error("INVALID_SEGMENT_LIMIT");
            options.segmentBytes=static_cast<uint64_t>(v);
        }
        std::filesystem::path journal;
        if(info.Length()>4){if(!info[4].IsString())throw std::runtime_error("INVALID_JOURNAL_PATH");const auto j=info[4].As<Napi::String>().Utf8Value();if(j.empty()||j.size()>32767||j.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_JOURNAL_PATH");journal=std::filesystem::u8path(j);}
        engine().recordStart(id,std::filesystem::u8path(path),encoding,options,journal);
        return recordObject(info.Env(),engine().recordSnapshot());
    });
}
Napi::Value recordStop(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{engine().recordStop();return recordObject(info.Env(),engine().recordSnapshot());});
}
Napi::Value recordStatus(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{return recordObject(info.Env(),engine().recordSnapshot());});
}
Napi::Value shutdown(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{engine().stop(true);return recordObject(info.Env(),engine().recordSnapshot());});
}

Napi::Value recoverWave(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        if(info.Length()!=2||!info[0].IsString()||!info[1].IsString())throw std::runtime_error("INVALID_RECOVERY_PATH");
        const auto source=info[0].As<Napi::String>().Utf8Value(),target=info[1].As<Napi::String>().Utf8Value();
        if(source.empty()||target.empty()||source.find('\0')!=std::string::npos||target.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_RECOVERY_PATH");
        const auto result=Trace::recoverWav(std::filesystem::u8path(source),std::filesystem::u8path(target));
        auto value=format(info.Env(),result.format);frame(value,"frames",result.frames);return value;
    });
}
Napi::Value convertWaves(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        if(info.Length()<3||info.Length()>4||!info[0].IsArray()||!info[2].IsString())throw std::runtime_error("INVALID_CONVERSION_ARGUMENT");
        auto pathValue=[](Napi::Value value){
            if(!value.IsString())throw std::runtime_error("INVALID_CONVERSION_PATH");
            const auto path=value.As<Napi::String>().Utf8Value();
            if(path.empty()||path.size()>32767||path.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_CONVERSION_PATH");
            return std::filesystem::u8path(path);
        };
        const auto files=info[0].As<Napi::Array>();
        if(!files.Length()||files.Length()>10000)throw std::runtime_error("INVALID_CONVERSION_SOURCES");
        std::vector<std::filesystem::path> paths;for(uint32_t i=0;i<files.Length();++i)paths.push_back(pathValue(files.Get(i)));
        const auto name=info[2].As<Napi::String>().Utf8Value();
        const auto encoding=name=="pcm16"?Trace::WavEncoding::Pcm16:name=="pcm24"?Trace::WavEncoding::Pcm24:Trace::WavEncoding::Float32;
        if(name!="pcm16"&&name!="pcm24"&&name!="float32")throw std::runtime_error("INVALID_CONVERSION_ENCODING");
        Trace::WavOptions options;
        if(info.Length()==4){
            if(!info[3].IsNumber())throw std::runtime_error("INVALID_SEGMENT_LIMIT");
            const auto limit=info[3].As<Napi::Number>().DoubleValue();
            if(!std::isfinite(limit)||limit<8||limit>2147483648.0||std::floor(limit)!=limit)throw std::runtime_error("INVALID_SEGMENT_LIMIT");
            options.segmentBytes=static_cast<uint64_t>(limit);
        }
        const auto result=Trace::convertWavs(paths,pathValue(info[1]),encoding,options);auto value=format(info.Env(),result.format);
        frame(value,"frames",result.frames);frame(value,"clippedSamples",result.clippedSamples);
        auto segments=Napi::Array::New(info.Env(),result.segments.size());
        for(size_t i=0;i<result.segments.size();++i){
            const auto& source=result.segments[i];auto segment=Napi::Object::New(info.Env());segment.Set("file",source.path.filename().u8string());
            frame(segment,"frames",source.frames);frame(segment,"clippedSamples",source.clippedSamples);segments.Set(static_cast<uint32_t>(i),segment);
        }
        value.Set("segments",segments);return value;
    });
}

Napi::Value analyzeWaves(const Napi::CallbackInfo& info) {
    return guard(info,[&]()->Napi::Value{
        if(info.Length()<2||info.Length()>5||!info[0].IsArray()||!info[1].IsString())throw std::runtime_error("INVALID_ANALYSIS_ARGUMENT");
        const auto files=info[0].As<Napi::Array>();
        if(!files.Length()||files.Length()>10000)throw std::runtime_error("INVALID_ANALYSIS_SOURCES");
        auto pathValue=[](Napi::Value value){
            if(!value.IsString())throw std::runtime_error("INVALID_ANALYSIS_PATH");
            auto path=value.As<Napi::String>().Utf8Value();
            if(path.empty()||path.size()>32767||path.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_ANALYSIS_PATH");
            return std::filesystem::u8path(path);
        };
        std::vector<std::filesystem::path> sources;sources.reserve(files.Length());
        for(uint32_t i=0;i<files.Length();++i)sources.push_back(pathValue(files.Get(i)));
        const auto directory=pathValue(info[1]);
        Trace::FileAnalysisOptions options;
        if(info.Length()>2){
            if(!info[2].IsNumber())throw std::runtime_error("INVALID_ANALYSIS_BLOCK");
            const auto block=info[2].As<Napi::Number>().DoubleValue();
            if(!std::isfinite(block)||std::floor(block)!=block||block<1||block>65536)throw std::runtime_error("INVALID_ANALYSIS_BLOCK");
            options.readFrames=static_cast<uint32_t>(block);
        }
        if(info.Length()>3){
            if(!info[3].IsFunction())throw std::runtime_error("INVALID_ANALYSIS_PROGRESS");
            const auto callback=info[3].As<Napi::Function>();
            options.progress=[callback,env=info.Env(),last=std::chrono::steady_clock::now()](uint64_t current,uint64_t total)mutable{
                const auto now=std::chrono::steady_clock::now();
                if(current!=total&&now-last<std::chrono::milliseconds(100))return;last=now;
                callback.Call({Napi::String::New(env,std::to_string(current)),Napi::String::New(env,std::to_string(total))});
            };
        }
        if(info.Length()>4&&!info[4].IsNull()&&!info[4].IsUndefined()){
            if(!info[4].IsObject()||info[4].IsArray())throw std::runtime_error("INVALID_ANALYSIS_RANGE");
            const auto range=info[4].As<Napi::Object>();
            if(range.GetPropertyNames().Length()!=2)throw std::runtime_error("INVALID_ANALYSIS_RANGE");
            auto u64=[](Napi::Value value){
                if(!value.IsString())throw std::runtime_error("INVALID_ANALYSIS_RANGE");
                const auto text=value.As<Napi::String>().Utf8Value();
                if(text.empty()||text.size()>20||text.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("INVALID_ANALYSIS_RANGE");
                try{return std::stoull(text);}catch(...){throw std::runtime_error("INVALID_ANALYSIS_RANGE");}
            };
            options.startFrame=u64(range.Get("startFrame"));options.endFrame=u64(range.Get("endFrame"));
            if(options.endFrame==UINT64_MAX||options.endFrame<=options.startFrame)throw std::runtime_error("INVALID_ANALYSIS_RANGE");
        }
        const auto result=Trace::analyzeFiles(sources,directory,options);auto env=info.Env();auto value=Napi::Object::New(env);
        value.Set("schemaVersion",Trace::kAnalysisSchema);value.Set("measurementConfigId",Trace::kMeasurementConfigId);
        value.Set("sampleRate",result.sampleRate);value.Set("channelCount",result.channels);frame(value,"frames",result.frames);
        auto streams=Napi::Array::New(env,result.streams.size());
        for(size_t i=0;i<result.streams.size();++i){const auto& s=result.streams[i];auto item=Napi::Object::New(env);
            item.Set("file",s.file);item.Set("kind",s.kind);item.Set("recordBytes",s.recordBytes);item.Set("stride",s.stride);
            frame(item,"records",s.records);frame(item,"pages",s.pages);streams.Set(static_cast<uint32_t>(i),item);}
        value.Set("streams",streams);
        auto summary=Napi::Object::New(env);auto channels=Napi::Array::New(env,result.channels);
        for(uint32_t c=0;c<result.channels;++c){auto channel=Napi::Object::New(env);
            channel.Set("samplePeak",metric(env,result.summary.channels[c].peak,"dBFS"));channel.Set("rms",metric(env,result.summary.channels[c].rms,"dBFS"));
            channel.Set("truePeak",metric(env,result.summary.channels[c].truePeak,"dBTP"));channels.Set(c,channel);}
        summary.Set("channels",channels);summary.Set("momentary",metric(env,result.summary.momentary,"LUFS"));
        summary.Set("shortTerm",metric(env,result.summary.shortTerm,"LUFS"));summary.Set("integratedToCursor",metric(env,result.summary.integrated,"LUFS"));
        summary.Set("loudnessRange",metric(env,result.summary.range,"LU"));summary.Set("maxTruePeak",metric(env,result.summary.maxTruePeak,"dBTP"));
        frame(summary,"levelIndexFrame",result.summary.frame);frame(summary,"loudnessIndexFrame",result.summary.loudnessFrame);
        value.Set("summary",summary);return value;
    });
}
Napi::Value publishNewFile(const Napi::CallbackInfo& info){
    return guard(info,[&]()->Napi::Value{
        if(info.Length()!=2||!info[0].IsString()||!info[1].IsString())throw std::runtime_error("INVALID_PUBLISH_PATH");
        const auto source=info[0].As<Napi::String>().Utf8Value(),target=info[1].As<Napi::String>().Utf8Value();
        if(source.empty()||target.empty()||source.find('\0')!=std::string::npos||target.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_PUBLISH_PATH");
        Trace::publishNewFile(std::filesystem::u8path(source),std::filesystem::u8path(target));return info.Env().Undefined();
    });
}
Napi::Value runtimeModules(const Napi::CallbackInfo& info){
    auto output=Napi::Object::New(info.Env());
    for(const auto* name:{L"msvcp140.dll",L"vcruntime140.dll",L"vcruntime140_1.dll"}){
        const auto module=GetModuleHandleW(name);std::vector<wchar_t> path(32768);const auto count=module?GetModuleFileNameW(module,path.data(),static_cast<DWORD>(path.size())):0;
        auto key=Napi::String::New(info.Env(),reinterpret_cast<const char16_t*>(name));
        if(count)output.Set(key,Napi::String::New(info.Env(),reinterpret_cast<const char16_t*>(path.data()),count));else output.Set(key,info.Env().Null());
    }
    return output;
}
uint64_t replayFrame(Napi::Value value){
 if(!value.IsString())throw std::runtime_error("INVALID_REPLAY_FRAME");const auto s=value.As<Napi::String>().Utf8Value();
 if(s.empty()||s.size()>20||s.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("INVALID_REPLAY_FRAME");
 try{return std::stoull(s);}catch(...){throw std::runtime_error("INVALID_REPLAY_FRAME");}
}
Napi::Value replayFreeze(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{
 if(info.Length()>1||(info.Length()&&!info[0].IsBoolean()))throw std::runtime_error("INVALID_REPLAY_REQUEST");const auto clip=engine().freezeReplay(info.Length()&&info[0].As<Napi::Boolean>().Value());auto out=Napi::Object::New(info.Env());
 frame(out,"captureStartFrame",clip->captureStartFrame);out.Set("sourceId",clip->sourceId);frame(out,"epochId",clip->captureEpoch);frame(out,"measurementEpoch",clip->measurementEpoch);out.Set("version",2);frame(out,"frames",clip->frames());frame(out,"originFrame",clip->originFrame);out.Set("sampleRate",clip->format.sampleRate);out.Set("channelCount",clip->format.channels);return out;
});}
Napi::Value replayRelease(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{if(info.Length())throw std::runtime_error("INVALID_REPLAY_REQUEST");engine().releaseReplay();return info.Env().Undefined();});}
Napi::Value replayOpen(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{
 if(info.Length()!=2||!info[0].IsString()||!info[1].IsString())throw std::runtime_error("INVALID_REPLAY_REQUEST");
 const auto id=info[0].As<Napi::String>().Utf8Value(),device=info[1].As<Napi::String>().Utf8Value();
 if(id.empty()||id.size()>128||device.empty()||device.size()>1024||id.find('\0')!=std::string::npos||device.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_REPLAY_REQUEST");
 return Trace::openReplayPlayback(info.Env(),id,device,engine().frozenReplay());
});}
Napi::Value replayView(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{
 if(info.Length()!=4||!info[3].IsNumber())throw std::runtime_error("INVALID_REPLAY_REQUEST");
 const auto width=info[3].As<Napi::Number>().DoubleValue();if(!std::isfinite(width)||std::floor(width)!=width||width<0||width>2400)throw std::runtime_error("INVALID_REPLAY_WIDTH");
 const auto clip=engine().frozenReplay();const auto view=clip->view(replayFrame(info[0]),replayFrame(info[1]),replayFrame(info[2]),static_cast<size_t>(width));
 Trace::RecordSnapshot result;result.format=clip->format;result.meters=view.meters;result.waveform=view.waveform;result.loudness=view.loudness;
 const auto output=recordObject(info.Env(),result);auto out=Napi::Object::New(info.Env());out.Set("metrics",output.Get("meters"));out.Set("waveform",output.Get("waveform"));out.Set("loudnessHistory",output.Get("loudnessHistory"));return out;
});}
class ReplayRangeWorker:public Napi::AsyncWorker{
 Napi::Promise::Deferred result_;std::shared_ptr<const Trace::ReplayClip> clip_;uint64_t start_,end_;Trace::RecordSnapshot value_;
public:
 ReplayRangeWorker(Napi::Env env,std::shared_ptr<const Trace::ReplayClip> clip,uint64_t start,uint64_t end):Napi::AsyncWorker(env),result_(Napi::Promise::Deferred::New(env)),clip_(std::move(clip)),start_(start),end_(end){}
 Napi::Promise promise(){return result_.Promise();}
 void Execute()override{try{value_.format=clip_->format;value_.meters=clip_->analyze(start_,end_);}catch(const std::exception& e){SetError(e.what());}}
 void OnOK()override{result_.Resolve(recordObject(Env(),value_).Get("meters"));}
 void OnError(const Napi::Error& error)override{result_.Reject(error.Value());}
};
Napi::Value replayAnalyze(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{
 if(info.Length()!=2)throw std::runtime_error("INVALID_REPLAY_REQUEST");const auto a=replayFrame(info[0]),b=replayFrame(info[1]);const auto clip=engine().frozenReplay();
 if(a>=b||b>clip->frames())throw std::runtime_error("INVALID_REPLAY_SELECTION");
 auto* worker=new ReplayRangeWorker(info.Env(),clip,a,b);const auto promise=worker->promise();worker->Queue();return promise;
});}

class ReplaySaveWorker:public Napi::AsyncWorker{
 Napi::Promise::Deferred result_;std::shared_ptr<const Trace::ReplayClip> clip_;
 std::filesystem::path base_,journal_;Trace::WavEncoding encoding_;uint64_t start_,end_;Trace::WavConversion value_;
public:
 ReplaySaveWorker(Napi::Env env,std::shared_ptr<const Trace::ReplayClip> clip,std::filesystem::path base,std::filesystem::path journal,Trace::WavEncoding encoding,uint64_t start,uint64_t end)
  :Napi::AsyncWorker(env),result_(Napi::Promise::Deferred::New(env)),clip_(std::move(clip)),base_(std::move(base)),journal_(std::move(journal)),encoding_(encoding),start_(start),end_(end){}
 Napi::Promise promise(){return result_.Promise();}
 void Execute()override{try{value_=Trace::saveReplay(*clip_,base_,journal_,encoding_,start_,end_);}catch(const std::exception& error){SetError(error.what());}}
 void OnOK()override{
  auto value=format(Env(),value_.format);frame(value,"frames",value_.frames);frame(value,"clippedSamples",value_.clippedSamples);
  value.Set("encoding",encoding_==Trace::WavEncoding::Pcm16?"pcm16":encoding_==Trace::WavEncoding::Pcm24?"pcm24":"float32");
  auto segments=Napi::Array::New(Env(),value_.segments.size());
  for(size_t i=0;i<value_.segments.size();++i){const auto& s=value_.segments[i];auto part=Napi::Object::New(Env());part.Set("file",s.path.filename().u8string());frame(part,"frames",s.frames);frame(part,"bytes",s.bytes);frame(part,"clippedSamples",s.clippedSamples);segments.Set(static_cast<uint32_t>(i),part);}
  value.Set("segments",segments);result_.Resolve(value);
 }
 void OnError(const Napi::Error& error)override{result_.Reject(error.Value());}
};
Napi::Value replaySave(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{
 if(info.Length()!=1||!info[0].IsObject())throw std::runtime_error("INVALID_REPLAY_SAVE");
 const auto request=info[0].As<Napi::Object>();const auto clip=engine().frozenReplay();
 auto text=[&](const char* key,size_t limit){const auto value=request.Get(key);if(!value.IsString())throw std::runtime_error("INVALID_REPLAY_SAVE");const auto s=value.As<Napi::String>().Utf8Value();if(s.empty()||s.size()>limit||s.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_REPLAY_SAVE");return s;};
 const auto start=replayFrame(request.Get("startFrame")),end=replayFrame(request.Get("endFrame"));
 if(text("sourceId",1024)!=clip->sourceId||replayFrame(request.Get("originFrame"))!=clip->originFrame||replayFrame(request.Get("frames"))!=clip->frames()||
  replayFrame(request.Get("epochId"))!=clip->captureEpoch||replayFrame(request.Get("measurementEpoch"))!=clip->measurementEpoch)throw std::runtime_error("STALE_REPLAY_SOURCE");
 if(start>=end||end>clip->frames())throw std::runtime_error("INVALID_REPLAY_SELECTION");
 const auto base=std::filesystem::u8path(text("basePath",32767)),journal=std::filesystem::u8path(text("journalPath",32767));
 if(!base.is_absolute()||!journal.is_absolute())throw std::runtime_error("INVALID_REPLAY_SAVE_PATH");
 const auto name=text("encoding",16);const auto encoding=name=="pcm16"?Trace::WavEncoding::Pcm16:name=="pcm24"?Trace::WavEncoding::Pcm24:Trace::WavEncoding::Float32;
 if(name!="pcm16"&&name!="pcm24"&&name!="float32")throw std::runtime_error("INVALID_RECORD_ENCODING");
 auto* worker=new ReplaySaveWorker(info.Env(),clip,base,journal,encoding,start,end);const auto promise=worker->promise();worker->Queue();return promise;
});}

Napi::Object init(Napi::Env env,Napi::Object exports) {
    Trace::registerPlayback(env,exports);
    Trace::registerInstruments(env,exports,engine());
    exports.Set("replaySave",Napi::Function::New(env,replaySave));
    exports.Set("replayRelease",Napi::Function::New(env,replayRelease));
    exports.Set("replayFreeze",Napi::Function::New(env,replayFreeze));exports.Set("playbackReplayOpen",Napi::Function::New(env,replayOpen));exports.Set("replayView",Napi::Function::New(env,replayView));exports.Set("replayAnalyze",Napi::Function::New(env,replayAnalyze));
    exports.Set("runtimeModules",Napi::Function::New(env,runtimeModules));
    exports.Set("publishNewFile",Napi::Function::New(env,publishNewFile));
    exports.Set("devices",Napi::Function::New(env,devices));exports.Set("start",Napi::Function::New(env,start));
    exports.Set("stop",Napi::Function::New(env,stop));exports.Set("reset",Napi::Function::New(env,reset));
    exports.Set("snapshot",Napi::Function::New(env,snapshot));
    exports.Set("recordStart",Napi::Function::New(env,recordStart));exports.Set("recordStop",Napi::Function::New(env,recordStop));
    exports.Set("recoverWave",Napi::Function::New(env,recoverWave));
    exports.Set("convertWaves",Napi::Function::New(env,convertWaves));
    exports.Set("analyzeWaves",Napi::Function::New(env,analyzeWaves));
    exports.Set("recordStatus",Napi::Function::New(env,recordStatus));exports.Set("shutdown",Napi::Function::New(env,shutdown));
    env.AddCleanupHook([]{engine().stop(true);});return exports;
}
}
NODE_API_MODULE(trace_engine,init)
