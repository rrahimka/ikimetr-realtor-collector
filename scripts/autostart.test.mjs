import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeProjectTempDir() {
  const dir = mkdtempSync(join(process.cwd(), '.autostart-test-'));
  tempDirs.push(dir);
  return dir;
}

function waitForFile(path, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (existsSync(path)) { resolve(); return; }
      if (Date.now() - started >= timeoutMs) { reject(new Error(`Timed out waiting for ${path}`)); return; }
      setTimeout(check, 25);
    };
    check();
  });
}

function toWindowsPath(path) {
  const match = /^\/mnt\/([a-z])\/(.*)$/iu.exec(path);
  if (!match) throw new Error(`Cannot convert WSL path: ${path}`);
  return `${match[1].toUpperCase()}:\\${match[2].replaceAll('/', '\\')}`;
}

describe('scripts/autostart.sh', () => {
  it('uses one flock instance, rotates bounded logs, and never prints environment secrets', async () => {
    const temp = makeProjectTempDir();
    const fakeNvm = join(temp, 'nvm');
    const bin = join(temp, 'bin');
    const state = join(temp, 'state');
    const started = join(temp, 'started');
    const release = join(temp, 'release');
    spawnSync('mkdir', ['-p', fakeNvm, bin, state]);
    writeFileSync(join(fakeNvm, 'nvm.sh'), 'nvm(){ return 0; }\n');
    writeFileSync(join(bin, 'pnpm'), '#!/usr/bin/env bash\nprintf started >"$IKIMETR_TEST_STARTED"\nwhile [ ! -f "$IKIMETR_TEST_RELEASE" ]; do sleep 0.05; done\nprintf ready\n', { mode: 0o755 });
    writeFileSync(join(state, 'collector.log'), Buffer.alloc(5_000_001, 65));
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      IKIMETR_NVM_DIR: fakeNvm,
      IKIMETR_PROJECT_DIR: process.cwd(),
      IKIMETR_AUTOSTART_STATE_DIR: state,
      IKIMETR_TEST_STARTED: started,
      IKIMETR_TEST_RELEASE: release,
      LOCAL_AUTH_PASSWORD: 'must-not-appear',
    };
    const first = spawn('bash', ['scripts/autostart.sh'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForFile(started);
    const second = spawnSync('bash', ['scripts/autostart.sh'], { cwd: process.cwd(), env, encoding: 'utf8' });
    expect(second.status).toBe(75);
    writeFileSync(release, 'release');
    const firstResult = await new Promise((resolve) => first.once('close', (code) => resolve(code)));
    expect(firstResult).toBe(0);
    expect(statSync(join(state, 'collector.log.1')).size).toBe(5_000_001);
    expect(readFileSync(join(state, 'collector.log'), 'utf8')).toContain('ready');
    expect(`${second.stdout}${second.stderr}`).not.toContain('must-not-appear');
  }, 15_000);
});

describe('Windows Task Scheduler scripts', () => {
  it('honors WhatIf, updates one task idempotently, reports status, and force-uninstalls only that task', () => {
    const temp = makeProjectTempDir();
    const harnessPath = join(temp, 'task-harness.ps1');
    const install = toWindowsPath(join(process.cwd(), 'scripts/windows/install-autostart.ps1'));
    const status = toWindowsPath(join(process.cwd(), 'scripts/windows/status-autostart.ps1'));
    const uninstall = toWindowsPath(join(process.cwd(), 'scripts/windows/uninstall-autostart.ps1'));
    const harness = `
$ErrorActionPreference = 'Stop'
$global:registerCount = 0
$global:unregisterCount = 0
$global:lastName = ''
$global:lastAction = $null
function wsl.exe { param([Parameter(ValueFromRemainingArguments=$true)][object[]]$Rest); $global:LASTEXITCODE = 0 }
function New-ScheduledTaskAction { param($Execute,$Argument); [pscustomobject]@{Execute=$Execute;Argument=$Argument} }
function New-ScheduledTaskTrigger { param([switch]$AtLogOn,$User); [pscustomobject]@{User=$User} }
function New-ScheduledTaskSettingsSet { param($MultipleInstances,$RestartCount,$RestartInterval,$ExecutionTimeLimit); [pscustomobject]@{Settings='bounded'} }
function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Settings,$User,$RunLevel,[switch]$Force); $global:registerCount++; $global:lastName=$TaskName; $global:lastAction=$Action; [pscustomobject]@{TaskName=$TaskName} }
function Get-ScheduledTask { param($TaskName,$ErrorAction); [pscustomobject]@{TaskName=$TaskName;State='Ready'} }
function Get-ScheduledTaskInfo { param($TaskName); [pscustomobject]@{LastRunTime=[datetime]'2026-08-25';LastTaskResult=0;NextRunTime=$null} }
function Unregister-ScheduledTask { param($TaskName,[switch]$Confirm); $global:unregisterCount++; $global:lastName=$TaskName }
& '${install}' -WhatIf
if ($global:registerCount -ne 0) { throw 'WhatIf registered a task' }
& '${install}'
& '${install}'
if ($global:registerCount -ne 2 -or $global:lastName -ne 'IkiMetrRealtorCollector') { throw 'Install was not idempotent' }
if ($global:lastAction.Execute -ne 'wsl.exe' -or $global:lastAction.Argument -notmatch '-d Ubuntu' -or $global:lastAction.Argument -notmatch '-u rahim') { throw 'Unexpected WSL action' }
$statusOutput = & '${status}' | Out-String
if ($statusOutput -notmatch 'Ready' -or $statusOutput -notmatch 'Last result') { throw 'Status output incomplete' }
& '${uninstall}' -Force -Confirm:$false
if ($global:unregisterCount -ne 1 -or $global:lastName -ne 'IkiMetrRealtorCollector') { throw 'Uninstall target mismatch' }
Write-Output 'task-harness-ok'
`;
    writeFileSync(harnessPath, harness);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', toWindowsPath(harnessPath)], { encoding: 'utf8' });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('task-harness-ok');
  });
});
