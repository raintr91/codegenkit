param(
  [string]$InstallDir = "$HOME\.codegenkit",
  [string]$Ref = "main",
  [ValidateSet("nuxt4", "nextjs")]
  [string]$Adapter = "nuxt4",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$BinDir = "$HOME\.local\bin"

if ($Uninstall) {
  Remove-Item "$BinDir\codegenkit.cmd" -Force -ErrorAction SilentlyContinue
  Remove-Item "$BinDir\codegenkit-mcp.cmd" -Force -ErrorAction SilentlyContinue
  Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Codegenkit uninstalled."
  exit 0
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("codegenkit-" + [guid]::NewGuid())
git clone --depth 1 --branch $Ref "https://github.com/raintr91/codegenkit.git" $TempDir
Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Move-Item $TempDir $InstallDir
Push-Location $InstallDir
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  pnpm install
  pnpm build
} else {
  npm install
  npm run build
}
Pop-Location

New-Item -ItemType Directory -Force $BinDir | Out-Null
"@node `"$InstallDir\bin\codegenkit.mjs`" %*" |
  Set-Content "$BinDir\codegenkit.cmd"
"@node `"$InstallDir\bin\codegenkit-mcp.mjs`" %*" |
  Set-Content "$BinDir\codegenkit-mcp.cmd"

Write-Host "Installed Codegenkit. Next:"
Write-Host "  codegenkit init --type=fe --adapter=$Adapter --yes"
