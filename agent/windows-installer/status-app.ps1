# PCHUB Host Status — small status window (packaged as PCHUB-Status.exe)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$Root = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\PCHUB-Host" }
$StatePath = Join-Path $Root ".agent-state.json"
$ConfigPath = Join-Path $Root "config.json"
$LogPath = Join-Path $Root "agent.log"

function Get-StatusColor($ok, $warn) {
  if ($ok) { return [System.Drawing.Color]::FromArgb(80, 220, 140) }
  if ($warn) { return [System.Drawing.Color]::FromArgb(240, 190, 60) }
  return [System.Drawing.Color]::FromArgb(240, 90, 90)
}

function Set-Row($label, $value, $ok, $warn) {
  $label.Text = $value
  $label.ForeColor = Get-StatusColor $ok $warn
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "PCHUB Host"
$form.Size = New-Object System.Drawing.Size(400, 340)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
$form.ForeColor = [System.Drawing.Color]::White

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Application
$notify.Text = "PCHUB Host"
$notify.Visible = $true
$notify.Add_DoubleClick({ $form.Show(); $form.WindowState = "Normal"; $form.BringToFront() })

$header = New-Object System.Windows.Forms.Label
$header.Text = "PCHUB Host"
$header.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(20, 16)
$header.Size = New-Object System.Drawing.Size(360, 32)
$header.ForeColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$form.Controls.Add($header) | Out-Null

$lblPc = New-Object System.Windows.Forms.Label
$lblPc.Location = New-Object System.Drawing.Point(20, 52)
$lblPc.Size = New-Object System.Drawing.Size(360, 22)
$lblPc.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblPc.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 170)
$form.Controls.Add($lblPc) | Out-Null

function New-StatusRow($title, $y) {
  $t = New-Object System.Windows.Forms.Label
  $t.Text = $title
  $t.Location = New-Object System.Drawing.Point(20, $y)
  $t.Size = New-Object System.Drawing.Size(120, 22)
  $t.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $t.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 150)
  $form.Controls.Add($t) | Out-Null
  $v = New-Object System.Windows.Forms.Label
  $v.Location = New-Object System.Drawing.Point(140, $y)
  $v.Size = New-Object System.Drawing.Size(240, 22)
  $v.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
  $form.Controls.Add($v) | Out-Null
  return $v
}

$valAgent = New-StatusRow "Website" 88
$valHeartbeat = New-StatusRow "Heartbeat" 116
$valSunshine = New-StatusRow "Sunshine" 144
$valTunnel = New-StatusRow "Relay" 172

$lblUpdated = New-Object System.Windows.Forms.Label
$lblUpdated.Location = New-Object System.Drawing.Point(20, 204)
$lblUpdated.Size = New-Object System.Drawing.Size(360, 20)
$lblUpdated.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$lblUpdated.ForeColor = [System.Drawing.Color]::FromArgb(120, 120, 130)
$form.Controls.Add($lblUpdated) | Out-Null

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = "Refresh"
$btnRefresh.Location = New-Object System.Drawing.Point(20, 236)
$btnRefresh.Size = New-Object System.Drawing.Size(90, 30)
$btnRefresh.FlatStyle = "Flat"
$btnRefresh.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$btnRefresh.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnRefresh) | Out-Null

$btnSite = New-Object System.Windows.Forms.Button
$btnSite.Text = "pchub.cloud"
$btnSite.Location = New-Object System.Drawing.Point(120, 236)
$btnSite.Size = New-Object System.Drawing.Size(110, 30)
$btnSite.FlatStyle = "Flat"
$btnSite.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$btnSite.ForeColor = [System.Drawing.Color]::White
$btnSite.Add_Click({ Start-Process "https://pchub.cloud" })
$form.Controls.Add($btnSite) | Out-Null

