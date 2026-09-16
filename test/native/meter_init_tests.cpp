#include "Meter.h"
#include <atomic>
#include <cmath>
#include <iostream>
#include <thread>
#include <vector>
extern "C" unsigned trace_ebur128_constants_initializations() noexcept;
int main(){
    if(trace_ebur128_constants_initializations()!=0)return 1;
    std::atomic<bool> start{false},failed{false};
    std::vector<std::thread> threads;
    const uint32_t rates[]={44100,48000,88200,96000};
    for(unsigned t=0;t<8;++t)threads.emplace_back([&,t]{
        while(!start.load())std::this_thread::yield();
        try{
            const auto rate=rates[t%4];std::vector<float> input(rate/10*2);
            for(unsigned iteration=0;iteration<4;++iteration){
                Trace::Meter meter(rate,2);
                for(unsigned block=0;block<6;++block){
                    for(unsigned f=0;f<rate/10;++f){
                        const auto phase=(block*(rate/10)+f)*6.283185307179586*1000/rate;
                        input[f*2]=input[f*2+1]=static_cast<float>(std::pow(10.0,-23.0/20)*std::sin(phase));
                    }
                    meter.push(input.data(),rate/10);
                }
                meter.finish();
                if(meter.values().integrated.status!=Trace::MetricStatus::Ready||std::abs(meter.values().integrated.value+23)>.1)failed=true;
            }
        }catch(...){failed=true;}
    });
    start=true;for(auto& thread:threads)thread.join();
    if(failed||trace_ebur128_constants_initializations()!=1){std::cerr<<"FAIL parallel construction or constants initialized more than once\n";return 1;}
    std::cout<<"PASS 32 parallel meter lifecycles at four rates; shared constants initialized exactly once\n";
    return 0;
}
