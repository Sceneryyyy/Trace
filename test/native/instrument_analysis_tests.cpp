#include "GainRamp.h"
#include "TimingStats.h"
#include "InstrumentAnalysis.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <complex>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>
using namespace Trace;
namespace {
size_t checks=0;
void require(bool ok,const char* name){++checks;if(!ok)throw std::runtime_error(name);}
void near(double a,double b,double tolerance,const char* name){require(std::isfinite(a)&&std::abs(a-b)<=tolerance,name);}
template<class F> void rejects(F fn,const char* name){bool failed=false;try{fn();}catch(const std::exception&){failed=true;}require(failed,name);}
std::vector<float> tone(uint32_t frames,uint32_t channels,double cyclesPerSample,double amplitude=.5,double rightGain=1){
 std::vector<float> data(size_t(frames)*channels);
 for(uint32_t n=0;n<frames;++n){const auto x=float(amplitude*std::sin(2*3.14159265358979323846*n*cyclesPerSample));data[size_t(n)*channels]=x;if(channels==2)data[size_t(n)*2+1]=float(x*rightGain);}
 return data;
}
double reference(const std::vector<float>& data,uint32_t channels,uint64_t end,uint32_t n,uint32_t k,uint32_t channel=0){
 std::complex<double> z;double sum=0;
 for(uint32_t i=0;i<n;++i){const double win=.5*(1-std::cos(2*3.14159265358979323846*i/n)),angle=-2*3.14159265358979323846*k*i/n;sum+=win;
  z+=double(data[size_t(end-n+i)*channels+channel])*win*std::complex<double>(std::cos(angle),std::sin(angle));}
 const auto scale=(k==0||k==n/2?1.0:2.0)/sum;return std::norm(z)*scale*scale;
}
}
int main(){try{
 for(const auto rate:{8000u,44100u,48000u,88200u,96000u})for(const auto n:{512u,1024u,2048u,4096u,8192u,16384u}){
  const auto data=tone(n*2,1,23.0/n,.42);InstrumentConfig c;c.fftSize=n;c.averageMs=c.holdMs=0;
  auto r=analyzeInstruments(data.data(),n*2,rate,1,0,n*2,c);
  require(r.status==MetricStatus::Ready,"tone ready");near(10*std::log10(r.current[23]),20*std::log10(.42),.01,"bin-center amplitude");
  near(r.binHz,double(rate)/n,1e-12,"actual bin frequency");require(r.field.correlation.status==MetricStatus::Insufficient,"mono is not stereo");
 }
 InstrumentConfig c;c.fftSize=512;c.averageMs=c.holdMs=0;c.fieldMs=100;
 for(const bool nyquist:{false,true}){std::vector<float> data(1024);for(size_t i=0;i<data.size();++i)data[i]=nyquist&&i%2?-.5f:.5f;
  const auto r=analyzeInstruments(data.data(),1024,48000,1,0,1024,c);near(r.current[nyquist?256:0],.25,1e-7,"DC and Nyquist not doubled");
 }
 auto data=tone(24000,2,1000.0/48000,.5);
 for(int polarity:{1,-1}){for(size_t n=0;n<data.size()/2;++n)data[n*2+1]=data[n*2]*polarity;
  const auto r=analyzeInstruments(data.data(),24000,48000,2,0,24000,c);
  near(r.field.correlation.value,polarity,1e-9,"correlation +/-1");near(r.field.balance.value,0,1e-7,"centered energy");require(r.field.points.size()<=2048,"bounded scope points");
  double energy=0;for(size_t k=0;k<181;++k){energy+=r.field.polarRms[k]*r.field.polarRms[k];require(r.field.polarEnvelope[k]<=r.field.polarPeak[k]+1e-12,"envelope bounded by peak");}near(energy,.125,1e-7,"polar energy uses all samples");if(polarity==1)near(r.field.polarRms[90],std::sqrt(.125),1e-7,"mono angle is centered");else require(r.field.polarRms[0]>0&&r.field.polarRms[180]>0,"antiphase polar edges");
  for(const auto& p:r.field.points)near(polarity==1?p.x:p.y,0,1e-8,"scope mono/antiphase geometry");
 }
 for(size_t n=0;n<data.size()/2;++n)data[n*2+1]=float(.5*std::cos(2*3.14159265358979323846*n*1000/48000));
 near(analyzeInstruments(data.data(),24000,48000,2,0,24000,c).field.correlation.value,0,1e-6,"orthogonal cycles");
 for(size_t n=0;n<data.size()/2;++n){data[n*2]=.8f;data[n*2+1]=.4f;}
 near(analyzeInstruments(data.data(),24000,48000,2,0,24000,c).field.balance.value,-.6,1e-7,"power balance");
 for(size_t n=0;n<data.size()/2;++n)data[n*2+1]=0;
 auto single=analyzeInstruments(data.data(),24000,48000,2,0,24000,c);near(single.field.balance.value,-1,1e-9,"left only");require(single.field.correlation.status==MetricStatus::Insufficient,"single-side phase undefined");
 std::fill(data.begin(),data.end(),0.0f);auto silence=analyzeInstruments(data.data(),24000,48000,2,0,24000,c);
 require(silence.status==MetricStatus::Silence&&silence.field.balance.status==MetricStatus::Silence,"silence is not zero dB");
 // Stereo energy remains visible for antiphase; explicit Mid cancels.
 data=tone(4096,2,23.0/512,.5,-1);c.channel=SpectrumChannel::Stereo;
 near(analyzeInstruments(data.data(),4096,48000,2,0,4096,c).current[23],.25,1e-7,"antiphase stereo energy");
 c.channel=SpectrumChannel::Mid;near(analyzeInstruments(data.data(),4096,48000,2,0,4096,c).current[23],0,1e-14,"explicit mid cancels");
 c.channel=SpectrumChannel::Side;near(analyzeInstruments(data.data(),4096,48000,2,0,4096,c).current[23],.25,1e-7,"side energy");
 c.channel=SpectrumChannel::Left;
 data=tone(96000,1,23.4/512,.5);for(size_t n=48000;n<data.size();++n)data[n]*=.2f;
 c.averageMs=300;c.holdMs=1500;
 const auto r=analyzeInstruments(data.data(),96000,48000,1,0,96000,c);
 for(const auto k:{0u,1u,23u,24u,100u,256u}){
  const auto ref=reference(data,1,96000,512,k);near(r.current[k],ref,std::max(1e-8,ref*2e-4),"direct DFT frequency leakage");
 }
 double avg=0,peak=0;uint32_t count=0;
 for(uint64_t end=96000;96000-end<72000;end-=r.hop){const auto ref=reference(data,1,end,512,23);peak=std::max(peak,ref);if(96000-end<14400){avg+=ref;++count;}}
 avg/=count;near(r.average[23],avg,std::max(1e-8,avg*2e-4),"linear-power average");near(r.peakHold[23],peak,std::max(1e-8,peak*2e-4),"fixed-time hold");
 const uint32_t cropStart=96000-72000-512;
 const auto cropped=analyzeInstruments(data.data()+cropStart,96000-cropStart,48000,1,cropStart,96000,c);
 require(r.current==cropped.current&&r.average==cropped.average&&r.peakHold==cropped.peakHold,"same context independent of earlier data");
 (void)analyzeInstruments(data.data(),96000,48000,1,0,48000,c);
 const auto repeated=analyzeInstruments(data.data(),96000,48000,1,0,96000,c);
 require(repeated.average==r.average&&repeated.peakHold==r.peakHold,"query order independence");
 const uint64_t origin=uint64_t(1)<<60;
 const auto big=analyzeInstruments(data.data(),96000,48000,1,origin,origin+96000,c);
 require(big.current==r.current&&big.positionFrame==origin+96000,"64-bit positions remain exact");
 require(analyzeInstruments(data.data(),511,48000,1,0,511,c).status==MetricStatus::Insufficient,"incomplete FFT");
 require(analyzeInstruments(data.data(),512,48000,1,0,512,c).partialAverage,"partial average marked");
 data[0]=std::numeric_limits<float>::quiet_NaN();rejects([&]{analyzeInstruments(data.data(),512,48000,1,0,512,c);},"nonfinite PCM rejected");data[0]=0;
 rejects([&]{analyzeInstruments(data.data(),512,48000,1,0,513,c);},"end boundary");
 rejects([&]{analyzeInstruments(data.data(),512,48000,1,UINT64_MAX-1,UINT64_MAX,c);},"frame overflow");
 c.fftSize=513;rejects([&]{analyzeInstruments(data.data(),512,48000,1,0,512,c);},"FFT power of two");
 // Fixed-seed noise and off-bin multitone use a separate direct-DFT reference.
 c.fftSize=512;c.channel=SpectrumChannel::Left;c.averageMs=c.holdMs=0;
 data.resize(4096);uint32_t seed=0x12345678;
 for(size_t i=0;i<data.size();++i){seed=1664525u*seed+1013904223u;data[i]=float((double(seed>>8)/16777216.0-.5)*.2+.25*std::sin(2*3.14159265358979323846*13.25*i/512)+.13*std::cos(2*3.14159265358979323846*93.8*i/512));}
 const auto noise=analyzeInstruments(data.data(),4096,44100,1,0,4096,c);
 for(const auto k:{0u,1u,13u,14u,93u,94u,128u,256u}){const auto ref=reference(data,1,4096,512,k);near(noise.current[k],ref,std::max(1e-8,ref*2e-4),"noise and multitone DFT");}
 std::vector<float> over(2048,2.0f);c.channel=SpectrumChannel::Stereo;
 const auto high=analyzeInstruments(over.data(),1024,48000,2,0,1024,c);near(high.current[0],4,1e-6,"float values above full scale retained");require(high.field.points[0].clipped,"scope sample clipping marker");
 data[0]=std::numeric_limits<float>::infinity();rejects([&]{analyzeInstruments(data.data(),512,48000,1,0,512,c);},"infinite PCM rejected");data[0]=0;
 rejects([&]{analyzeInstruments(nullptr,512,48000,1,0,512,c);},"null PCM rejected");
 rejects([&]{analyzeInstruments(data.data(),512,0,1,0,512,c);},"invalid rate");
 rejects([&]{analyzeInstruments(data.data(),512,48000,3,0,512,c);},"invalid channels");
 c.averageMs=2001;rejects([&]{analyzeInstruments(data.data(),512,48000,1,0,512,c);},"bounded average");c.averageMs=0;
 c.channel=SpectrumChannel::Right;require(analyzeInstruments(data.data(),512,48000,1,0,512,c).status==MetricStatus::Insufficient,"mono right unavailable");
 c.fftSize=16384;c.channel=SpectrumChannel::Stereo;c.averageMs=c.holdMs=2000;
 data=tone(240000,2,997.0/96000,.5);
 const auto begin=std::chrono::steady_clock::now();const auto worst=analyzeInstruments(data.data(),240000,96000,2,0,240000,c);
 require(!worst.partialAverage,"full largest averaging range");
 std::cout<<"Cold max-config ms "<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count()<<"\n";
 for(auto rate:{8000u,44100u,48000u,96000u}){GainRamp ramp(rate);float previous=0;for(uint32_t n=0;n<rate/200;++n){const auto current=ramp.next(1);require(current>=previous&&current<=1,"monotonic audition ramp");previous=current;}near(previous,1,1e-6,"5ms ramp reaches target");for(uint32_t n=0;n<rate/200;++n){const auto current=ramp.next(.25f);require(current<=previous&&current>=.25f,"monotonic attenuation ramp");previous=current;}near(previous,.25,1e-6,"attenuation ramp reaches target");}
 TimingStats timings;require(timings.snapshot().count==0,"empty timing counters initialized");{TimingScope scope(timings);}require(timings.snapshot().count==1,"timing scope observed");
 std::cout<<"INSTRUMENT_ANALYSIS_PASS "<<checks<<" checks\n";return 0;
}catch(const std::exception& e){std::cerr<<"INSTRUMENT_ANALYSIS_FAIL "<<e.what()<<"\n";return 1;}}
