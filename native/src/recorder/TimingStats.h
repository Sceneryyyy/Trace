#pragma once
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
namespace Trace {
struct TimingSnapshot {uint64_t count=0,p50Us=0,p95Us=0,p99Us=0,maxUs=0;};
// Single producer, lock-free reads; quantiles are log2 bucket upper bounds.
class TimingStats {
 static_assert(std::atomic<uint64_t>::is_always_lock_free,"Capture diagnostics require lock-free counters");
 std::array<std::atomic<uint64_t>,32> buckets_{};
 std::atomic<uint64_t> count_{0},maximum_{0};
public:
 using Clock=std::chrono::steady_clock;
 TimingStats(){for(auto& bucket:buckets_)bucket.store(0,std::memory_order_relaxed);}
 void observe(Clock::time_point start) noexcept {
  const auto us=uint64_t(std::chrono::duration_cast<std::chrono::microseconds>(Clock::now()-start).count());
  unsigned bucket=0;while(bucket<31&&(uint64_t(1)<<bucket)<us)++bucket;
  buckets_[bucket].fetch_add(1,std::memory_order_relaxed);count_.fetch_add(1,std::memory_order_relaxed);
  auto old=maximum_.load(std::memory_order_relaxed);if(us>old)maximum_.store(us,std::memory_order_relaxed);
 }
 TimingSnapshot snapshot() const noexcept {
  TimingSnapshot s;s.count=count_.load(std::memory_order_relaxed);s.maxUs=maximum_.load(std::memory_order_relaxed);
  const auto percentile=[&](uint64_t p){if(!s.count)return uint64_t(0);const auto target=(s.count*p+99)/100;uint64_t sum=0;for(unsigned i=0;i<32;++i){sum+=buckets_[i].load(std::memory_order_relaxed);if(sum>=target)return uint64_t(1)<<i;}return uint64_t(1)<<31;};
  s.p50Us=percentile(50);s.p95Us=percentile(95);s.p99Us=percentile(99);return s;
 }
};
class TimingScope {TimingStats& stats_;TimingStats::Clock::time_point start_=TimingStats::Clock::now();public:explicit TimingScope(TimingStats& stats):stats_(stats){}~TimingScope(){stats_.observe(start_);}};
}
