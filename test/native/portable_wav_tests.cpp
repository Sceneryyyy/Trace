#include "WavFile.h"

#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

std::vector<uint8_t> bytes(const fs::path& path) {
    std::ifstream input(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

int main() {
    const auto nonce = std::chrono::steady_clock::now().time_since_epoch().count();
    const auto root = fs::temp_directory_path() / ("trace-portable-wav-" + std::to_string(nonce));
    try {
        require(fs::create_directory(root), "temporary directory collision");
        const auto stem = root / fs::u8path(u8"声迹-cross-platform");
        const float input[]{0.5f, -0.5f, 0.25f, -0.25f};
        {
            Trace::WavWriter writer(stem, 96000, 2, Trace::WavEncoding::Float32);
            writer.append(input, 2);
            writer.checkpoint();
            writer.close();
            require(writer.frames() == 2 && writer.segments().size() == 1, "wrong WAV frame count");
            Trace::WavReader reader(writer.segments()[0].path);
            float decoded[4]{};
            require(reader.read(decoded, 2) == 2, "WAV read failed");
            require(std::memcmp(decoded, input, sizeof(input)) == 0, "WAV samples changed");
        }

        const auto source = root / "publish-source.wav", target = root / "publish-target.wav";
        { std::ofstream file(source, std::ios::binary); file << "new"; }
        { std::ofstream file(target, std::ios::binary); file << "old"; }
        bool rejected = false;
        try { Trace::publishNewFile(source, target); } catch (...) { rejected = true; }
        require(rejected && bytes(source) == std::vector<uint8_t>({'n','e','w'}),
                "source lost after publication collision");
        require(bytes(target) == std::vector<uint8_t>({'o','l','d'}),
                "existing target was replaced");
        fs::remove(target);
        Trace::publishNewFile(source, target);
        require(!fs::exists(source) && bytes(target) == std::vector<uint8_t>({'n','e','w'}),
                "new target was not published");
        fs::remove_all(root);
        std::cout << "portable WAV and no-overwrite publication passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        if (fs::exists(root)) fs::remove_all(root);
        return 1;
    }
}
