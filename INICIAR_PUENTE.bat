@echo off
setlocal enabledelayedexpansion
title PUENTE DE COMUNICACION C4I
echo ==========================================
echo    INICIANDO PUENTE DE HARDWARE C4I
echo ==========================================
echo.

:: 1. Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encuentra Node.js instalado.
    echo Por favor instala Node.js desde https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Ubicacion del Script
cd /d "%~dp0"
if not exist "scripts\sms_bridge.js" (
    echo [ERROR] No se encuentra el script: scripts\sms_bridge.js
    echo Asegurate de ejecutar este .bat desde la raiz del proyecto.
    pause
    exit /b 1
)

:: 2.1 Verificar si el puerto 5000 esta en uso
netstat -ano | findstr :5000 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo [ADVERTENCIA] El puerto 5000 ya esta en uso. 
    echo Es posible que el servidor ya este corriendo o que otro proceso lo ocupe.
    echo.
)

:: 3. Intentar iniciar Bridge
echo [INFO] Iniciando servidor de hardware...
call npm run sms-bridge
if %errorlevel% neq 0 (
    echo.
    echo [CRITICO] El puente se ha detenido inesperadamente (Codigo: %errorlevel%).
    echo Revisa si el puerto 5000 esta ocupado o si hay errores de sintaxis.
    echo.
    pause
)

echo.
echo [FIN] El proceso ha terminado.
pause
