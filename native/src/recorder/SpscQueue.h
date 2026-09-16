#pragma once
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
namespace Trace {
// One producer owns write/publish, one consumer owns read/release.
// A full queue rejects the next block; unread audio is never overwritten.
template<class T, size_t Capacity>
class SpscQueue {
    static_assert(Capacity > 1 && (Capacity & (Capacity - 1)) == 0);
    std::unique_ptr<T[]> storage_ = std::make_unique<T[]>(Capacity);
    alignas(64) std::atomic<uint64_t> write_{0};
    alignas(64) std::atomic<uint64_t> read_{0};
public:
    T* write() noexcept {
        const auto w = write_.load(std::memory_order_relaxed);
        if (w - read_.load(std::memory_order_acquire) == Capacity) return nullptr;
        return &storage_[w & (Capacity - 1)];
    }
    void publish() noexcept { write_.fetch_add(1, std::memory_order_release); }
    const T* read() const noexcept {
        const auto r = read_.load(std::memory_order_relaxed);
        if (r == write_.load(std::memory_order_acquire)) return nullptr;
        return &storage_[r & (Capacity - 1)];
    }
    void release() noexcept { read_.fetch_add(1, std::memory_order_release); }
    size_t size() const noexcept {
        const auto r = read_.load(std::memory_order_acquire);
        const auto w = write_.load(std::memory_order_acquire);
        const auto count = w >= r ? w - r : 0;
        return static_cast<size_t>(count > Capacity ? Capacity : count);
    }
};
}
