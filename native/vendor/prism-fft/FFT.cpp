#define _USE_MATH_DEFINES
#include "FFT.h"
#include <cstring>
#include <cmath>
#include <algorithm>

namespace DSP {

// FFT Implementation
FFT::FFT(size_t size) : size_(size) {
    // Precompute twiddle factors
    twiddles_.resize(size / 2);
    for (size_t i = 0; i < size / 2; i++) {
        float angle = -2.0f * M_PI * i / size;
        twiddles_[i] = std::complex<float>(cosf(angle), sinf(angle));
    }
    buffer_.resize(size);
    scratch_.resize(size);
}

void FFT::bitReverse(std::complex<float>* data) {
    size_t n = size_;
    for (size_t i = 1, j = 0; i < n; i++) {
        size_t bit = n >> 1;
        while (j & bit) {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if (i < j) {
            std::swap(data[i], data[j]);
        }
    }
}

void FFT::forward(const float* input, std::complex<float>* output) {
    // Copy input to internal buffer
    for (size_t i = 0; i < size_; i++) {
        buffer_[i] = std::complex<float>(input[i], 0.0f);
    }

    bitReverse(buffer_.data());

    // Cooley-Tukey FFT
    for (size_t len = 2; len <= size_; len *= 2) {
        size_t halfLen = len / 2;
        size_t step = size_ / len;
        for (size_t i = 0; i < size_; i += len) {
            for (size_t j = 0; j < halfLen; j++) {
                std::complex<float> t = twiddles_[j * step] * buffer_[i + j + halfLen];
                buffer_[i + j + halfLen] = buffer_[i + j] - t;
                buffer_[i + j] = buffer_[i + j] + t;
            }
        }
    }

    memcpy(output, buffer_.data(), size_ * sizeof(std::complex<float>));
}

void FFT::forward(const float* input, float* magnitudes) {
    // Use scratch buffer for complex output to avoid allocation
    forward(input, scratch_.data());

    // Calculate magnitudes (only first half is useful)
    // Scale by 2/N for correct magnitude
    float scale = 2.0f / size_;
    for (size_t i = 0; i < size_ / 2; i++) {
        magnitudes[i] = std::abs(scratch_[i]) * scale;
    }
}

} // namespace DSP
