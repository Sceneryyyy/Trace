#pragma once
#include <napi.h>
#include "ReplayBuffer.h"
namespace Trace {Napi::Value openReplayPlayback(Napi::Env,const std::string&,const std::string&,std::shared_ptr<const ReplayClip>);
void registerPlayback(Napi::Env env,Napi::Object exports);}
