/* Panel y asistente de Tlatoani Puente. Habla con el programa solo a través de window.puente. */
const $ = (id) => document.getElementById(id);
const P = window.puente;
let state = null;
let token = '';
let chosen = null;          // línea elegida { kind, port|serial, label }
let mode = 'setup';         // 'setup' o 'change' (cambiar línea desde el panel)

const STATUS = {
  sin_configurar: ['Falta configurar', ''],
  pausado: ['En pausa', 'Los códigos salen por el celular de cada campaña mientras tanto.'],
  sin_linea: ['Sin celular o módem', 'Revisa el cable o el módem. Mientras tanto los códigos salen por el celular de cada campaña.'],
  sin_internet: ['Sin internet', 'Revisa la conexión de esta PC.'],
  en_linea: ['Enviando', 'Este equipo es la primera opción para enviar los códigos.'],
};

const step = (n) => {
  ['s1', 's2', 's3'].forEach((id, i) => $(id).classList.toggle('hidden', i + 1 !== n));
  document.querySelectorAll('.steps span').forEach((el) => {
    const s = Number(el.dataset.s);
    el.classList.toggle('on', s === n);
    el.classList.toggle('done', s < n);
  });
};

const show = () => {
  const configured = state && state.configured;
  const inWizard = !configured || mode === 'change';
  $('wizard').classList.toggle('hidden', !inWizard);
  $('panel').classList.toggle('hidden', inWizard);
  if (configured && !inWizard) renderPanel();
};

const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';

function renderPanel() {
  const s = state;
  const [title, hint] = STATUS[s.status] || ['', ''];
  $('dot').className = 'dot ' + s.status;
  $('stitle').textContent = title;
  $('sline').textContent = `${s.name} · ${s.line ? s.line.label : 'sin línea'} · ${hint}`;
  $('nsent').textContent = s.sent;
  $('nfail').textContent = s.failed;
  $('nlast').textContent = fmt(s.lastAt);
  $('lasterr').textContent = s.lastError ? 'Último error: ' + s.lastError : '';
  $('bpause').textContent = s.paused ? 'Reanudar envío' : 'Pausar envío';
  $('log').innerHTML = '';
  s.log.forEach((l) => {
    const d = document.createElement('div');
    if (!l.ok) d.className = 'no';
    d.textContent = `${new Date(l.at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · ${l.text}`;
    $('log').appendChild(d);
  });
}

// ---------- Paso 1: llave ----------
$('b1').onclick = async () => {
  $('e1').textContent = '';
  $('b1').disabled = true;
  const r = await P.checkToken($('token').value);
  $('b1').disabled = false;
  if (!r.ok) { $('e1').textContent = r.error; return; }
  token = $('token').value.trim().toLowerCase();
  step(2); scan();
};

// ---------- Paso 2: línea ----------
const optEl = (title, desc, pill, cls, enabled, onPick, extra) => {
  const d = document.createElement('div');
  d.className = 'opt';
  d.innerHTML = `<div style="flex:1"><div class="t"></div><div class="d"></div></div>`;
  d.querySelector('.t').textContent = title;
  if (pill) { const p = document.createElement('span'); p.className = 'pill ' + cls; p.textContent = pill; d.querySelector('.t').appendChild(p); }
  d.querySelector('.d').textContent = desc;
  if (extra) d.appendChild(extra);
  if (enabled) d.onclick = () => { document.querySelectorAll('.opt').forEach((o) => o.classList.remove('sel')); d.classList.add('sel'); onPick(); };
  else d.style.cursor = 'default';
  return d;
};

