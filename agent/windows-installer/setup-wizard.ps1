# PCHUB Host Setup — graphical wizard (packaged as PCHUB-Host-Setup.exe)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:SiteUrl = "https://pchub.cloud"
$script:ApiUrl = "https://api.pchub.cloud"
$script:Dest = "C:\PCHUB-Host"
$script:Step = 0
$script:Installing = $false

function New-Label($text, $x, $y, $w, $parent, $muted) {
  $lbl = New-Object System.Windows.Forms.Label
  $lbl.Text = $text
  $lbl.Location = New-Object System.Drawing.Point($x, $y)
  $lbl.Size = New-Object System.Drawing.Size($w, 40)
  $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 10)
  if ($muted) { $lbl.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 110) }
  $parent.Controls.Add($lbl) | Out-Null
  return $lbl
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "PCHUB Host Setup"
$form.Size = New-Object System.Drawing.Size(540, 460)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
$form.ForeColor = [System.Drawing.Color]::White

$title = New-Object System.Windows.Forms.Label
$title.Text = "PCHUB Host"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(24, 16)
$title.Size = New-Object System.Drawing.Size(480, 36)
$title.ForeColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$form.Controls.Add($title) | Out-Null

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$subtitle.Location = New-Object System.Drawing.Point(24, 52)
$subtitle.Size = New-Object System.Drawing.Size(480, 24)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 170)
$form.Controls.Add($subtitle) | Out-Null

$panelWelcome = New-Object System.Windows.Forms.Panel
$panelWelcome.Location = New-Object System.Drawing.Point(0, 88)
$panelWelcome.Size = New-Object System.Drawing.Size(540, 260)
$panelWelcome.BackColor = $form.BackColor
$form.Controls.Add($panelWelcome) | Out-Null
New-Label @"
Welcome! This wizard registers your gaming PC on pchub.cloud so renters can book it.

You need a pairing code from pchub.cloud/host (valid 30 minutes).

Click Next to enter your code.
"@ 24 8 480 $panelWelcome $true | Out-Null

$panelDetails = New-Object System.Windows.Forms.Panel
$panelDetails.Location = New-Object System.Drawing.Point(0, 88)
$panelDetails.Size = New-Object System.Drawing.Size(540, 260)
$panelDetails.BackColor = $form.BackColor
$panelDetails.Visible = $false
$form.Controls.Add($panelDetails) | Out-Null

New-Label "Pairing code" 24 8 200 $panelDetails $true | Out-Null
$txtCode = New-Object System.Windows.Forms.TextBox
$txtCode.Location = New-Object System.Drawing.Point(24, 32)
$txtCode.Size = New-Object System.Drawing.Size(200, 28)
$txtCode.Font = New-Object System.Drawing.Font("Consolas", 12)
$txtCode.CharacterCasing = "Upper"
$panelDetails.Controls.Add($txtCode) | Out-Null

New-Label "PC name" 24 72 200 $panelDetails $true | Out-Null
$txtName = New-Object System.Windows.Forms.TextBox
$txtName.Location = New-Object System.Drawing.Point(24, 96)
$txtName.Size = New-Object System.Drawing.Size(280, 28)
$txtName.Text = "My Gaming PC"
$panelDetails.Controls.Add($txtName) | Out-Null

New-Label "City" 24 136 200 $panelDetails $true | Out-Null
$txtCity = New-Object System.Windows.Forms.TextBox
$txtCity.Location = New-Object System.Drawing.Point(24, 160)
$txtCity.Size = New-Object System.Drawing.Size(280, 28)
$txtCity.Text = "Manila"
$panelDetails.Controls.Add($txtCity) | Out-Null

$linkHost = New-Object System.Windows.Forms.LinkLabel
$linkHost.Text = "Open pchub.cloud/host to get a code"
$linkHost.Location = New-Object System.Drawing.Point(24, 200)
$linkHost.Size = New-Object System.Drawing.Size(400, 24)
$linkHost.LinkColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$linkHost.Add_LinkClicked({ Start-Process "https://pchub.cloud/host" })
$panelDetails.Controls.Add($linkHost) | Out-Null

