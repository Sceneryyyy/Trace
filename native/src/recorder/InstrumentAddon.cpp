#include "InstrumentAddon.h"
#include "InstrumentAnalysis.h"
#include "SpectrogramTile.h"
#include "WaveSequence.h"
#include <atomic>
#include <chrono>
#include <cmath>
#include <algorithm>
namespace Trace {namespace {
Engine* capture=nullptr;std::atomic<unsigned> pending{0};
uint64_t integer(Napi::Value v){if(!v.IsString())throw std::runtime_error("INVALID_INSTRUMENT_FRAME");const auto s=v.As<Napi::String>().Utf8Value();if(s.empty()||s.size()>20||s.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("INVALID_INSTRUMENT_FRAME");return std::stoull(s);}
std::string text(Napi::Object o,const char* k,size_t max=1024){const auto v=o.Get(k);if(!v.IsString())throw std::runtime_error("INVALID_INSTRUMENT_REQUEST");const auto s=v.As<Napi::String>().Utf8Value();if(s.empty()||s.size()>max||s.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_INSTRUMENT_REQUEST");return s;}
uint32_t number(Napi::Object o,const char* k,uint32_t lo,uint32_t hi){const auto v=o.Get(k);if(!v.IsNumber())throw std::runtime_error("INVALID_INSTRUMENT_CONFIG");const double n=v.As<Napi::Number>();if(!std::isfinite(n)||std::floor(n)!=n||n<lo||n>hi)throw std::runtime_error("INVALID_INSTRUMENT_CONFIG");return static_cast<uint32_t>(n);}
InstrumentConfig configuration(Napi::Object o){InstrumentConfig c;c.fftSize=number(o,"fftSize",512,16384);if(c.fftSize&(c.fftSize-1))throw std::runtime_error("INVALID_INSTRUMENT_CONFIG");c.averageMs=number(o,"averageMs",0,2000);c.holdMs=number(o,"holdMs",0,2000);c.fieldMs=number(o,"fieldMs",50,1000);
 const auto mode=text(o,"channel",16);if(mode=="stereo")c.channel=SpectrumChannel::Stereo;else if(mode=="left")c.channel=SpectrumChannel::Left;else if(mode=="right")c.channel=SpectrumChannel::Right;else if(mode=="mid")c.channel=SpectrumChannel::Mid;else if(mode=="side")c.channel=SpectrumChannel::Side;else throw std::runtime_error("INVALID_INSTRUMENT_CONFIG");return c;}
const char* status(MetricStatus s){switch(s){case MetricStatus::Ready:return "ready";case MetricStatus::Silence:return "silence";case MetricStatus::Gap:return "gap";case MetricStatus::Error:return "error";default:return "insufficient";}}
Napi::Object metric(Napi::Env env,Metric m){auto o=Napi::Object::New(env);o.Set("status",status(m.status));if(m.status==MetricStatus::Ready)o.Set("value",m.value);else o.Set("value",env.Null());return o;}
template<class T>Napi::Float64Array array(Napi::Env env,const T& v){auto a=Napi::Float64Array::New(env,v.size());std::copy(v.begin(),v.end(),a.Data());return a;}
class Worker:public Napi::AsyncWorker{
 Napi::Promise::Deferred promise_;PcmWindow pcm_;std::shared_ptr<const ReplayClip> clip_;std::vector<std::filesystem::path> files_;
 InstrumentConfig config_;uint64_t position_=0,rangeStart_=0,rangeEnd_=UINT64_MAX;uint32_t rate_=0,before_=0;InstrumentAnalysis result_;double elapsed_=0;uint64_t tileFirst_=0;uint32_t tileColumns_=0;SpectrogramTile tile_;
public:
 Worker(Napi::Env env,PcmWindow pcm,std::shared_ptr<const ReplayClip> clip,std::vector<std::filesystem::path> files,InstrumentConfig config,uint64_t position,uint64_t start,uint64_t end,uint32_t rate,uint32_t before,uint64_t tileFirst,uint32_t tileColumns)
 :Napi::AsyncWorker(env),promise_(Napi::Promise::Deferred::New(env)),pcm_(std::move(pcm)),clip_(std::move(clip)),files_(std::move(files)),config_(config),position_(position),rangeStart_(start),rangeEnd_(end),rate_(rate),before_(before),tileFirst_(tileFirst),tileColumns_(tileColumns){++pending;}
 ~Worker(){--pending;}
 Napi::Promise promise(){return promise_.Promise();}
 void Execute()override{try{
  const auto begin=std::chrono::steady_clock::now();
  if(clip_)pcm_=clip_->window(position_,before_);
  else if(!files_.empty()){
   WaveSequence sequence(files_,rangeStart_,rangeEnd_);if(sequence.format().sampleRate!=rate_||position_>sequence.frames())throw std::runtime_error("STALE_INSTRUMENT_SOURCE");
   pcm_.format=sequence.format();pcm_.positionFrame=position_;pcm_.firstFrame=position_>before_?position_-before_:0;const auto count=static_cast<uint32_t>(position_-pcm_.firstFrame);
   pcm_.samples.resize(size_t(count)*pcm_.format.channels);sequence.seek(pcm_.firstFrame);uint32_t read=0;
   while(read<count){const auto n=sequence.read(pcm_.samples.data()+size_t(read)*pcm_.format.channels,count-read);if(!n)throw std::runtime_error("INSTRUMENT_AUDIO_TRUNCATED");read+=n;}
  }
  if(pcm_.format.sampleRate!=rate_)throw std::runtime_error("STALE_INSTRUMENT_SOURCE");
  if(tileColumns_){tile_=makeSpectrogramTile(pcm_,tileFirst_,tileColumns_,config_);elapsed_=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count();return;}
  result_=analyzeInstruments(pcm_.samples.data(),static_cast<uint32_t>(pcm_.samples.size()/pcm_.format.channels),rate_,pcm_.format.channels,pcm_.firstFrame,position_,config_);
  if(pcm_.gap){result_.status=MetricStatus::Gap;result_.field.correlation.status=result_.field.balance.status=MetricStatus::Gap;result_.current.clear();result_.average.clear();result_.peakHold.clear();result_.field.points.clear();}
  elapsed_=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count();
 }catch(const std::exception& e){SetError(e.what());}}
 void OnOK()override{
  auto env=Env();auto o=Napi::Object::New(env);
  if(tileColumns_){o.Set("firstFrame",std::to_string(tile_.firstFrame));o.Set("columns",tile_.columns);o.Set("fftSize",tile_.fftSize);o.Set("bins",tile_.bins);o.Set("hop",tile_.hop);o.Set("sampleRate",tile_.sampleRate);o.Set("channels",tile_.channels);
   auto db=Napi::Float32Array::New(env,tile_.decibels.size());std::copy(tile_.decibels.begin(),tile_.decibels.end(),db.Data());auto masks=Napi::Uint8Array::New(env,tile_.status.size());std::copy(tile_.status.begin(),tile_.status.end(),masks.Data());o.Set("decibels",db);o.Set("status",masks);o.Set("elapsedMs",elapsed_);promise_.Resolve(o);return;}
  o.Set("status",status(result_.status));o.Set("sampleRate",rate_);o.Set("channelCount",pcm_.format.channels);o.Set("positionFrame",std::to_string(position_));o.Set("windowStart",std::to_string(result_.windowStart));
  o.Set("fftSize",result_.fftSize);o.Set("hop",result_.hop);o.Set("binHz",result_.binHz);o.Set("averageWindows",result_.averageWindows);o.Set("holdWindows",result_.holdWindows);o.Set("partialAverage",result_.partialAverage);o.Set("partialHold",result_.partialHold);
  o.Set("current",array(env,result_.current));o.Set("average",array(env,result_.average));o.Set("peakHold",array(env,result_.peakHold));o.Set("elapsedMs",elapsed_);
  auto f=Napi::Object::New(env);f.Set("correlation",metric(env,result_.field.correlation));f.Set("balance",metric(env,result_.field.balance));f.Set("firstFrame",std::to_string(result_.field.firstFrame));f.Set("endFrame",std::to_string(result_.field.endFrame));f.Set("partial",result_.field.partial);
  auto points=Napi::Float32Array::New(env,result_.field.points.size()*4);for(size_t i=0;i<result_.field.points.size();++i){const auto& p=result_.field.points[i];points[i*4]=p.x;points[i*4+1]=p.y;points[i*4+2]=float(position_-p.frame)/rate_;points[i*4+3]=p.clipped?1.0f:0.0f;}
  f.Set("points",points);f.Set("polarRms",array(env,result_.field.polarRms));f.Set("polarPeak",array(env,result_.field.polarPeak));f.Set("polarEnvelope",array(env,result_.field.polarEnvelope));o.Set("field",f);promise_.Resolve(o);
 }
 void OnError(const Napi::Error& e)override{promise_.Reject(e.Value());}
};
Napi::Value execute(const Napi::CallbackInfo& info,bool tiled){try{
 if(info.Length()!=1||!info[0].IsObject())throw std::runtime_error("INVALID_INSTRUMENT_REQUEST");
 const auto req=info[0].As<Napi::Object>();if(!req.Get("config").IsObject())throw std::runtime_error("INVALID_INSTRUMENT_CONFIG");const auto c=configuration(req.Get("config").As<Napi::Object>());
 const auto kind=text(req,"kind",16);const auto rate=number(req,"sampleRate",8000,96000);const auto position=integer(req.Get("positionFrame"));uint32_t before=std::max(c.fftSize+rate*std::max(c.averageMs,c.holdMs)/1000,rate*c.fieldMs/1000);
 uint64_t tileFirst=0;uint32_t columns=0;
 if(tiled){tileFirst=integer(req.Get("firstFrame"));columns=number(req,"columns",1,64);const auto hop=std::min(c.fftSize/4,std::max(1u,rate/50));const uint64_t span=uint64_t(columns-1)*hop;if(tileFirst>UINT64_MAX-span||position!=tileFirst+span)throw std::runtime_error("INVALID_SPECTROGRAM_RANGE");before=c.fftSize+static_cast<uint32_t>(span);}
 if(pending>=2)throw std::runtime_error("INSTRUMENT_QUEUE_FULL");
 PcmWindow pcm;std::shared_ptr<const ReplayClip> clip;std::vector<std::filesystem::path> files;uint64_t start=0,end=UINT64_MAX;
 if(kind=="live"||kind=="take")pcm=capture->instrumentWindow(text(req,"sourceId"),integer(req.Get("epochId")),integer(req.Get("measurementEpoch")),position,before,kind=="take");
 else if(kind=="replay"){
  clip=capture->frozenReplay();if(text(req,"sourceId")!=clip->sourceId||integer(req.Get("originFrame"))!=clip->originFrame||integer(req.Get("frames"))!=clip->frames()||integer(req.Get("epochId"))!=clip->captureEpoch||integer(req.Get("measurementEpoch"))!=clip->measurementEpoch)throw std::runtime_error("STALE_INSTRUMENT_SOURCE");
 }else if(kind=="file"){
  if(!req.Get("sources").IsArray())throw std::runtime_error("INVALID_INSTRUMENT_FILES");const auto list=req.Get("sources").As<Napi::Array>();if(list.Length()==0||list.Length()>2048)throw std::runtime_error("INVALID_INSTRUMENT_FILES");
  for(uint32_t i=0;i<list.Length();++i){if(!list.Get(i).IsString())throw std::runtime_error("INVALID_INSTRUMENT_FILES");const auto s=list.Get(i).As<Napi::String>().Utf8Value();if(s.empty()||s.size()>32767||s.find('\0')!=std::string::npos)throw std::runtime_error("INVALID_INSTRUMENT_FILES");const auto p=std::filesystem::u8path(s);if(!p.is_absolute())throw std::runtime_error("INVALID_INSTRUMENT_FILES");files.push_back(p);}
  if(req.Has("startFrame")){start=integer(req.Get("startFrame"));end=integer(req.Get("endFrame"));if(end<=start)throw std::runtime_error("INVALID_INSTRUMENT_RANGE");}
 }else throw std::runtime_error("INVALID_INSTRUMENT_SOURCE");
 auto* worker=new Worker(info.Env(),std::move(pcm),std::move(clip),std::move(files),c,position,start,end,rate,before,tileFirst,columns);const auto promise=worker->promise();worker->Queue();return promise;
 }catch(const std::exception& e){Napi::Error::New(info.Env(),e.what()).ThrowAsJavaScriptException();return info.Env().Undefined();}}
}
void registerInstruments(Napi::Env env,Napi::Object exports,Engine& engine){capture=&engine;exports.Set("instrumentAnalyze",Napi::Function::New(env,[](const Napi::CallbackInfo& i){return execute(i,false);}));exports.Set("spectrogramTile",Napi::Function::New(env,[](const Napi::CallbackInfo& i){return execute(i,true);}));}
}
