# A Windows-telepítő összeállítása: portable Node.js + Chromium + a program, majd Inno Setup.
# Futtatás (Windowson): powershell -ExecutionPolicy Bypass -File telepito\epit.ps1
param([string]$Kimenet = "telepito\kimenet")
$ErrorActionPreference = "Stop"
$gyoker = Split-Path -Parent $PSScriptRoot
Set-Location $gyoker
$verzio = (Get-Content package.json -Raw | ConvertFrom-Json).version
$stage = Join-Path $gyoker "telepito\stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Write-Host "== Program másolása"
foreach ($e in @("src", "package.json", "package-lock.json", "beallitasok.minta.json", "tarhely.cmd", "futtatas.cmd", "futtatas-rejtett.vbs", "felulet.vbs", "UTMUTATO.md", "README.md", "LICENSE", "THIRD_PARTY.md")) {
  Copy-Item $e (Join-Path $stage $e) -Recurse -Force
}
Set-Content -Path (Join-Path $stage "telepitett.txt") -Value "Telepített változat: a beállítások a %APPDATA%\Tarhely-figyelo mappában vannak."

Write-Host "== Függőségek (csak éles)"
Push-Location $stage
npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci sikertelen" }
Pop-Location

Write-Host "== Node.js (hordozható)"
$index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
$node = ($index | Where-Object { $_.version -like "v22.*" } | Select-Object -First 1).version
Write-Host "Node $node"
$zip = Join-Path $env:TEMP "node-$node.zip"
Invoke-WebRequest "https://nodejs.org/dist/$node/node-$node-win-x64.zip" -OutFile $zip
Expand-Archive $zip -DestinationPath $env:TEMP -Force
Move-Item (Join-Path $env:TEMP "node-$node-win-x64") (Join-Path $stage "node")
foreach ($felesleges in @("npm", "npm.cmd", "npx", "npx.cmd", "corepack", "corepack.cmd", "node_modules", "include", "share")) {
  $p = Join-Path $stage "node\$felesleges"
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}

Write-Host "== Chromium"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $stage "browsers"
& (Join-Path $stage "node\node.exe") (Join-Path $stage "node_modules\playwright\cli.js") install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium telepítése sikertelen" }
Remove-Item Env:PLAYWRIGHT_BROWSERS_PATH

Write-Host "== Telepítő építése"
$iscc = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
if (-not (Test-Path $iscc)) { throw "Nincs Inno Setup (choco install innosetup)." }
& $iscc "/DVerzio=$verzio" "/DForras=$stage" "/O$Kimenet" "telepito\tarhely.iss"
if ($LASTEXITCODE -ne 0) { throw "Az Inno Setup hibával állt le" }
Get-ChildItem $Kimenet | ForEach-Object { Write-Host ("{0}  {1:N0} MB" -f $_.Name, ($_.Length / 1MB)) }
