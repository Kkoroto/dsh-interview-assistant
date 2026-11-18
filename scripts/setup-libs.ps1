# Install Python libraries used directly by this plugin into .\libs.
# These files are intentionally not committed (third-party binaries / wheels).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$libs = Join-Path $root 'libs'
$candidates = @()
if ($env:DSH_PROFILE_DIR) {
  $candidates += (Join-Path $env:DSH_PROFILE_DIR 'node_modules\dsh-cixisound\runtime\venv\Scripts\python.exe')
}
$candidates += 'D:\DSH-Plugins\dsh-cixisound\runtime\venv\Scripts\python.exe'
$candidates += (Join-Path $env:USERPROFILE 'DSH-Plugins\dsh-cixisound\runtime\venv\Scripts\python.exe')
$python = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $python) {
  throw 'dsh-cixisound Python venv not found. Install/enable dsh-cixisound first, or pass a custom environment.'
}
New-Item -ItemType Directory -Force -Path $libs | Out-Null

& $python -m pip install --upgrade --target $libs `
  'pykakasi==2.3.0' 'jaconv==0.5.0' 'wrapt==2.5.2' 'deprecated==3.0.1' `
  'sherpa-onnx==2.0.1' 'soundcard==0.4.6'
if ($LASTEXITCODE -ne 0) { throw "pip install failed with exit code $LASTEXITCODE" }

Write-Host "Installed libs into $libs"
