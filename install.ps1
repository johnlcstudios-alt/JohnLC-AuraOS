# JohnLC AuraOS installer for Windows (PowerShell).
# Usage:  .\install.ps1 [-SkipBuild] [-NoLink] [-Dev] [-Mirror <url>]
#         powershell -ExecutionPolicy Bypass -File .\install.ps1
[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$NoLink,
  [switch]$Yes,
  [switch]$Dev,
  [switch]$Doctor,
  [string]$Mirror
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Write-Ok($msg)   { Write-Host "  " -NoNewline; Write-Host "✓" -ForegroundColor Green -NoNewline; Write-Host " $msg" }
function Write-Warn($msg) { Write-Host "  " -NoNewline; Write-Host "!" -ForegroundColor Yellow -NoNewline; Write-Host " $msg" }
function Write-Die($msg)  { Write-Host "  " -NoNewline; Write-Host "✖" -ForegroundColor Red -NoNewline; Write-Host " $msg"; exit 1 }

# --- locate Node ------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Die "Node.js was not found. Install Node 18+ from https://nodejs.org and re-run this script."
}

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
  Write-Die "Node $(& node -v) is too old. JohnLC AuraOS requires Node 18 or newer."
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Die "npm was not found. It normally ships with Node.js."
}

Write-Ok "Node $(& node -v) · npm $(& npm -v)"

# --- build the argument list and hand off to the shared installer -----------
$argsList = @()
if ($SkipInstall) { $argsList += '--skip-install' }
if ($SkipBuild)   { $argsList += '--skip-build' }
if ($NoLink)      { $argsList += '--no-link' }
if ($Yes)         { $argsList += '--yes' }
if ($Dev)         { $argsList += '--dev' }
if ($Doctor)      { $argsList += '--doctor' }
if ($Mirror)      { $argsList += @('--mirror', $Mirror) }

& node (Join-Path $root 'installer/setup.mjs') @argsList
exit $LASTEXITCODE
