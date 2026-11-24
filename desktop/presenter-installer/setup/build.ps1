# Builds "Presenter Setup.exe" and, when the real installer is given, the zip people download.
#   powershell -File build.ps1                                  (just the setup program, in .\out)
#   powershell -File build.ps1 -Installer ..\..\presenter-app\dist\Presenter-Setup.exe -Zip
param([string]$Installer = '', [switch]$Zip, [string]$OutDir = (Join-Path $PSScriptRoot 'out'))
$ErrorActionPreference = 'Stop'
$fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $fw 'csc.exe'
$wpf = Join-Path $fw 'WPF'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$exe = Join-Path $OutDir 'Presenter Setup.exe'
$cargs = New-Object System.Collections.ArrayList
$null = $cargs.AddRange(@('/nologo', '/target:winexe', "/out:$exe", "/win32icon:$(Join-Path $PSScriptRoot 'assets\setup.ico')", '/optimize+',
  "/reference:$wpf\PresentationCore.dll", "/reference:$wpf\PresentationFramework.dll", "/reference:$wpf\WindowsBase.dll", "/reference:$fw\System.Xaml.dll"))
Get-ChildItem (Join-Path $PSScriptRoot 'assets') -File | Where-Object { $_.Extension -ne '.ico' } | ForEach-Object { $null = $cargs.Add("/resource:$($_.FullName),$($_.Name)") }
$null = $cargs.Add((Join-Path $PSScriptRoot 'Setup.cs'))
& $csc @($cargs.ToArray())
if ($LASTEXITCODE -ne 0) { throw 'The setup program did not compile.' }
Write-Host "Built $exe"
if ($Zip) {
  if (-not (Test-Path $Installer)) { throw "Installer not found: $Installer" }
  $stage = Join-Path $OutDir 'stage'; $dir = Join-Path $stage 'Presenter Setup'
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory -Force (Join-Path $dir 'files') | Out-Null
  Copy-Item $exe (Join-Path $dir 'Presenter Setup.exe')
  Copy-Item $Installer (Join-Path $dir 'files\Presenter-Installer.exe')
  Copy-Item (Join-Path $PSScriptRoot 'Read me first.txt') (Join-Path $dir 'Read me first.txt')
  $zipPath = Join-Path $OutDir 'Presenter-Windows-Setup.zip'
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Write-Host "Built $zipPath"
}
