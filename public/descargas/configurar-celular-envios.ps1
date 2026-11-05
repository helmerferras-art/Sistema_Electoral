<#
  Tlatoani Envíos · Configurar un celular dedicado para enviar los códigos de la campaña (sin intervención).

  Requisitos en el celular:
    1. Chip de la campaña con saldo o paquete de SMS.
    2. Opciones de desarrollador activadas (Ajustes > Acerca del teléfono > tocar 7 veces "Número de compilación")
       y "Depuración por USB" encendida. En Xiaomi/Redmi/POCO, también "Instalar vía USB".
    3. Conectarlo a esta PC con cable y aceptar en el celular el aviso "¿Permitir depuración por USB?".

  Uso:
    configurar-celular-envios.bat -Llave <llave que te dio el tablero>
    configurar-celular-envios.bat -Llave <llave> -Dedicado      (modo dedicado: ver abajo)
    configurar-celular-envios.bat -Liberar                       (apaga el envío y libera el celular)

  -Dedicado convierte la app en "dueña del dispositivo": Android ya no la duerme ni la limita y no se puede
  desinstalar por error. Solo funciona en un celular sin cuentas (recién restablecido de fábrica, sin cuenta de Google).
#>
param(
    [string]$Llave,
    [string]$Apk,
    [switch]$Dedicado,
    [switch]$Liberar
)

$ErrorActionPreference = 'Stop'
$Pkg = 'lat.nemia.tlatoani.envios'
$Url = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co'
$Key = 'sb_publishable_QoMeVGw6k1OFH1313DC7Zg_f9eci56q'
$ApkUrl = 'https://nemia.lat/descargas/tlatoani-envios.apk'
$Home2 = Join-Path $env:LOCALAPPDATA 'Tlatoani'

function Paso($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "   !!  $t" -ForegroundColor Yellow }
function Alto($t) { Write-Host "`n   ERROR: $t`n" -ForegroundColor Red; exit 1 }

# ---------- ADB ----------
Paso 'Buscando ADB'
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
    foreach ($c in @("$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", "$Home2\platform-tools\adb.exe")) { if (Test-Path $c) { $adb = $c; break } }
}
if (-not $adb) {
    Aviso 'No está instalado; descargando las herramientas oficiales de Android (platform-tools)...'
    New-Item -ItemType Directory -Force -Path $Home2 | Out-Null
    $zip = Join-Path $Home2 'platform-tools.zip'
    Invoke-WebRequest 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $Home2 -Force
    $adb = "$Home2\platform-tools\adb.exe"
}
Ok $adb

# Sin bloque param: así "-a", "-r", "--es" llegan tal cual a adb.
function Adb { $ErrorActionPreference = 'Continue'; $out = & $adb @args 2>&1 | ForEach-Object { "$_" } | Out-String; return $out.Trim() }
function Shell { $ErrorActionPreference = 'Continue'; $out = & $adb shell @args 2>&1 | ForEach-Object { "$_" } | Out-String; return $out.Trim() }

Paso 'Buscando el celular'
Adb start-server | Out-Null
$devs = (Adb devices) -split "`n" | Where-Object { $_ -match "`t" }
if (-not $devs) { Alto 'No veo ningún celular. Revisa el cable, que "Depuración por USB" esté encendida y acepta el aviso en el celular.' }
if ($devs -match 'unauthorized') { Alto 'El celular no ha autorizado esta PC. Desbloquéalo y acepta "¿Permitir depuración por USB?" (marca "Permitir siempre").' }
if (@($devs).Count -gt 1) { Alto 'Hay más de un celular conectado. Deja conectado solo el que enviará los mensajes.' }
$model = Shell getprop ro.product.model
$sdk = [int](Shell getprop ro.build.version.sdk)
Ok "$model (Android API $sdk)"

# ---------- Liberar ----------
if ($Liberar) {
    Paso 'Apagando el envío y liberando el celular'
    Shell am broadcast -a lat.nemia.tlatoani.RELEASE -n "$Pkg/com.c4isecure.app.ProvisionReceiver" | Out-Null
    Shell dumpsys deviceidle whitelist "-$Pkg" | Out-Null
    Ok 'Listo. Para quitar la llave del sistema, dale de baja también desde el tablero.'
    exit 0
}

