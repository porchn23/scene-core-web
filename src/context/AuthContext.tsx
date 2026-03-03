'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import type { UserRead } from '@/lib/services';

interface AuthContextType {
    user: User | null; // Supabase Auth User
    userProfile: UserRead | null; // public.users record
    tenantId: string | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserRead | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const syncingRef = useRef(false);

    const syncUser = async (supabaseUser: User | null) => {
        if (!supabaseUser) return null;
        if (syncingRef.current) return null;
        syncingRef.current = true;

        try {
            const email = supabaseUser.email?.toLowerCase();
            if (!email) {
                console.error('❌ User has no email');
                return null;
            }
            console.log('🔄 Syncing profile for:', email);

            // Try to fetch from public.users - case insensitive
            let { data: profile, error: fetchError } = await supabase
                .from('users')
                .select('*')
                .ilike('email', email)
                .maybeSingle();

            if (fetchError) {
                console.error('❌ Fetch Error:', fetchError);
            }

            // If not exists, attempt to create
            if (!profile) {
                console.log('✨ Profile not found. Attempting creation...');
                console.log('🏢 Creating unique personal studio...');
                const ownerName = supabaseUser.user_metadata?.full_name?.split(' ')[0] || 'My';
                let tId: string | undefined;
                console.log('⚠️ No profile found for user:', email || supabaseUser.id);

                // CRITICAL FIX: Create a NEW personal tenant instead of joining a random one!
                const { data: newTenant, error: tErr } = await supabase.from('tenants').insert({
                    name: `${supabaseUser.user_metadata?.full_name || 'Personal'} Studio`,
                    plan: 'indie'
                }).select().single();

                if (tErr) {
                    console.error('❌ Tenant Creation Failed:', tErr.message);
                    return null;
                }

                if (newTenant) {
                    console.log('📝 Inserting user record tied to new tenant...');
                    const { data: newProfile, error: createError } = await supabase.from('users').insert({
                        email: email,
                        auth_id: supabaseUser.id,
                        tenant_id: newTenant.id,
                        role: 'admin',
                        display_name: supabaseUser.user_metadata?.full_name || 'New Director',
                        avatar_url: supabaseUser.user_metadata?.avatar_url
                    }).select().single();

                    if (createError) {
                        if (createError.code === '23505') { // Duplicate unique
                            const { data: retry } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
                            profile = retry;
                        } else {
                            console.error('❌ INSERT Error:', createError);
                        }
                    } else {
                        console.log('✅ Created:', newProfile.id);
                        profile = newProfile;
                    }
                }
            } else {
                console.log('👤 Profile active:', profile.id);

                if (!profile.auth_id || !profile.avatar_url) {
                    console.log('🔗 Updating profile metadata...');
                    await supabase.from('users').update({
                        auth_id: supabaseUser.id,
                        display_name: profile.display_name || supabaseUser.user_metadata?.full_name,
                        avatar_url: profile.avatar_url || supabaseUser.user_metadata?.avatar_url
                    }).eq('id', profile.id);
                }
            }

            return profile as UserRead;
        } finally {
            syncingRef.current = false;
        }
    };

    useEffect(() => {
        let mounted = true;

        const handleSession = async (session: any) => {
            if (session) {
                setUser(session.user);
                const profile = await syncUser(session.user);
                if (mounted && profile) {
                    setUserProfile(profile);
                    setTenantId(profile.tenant_id);
                }
            } else {
                if (mounted) {
                    setUser(null);
                    setUserProfile(null);
                    setTenantId(null);
                }
            }
            if (mounted) setLoading(false);
        };

        const fetchSession = async () => {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            await handleSession(session);
        };

        fetchSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            await handleSession(session);
            if (event === 'SIGNED_OUT') {
                router.push('/login');
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [router]);

    const signOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, userProfile, tenantId, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
