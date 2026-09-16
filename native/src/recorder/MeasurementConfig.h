#pragma once
namespace Trace {
// Any numerical/boundary change invalidates file history through this ID and
// the native binary SHA256. Do not attach v2 caches to this configuration.
inline constexpr const char* kMeasurementConfigId="trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned";
}
