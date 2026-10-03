cmake_minimum_required(VERSION 3.22)
project(TraceDiagnostics LANGUAGES CXX)
if(NOT WIN32)
  message(FATAL_ERROR "Trace diagnostics require Windows WASAPI and the Windows SDK")
endif()

# These diagnostic executables use only the Windows SDK. Trace's application
# and native engine are built separately; no upstream addon is linked here.
add_executable(trace-capture-probe capture_probe.cpp)
target_compile_features(trace-capture-probe PRIVATE cxx_std_17)
target_compile_definitions(trace-capture-probe PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_link_libraries(trace-capture-probe PRIVATE ole32 avrt uuid)
target_compile_options(trace-capture-probe PRIVATE /W4 /EHsc /utf-8)

add_executable(trace-render-fixture ../m2/render_fixture.cpp)
target_compile_features(trace-render-fixture PRIVATE cxx_std_17)
target_compile_definitions(trace-render-fixture PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(trace-render-fixture PRIVATE /W4 /EHsc /utf-8)
target_link_libraries(trace-render-fixture PRIVATE ole32 uuid)
