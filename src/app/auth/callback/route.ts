import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/dashboard';

    if (code) {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // This can be ignored if you have middleware refreshing user sessions.
                        }
                    },
                },
            }
        );
        const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && user) {
            // Claim or Create Profile
            const { data: profileObj, error: claimErr } = await supabase.rpc('claim_or_create_profile', {
                _email: user.email,
                _display_name: user.user_metadata?.full_name || 'New Director',
                _avatar_url: user.user_metadata?.avatar_url || ''
            });

            if (claimErr) {
                console.error('--- CALLBACK: Error claiming profile ---', claimErr);
                const origin = request.headers.get('origin') || new URL(request.url).origin;
                return NextResponse.redirect(`${origin}/login?error=profile-setup-failed`);
            }

            // Check if they need a Personal Studio
            // (Only create if they lack both owned studios AND studio memberships)
            const { count: ownedCount } = await supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('owner_id', user.id);
            const { count: memberCount } = await supabase.from('tenant_members').select('*', { count: 'exact', head: true }).eq('user_id', profileObj.id);

            if (ownedCount === 0 && memberCount === 0) {
                console.log('--- CALLBACK: Creating personal studio ---');
                const ownerName = user.user_metadata?.full_name?.split(' ')[0] || 'My';
                const { data: newTenant, error: tCreateError } = await supabase.from('tenants')
                    .insert({ name: `${ownerName} Studio`, plan: 'indie', owner_id: user.id })
                    .select().single();

                if (newTenant) {
                    await supabase.from('tenant_members').insert({ tenant_id: newTenant.id, user_id: profileObj.id, role: 'owner' });
                }
            }

            const origin = request.headers.get('origin') || new URL(request.url).origin;
            return NextResponse.redirect(`${origin}${next}`);
        }
        console.error('Auth code exchange error:', error);
    }

    return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}
