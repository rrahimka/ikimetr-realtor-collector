[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
  [string]$TaskName = 'IkiMetrRealtorCollector',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) { return }
if (-not $Force -and -not $PSCmdlet.ShouldContinue("Remove only Task Scheduler entry '$TaskName'?", 'Confirm uninstall')) { return }
if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister local collector autostart task')) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
