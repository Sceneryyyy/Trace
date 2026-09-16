#pragma once
#include <napi.h>
#include "Engine.h"
namespace Trace {void registerInstruments(Napi::Env env,Napi::Object exports,Engine& engine);}
