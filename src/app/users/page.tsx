'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { userService } from '@/lib/services';
import type { UserRead as User } from '@/lib/services';

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<User | null>(null);
    const [editEmail, setEditEmail] = useState('');
    const [editRole, setEditRole] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await userService.list();
            setUsers(data as User[]);
        } catch { } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const startEdit = (u: User) => { setEditing(u); setEditEmail(u.email); setEditRole(u.role); };

    const saveEdit = async () => {
        if (!editing) return;
        try {
            await userService.update(editing.id, { email: editEmail, role: editRole });
            setEditing(null);
            load();
        } catch (e) {
            console.error('Failed to save user:', e);
        }
    };

    const deleteUser = async (id: string) => {
        if (!confirm('Delete this user?')) return;
        try {
            await userService.delete(id);
            load();
        } catch (e) {
            console.error('Failed to delete user:', e);
        }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Users" />
                <div className="page-container" style={{ maxWidth: 800, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>👥 Users</h2>
                    <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 20px' }}>จัดการสมาชิกในระบบ</p>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />)}
                        </div>
                    ) : users.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
                            <div style={{ fontSize: 14 }}>No users found</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {users.map(u => (
                                <div key={u.id} className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                        {u.email[0]?.toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{u.email}</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                            Role: {u.role} · Tenant: {u.tenant_id.slice(0, 8)}… · {new Date(u.created_at).toLocaleDateString('th-TH')}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => startEdit(u)} style={{ fontSize: 12, background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>✏️</button>
                                        <button onClick={() => deleteUser(u.id)} style={{ fontSize: 12, background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: 'var(--color-danger)' }}>🗑</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Edit modal */}
                    {editing && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
                            onClick={() => setEditing(null)}>
                            <div className="card" style={{ padding: 24, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Edit User</h3>
                                <div className="form-field">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">Role</label>
                                    <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value)}>
                                        <option value="member">member</option>
                                        <option value="admin">admin</option>
                                        <option value="director">director</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                                    <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                                    <button className="btn btn-primary" onClick={saveEdit}>Save</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
