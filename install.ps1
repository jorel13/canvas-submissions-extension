# Installs or updates the Canvas Submitted Work extension files.
# Downloads the latest release ZIP and unpacks it to %LOCALAPPDATA%\CanvasSubmittedWork,
# then opens edge://extensions so the folder can be loaded (first install only).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$zipUrl = 'https://github.com/jorel13/canvas-submissions-extension/releases/latest/download/canvas-submitted-work.zip'
$dest = Join-Path $env:LOCALAPPDATA 'CanvasSubmittedWork'
$zip = Join-Path $env:TEMP 'canvas-submitted-work.zip'
$isUpdate = Test-Path (Join-Path $dest 'manifest.json')

Write-Host 'Downloading the latest version...'
Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $dest
Remove-Item $zip

$version = (Get-Content (Join-Path $dest 'manifest.json') -Raw | ConvertFrom-Json).version
Write-Host ''
Write-Host "Canvas Submitted Work $version is in $dest" -ForegroundColor Green

if ($isUpdate) {
    Write-Host 'Update done. Close and reopen Edge (or click Reload on the extension in edge://extensions) to use the new version.'
} else {
    Set-Clipboard -Value $dest
    Write-Host 'Finish in Edge (the folder path is already on your clipboard):'
    Write-Host '  1. Turn on "Developer mode" (left side of the Extensions page).'
    Write-Host '  2. Click "Load unpacked", paste the path into the folder box, and click "Select Folder".'
    Write-Host '  3. Click the puzzle-piece icon in the toolbar and pin "Canvas Submitted Work".'
    Start-Process 'msedge' 'edge://extensions'
}
