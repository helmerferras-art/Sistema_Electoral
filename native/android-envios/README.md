# Tlatoani Envíos (Android)

La carpeta `android/` no se guarda en git (la genera Capacitor). Aquí se guardan las piezas propias
para que el celular de la campaña envíe los códigos por SMS desde su chip:

- `app/src/main/java/com/c4isecure/app/SmsSenderPlugin.java`: permisos, envío de SMS y control del servicio 24/7.
- `app/src/main/java/com/c4isecure/app/GatewayService.java`: servicio en primer plano que envía solo, a toda hora,
  aunque la app esté cerrada o la pantalla apagada. Usa una llave propia del celular (`fn_gateway_issue_token`),
  nunca la llave maestra; al apagar el envío la llave se revoca.
- `app/src/main/java/com/c4isecure/app/BootReceiver.java`: vuelve a arrancar el envío al prender el celular.
- `app/src/main/java/com/c4isecure/app/MainActivity.java`: registra el plugin.
- `app/src/envios/`: versión "Tlatoani Envíos" (permisos de SMS, servicio en primer plano, arranque y nombre de la app).
- Sabores en `android/app/build.gradle`: `play` (Google Play, sin SMS) y `envios`.

Aplicarlas a `android/` (después de `npx cap add android` o si se regeneró):

    node scripts/apply-android-envios.mjs

Compilar el APK de Tlatoani Envíos:

    npm run build && npx cap sync android
    cd android && gradlew assembleEnviosRelease     (o en Android Studio: Build Variants → enviosRelease)

El APK firmado se publica en `public/descargas/tlatoani-envios.apk` para descargarlo desde nemia.lat.