$panelInstall = New-Object System.Windows.Forms.Panel
$panelInstall.Location = New-Object System.Drawing.Point(0, 88)
$panelInstall.Size = New-Object System.Drawing.Size(540, 260)
$panelInstall.BackColor = $form.BackColor
$panelInstall.Visible = $false
$form.Controls.Add($panelInstall) | Out-Null

$lblInstall = New-Object System.Windows.Forms.Label
$lblInstall.Location = New-Object System.Drawing.Point(24, 16)
$lblInstall.Size = New-Object System.Drawing.Size(480, 60)
$lblInstall.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$lblInstall.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$panelInstall.Controls.Add($lblInstall) | Out-Null

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(24, 88)
$progress.Size = New-Object System.Drawing.Size(480, 24)
$progress.Style = "Marquee"
$progress.MarqueeAnimationSpeed = 30
$progress.Visible = $false
$panelInstall.Controls.Add($progress) | Out-Null

$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Location = New-Object System.Drawing.Point(24, 128)
$txtLog.Size = New-Object System.Drawing.Size(480, 120)
$txtLog.Multiline = $true
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 34)
$txtLog.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtLog.Visible = $false
$panelInstall.Controls.Add($txtLog) | Out-Null

$panelDone = New-Object System.Windows.Forms.Panel
$panelDone.Location = New-Object System.Drawing.Point(0, 88)
$panelDone.Size = New-Object System.Drawing.Size(540, 260)
$panelDone.BackColor = $form.BackColor
$panelDone.Visible = $false
$form.Controls.Add($panelDone) | Out-Null
New-Label @"
Your PC is being registered on pchub.cloud.

PCHUB Host Status will open in your taskbar — keep it running.

Renters connect via Moonlight. No router setup needed on your end.
"@ 24 8 480 $panelDone $true | Out-Null

$btnBack = New-Object System.Windows.Forms.Button
$btnBack.Text = "Back"
$btnBack.Location = New-Object System.Drawing.Point(24, 368)
$btnBack.Size = New-Object System.Drawing.Size(100, 32)
$btnBack.FlatStyle = "Flat"
$btnBack.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$btnBack.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnBack) | Out-Null

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Text = "Next"
$btnNext.Location = New-Object System.Drawing.Point(404, 368)
$btnNext.Size = New-Object System.Drawing.Size(100, 32)
$btnNext.FlatStyle = "Flat"
$btnNext.BackColor = [System.Drawing.Color]::FromArgb(60, 140, 220)
$btnNext.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnNext) | Out-Null

function Show-Step {
  $panelWelcome.Visible = ($script:Step -eq 0)
  $panelDetails.Visible = ($script:Step -eq 1)
  $panelInstall.Visible = ($script:Step -eq 2)
  $panelDone.Visible = ($script:Step -eq 3)
  $btnBack.Enabled = ($script:Step -gt 0 -and $script:Step -lt 3 -and -not $script:Installing)
  switch ($script:Step) {
    0 { $subtitle.Text = "Step 1 of 3 — Welcome"; $btnNext.Text = "Next" }
    1 { $subtitle.Text = "Step 2 of 3 — Pair your PC"; $btnNext.Text = "Install" }
    2 { $subtitle.Text = "Installing…"; $btnNext.Enabled = $false; $btnBack.Enabled = $false }
    3 { $subtitle.Text = "Finished"; $btnNext.Text = "Finish"; $btnBack.Enabled = $false }
  }
}

function Add-InstallLog([string]$Line) {
  $txtLog.AppendText("$Line`r`n")
  [System.Windows.Forms.Application]::DoEvents()
}

