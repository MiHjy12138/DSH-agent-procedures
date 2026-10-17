param(
  [string]$Workspace = (Get-Location).Path,
  [string]$Name = $null,
  [switch]$WithHook
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$workspacePath = [IO.Path]::GetFullPath($Workspace)
if (-not (Test-Path $workspacePath)) {
  New-Item -ItemType Directory -Path $workspacePath -Force | Out-Null
}
if ([string]::IsNullOrWhiteSpace($Name)) {
  $Name = Split-Path $workspacePath -Leaf
}
$slug = ($Name.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
if ([string]::IsNullOrWhiteSpace($slug)) { $slug = 'project' }

$procDir = Join-Path $workspacePath 'procedures'
New-Item -ItemType Directory -Path $procDir -Force | Out-Null

$central = Join-Path $HOME '.agent-procedures\cards'
if (-not (Test-Path $central)) {
  throw "Central cards not found: $central"
}
$link = Join-Path $procDir 'central'
if (-not (Test-Path $link)) {
  if ($env:OS -eq 'Windows_NT') {
    New-Item -ItemType Junction -Path $link -Target $central | Out-Null
    Write-Host "linked: procedures\central -> $central"
  } else {
    New-Item -ItemType SymbolicLink -Path $link -Target $central | Out-Null
    Write-Host "linked: procedures/central -> $central"
  }
}

$indexSrc = Join-Path $repo 'templates\INDEX.template.md'
$indexDst = Join-Path $procDir 'INDEX.md'
if (-not (Test-Path $indexDst)) { Copy-Item $indexSrc $indexDst; Write-Host 'created: procedures/INDEX.md' }

$cardSrc = Join-Path $repo 'templates\card-template.project.md'
$cardDst = Join-Path $procDir '_模板.md'
if (-not (Test-Path $cardDst)) {
  (Get-Content $cardSrc -Raw).Replace('<PROJECT_SLUG>', $slug) | Set-Content $cardDst -Encoding utf8
  Write-Host 'created: procedures/_模板.md'
}

$projectSrc = Join-Path $repo 'templates\PROJECT.template.md'
$projectDst = Join-Path $procDir 'PROJECT.md'
if (-not (Test-Path $projectDst)) {
  (Get-Content $projectSrc -Raw).Replace('<PROJECT_NAME>', $Name).Replace('<PROJECT_SLUG>', $slug) |
    Set-Content $projectDst -Encoding utf8
  Write-Host 'created: procedures/PROJECT.md'
}

# Local-only link / inbox / generated catalog must not be committed.
$gitignore = Join-Path $workspacePath '.gitignore'
$ignoreEntries = @('procedures/central/', 'procedures/_inbox.md', 'procedures/catalog.jsonl')
$current = if (Test-Path $gitignore) { Get-Content $gitignore -Raw } else { '' }
$missing = $ignoreEntries | Where-Object { $current -notmatch [regex]::Escape($_) }
if ($missing) {
  $prefix = if ($current.Trim().Length -gt 0) { "`n" } else { '' }
  Add-Content -Path $gitignore -Value ($prefix + ($missing -join "`n")) -Encoding utf8
}

$snippet = Get-Content (Join-Path $repo 'templates\AGENTS-snippet.local.md') -Raw
$scope = (Get-Content (Join-Path $repo 'templates\PROJECT-scope.md') -Raw).Replace('<PROJECT_NAME>', $Name)
$fullBlock = "<!-- agent-procedures:begin -->`n$($snippet.Trim())`n<!-- agent-procedures:end -->"
$scopeBlock = "<!-- agent-procedures-project:begin -->`n$($scope.Trim())`n<!-- agent-procedures-project:end -->"

function Update-InstructionFile([string]$file) {
  $content = if (Test-Path $file) { Get-Content $file -Raw } else { '' }
  $content = [regex]::Replace($content, '<!-- agent-procedures:begin -->[\s\S]*?<!-- agent-procedures:end -->', '')
  $content = [regex]::Replace($content, '<!-- agent-procedures-project:begin -->[\s\S]*?<!-- agent-procedures-project:end -->', '')
  $content = $content.TrimEnd()
  $blocks = @()
  if ($WithHook) { $blocks += $fullBlock }
  $blocks += $scopeBlock
  if ($content.Length -gt 0) { $blocks = @($content) + $blocks }
  Set-Content -Path $file -Value ($blocks -join "`n`n") -Encoding utf8
  Write-Host "updated: $([IO.Path]::GetFileName($file))"
}

Update-InstructionFile (Join-Path $workspacePath 'AGENTS.md')
Update-InstructionFile (Join-Path $workspacePath 'CLAUDE.md')

# Build a compact catalog for lookup; the card content is never injected.
$build = Join-Path $repo 'scripts\build-catalog.mjs'
if (Test-Path $build) {
  & node $build $workspacePath 2>&1 | Select-Object -Last 3
}

Write-Host "procedures installed in: $workspacePath"
Write-Host "Project card library: procedures/ ; central library: procedures/central/"
if (-not $WithHook) {
  Write-Host "Note: full mechanism is expected from global AGENTS.md/CLAUDE.md; use -WithHook for harnesses that only read project files."
}
