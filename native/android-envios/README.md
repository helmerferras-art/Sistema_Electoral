# Tlatoani Envíos (Android)

La carpeta `android/` no se guarda en git (la genera Capacitor). Aquí se guardan las piezas propias
para que el celular de la campaña envíe los códigos por SMS desde su chip:

- `app/src/main/java/com/c4isecure/app/SmsSenderPlugin.java`: envío de SMS y pantalla siempre encendida.
- `app/src/main/java/com/c4isecure/app/MainActivity.java`: registra el plugin.
- `app/src/envios/`: versión "Tlatoani Envíos" (permiso SEND_SMS y nombre de la app).
- Sabores en `android/app/build.gradle`: `play` (Google Play, sin SMS) y `envios`.

Aplicarlas a `android/` (después de `npx cap add android` o si se regeneró):

    node scripts/apply-android-envios.mjs

Compilar el APK de Tlatoani Envíos:

    npm run build && npx cap sync android
    cd android && gradlew assembleEnviosRelease     (o en Android Studio: Build Variants → enviosRelease)

El APK firmado se publica en `public/descargas/tlatoani-envios.apk` para descargarlo desde nemia.lat.
