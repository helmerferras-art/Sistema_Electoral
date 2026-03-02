@echo off
TITLE C4I SMS GATEWAY BRIDGE
echo ==========================================
echo    INICIANDO PUENTE SMS GATEWAY C4I
echo ==========================================
echo.
echo Requisitos:
echo 1. Celulares conectados via USB
echo 2. Depuracion USB activada
echo.
echo Intentando ejecutar el puente...
echo.
node scripts/sms_bridge.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se pudo iniciar el puente. 
    echo Asegurate de tener Node.js instalado.
    pause
)
echo.
pause
