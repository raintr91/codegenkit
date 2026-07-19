param(
  [string]$InstallDir = "$HOME\.codegenkit",
  [string]$Ref = "v0.6.0",
  [ValidateSet("fe", "be", "fullstack")]
  [string]$Type = "fe",
  [ValidateSet("nuxt4", "nextjs", "dotnet-line")]
  [string]$FeAdapter = "nuxt4",
  [ValidateSet("fastapi", "laravel", "dotnet-integration")]
  [string]$BeAdapter = "fastapi",
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
  pnpm install --frozen-lockfile
  pnpm build
} else {
  npm ci
  npm run build
}
Pop-Location

New-Item -ItemType Directory -Force $BinDir | Out-Null
"@node `"$InstallDir\bin\codegenkit.mjs`" %*" |
  Set-Content "$BinDir\codegenkit.cmd"
"@node `"$InstallDir\bin\codegenkit-mcp.mjs`" %*" |
  Set-Content "$BinDir\codegenkit-mcp.cmd"

Write-Host "Installed Codegenkit. Next:"
if ($Type -eq "fe") {
  Write-Host "  codegenkit init --type=fe --adapter=$FeAdapter --yes"
} elseif ($Type -eq "be") {
  Write-Host "  codegenkit init --type=be --adapter=$BeAdapter --yes"
} else {
  Write-Host "  codegenkit init --type=fullstack --fe-adapter=$FeAdapter --be-adapter=$BeAdapter --yes"
}
