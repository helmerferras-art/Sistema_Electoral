package com.c4isecure.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Al prender el celular, al actualizar la app o cuando toca el vigilante: si el envío estaba activado, lo (re)arranca. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(a) && !GatewayService.ACTION_WATCHDOG.equals(a)) return;
        if (GatewayService.prefs(context).getBoolean("enabled", false)) {
            try { GatewayService.start(context); } catch (Exception e) { GatewayService.scheduleWatchdog(context); }
        }
    }
}
