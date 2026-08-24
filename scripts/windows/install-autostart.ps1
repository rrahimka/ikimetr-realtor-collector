[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Low')]
param(
  [string]$TaskName = 'IkiMetrRealtorCollector',
  [string]$WindowsUser = 'HARMANKARDON\9305r',
  [string]$Distribution = 'Ubuntu',
  [string]$WslUser = 'rahim',
  [string]$RepositoryPath = '/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'WSL is not available' }
& wsl.exe -d $Distribution -u $WslUser -- bash -lc "test -f '$RepositoryPath/apps/web/.next/BUILD_ID' -a -x '$RepositoryPath/scripts/autostart.sh'"
if ($LASTEXITCODE -ne 0) { throw 'WSL distribution, user, repository, executable launcher, or production build is unavailable' }

$actionArguments = "-d $Distribution -u $WslUser --exec bash $RepositoryPath/scripts/autostart.sh"
$action = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument $actionArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $WindowsUser
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

if ($PSCmdlet.ShouldProcess($TaskName, 'Register or update local collector autostart task')) {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $WindowsUser `
    -RunLevel Limited `
    -Force | Out-Null
}
