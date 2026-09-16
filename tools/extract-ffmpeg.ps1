param([Parameter(Mandatory=$true)][string]$ArchivePath,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$package = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
    $wanted = @{
        '/bin/ffmpeg.exe' = 'bin/ffmpeg.exe'
        '/bin/ffprobe.exe' = 'bin/ffprobe.exe'
        '/LICENSE' = 'LICENSE'
        '/README.txt' = 'README.txt'
    }
    foreach ($suffix in $wanted.Keys) {
        $matches = @($package.Entries | Where-Object { $_.FullName.EndsWith($suffix,[StringComparison]::Ordinal) })
        if ($matches.Count -ne 1) { throw "Expected exactly one archive entry: $suffix" }
        $target = Join-Path $OutputDirectory $wanted[$suffix]
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($matches[0],$target,$false)
    }
} finally { $package.Dispose() }
