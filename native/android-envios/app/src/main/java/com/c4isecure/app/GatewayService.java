package com.c4isecure.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Servicio de envío 24/7 de "Tlatoani Envíos".
 * Corre en primer plano (con su notificación fija) aunque la app esté cerrada o la pantalla apagada,
 * y vuelve a arrancar solo al reiniciar el celular (BootReceiver).
 * Cada 10 segundos pregunta al servidor si hay códigos de su campaña y los manda por SMS desde el chip
 * (es el respaldo del puente de la plataforma: recibe lo que el puente no pudo enviar).
 * Usa una llave propia de este celular (no la sesión de la persona) que se revoca al apagar el envío.
 */
public class GatewayService extends Service {

    public static final String PREFS = "tlatoani_gateway";
    private static final String CHANNEL_RUN = "envios_activo";
    private static final int NOTIF_ID = 4101;
    private static final long POLL_MS = 10_000;
    private static final long GAP_MS = 3_000;
    private static final long BACKOFF_MS = 30_000;
    private static final AtomicInteger SEQ = new AtomicInteger(1000);

    private volatile boolean running = false;
    private Thread worker;
    private PowerManager.WakeLock wakeLock;

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void start(Context c) {
        ContextCompat.startForegroundService(c, new Intent(c, GatewayService.class));
    }

    public static void stop(Context c) {
        cancelWatchdog(c);
        c.stopService(new Intent(c, GatewayService.class));
    }

    // Vigilante: cada 15 minutos revisa que el servicio siga vivo (por si Android lo cerró) y lo vuelve a arrancar.
    public static final String ACTION_WATCHDOG = "lat.nemia.tlatoani.WATCHDOG";
    private static final long WATCHDOG_MS = 15 * 60_000;

    private static PendingIntent watchdogIntent(Context c) {
        Intent i = new Intent(c, BootReceiver.class).setAction(ACTION_WATCHDOG);
        return PendingIntent.getBroadcast(c, 7, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    public static void scheduleWatchdog(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + WATCHDOG_MS, watchdogIntent(c));
    }

    public static void cancelWatchdog(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(watchdogIntent(c));
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_RUN, "Envío de mensajes activo", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = prefs(this);
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, NOTIF_ID, buildStatus(p.getInt("sent", 0), null), type);
        if (!p.getBoolean("enabled", false) || p.getString("token", null) == null) {
            cancelWatchdog(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        scheduleWatchdog(this);
        if (!running) {
            running = true;
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tlatoani:envios");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
            worker = new Thread(this::loop, "tlatoani-envios");
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (worker != null) worker.interrupt();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    // ---------- ciclo principal ----------

    private void loop() {
        while (running) {
            long wait = POLL_MS;
            try {
                SharedPreferences p = prefs(this);
                String url = p.getString("url", null), key = p.getString("apiKey", null), token = p.getString("token", null);
                if (url == null || key == null || token == null || !p.getBoolean("enabled", false)) break;

                JSONObject body = new JSONObject().put("p_token", token).put("p_limit", 5);
                Http r = post(url, key, "fn_gateway_pull_token", body);
                if (r.code == 400 && r.body.contains("Llave de env")) {
                    // La llave se revocó (alguien apagó el envío o lo activó en otro celular)
                    p.edit().putBoolean("enabled", false).putBoolean("revoked", true).putString("lastError", "Este celular fue dado de baja desde el tablero.").apply();
                    break;
                }
                if (r.code < 200 || r.code >= 300) throw new Exception("Servidor " + r.code);
                p.edit().putLong("lastSeen", System.currentTimeMillis()).apply();

                JSONArray items = new JSONArray(r.body);
                for (int i = 0; i < items.length() && running; i++) {
                    JSONObject c = items.getJSONObject(i);
                    String id = c.getString("id"), type = c.optString("type"), phone = c.optString("phone"), msg = c.optString("message");
                    String error = null;
                    if ("sms".equals(type)) {
                        error = sendSms(phone, msg);
                    } else {
                        error = "Tipo no soportado en el celular: " + type;
                    }
                    report(url, key, token, id, error == null, error);
                    SharedPreferences.Editor e = p.edit();
                    if (error == null) e.putInt("sent", p.getInt("sent", 0) + 1).putLong("lastAt", System.currentTimeMillis()).remove("lastError");
                    else e.putInt("failed", p.getInt("failed", 0) + 1).putString("lastError", error);
                    e.apply();
                    updateStatus(p.getInt("sent", 0), error);
                    Thread.sleep(GAP_MS);
                }
                if (items.length() > 0) wait = 1_000; // puede haber más en la fila
            } catch (InterruptedException ie) {
                break;
            } catch (Exception ex) {
                prefs(this).edit().putString("lastError", "Sin conexión: " + ex.getMessage()).apply();
                wait = BACKOFF_MS;
            }
            try { Thread.sleep(wait); } catch (InterruptedException ie) { break; }
        }
        running = false;
        if (!prefs(this).getBoolean("enabled", false)) cancelWatchdog(this);
        stopSelf();
    }

    private void report(String url, String key, String token, String id, boolean ok, String error) {
        for (int k = 0; k < 3; k++) {
            try {
                JSONObject b = new JSONObject().put("p_token", token).put("p_cmd", id).put("p_ok", ok).put("p_error", error == null ? JSONObject.NULL : error);
                if (post(url, key, "fn_gateway_report_token", b).code < 300) return;
            } catch (Exception ignored) { }
            try { Thread.sleep(5_000); } catch (InterruptedException ie) { return; }
        }
    }

    // ---------- SMS ----------

    /** Envía y espera el resultado real (sin señal, sin saldo...). Devuelve null si salió bien o el motivo del error. */
    private String sendSms(String to, String text) {
        String err = SmsUtil.send(this, to, text, 90);
        return SmsUtil.UNCONFIRMED.equals(err) ? "El SMS no confirmó envío" : err;
    }

    // ---------- notificaciones ----------

    private Notification buildStatus(int sent, String error) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String text = error == null ? "Enviando los códigos de la campaña · " + sent + " enviados" : "Último error: " + error;
        return new NotificationCompat.Builder(this, CHANNEL_RUN)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Tlatoani Envíos activo")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .build();
    }

    private void updateStatus(int sent, String error) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIF_ID, buildStatus(sent, error));
    }

    // ---------- HTTP ----------

    private static class Http { int code; String body; }

    private static Http post(String base, String apiKey, String fn, JSONObject json) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base.replaceAll("/+$", "") + "/rest/v1/rpc/" + fn).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(15_000);
            c.setReadTimeout(20_000);
            c.setDoOutput(true);
            c.setRequestProperty("apikey", apiKey);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(json.toString().getBytes(StandardCharsets.UTF_8)); }
            Http r = new Http();
            r.code = c.getResponseCode();
            InputStream in = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                in.close();
            }
            r.body = b.toString("UTF-8");
            return r;
        } finally {
            c.disconnect();
        }
    }
}
