[CmdletBinding()]
param([string]$TaskName = 'IkiMetrRealtorCollector')

$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  [pscustomobject]@{ 'Task name' = $TaskName; State = 'Not installed'; 'Last run' = $null; 'Last result' = $null; 'Next run' = $null }
  return
}
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
  'Task name' = $TaskName
  State = $task.State
  'Last run' = $info.LastRunTime
  'Last result' = $info.LastTaskResult
  'Next run' = $info.NextRunTime
}
