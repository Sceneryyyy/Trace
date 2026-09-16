#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <ksmedia.h>
#include <wrl/client.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
using Microsoft::WRL::ComPtr;
void check(HRESULT hr){if(FAILED(hr))throw std::runtime_error("WASAPI render HRESULT "+std::to_string(static_cast<unsigned long>(hr)));}
struct CoScope{HRESULT hr=CoInitializeEx(nullptr,COINIT_MULTITHREADED);~CoScope(){if(SUCCEEDED(hr))CoUninitialize();}};
struct FreeMix{void operator()(WAVEFORMATEX* p)const{CoTaskMemFree(p);}};
struct Event{HANDLE handle=CreateEventW(nullptr,FALSE,FALSE,nullptr);~Event(){if(handle)CloseHandle(handle);}};
int main(int argc,char** argv){
 try{
  const unsigned index=argc>1?static_cast<unsigned>(std::stoul(argv[1])):0;
  const unsigned seconds=argc>2?static_cast<unsigned>(std::stoul(argv[2])):10;
  if(seconds<1||seconds>7200)throw std::runtime_error("Duration must be 1..7200 seconds");
  CoScope com;check(com.hr);
  ComPtr<IMMDeviceEnumerator> enumerator;check(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator)));
  ComPtr<IMMDeviceCollection> collection;check(enumerator->EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE,&collection));
  UINT count=0;check(collection->GetCount(&count));if(index>=count)throw std::runtime_error("Device index out of range");
  ComPtr<IMMDevice> device;check(collection->Item(index,&device));
  ComPtr<IAudioClient> client;check(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())));
  WAVEFORMATEX* raw=nullptr;check(client->GetMixFormat(&raw));std::unique_ptr<WAVEFORMATEX,FreeMix> mix(raw);
  bool floating=raw->wFormatTag==WAVE_FORMAT_IEEE_FLOAT;
  if(raw->wFormatTag==WAVE_FORMAT_EXTENSIBLE&&raw->cbSize>=22)floating=IsEqualGUID(reinterpret_cast<WAVEFORMATEXTENSIBLE*>(raw)->SubFormat,KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
  if(!floating||raw->wBitsPerSample!=32||raw->nChannels<1||raw->nChannels>2)throw std::runtime_error("Fixture requires mono/stereo float32 mix");
  Event event;if(!event.handle)throw std::runtime_error("Event creation failed");
  check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_EVENTCALLBACK,1000000,0,raw,nullptr));
  check(client->SetEventHandle(event.handle));
  ComPtr<IAudioRenderClient> render;check(client->GetService(IID_PPV_ARGS(&render)));
  UINT32 capacity=0;check(client->GetBufferSize(&capacity));
  uint64_t frame=0;bool started=false;
  const auto begin=std::chrono::steady_clock::now();
  while(std::chrono::duration<double>(std::chrono::steady_clock::now()-begin).count()<seconds){
   UINT32 padding=0;check(client->GetCurrentPadding(&padding));const UINT32 available=capacity-padding;
   if(available){
    BYTE* data=nullptr;check(render->GetBuffer(available,&data));auto* samples=reinterpret_cast<float*>(data);
    bool silent=true;
    for(UINT32 i=0;i<available;++i,++frame){
      const double phase=std::fmod(static_cast<double>(frame)/raw->nSamplesPerSec,60.0);
      const double envelope=phase<1?std::min({1.0,phase*100,(1-phase)*100}):0;
      const float sample=static_cast<float>(0.005*envelope*std::sin(6.283185307179586*997*static_cast<double>(frame)/raw->nSamplesPerSec));
      if(sample!=0)silent=false;
      for(WORD c=0;c<raw->nChannels;++c)samples[static_cast<size_t>(i)*raw->nChannels+c]=sample;
    }
    check(render->ReleaseBuffer(available,silent?AUDCLNT_BUFFERFLAGS_SILENT:0));
   }
   if(!started){check(client->Start());started=true;std::cout<<"RENDER_READY "<<raw->nSamplesPerSec<<" "<<raw->nChannels<<std::endl;}
   if(WaitForSingleObject(event.handle,100)==WAIT_FAILED)throw std::runtime_error("Render wait failed");
  }
  check(client->Stop());std::cout<<"RENDER_COMPLETE "<<frame<<std::endl;return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<std::endl;return 1;}
}
