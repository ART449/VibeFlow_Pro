@echo off
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title VibeFlow Pro

echo.
echo  =============================================
echo   VIBEFLOW PRO - Iniciando...
echo  =============================================
echo.

REM ── Check Node.js ──
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargalo: https://nodejs.org/
    echo Marca "Add to PATH" al instalar.
    pause
    exit /b 1
)
echo [OK] Node.js encontrado

REM ── Check Python (opcional, para audio) ──
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Python no encontrado - audio processor no disponible
    echo Para audio: instala Python desde https://www.python.org/downloads/
) else (
    echo [OK] Python encontrado
    if not exist "python\venv" (
        echo Creando entorno virtual Python...
        python -m venv python\venv
    )
    if exist "python\venv\Scripts\activate.bat" (
        call python\venv\Scripts\activate.bat
        pip install -q -r python\requirements.txt 2>nul
        echo [OK] Dependencias Python instaladas
    )
)

REM ── Install Node dependencies ──
if not exist "node_modules" (
    echo Instalando dependencias Node.js...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo npm install
        pause
        exit /b 1
    )
)
echo [OK] Dependencias Node.js listas

REM ── Check FFmpeg (opcional) ──
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] FFmpeg no encontrado - separacion de audio limitada
    echo Para instalar: winget install FFmpeg
)

cls
echo.
echo  =============================================
echo   VIBEFLOW PRO - SERVIDOR ACTIVO
echo  =============================================
echo.
echo   Local:    http://localhost:8080
echo   Ctrl+C para detener
echo.
echo  =============================================
echo.

node server.js

pause
