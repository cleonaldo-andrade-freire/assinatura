# Publica o agente (self-contained) e monta o pacote pronto pra distribuir:
# agent/dist/AssinaturaDigitalAgent.zip — contendo Agent.exe + os scripts do
# instalador, ja com a URL de producao atual embutida (o instalador nao
# pergunta nada pra dentista). Rode isso sempre que atualizar o agente OU o
# dominio de producao mudar, e quiser gerar um pacote novo pra distribuir.

param(
    [string]$ProductionUrl = "https://app.erodontologia.com.br"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Push-Location $root
try {
    Write-Host "Publicando o agente (self-contained, win-x64)..." -ForegroundColor Cyan
    dotnet publish -c Release
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish falhou (codigo $LASTEXITCODE)" }

    $publishDir = Join-Path $root "bin\Release\net8.0-windows\win-x64\publish"
    $installerDir = Join-Path $root "installer"
    $distDir = Join-Path $root "dist"
    $stagingDir = Join-Path $distDir "_staging"

    Copy-Item -Path (Join-Path $publishDir "Agent.exe") -Destination $installerDir -Force

    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
    New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

    # install.ps1 fica genérico no repositório (placeholder) — a URL de
    # produção só entra aqui, na cópia que vai pro .zip distribuído.
    Write-Host "Embutindo URL de producao: $ProductionUrl" -ForegroundColor Cyan
    $installScript = Get-Content (Join-Path $installerDir "install.ps1") -Raw
    $installScript = $installScript.Replace('__DEFAULT_PRODUCTION_URL__', $ProductionUrl)
    Set-Content -Path (Join-Path $stagingDir "install.ps1") -Value $installScript -Encoding UTF8

    Copy-Item -Path (Join-Path $installerDir "Agent.exe") -Destination $stagingDir
    Copy-Item -Path (Join-Path $installerDir "Instalar.bat") -Destination $stagingDir
    Copy-Item -Path (Join-Path $installerDir "Desinstalar.bat") -Destination $stagingDir
    Copy-Item -Path (Join-Path $installerDir "uninstall.ps1") -Destination $stagingDir

    $zipPath = Join-Path $distDir "AssinaturaDigitalAgent.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -Force
    Remove-Item -Recurse -Force $stagingDir

    Write-Host ""
    Write-Host "Pacote gerado em: $zipPath" -ForegroundColor Green
    Write-Host "Mande esse .zip pra dentista. Ela so precisa extrair e clicar em Instalar.bat, sem digitar nada." -ForegroundColor Green
}
finally {
    Pop-Location
}
