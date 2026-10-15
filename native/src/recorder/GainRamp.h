#pragma once
#include <algorithm>
#include <cstdint>
namespace Trace {
/** Five millisecond audition transition; never applied to capture or meters. */
class GainRamp {
 float current_=0,target_=0,step_=0;uint32_t remaining_=0,length_;
public:
 explicit GainRamp(uint32_t rate):length_(std::max(1u,rate/200)){}
 float next(float target) noexcept {
  if(target!=target_){target_=target;remaining_=length_;step_=(target_-current_)/remaining_;}
  if(remaining_){current_+=step_;if(!--remaining_)current_=target_;}
  return current_;
 }
};
}
