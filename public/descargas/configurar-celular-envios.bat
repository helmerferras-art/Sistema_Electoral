@echo off
rem Tlatoani Envios - configurar celular dedicado (ver configurar-celular-envios.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0configurar-celular-envios.ps1" %*
pause