async function scan() {
  chosen = null; $('b2').disabled = true; $('e2').textContent = '';
  $('lines').innerHTML = '';
  $('scanmsg').innerHTML = '<span class="spin"></span>Buscando módems y celulares… (puede tardar unos segundos)';
  $('b2scan').disabled = true;
  const { modems, phones } = await P.detect();
  $('b2scan').disabled = false;
  $('scanmsg').textContent = '';
  let any = 0;

  modems.filter((m) => m.ok).forEach((m) => {
    any++;
    const ready = m.sim;
    const label = `Módem ${m.port}${m.operator ? ' · ' + m.operator : ''}`;
    const desc = `${m.name || 'Puerto ' + m.port}${m.signal != null ? ` · señal ${m.signal}%` : ''}${ready ? '' : ' · No detecta el chip (SIM) o pide PIN'}`;
    $('lines').appendChild(optEl(label, desc, ready ? 'Listo' : 'Sin chip', ready ? 'ok' : 'bad', ready,
      () => { chosen = { kind: 'modem', port: m.port, label }; $('b2').disabled = false; }));
  });

  phones.forEach((p) => {
    any++;
    const label = `${p.model}${p.operator ? ' · ' + p.operator : ''}`;
    if (p.state === 'unauthorized') {
      $('lines').appendChild(optEl(p.model || p.serial, 'Desbloquea el celular y acepta "¿Permitir depuración por USB?" (marca "Permitir siempre"). Luego "Buscar de nuevo".', 'Falta autorizar', 'warn', false));
      return;
    }
    if (p.state !== 'device') {
      $('lines').appendChild(optEl(p.model || p.serial, `Estado: ${p.state}. Desconecta y vuelve a conectar el cable.`, 'No disponible', 'bad', false));
      return;
    }
    const ready = p.helper && p.smsGranted;
    let extra = null;
    if (!ready) {
      extra = document.createElement('button');
      extra.textContent = p.helper ? 'Dar permiso de SMS' : 'Instalar la app de envíos';
      extra.onclick = async (ev) => {
        ev.stopPropagation();
        extra.disabled = true; $('e2').textContent = '';
        const r = await P.prepareAndroid(p.serial);
        $('scanmsg').textContent = '';
        if (!r.ok) { $('e2').textContent = r.error; extra.disabled = false; return; }
        scan();
      };
    }
    const desc = `${p.simReady ? 'Chip listo' : 'No se ve el chip (SIM)'}${ready ? ' · App de envíos instalada' : ' · Falta instalar la app de envíos (un toque)'}`;
    $('lines').appendChild(optEl(label, desc, ready ? 'Listo' : 'Preparar', ready ? 'ok' : 'warn', ready,
      () => { chosen = { kind: 'android', serial: p.serial, label }; $('b2').disabled = false; }, extra));
  });

  if (!any) {
    $('lines').innerHTML = '';
    const d = document.createElement('p');
    d.className = 'err';
    d.textContent = 'No encontré ningún módem ni celular. Conecta el módem USB con su chip, o el celular Android con "Depuración por USB" encendida, y oprime "Buscar de nuevo". Algunos módems y celulares (por ejemplo Samsung) necesitan instalar su controlador USB en Windows.';
    $('lines').appendChild(d);
  } else if ($('lines').querySelectorAll('.opt').length) {
    // Si solo hay una opción lista, se elige sola
    const ready = [...$('lines').querySelectorAll('.opt')].filter((o) => o.style.cursor !== 'default');
    if (ready.length === 1) ready[0].click();
  }
}
P.onStep((t) => { $('scanmsg').innerHTML = '<span class="spin"></span>' + t; });
$('b2scan').onclick = scan;
$('b2back').onclick = () => { if (mode === 'change') { mode = 'setup'; show(); } else step(1); };
$('b2').onclick = async () => {
  if (!chosen) return;
  $('linename').textContent = chosen.label;
  $('o3').textContent = ''; $('e3').textContent = ''; $('b3').disabled = true;
  $('b3').textContent = mode === 'change' ? 'Sí me llegó · Usar esta línea' : 'Sí me llegó · Activar el puente';
  step(3);
};

// ---------- Paso 3: prueba ----------
$('b3test').onclick = async () => {
  $('e3').textContent = ''; $('o3').innerHTML = '<span class="spin"></span>Enviando…';
  $('b3test').disabled = true;
  const r = await P.test(chosen, $('testphone').value);
  $('b3test').disabled = false;
  if (!r.ok) { $('o3').textContent = ''; $('e3').textContent = r.error; return; }
  $('o3').textContent = 'El SMS salió. Revisa tu celular; si te llegó, actívalo.';
  $('b3').disabled = false;
};
$('b3back').onclick = () => step(2);
$('b3').onclick = async () => {
  $('b3').disabled = true;
  if (mode === 'change') {
    await P.setLine(chosen);
    mode = 'setup';
  } else {
    const r = await P.configure(token, chosen, $('pcname').value);
    if (!r.ok) { $('e3').textContent = r.error; $('b3').disabled = false; return; }
  }
  state = await P.state();
  show();
};

// ---------- Panel ----------
$('bpause').onclick = () => P.pause(!state.paused);
$('bline').onclick = () => { mode = 'change'; show(); step(2); scan(); };
$('btest').onclick = () => { mode = 'change'; chosen = state.line; show(); $('linename').textContent = chosen.label; step(3); };
$('breset').onclick = async () => {
  if (!confirm('¿Desconectar este equipo? Dejará de enviar los códigos y tendrás que configurarlo de nuevo con una llave.')) return;
  await P.reset();
  token = ''; $('token').value = '';
  state = await P.state(); mode = 'setup'; show(); step(1);
};

// ---------- Inicio ----------
P.onState((s) => { state = s; if (mode === 'setup') show(); });
(async () => {
  $('ver').textContent = 'versión ' + (await P.version());
  state = await P.state();
  show();
  if (!state.configured) step(1);
})();
