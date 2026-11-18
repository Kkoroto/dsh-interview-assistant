# Build the WPF overlay with the .NET Framework compiler shipped with Windows.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'overlay\Overlay.cs'
$output = Join-Path $root 'overlay\LiveCaptionOverlay.exe'

$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path (Join-Path $framework 'csc.exe'))) {
  $framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319'
}
$csc = Join-Path $framework 'csc.exe'
$wpf = Join-Path $framework 'WPF'
if (-not (Test-Path $csc)) { throw 'csc.exe not found ( .NET Framework 4.x is required )' }
if (-not (Test-Path $wpf)) { throw 'WPF reference assemblies not found' }
if (-not (Test-Path $source)) { throw "Overlay source not found: $source" }

& $csc /nologo /target:winexe /out:$output `
  /r:"$wpf\PresentationFramework.dll" `
  /r:"$wpf\PresentationCore.dll" `
  /r:"$wpf\WindowsBase.dll" `
  /r:"$framework\System.Xaml.dll" `
  /r:"$framework\System.Web.Extensions.dll" `
  /r:"$framework\System.Drawing.dll" `
  /r:"$framework\System.Windows.Forms.dll" `
  $source
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }
Get-Item $output | Select-Object FullName, Length, LastWriteTime
