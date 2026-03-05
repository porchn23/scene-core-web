'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { tenantService, userService } from '@/lib/services';
import type { TenantRead as Tenant, UserRead as User } from '@/lib/services';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function TenantsPage() {
    const { user, switchTenant } = useAuth();
    const router = useRouter();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPlan, setNewPlan] = useState('indie');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [tenantUsers, setTenantUsers] = useState<Record<string, User[]>>({});
    const [addEmail, setAddEmail] = useState('');
    const [newApiKeys, setNewApiKeys] = useState<Record<string, { keyName: string; keyValue: string }>>({});

    const loadData = useCallback(async (authId: string) => {
        try {
            const data = await tenantService.list(authId);
            setTenants(data as Tenant[]);
        } catch { } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (user?.id) loadData(user.id);
        else if (user === null) setLoading(false);
    }, [user, loadData]);

    const createTenant = async () => {
        if (!newName.trim() || !user?.id) return;
        try {
            await tenantService.create({
                name: newName,
                plan: newPlan,
                owner_email: user.email,
                owner_auth_id: user.id,
                display_name: user.user_metadata?.full_name,
                avatar_url: user.user_metadata?.avatar_url
            });
            setNewName(''); setShowCreate(false);
            if (user?.id) loadData(user.id);
        } catch (e) { console.error(e); }
    };

    const deleteTenant = async (id: string) => {
        if (!confirm('Delete this tenant?')) return;
        try {
            if (!user?.id) throw new Error('User ID required');
            await tenantService.delete(id, user.id);
            if (user?.id) loadData(user.id);
        } catch (e) { console.error(e); }
    };

    const toggleExpand = async (id: string) => {
        if (expanded === id) { setExpanded(null); return; }
        setExpanded(id);
        if (user?.id && !tenantUsers[id]) {
            try {
                const users = await userService.listByTenant(id, user.id);
                setTenantUsers(prev => ({ ...prev, [id]: users as User[] }));
            } catch (e) {
                console.error(e);
                setTenantUsers(prev => ({ ...prev, [id]: [] }));
            }
        }
    };

    const addUserToTenant = async (tenantId: string) => {
        if (!addEmail.trim()) return;
        try {
            await userService.create({ email: addEmail, tenant_id: tenantId, role: 'member' });
            setAddEmail('');
            if (!user?.id) throw new Error('User ID required');
            const users = await userService.listByTenant(tenantId, user.id);
            setTenantUsers(prev => ({ ...prev, [tenantId]: users as User[] }));
        } catch (e) { console.error(e); }
    };

    const removeUserFromTenant = async (tenantId: string, memberId: string, isOwner: boolean) => {
        if (isOwner) {
            alert('Cannot remove the studio owner.');
            return;
        }
        if (!confirm('Remove this member from the studio?')) return;
        try {
            await userService.removeFromTenant(tenantId, memberId);
            if (!user?.id) throw new Error('User ID required');
            const users = await userService.listByTenant(tenantId, user.id);
            setTenantUsers(prev => ({ ...prev, [tenantId]: users as User[] }));
        } catch (e) {
            console.error('Error removing member:', e);
            alert('Failed to remove member.');
        }
    };

    const handleAddApiKey = async (tenant: Tenant) => {
        const input = newApiKeys[tenant.id];
        if (!input || !input.keyName.trim() || !input.keyValue.trim()) return;

        try {
            const keyName = input.keyName.trim();
            const rawValue = input.keyValue.trim();

            let finalValue: any = rawValue;

            // Try to parse as JSON if it looks like JSON
            if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
                try {
                    finalValue = JSON.parse(rawValue);
                } catch (e) {
                    // If parsing fails, keep as string
                }
            }

            const updatedKeys = { ...(tenant.api_keys || {}), [keyName]: finalValue };
            await tenantService.update(tenant.id, { api_keys: updatedKeys }, user!.id);
            setNewApiKeys(prev => ({ ...prev, [tenant.id]: { keyName: '', keyValue: '' } }));
            if (user?.id) loadData(user.id);
        } catch (e) {
            console.error(e);
            alert('Failed to add API key.');
        }
    };

    const handleRemoveApiKey = async (tenant: Tenant, keyToRemove: string) => {
        if (!confirm(`Delete API key "${keyToRemove}"?`)) return;
        try {
            const updatedKeys = { ...tenant.api_keys };
            delete updatedKeys[keyToRemove];
            await tenantService.update(tenant.id, { api_keys: updatedKeys }, user!.id);
            if (user?.id) loadData(user.id);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Tenants" />
                <div className="page-container" style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🏢 Tenants</h2>
                            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>จัดการค่ายหนังและทีมงาน</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Tenant</button>
                    </div>

                    {showCreate && (
                        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🆕 New Tenant</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tenant name" style={{ flex: 2, minWidth: 200 }} />
                                <select className="form-input" value={newPlan} onChange={e => setNewPlan(e.target.value)} style={{ flex: 1, minWidth: 100 }}>
                                    <option value="indie">Indie</option>
                                    <option value="studio">Studio</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                                <button className="btn btn-primary" onClick={createTenant}>Create</button>
                                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />)}
                        </div>
                    ) : tenants.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 48, marginBottom: 8 }}>🏠</div>
                            <div style={{ fontSize: 14 }}>No tenants yet</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {tenants.map(t => (
                                <div key={t.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => toggleExpand(t.id)}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                                            {t.name[0]?.toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                                Plan: {t.plan.toUpperCase()} · Credits: {t.credit_balance.toLocaleString()} · {t.is_active ? '🟢 Active' : '🔴 Inactive'}
                                            </div>
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        await switchTenant(t.id);
                                                        router.push('/dashboard');
                                                    } catch (err: any) {
                                                        alert(err.message);
                                                    }
                                                }}
                                                style={{ marginTop: 4, padding: '2px 8px', fontSize: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Switch to this Studio
                                            </button>
                                        </div>
                                        <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{expanded === t.id ? '▲' : '▼'}</span>
                                        {user?.id === t.owner_id && (
                                            <button onClick={e => { e.stopPropagation(); deleteTenant(t.id); }} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', opacity: 0.5 }}>🗑</button>
                                        )}
                                    </div>
                                    {expanded === t.id && (
                                        <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--color-border)' }}>
                                            {(!t.owner_id || user?.id !== t.owner_id) ? (
                                                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                                                    🔒 Only the Studio Owner can view and manage team members and API settings.
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ fontSize: 11, fontWeight: 700, margin: '12px 0 8px', color: 'var(--color-text-secondary)' }}>👥 Team Members</div>
                                                    {(tenantUsers[t.id] || []).length === 0 ? (
                                                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>No members yet</div>
                                                    ) : (
                                                        (tenantUsers[t.id] || []).map((u, index) => (
                                                            <div key={u?.id || `user-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span>📧</span> <span style={{ color: '#e4e4e7' }}>{u?.email || 'Unknown User'}</span>
                                                                    <span style={{ fontSize: 10, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: 4 }}>{u?.role || 'member'}</span>
                                                                </div>

                                                                {u?.role !== 'owner' && (
                                                                    <button
                                                                        onClick={() => removeUserFromTenant(t.id, u.id, u.role === 'owner')}
                                                                        style={{
                                                                            background: 'none', border: 'none', color: 'var(--color-danger)',
                                                                            cursor: 'pointer', opacity: 0.5, fontSize: 12, padding: '2px 6px',
                                                                            transition: 'opacity 0.2s'
                                                                        }}
                                                                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                                        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                                                                        title="Remove Member"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))
                                                    )}
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                        <input className="form-input" value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="email@example.com" style={{ flex: 1, fontSize: 11 }} />
                                                        <button className="btn btn-primary btn-sm" onClick={() => addUserToTenant(t.id)}>+ Add</button>
                                                    </div>

                                                    <div style={{ marginTop: 20 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, margin: '12px 0 8px', color: 'var(--color-text-secondary)' }}>🔑 API Keys (AI Services)</div>
                                                        {Object.keys(t.api_keys || {}).length === 0 ? (
                                                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>No API keys configured yet</div>
                                                        ) : (
                                                            Object.entries(t.api_keys || {}).map(([keyName, keyValue]) => (
                                                                <div key={keyName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                    <div style={{ fontWeight: 600, color: '#e4e4e7', minWidth: 80, paddingTop: 2 }}>{keyName}</div>
                                                                    <div style={{ flex: 1 }}>
                                                                        {typeof keyValue === 'object' && keyValue !== null ? (
                                                                            <pre style={{ margin: 0, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, fontFamily: 'monospace', color: '#a1a1aa', fontSize: 10, overflowX: 'auto' }}>
                                                                                {JSON.stringify(keyValue, null, 2)}
                                                                            </pre>
                                                                        ) : (
                                                                            <div style={{ fontFamily: 'monospace', color: 'var(--color-text-tertiary)' }}>
                                                                                {typeof keyValue === 'string' ? `${keyValue.substring(0, 8)}...${keyValue.slice(-8)}` : '***'}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button onClick={() => handleRemoveApiKey(t, keyName)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', opacity: 0.6, fontSize: 12, paddingTop: 2 }}>✕</button>
                                                                </div>
                                                            ))
                                                        )}

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <select className="form-input" value={newApiKeys[t.id]?.keyName || ''} onChange={e => setNewApiKeys(prev => ({ ...prev, [t.id]: { ...prev[t.id], keyName: e.target.value } }))} style={{ width: 150, fontSize: 11 }}>
                                                                    <option value="" disabled>Select AI Service</option>
                                                                    <option value="gemini">Gemini</option>
                                                                    <option value="openai">OpenAI</option>
                                                                    <option value="kling">Kling</option>
                                                                    <option value="runway">Runway</option>
                                                                    <option value="anthropic">Anthropic</option>
                                                                    <option value="luma_dreammachine">Luma Dream Machine</option>
                                                                    <option value="elevenlabs">ElevenLabs</option>
                                                                    <option value="minimax">Minimax</option>
                                                                    <option value="leonardo_ai">Leonardo AI</option>
                                                                    <option value="aws_s3">AWS S3</option>
                                                                    <option value="custom">Custom Service...</option>
                                                                </select>
                                                                {newApiKeys[t.id]?.keyName === 'custom' && (
                                                                    <input className="form-input" placeholder="Service Name" onChange={e => setNewApiKeys(prev => ({ ...prev, [t.id]: { ...prev[t.id], keyName: e.target.value } }))} style={{ flex: 1, fontSize: 11 }} />
                                                                )}
                                                            </div>
                                                            <textarea
                                                                className="form-input"
                                                                value={newApiKeys[t.id]?.keyValue || ''}
                                                                onChange={e => setNewApiKeys(prev => ({ ...prev, [t.id]: { ...prev[t.id], keyValue: e.target.value } }))}
                                                                placeholder='Paste API Key string OR JSON Object, e.g. {"api_key": "...", "secret_key": "..."}'
                                                                style={{ width: '100%', height: 80, fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
                                                            />
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                                <button className="btn btn-primary btn-sm" onClick={() => handleAddApiKey(t)}>+ Save API Config</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
