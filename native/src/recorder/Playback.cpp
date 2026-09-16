#include "Playback.h"
#include "PlaybackTimeline.h"
#include "WaveSequence.h"
#include "SpscQueue.h"
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <avrt.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <thread>
namespace Trace {
namespace {
using Microsoft::WRL::ComPtr;
void check(HRESULT result,const char* operation){
    if(FAILED(result)){std::ostringstream text;text<<operation<<" (0x"<<std::hex<<static_cast<unsigned long>(result)<<")";throw std::runtime_error(text.str());}
}
std::wstring wide(const std::string& text){
    const auto count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),nullptr,0);
    if(count<=0)throw std::runtime_error("INVALID_PLAYBACK_DEVICE");
    std::wstring value(count,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),static_cast<int>(text.size()),value.data(),count);return value;
}
struct ComScope {
    HRESULT result=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
    ComScope(){check(result,"PLAYBACK_COM_FAILED");}
    ~ComScope(){if(SUCCEEDED(result))CoUninitialize();}
};
struct Event {
    HANDLE value=CreateEventW(nullptr,FALSE,FALSE,nullptr);
    Event(){if(!value)throw std::runtime_error("PLAYBACK_EVENT_FAILED");}
    ~Event(){CloseHandle(value);}
};
struct PlaybackBlock {
    uint64_t generation=0,streamFrame=0;
    uint32_t frames=0;
    std::array<float,kBlockFrames*2> samples{};
};
}
struct Playback::Impl {
    using Queue=SpscQueue<PlaybackBlock,64>;
    std::unique_ptr<Queue> queue;
    std::unique_ptr<WaveSequence> sequence;
    std::thread decoder,renderer;
    Event control;
    std::mutex lifecycle,command,startup;
    mutable std::mutex publication;
    std::condition_variable ready;
    PlaybackPlan requested;
    bool wanted=false,startupDone=false;
    uint64_t nextGeneration=0;
    std::atomic<bool> stopping{true},accepting{false};
    std::atomic<uint64_t> decoderEof{0},total{0};
    std::atomic<size_t> highWater{0};
    std::atomic<float> gain{1};
    PlaybackSnapshot published;
    PlaybackOptions options;
    void announce(){
        {std::lock_guard<std::mutex> lock(startup);startupDone=true;}
        ready.notify_all();
    }
    void fail(const std::string& error){
        stopping=true;accepting=false;
        {std::lock_guard<std::mutex> lock(publication);if(published.error.empty())published.error=error;published.phase="failed";published.playing=false;}
        SetEvent(control.value);announce();
    }
    PlaybackSnapshot snapshot() const {std::lock_guard<std::mutex> lock(publication);return published;}
    void publish(PlaybackSnapshot& value){
        value.queueDepth=queue->size();value.queueHighWater=highWater;
        std::lock_guard<std::mutex> lock(publication);
        if(published.error.empty())published=value;
    }
    PlaybackPlan plan(){
        std::lock_guard<std::mutex> lock(command);return requested;
    }
    void closeUnlocked(){
        accepting=false;stopping=true;SetEvent(control.value);
        if(renderer.joinable())renderer.join();
        if(decoder.joinable())decoder.join();
        sequence.reset();options.memory.reset();queue.reset();total=0;
        {std::lock_guard<std::mutex> lock(publication);published={};}
    }
    void decode(){
        try{
            PlaybackPlan active;uint64_t stream=0;
            std::array<float,kBlockFrames*2> loopSamples{};
            bool cachedLoop=false;
            while(!stopping){
                const auto next=plan();
                if(active.generation!=next.generation){
                    active=next;stream=0;cachedLoop=active.loop&&active.loopEnd-active.loopStart<=kBlockFrames;
                    if(cachedLoop){
                        sequence->seek(active.loopStart);
                        const auto count=static_cast<uint32_t>(active.loopEnd-active.loopStart);
                        if(sequence->read(loopSamples.data(),count)!=count)throw std::runtime_error("PLAYBACK_LOOP_TRUNCATED");
                    }
                }
                if(!active.remaining(stream)){decoderEof=active.generation;std::this_thread::sleep_for(std::chrono::milliseconds(1));continue;}
                auto* block=queue->write();
                if(!block){std::this_thread::sleep_for(std::chrono::milliseconds(1));continue;}
                block->generation=active.generation;block->streamFrame=stream;
                const auto target=static_cast<uint32_t>(std::min<uint64_t>(kBlockFrames,active.remaining(stream)));
                block->frames=target;
                const auto channels=sequence->format().channels;
                if(cachedLoop){
                    const auto length=active.loopEnd-active.loopStart;
                    for(uint32_t frame=0;frame<target;++frame){
                        const auto source=(active.fileFrame(stream+frame)-active.loopStart)%length;
                        for(uint32_t ch=0;ch<channels;++ch)block->samples[frame*channels+ch]=loopSamples[source*channels+ch];
                    }
                }else{
                    uint32_t done=0;
                    while(done<target){
                        const auto position=active.fileFrame(stream+done);
                        const auto end=active.loop?active.loopEnd:active.totalFrames;
                        const auto count=static_cast<uint32_t>(std::min<uint64_t>(target-done,end-position));
                        sequence->seek(position);
                        if(sequence->read(block->samples.data()+done*channels,count)!=count)throw std::runtime_error("PLAYBACK_FILE_TRUNCATED");
                        done+=count;
                    }
                }
                for(size_t i=0;i<static_cast<size_t>(target)*channels;++i)
                    if(!std::isfinite(block->samples[i]))throw std::runtime_error("PLAYBACK_NONFINITE_AUDIO");
                if(options.decoderDelayMs)std::this_thread::sleep_for(std::chrono::milliseconds(options.decoderDelayMs));
                queue->publish();stream+=target;
                highWater=std::max(highWater.load(),queue->size());
                if(!active.remaining(stream))decoderEof=active.generation;
            }
        }catch(const std::exception& error){fail(error.what());}
    }
    void render(){
        std::unique_ptr<ComScope> com;
        ComPtr<IAudioClient> client;
        bool running=false;
        try{
            com=std::make_unique<ComScope>();
            ComPtr<IMMDeviceEnumerator> enumerator;
            check(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator)),"PLAYBACK_ENUMERATION_FAILED");
            ComPtr<IMMDevice> device;
            check(enumerator->GetDevice(wide(options.deviceId).c_str(),&device),"PLAYBACK_DEVICE_UNAVAILABLE");
            check(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())),"PLAYBACK_ACTIVATE_FAILED");
            WAVEFORMATEX* mix=nullptr;
            check(client->GetMixFormat(&mix),"PLAYBACK_MIX_FORMAT_FAILED");
            auto value=snapshot();value.outputRate=mix->nSamplesPerSec;value.outputChannels=mix->nChannels;CoTaskMemFree(mix);
            const auto configureMedia=[&](bool raw){
                ComPtr<IAudioClient2> advanced;
                const auto query=client.As(&advanced);if(FAILED(query))return query;
                AudioClientProperties properties{};properties.cbSize=sizeof(properties);properties.eCategory=AudioCategory_Media;
                properties.Options=raw?AUDCLNT_STREAMOPTIONS_RAW:AUDCLNT_STREAMOPTIONS_NONE;
                return advanced->SetClientProperties(&properties);
            };
            const auto configured=configureMedia(options.rawMode);
            value.rawModeApplied=options.rawMode&&SUCCEEDED(configured);
            if(options.rawMode&&FAILED(configured)){
                client.Reset();check(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())),"PLAYBACK_ACTIVATE_FAILED");
                configureMedia(false);
            }
            const auto rate=value.format.sampleRate,channels=value.format.channels;
            WAVEFORMATEX format{};format.wFormatTag=WAVE_FORMAT_IEEE_FLOAT;format.nChannels=static_cast<WORD>(channels);
            format.nSamplesPerSec=rate;format.wBitsPerSample=32;format.nBlockAlign=static_cast<WORD>(channels*4);format.nAvgBytesPerSec=rate*format.nBlockAlign;
            Event audioReady;
            const DWORD flags=AUDCLNT_STREAMFLAGS_EVENTCALLBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM|AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY|AUDCLNT_STREAMFLAGS_NOPERSIST;
            auto initialized=client->Initialize(AUDCLNT_SHAREMODE_SHARED,flags,1000000,0,&format,nullptr);
            if(FAILED(initialized)&&value.rawModeApplied){
                client.Reset();value.rawModeApplied=false;
                check(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())),"PLAYBACK_ACTIVATE_FAILED");
                configureMedia(false);
                initialized=client->Initialize(AUDCLNT_SHAREMODE_SHARED,flags,1000000,0,&format,nullptr);
            }
            check(initialized,"PLAYBACK_INITIALIZE_FAILED");
            check(client->SetEventHandle(audioReady.value),"PLAYBACK_EVENT_HANDLE_FAILED");
            check(client->GetBufferSize(&value.bufferFrames),"PLAYBACK_BUFFER_SIZE_FAILED");
            if(!value.bufferFrames||value.bufferFrames>rate*2)throw std::runtime_error("PLAYBACK_BUFFER_OUT_OF_RANGE");
            ComPtr<IAudioRenderClient> output;ComPtr<IAudioClock> clock;
            check(client->GetService(IID_PPV_ARGS(&output)),"PLAYBACK_RENDER_SERVICE_FAILED");
            check(client->GetService(IID_PPV_ARGS(&clock)),"PLAYBACK_CLOCK_SERVICE_FAILED");
            check(clock->GetFrequency(&value.clockFrequency),"PLAYBACK_CLOCK_FREQUENCY_FAILED");
            if(!value.clockFrequency)throw std::runtime_error("PLAYBACK_CLOCK_FREQUENCY_ZERO");
            std::vector<float> staging(static_cast<size_t>(value.bufferFrames)*channels);
            DWORD taskIndex=0;struct Priority {HANDLE task;~Priority(){if(task)AvRevertMmThreadCharacteristics(task);}};
            Priority priority{AvSetMmThreadCharacteristicsW(L"Audio",&taskIndex)};
            PlaybackPlan active;uint32_t blockOffset=0;
            publish(value);announce();
            const HANDLE events[]{control.value,audioReady.value};
            while(!stopping){
                PlaybackPlan next;bool play;
                {std::lock_guard<std::mutex> lock(command);next=requested;play=wanted;}
                if(next.generation!=active.generation){
                    check(client->Stop(),"PLAYBACK_STOP_FAILED");running=false;
                    check(client->Reset(),"PLAYBACK_RESET_FAILED");
                    active=next;blockOffset=0;
                    value.generation=active.generation;value.positionFrame=active.position;value.loop=active.loop;
                    value.loopStart=active.loopStart;value.loopEnd=active.loopEnd;value.loops=0;
                    value.submittedFrames=0;value.presentedStreamFrames=0;value.clockPosition=0;value.clockQpc100ns=0;value.paddingFrames=0;value.clockAccurate=false;
                }
                if(running&&!play){check(client->Stop(),"PLAYBACK_PAUSE_FAILED");running=false;}
                auto clockResult=clock->GetPosition(&value.clockPosition,&value.clockQpc100ns);
                if(clockResult==S_FALSE)clockResult=clock->GetPosition(&value.clockPosition,&value.clockQpc100ns);
                check(clockResult,"PLAYBACK_CLOCK_FAILED");value.clockAccurate=clockResult==S_OK;
                const auto presented=playbackMulDiv(value.clockPosition,rate,value.clockFrequency);
                value.presentedStreamFrames=std::min(presented,value.submittedFrames);
                value.positionFrame=active.fileFrame(value.presentedStreamFrames);value.loops=active.loopsAt(value.presentedStreamFrames);
                const bool ended=!active.loop&&value.presentedStreamFrames>=active.totalFrames-active.position;
                if(running&&ended){check(client->Stop(),"PLAYBACK_END_STOP_FAILED");running=false;
                    std::lock_guard<std::mutex> lock(command);if(requested.generation==active.generation)wanted=false;
                }else if(running&&presented>value.submittedFrames)throw std::runtime_error("PLAYBACK_UNDERRUN");
                check(client->GetCurrentPadding(&value.paddingFrames),"PLAYBACK_PADDING_FAILED");
                if(value.paddingFrames>value.bufferFrames)throw std::runtime_error("PLAYBACK_PADDING_OUT_OF_RANGE");
                // Some shared-mode clocks stall during underrun instead of advancing.
                // An empty running buffer before EOF is an audible continuity failure.
                if(running&&value.paddingFrames==0&&value.submittedFrames>0&&active.remaining(value.submittedFrames)>0)
                    throw std::runtime_error("PLAYBACK_UNDERRUN");
                auto available=value.bufferFrames-value.paddingFrames;
                uint32_t filled=0;
                while(filled<available){
                    const auto* block=queue->read();if(!block)break;
                    if(block->generation<active.generation){queue->release();blockOffset=0;continue;}
                    if(block->generation>active.generation)break;
                    if(block->streamFrame+blockOffset!=value.submittedFrames+filled)throw std::runtime_error("PLAYBACK_QUEUE_SEQUENCE_ERROR");
                    const auto count=std::min(available-filled,block->frames-blockOffset);const auto volume=gain.load();
                    for(size_t i=0;i<static_cast<size_t>(count)*channels;++i)staging[static_cast<size_t>(filled)*channels+i]=block->samples[static_cast<size_t>(blockOffset)*channels+i]*volume;
                    filled+=count;blockOffset+=count;
                    if(blockOffset==block->frames){queue->release();blockOffset=0;}
                }
                if(filled){
                    BYTE* bytes=nullptr;check(output->GetBuffer(filled,&bytes),"PLAYBACK_GET_BUFFER_FAILED");
                    std::memcpy(bytes,staging.data(),static_cast<size_t>(filled)*channels*sizeof(float));
                    check(output->ReleaseBuffer(filled,0),"PLAYBACK_RELEASE_BUFFER_FAILED");value.submittedFrames+=filled;value.paddingFrames+=filled;
                }
                const bool prefilled=value.paddingFrames==value.bufferFrames||(decoderEof==active.generation&&value.paddingFrames>0);
                if(play&&!running&&!ended&&prefilled){check(client->Start(),"PLAYBACK_START_FAILED");running=true;}
                value.playing=running;value.phase=ended?"ended":running?"playing":play?"buffering":"paused";
                publish(value);
                const auto wake=WaitForMultipleObjects(2,events,FALSE,5);
                if(wake==WAIT_FAILED)throw std::runtime_error("PLAYBACK_WAIT_FAILED");
            }
            if(running)check(client->Stop(),"PLAYBACK_CLOSE_STOP_FAILED");
            // Release COM interfaces before the owning render thread uninitializes COM.
            output.Reset();clock.Reset();client.Reset();device.Reset();enumerator.Reset();
        }catch(const std::exception& error){
            if(client&&running)client->Stop();
            client.Reset();fail(error.what());
        }
    }
};
Playback::Playback():impl_(std::make_unique<Impl>()){}
Playback::~Playback(){close();}
PlaybackSnapshot Playback::open(PlaybackOptions options){
    auto& p=*impl_;std::lock_guard<std::mutex> life(p.lifecycle);p.closeUnlocked();
    if(options.id.empty()||options.deviceId.empty())throw std::runtime_error("INVALID_PLAYBACK_SOURCE");
    p.options=std::move(options);p.sequence=p.options.memory?std::make_unique<WaveSequence>(p.options.memory):std::make_unique<WaveSequence>(p.options.sources,p.options.startFrame,p.options.endFrame);
    p.total=p.sequence->frames();p.queue=std::make_unique<Impl::Queue>();p.stopping=false;p.decoderEof=0;p.highWater=0;
    {std::lock_guard<std::mutex> lock(p.command);p.requested={++p.nextGeneration,0,p.total.load(),0,0,false};p.wanted=false;}
    {std::lock_guard<std::mutex> lock(p.publication);p.published={};p.published.id=p.options.id;p.published.deviceId=p.options.deviceId;
        p.published.totalFrames=p.total;p.published.format=p.sequence->format();p.published.phase="preparing";}
    {std::lock_guard<std::mutex> lock(p.startup);p.startupDone=false;}
    try{
        p.decoder=std::thread([&p]{p.decode();});p.renderer=std::thread([&p]{p.render();});
        std::unique_lock<std::mutex> lock(p.startup);
        if(!p.ready.wait_for(lock,std::chrono::seconds(8),[&p]{return p.startupDone;})){lock.unlock();p.closeUnlocked();throw std::runtime_error("PLAYBACK_OPEN_TIMEOUT");}
        lock.unlock();const auto result=p.snapshot();
        if(!result.error.empty()){const auto error=result.error;p.closeUnlocked();throw std::runtime_error(error);}
        p.accepting=true;if(p.stopping){p.accepting=false;throw std::runtime_error(p.snapshot().error);}return result;
    }catch(...){p.closeUnlocked();throw;}
}
void Playback::close(){std::lock_guard<std::mutex> lock(impl_->lifecycle);impl_->closeUnlocked();}
void Playback::play(){
    if(!impl_->accepting)throw std::runtime_error("PLAYBACK_NOT_OPEN");
    if(impl_->snapshot().phase=="ended"){seek(0,true,false,0,0);return;}
    {std::lock_guard<std::mutex> lock(impl_->command);impl_->wanted=true;}SetEvent(impl_->control.value);
}
void Playback::pause(){
    if(!impl_->accepting)throw std::runtime_error("PLAYBACK_NOT_OPEN");
    {std::lock_guard<std::mutex> lock(impl_->command);impl_->wanted=false;}SetEvent(impl_->control.value);
}
uint64_t Playback::seek(uint64_t position,bool resume,bool loop,uint64_t loopStart,uint64_t loopEnd){
    if(!impl_->accepting)throw std::runtime_error("PLAYBACK_NOT_OPEN");
    std::lock_guard<std::mutex> lock(impl_->command);
    PlaybackPlan plan{impl_->nextGeneration+1,position,impl_->total.load(),loopStart,loopEnd,loop};plan.validate();
    impl_->nextGeneration=plan.generation;impl_->requested=plan;impl_->wanted=resume;SetEvent(impl_->control.value);return plan.generation;
}
void Playback::volume(float gain){
    if(!std::isfinite(gain)||gain<0||gain>1)throw std::runtime_error("INVALID_PLAYBACK_VOLUME");
    impl_->gain=gain;
}
PlaybackSnapshot Playback::snapshot() const{return impl_->snapshot();}
}
