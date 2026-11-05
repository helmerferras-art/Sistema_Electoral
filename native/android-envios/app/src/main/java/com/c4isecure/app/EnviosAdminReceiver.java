package com.c4isecure.app;

import android.app.admin.DeviceAdminReceiver;

/**
 * Administrador del dispositivo para el modo "celular dedicado" (opcional).
 * Con `adb shell dpm set-device-owner <paquete>/com.c4isecure.app.EnviosAdminReceiver` Android ya no duerme
 * ni limita la app, y no se puede desinstalar por error. Se libera con la acción RELEASE de ProvisionReceiver.
 */
public class EnviosAdminReceiver extends DeviceAdminReceiver { }
