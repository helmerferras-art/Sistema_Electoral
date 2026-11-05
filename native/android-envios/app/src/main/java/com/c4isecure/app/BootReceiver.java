package com.c4isecure.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Al prender el celular (o al actualizar la app), si el envío estaba activado, vuelve a arrancar solo. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(a)) return;
        if (GatewayService.prefs(context).getBoolean("enabled", false)) {
            try { GatewayService.start(context); } catch (Exception ignored) { }
        }
    }
}
