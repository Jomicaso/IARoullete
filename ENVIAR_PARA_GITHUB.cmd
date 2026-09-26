@echo off
setlocal
cd /d "%~dp0"

echo A enviar a IARoullete para o GitHub...
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo Nao foi possivel enviar. Confirma que tens sessao iniciada no GitHub.
) else (
  echo.
  echo Projeto enviado com sucesso.
)

pause
