# Shared original-WAV gate. Public source archives intentionally omit private
# assets; CI/private release checks require them explicitly instead of skipping.
option(TRACE_REQUIRE_EBU "Require original private EBU WAV fixtures" OFF)
set(TRACE_EBU_ASSETS "${CMAKE_CURRENT_LIST_DIR}/../references/ebu-loudness-test-set-v5" CACHE PATH "EBU fixture inventory and original archive parts")
set(TRACE_EBU_RUNNER "${CMAKE_CURRENT_LIST_DIR}/../tools/metering/run-ebu-wav-tests.py")
set(TRACE_EBU_PROBE_SOURCE "${CMAKE_CURRENT_LIST_DIR}/../test/native/ebu_wav_probe.cpp")
function(trace_add_ebu_wav_gate library executable test_name native_reader)
  add_executable(${executable} "${TRACE_EBU_PROBE_SOURCE}")
  target_link_libraries(${executable} PRIVATE ${library})
  if(native_reader)
    if(NOT WIN32)
      message(FATAL_ERROR "The real Trace WavReader requires the Windows core target")
    endif()
    target_compile_definitions(${executable} PRIVATE TRACE_EBU_NATIVE_READER)
  endif()
  if(MSVC)
    target_compile_options(${executable} PRIVATE /W4 /EHsc /utf-8 /fp:precise)
  endif()
  if(EXISTS "${TRACE_EBU_ASSETS}/archive-manifest.json")
    find_package(Python3 3.9 REQUIRED COMPONENTS Interpreter)
    add_test(NAME ${test_name} COMMAND "${Python3_EXECUTABLE}" "${TRACE_EBU_RUNNER}"
      --probe $<TARGET_FILE:${executable}> --assets "${TRACE_EBU_ASSETS}"
      --report "${CMAKE_BINARY_DIR}/ebu-wav-results.json")
    # ASan original-file streaming can exceed 15 minutes on hosted runners.
    # Keep the numerical tolerances unchanged and bound the total gate runtime.
    set_tests_properties(${test_name} PROPERTIES TIMEOUT 1800)
  elseif(TRACE_REQUIRE_EBU)
    message(FATAL_ERROR "Private EBU assets required; clone the authorized private repository or set TRACE_EBU_ASSETS")
  else()
    message(STATUS "Private EBU assets absent: original-WAV gate not registered; no original-WAV pass is claimed")
  endif()
endfunction()
