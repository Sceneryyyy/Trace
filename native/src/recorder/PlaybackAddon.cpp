#include "PlaybackAddon.h"
#include "Playback.h"
#include <functional>
#include <atomic>
#include <mutex>
#include <stdexcept>
namespace Trace {
namespace {
Playback& playback(){static Playback value;return value;}
std::atomic<uint64_t> lifecycleIntent{0};
std::mutex lifecycleDispatch;
Napi::Value guard(const Napi::CallbackInfo& info,const std::function<Napi::Value()>& action){
    try{return action();}catch(const std::exception& error){Napi::Error::New(info.Env(),error.what()).ThrowAsJavaScriptException();return info.Env().Undefined();}
}
std::string text(Napi::Value value,size_t maximum){
    if(!value.IsString())throw std::runtime_error("INVALID_PLAYBACK_TEXT");
    auto s=value.As<Napi::String>().Utf8Value();
    if(s.empty()||s.size()>maximum||s.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_PLAYBACK_TEXT");return s;
}
uint64_t frame(Napi::Value value){
    const auto s=text(value,20);if(s.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("INVALID_PLAYBACK_FRAME");
    try{return std::stoull(s);}catch(...){throw std::runtime_error("INVALID_PLAYBACK_FRAME");}
}
Napi::Object object(Napi::Env env,const PlaybackSnapshot& s){
    auto out=Napi::Object::New(env);out.Set("id",s.id);out.Set("deviceId",s.deviceId);out.Set("phase",s.phase);
    if(s.error.empty())out.Set("error",env.Null());else out.Set("error",s.error);
    auto format=Napi::Object::New(env);format.Set("sampleRate",s.format.sampleRate);format.Set("channelCount",s.format.channels);
    format.Set("containerBits",s.format.containerBits);format.Set("validBits",s.format.validBits);format.Set("blockAlign",s.format.blockAlign);
    format.Set("channelMask",s.format.channelMask);format.Set("encoding",s.format.floatingPoint?"ieee-float":"pcm-int");out.Set("format",format);
    auto u64=[&](const char* key,uint64_t value){out.Set(key,std::to_string(value));};
    u64("generation",s.generation);u64("positionFrame",s.positionFrame);u64("totalFrames",s.totalFrames);
    u64("presentedStreamFrames",s.presentedStreamFrames);u64("submittedFrames",s.submittedFrames);u64("clockPosition",s.clockPosition);
    u64("clockFrequency",s.clockFrequency);u64("clockQpc100ns",s.clockQpc100ns);u64("loopStart",s.loopStart);u64("loopEnd",s.loopEnd);u64("loops",s.loops);
    out.Set("outputRate",s.outputRate);out.Set("outputChannels",s.outputChannels);out.Set("bufferFrames",s.bufferFrames);out.Set("paddingFrames",s.paddingFrames);
    out.Set("queueDepth",static_cast<double>(s.queueDepth));out.Set("queueHighWater",static_cast<double>(s.queueHighWater));
    out.Set("rawModeApplied",s.rawModeApplied);out.Set("playing",s.playing);out.Set("loop",s.loop);out.Set("clockAccurate",s.clockAccurate);return out;
}
class LifecycleWorker:public Napi::AsyncWorker {
    Napi::Promise::Deferred result_;
    PlaybackOptions options_;
    PlaybackSnapshot snapshot_;
    bool close_;
    uint64_t ticket_;
public:
    LifecycleWorker(Napi::Env env,PlaybackOptions options,bool close):Napi::AsyncWorker(env),result_(Napi::Promise::Deferred::New(env)),options_(std::move(options)),close_(close),ticket_(++lifecycleIntent){}
    Napi::Promise promise(){return result_.Promise();}
    void Execute() override {
        try{
            std::lock_guard<std::mutex> lock(lifecycleDispatch);
            if(ticket_!=lifecycleIntent){if(close_)return;throw std::runtime_error("PLAYBACK_OPEN_CANCELLED");}
            if(close_){playback().close();snapshot_=playback().snapshot();}
            else{
                snapshot_=playback().open(std::move(options_));
                if(ticket_!=lifecycleIntent){playback().close();throw std::runtime_error("PLAYBACK_OPEN_CANCELLED");}
            }
        }catch(const std::exception& error){SetError(error.what());}
    }
    void OnOK() override {result_.Resolve(object(Env(),snapshot_));}
    void OnError(const Napi::Error& error) override {result_.Reject(error.Value());}
};
Napi::Value open(const Napi::CallbackInfo& info){
    return guard(info,[&]()->Napi::Value{
        if((info.Length()<3||info.Length()>5)||!info[1].IsArray())throw std::runtime_error("INVALID_PLAYBACK_OPEN");
        PlaybackOptions options;if(info.Length()>3&&!info[3].IsUndefined()){if(!info[3].IsBoolean())throw std::runtime_error("INVALID_PLAYBACK_MODE");options.rawMode=info[3].As<Napi::Boolean>().Value();}options.id=text(info[0],256);options.deviceId=text(info[2],1024);
        if(info.Length()>4&&!info[4].IsUndefined()){
            if(!info[4].IsObject()||info[4].IsArray())throw std::runtime_error("INVALID_PLAYBACK_SOURCE_RANGE");
            const auto range=info[4].As<Napi::Object>();if(range.GetPropertyNames().Length()!=2)throw std::runtime_error("INVALID_PLAYBACK_SOURCE_RANGE");
            options.startFrame=frame(range.Get("startFrame"));options.endFrame=frame(range.Get("endFrame"));
            if(options.endFrame<=options.startFrame)throw std::runtime_error("INVALID_PLAYBACK_SOURCE_RANGE");
        }
        const auto files=info[1].As<Napi::Array>();if(!files.Length()||files.Length()>10000)throw std::runtime_error("INVALID_PLAYBACK_SOURCES");
        for(uint32_t i=0;i<files.Length();++i)options.sources.push_back(std::filesystem::u8path(text(files.Get(i),32767)));
        auto* worker=new LifecycleWorker(info.Env(),std::move(options),false);auto result=worker->promise();worker->Queue();return result;
    });
}
Napi::Value close(const Napi::CallbackInfo& info){
    return guard(info,[&]()->Napi::Value{if(info.Length())throw std::runtime_error("INVALID_PLAYBACK_CLOSE");auto* worker=new LifecycleWorker(info.Env(),{},true);auto result=worker->promise();worker->Queue();return result;});
}
Napi::Value play(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{if(info.Length())throw std::runtime_error("INVALID_PLAYBACK_PLAY");playback().play();return object(info.Env(),playback().snapshot());});}
Napi::Value pause(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{if(info.Length())throw std::runtime_error("INVALID_PLAYBACK_PAUSE");playback().pause();return object(info.Env(),playback().snapshot());});}
Napi::Value seek(const Napi::CallbackInfo& info){
    return guard(info,[&]()->Napi::Value{
        if(info.Length()!=5||!info[1].IsBoolean()||!info[2].IsBoolean())throw std::runtime_error("INVALID_PLAYBACK_SEEK");
        const auto generation=playback().seek(frame(info[0]),info[1].As<Napi::Boolean>().Value(),info[2].As<Napi::Boolean>().Value(),frame(info[3]),frame(info[4]));
        return Napi::String::New(info.Env(),std::to_string(generation));
    });
}
Napi::Value volume(const Napi::CallbackInfo& info){
    return guard(info,[&]()->Napi::Value{if(info.Length()!=1||!info[0].IsNumber())throw std::runtime_error("INVALID_PLAYBACK_VOLUME");playback().volume(info[0].As<Napi::Number>().FloatValue());return info.Env().Undefined();});
}
Napi::Value snapshot(const Napi::CallbackInfo& info){return guard(info,[&]()->Napi::Value{if(info.Length())throw std::runtime_error("INVALID_PLAYBACK_SNAPSHOT");return object(info.Env(),playback().snapshot());});}
}
Napi::Value openReplayPlayback(Napi::Env env,const std::string& id,const std::string& device,std::shared_ptr<const ReplayClip> memory){PlaybackOptions options;options.id=id;options.deviceId=device;options.memory=std::move(memory);auto* worker=new LifecycleWorker(env,std::move(options),false);auto result=worker->promise();worker->Queue();return result;}
void registerPlayback(Napi::Env env,Napi::Object exports){
    exports.Set("playbackOpen",Napi::Function::New(env,open));exports.Set("playbackClose",Napi::Function::New(env,close));
    exports.Set("playbackPlay",Napi::Function::New(env,play));exports.Set("playbackPause",Napi::Function::New(env,pause));
    exports.Set("playbackSeek",Napi::Function::New(env,seek));exports.Set("playbackVolume",Napi::Function::New(env,volume));
    exports.Set("playbackSnapshot",Napi::Function::New(env,snapshot));
    env.AddCleanupHook([]{++lifecycleIntent;std::lock_guard<std::mutex> lock(lifecycleDispatch);playback().close();});
}
}
