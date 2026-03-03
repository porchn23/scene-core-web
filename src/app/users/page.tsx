'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { userService } from '@/lib/services';
import type { UserRead as User } from '@/lib/services';
import { useAuth } from '@/context/AuthContext';
import { projectService } from '@/lib/services';

export default function UsersPage() {
    const { tenantId, userProfile } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<User | null>(null);
    const [editEmail, setEditEmail] = useState('');
    const [editRole, setEditRole] = useState('');

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            // Fetch users in this tenant
            const [usersData, projectsData] = await Promise.all([
                userService.listByTenant(tenantId),
                projectService.list(tenantId)
            ]);
            setUsers(usersData as User[]);
            setProjects(projectsData);
        } catch (e) {
            console.error('Failed to load users:', e);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { load(); }, [load]);

    const getUserStats = (userId: string) => {
        return {
            projects: projects.length // Show total studio projects
        };
    };

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
        if (id === userProfile?.id) {
            alert('Cannot delete yourself!');
            return;
        }
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
                <div className="page-container" style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                        <div>
                            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>👥 Users & Team</h2>
                            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Manage studio members and their project access</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => window.location.href = '/tenants'}>Manage Tenant</button>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
                        </div>
                    ) : users.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '100px 40px', color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 64, marginBottom: 16 }}>👤</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-secondary)' }}>No other users in this studio</div>
                            <div style={{ fontSize: 14 }}>Invite team members from the Tenants page</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
                            {users.map(u => {
                                const stats = getUserStats(u.id);
                                const isMe = u.id === userProfile?.id;

                                return (
                                    <div key={u.id} className="card" style={{
                                        padding: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 16,
                                        border: isMe ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                                        background: isMe ? 'var(--color-accent-light)' : 'var(--color-surface)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        {isMe && <div style={{ position: 'absolute', top: 12, right: 12, background: 'var(--color-accent)', color: 'white', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>You</div>}

                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{
                                                width: 48, height: 48, borderRadius: 'var(--radius-md)',
                                                background: `linear-gradient(135deg, ${isMe ? '#6366f1' : '#4b5563'}, ${isMe ? '#a855f7' : '#1f2937'})`,
                                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, fontSize: 18, flexShrink: 0,
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                            }}>
                                                {u.display_name?.[0] || (u.email && u.email[0]?.toUpperCase()) || '?'}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--color-text-primary)' }}>{u.display_name || 'Unnamed Director'}</div>
                                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{u.email}</div>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 10, background: 'var(--color-surface-3)', padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        {u.role}
                                                    </span>
                                                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: '12px', background: 'rgba(0,0,0,0.03)', borderRadius: 10 }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>{stats.projects}</div>
                                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Projects</div>
                                            </div>
                                            <div style={{ textAlign: 'center', borderLeft: '1px solid var(--color-border)' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>—</div>
                                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: 700 }}>Renders</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                            <button onClick={() => startEdit(u)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Edit Profile</button>
                                            <button onClick={() => deleteUser(u.id)} className="btn btn-sm" style={{ background: 'none', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', opacity: 0.7 }} disabled={isMe}>Remove</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {editing && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
                            onClick={() => setEditing(null)}>
                            <div className="card" style={{ padding: 28, width: 440, maxWidth: '90vw', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, letterSpacing: '-0.01em' }}>Edit Team Member</h3>
                                <div className="form-field" style={{ marginBottom: 16 }}>
                                    <label className="form-label" style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 800, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 6 }}>email address</label>
                                    <input className="form-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} style={{ width: '100%' }} />
                                </div>
                                <div className="form-field" style={{ marginBottom: 24 }}>
                                    <label className="form-label" style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 800, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 6 }}>system role</label>
                                    <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                                        <option value="member">Member</option>
                                        <option value="admin">Admin</option>
                                        <option value="director">Director</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                                    <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .form-field { display: flex; flex-direction: column; gap: 6px; }
                .form-input {
                    background: var(--color-surface-2); border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm); padding: 10px 14px;
                    font-size: 14px; color: var(--color-text-primary);
                    outline: none; transition: all 0.2s; font-family: inherit;
                }
                .form-input:focus { border-color: var(--color-accent); background: var(--color-surface); }
            `}</style>
        </div>
    );
}

