'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import type { UserRead } from '@/lib/services';

interface AuthContextType {
    user: User | null;
    userProfile: UserRead | null;
    tenantId: string | null;
    loading: boolean;
    signOut: () => Promise<void>;
    switchTenant: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserRead | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const syncingRef = useRef(false);

    const syncUser = async (supabaseUser: User): Promise<string | null> => {
        if (syncingRef.current) return null;
        syncingRef.current = true;
        try {
            const email = supabaseUser.email?.toLowerCase();
            if (!email) return null;

            // 1. Sync global profile
            let { data: profile } = await supabase.from('users').select('*').eq('auth_id', supabaseUser.id).maybeSingle();

            if (!profile) {
                const { data: byEmail } = await supabase.from('users').select('*').ilike('email', email).maybeSingle();
                if (byEmail) {
                    const { data: updated } = await supabase.from('users').update({ auth_id: supabaseUser.id }).eq('id', byEmail.id).select().single();
                    profile = updated;
                } else {
                    const { data: newP } = await supabase.from('users').insert({
                        email,
                        auth_id: supabaseUser.id,
                        display_name: supabaseUser.user_metadata?.full_name || 'Owner',
                        avatar_url: supabaseUser.user_metadata?.avatar_url || null
                    }).select().single();
                    profile = newP;
                }
            }
            if (profile) setUserProfile(profile as UserRead);

            // 2. Determine an active tenant ID
            // Check if they own any tenant
            const { data: owned } = await supabase.from('tenants').select('id').eq('owner_id', supabaseUser.id).order('created_at').limit(1).maybeSingle();
            if (owned) return owned.id;

            // Check if they are a member of any tenant
            if (profile?.id) {
                const { data: memberOf } = await supabase.from('tenant_members').select('tenant_id').eq('user_id', profile.id).limit(1).maybeSingle();
                if (memberOf) return memberOf.tenant_id;
            }

            // 3. Fallback: Create a default Personal Studio
            const { data: newT } = await supabase.from('tenants').insert({
                name: `${supabaseUser.user_metadata?.full_name || 'Personal'} Studio`,
                plan: 'indie',
                owner_id: supabaseUser.id
            }).select().single();

            if (newT && profile?.id) {
                await supabase.from('tenant_members').insert({
                    tenant_id: newT.id,
                    user_id: profile.id,
                    role: 'owner'
                });
                return newT.id;
            } else if (newT) {
                return newT.id;
            }

            return null;
        } catch (e) {
            console.error('syncUser error:', e);
            return null;
        } finally {
            syncingRef.current = false;
        }
    };

    const switchTenant = async (id: string) => {
        if (!user || !userProfile) return;
        setLoading(true);
        try {
            const { data: owned } = await supabase.from('tenants').select('*').eq('id', id).eq('owner_id', user.id).maybeSingle();
            const { data: member } = await supabase.from('tenant_members').select('*').eq('user_id', userProfile.id).eq('tenant_id', id).maybeSingle();

            if (!owned && !member) throw new Error('No access to this studio.');

            setTenantId(id);
            localStorage.setItem('scene_core_last_tenant_id', id);
            router.push('/dashboard');
        } catch (e: any) {
            alert(e.message || 'Access Denied');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let mounted = true;
        const handleSession = async (session: any) => {
            try {
                if (!session) {
                    if (mounted) {
                        setUser(null);
                        setUserProfile(null);
                        setTenantId(null);
                    }
                    return;
                }
                setUser(session.user);
                const verifiedTenantId = await syncUser(session.user);
                if (mounted && verifiedTenantId) {
                    const lastId = localStorage.getItem('scene_core_last_tenant_id');
                    if (lastId && lastId !== verifiedTenantId) {
                        // Check if they have access to lastId
                        const { data: owned } = await supabase.from('tenants').select('id').eq('id', lastId).eq('owner_id', session.user.id).maybeSingle();
                        let hasAccess = !!owned;
                        if (!hasAccess) {
                            // Find out if they are a member
                            const { data: profile } = await supabase.from('users').select('id').eq('auth_id', session.user.id).single();
                            if (profile) {
                                const { data: member } = await supabase.from('tenant_members').select('id').eq('user_id', profile.id).eq('tenant_id', lastId).maybeSingle();
                                hasAccess = !!member;
                            }
                        }

                        if (hasAccess) {
                            setTenantId(lastId);
                            return;
                        }
                    }
                    setTenantId(verifiedTenantId);
                }
            } catch (err) {
                console.error('Session handling error:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            handleSession(session);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        localStorage.removeItem('scene_core_last_tenant_id');
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, userProfile, tenantId, loading, signOut, switchTenant }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
