# A kész telepítő kipróbálása valódi Windowson: csendes telepítés, ütemezett futás,
# kezelőfelület, eltávolítás. Bármilyen eltérésnél hibával áll le.
param([Parameter(Mandatory)][string]$Telepito)
$ErrorActionPreference = "Stop"
function Igaz($feltetel, $uzenet) { if (-not $feltetel) { throw "HIBA: $uzenet" } else { Write-Host "ok: $uzenet" } }

$app = Join-Path $env:LOCALAPPDATA "Programs\Tarhely-figyelo"
$adat = Join-Path $env:APPDATA "Tarhely-figyelo"

Write-Host "== Telepítés"
$p = Start-Process $Telepito -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CURRENTUSER", "/TASKS=asztal,utemezes", "/LOG=$env:TEMP\telepites.log" -Wait -PassThru
Igaz ($p.ExitCode -eq 0) "a telepítő 0-val lépett ki"
Igaz (Test-Path "$app\node\node.exe") "a hordozható Node ott van"
Igaz (Test-Path "$app\src\cli.ts") "a program ott van"
Igaz ((Get-ChildItem "$app\browsers" -Directory -Filter "chromium*").Count -gt 0) "a Chromium ott van"
Igaz (Test-Path ([Environment]::GetFolderPath("Desktop") + "\Tárhely-figyelő.lnk")) "van asztali ikon"
Igaz (Test-Path "$app\unins000.exe") "van eltávolító"

Write-Host "== Ütemezés a telepítés után"
$feladatok = schtasks /Query /FO CSV /NH | Select-String "Tarhely-figyelo-"
Igaz ($feladatok.Count -eq 3) "3 ütemezett feladat jött létre ($($feladatok.Count))"
$ut = & "$app\tarhely.cmd" utemezes allapot
$ut | ForEach-Object { Write-Host $_ }
Igaz (($ut -join "`n") -match "Bekapcsolva: igen") "az ütemezés bekapcsolt"

Write-Host "== Kezelőfelület"
$felulet = Start-Process "$app\tarhely.cmd" -ArgumentList "felulet", "--nincs-bongeszo", "--port", "8791" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\felulet.out" -RedirectStandardError "$env:TEMP\felulet.err"
$peldany = "$adat\felulet.json"
for ($i = 0; $i -lt 40 -and -not (Test-Path $peldany); $i++) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path $peldany)) { Get-Content "$env:TEMP\felulet.err" -ErrorAction SilentlyContinue; throw "A kezelőfelület nem indult el" }
$info = Get-Content $peldany -Raw | ConvertFrom-Json
$alap = "http://127.0.0.1:$($info.port)"
$null = Invoke-WebRequest "$alap/?k=$($info.token)" -SessionVariable ws -UseBasicParsing
$oldal = Invoke-WebRequest "$alap/" -WebSession $ws -UseBasicParsing
Igaz ($oldal.Content -match "Tárhely-figyelő") "az oldal betölt"
try { Invoke-WebRequest "$alap/api/allapot" -UseBasicParsing | Out-Null; throw "belépés nélkül is elérhető" } catch { Igaz ($_.Exception.Message -notmatch "belépés nélkül") "belépés nélkül nem elérhető" }
$h = @{ "x-tarhely" = "1" }
$st = (Invoke-WebRequest "$alap/api/allapot" -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
Igaz ($st.kesz -eq $true) "a kezdő beállításfájl létrejött és érvényes"
Igaz (($st.ellenorzes | Where-Object id -eq "chromium").ok -eq $true) "a felület látja a Chromiumot"
Igaz (($st.ellenorzes | Where-Object id -eq "ceglista").ok -eq $true) "a minta céglista létrejött"
Igaz ($st.utemezes.enabled -eq $true -and ($st.utemezes.times -join ",") -eq "08:00,12:00,16:00") "a felület látja az ütemezést"

Write-Host "== Ütemezés módosítása a felületről"
$r = Invoke-WebRequest "$alap/api/utemezes" -Method Post -WebSession $ws -Headers $h -ContentType "application/json" -Body '{"idopontok":["07:30","13:15"],"bekapcsolva":true}' -UseBasicParsing
$u = $r.Content | ConvertFrom-Json
Igaz (($u.times -join ",") -eq "07:30,13:15") "az új időpontok: $($u.times -join ', ')"
$feladatok = schtasks /Query /FO CSV /NH | Select-String "Tarhely-figyelo-"
Igaz ($feladatok.Count -eq 2) "a régi feladatok törlődtek, 2 maradt"

Write-Host "== Művelet a felületről (ellenőrzés)"
$null = Invoke-WebRequest "$alap/api/muvelet" -Method Post -WebSession $ws -Headers $h -ContentType "application/json" -Body '{"nev":"ellenorzes"}' -UseBasicParsing
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $m = (Invoke-WebRequest "$alap/api/muvelet" -WebSession $ws -UseBasicParsing).Content | ConvertFrom-Json
  if (-not $m.running) { break }
}
Igaz (-not $m.running) "az ellenőrzés befejeződött"
$m.lines | ForEach-Object { Write-Host "  $_" }
Igaz (($m.lines -join "`n") -match "Céglista: 1 cég") "az ellenőrzés a telepített programmal lefutott"

Write-Host "== Valódi ütemezett indítás (Feladatütemező -> wscript -> cmd -> Node)"
Remove-Item "$adat\adat\utolso-futas.json" -ErrorAction SilentlyContinue
$nev = (schtasks /Query /FO CSV /NH | Select-String "Tarhely-figyelo-" | Select-Object -First 1).Line.Split(",")[0].Trim('"').TrimStart("\")
schtasks /Run /TN $nev | Out-Null
$vege = $false
for ($i = 0; $i -lt 90 -and -not $vege; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path "$adat\adat\utolso-futas.json") { $vege = [bool]((Get-Content "$adat\adat\utolso-futas.json" -Raw | ConvertFrom-Json).finishedAt) }
}
Igaz $vege "az ütemezett feladat elindította a programot (utolso-futas.json megjelent)"
Write-Host (Get-Content "$adat\adat\utolso-futas.json" -Raw)

Write-Host "== Leállítás és eltávolítás"
Stop-Process -Id $felulet.Id -Force -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$app*" } | Stop-Process -Force
Start-Sleep -Seconds 2
$p = Start-Process "$app\unins000.exe" -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" -Wait -PassThru
Igaz ($p.ExitCode -eq 0) "az eltávolító 0-val lépett ki"
Start-Sleep -Seconds 2
Igaz (-not (Test-Path "$app\src")) "a program mappa eltűnt"
Igaz ((schtasks /Query /FO CSV /NH 2>$null | Select-String "Tarhely-figyelo-").Count -eq 0) "az ütemezett feladatok megszűntek"
Igaz (-not (Test-Path ([Environment]::GetFolderPath("Desktop") + "\Tárhely-figyelő.lnk"))) "az asztali ikon eltűnt"
Igaz (Test-Path "$adat\beallitasok.json") "a felhasználó beállításai megmaradtak"
Write-Host "MINDEN RENDBEN"
