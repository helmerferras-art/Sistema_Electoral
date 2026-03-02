import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';

export type NotificationType = 'achievement' | 'mission' | 'alert' | 'system';

export interface NotificationRecord {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    is_read: boolean;
    created_at: string;
}

export interface ToastMessage {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
}

interface NotificationContextType {
    notifications: NotificationRecord[];
    unreadCount: number;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
    triggerToast: (title: string, message: string, type: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
        if (!isUUID) return;

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                setNotifications(data as NotificationRecord[]);
            }
        } catch (e) {
            console.error(e);
        }
    }, [user?.id]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter(t => t.id !== id));
    }, []);

    const triggerToast = useCallback((title: string, message: string, type: NotificationType) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, title, message, type }]);
        // Auto remove after 5 seconds safely without triggering dependency loops
        setTimeout(() => {
            removeToast(id);
        }, 5000);
    }, [removeToast]);

    useEffect(() => {
        let channel: any = null;

        if (!user || !user.id) {
            setNotifications([]);
            return;
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
        if (!isUUID) return;

        fetchNotifications();

        // Subscribe to real-time inserts
        channel = supabase.channel(`notifications:user_id=eq.${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    const newNotif = payload.new as NotificationRecord;
                    setNotifications((prev) => [newNotif, ...prev]);
                    triggerToast(newNotif.title, newNotif.message, newNotif.type);
                }
            )
            .subscribe();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [user?.id, fetchNotifications, triggerToast]);

    const markAsRead = useCallback(async (id: string) => {
        setNotifications((prev) => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
    }, []);

    const markAllAsRead = useCallback(async () => {
        if (!user?.id) return;
        setNotifications((prev) => prev.map(n => ({ ...n, is_read: true })));

        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
    }, [user?.id]);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            markAsRead,
            markAllAsRead,
            toasts,
            removeToast,
            triggerToast
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};

