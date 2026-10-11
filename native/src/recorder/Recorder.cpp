#include "Recorder.h"
#include "CaptureRecovery.h"
#include <chrono>
#include <fstream>
#include <stdexcept>
namespace Trace {
namespace {
const char* failureName(RecordFailure failure) {
    switch(failure){
        case RecordFailure::Backpressure:return "DISK_BACKPRESSURE";
        case RecordFailure::CaptureGap:return "CAPTURE_GAP";
        case RecordFailure::SourceStopped:return "DEVICE_UNAVAILABLE";
        case RecordFailure::Disk:return "DISK_WRITE_FAILED";
        case RecordFailure::StartTimeout:return "RECORD_START_TIMEOUT";
        default:return "";
    }
}
std::string timeJson(uint64_t value){return value==UINT64_MAX?"null":"\""+std::to_string(value)+"\"";}
std::string quoted(const std::string& value) {
    std::string result="\"";
    for(unsigned char c:value){if(c=='"'||c=='\\'){result+='\\';result+=char(c);}else if(c>=32)result+=char(c);}
    return result+'"';
}
}
const char* recordPhaseName(RecordPhase phase) {
    switch(phase){
        case RecordPhase::Preparing:return "preparing";
        case RecordPhase::Armed:return "armed";
        case RecordPhase::Recording:return "recording";
        case RecordPhase::Draining:return "finalizing";
        case RecordPhase::Complete:return "complete";
        case RecordPhase::Failed:return "failed";
        default:return "idle";
    }
}
Recorder::~Recorder(){finishAfterProducerStopped();}
bool Recorder::busy() const noexcept {
    const auto p=phase_.load();
    return p==RecordPhase::Preparing||p==RecordPhase::Armed||p==RecordPhase::Recording||p==RecordPhase::Draining;
}
void Recorder::prepare(RecordOptions options) {
    if(busy())throw std::runtime_error("RECORDING_ALREADY_ACTIVE");
    if(worker_.joinable())worker_.join();
    auto fresh=std::make_unique<Queue>();
    auto replay=std::make_unique<ReplayBuffer>(options.format);
    phase_=RecordPhase::Preparing;generation_.fetch_add(1);
    queue_=std::move(fresh);
    stopRequested_=false;failure_=RecordFailure::None;
    startFrame_=UINT64_MAX;endFrame_=UINT64_MAX;accepted_=0;estimated_=0;highWater_=0;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        readyDone_=false;published_={};published_.id=options.id;published_.format=options.format;published_.encoding=options.encoding;
        waves_={};loudness_={};replay_=std::move(replay);
    }
    try { worker_=std::thread(&Recorder::run,this,std::move(options)); }
    catch (...) { phase_=RecordPhase::Failed; throw; }
    std::unique_lock<std::mutex> lock(mutex_);
    if(!ready_.wait_for(lock,std::chrono::seconds(8),[&]{return readyDone_;})){
        failure_=RecordFailure::StartTimeout;stopRequested_=true;throw std::runtime_error("RECORD_START_TIMEOUT");
    }
    if(!published_.error.empty())throw std::runtime_error(published_.error);
}
void Recorder::requestStop() noexcept {stopRequested_=true;}
void Recorder::boundary() noexcept {
    const auto p=phase_.load();
    if(stopRequested_&&(p==RecordPhase::Armed||p==RecordPhase::Recording))phase_.store(RecordPhase::Draining);
}
void Recorder::sourceFailed(RecordFailure error) noexcept {
    if(!busy())return;
    auto expected=RecordFailure::None;failure_.compare_exchange_strong(expected,error);
    stopRequested_=true;
    boundary();
}
void Recorder::push(const AudioBlock& block) noexcept {
    const auto generation=generation_.load();
    const auto p=phase_.load();
    if(p!=RecordPhase::Armed&&p!=RecordPhase::Recording)return;
    inFlight_.fetch_add(1);
    if(generation_.load()!=generation){inFlight_.fetch_sub(1);return;}
    boundary();
    auto current=phase_.load();
    if(current!=RecordPhase::Armed&&current!=RecordPhase::Recording){inFlight_.fetch_sub(1);return;}
    if(block.flags&(Gap|Missing|TimestampError|Overlap)){
        sourceFailed(RecordFailure::CaptureGap);inFlight_.fetch_sub(1);return;
    }
    if(current==RecordPhase::Armed){
        startFrame_=block.firstFrame;endFrame_=block.firstFrame;
        phase_.store(RecordPhase::Recording);
    }
    if(block.firstFrame!=endFrame_.load()){
        sourceFailed(RecordFailure::CaptureGap);inFlight_.fetch_sub(1);return;
    }
    auto* target=queue_->write();
    if(!target){
        sourceFailed(RecordFailure::Backpressure);inFlight_.fetch_sub(1);return;
    }
    *target=block;
    accepted_.fetch_add(block.frames);endFrame_=block.firstFrame+block.frames;
    queue_->publish();
    if(block.flags&EstimatedSilence)estimated_.fetch_add(block.frames);
    const auto depth=queue_->size();if(depth>highWater_.load())highWater_=depth;
    inFlight_.fetch_sub(1);
}
void Recorder::finishAfterProducerStopped() {
    stopRequested_=true;
    boundary();
    if(worker_.joinable())worker_.join();
}
RecordSnapshot Recorder::snapshot() const {
    const auto phase=phase_.load();
    std::lock_guard<std::mutex> lock(mutex_);
    auto result=published_;result.phase=phase;result.writeTiming=writeTiming_.snapshot();result.flushTiming=flushTiming_.snapshot();
    result.startFrame=startFrame_;result.acceptedFrames=accepted_;result.queueHighWater=highWater_;
    result.endFrame=result.startFrame==UINT64_MAX?UINT64_MAX:result.startFrame+result.writtenFrames;
    result.queueDepth=queue_?queue_->size():0;
    if(result.error.empty())result.error=failureName(failure_);
    result.waveform=waves_.points(900);result.loudness=loudness_.points(600);
    if(replay_){const auto range=replay_->range(true);result.replayStartFrame=range.start;result.replayEndFrame=range.end;}
    return result;
}
PcmWindow Recorder::instrumentWindow(const std::string& id,uint64_t position,uint32_t before)const{
 std::lock_guard<std::mutex> lock(mutex_);if(!replay_||published_.id!=id)throw std::runtime_error("STALE_INSTRUMENT_SOURCE");return replay_->window(position,before);
}
std::shared_ptr<const ReplayClip> Recorder::freezeReplay() const {
    std::lock_guard<std::mutex> lock(mutex_);
    if(!replay_)throw std::runtime_error("REPLAY_EMPTY");
    auto clip=replay_->freeze(true);clip->sourceId=published_.id;
    clip->captureStartFrame=startFrame_.load()+clip->originFrame;return clip;
}
void Recorder::run(RecordOptions options) {
    std::unique_ptr<WavWriter> writer;
    std::unique_ptr<Meter> meter;
    std::ofstream journal;
    bool began=false;
    uint64_t journalSequence=0;
    uint64_t nextCheckpoint=options.format.sampleRate;
    try{
        writer=std::make_unique<WavWriter>(options.basePath,options.format.sampleRate,options.format.channels,options.encoding,options.wav);
        meter=std::make_unique<Meter>(options.format.sampleRate,options.format.channels);
        meter->setFrameSink([&](const MeterValues& values,const WavePoint& wave,bool loud){
            replay_->remember(values,wave,loud);
            waves_.append(wave);
            if(loud&&meter->latestLoudness())loudness_.append(*meter->latestLoudness());
        });
        journal.open(options.journalPath.empty()?options.basePath.parent_path()/"journal.jsonl":options.journalPath,std::ios::binary|std::ios::app);
        if(!journal)throw std::runtime_error("JOURNAL_OPEN_FAILED");
        journal<<"{\"seq\":"<<++journalSequence<<",\"event\":\"prepared\",\"id\":"<<quoted(options.id)<<",\"sampleRate\":"<<options.format.sampleRate<<",\"channels\":"<<options.format.channels<<"}\n";journal.flush();
        {
            std::lock_guard<std::mutex> lock(mutex_);
            readyDone_=true;phase_=stopRequested_?RecordPhase::Draining:RecordPhase::Armed;
        }
        ready_.notify_all();
        for(;;){
            const auto* block=queue_->read();
            if(!block){
                if(phase_==RecordPhase::Draining&&inFlight_.load()==0)break;
                std::this_thread::sleep_for(std::chrono::milliseconds(1));continue;
            }
            if(!began){
                journal<<"{\"seq\":"<<++journalSequence<<",\"event\":\"begin\",\"captureStartFrame\":\""<<startFrame_.load()<<"\"}\n";began=true;
            }
            if(failure_!=RecordFailure::Disk){
                if(options.writerDelayMs)std::this_thread::sleep_for(std::chrono::milliseconds(options.writerDelayMs));
                const auto before=writer->frames();
                try{
                    TimingScope writeTiming(writeTiming_);
                    writer->append(block->samples.data(),block->frames);
                }catch(const std::exception& error){
                    failure_=RecordFailure::Disk;stopRequested_=true;phase_=RecordPhase::Draining;
                    std::lock_guard<std::mutex> lock(mutex_);published_.error=error.what();
                }
                const auto good=writer->frames()-before;
                if(good){
                    std::lock_guard<std::mutex> lock(mutex_);
                    const auto start=block->qpc100ns?block->qpc100ns+frameDuration100ns(block->qpcOffsetFrames,options.format.sampleRate):UINT64_MAX;
                    const auto end=block->qpc100ns?block->qpc100ns+frameDuration100ns(uint64_t(block->qpcOffsetFrames)+good,options.format.sampleRate):UINT64_MAX;
                    if(!before){published_.startQpc100ns=start;published_.startQpcEstimated=(block->flags&EstimatedSilence)!=0;}
                    published_.endQpc100ns=end;published_.endQpcEstimated=(block->flags&EstimatedSilence)!=0;
                    // Meter sinks update the overview here. Publish their prefix, counts and
                    // clock together so snapshot() cannot pair new points with old bounds.
                    replay_->push(block->samples.data(),static_cast<uint32_t>(std::min<uint64_t>(good,block->frames)));
                    meter->push(block->samples.data(),static_cast<uint32_t>(std::min<uint64_t>(good,block->frames)),block->flags);
                    if(block->flags&EstimatedSilence)published_.estimatedFrames+=good;
                    published_.writtenFrames=writer->frames();published_.clippedSamples=writer->clippedSamples();
                    published_.meters=meter->values();
                }
            }
            queue_->release();
            if(writer->frames()>=nextCheckpoint){
                TimingScope flushTiming(flushTiming_);
                if(options.flushDelayMs)std::this_thread::sleep_for(std::chrono::milliseconds(options.flushDelayMs));
                writer->checkpoint();nextCheckpoint=writer->frames()+options.format.sampleRate;
                {
                    std::lock_guard<std::mutex> lock(mutex_);published_.segments=writer->segments();
                }
                journal<<"{\"seq\":"<<++journalSequence<<",\"event\":\"checkpoint\",\"frames\":\""<<writer->frames()<<"\",\"startQpc100ns\":"<<timeJson(published_.startQpc100ns)<<",\"endQpc100ns\":"<<timeJson(published_.endQpc100ns)<<",\"startQpcEstimated\":"<<(published_.startQpcEstimated?"true":"false")<<",\"endQpcEstimated\":"<<(published_.endQpcEstimated?"true":"false")<<",\"segments\":[";
                bool first=true;
                for(const auto& segment:writer->segments()){
                    if(!first)journal<<',';first=false;
                    journal<<"{\"file\":"<<quoted(segment.path.filename().u8string())<<",\"frames\":\""<<segment.frames<<"\"}";
                }
                journal<<"]}\n";journal.flush();
                if(!journal)throw std::runtime_error("JOURNAL_WRITE_FAILED");
            }
        }
        writer->close();
        {
            std::lock_guard<std::mutex> lock(mutex_);
            meter->finish();
            published_.meters=meter->values();published_.writtenFrames=writer->frames();
            published_.segments=writer->segments();published_.clippedSamples=writer->clippedSamples();
        }
        journal<<"{\"seq\":"<<++journalSequence<<",\"event\":\"close\",\"frames\":\""<<writer->frames()<<"\",\"startQpc100ns\":"<<timeJson(published_.startQpc100ns)<<",\"endQpc100ns\":"<<timeJson(published_.endQpc100ns)<<",\"startQpcEstimated\":"<<(published_.startQpcEstimated?"true":"false")<<",\"endQpcEstimated\":"<<(published_.endQpcEstimated?"true":"false")<<",\"error\":"<<quoted(failureName(failure_))<<"}\n";journal.flush();
        if(!journal)throw std::runtime_error("JOURNAL_WRITE_FAILED");
    }catch(const std::exception& error){
        failure_=RecordFailure::Disk;stopRequested_=true;phase_=RecordPhase::Draining;
        while(inFlight_.load())std::this_thread::yield();
        if(queue_)while(queue_->read())queue_->release();
        try{if(writer)writer->close();}catch(...){}
        std::lock_guard<std::mutex> lock(mutex_);
        published_.error=error.what();
        if(writer){published_.writtenFrames=writer->frames();published_.segments=writer->segments();published_.clippedSamples=writer->clippedSamples();}
        readyDone_=true;
    }
    phase_=failure_==RecordFailure::None?RecordPhase::Complete:RecordPhase::Failed;
    ready_.notify_all();
}
}