if ($Llave -notmatch '^[0-9a-f]{64}$') { Alto 'Falta la llave (64 letras y números) que te dio el tablero en "Agregar celular dedicado".' }

# ---------- Instalar ----------
Paso 'Instalando Tlatoani Envíos'
if (-not $Apk) {
    $Apk = Join-Path $Home2 'tlatoani-envios.apk'
    New-Item -ItemType Directory -Force -Path $Home2 | Out-Null
    Invoke-WebRequest $ApkUrl -OutFile $Apk -UseBasicParsing
}
if (-not (Test-Path $Apk)) { Alto "No encuentro el APK: $Apk" }
$r = Adb install -r -g $Apk
if ($r -notmatch 'Success') { Alto "No se pudo instalar: $r" }
Ok 'Instalada'

# ---------- Permisos ----------
Paso 'Dando permisos (SMS y notificaciones)'
Shell pm grant $Pkg android.permission.SEND_SMS | Out-Null
if ($sdk -ge 33) { Shell pm grant $Pkg android.permission.POST_NOTIFICATIONS | Out-Null }
$p = Shell dumpsys package $Pkg
if ($p -notmatch 'android.permission.SEND_SMS: granted=true') { Alto 'Android no dio el permiso de SMS. En Xiaomi activa "Depuración USB (ajustes de seguridad)" y vuelve a correr el script.' }
Ok 'Permisos concedidos'

# ---------- Que nunca se duerma ----------
Paso 'Quitando el ahorro de batería para la app (que envíe también de madrugada)'
Shell dumpsys deviceidle whitelist "+$Pkg" | Out-Null
Shell cmd appops set $Pkg RUN_ANY_IN_BACKGROUND allow | Out-Null
Shell cmd appops set $Pkg RUN_IN_BACKGROUND allow | Out-Null
Shell am set-standby-bucket $Pkg active | Out-Null
if ((Shell dumpsys deviceidle whitelist) -match $Pkg) { Ok 'Sin restricciones de batería' } else { Aviso 'No pude confirmar la excepción de batería; revísala en Ajustes > Batería.' }

# ---------- Modo dedicado (opcional) ----------
if ($Dedicado) {
    Paso 'Modo dedicado (dueña del dispositivo)'
    $d = Shell dpm set-device-owner "$Pkg/com.c4isecure.app.EnviosAdminReceiver"
    if ($d -match 'Success|Active admin set') {
        Ok 'La app quedó como dueña del celular: Android no la duerme y no se puede desinstalar por error.'
        Shell settings put global adaptive_battery_management_enabled 0 | Out-Null
    } else {
        Aviso "No se pudo ($($d -replace '\s+', ' ')). Suele ser porque el celular tiene cuentas (Google, Samsung, etc.)."
        Aviso 'Sigue funcionando igual en modo normal. Para el modo dedicado, restablece el celular de fábrica sin agregar cuentas.'
    }
}

# ---------- Activar con la llave ----------
Paso 'Activando el envío con la llave de la campaña'
$b = Shell am broadcast -a lat.nemia.tlatoani.PROVISION -n "$Pkg/com.c4isecure.app.ProvisionReceiver" --es url $Url --es key $Key --es token $Llave
if ($b -notmatch 'result=1') { Aviso "Respuesta del celular: $($b -replace '\s+', ' ')" }
Start-Sleep -Seconds 4
if ((Shell dumpsys activity services $Pkg) -match 'GatewayService') { Ok 'El servicio de envío está corriendo' }
else { Alto 'El servicio no arrancó. Desbloquea el celular, ábrele la app una vez y vuelve a correr el script.' }

Write-Host @"

   Listo. Este celular ya envía solo los códigos de la campaña, a cualquier hora.
   - Déjalo conectado al cargador, con señal y con saldo o paquete de SMS.
   - En el tablero (Mando > Envío de mensajes) debe aparecer "Conectado" en menos de un minuto.
   - Ya puedes desconectar el cable. Si se reinicia, el envío arranca solo.
"@ -ForegroundColor Green
if ($model -match 'Redmi|POCO|Mi |Xiaomi|HUAWEI|Honor|vivo|OPPO|realme') {
    Aviso "En $model activa además, en Ajustes de la app: 'Inicio automático' y Batería 'Sin restricciones'."
}
