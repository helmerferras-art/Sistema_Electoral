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
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
        @Permission(alias = "notif", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
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

    // ---------- Envío 24/7 (servicio en primer plano) ----------

    /** Arranca el servicio que envía solo, aunque la app esté cerrada o la pantalla apagada. */
    @PluginMethod
    public void startGateway(PluginCall call) {
        String url = call.getString("url"), apiKey = call.getString("apiKey"), token = call.getString("token");
        if (url == null || apiKey == null || token == null) { call.reject("FALTAN_DATOS"); return; }
        if (!declaresSms()) { call.reject("NO_DISPONIBLE"); return; }
        if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("SIN_PERMISO"); return; }
        GatewayService.prefs(getContext()).edit()
            .putString("url", url).putString("apiKey", apiKey).putString("token", token)
            .putBoolean("enabled", true).remove("revoked").remove("lastError").apply();
        try {
            GatewayService.start(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("NO_ARRANCO", e);
        }
    }

    @PluginMethod
    public void stopGateway(PluginCall call) {
        GatewayService.prefs(getContext()).edit().putBoolean("enabled", false).remove("token").apply();
        GatewayService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void gatewayStatus(PluginCall call) {
        android.content.SharedPreferences p = GatewayService.prefs(getContext());
        JSObject r = new JSObject();
        r.put("enabled", p.getBoolean("enabled", false));
        r.put("sent", p.getInt("sent", 0));
        r.put("failed", p.getInt("failed", 0));
        r.put("lastAt", p.getLong("lastAt", 0));
        r.put("lastSeen", p.getLong("lastSeen", 0));
        r.put("lastError", p.getString("lastError", null));
        r.put("revoked", p.getBoolean("revoked", false));
        r.put("dedicated", p.getBoolean("dedicated", false));
        android.os.PowerManager pm = getContext().getSystemService(android.os.PowerManager.class);
        r.put("batteryUnrestricted", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        r.put("notifications", Build.VERSION.SDK_INT < 33 || getPermissionState("notif") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** Android 13+: permiso para mostrar la notificación fija del servicio y los avisos de WhatsApp. */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notif") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notif", call, "notifPermissionCallback");
    }

    @PermissionCallback
    private void notifPermissionCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notif") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** Pide a Android que no duerma la app (ahorro de batería), para que envíe también en la madrugada. */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        android.os.PowerManager pm = getContext().getSystemService(android.os.PowerManager.class);
        String pkg = getContext().getPackageName();
        if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
            try {
                Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, android.net.Uri.parse("package:" + pkg));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e) {
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                } catch (Exception ignored) { }
            }
        }
        call.resolve();
    }
}
