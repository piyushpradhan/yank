# Yank — PowerShell build wrapper for Windows users without make.
#
# Usage:
#   .\build.ps1            # same as `.\build.ps1 build`
#   .\build.ps1 install    # one-time js deps
#   .\build.ps1 dev        # hot-reload dev
#   .\build.ps1 build      # release installers
#   .\build.ps1 dist       # clean build + copy to dist-installers/
#   .\build.ps1 clean      # wipe target/bundle and dist-installers/

param(
    [ValidateSet('install', 'dev', 'build', 'dist', 'clean')]
    [string]$Target = 'build'
)

$ErrorActionPreference = 'Stop'
$DistDir = 'dist-installers'

function Invoke-Build {
    Write-Host "==> Building Yank for Windows" -ForegroundColor Cyan
    npm run tauri -- build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }

    $bundles = @(
        'src-tauri\target\release\bundle\msi\*.msi',
        'src-tauri\target\release\bundle\nsis\*setup.exe'
    )
    Write-Host "`n==> Artifacts:" -ForegroundColor Cyan
    Get-Item $bundles -ErrorAction SilentlyContinue | Format-Table Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB,1)}}, FullName
}

function Invoke-Dist {
    Invoke-Clean
    Invoke-Build
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
    Copy-Item -Force src-tauri\target\release\bundle\msi\*.msi $DistDir\ -ErrorAction SilentlyContinue
    Copy-Item -Force src-tauri\target\release\bundle\nsis\*setup.exe $DistDir\ -ErrorAction SilentlyContinue
    Write-Host "`n==> Installers copied to $DistDir\:" -ForegroundColor Green
    Get-ChildItem $DistDir | Format-Table Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB,1)}}
}

function Invoke-Clean {
    Write-Host "==> Cleaning bundle output" -ForegroundColor Cyan
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue src-tauri\target\release\bundle
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $DistDir
}

switch ($Target) {
    'install' { npm install }
    'dev'     { npm run tauri -- dev }
    'build'   { Invoke-Build }
    'dist'    { Invoke-Dist }
    'clean'   { Invoke-Clean }
}
