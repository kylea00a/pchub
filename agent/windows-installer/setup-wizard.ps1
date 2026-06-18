# PCHUB Host Setup - graphical wizard (packaged as PCHUB-Host-Setup.exe)
$script:SetupLog = Join-Path $env:USERPROFILE "Desktop\PCHUB-Setup-Log.txt"
function Write-WizardLog([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [wizard] $Message"
  try { Add-Content -Path $script:SetupLog -Value $line -ErrorAction SilentlyContinue } catch { }
}

Write-WizardLog "Loading wizard..."
$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-WizardLog "Not admin - requesting elevation..."
  $ps = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $elevArgs = @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", $PSCommandPath)
  $elev = Start-Process -FilePath $ps -ArgumentList $elevArgs -Verb RunAs -Wait -PassThru
  exit $(if ($elev) { $elev.ExitCode } else { 1 })
}

try {
  $pchubRoot = "C:\PCHUB-Host"
  if (Test-Path "$pchubRoot\stop-agent.bat") {
    Write-WizardLog "Stopping existing PCHUB agent..."
    & cmd.exe /c "`"$pchubRoot\stop-agent.bat`" quiet" | Out-Null
  }
  New-Item -ItemType Directory -Force -Path $pchubRoot | Out-Null
  Add-MpPreference -ExclusionPath $pchubRoot -ErrorAction SilentlyContinue | Out-Null
} catch {
  Write-WizardLog "Preamble warning: $($_.Exception.Message)"
}

try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$script:InstallerBuild = "2026.06.18.1"
$script:SiteUrl = "https://pchub.cloud"
$script:ApiUrl = "https://api.pchub.cloud"
$script:Dest = "C:\PCHUB-Host"
$script:Step = 0
$script:Installing = $false

try {
  if ([enum]::GetNames([Net.SecurityProtocolType]) -contains "Tls12") {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  }
} catch { }

function New-FieldLabel($text, $parent, $y) {
  $lbl = New-Object System.Windows.Forms.Label
  $lbl.Text = $text
  $lbl.AutoSize = $true
  $lbl.Location = New-Object System.Drawing.Point(28, $y)
  $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $lbl.ForeColor = [System.Drawing.Color]::FromArgb(70, 70, 80)
  $lbl.BackColor = $parent.BackColor
  $parent.Controls.Add($lbl) | Out-Null
  return $lbl
}

function New-FieldInput($parent, $y, $width) {
  $tb = New-Object System.Windows.Forms.TextBox
  $tb.Location = New-Object System.Drawing.Point(28, ($y + 22))
  $tb.Size = New-Object System.Drawing.Size($width, 30)
  $tb.Font = New-Object System.Drawing.Font("Segoe UI", 11)
  $tb.BorderStyle = "Fixed3D"
  $tb.BackColor = [System.Drawing.SystemColors]::Window
  $tb.ForeColor = [System.Drawing.SystemColors]::WindowText
  $parent.Controls.Add($tb) | Out-Null
  return $tb
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "PCHUB Host Setup"
$form.ClientSize = New-Object System.Drawing.Size(500, 420)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
$form.ForeColor = [System.Drawing.Color]::White

$title = New-Object System.Windows.Forms.Label
$title.Text = "PCHUB Host"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(28, 20)
$title.ForeColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$form.Controls.Add($title) | Out-Null

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$subtitle.AutoSize = $true
$subtitle.Location = New-Object System.Drawing.Point(28, 54)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 170)
$form.Controls.Add($subtitle) | Out-Null

$buildLabel = New-Object System.Windows.Forms.Label
$buildLabel.Text = "Installer $script:InstallerBuild"
$buildLabel.AutoSize = $true
$buildLabel.Location = New-Object System.Drawing.Point(360, 54)
$buildLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$buildLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 110)
$form.Controls.Add($buildLabel) | Out-Null

$contentTop = 88
$contentHeight = 248

$panelWelcome = New-Object System.Windows.Forms.Panel
$panelWelcome.Location = New-Object System.Drawing.Point(0, $contentTop)
$panelWelcome.Size = New-Object System.Drawing.Size(500, $contentHeight)
$panelWelcome.BackColor = $form.BackColor
$form.Controls.Add($panelWelcome) | Out-Null

$welcomeText = New-Object System.Windows.Forms.Label
$welcomeText.Text = @"
Welcome! This wizard registers your gaming PC on pchub.cloud.

Get a pairing code at pchub.cloud/host (valid 30 minutes), then click Next.
"@
$welcomeText.Location = New-Object System.Drawing.Point(28, 12)
$welcomeText.Size = New-Object System.Drawing.Size(440, 120)
$welcomeText.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$welcomeText.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$panelWelcome.Controls.Add($welcomeText) | Out-Null

$panelDetails = New-Object System.Windows.Forms.Panel
$panelDetails.Location = New-Object System.Drawing.Point(16, $contentTop)
$panelDetails.Size = New-Object System.Drawing.Size(468, $contentHeight)
$panelDetails.BackColor = [System.Drawing.Color]::FromArgb(248, 248, 250)
$panelDetails.Visible = $false
$form.Controls.Add($panelDetails) | Out-Null

$y = 8
New-FieldLabel "Pairing code" $panelDetails $y | Out-Null
$txtCode = New-FieldInput $panelDetails $y 404
$txtCode.Font = New-Object System.Drawing.Font("Consolas", 12)
$txtCode.CharacterCasing = "Upper"
$txtCode.MaxLength = 12

$y = 72
New-FieldLabel "PC name" $panelDetails $y | Out-Null
$txtName = New-FieldInput $panelDetails $y 404
$txtName.Text = "My Gaming PC"

$y = 136
New-FieldLabel "City" $panelDetails $y | Out-Null
$txtCity = New-FieldInput $panelDetails $y 404
$txtCity.Text = "Manila"

$linkHost = New-Object System.Windows.Forms.LinkLabel
$linkHost.Text = "Open pchub.cloud/host to get a code"
$linkHost.AutoSize = $true
$linkHost.Location = New-Object System.Drawing.Point(28, 200)
$linkHost.LinkColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$linkHost.BackColor = [System.Drawing.Color]::Transparent
$linkHost.Add_LinkClicked({ Start-Process "https://pchub.cloud/host" })
$panelDetails.Controls.Add($linkHost) | Out-Null

$panelInstall = New-Object System.Windows.Forms.Panel
$panelInstall.Location = New-Object System.Drawing.Point(0, $contentTop)
$panelInstall.Size = New-Object System.Drawing.Size(500, $contentHeight)
$panelInstall.BackColor = $form.BackColor
$panelInstall.Visible = $false
$form.Controls.Add($panelInstall) | Out-Null

$lblInstall = New-Object System.Windows.Forms.Label
$lblInstall.Location = New-Object System.Drawing.Point(28, 12)
$lblInstall.Size = New-Object System.Drawing.Size(440, 48)
$lblInstall.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$lblInstall.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$panelInstall.Controls.Add($lblInstall) | Out-Null

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(28, 68)
$progress.Size = New-Object System.Drawing.Size(440, 22)
$progress.Style = "Marquee"
$progress.MarqueeAnimationSpeed = 30
$progress.Visible = $false
$panelInstall.Controls.Add($progress) | Out-Null

$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Location = New-Object System.Drawing.Point(28, 100)
$txtLog.Size = New-Object System.Drawing.Size(440, 130)
$txtLog.Multiline = $true
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 34)
$txtLog.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtLog.BorderStyle = "FixedSingle"
$txtLog.Visible = $false
$panelInstall.Controls.Add($txtLog) | Out-Null

$panelDone = New-Object System.Windows.Forms.Panel
$panelDone.Location = New-Object System.Drawing.Point(0, $contentTop)
$panelDone.Size = New-Object System.Drawing.Size(500, $contentHeight)
$panelDone.BackColor = $form.BackColor
$panelDone.Visible = $false
$form.Controls.Add($panelDone) | Out-Null

$doneText = New-Object System.Windows.Forms.Label
$doneText.Text = @"
Your PC is registered on pchub.cloud.

PCHUB Host opens in your taskbar - keep it running.
Renters connect with PCHUB Renter (native WebRTC streaming - not Moonlight).
"@
$doneText.Location = New-Object System.Drawing.Point(28, 12)
$doneText.Size = New-Object System.Drawing.Size(440, 120)
$doneText.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$doneText.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 210)
$panelDone.Controls.Add($doneText) | Out-Null

$btnBack = New-Object System.Windows.Forms.Button
$btnBack.Text = "Back"
$btnBack.Location = New-Object System.Drawing.Point(28, 352)
$btnBack.Size = New-Object System.Drawing.Size(100, 36)
$btnBack.FlatStyle = "Flat"
$btnBack.BackColor = [System.Drawing.Color]::FromArgb(40, 40, 48)
$btnBack.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnBack) | Out-Null

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.Text = "Next"
$btnNext.Location = New-Object System.Drawing.Point(368, 352)
$btnNext.Size = New-Object System.Drawing.Size(100, 36)
$btnNext.FlatStyle = "Flat"
$btnNext.BackColor = [System.Drawing.Color]::FromArgb(60, 140, 220)
$btnNext.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($btnNext) | Out-Null

function Show-Step {
  $panelWelcome.Visible = ($script:Step -eq 0)
  $panelDetails.Visible = ($script:Step -eq 1)
  $panelInstall.Visible = ($script:Step -eq 2)
  $panelDone.Visible = ($script:Step -eq 3)

  if ($script:Step -eq 1) {
    $panelDetails.BringToFront()
    $txtCode.Focus()
    $txtCode.Select()
  }

  $btnBack.Enabled = ($script:Step -gt 0 -and $script:Step -lt 3 -and -not $script:Installing)
  $btnNext.Enabled = ($script:Step -ne 2 -or -not $script:Installing)

  switch ($script:Step) {
    0 { $subtitle.Text = "Step 1 of 3 - Welcome"; $btnNext.Text = "Next" }
    1 { $subtitle.Text = "Step 2 of 3 - Pair your PC"; $btnNext.Text = "Install" }
    2 { $subtitle.Text = "Installing..."; $btnNext.Enabled = $false; $btnBack.Enabled = $false }
    3 { $subtitle.Text = "Finished"; $btnNext.Text = "Finish"; $btnBack.Enabled = $false }
  }
}

function Add-InstallLog([string]$Line) {
  $txtLog.AppendText("$Line`r`n")
  [System.Windows.Forms.Application]::DoEvents()
}

function Complete-InstallUi([bool]$Failed) {
  $progress.Visible = $false
  $script:Installing = $false
  if ($Failed) {
    $btnBack.Enabled = $true
    $btnNext.Enabled = $true
    $btnNext.Text = "Retry"
    Show-Step
  }
}

function Install-PchubHost {
  $script:Installing = $true
  $progress.Visible = $true
  $txtLog.Visible = $true
  $txtLog.Clear()
  $lblInstall.Text = "Downloading and setting up your host PC..."

  try {
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
  Add-InstallLog "Downloading bundle..."
  try {
    Invoke-WebRequest -Uri $bundleUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    $lblInstall.Text = "Download failed. Check your pairing code."
    Add-InstallLog "Download failed. Check your pairing code."
    Add-InstallLog $_.Exception.Message
    Complete-InstallUi $true
    return
  }

  Add-InstallLog "Extracting to $($script:Dest)..."
  $statePath = Join-Path $script:Dest ".agent-state.json"
  $keepState = $false
  if (Test-Path $statePath) {
    try {
      $oldState = Get-Content $statePath -Raw | ConvertFrom-Json
      $oldCode = if ($oldState.pairingCode) { "$($oldState.pairingCode)".Trim().ToUpper() } else { "" }
      if ($oldCode -eq $code) { $keepState = $true }
    } catch { }
  }

  Get-ChildItem $script:Dest -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne ".agent-state.json" -or -not $keepState } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  if (-not $keepState -and (Test-Path $statePath)) {
    Remove-Item $statePath -Force -ErrorAction SilentlyContinue
    Add-InstallLog "Cleared old registration for new pairing code."
  }

  Expand-Archive -Path $zipPath -DestinationPath $script:Dest -Force
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

  $configPath = Join-Path $script:Dest "config.json"
  if (-not (Test-Path $configPath)) {
    $lblInstall.Text = "Install files incomplete (config.json missing)."
    Add-InstallLog "ERROR: config.json not found after extract."
    Get-ChildItem $script:Dest -ErrorAction SilentlyContinue | ForEach-Object { Add-InstallLog "  $($_.Name)" }
    Complete-InstallUi $true
    return
  }

  $runInstall = Join-Path $script:Dest "run-install.ps1"
  if (-not (Test-Path $runInstall)) {
    $lblInstall.Text = "Install scripts missing from bundle."
    Add-InstallLog "ERROR: run-install.ps1 not found"
    Complete-InstallUi $true
    return
  }

  Add-InstallLog "Installing (build $script:InstallerBuild)..."
  $setupLog = Join-Path $script:Dest "setup.log"
  $lastLogLine = 0

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runInstall`" -Silent"
  $psi.WorkingDirectory = $script:Dest
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $installProc = [System.Diagnostics.Process]::Start($psi)
  while (-not $installProc.HasExited) {
    if (Test-Path $setupLog) {
      $lines = @(Get-Content $setupLog -ErrorAction SilentlyContinue)
      if ($lines.Count -gt $lastLogLine) {
        for ($i = $lastLogLine; $i -lt $lines.Count; $i++) {
          $line = $lines[$i]
          if ($line -match '\[(\d)/5\]') {
            $lblInstall.Text = "Step $($Matches[1]) of 5 - $($line -replace '^\[[^\]]+\]\s*','')"
          }
          Add-InstallLog $line
        }
        $lastLogLine = $lines.Count
      }
    }
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 400
  }
  $installExit = $installProc.ExitCode

  if (Test-Path $setupLog) {
    $lines = @(Get-Content $setupLog -ErrorAction SilentlyContinue)
    if ($lines.Count -gt $lastLogLine) {
      for ($i = $lastLogLine; $i -lt $lines.Count; $i++) {
        Add-InstallLog $lines[$i]
      }
    }
  }
  $agentLog = Join-Path $script:Dest "agent.log"
  if (Test-Path $agentLog) {
    Add-InstallLog "--- agent.log ---"
    Get-Content $agentLog -Tail 12 | ForEach-Object { Add-InstallLog $_ }
  }

  $registered = $false
  if (Test-Path $statePath) {
    try {
      $st = Get-Content $statePath -Raw | ConvertFrom-Json
      $registered = [bool]$st.machineId
    } catch { }
  }

  $onceLog = Join-Path $script:Dest "agent-once.log"
  if (Test-Path $onceLog) {
    Add-InstallLog "--- agent-once.log ---"
    Get-Content $onceLog -Tail 20 | ForEach-Object { Add-InstallLog $_ }
  }

  if ($installExit -ne 0 -and -not $registered) {
    $lblInstall.Text = "Setup failed. See log below."
    Add-InstallLog "Install exit code: $installExit"
    if (-not (Test-Path $setupLog) -or -not (Get-Content $setupLog -ErrorAction SilentlyContinue)) {
      Add-InstallLog "No setup.log — check Desktop\PCHUB-Setup-Log.txt and C:\PCHUB-Host\agent-once.log"
    }
    Complete-InstallUi $true
    return
  }

  if ($installExit -ne 0) {
    Add-InstallLog "Finished with warnings - PC is registered."
  }

  $script:Step = 3
  $progress.Visible = $false
  $script:Installing = $false
  Show-Step

  } catch {
    $lblInstall.Text = "Unexpected error during install."
    Add-InstallLog $_.Exception.Message
    Complete-InstallUi $true
  }
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
      $txtCode.Focus()
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

$form.Add_Shown({
  Show-Step
  if ($script:Step -eq 1) { $txtCode.Focus() }
})

try {
[void][System.Windows.Forms.Application]::Run($form)
Write-WizardLog "Wizard closed normally."
} catch {
  Write-WizardLog "Wizard error: $($_.Exception.Message)"
  try {
    [void][System.Windows.Forms.MessageBox]::Show(
      $_.Exception.Message,
      "PCHUB Host Setup",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    Write-Host $_.Exception.Message
    Read-Host "Press Enter"
  }
  exit 1
}

} catch {
  Write-WizardLog "FATAL before UI: $($_.Exception.Message)"
  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [void][System.Windows.Forms.MessageBox]::Show(
      "PCHUB setup could not start:`n`n$($_.Exception.Message)`n`nSee Desktop\PCHUB-Setup-Log.txt",
      "PCHUB Host Setup",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    Write-Host "PCHUB setup failed: $($_.Exception.Message)"
    Write-Host "Log: $script:SetupLog"
    Read-Host "Press Enter"
  }
  exit 1
}
