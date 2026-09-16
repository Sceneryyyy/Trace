param(
    [ValidateSet('Setup','Native','Check','Build','ProbeBuild','Probe','Smoke','Engine','AppBuild','App','Codecs','Package')]
    [string]$Action = 'Check',
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$traceNode = if ($nodeCommand) { $nodeCommand.Source } else {
    Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
}
if (!(Test-Path -LiteralPath $traceNode)) {
    throw 'Node.js is missing. Install/use the validated Node version from toolchain.m0.json.'
}
& $traceNode (Join-Path $PSScriptRoot 'tools/trace.cjs') $Action @Arguments
exit $LASTEXITCODE
