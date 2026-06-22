# PCHUB Host Status - readiness checklist (packaged as PCHUB-Status.exe)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Threading

$Root = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\PCHUB-Host" }
$script:AllowExit = $false
$script:LastAgentRestartAt = 0

$mutex = New-Object System.Threading.Mutex($false, "Global\PCHUB-Host-Status-v1")
$ownsMutex = $false
try {
  $ownsMutex = $mutex.WaitOne(0, $false)
} catch {
  $ownsMutex = $false
}
if (-not $ownsMutex) {
  [System.Windows.Forms.MessageBox]::Show(
    "PCHUB Host is already running in the system tray.`n`nRight-click the tray icon and choose Exit to close the old one.",
    "PCHUB Host",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
  exit 0
}

function Query-PchubHostReadiness {
  param(
    [string]$Root,
    [switch]$CheckWebsite,
    [switch]$TryRepairHeartbeat,
    [switch]$RestartAgentIfOffline
  )
  $ps1 = Join-Path $Root "host-readiness.ps1"
  if (-not (Test-Path $ps1)) { throw "host-readiness.ps1 not found in $Root" }
  $ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $invokeArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ps1, "-Root", $Root, "-Format", "Json")
  if ($CheckWebsite) { $invokeArgs += "-CheckWebsite" }
  if ($TryRepairHeartbeat) { $invokeArgs += "-TryRepairHeartbeat" }
  if ($RestartAgentIfOffline) { $invokeArgs += "-RestartAgentIfOffline" }
  $json = (& $ps @invokeArgs 2>&1 | Out-String).Trim()
  if (-not $json) { throw "Readiness check returned no data" }
  if ($json -match 'cannot be loaded|execution policy') { throw $json }
  return ($json | ConvertFrom-Json)
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "PCHUB Host"
$form.Size = New-Object System.Drawing.Size(460, 520)
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

$trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $trayMenu.Items.Add("Open status")
$miExit = $trayMenu.Items.Add("Exit")
$miOpen.Add_Click({ $form.Show(); $form.WindowState = "Normal"; $form.BringToFront() })
$miExit.Add_Click({
  $script:AllowExit = $true
  $timer.Stop()
  $notify.Visible = $false
  $notify.Dispose()
  $form.Close()
})
$notify.ContextMenuStrip = $trayMenu

$header = New-Object System.Windows.Forms.Label
$header.Text = "PCHUB Host"
$header.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$header.Location = New-Object System.Drawing.Point(20, 14)
$header.Size = New-Object System.Drawing.Size(420, 28)
$header.ForeColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$form.Controls.Add($header) | Out-Null

$lblPc = New-Object System.Windows.Forms.Label
$lblPc.Location = New-Object System.Drawing.Point(20, 44)
$lblPc.Size = New-Object System.Drawing.Size(420, 20)
$lblPc.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblPc.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 170)
$form.Controls.Add($lblPc) | Out-Null

$banner = New-Object System.Windows.Forms.Panel
$banner.Location = New-Object System.Drawing.Point(20, 72)
$banner.Size = New-Object System.Drawing.Size(420, 52)
$banner.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$form.Controls.Add($banner) | Out-Null

$lblBanner = New-Object System.Windows.Forms.Label
$lblBanner.Location = New-Object System.Drawing.Point(12, 8)
$lblBanner.Size = New-Object System.Drawing.Size(396, 36)
$lblBanner.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$lblBanner.ForeColor = [System.Drawing.Color]::White
$lblBanner.Text = "Checking..."
$banner.Controls.Add($lblBanner) | Out-Null

$lblCheckTitle = New-Object System.Windows.Forms.Label
$lblCheckTitle.Text = "Readiness checklist"
$lblCheckTitle.Location = New-Object System.Drawing.Point(20, 134)
$lblCheckTitle.Size = New-Object System.Drawing.Size(200, 20)
$lblCheckTitle.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblCheckTitle.ForeColor = [System.Drawing.Color]::FromArgb(180, 180, 190)
$form.Controls.Add($lblCheckTitle) | Out-Null

$txtChecklist = New-Object System.Windows.Forms.TextBox
$txtChecklist.Location = New-Object System.Drawing.Point(20, 158)
$txtChecklist.Size = New-Object System.Drawing.Size(420, 168)
$txtChecklist.Multiline = $true
$txtChecklist.ReadOnly = $true
$txtChecklist.BorderStyle = "FixedSingle"
$txtChecklist.BackColor = [System.Drawing.Color]::FromArgb(14, 14, 18)
$txtChecklist.ForeColor = [System.Drawing.Color]::FromArgb(220, 220, 230)
$txtChecklist.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtChecklist.ScrollBars = "Vertical"
$form.Controls.Add($txtChecklist) | Out-Null

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Location = New-Object System.Drawing.Point(20, 332)
$lblHint.Size = New-Object System.Drawing.Size(420, 40)
$lblHint.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$lblHint.ForeColor = [System.Drawing.Color]::FromArgb(140, 140, 150)
$form.Controls.Add($lblHint) | Out-Null