function Install-PchubHost {
  $script:Installing = $true
  $progress.Visible = $true
  $txtLog.Visible = $true
  $lblInstall.Text = "Downloading host files and setting up Sunshine + relay…"

  $code = $txtCode.Text.Trim().ToUpper()
  $name = $txtName.Text.Trim()
  if (-not $name) { $name = "My Gaming PC" }
  $city = $txtCity.Text.Trim()
  if (-not $city) { $city = "Manila" }

  $zipPath = Join-Path $env:TEMP "PCHUB-Host-Agent.zip"
  $params = @(
    "code=$([uri]::EscapeDataString($code))"
    "machineName=$([uri]::EscapeDataString($name))"
    "machineCity=$([uri]::EscapeDataString($city))"
    "apiUrl=$([uri]::EscapeDataString($script:ApiUrl))"
  ) -join "&"
  $bundleUrl = "$($script:SiteUrl)/api/host/windows-bundle?$params"

  New-Item -ItemType Directory -Force -Path $script:Dest | Out-Null
  Add-InstallLog "Downloading bundle…"
  try {
    Invoke-WebRequest -Uri $bundleUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    $lblInstall.Text = "Download failed. Check your pairing code."
    Add-InstallLog $_.Exception.Message
    $progress.Visible = $false
    $script:Installing = $false
    $btnBack.Enabled = $true
    $btnNext.Enabled = $true
    $btnNext.Text = "Retry"
    return
  }

  Add-InstallLog "Extracting to $($script:Dest)…"
  Get-ChildItem $script:Dest -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne ".agent-state.json" } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path $zipPath -DestinationPath $script:Dest -Force
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

  Add-InstallLog "Downloading status app…"
  $statusExe = Join-Path $script:Dest "PCHUB-Status.exe"
  try {
    Invoke-WebRequest -Uri "$($script:SiteUrl)/downloads/PCHUB-Status.exe" -OutFile $statusExe -UseBasicParsing
  } catch {
    Add-InstallLog "Status app download skipped (will use built-in fallback)."
  }

  $setup = Join-Path $script:Dest "PCHUB-Setup.ps1"
  if (-not (Test-Path $setup)) {
    $lblInstall.Text = "Setup files missing in bundle."
    $script:Installing = $false
    $btnBack.Enabled = $true
    $btnNext.Enabled = $true
    return
  }

  Add-InstallLog "Running setup (admin)…"
  $proc = Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", "`"$setup`"", "-Elevated", "-Silent"
  ) -PassThru
  while (-not $proc.HasExited) {
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 150
  }

  $logPath = Join-Path $script:Dest "agent.log"
  if ($proc.ExitCode -ne 0 -and $null -ne $proc.ExitCode) {
    $lblInstall.Text = "Setup reported an error. See log below."
    Add-InstallLog "Exit code: $($proc.ExitCode)"
    if (Test-Path $logPath) {
      Add-InstallLog "--- agent.log ---"
      Get-Content $logPath -Tail 12 | ForEach-Object { Add-InstallLog $_ }
    }
    Add-InstallLog "Tip: generate a new code at pchub.cloud/host or reuse the same code on this PC."
    $progress.Visible = $false
    $script:Installing = $false
    $btnBack.Enabled = $true
    $btnNext.Enabled = $true
    $btnNext.Text = "Retry"
    return
  }

  $progress.Visible = $false
  $script:Installing = $false
  $script:Step = 3
  Show-Step
}

$btnBack.Add_Click({
  if ($script:Step -gt 0 -and -not $script:Installing) {
    $script:Step--
    Show-Step
  }
})

$btnNext.Add_Click({
  if ($script:Step -eq 0) {
    $script:Step = 1
    Show-Step
    return
  }
  if ($script:Step -eq 1) {
    if (-not $txtCode.Text.Trim()) {
      [System.Windows.Forms.MessageBox]::Show(
        "Enter your pairing code from pchub.cloud/host",
        "PCHUB Host Setup",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
      return
    }
    $script:Step = 2
    Show-Step
    Install-PchubHost
    return
  }
  if ($script:Step -eq 2 -and -not $script:Installing) {
    Install-PchubHost
    return
  }
  if ($script:Step -eq 3) {
    $form.Close()
  }
})

Show-Step
[void][System.Windows.Forms.Application]::Run($form)
