# Publica o agente (self-contained) e monta o pacote pronto pra distribuir:
# agent/dist/AssinaturaDigitalAgent.zip — contendo Agent.exe + os scripts do
# instalador. Rode isso sempre que atualizar o agente e quiser gerar um
# instalador novo pra mandar pra outra dentista.

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

    Copy-Item -Path (Join-Path $publishDir "Agent.exe") -Destination $installerDir -Force

    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    $zipPath = Join-Path $distDir "AssinaturaDigitalAgent.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

    $filesToZip = @(
        "Agent.exe",
        "Instalar.bat",
        "install.ps1",
        "Desinstalar.bat",
        "uninstall.ps1"
    ) | ForEach-Object { Join-Path $installerDir $_ }

    Compress-Archive -Path $filesToZip -DestinationPath $zipPath -Force

    Write-Host ""
    Write-Host "Pacote gerado em: $zipPath" -ForegroundColor Green
    Write-Host "Mande esse .zip pra dentista. Ela so precisa extrair e clicar em Instalar.bat." -ForegroundColor Green
}
finally {
    Pop-Location
}
