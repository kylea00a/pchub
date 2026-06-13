param(
  [Parameter(Mandatory = $true)]
  [string]$AgentRoot
)

$ErrorActionPreference = "Stop"
$AgentRoot = (Resolve-Path $AgentRoot).Path
$trayLog = Join-Path $AgentRoot "tray.log"

function Write-TrayLog([string]$Message) {
  Add-Content -Path $trayLog -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
}

try {
  Write-TrayLog "Starting tray (STA) at $AgentRoot"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$logFile = Join-Path $AgentRoot "agent.log"
$stateFile = Join-Path $AgentRoot ".agent-state.json"
$configFile = Join-Path $AgentRoot "config.json"

function Test-AgentProcess {
  $root = $AgentRoot.ToLower()
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine.ToLower().Contains("agent.cjs") -and
      $_.CommandLine.ToLower().Contains($root)
    }
}

function Get-MachineStatus {
  if (-not (Test-Path $stateFile) -or -not (Test-Path $configFile)) {
    return @{ process = $false; online = $false; name = "PCHUB Host" }
  }

  try {
    $config = Get-Content $configFile -Raw | ConvertFrom-Json
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    $api = ($config.apiUrl).TrimEnd("/")
    $machine = Invoke-RestMethod -Uri "$api/api/machines/$($state.machineId)" -TimeoutSec 10
    return @{
      process = [bool](Test-AgentProcess)
      online = [bool]$machine.online
      name = [string]$machine.name
      city = [string]$machine.city
    }
  } catch {
    return @{
      process = [bool](Test-AgentProcess)
      online = $false
      name = "PCHUB Host"
      city = ""
    }
  }
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$statusItem.Enabled = $false
[void]$menu.Items.Add($statusItem)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$openFleet = New-Object System.Windows.Forms.ToolStripMenuItem
$openFleet.Text = "Open pchub.cloud"
$openFleet.Add_Click({ Start-Process "https://pchub.cloud/#for-renters" })
[void]$menu.Items.Add($openFleet)

$openLogs = New-Object System.Windows.Forms.ToolStripMenuItem
$openLogs.Text = "Open agent.log"
$openLogs.Add_Click({
  if (Test-Path $logFile) { Start-Process notepad.exe $logFile }
})
[void]$menu.Items.Add($openLogs)

$restart = New-Object System.Windows.Forms.ToolStripMenuItem
$restart.Text = "Restart agent"
$restart.Add_Click({
  Start-Process -FilePath (Join-Path $AgentRoot "Start PCHUB Agent.bat") -WorkingDirectory $AgentRoot
})
[void]$menu.Items.Add($restart)

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$exit = New-Object System.Windows.Forms.ToolStripMenuItem
$exit.Text = "Exit (stop hosting)"
$exit.Add_Click({
  Start-Process -FilePath (Join-Path $AgentRoot "stop-agent.bat") -WorkingDirectory $AgentRoot -Wait
  $tray.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
[void]$menu.Items.Add($exit)

$tray.ContextMenuStrip = $menu

$lastBalloon = ""
function Update-Tray {
  $s = Get-MachineStatus
  if (-not $s.process) {
    $tray.Icon = [System.Drawing.SystemIcons]::Error
    $tray.Text = "PCHUB — Stopped"
    $statusItem.Text = "Status: Stopped (not listed)"
    $msg = "stopped"
  } elseif ($s.online) {
    $tray.Icon = [System.Drawing.SystemIcons]::Information
    $tray.Text = "PCHUB — Online ($($s.name))"
    $statusItem.Text = "Status: Online on pchub.cloud"
    $msg = "online"
  } else {
    $tray.Icon = [System.Drawing.SystemIcons]::Warning
    $tray.Text = "PCHUB — Connecting..."
    $statusItem.Text = "Status: Connecting (wait ~30s)"
    $msg = "connecting"
  }

  if ($msg -ne $script:lastBalloon -and $msg -eq "online") {
    $tray.ShowBalloonTip(4000, "PCHUB Host", "Your PC is now listed Online on pchub.cloud.", [System.Windows.Forms.ToolTipIcon]::Info)
    $script:lastBalloon = $msg
  }
  if ($msg -eq "stopped") { $script:lastBalloon = $msg }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({ Update-Tray })
$timer.Start()

Update-Tray
Write-TrayLog "Tray icon visible"
[void][System.Windows.Forms.Application]::Run()
} catch {
  Write-TrayLog ("TRAY ERROR: " + $_.Exception.Message)
  throw
}
