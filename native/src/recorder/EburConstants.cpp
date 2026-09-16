#include <atomic>
#include <mutex>
namespace {
std::once_flag initialized;
std::atomic<unsigned> initializationCount{0};
}
extern "C" int trace_ebur128_initialize_constants(void (*initialize)()) noexcept {
    try {
        std::call_once(initialized,[=]{initialize();initializationCount.fetch_add(1,std::memory_order_relaxed);});
        return 1;
    } catch (...) { return 0; }
}
extern "C" unsigned trace_ebur128_constants_initializations() noexcept {
    return initializationCount.load(std::memory_order_relaxed);
}
