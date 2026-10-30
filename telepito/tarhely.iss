; Tárhely-figyelő telepítő (Inno Setup 6). Építés: telepito\epit.ps1
; Felhasználónkénti telepítés: nem kér rendszergazdai jogot.

#ifndef Verzio
  #define Verzio "0.0.0"
#endif
#ifndef Forras
  #define Forras "stage"
#endif

[Setup]
AppId={{6F1E0C5A-3D77-4B7E-9C2B-7A5D3E8F1A42}
AppName=Tárhely-figyelő
AppVersion={#Verzio}
AppPublisher=baluxXx
DefaultDirName={localappdata}\Programs\Tarhely-figyelo
DefaultGroupName=Tárhely-figyelő
PrivilegesRequired=lowest
OutputBaseFilename=Tarhely-figyelo-telepito-{#Verzio}
Compression=lzma2/normal
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayName=Tárhely-figyelő
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "hu"; MessagesFile: "compiler:Languages\Hungarian.isl"

[Tasks]
Name: "asztal"; Description: "Ikon az &asztalon"; GroupDescription: "Parancsikonok:"
Name: "utemezes"; Description: "Automatikus futás beállítása hétköznap 8:00, 12:00 és 16:00 órára (később a programban módosítható)"; GroupDescription: "Automatikus futás:"; Flags: unchecked

[Dirs]
Name: "{userappdata}\Tarhely-figyelo"

[Files]
Source: "{#Forras}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Tárhely-figyelő"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\felulet.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\node\node.exe"; Comment: "A Tárhely-figyelő kezelőfelületének megnyitása"
Name: "{autodesktop}\Tárhely-figyelő"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\felulet.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\node\node.exe"; Tasks: asztal; Comment: "A Tárhely-figyelő kezelőfelületének megnyitása"

[Run]
Filename: "{app}\tarhely.cmd"; Parameters: "utemezes alkalmaz"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; Tasks: utemezes; StatusMsg: "Automatikus futás beállítása..."
Filename: "{sys}\wscript.exe"; Parameters: """{app}\felulet.vbs"""; WorkingDir: "{app}"; Description: "A Tárhely-figyelő megnyitása"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\tarhely.cmd"; Parameters: "utemezes torol"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "ütemezés törlése"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // A beállítások, a letöltött levelek és a napló (%APPDATA%\Tarhely-figyelo) megmaradnak, hacsak nem kéred a törlésüket.
  if (CurUninstallStep = usPostUninstall) and (not UninstallSilent) then
    if MsgBox('Törölhetem a beállításokat, a letöltött leveleket és a naplót is (' + ExpandConstant('{userappdata}\Tarhely-figyelo') + ')?' + #13#10 + #13#10 +
              'Ha később újra telepíted a programot, a „Nem” megtartja őket. A jelszavak a Windows kulcstartójában maradnak.',
              mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{userappdata}\Tarhely-figyelo'), True, True, True);
end;
