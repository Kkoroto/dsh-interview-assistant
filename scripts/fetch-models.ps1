# Download the three local models used by the plugin.
# Models are large (about 750 MB) and are intentionally not committed to Git.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root 'assets\models'
$small = Join-Path $models 'small'
$sense = Join-Path $models 'sensevoice'
$cam = Join-Path $models 'speaker-campplus.onnx'
New-Item -ItemType Directory -Force -Path $small, $sense | Out-Null

$hfHeaders = @()
if ($env:HF_TOKEN) { $hfHeaders = @('-H', "Authorization: Bearer $env:HF_TOKEN") }

function Get-Remote([string]$url, [string]$path, [string[]]$headers = @()) {
  if (Test-Path $path) { Write-Host "skip $path"; return }
  Write-Host "download $url"
  $curlArgs = @('-fL', '--retry', '5', '--retry-delay', '2', '-o', $path) + $headers + @($url)
  & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0) { throw "download failed: $url" }
}

$whisperBase = 'https://huggingface.co/Systran/faster-whisper-small/resolve/main'
Get-Remote "$whisperBase/model.bin" (Join-Path $small 'model.bin') $hfHeaders
Get-Remote "$whisperBase/config.json" (Join-Path $small 'config.json') $hfHeaders
Get-Remote "$whisperBase/tokenizer.json" (Join-Path $small 'tokenizer.json') $hfHeaders
Get-Remote "$whisperBase/vocabulary.txt" (Join-Path $small 'vocabulary.txt') $hfHeaders

$senseUrl = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2'
$tmp = Join-Path $env:TEMP ('sensevoice-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $archive = Join-Path $tmp 'sensevoice.tar.bz2'
  Get-Remote $senseUrl $archive
  & tar.exe -xjf $archive -C $tmp
  if ($LASTEXITCODE -ne 0) { throw 'tar extraction failed' }
  $model = Get-ChildItem $tmp -Recurse -Filter 'model.int8.onnx' | Select-Object -First 1
  $tokens = Get-ChildItem $tmp -Recurse -Filter 'tokens.txt' | Select-Object -First 1
  if (-not $model -or -not $tokens) { throw 'SenseVoice files not found in archive' }
  Copy-Item $model.FullName (Join-Path $sense 'model.int8.onnx') -Force
  Copy-Item $tokens.FullName (Join-Path $sense 'tokens.txt') -Force
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Get-Remote 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx' $cam

Write-Host "Models ready under $models"
Write-Host 'If HuggingFace is blocked in your network, use the release offline package or a mirror.'
