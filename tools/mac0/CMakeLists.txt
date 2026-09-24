cmake_minimum_required(VERSION 3.22)
if(NOT CMAKE_HOST_APPLE)
  message(FATAL_ERROR "M-MAC0 requires a real macOS host with the macOS 14.2 SDK or newer")
endif()

set(CMAKE_OSX_DEPLOYMENT_TARGET "14.2" CACHE STRING "First Trace macOS capture target")
set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "M-MAC0 Apple silicon target")
project(TraceCoreAudioProbe LANGUAGES CXX OBJCXX)

add_executable(TraceCoreAudioProbe MACOSX_BUNDLE main.mm)
set_target_properties(TraceCoreAudioProbe PROPERTIES
  CXX_STANDARD 17
  CXX_STANDARD_REQUIRED YES
  OBJCXX_STANDARD 17
  OBJCXX_STANDARD_REQUIRED YES
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist.in"
)
target_compile_options(TraceCoreAudioProbe PRIVATE -Wall -Wextra -fobjc-arc)
target_link_libraries(TraceCoreAudioProbe PRIVATE
  "-framework Foundation"
  "-framework CoreAudio"
  "-framework AudioToolbox"
)
