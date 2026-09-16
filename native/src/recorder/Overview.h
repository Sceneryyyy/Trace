#pragma once
#include "AudioTypes.h"
#include <algorithm>
#include <array>
#include <vector>
namespace Trace {
inline WavePoint mergeOverview(const WavePoint& a, const WavePoint& b) {
    auto result=b; result.flags|=a.flags;
    for(size_t c=0;c<2;++c){result.minimum[c]=std::min(a.minimum[c],b.minimum[c]);result.maximum[c]=std::max(a.maximum[c],b.maximum[c]);}
    return result;
}
inline LoudnessPoint mergeOverview(const LoudnessPoint& a, const LoudnessPoint& b) {
    auto result=b;result.flags|=a.flags;return result; // An actual later reading, not an average of LUFS.
}
template<class T,size_t Capacity=2048>
class Overview {
    static_assert(Capacity%2==0);
    std::array<T,Capacity> data_{};
    size_t size_=0;
    uint64_t stride_=1,pendingCount_=0;
    T pending_{};
public:
    void append(const T& value) {
        pending_=pendingCount_?mergeOverview(pending_,value):value;
        if(++pendingCount_<stride_)return;
        if(size_==Capacity){
            for(size_t i=0;i<Capacity/2;++i)data_[i]=mergeOverview(data_[i*2],data_[i*2+1]);
            size_=Capacity/2;stride_*=2;
            // The pending bucket was collected at the previous resolution.
            // Keep it until it spans the new stride.
            if(pendingCount_<stride_)return;
        }
        data_[size_++]=pending_;pendingCount_=0;
    }
    std::vector<T> points(size_t maximum) const {
        maximum=std::max<size_t>(1,maximum);
        std::vector<T> result;result.reserve(std::min(size_+1,maximum+1));
        const size_t step=std::max<size_t>(1,(size_+maximum-1)/maximum);
        for(size_t i=0;i<size_;i+=step){
            auto value=data_[i];
            for(size_t j=i+1;j<std::min(size_,i+step);++j)value=mergeOverview(value,data_[j]);
            result.push_back(value);
        }
        if(pendingCount_)result.push_back(pending_);
        return result;
    }
};
}
