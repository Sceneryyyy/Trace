param([Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
$taskRun=Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
$taskResourcePath=Join-Path $taskRun.folder 'process-resources.json'
$taskSamples=[System.Collections.Generic.List[object]]::new()
while($true){
    $taskCurrent=Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
    $taskProcesses=@(Get-CimInstance Win32_Process -Filter "name='Trace.exe'")
    $taskIds=[System.Collections.Generic.HashSet[int]]::new()
    [void]$taskIds.Add([int]$taskRun.pid)
    do {
        $taskAdded=$false
        foreach($taskProcess in $taskProcesses){
            if($taskIds.Contains([int]$taskProcess.ParentProcessId) -and $taskIds.Add([int]$taskProcess.ProcessId)){$taskAdded=$true}
        }
    } while($taskAdded)
    $taskRows=@(foreach($taskProcess in $taskProcesses){
        if($taskIds.Contains([int]$taskProcess.ProcessId)){
            $taskMetrics=Get-Process -Id $taskProcess.ProcessId -ErrorAction SilentlyContinue
            if($taskMetrics){[ordered]@{pid=$taskMetrics.Id;workingSetBytes=$taskMetrics.WorkingSet64;privateBytes=$taskMetrics.PrivateMemorySize64;cpuSeconds=$taskMetrics.CPU;handles=$taskMetrics.HandleCount;threads=$taskMetrics.Threads.Count}}
        }
    })
    $taskSamples.Add([ordered]@{at=(Get-Date -Format o);stage=$taskCurrent.stage;processes=$taskRows})
    [ordered]@{kind='Owned packaged process tree sampled every 60 seconds';folder=$taskRun.folder;samples=$taskSamples} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $taskResourcePath
    if($taskCurrent.status -ne 'running' -or $taskRows.Count -eq 0){break}
    Start-Sleep -Seconds 60
}
