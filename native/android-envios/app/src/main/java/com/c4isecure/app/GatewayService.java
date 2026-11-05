package com.c4isecure.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.telephony.SmsManager;

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
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Servicio de envío 24/7 de "Tlatoani Envíos".
 * Corre en primer plano (con su notificación fija) aunque la app esté cerrada o la pantalla apagada,
 * y vuelve a arrancar solo al reiniciar el celular (BootReceiver).
 * Cada 10 segundos pregunta al servidor si hay mensajes de su campaña y los manda por SMS desde el chip.
 * Usa una llave propia de este celular (no la sesión de la persona) que se revoca al apagar el envío.
 */
public class GatewayService extends Service {

    public static final String PREFS = "tlatoani_gateway";
    private static final String CHANNEL_RUN = "envios_activo";
    private static final String CHANNEL_WA = "envios_whatsapp";
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
        c.stopService(new Intent(c, GatewayService.class));
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_RUN, "Envío de mensajes activo", NotificationManager.IMPORTANCE_LOW));
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_WA, "WhatsApp por enviar", NotificationManager.IMPORTANCE_HIGH));
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = prefs(this);
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, NOTIF_ID, buildStatus(p.getInt("sent", 0), null), type);
        if (!p.getBoolean("enabled", false) || p.getString("token", null) == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
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
                    p.edit().putBoolean("enabled", false).putString("lastError", "Este celular ya no está activado para enviar.").apply();
                    break;
                }
                if (r.code < 200 || r.code >= 300) throw new Exception("Servidor " + r.code);
                p.edit().putLong("lastSeen", System.currentTimeMillis()).apply();

                JSONArray items = new JSONArray(r.body);
                for (int i = 0; i < items.length() && running; i++) {
                    JSONObject c = items.getJSONObject(i);
                    String id = c.getString("id"), type = c.optString("type"), phone = c.optString("phone"), msg = c.optString("message");
                    String error = null;
                    if ("sms".equals(type) || "wa".equals(type)) {
                        // WhatsApp no se puede automatizar: el código sale solo por SMS y además se avisa para mandarlo por WhatsApp con un toque.
                        error = sendSms(phone, msg);
                        if ("wa".equals(type)) notifyWhatsApp(phone, msg, c.optBoolean("is_code"));
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
        if (to == null || to.isEmpty() || text == null || text.isEmpty()) return "Faltan datos";
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.SEND_SMS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            return "Sin permiso para enviar SMS";
        SmsManager sms = Build.VERSION.SDK_INT >= 31 ? getSystemService(SmsManager.class) : SmsManager.getDefault();
        if (sms == null) return "Este celular no puede enviar SMS";

        ArrayList<String> parts = sms.divideMessage(text);
        final int total = parts.size();
        final CountDownLatch latch = new CountDownLatch(total);
        final int[] lastError = { 0 };
        final String action = getPackageName() + ".GW_SENT." + SEQ.getAndIncrement();
        BroadcastReceiver rcv = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                if (getResultCode() != Activity.RESULT_OK) lastError[0] = getResultCode();
                latch.countDown();
            }
        };
        ContextCompat.registerReceiver(this, rcv, new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
        try {
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int k = 0; k < total; k++) {
                Intent it = new Intent(action).setPackage(getPackageName());
                sent.add(PendingIntent.getBroadcast(this, SEQ.getAndIncrement(), it, PendingIntent.FLAG_IMMUTABLE));
            }
            if (total > 1) sms.sendMultipartTextMessage(to, null, parts, sent, null);
            else sms.sendTextMessage(to, null, text, sent.get(0), null);
            if (!latch.await(90, TimeUnit.SECONDS)) return "El SMS no confirmó envío";
            return lastError[0] == 0 ? null : "Error de envío " + lastError[0] + " (¿señal o saldo?)";
        } catch (Exception e) {
            return "Error de envío: " + e.getMessage();
        } finally {
            try { unregisterReceiver(rcv); } catch (Exception ignored) { }
        }
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

    private void notifyWhatsApp(String phone, String msg, boolean isCode) {
        String d = phone == null ? "" : phone.replaceAll("\\D", "");
        if (d.length() == 10) d = "52" + d;
        Intent wa = new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + d + "?text=" + Uri.encode(msg)));
        wa.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int n = SEQ.getAndIncrement();
        PendingIntent pi = PendingIntent.getActivity(this, n, wa, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String last4 = d.length() >= 4 ? d.substring(d.length() - 4) : d;
        Notification nt = new NotificationCompat.Builder(this, CHANNEL_WA)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Enviar por WhatsApp a ***" + last4)
            .setContentText((isCode ? "Código de acceso. " : "") + "Ya salió por SMS; toca para mandarlo también por WhatsApp.")
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(n, nt);
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
