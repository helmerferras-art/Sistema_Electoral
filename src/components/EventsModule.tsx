import { useEffect, useState } from 'react';
import { CalendarDays, Plus, QrCode, Share2, X, Users, MapPin } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { eventLink, formatEventDate, type EventRow } from '../lib/engagement';

type Attendance = { event_id: string; name: string | null; phone: string; rsvp_at: string | null; checked_in_at: string | null };
const COMMAND = ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial', 'comunicacion_digital'];

/**
 * Eventos con confirmación de asistencia y registro de llegada por QR.
 * Cada integrante comparte su propio enlace: cuando su invitado llega, suma puntos.
 */
export const EventsModule = () => {
    const { user } = useAuth();
    const [events, setEvents] = useState<EventRow[]>([]);
    const [attendance, setAttendance] = useState<Attendance[]>([]);
    const [creating, setCreating] = useState(false);
    const [qrFor, setQrFor] = useState<EventRow | null>(null);
    const [listFor, setListFor] = useState<EventRow | null>(null);
    const [showPast, setShowPast] = useState(false);
    const [form, setForm] = useState({ title: '', place: '', date: '', hours: '2', capacity: '', description: '' });
    const canCreate = !!user && user.role !== 'brigadista';

    const load = async () => {
        if (!user?.tenantScope?.length) return;
        const since = new Date(Date.now() - (showPast ? 60 : 1) * 86400000).toISOString();
        const { data } = await supabase.from('events')
            .select('id, tenant_id, title, description, place, starts_at, ends_at, capacity, status, checkin_token, created_by, created_at')
            .in('tenant_id', user.tenantScope).gte('starts_at', since).order('starts_at', { ascending: !showPast });
        const evs = (data || []) as EventRow[];
        setEvents(evs);
        if (evs.length) {
            const { data: att } = await supabase.from('event_attendance')
                .select('event_id, name, phone, rsvp_at, checked_in_at').in('event_id', evs.map(e => e.id));
            setAttendance((att || []) as Attendance[]);
        } else setAttendance([]);
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, showPast]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !form.title || !form.date) return;
        const starts = new Date(form.date);
        const ends = new Date(starts.getTime() + Math.max(0.5, Number(form.hours) || 2) * 3600000);
        const { error } = await supabase.from('events').insert({
            tenant_id: user.tenant_id, created_by: user.id, title: form.title.trim(), place: form.place.trim() || null,
            description: form.description.trim() || null, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
            capacity: form.capacity ? Number(form.capacity) : null,
        });
        if (error) { alert('No se pudo crear: ' + error.message); return; }
        setCreating(false);
        setForm({ title: '', place: '', date: '', hours: '2', capacity: '', description: '' });
        load();
    };

    const cancel = async (ev: EventRow) => {
        if (!window.confirm(`¿Cancelar "${ev.title}"? Quienes abran el enlace verán que se canceló.`)) return;
        const { error } = await supabase.from('events').update({ status: 'cancelado' }).eq('id', ev.id);
        if (error) alert('No se pudo cancelar: ' + error.message); else load();
    };

    const share = (ev: EventRow) => {
        const text = `Te invito a ${ev.title}${ev.place ? ` en ${ev.place}` : ''}, ${formatEventDate(ev.starts_at)}. Confirma aquí: ${eventLink(ev.checkin_token, user?.id)}`;
        if (navigator.share) navigator.share({ text }).catch(() => { });
        else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const canManage = (ev: EventRow) => !!user && (ev.created_by === user.id || COMMAND.includes(user.role));

    return (
        <div className="tactile-card flex-col gap-2" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CalendarDays color="var(--tertiary)" /> EVENTOS
                </h3>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="squishy-btn" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setShowPast(!showPast)}>
                        {showPast ? 'Próximos' : 'Anteriores'}
                    </button>
                    {canCreate && !creating && (
                        <button className="squishy-btn primary" style={{ padding: '0.35rem 0.6rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }} onClick={() => setCreating(true)}>
                            <Plus size={16} /> Nuevo
                        </button>
                    )}
                </div>
            </div>

            {creating && (
                <form onSubmit={create} className="flex-col gap-1" style={{ background: 'rgba(0,0,0,0.25)', padding: '0.8rem', borderRadius: 8 }}>
                    <input className="squishy-input" placeholder="Nombre del evento" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                    <input className="squishy-input" placeholder="Lugar (dirección o referencia)" value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} />
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.4rem' }}>
                        <input className="squishy-input" type="datetime-local" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                        <input className="squishy-input" type="number" min="0.5" step="0.5" placeholder="Horas" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} />
                        <input className="squishy-input" type="number" min="1" placeholder="Cupo" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
                    </div>
                    <textarea className="squishy-input" placeholder="Descripción (opcional)" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="squishy-btn" style={{ flex: 1 }} onClick={() => setCreating(false)}>Cancelar</button>
                        <button type="submit" className="squishy-btn primary" style={{ flex: 2 }}>Crear evento</button>
                    </div>
                </form>
            )}

            {events.length === 0 && !creating && (
                <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>{showPast ? 'Sin eventos en los últimos 60 días.' : 'No hay eventos próximos.'}</div>
            )}

            {events.map(ev => {
                const att = attendance.filter(a => a.event_id === ev.id);
                const rsvp = att.filter(a => a.rsvp_at).length;
                const arrived = att.filter(a => a.checked_in_at).length;
                return (
                    <div key={ev.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.7rem', opacity: ev.status === 'cancelado' ? 0.55 : 1 }}>
                        <div style={{ fontWeight: 700 }}>{ev.title}{ev.status === 'cancelado' ? ' · CANCELADO' : ''}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94A3B8', textTransform: 'capitalize' }}>{formatEventDate(ev.starts_at)}</div>
                        {ev.place && <div style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'flex', gap: '0.3rem', alignItems: 'center' }}><MapPin size={12} /> {ev.place}</div>}
                        <div style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}>
                            <strong>{rsvp}</strong> confirmaron{ev.capacity ? ` de ${ev.capacity}` : ''} · <strong>{arrived}</strong> llegaron
                        </div>
                        {ev.status !== 'cancelado' && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                                <button className="squishy-btn" style={btn} onClick={() => share(ev)}><Share2 size={14} /> Invitar</button>
                                {canManage(ev) && <button className="squishy-btn" style={btn} onClick={() => setQrFor(ev)}><QrCode size={14} /> QR de llegada</button>}
                                {canManage(ev) && <button className="squishy-btn" style={btn} onClick={() => setListFor(ev)}><Users size={14} /> Lista</button>}
                                {canManage(ev) && <button className="squishy-btn" style={{ ...btn, color: '#94A3B8' }} onClick={() => cancel(ev)}>Cancelar</button>}
                            </div>
                        )}
                    </div>
                );
            })}

            {qrFor && (
                <div style={overlay} onClick={() => setQrFor(null)}>
                    <div className="tactile-card" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setQrFor(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={22} /></button>
                        <h3 style={{ fontFamily: 'Oswald', marginTop: 0 }}>{qrFor.title}</h3>
                        <div style={{ background: '#fff', padding: '0.8rem', borderRadius: 12, display: 'inline-block' }}>
                            <QRCodeSVG value={eventLink(qrFor.checkin_token)} size={240} level="M" />
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
                            Colócalo en la entrada. Cada asistente lo escanea con su celular y registra su llegada (se abre 3 horas antes del inicio).
                        </p>
                    </div>
                </div>
            )}

            {listFor && (
                <div style={overlay} onClick={() => setListFor(null)}>
                    <div className="tactile-card" style={{ maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setListFor(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={22} /></button>
                        <h3 style={{ fontFamily: 'Oswald', marginTop: 0 }}>{listFor.title}</h3>
                        {attendance.filter(a => a.event_id === listFor.id).length === 0
                            ? <p style={{ color: '#94A3B8' }}>Aún nadie confirma.</p>
                            : attendance.filter(a => a.event_id === listFor.id).map(a => (
                                <div key={a.phone} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span>{a.name || 'Sin nombre'} · {a.phone.slice(-4).padStart(10, '•')}</span>
                                    <span style={{ color: a.checked_in_at ? 'var(--secondary)' : '#94A3B8' }}>{a.checked_in_at ? 'Llegó' : 'Confirmó'}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const btn: React.CSSProperties = { padding: '0.35rem 0.6rem', fontSize: '0.8rem', display: 'flex', gap: '0.3rem', alignItems: 'center' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' };

export default EventsModule;
