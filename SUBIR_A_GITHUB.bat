@echo off
title BYFLOW — Subir a GitHub
color 0A
echo.
echo  =============================================
echo   BYFLOW - SUBIR VIBEFLOW PRO A GITHUB
echo  =============================================
echo.
echo  Esto va a subir tu app a GitHub para poder
echo  deployarla en Railway (nube).
echo.

cd /d "%~dp0"

echo  [1/3] Configurando repositorio...
git remote remove origin 2>nul
git remote add origin https://github.com/Arturo98/vibeflow-pro.git
git branch -M main

echo.
echo  [2/3] Iniciando sesion en GitHub...
echo.
echo  - Usuario: Arturo98
echo  - Contrasena: pega tu TOKEN de GitHub (ghp_...)
echo    (ve a github.com/settings/tokens para crearlo)
echo.

git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
  echo  =============================================
  echo   LISTO! Codigo subido a GitHub exitosamente
  echo   github.com/Arturo98/vibeflow-pro
  echo  =============================================
) else (
  echo  =============================================
  echo   ERROR - Verifica tu token e intentalo de nuevo
  echo  =============================================
)
echo.
pause
