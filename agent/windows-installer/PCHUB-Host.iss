; PCHUB Host installer — build: ISCC.exe agent\windows-installer\PCHUB-Host.iss
#define AppName "PCHUB Host"
#define AppVersion "1.0.0"
#define AppPublisher "PCHUB"
#define AppURL "https://pchub.cloud"
#define ApiURL "https://api.pchub.cloud"
#define SourceDir "..\windows-prod"
#define OutputDir "output"

[Setup]
AppId={{A8F3C2E1-9B4D-4F6A-8C1E-2D5F7A9B3C4E}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/host
AppUpdatesURL={#AppURL}/host
DefaultDirName={sd}\PCHUB-Host
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir={#OutputDir}
OutputBaseFilename=PCHUB-Host-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\RUN-PCHUB.cmd
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Files]
Source: "{#SourceDir}\PCHUB-Setup.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\RUN-PCHUB.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\pchub-host.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\rustdesk.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\remote.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\Start PCHUB Agent.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\status-window.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\run-agent.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\stop-agent.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\allow-windows-defender.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\allow-windows-defender.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\add-to-startup.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\Start PCHUB Agent.bat"; WorkingDir: "{app}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Start PCHUB Agent.bat"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\PCHUB-Setup.ps1"" -Elevated -Silent"; Description: "Set up PCHUB host agent"; Flags: postinstall runascurrentuser waituntilterminated

[Code]
var
  PairingPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PairingPage := CreateInputQueryPage(wpWelcome,
    'Pair your PC with PCHUB',
    'Enter the pairing code from pchub.cloud/host',
    'Open https://pchub.cloud/host in your browser, click Generate pairing code, then paste it below.' + #13#10#13#10 +
    'The code expires in 30 minutes.');
  PairingPage.Add('Pairing code:', False);
  PairingPage.Add('PC name:', False);
  PairingPage.Add('City:', False);
  PairingPage.Values[0] := '';
  PairingPage.Values[1] := 'My Gaming PC';
  PairingPage.Values[2] := 'Manila';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PairingPage.ID then
  begin
    if Trim(PairingPage.Values[0]) = '' then
    begin
      MsgBox('Please enter your pairing code from pchub.cloud/host.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigJson: String;
  Code: String;
  PcName: String;
  City: String;
begin
  if CurStep = ssPostInstall then
  begin
    Code := Trim(PairingPage.Values[0]);
    PcName := Trim(PairingPage.Values[1]);
    City := Trim(PairingPage.Values[2]);
    if PcName = '' then PcName := 'My Gaming PC';
    if City = '' then City := 'Manila';

    ConfigJson :=
      '{' + #13#10 +
      '  "apiUrl": "{#ApiURL}",' + #13#10 +
      '  "pairingCode": "' + Code + '",' + #13#10 +
      '  "machineName": "' + PcName + '",' + #13#10 +
      '  "machineCity": "' + City + '",' + #13#10 +
      '  "priceCents": 50' + #13#10 +
      '}' + #13#10;

    SaveStringToFile(ExpandConstant('{app}\config.json'), ConfigJson, False);
  end;
end;
