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
    devLogin: (phone: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    updatePassword: (newPassword: string) => Promise<{ error: any }>;
    impersonateUser: (targetUser: any) => Promise<void>;
    abortImpersonation: () => Promise<void>;
    isImpersonating: boolean;
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

        // --- LOGICA C4I: Verificar Código Táctico o Contraseña ---
        const rawPhone = formattedPhone.replace('+52', '');
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .or(`phone.eq.${formattedPhone},phone.eq.${rawPhone}`)
            .order('created_at', { ascending: false })
            .limit(1);

        const foundUser = userData && userData.length > 0 ? userData[0] : null;

        if (foundUser) {
            // Caso 1: Primer login con Código Táctico
            if (foundUser.is_first_login && String(foundUser.temp_code).trim() === String(token).trim()) {
                console.log("C4I: Código Táctico Correcto. Primer login detectado.");
                return await devLogin(formattedPhone);
            }

            // Caso 2: Login con Contraseña (token actúa como password en este paso del form)
            if (!foundUser.is_first_login && String(foundUser.password_hash).trim() === String(token).trim()) {
                console.log("C4I: Contraseña Permanente Correcta. Verificando requerimientos de 2FA...");

                // --- INTEGRACION 2FA TACTICO PARA ALTO MANDO ---
                if (foundUser.two_factor_enabled) {
                    const tactical2FA = Math.floor(100000 + Math.random() * 900000).toString();
                    await supabase
                        .from('users')
                        .update({ temp_code: tactical2FA, code_sent: false })
                        .eq('id', foundUser.id);

                    const message = `SISTEMA C4I (NEMIA): Tu código de seguridad 2FA temporal es ${tactical2FA}.`;
                    BridgeService.sendSMS(foundUser.phone, message).catch(console.error);

                    console.log(`C4I 2FA: Desafío emitido vía Bridge para ${foundUser.phone}.`);
                    return { error: null, requires2FA: true };
                }

                return await devLogin(formattedPhone);
            }
        }


        // No standard password/otp matched, fallback to Supabase Auth if integrated

        const { error } = await supabase.auth.verifyOtp({
            phone: formattedPhone,
            token,
            type: 'sms',
        });
        return { error };
    };

    const verifyTwoFactor = async (phone: string, code: string) => {
        let formattedPhone = phone.startsWith('+') ? phone : `+52${phone}`;
        const rawPhone = formattedPhone.replace('+52', '');

        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .or(`phone.eq.${formattedPhone},phone.eq.${rawPhone}`)
            .eq('temp_code', code)
            .limit(1)
            .single();

        if (!userData) {
            return { error: { message: 'CÓDIGO 2FA INCORRECTO O EXPIRADO.' } };
        }

        console.log("C4I: 2FA Verificado. Otorgando acceso de Alto Mando.");
        return await devLogin(formattedPhone);
    };

    // Helper for Dev Backdoor to bypass Supabase native auth and just use our users table
    const devLogin = async (formattedPhone: string) => {
        try {
            // Because the SuperAdmin form might have saved the phone number WITHOUT the +52, 
            // we will query relying on `like` or stripping the prefix to make sure we find the Candidate user.
            const rawPhone = formattedPhone.replace('+52', '');

            let { data } = await supabase
                .from('users')
                .select('*')
                .or(`phone.eq.${formattedPhone},phone.eq.${rawPhone}`)
                .order('created_at', { ascending: false })
                .limit(1);

            let foundUser = data && data.length > 0 ? data[0] : null;

            if (!foundUser) {
                console.log("No user found for Dev Bypass. Auto-creating provisional user...");

                // Get a default tenant to assign to new users
                // In a production app, this would be a "Pending" or "Guest" tenant
                const { data: tenantData } = await supabase.from('tenants').select('id').limit(1).single();

                const { data: newData, error: upsertError } = await supabase
                    .from('users')
                    .upsert([{
                        name: `Usuario ${rawPhone}`,
                        phone: formattedPhone.startsWith('+') ? formattedPhone : `+52${formattedPhone}`,
                        role: 'brigadista',
                        rank_name: 'Brigadista Nivel 1',
                        tenant_id: tenantData?.id,
                        is_first_login: true
                    }], { onConflict: 'phone' })
                    .select()
                    .limit(1);

                if (upsertError || !newData || newData.length === 0) {
                    return { error: { message: `Fallo el auto-registro: ${upsertError?.message || 'Error desconocido'}` } };
                }
                foundUser = newData[0];
            }

            // Manually set session state 

            // For DevLogin we might not have the full scope available instantly via RPC if we're bypassing RLS or not setting things up right.
            // Just use the tenant_id. The true scope requires a valid session or RPC that supports anon/service role.
            let tenantScope = [foundUser.tenant_id];
            try {
                const { data: scopeData, error: scopeError } = await supabase
                    .rpc('fn_get_tenant_scope', { p_tenant_id: foundUser.tenant_id });
                if (!scopeError && scopeData) {
                    tenantScope = scopeData.map((row: any) => row.tenant_id);
                }
            } catch (e) { }

            const completeDevUser = { ...foundUser, tenantScope } as UserData;
            setUser(completeDevUser);
            setSession({ user: { id: foundUser.auth_id || 'mock-auth-id' } }); // Mock session object
            localStorage.setItem('gamefi_agent_context', JSON.stringify({
                id: foundUser.id,
                tenant_id: foundUser.tenant_id,
                name: foundUser.name,
                role: foundUser.role,
                xp: foundUser.xp,
                rank: foundUser.rank_name,
                phone: foundUser.phone,
                tenantScope: tenantScope
            }));
            return { error: null };

        } catch (e) {
            return { error: e };
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
            const { error } = await supabase
                .from('users')
                .update({
                    password_hash: newPassword, // En producción se debería hashear
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
            user, session, loading, signInWithOtp, verifyOtp, verifyTwoFactor, devLogin, signOut, updatePassword,
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
