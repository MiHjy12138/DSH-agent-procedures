param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$Name = $null,
  [switch]$Git,
  [switch]$WithHook
)

$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath($Path)
if (-not (Test-Path $target)) {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Write-Host "created project: $target"
}
if ($Git -and -not (Test-Path (Join-Path $target '.git'))) {
  git -C $target init 2>&1 | Out-Null
  Write-Host 'git init: done'
}

& (Join-Path $PSScriptRoot 'install-workspace.ps1') -Workspace $target -Name $Name -WithHook:$WithHook
