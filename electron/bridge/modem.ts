import { powershell, toE164 } from './sys.js';

/**
 * Módem USB GSM (o celular en modo módem) por puerto COM, con comandos AT.
 * Se usa PowerShell (.NET SerialPort), así el programa no necesita controladores ni módulos nativos extra.
 */

export type ModemInfo = { port: string; name: string; ok: boolean; sim: boolean; signal: number | null; operator: string | null; error?: string };

const PS_COMMON = `
$ErrorActionPreference = 'Stop'
function Open-Port($name) {
  $p = New-Object System.IO.Ports.SerialPort $name, 115200, 'None', 8, 'One'
  $p.ReadTimeout = 500; $p.WriteTimeout = 3000; $p.DtrEnable = $true; $p.RtsEnable = $true
  $p.Open(); return $p
}
function Cmd($p, $c, $wait, $until) {
  if (-not $until) { $until = '(\\r\\nOK\\r\\n)|ERROR' }
  try { $p.DiscardInBuffer() } catch {}
  $p.Write("$c\`r")
  $sw = [Diagnostics.Stopwatch]::StartNew(); $buf = ''
  while ($sw.ElapsedMilliseconds -lt $wait) {
    try { $buf += $p.ReadExisting() } catch {}
    if ($buf -match $until) { break }
    Start-Sleep -Milliseconds 100
  }
  return $buf
}
`;

/** Lista los puertos COM y prueba cuáles responden como módem con SIM. */
export const detectModems = async (onlyPort?: string): Promise<ModemInfo[]> => {
    const filter = onlyPort ? `| Where-Object { $_ -eq '${onlyPort.replace(/[^A-Za-z0-9]/g, '')}' }` : '';
    const script = PS_COMMON + `
$names = @{}
try { Get-CimInstance Win32_PnPEntity -Filter "Name like '%(COM%'" | ForEach-Object { if ($_.Name -match '\\((COM\\d+)\\)') { $names[$matches[1]] = $_.Name } } } catch {}
$res = @()
foreach ($port in [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique ${filter}) {
  $o = [ordered]@{ port = $port; name = [string]$names[$port]; ok = $false; sim = $false; signal = $null; operator = $null; error = $null }
  try {
    $p = Open-Port $port
    try {
      $a = Cmd $p 'AT' 1500
      if ($a -match 'OK') {
        $o.ok = $true
        Cmd $p 'ATE0' 1000 | Out-Null
        $o.sim = ((Cmd $p 'AT+CPIN?' 2000) -match 'READY')
        $q = Cmd $p 'AT+CSQ' 1500
        if ($q -match '\\+CSQ:\\s*(\\d+)') { $v = [int]$matches[1]; if ($v -ne 99) { $o.signal = [int][Math]::Round($v * 100 / 31) } }
        Cmd $p 'AT+COPS=3,0' 1000 | Out-Null
        $c = Cmd $p 'AT+COPS?' 3000
        if ($c -match '"([^"]+)"') { $o.operator = $matches[1] }
      }
    } finally { $p.Close() }
  } catch { $o.error = $_.Exception.Message }
  $res += [pscustomobject]$o
}
ConvertTo-Json -Compress -InputObject @($res)
`;
    const r = await powershell(script, 90_000);
    try {
        const list = JSON.parse(r.out || '[]');
        return (Array.isArray(list) ? list : [list]).filter(Boolean);
    } catch {
        return [];
    }
};

/** El módem habla el alfabeto GSM básico: sin acentos ni símbolos especiales; máximo 160 por mensaje. */
export const toGsmText = (text: string) =>
    (text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[¿¡]/g, '').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-')
        .replace(/[^\x20-\x7E\n]/g, '').replace(/[[\]{}~^|\\`]/g, '');

const chunks = (t: string, n = 153) => { const out: string[] = []; for (let i = 0; i < t.length; i += n) out.push(t.slice(i, i + n)); return out.length ? out : ['']; };

/** Envía un SMS por el módem. Devuelve null si salió bien, o el motivo del error. */
export const sendModemSms = async (port: string, phone: string, text: string): Promise<string | null> => {
    const to = toE164(phone);
    if (!/^\+\d{10,15}$/.test(to)) return 'Número inválido';
    const body = toGsmText(text);
    const parts = body.length <= 160 ? [body] : chunks(body);
    for (const part of parts) {
        const b64 = Buffer.from(part, 'utf8').toString('base64');
        const script = PS_COMMON + `
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))
try {
  $p = Open-Port '${port.replace(/[^A-Za-z0-9]/g, '')}'
  try {
    Cmd $p 'ATE0' 1000 | Out-Null
    if (-not ((Cmd $p 'AT+CMGF=1' 2000) -match 'OK')) { Write-Output 'ERR:El módem no acepta modo texto'; exit }
    Cmd $p 'AT+CSCS="GSM"' 2000 | Out-Null
    $r = Cmd $p 'AT+CMGS="${to}"' 5000 '>|ERROR'
    if (-not ($r -match '>')) { Write-Output ('ERR:El módem no aceptó el número ' + ($r -replace '\\s+', ' ')); exit }
    $p.Write($text + [char]26)
    $sw = [Diagnostics.Stopwatch]::StartNew(); $buf = ''
    while ($sw.ElapsedMilliseconds -lt 60000) {
      try { $buf += $p.ReadExisting() } catch {}
      if ($buf -match '\\+CMGS|ERROR') { break }
      Start-Sleep -Milliseconds 200
    }
    if ($buf -match '\\+CMGS') { Write-Output 'OK' }
    elseif ($buf -match 'ERROR') { Write-Output ('ERR:La red rechazó el SMS (¿saldo o señal?) ' + ($buf -replace '\\s+', ' ')) }
    else { Write-Output 'ERR:El módem no confirmó el envío' }
  } finally { $p.Close() }
} catch { Write-Output ('ERR:No se pudo abrir ${port.replace(/[^A-Za-z0-9]/g, '')}: ' + $_.Exception.Message) }
`;
        const r = await powershell(script, 90_000);
        const line = r.out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop() || '';
        if (line !== 'OK') return line.startsWith('ERR:') ? line.slice(4).trim() : `Error del módem: ${line || r.code}`;
    }
    return null;
};