$btnRepair = New-Object System.Windows.Forms.Button
$btnRepair.Text = "Repair"
$btnRepair.Location = New-Object System.Drawing.Point(240, 236)
$btnRepair.Size = New-Object System.Drawing.Size(90, 30)
$btnRepair.FlatStyle = "Flat"
$btnRepair.BackColor = [System.Drawing.Color]::FromArgb(60, 140, 220)
$btnRepair.ForeColor = [System.Drawing.Color]::White
$btnRepair.Add_Click({
  $setup = Join-Path $Root "RUN-PCHUB.cmd"
  if (Test-Path $setup) { Start-Process $setup } else { Start-Process "https://pchub.cloud/host" }
})
$form.Controls.Add($btnRepair) | Out-Null

function Test-AgentProcess {
  $procs = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*pchub-host.ps1*" }
  return [bool]$procs
}

function Test-SunshineState {
  $svc = Get-Service -Name SunshineService, Sunshine, sunshine -ErrorAction SilentlyContinue | Select-Object -First 1
  $proc = Get-Process -Name sunshine -ErrorAction SilentlyContinue
  $installed = Test-Path "${env:ProgramFiles}\Sunshine\sunshine.exe"
  $running = ($svc -and $svc.Status -eq "Running") -or [bool]$proc
  return @{ Installed = $installed; Running = $running }
}

function Test-TunnelState {
  $wg = Get-Service -Name "WireGuardTunnel`$pchub-tunnel" -ErrorAction SilentlyContinue
  $installed = Test-Path "${env:ProgramFiles}\WireGuard\wireguard.exe"
  $running = $wg -and $wg.Status -eq "Running"
  return @{ Installed = $installed; Running = $running }
}

function Update-Status {
  $lblPc.Text = "PC not registered yet"
  Set-Row $valAgent "Checking…" $false $true
  Set-Row $valHeartbeat "Checking…" $false $true
  Set-Row $valSunshine "Checking…" $false $true
  Set-Row $valTunnel "Checking…" $false $true

  if (-not (Test-Path $StatePath)) {
    Set-Row $valAgent "Not registered" $false $false
    Set-Row $valHeartbeat "Stopped" $false $false
    $lblUpdated.Text = "Run PCHUB Host Setup first"
    return
  }

  try {
    $state = Get-Content $StatePath -Raw | ConvertFrom-Json
    $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    $api = $config.apiUrl.TrimEnd("/")
    $machine = Invoke-RestMethod -Uri "$api/api/machines/$($state.machineId)" -TimeoutSec 8
    $lblPc.Text = "$($machine.name) · $($machine.city)"
    Set-Row $valAgent $(if ($machine.online) { "Online" } else { "Offline" }) $machine.online (!$machine.online)
  } catch {
    Set-Row $valAgent "Unreachable" $false $true
  }

  $hb = Test-AgentProcess
  if (-not $hb -and (Test-Path $LogPath)) {
    $hb = (Get-Item $LogPath).LastWriteTime -gt (Get-Date).AddSeconds(-90)
  }
  Set-Row $valHeartbeat $(if ($hb) { "Running" } else { "Stopped" }) $hb (!$hb)

  $sun = Test-SunshineState
  if (-not $sun.Installed) {
    Set-Row $valSunshine "Not installed" $false $false
  } elseif ($sun.Running) {
    Set-Row $valSunshine "Running" $true $false
  } else {
    Set-Row $valSunshine "Stopped" $false $true
  }

  $tun = Test-TunnelState
  if (-not $tun.Installed) {
    Set-Row $valTunnel "Not installed" $false $false
  } elseif ($tun.Running) {
    Set-Row $valTunnel "Connected" $true $false
  } else {
    Set-Row $valTunnel "Stopped" $false $true
  }

  $lblUpdated.Text = "Updated " + (Get-Date -Format "HH:mm:ss")
  $notify.Text = "PCHUB Host — $(if ($hb) { 'Running' } else { 'Check status' })"
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({ Update-Status })
$timer.Start()

$btnRefresh.Add_Click({ Update-Status })

$form.Add_FormClosing({
  param($sender, $e)
  if ($e.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
    $e.Cancel = $true
    $form.Hide()
    $notify.ShowBalloonTip(3000, "PCHUB Host", "Still running in the tray. Double-click the icon to reopen.", [System.Windows.Forms.ToolTipIcon]::Info)
  }
})

$form.Add_Shown({ Update-Status })
[void][System.Windows.Forms.Application]::Run($form)
$notify.Dispose()
