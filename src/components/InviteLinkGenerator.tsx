import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { UserPlus, Copy, CheckCircle, Smartphone } from 'lucide-react';

type InviteRole = 'coordinador' | 'lider' | 'brigadista';

export const InviteLinkGenerator = ({ targetRole, parentId }: { targetRole: InviteRole, parentId: string }) => {
    const { user } = useAuth();
    const [newUserName, setNewUserName] = useState('');
    const [newUserPhone, setNewUserPhone] = useState('');
    const [generatedLink, setGeneratedLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const generateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setGeneratedLink('');
        setCopied(false);

        if (!user || !user.tenant_id) {
            setError('Error de sesión. Intenta recargar.');
            setLoading(false);
            return;
        }

        try {
            // 1. Insert the pre-authorized user into the database
            const { error: insertError } = await supabase
                .from('users')
                .insert([{
                    tenant_id: user.tenant_id,
                    name: newUserName,
                    phone: newUserPhone,
                    role: targetRole,
                    parent_id: parentId, // Hierarchy link
                    rank_name: targetRole === 'coordinador' ? 'Comandante Nivel 1' : targetRole === 'lider' ? 'Guardián Nivel 1' : 'Explorador Nivel 1'
                }])
                .select()
                .single();

            if (insertError) {
                if (insertError.code === '23505') {
                    setError('Ese número de teléfono ya está registrado en el sistema.');
                } else {
                    setError(`Error al crear usuario: ${insertError.message}`);
                }
                setLoading(false);
                return;
            }

            // 2. Generate WhatsApp Text with the generic login link
            // In a real app with deep linking, this could be a direct deep link. 
            // For MVP, we send them to the main /login page since they are already pre-authorized in DB.
            const appUrl = window.location.origin + '/login';

            const message = `🚨 *MISIÓN ELECTORAL* 🚨\n\nHola ${newUserName}, has sido convocado a unirte como *${targetRole.toUpperCase()}* por ${user.name}.\n\nTu acceso ha sido pre-aprobado. Ingresa al cuartel aquí usando tu número celular (${newUserPhone}):\n${appUrl}`;

            const whatsappLink = `https://wa.me/${newUserPhone.replace(/\+/g, '')}?text=${encodeURIComponent(message)}`;

            setGeneratedLink(whatsappLink);

            // Allow sending another one
            setNewUserName('');
            setNewUserPhone('');

        } catch (err) {
            setError('Error de red al intentar conectar con el cuartel general.');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    return (
        <div className="tactile-card flex-col gap-2" style={{ border: '1px solid var(--primary)', backgroundColor: 'rgba(255, 90, 54, 0.05)' }}>
            <h3 style={{ fontFamily: 'Oswald, sans-serif', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={20} /> INVITAR {targetRole.toUpperCase()}
            </h3>

            <form onSubmit={generateInvite} className="flex-col gap-2">
                <input
                    type="text"
                    className="squishy-input"
                    placeholder="[ NOMBRE DEL RECLUTA ]"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    required
                />
                <input
                    type="tel"
                    className="squishy-input"
                    placeholder="[ CELULAR DEL RECLUTA ]"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    required
                />
                <button type="submit" className="squishy-btn primary" disabled={loading} style={{ justifyContent: 'center' }}>
                    {loading ? 'MODULANDO SEÑAL...' : 'GENERAR ENLACE DE ACCESO'}
                </button>
            </form>

            {error && <p style={{ color: '#ff8a80', fontSize: '0.9rem', textAlign: 'center' }}>{error}</p>}

            {generatedLink && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px dashed var(--tertiary)' }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Enlace generado. Envíalo directamente por WhatsApp:</p>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <a
                            href={generatedLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="squishy-btn"
                            style={{ flex: 1, backgroundColor: '#25D366', color: 'black', border: '1px solid #1DA851', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Smartphone size={18} /> ABRIR WHATSAPP
                        </a>

                        <button
                            onClick={copyToClipboard}
                            className="squishy-btn"
                            style={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--tertiary)' }}
                            title="Copiar Link"
                        >
                            {copied ? <CheckCircle size={20} color="var(--tertiary)" /> : <Copy size={20} color="var(--tertiary)" />}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
