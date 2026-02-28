'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { tenantService, userService } from '@/lib/services';
import type { TenantRead as Tenant, UserRead as User } from '@/lib/services';

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPlan, setNewPlan] = useState('indie');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [tenantUsers, setTenantUsers] = useState<Record<string, User[]>>({});
    const [addEmail, setAddEmail] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await tenantService.list();
            setTenants(data as Tenant[]);
        } catch { } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const createTenant = async () => {
        if (!newName.trim()) return;
        try {
            await tenantService.create({ name: newName, plan: newPlan });
            setNewName(''); setShowCreate(false); load();
        } catch (e) { console.error(e); }
    };

    const deleteTenant = async (id: string) => {
        if (!confirm('Delete this tenant?')) return;
        try {
            await tenantService.delete(id);
            load();
        } catch (e) { console.error(e); }
    };

    const toggleExpand = async (id: string) => {
        if (expanded === id) { setExpanded(null); return; }
        setExpanded(id);
        if (!tenantUsers[id]) {
            try {
                const users = await userService.listByTenant(id);
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
            const users = await userService.listByTenant(tenantId);
            setTenantUsers(prev => ({ ...prev, [tenantId]: users as User[] }));
        } catch (e) { console.error(e); }
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
                                        </div>
                                        <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>{expanded === t.id ? '▲' : '▼'}</span>
                                        <button onClick={e => { e.stopPropagation(); deleteTenant(t.id); }} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', opacity: 0.5 }}>🗑</button>
                                    </div>
                                    {expanded === t.id && (
                                        <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--color-border)' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, margin: '12px 0 8px', color: 'var(--color-text-secondary)' }}>👥 Team Members</div>
                                            {(tenantUsers[t.id] || []).length === 0 ? (
                                                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', padding: '8px 0' }}>No members yet</div>
                                            ) : (
                                                (tenantUsers[t.id] || []).map(u => (
                                                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                                                        <span>📧</span> {u.email} <span style={{ fontSize: 10, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: 4 }}>{u.role}</span>
                                                    </div>
                                                ))
                                            )}
                                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                                <input className="form-input" value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="email@example.com" style={{ flex: 1, fontSize: 11 }} />
                                                <button className="btn btn-primary btn-sm" onClick={() => addUserToTenant(t.id)}>+ Add</button>
                                            </div>
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
