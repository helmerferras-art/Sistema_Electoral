package com.c4isecure.app;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Envío de un SMS desde el chip esperando el resultado real (sin señal, sin saldo, modo avión...). */
public final class SmsUtil {
    private static final AtomicInteger SEQ = new AtomicInteger(5000);
    /** Devuelto cuando el SMS se entregó a la red pero el aviso de "enviado" no llegó a tiempo. */
    public static final String UNCONFIRMED = "SIN_CONFIRMAR";

    private SmsUtil() { }

    /** Devuelve null si salió bien, UNCONFIRMED si no hubo aviso a tiempo, o el motivo del error. */
    public static String send(Context context, String to, String text, int timeoutSeconds) {
        final Context ctx = context.getApplicationContext();
        if (to == null || to.isEmpty() || text == null || text.isEmpty()) return "Faltan datos";
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED)
            return "Sin permiso para enviar SMS";
        SmsManager sms = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
        if (sms == null) return "Este celular no puede enviar SMS";

        ArrayList<String> parts = sms.divideMessage(text);
        final int total = parts.size();
        final CountDownLatch latch = new CountDownLatch(total);
        final int[] lastError = { 0 };
        final String action = ctx.getPackageName() + ".SMS_RESULT." + SEQ.getAndIncrement();
        BroadcastReceiver rcv = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (getResultCode() != Activity.RESULT_OK) lastError[0] = getResultCode();
                latch.countDown();
            }
        };
        ContextCompat.registerReceiver(ctx, rcv, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
        try {
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int k = 0; k < total; k++) {
                Intent it = new Intent(action).setPackage(ctx.getPackageName());
                sent.add(PendingIntent.getBroadcast(ctx, SEQ.getAndIncrement(), it, PendingIntent.FLAG_IMMUTABLE));
            }
            if (total > 1) sms.sendMultipartTextMessage(to, null, parts, sent, null);
            else sms.sendTextMessage(to, null, text, sent.get(0), null);
            if (!latch.await(timeoutSeconds, TimeUnit.SECONDS)) return UNCONFIRMED;
            return lastError[0] == 0 ? null : "Error de envío " + lastError[0] + " (¿señal o saldo?)";
        } catch (Exception e) {
            return "Error de envío: " + e.getMessage();
        } finally {
            try { ctx.unregisterReceiver(rcv); } catch (Exception ignored) { }
        }
    }
}
