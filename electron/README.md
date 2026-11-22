# Tlatoani Puente (programa de Windows)

Programa para la PC que envía por SMS los códigos de acceso de todas las campañas. Es la **primera opción** de envío;
si está apagado o sin línea, los códigos salen por el celular de cada campaña (app Tlatoani Envíos).

Al abrirlo por primera vez pide, en este orden:

1. **Llave del equipo**: se genera en nemia.lat › Tablero (superadmin) › *Puente de SMS de la plataforma*.
   Solo se guarda cifrada en la PC (Windows DPAPI). Nunca se usa la llave maestra de Supabase.
2. **Línea**: detecta sola un **módem USB GSM** (comandos AT por el puerto COM) o un **celular Android** por USB
   (con "Depuración por USB"; el programa le instala la app Tlatoani Envíos y el SMS sale con confirmación real).
3. **Prueba**: manda un SMS a tu número.
4. **Listo**: queda en la bandeja junto al reloj y arranca solo con Windows. Si la línea se pierde, busca otra conectada.

## Compilar

    npm run puente:build      # descarga adb (vendor/), compila electron/ y genera release/Tlatoani-Puente-Setup-<versión>.exe

Desarrollo: `npm run puente:dev`.

## Piezas

- `main.ts`: ventana, bandeja, arranque con Windows, comunicación con el panel.
- `bridge/engine.ts`: ciclo de envío (`fn_gateway_pull_token` / `fn_gateway_report_token` / `fn_gateway_hello_token`).
- `bridge/modem.ts`: módem por PowerShell (.NET SerialPort), sin módulos nativos.
- `bridge/android.ts`: celular por adb; envío por `SendReceiver` de la app (solo lo puede llamar adb).
- `ui/`: asistente y panel (HTML sin dependencias). `preload.cjs`: funciones expuestas al panel.

El puente anterior (`scripts/sms_bridge.js` + `INICIAR_PUENTE.bat`) ya no lo usa este programa.
