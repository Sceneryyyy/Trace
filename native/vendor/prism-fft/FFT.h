#pragma once
#define _USE_MATH_DEFINES
#include <cmath>
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#include <vector>
#include <complex>
#include <algorithm>

namespace DSP {

// Simple FFT implementation (Cooley-Tukey radix-2)
class FFT {
public:
    explicit FFT(size_t size);
    void forward(const float* input, float* magnitudes);
    void forward(const float* input, std::complex<float>* output);
    size_t getSize() const { return size_; }

private:
    size_t size_;
    std::vector<std::complex<float>> twiddles_;
    std::vector<std::complex<float>> buffer_; // Reuse buffer to avoid allocations
    std::vector<std::complex<float>> scratch_; // Scratch buffer if needed
    void bitReverse(std::complex<float>* data);
};

} // namespace DSP
