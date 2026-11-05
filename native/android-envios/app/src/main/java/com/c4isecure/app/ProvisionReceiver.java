package com.c4isecure.app;

import android.app.admin.DevicePolicyManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Configuración por cable (ADB) del celular dedicado, sin abrir la app ni iniciar sesión.
 * Solo la puede llamar la consola de ADB: el receptor exige el permiso DUMP, que ninguna app instalada tiene.
 *
 *   adb shell am broadcast -a lat.nemia.tlatoani.PROVISION -n <paquete>/com.c4isecure.app.ProvisionReceiver \
 *       --es url https://xxx.supabase.co --es key <publishable> --es token <llave del tablero>
 *   adb shell am broadcast -a lat.nemia.tlatoani.RELEASE   -n <paquete>/com.c4isecure.app.ProvisionReceiver
 */
public class ProvisionReceiver extends BroadcastReceiver {
    public static final String ACTION_PROVISION = "lat.nemia.tlatoani.PROVISION";
    public static final String ACTION_RELEASE = "lat.nemia.tlatoani.RELEASE";
    private static final String TAG = "TlatoaniEnvios";

    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (ACTION_PROVISION.equals(a)) {
            String url = intent.getStringExtra("url"), key = intent.getStringExtra("key"), token = intent.getStringExtra("token");
            if (url == null || key == null || token == null || !token.matches("[0-9a-f]{64}")) {
                Log.e(TAG, "PROVISION: faltan datos o la llave no es válida");
                setResultCode(2);
                return;
            }
            GatewayService.prefs(context).edit()
                .putString("url", url).putString("apiKey", key).putString("token", token)
                .putBoolean("enabled", true).putBoolean("dedicated", true).remove("revoked").remove("lastError").apply();
            protect(context, true);
            try {
                GatewayService.start(context);
                Log.i(TAG, "PROVISION: envío activado");
                setResultCode(1);
            } catch (Exception e) {
                // Si Android no deja arrancarlo en este momento, el vigilante lo arranca en cuanto pueda
                Log.e(TAG, "PROVISION: no arrancó todavía: " + e);
                GatewayService.scheduleWatchdog(context);
                setResultCode(3);
            }
        } else if (ACTION_RELEASE.equals(a)) {
            GatewayService.prefs(context).edit().putBoolean("enabled", false).remove("token").putBoolean("dedicated", false).apply();
            GatewayService.stop(context);
            protect(context, false);
            DevicePolicyManager dpm = context.getSystemService(DevicePolicyManager.class);
            try {
                if (dpm != null && dpm.isDeviceOwnerApp(context.getPackageName())) dpm.clearDeviceOwnerApp(context.getPackageName());
            } catch (Exception e) { Log.e(TAG, "RELEASE: " + e); }
            Log.i(TAG, "RELEASE: envío desactivado y celular liberado");
            setResultCode(1);
        }
    }

    /** Si la app es dueña del dispositivo (modo dedicado), evita que la desinstalen por error. */
    static void protect(Context c, boolean on) {
        DevicePolicyManager dpm = c.getSystemService(DevicePolicyManager.class);
        if (dpm == null || !dpm.isDeviceOwnerApp(c.getPackageName())) return;
        ComponentName admin = new ComponentName(c, EnviosAdminReceiver.class);
        try { dpm.setUninstallBlocked(admin, c.getPackageName(), on); } catch (Exception ignored) { }
    }
}
