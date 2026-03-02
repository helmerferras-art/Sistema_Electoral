import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { UserPlus, Trash2, CheckCircle, Search, Play, Key, PauseCircle, PlayCircle, Edit } from 'lucide-react';


export const AdminManager = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const { impersonateUser } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Form states
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newRole, setNewRole] = useState('candidato');
    const [newTenantId, setNewTenantId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: usersData } = await supabase
                .from('users')
                .select('*, tenants(name)')
                .order('created_at', { ascending: false });

            const { data: tenantsData } = await supabase
                .from('tenants')
                .select('id, name');

            if (usersData) setUsers(usersData);
            if (tenantsData) {
                setTenants(tenantsData);
                if (tenantsData.length > 0) setNewTenantId(tenantsData[0].id);
            }
        } catch (error) {
            console.error("Error loading admin data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setIsSubmitting(true);

        const tacticalCode = Math.floor(100000 + Math.random() * 900000).toString();
        const formattedPhone = newPhone.startsWith('+52') ? newPhone : `+52${newPhone}`;

        try {
            const { error } = await supabase
                .from('users')
                .upsert([{
                    name: newName,
                    phone: formattedPhone,
                    role: newRole,
                    tenant_id: newTenantId || null,
                    rank_name: newRole === 'superadmin' ? 'Alto Mando' : 'Comandante Supremo',
                    is_first_login: true,
                    temp_code: tacticalCode,
                    two_factor_enabled: newRole === 'superadmin'
                }], { onConflict: 'phone' });

            if (error) throw error;

            setMessage(`✅ Usuario creado: ${newName}. Código táctico inicial: ${tacticalCode}`);
            setNewName('');
            setNewPhone('');
            loadData();
        } catch (error: any) {
            setMessage(`❌ Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!confirm(`¿Estás seguro de ELIMINAR al usuario ${name}?`)) return;

        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) {
            alert(`Error: ${error.message}`);
        } else {
            loadData();
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean, name: string) => {
        if (!confirm(`¿Estás seguro de ${currentStatus ? 'PAUSAR' : 'REACTIVAR'} la cuenta de ${name}?`)) return;
        setProcessingId(id);
        const { error } = await supabase.from('users').update({ is_active: !currentStatus }).eq('id', id);
        if (error) alert(`Error: ${error.message}`);
        else loadData();
        setProcessingId(null);
    };

    const handleResetCredentials = async (id: string, name: string) => {
        if (!confirm(`¿Generar un nuevo código de acceso temporal para ${name}? Esto borrará su contraseña actual.`)) return;
        setProcessingId(id);
        const tacticalCode = Math.floor(100000 + Math.random() * 900000).toString();
        const { error } = await supabase.from('users').update({
            temp_code: tacticalCode,
            password_hash: null,
            is_first_login: true
        }).eq('id', id);

        if (error) {
            alert(`Error: ${error.message}`);
        } else {
            alert(`✅ Credenciales restablecidas.\n\nEl nuevo código temporal para ${name} es: ${tacticalCode}\nEntrégalo de forma segura.`);
            loadData();
        }
        setProcessingId(null);
    };

    const handleEditUser = async (user: any) => {
        const newName = prompt('Editar Nombre:', user.name);
        if (newName === null) return;
        const newPhone = prompt('Editar Teléfono (10 dígitos):', user.phone?.replace('+52', ''));
        if (newPhone === null) return;

        const formattedPhone = newPhone.startsWith('+52') ? newPhone : `+52${newPhone}`;
        setProcessingId(user.id);
        const { error } = await supabase.from('users').update({ name: newName, phone: formattedPhone }).eq('id', user.id);
        if (error) alert(`Error al editar: ${error.message}`);
        else loadData();
        setProcessingId(null);
    };

    const handleImpersonate = async (user: any) => {
        if (!confirm(`MODO FANTASMA\n\n¿Estás seguro de iniciar sesión simulando ser ${user.name}? \n\nPodrás operar en el sistema como si fueras este usuario. En cualquier momento podrás abortar la suplantación desde el Menú Principal.`)) return;
        await impersonateUser(user);
    };

    const filteredUsers = users.filter((u: any) =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.includes(searchTerm)
    );

    if (loading) return (
        <div className="flex-center flex-col" style={{ height: '300px', color: 'var(--primary)', gap: '1rem' }}>
            <Search className="spin" size={48} />
            <p className="tactical-font">SINCRONIZANDO ALTO MANDO...</p>
        </div>
    );

    return (

        <div className="flex-col gap-2" style={{ padding: '1rem', color: 'white' }}>
            <h2 className="tactical-font" style={{ color: 'var(--primary)', borderBottom: '2px solid var(--primary)', paddingBottom: '0.5rem' }}>
                GESTIÓN DE ALTO MANDO
            </h2>

            {message && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(0,212,255,0.1)', border: '1px solid var(--tertiary)', borderRadius: '8px', color: 'var(--tertiary)' }}>
                    {message}
                </div>
            )}

            <div className="grid-2" style={{ gap: '2rem' }}>
                {/* Create Section */}
                <div className="tactile-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <h3 className="tactical-font" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                        <span style={{ marginRight: '0.5rem' }}><UserPlus size={18} /></span>
                        RECLUTAR NUEVO ADMINISTRADOR
                    </h3>

                    <form onSubmit={handleCreateUser} className="flex-col gap-2">
                        <div className="flex-col">
                            <label style={{ fontSize: '0.8rem', color: '#888' }}>NOMBRE COMPLETO</label>
                            <input
                                type="text"
                                className="squishy-input"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.8rem', color: '#888' }}>TELÉFONO (10 DÍGITOS)</label>
                            <input
                                type="tel"
                                className="squishy-input"
                                value={newPhone}
                                onChange={e => setNewPhone(e.target.value)}
                                placeholder="961..."
                                required
                            />
                        </div>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.8rem', color: '#888' }}>ROL DE ACCESO</label>
                            <select
                                className="squishy-input"
                                value={newRole}
                                onChange={e => setNewRole(e.target.value)}
                                style={{ background: '#1a1d24', color: 'white' }}
                            >
                                <option value="superadmin">SuperAdmin (Sistema Global)</option>
                                <option value="candidato">Candidato (Comando Campaña)</option>
                                <option value="coordinador_campana">Coordinador de Campaña</option>
                            </select>
                        </div>
                        {newRole !== 'superadmin' && (
                            <div className="flex-col">
                                <label style={{ fontSize: '0.8rem', color: '#888' }}>ASIGNAR A CAMPAÑA (TENANT)</label>
                                <select
                                    className="squishy-input"
                                    value={newTenantId}
                                    onChange={e => setNewTenantId(e.target.value)}
                                    style={{ background: '#1a1d24', color: 'white' }}
                                >
                                    {tenants.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            type="submit"
                            className="squishy-btn primary"
                            disabled={isSubmitting}
                            style={{ marginTop: '1rem' }}
                        >
                            {isSubmitting ? 'PROCESANDO...' : 'GENERAR PERFIL TÁCTICO'}
                        </button>
                    </form>
                </div>

                {/* List Section */}
                <div className="flex-col gap-2">
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#444' }} />
                        <input
                            type="text"
                            className="squishy-input"
                            placeholder="Buscar por nombre o teléfono..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #333', color: '#666' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>USUARIO</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>ROL</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>ESTADO</th>
                                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>ACCIÓN</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((u: any) => (

                                    <tr key={u.id} style={{ borderBottom: '1px solid #222' }}>
                                        <td style={{ padding: '0.8rem 0.5rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>{u.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>{u.phone}</div>
                                            {u.tenants && <div style={{ fontSize: '0.75rem', color: 'var(--tertiary)' }}>{u.tenants.name}</div>}
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: u.role === 'superadmin' ? 'rgba(255,90,54,0.2)' : 'rgba(0,212,255,0.2)',
                                                color: u.role === 'superadmin' ? 'var(--primary)' : 'var(--tertiary)'
                                            }}>
                                                {u.role.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <div className="flex-col gap-1">
                                                <span style={{ fontSize: '0.7rem', color: u.is_active !== false ? '#86efac' : '#fca5a5' }}>
                                                    {u.is_active !== false ? '🟢 ACTIVO' : '🔴 PAUSADO'}
                                                </span>
                                                {u.two_factor_enabled && (
                                                    <span style={{ fontSize: '0.65rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                        <CheckCircle size={10} color="lime" /> 2FA ON
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', opacity: processingId === u.id ? 0.5 : 1 }}>
                                                <button
                                                    onClick={() => handleImpersonate(u)}
                                                    title="Modo Fantasma (Suplantar Identidad)"
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--tertiary)', cursor: 'pointer', padding: '0.3rem' }}
                                                    disabled={processingId === u.id}
                                                >
                                                    <Play size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleResetCredentials(u.id, u.name)}
                                                    title="Restablecer Credenciales (Forzar Nuevo Código)"
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '0.3rem' }}
                                                    disabled={processingId === u.id}
                                                >
                                                    <Key size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleEditUser(u)}
                                                    title="Editar Datos"
                                                    style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.3rem' }}
                                                    disabled={processingId === u.id}
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleStatus(u.id, u.is_active !== false, u.name)}
                                                    title={u.is_active !== false ? "Pausar Cuenta" : "Reactivar Cuenta"}
                                                    style={{ background: 'transparent', border: 'none', color: u.is_active !== false ? '#f59e0b' : '#86efac', cursor: 'pointer', padding: '0.3rem' }}
                                                    disabled={processingId === u.id}
                                                >
                                                    {u.is_active !== false ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(u.id, u.name)}
                                                    title="Eliminar Permanente"
                                                    style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '0.3rem' }}
                                                    disabled={processingId === u.id}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
