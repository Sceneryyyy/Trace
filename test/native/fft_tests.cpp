#include "FFT.h"
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace {
constexpr double pi = 3.14159265358979323846;
size_t checks = 0;
void require(bool ok, const char* message) {
    ++checks;
    if (!ok) throw std::runtime_error(message);
}
std::complex<double> directDft(const std::vector<float>& input, size_t bin) {
    std::complex<double> result;
    for (size_t n = 0; n < input.size(); ++n) {
        const double angle = -2 * pi * double(bin) * double(n) / double(input.size());
        result += double(input[n]) * std::complex<double>(std::cos(angle), std::sin(angle));
    }
    return result;
}
void compare(const std::vector<float>& input,
             const std::vector<std::complex<float>>& output,
             const std::vector<float>& magnitude, size_t bin) {
    const auto expected = directDft(input, bin);
    // Float FFT versus independent double DFT, including nearly empty bins.
    const auto tolerance = 2e-4 * std::max(1.0, std::abs(expected));
    require(std::abs(std::complex<double>(output[bin]) - expected) <= tolerance,
            "complex FFT disagrees with direct DFT");
    if (bin < input.size() / 2) {
        const double scaled = std::abs(expected) * 2.0 / double(input.size());
        require(std::abs(double(magnitude[bin]) - scaled) <=
                    2e-6 + scaled * 2e-4,
                "magnitude FFT disagrees with independently scaled direct DFT");
    }
}
std::vector<float> signal(size_t size, unsigned kind) {
    std::vector<float> input(size);
    uint32_t seed = 0x8754ab12;
    for (size_t n = 0; n < size; ++n) {
        seed = seed * 1664525u + 1013904223u;
        switch (kind) {
            case 0: break;
            case 1: input[n] = n == 0 ? .5f : 0; break;
            case 2: input[n] = n == size / 3 ? -.75f : 0; break;
            case 3: input[n] = .25f; break;
            case 4: input[n] = n % 2 ? -.4f : .4f; break;
            case 5: input[n] = float(.42 * std::sin(2 * pi * 23 * double(n) / double(size))); break;
            case 6: input[n] = float(.25 * std::sin(2 * pi * 23.25 * double(n) / double(size)) +
                                        .13 * std::cos(2 * pi * 97.8 * double(n) / double(size))); break;
            case 7: input[n] = float((double(seed >> 8) / 16777216.0 - .5) * .6); break;
        }
    }
    return input;
}
}

int main() {
    try {
        for (const auto size : {512u, 1024u, 2048u, 4096u, 8192u, 16384u}) {
            DSP::FFT fft(size);
            require(fft.getSize() == size, "FFT preserves configured size");
            std::vector<std::complex<float>> output(size);
            std::vector<float> magnitude(size / 2 + 2, 123.5f);
            for (unsigned kind = 0; kind < 8; ++kind) {
                auto input = signal(size, kind);
                const auto original = input;
                fft.forward(input.data(), output.data());
                fft.forward(input.data(), magnitude.data());
                require(input == original, "FFT changes source PCM");
                require(magnitude[size / 2] == 123.5f && magnitude[size / 2 + 1] == 123.5f,
                        "magnitude API writes beyond its N/2 output");
                for (const size_t bin : {size_t(0), size_t(1), size_t(7), size_t(23),
                                        size_t(size / 4), size_t(size / 2), size_t(size - 23), size_t(size - 1)}) {
                    compare(input, output, magnitude, bin);
                }
                // A complete independent small transform checks every bin,
                // rather than checking only designed tone locations.
                if (size == 512 && kind == 7) {
                    for (size_t bin = 0; bin < size; ++bin) compare(input, output, magnitude, bin);
                }
                const auto first = output;
                const auto unrelated = signal(size, (kind + 3) % 8);
                fft.forward(unrelated.data(), output.data());
                fft.forward(input.data(), output.data());
                require(output == first, "reused FFT retains prior signal state");
                DSP::FFT fresh(size);
                fresh.forward(input.data(), output.data());
                require(output == first, "reused and fresh FFT differ");
            }
        }
        std::cout << "FFT_PASS " << checks << " checks\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FFT_FAIL " << error.what() << "\n";
        return 1;
    }
}
