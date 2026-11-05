package com.c4isecure.app;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SmsManager;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Envío de SMS desde el chip del celular de la campaña ("Tlatoani Envíos").
 * Solo funciona en la versión "envios" de la app, que declara el permiso SEND_SMS en su manifiesto.
 * La versión de Google Play no lo declara: ahí available() responde false y la app no ofrece esta opción.
 */
@CapacitorPlugin(
    name = "SmsSender",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) }
)
public class SmsSenderPlugin extends Plugin {

    private static final AtomicInteger SEQ = new AtomicInteger(1);

    private boolean declaresSms() {
        try {
            PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), PackageManager.GET_PERMISSIONS);
            return info.requestedPermissions != null
                && Arrays.asList(info.requestedPermissions).contains(Manifest.permission.SEND_SMS);
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        boolean telephony = getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
        JSObject r = new JSObject();
        r.put("available", declaresSms() && telephony);
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestSmsPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionCallback");
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void send(PluginCall call) {
        final String to = call.getString("to");
        final String body = call.getString("body");
        if (to == null || body == null || to.isEmpty() || body.isEmpty()) {
            call.reject("FALTAN_DATOS");
            return;
        }
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SIN_PERMISO");
            return;
        }

        final Context ctx = getContext();
        final SmsManager sms = Build.VERSION.SDK_INT >= 31 ? ctx.getSystemService(SmsManager.class) : SmsManager.getDefault();
        if (sms == null) {
            call.reject("SIN_SMS");
            return;
        }

        final ArrayList<String> parts = sms.divideMessage(body);
        final int total = parts.size();
        final String action = ctx.getPackageName() + ".SMS_SENT." + SEQ.getAndIncrement();
        final int[] done = { 0 };
        final int[] failed = { 0 };
        final int[] lastError = { 0 };

        // Resultado real del envío (sin señal, sin saldo, modo avión...)
        final BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                int code = getResultCode();
                done[0]++;
                if (code != Activity.RESULT_OK) {
                    failed[0]++;
                    lastError[0] = code;
                }
                if (done[0] >= total) {
                    try { ctx.unregisterReceiver(this); } catch (Exception ignored) { }
                    if (failed[0] == 0) {
                        JSObject r = new JSObject();
                        r.put("ok", true);
                        call.resolve(r);
                    } else {
                        call.reject("ERROR_ENVIO_" + lastError[0]);
                    }
                }
            }
        };
        ContextCompat.registerReceiver(ctx, receiver, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);

        final ArrayList<PendingIntent> sentIntents = new ArrayList<>();
        for (int k = 0; k < total; k++) {
            Intent it = new Intent(action).setPackage(ctx.getPackageName());
            sentIntents.add(PendingIntent.getBroadcast(ctx, SEQ.getAndIncrement(), it, PendingIntent.FLAG_IMMUTABLE));
        }

        try {
            if (total > 1) {
                sms.sendMultipartTextMessage(to, null, parts, sentIntents, null);
            } else {
                sms.sendTextMessage(to, null, body, sentIntents.get(0), null);
            }
        } catch (Exception e) {
            try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) { }
            call.reject("ERROR_ENVIO", e);
        }
    }

    /** Mantener la pantalla encendida mientras el celular funciona como puente (conectado al cargador). */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }
}