$lblUpdated = New-Object System.Windows.Forms.Label
$lblUpdated.Location = New-Object System.Drawing.Point(20, 374)
$lblUpdated.Size = New-Object System.Drawing.Size(420, 18)
$lblUpdated.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$lblUpdated.ForeColor = [System.Drawing.Color]::FromArgb(120, 120, 130)
$form.Controls.Add($lblUpdated) | Out-Null

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = "Refresh"
$btnRefresh.Location = New-Object System.Drawing.Point(20, 404)
$btnRefresh.Size = New-Object System.Drawing.Size(90, 32)
$btnRefresh.FlatStyle = "Flat"
$btnRefresh.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$btnRefresh.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnRefresh) | Out-Null

$btnSite = New-Object System.Windows.Forms.Button
$btnSite.Text = "pchub.cloud"
$btnSite.Location = New-Object System.Drawing.Point(118, 404)
$btnSite.Size = New-Object System.Drawing.Size(100, 32)
$btnSite.FlatStyle = "Flat"
$btnSite.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$btnSite.ForeColor = [System.Drawing.Color]::White
$btnSite.Add_Click({ Start-Process "https://pchub.cloud/host" })
$form.Controls.Add($btnSite) | Out-Null

$btnRepair = New-Object System.Windows.Forms.Button
$btnRepair.Text = "Reinstall / Repair"
$btnRepair.Location = New-Object System.Drawing.Point(226, 404)
$btnRepair.Size = New-Object System.Drawing.Size(120, 32)
$btnRepair.FlatStyle = "Flat"
$btnRepair.BackColor = [System.Drawing.Color]::FromArgb(60, 140, 220)
$btnRepair.ForeColor = [System.Drawing.Color]::White
$btnRepair.Add_Click({
  Start-Process "https://pchub.cloud/downloads/PCHUB-Host-Setup.exe?v=2026.06.18.6"
})
$form.Controls.Add($btnRepair) | Out-Null

$btnExit = New-Object System.Windows.Forms.Button
$btnExit.Text = "Exit"
$btnExit.Location = New-Object System.Drawing.Point(354, 404)
$btnExit.Size = New-Object System.Drawing.Size(86, 32)
$btnExit.FlatStyle = "Flat"
$btnExit.BackColor = [System.Drawing.Color]::FromArgb(72, 40, 40)
$btnExit.ForeColor = [System.Drawing.Color]::White
$btnExit.Add_Click({ $miExit.PerformClick() })
$form.Controls.Add($btnExit) | Out-Null

function Update-Status {
  try {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $restartAgent = ($now -gt ($script:LastAgentRestartAt + 120))
    $r = Query-PchubHostReadiness -Root $Root -CheckWebsite -TryRepairHeartbeat -RestartAgentIfOffline:$restartAgent
    $agentItem = $r.Items | Where-Object { $_.Id -eq "agent" } | Select-Object -First 1
    if ($restartAgent -and $agentItem -and $agentItem.Detail -like "Restarted agent*") {
      $script:LastAgentRestartAt = $now
    }

    if ($r.MachineName) {
      $lblPc.Text = $r.MachineName
    } elseif ($r.Registered) {
      $lblPc.Text = "Registered host PC"
    } else {
      $lblPc.Text = "Not registered"
    }

    if ($r.ReadyToStream) {
      $banner.BackColor = [System.Drawing.Color]::FromArgb(24, 72, 48)
      $lblBanner.ForeColor = [System.Drawing.Color]::FromArgb(120, 255, 170)
      $lblBanner.Text = "READY TO STREAM"
      $lblHint.Text = "Keep this app running. When someone rents your PC, StreamHost starts automatically."
      $notify.Text = "PCHUB Host - Ready to stream"
    } else {
      $banner.BackColor = [System.Drawing.Color]::FromArgb(72, 32, 32)
      $lblBanner.ForeColor = [System.Drawing.Color]::FromArgb(255, 160, 140)
      $lblBanner.Text = "NOT READY TO STREAM"
      $lblHint.Text = "$($r.Summary) Right-click tray icon -> Exit to remove duplicate icons, then Reinstall / Repair."
      $notify.Text = "PCHUB Host - Setup incomplete"
    }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in $r.Items) {
      $mark = if ($item.Ok) { "[OK]  " } else { "[X]   " }
      $lines.Add("$mark $($item.Label)")
      if ($item.Detail) { $lines.Add("      $($item.Detail)") }
    }
    if ($r.StreamRunning) {
      $lines.Add("")
      $lines.Add("[OK]  Stream engine active for current rental")
    }
    $txtChecklist.Text = ($lines -join [Environment]::NewLine)
    $lblUpdated.Text = "Updated " + (Get-Date -Format "HH:mm:ss")
  } catch {
    $lblBanner.Text = "CHECK FAILED"
    $txtChecklist.Text = $_.Exception.Message
    $lblUpdated.Text = "Error " + (Get-Date -Format "HH:mm:ss")
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$timer.Add_Tick({ Update-Status })
$timer.Start()

$btnRefresh.Add_Click({ Update-Status })

$form.Add_FormClosing({
  param($sender, $e)
  if ($script:AllowExit) { return }
  if ($e.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
    $e.Cancel = $true
    $form.Hide()
    $notify.ShowBalloonTip(4000, "PCHUB Host", "Still in tray. Right-click -> Exit to quit.", [System.Windows.Forms.ToolTipIcon]::Info)
  }
})

$form.Add_Shown({ Update-Status })
[void][System.Windows.Forms.Application]::Run($form)
if ($ownsMutex) { try { $mutex.ReleaseMutex() } catch { } }
$mutex.Dispose()
