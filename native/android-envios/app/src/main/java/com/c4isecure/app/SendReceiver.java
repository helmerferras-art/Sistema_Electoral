package com.c4isecure.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Base64;

import java.nio.charset.StandardCharsets;

/**
 * Envío de SMS pedido por la PC del puente (programa "Tlatoani Puente") por cable USB.
 * Solo la consola de ADB puede llamarlo (el receptor exige el permiso DUMP, que ninguna app instalada tiene).
 *
 *   adb shell am broadcast --receiver-foreground --include-stopped-packages -a lat.nemia.tlatoani.SEND_SMS \
 *       -n <paquete>/com.c4isecure.app.SendReceiver --es to 9611234567 --es b64 <texto en base64>
 *
 * Responde "result=1" si salió, "result=3" si no hubo confirmación a tiempo y "result=2" con el motivo si falló.
 */
public class SendReceiver extends BroadcastReceiver {
    public static final String ACTION = "lat.nemia.tlatoani.SEND_SMS";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        final String to = intent.getStringExtra("to");
        final String b64 = intent.getStringExtra("b64");
        final PendingResult pr = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            String err;
            try {
                String text = b64 == null ? null : new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8);
                err = SmsUtil.send(app, to, text, 8);
            } catch (Exception e) {
                err = "Datos inválidos: " + e.getMessage();
            }
            if (err == null) { pr.setResultCode(1); pr.setResultData("ok"); }
            else if (SmsUtil.UNCONFIRMED.equals(err)) { pr.setResultCode(3); pr.setResultData("sin confirmar"); }
            else { pr.setResultCode(2); pr.setResultData(err); }
            pr.finish();
        }, "tlatoani-send").start();
    }
}
