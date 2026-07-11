import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { BridgeService } from './BridgeService';

type UserData = {
    id: string;
    tenant_id: string;
    role: string;
    name: string;
    phone: string;
    xp: number;
    rank_name: string;
    assigned_territory?: any;
    assigned_targets?: any;
    latitude?: number;
    longitude?: number;
    is_first_login?: boolean;
    two_factor_enabled?: boolean;
    tenantScope: string[];
};

type AuthContextType = {
    user: UserData | null;
    tenantScope: string[];
    session: any | null;
    loading: boolean;
    signInWithOtp: (phone: string) => Promise<{ error: any }>;
    verifyOtp: (phone: string, token: string) => Promise<{ error: any; requires2FA?: boolean }>;
    verifyTwoFactor: (phone: string, code: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    updatePassword: (newPassword: string) => Promise<{ error: any }>;
    impersonateUser: (targetUser: any) => Promise<void>;
    abortImpersonation: () => Promise<void>;
    isImpersonating: boolean;
};

const toSyntheticEmail = (phone: string) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    return `${digits}@c4i.local`;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<UserData | null>(null);
    const [session, setSession] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [isImpersonating, setIsImpersonating] = useState(false);

    useEffect(() => {
        // Bypass persistence check for non-production environments if explicitly set
        const localBypass = localStorage.getItem('gamefi_agent_context');
        let isBypassed = false;

        if (localBypass && import.meta.env.DEV) {
            try {
                const parsed = JSON.parse(localBypass);
                setUser({
                    id: parsed.id,
                    tenant_id: parsed.tenant_id,
                    name: parsed.name,
                    role: parsed.role,
                    xp: parsed.xp,
                    rank_name: parsed.rank,
                    phone: parsed.phone,
                    assigned_territory: parsed.assigned_territory,
                    tenantScope: parsed.tenantScope || [parsed.tenant_id]
                });
                setSession({ user: { id: 'mock-auth-id' } });

                if (localStorage.getItem('__ghost_mode_original_user__')) {
                    setIsImpersonating(true);
                }

                setLoading(false);
                isBypassed = true;
            } catch (e) {
                console.error("Error parsing local bypass", e);
            }
        }

        if (isBypassed) return;

        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user) {
                fetchUserProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes on auth state (sign in, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
            // Re-verify in case it was set during the listener execution
            if (!localStorage.getItem('gamefi_agent_context')) {
                setSession(currentSession);
                if (currentSession?.user) {
                    fetchUserProfile(currentSession.user.id);
                } else {
                    setUser(null);
                    setLoading(false);
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchUserProfile = async (authId: string) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('auth_id', authId)
                .single();

            if (error) {
                console.error("Error fetching user profile:", error);
            } else if (data) {
                // Fetch tenant scope (alliances structure)
                let tenantScope = [data.tenant_id];
                try {
                    const { data: scopeData, error: scopeError } = await supabase
                        .rpc('fn_get_tenant_scope', { p_tenant_id: data.tenant_id });

                    if (!scopeError && scopeData) {
                        tenantScope = scopeData.map((row: any) => row.tenant_id);
                    } else if (scopeError) {
                        console.warn("Could not fetch tenant scope:", scopeError);
                    }
                } catch (e) {
                    console.warn("RPC fetch failed", e);
                }

                const completeUser = { ...data, tenantScope } as UserData;
                setUser(completeUser);

                // Also store minimal info in localStorage for complete offline scenarios
                localStorage.setItem('gamefi_agent_context', JSON.stringify({
                    id: data.id,
                    tenant_id: data.tenant_id,
                    name: data.name,
                    role: data.role,
                    xp: data.xp,
                    rank: data.rank_name,
                    phone: data.phone,
                    assigned_territory: data.assigned_territory,
                    tenantScope: tenantScope
                }));
            }
        } catch (e) {
            console.error("Exception fetching profile", e);
        } finally {
            setLoading(false);
        }
    };

    const signInWithOtp = async (phone: string) => {
        let formattedPhone = phone;
        if (!phone.startsWith('+')) {
            formattedPhone = '+52' + phone;
        }

        // --- LOGICA C4I: Validación de existencia ---
        const rawPhone = formattedPhone.replace('+52', '').trim();
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .or(`phone.eq.${formattedPhone},phone.eq.${rawPhone}`)
            .order('created_at', { ascending: false })
            .limit(1);

        const foundUser = userData && userData.length > 0 ? userData[0] : null;

        if (!foundUser) {
            return { error: { message: 'NÚMERO NO REGISTRADO. Debes completar tu registro táctico primero.' } };
        }

        if (foundUser.is_first_login && foundUser.temp_code) {
            const message = `SISTEMA C4I (NEMIA): Tu código táctico es ${foundUser.temp_code}. No lo compartas.`;
            BridgeService.sendSMS(foundUser.phone, message).catch(console.error);
            console.log("C4I: Enviando SMS de primer login a", foundUser.phone);
        }

        console.log("C4I: Usuario validado. Permitiendo ingreso de credenciales para:", formattedPhone);
        return { error: null };
    };

    const verifyOtp = async (phone: string, token: string) => {
        let formattedPhone = phone;
        if (!phone.startsWith('+')) {
            formattedPhone = '+52' + phone;
        }

        const rawPhone = formattedPhone.replace('+52', '');
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .or(`phone.eq.${formattedPhone},phone.eq.${rawPhone}`)
            .order('created_at', { ascending: false })
            .limit(1);

        const foundUser = userData && userData.length > 0 ? userData[0] : null;

        if (!foundUser) {
            return { error: { message: 'NÚMERO NO REGISTRADO. Debes completar tu registro táctico primero.' } };
        }

        // token = código táctico (primer login) o contraseña permanente (login normal).
        // En ambos casos es, literalmente, la contraseña actual de auth.users para este usuario.
        const email = toSyntheticEmail(foundUser.phone);
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: token });

        if (signInErr || !signInData.session) {
            return { error: { message: foundUser.is_first_login ? 'Código táctico incorrecto.' : 'Contraseña incorrecta.' } };
        }

        // --- INTEGRACION 2FA TACTICO PARA ALTO MANDO ---
        // La contraseña era correcta, pero no dejamos la sesión activa hasta completar el 2FA.
        if (!foundUser.is_first_login && foundUser.two_factor_enabled) {
            await supabase.auth.signOut();

            const tactical2FA = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            await supabase
                .from('users')
                .update({ temp_code: tactical2FA, temp_code_expires_at: expiresAt, code_sent: false })
                .eq('id', foundUser.id);

            const message = `SISTEMA C4I (NEMIA): Tu código de seguridad 2FA temporal es ${tactical2FA}.`;
            BridgeService.sendSMS(foundUser.phone, message).catch(console.error);

            console.log(`C4I 2FA: Desafío emitido vía Bridge para ${foundUser.phone}.`);
            return { error: null, requires2FA: true };
        }

        // Sesión real ya establecida; onAuthStateChange -> fetchUserProfile completa el resto.
        return { error: null };
    };

    const verifyTwoFactor = async (phone: string, code: string) => {
        let formattedPhone = phone.startsWith('+') ? phone : `+52${phone}`;

        try {
            const { data, error } = await supabase.functions.invoke('complete-2fa-login', {
                body: { phone: formattedPhone, code }
            });

            if (error || !data?.success) {
                return { error: { message: data?.error || 'CÓDIGO 2FA INCORRECTO O EXPIRADO.' } };
            }

            const { error: verifyErr } = await supabase.auth.verifyOtp({
                token_hash: data.token_hash,
                type: 'magiclink'
            });

            if (verifyErr) {
                return { error: { message: 'No se pudo completar el inicio de sesión.' } };
            }

            console.log("C4I: 2FA Verificado. Otorgando acceso de Alto Mando.");
            return { error: null };
        } catch (e) {
            return { error: { message: 'Fallo de conexión al verificar 2FA.' } };
        }
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('gamefi_agent_context');
        setSession(null);
        setUser(null);
    };

    const updatePassword = async (newPassword: string) => {
        if (!user) return { error: { message: 'No hay usuario autenticado' } };

        try {
            // Contraseña real, hasheada por Supabase Auth (requiere sesión activa)
            const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });
            if (authErr) throw authErr;

            const { error } = await supabase
                .from('users')
                .update({
                    is_first_login: false,
                    temp_code: null
                })
                .eq('id', user.id);

            if (error) throw error;

            // Actualizar estado local
            const updatedUser = { ...user, is_first_login: false };
            setUser(updatedUser);

            // Actualizar localStorage
            const savedAgent = localStorage.getItem('gamefi_agent_context');
            if (savedAgent) {
                const agent = JSON.parse(savedAgent);
                agent.is_first_login = false;
                localStorage.setItem('gamefi_agent_context', JSON.stringify(agent));
            }

            return { error: null };
        } catch (e: any) {
            return { error: e };
        }
    };

    const impersonateUser = async (targetUser: any) => {
        if (!localStorage.getItem('__ghost_mode_original_user__')) {
            const currentContext = localStorage.getItem('gamefi_agent_context');
            localStorage.setItem('__ghost_mode_original_user__', currentContext || JSON.stringify(user));
        }

        localStorage.setItem('gamefi_agent_context', JSON.stringify({
            id: targetUser.id,
            tenant_id: targetUser.tenant_id,
            name: targetUser.name,
            role: targetUser.role,
            xp: targetUser.xp,
            rank: targetUser.rank_name,
            phone: targetUser.phone,
            assigned_territory: targetUser.assigned_territory,
            tenantScope: targetUser.tenantScope || [targetUser.tenant_id]
        }));
        window.location.href = '/'; // Hard reload to clear component tree and enter Ghost Mode securely
    };

    const abortImpersonation = async () => {
        const original = localStorage.getItem('__ghost_mode_original_user__');
        if (original) {
            localStorage.setItem('gamefi_agent_context', original);
            localStorage.removeItem('__ghost_mode_original_user__');
            window.location.href = '/';
        }
    };

    return (
        <AuthContext.Provider value={{
            user, session, loading, signInWithOtp, verifyOtp, verifyTwoFactor, signOut, updatePassword,
            impersonateUser, abortImpersonation, isImpersonating, tenantScope: user?.tenantScope || []
        }}>

            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
