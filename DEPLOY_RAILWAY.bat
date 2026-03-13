@echo off
title IArtLabs — Deploy VibeFlow Pro a Railway
color 0D
echo.
echo  =============================================
echo   IARTLABS - DEPLOY VIBEFLOW PRO A RAILWAY
echo  =============================================
echo.
echo  Esto sube tu app a GitHub para que Railway
echo  la despliegue automaticamente en:
echo  https://byflowapp.up.railway.app
echo.
echo  =============================================
echo.

cd /d "%~dp0"

:: Inicializar git si no existe
if not exist ".git" (
  echo  [0/4] Inicializando repositorio git...
  git init
  echo.
)

:: Configurar remote
echo  [1/4] Configurando repositorio remoto...
git remote remove origin 2>nul
git remote add origin https://github.com/ART449/VibeFlow_Pro.git
git branch -M main

:: Stage all files
echo  [2/4] Preparando archivos...
git add -A
echo.

:: Commit
echo  [3/4] Creando commit...
git commit -m "deploy: IArtLabs branding, licencias online, promos, legal, UX"
echo.

:: Push
echo  [4/4] Subiendo a GitHub...
echo.
echo  Si te pide usuario y contrasena:
echo    Usuario: ART449
echo    Contrasena: tu TOKEN de GitHub (ghp_...)
echo    (crealo en github.com/settings/tokens con permiso "repo")
echo.
git push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
  color 0A
  echo  =============================================
  echo   LISTO! Codigo subido exitosamente
  echo.
  echo   GitHub:  github.com/ART449/VibeFlow_Pro
  echo   Deploy:  byflowapp.up.railway.app
  echo.
  echo   Railway detectara el push automaticamente
  echo   y desplegara en 1-2 minutos.
  echo  =============================================
) else (
  color 0C
  echo  =============================================
  echo   ERROR al subir. Verifica:
  echo   1. Tu token de GitHub (ghp_...)
  echo   2. Que tengas internet
  echo   3. Que el repo exista en GitHub
  echo  =============================================
)
echo.
pause
