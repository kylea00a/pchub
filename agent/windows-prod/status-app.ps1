# PCHUB Host Status - readiness checklist (packaged as PCHUB-Status.exe)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = if ($PSScriptRoot) { $PSScriptRoot } else { "C:\PCHUB-Host" }

function Import-PchubHostReadiness {
  param([string]$Root)
  $path = Join-Path $Root "host-readiness.ps1"
  if (-not (Test-Path $path)) { throw "host-readiness.ps1 not found" }
  . ([scriptblock]::Create([System.IO.File]::ReadAllText($path)))
}

try {
  Import-PchubHostReadiness -Root $Root
} catch {
  [System.Windows.Forms.MessageBox]::Show(
    "Could not load readiness checklist:`n`n$($_.Exception.Message)",
    "PCHUB Host",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  ) | Out-Null
  exit 1
}

function Get-StatusColor($ok, $warn) {
  if ($ok) { return [System.Drawing.Color]::FromArgb(80, 220, 140) }
  if ($warn) { return [System.Drawing.Color]::FromArgb(240, 190, 60) }
  return [System.Drawing.Color]::FromArgb(240, 90, 90)
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
  $setupExe = Join-Path $env:USERPROFILE "Downloads\PCHUB-Host-Setup.exe"
  if (Test-Path $setupExe) {
    Start-Process $setupExe
  } else {
    Start-Process "https://pchub.cloud/downloads/PCHUB-Host-Setup.exe?v=2026.06.18.4"
  }
})
$form.Controls.Add($btnRepair) | Out-Null

function Update-Status {
  $r = Get-PchubHostReadiness -Root $Root -CheckWebsite

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
    $lblHint.Text = $r.Summary + " Click Reinstall / Repair after pchub.cloud publishes StreamHost, or Retry setup with a new pairing code."
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
    $notify.ShowBalloonTip(4000, "PCHUB Host", "Running in the tray. Double-click to see readiness checklist.", [System.Windows.Forms.ToolTipIcon]::Info)
  }
})

$form.Add_Shown({ Update-Status })
[void][System.Windows.Forms.Application]::Run($form)
$notify.Dispose()
