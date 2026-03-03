'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { characterService, actorService, projectService } from '@/lib/services';
import type { CharacterRead as Character, ActorRead as Actor, ProjectRead as Project } from '@/lib/services';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';

export default function CharactersPage() {
    const { tenantId } = useAuth();
    const { t, show: notify } = useToast();
    const [characters, setCharacters] = useState<Character[]>([]);
    const [actors, setActors] = useState<Actor[]>([]);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selProject, setSelProject] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const [form, setForm] = useState({
        name: '',
        personality_traits: '',
        outfit_description: '',
        actor_id: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);

    const loadProjects = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await projectService.list(tenantId);
            setProjects(data as Project[]);
            // Only set initial project if none is selected
            if (data.length > 0 && !selProject) {
                setSelProject((data[0] as Project).id);
            }
        } catch (e) {
            console.error('Error loading projects:', e);
        }
    }, [tenantId]); // removed selProject to avoid loop

    const loadData = useCallback(async () => {
        if (!selProject || !tenantId) {
            if (!selProject && !loading) setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [cr, ar] = await Promise.all([
                characterService.listByProject(selProject, tenantId),
                actorService.list(tenantId),
            ]);
            setCharacters(cr as Character[]);
            setActors(ar as Actor[]);
        } catch (e) {
            console.error('Error loading characters data:', e);
        } finally { setLoading(false); }
    }, [selProject, tenantId]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSave = async () => {
        if (!form.name.trim() || !selProject) {
            notify('Please enter a name and select a project', true);
            return;
        }
        try {
            if (!tenantId) throw new Error('Tenant ID required');

            if (editingId) {
                await characterService.update(editingId, {
                    ...form,
                    actor_id: form.actor_id || null,
                }, tenantId);
                notify('Character updated successfully!');
            } else {
                await characterService.create({
                    ...form,
                    project_id: selProject,
                    actor_id: form.actor_id || null,
                }, tenantId);
                notify('Character created successfully!');
            }

            setForm({ name: '', personality_traits: '', outfit_description: '', actor_id: '' });
            setShowCreate(false);
            setEditingId(null);
            loadData();
        } catch (e: any) {
            console.error(e);
            notify(e.message || 'Failed to save character', true);
        }
    };

    const handleEdit = (ch: Character) => {
        setForm({
            name: ch.name,
            personality_traits: ch.personality_traits || '',
            outfit_description: ch.outfit_description || '',
            actor_id: ch.actor_id || ''
        });
        setEditingId(ch.id);
        setShowCreate(true);
    };

    const deleteChar = async (id: string) => {
        if (!confirm('Delete this character?')) return;
        try {
            if (!tenantId) return;
            await characterService.delete(id, tenantId);
            loadData();
            notify('Character deleted.');
        } catch (e: any) {
            console.error(e);
            notify(e.message || 'Failed to delete', true);
        }
    };

    const findActor = (id?: string | null) => id ? actors.find(a => a.id === id) : undefined;

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Production Cast" />
                <div className="page-container" style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>👤 Characters & Casting</h2>
                            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>Manage roles, personas, and assigned actors for your script.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Current Project</span>
                                <select className="form-input" value={selProject} onChange={e => setSelProject(e.target.value)} style={{ fontSize: 13, minWidth: 200, height: 40, borderRadius: 10 }}>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" style={{ height: 40, padding: '0 20px', borderRadius: 10, alignSelf: 'flex-end' }} onClick={() => setShowCreate(true)}>+ Add Role</button>
                        </div>
                    </div>

                    {showCreate && (
                        <div className="card" style={{ padding: 28, marginBottom: 24, borderRadius: 20, border: '1px solid var(--color-accent-light)', background: '#f8faff' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>{editingId ? '📝 Edit Role' : '🎭 Define New Role'}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                <div className="form-field">
                                    <label className="form-label">Role / Character Name *</label>
                                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder=" John Doe" />
                                </div>
                                <div className="form-field">
                                    <label className="form-label">Assigned Actor (Optional)</label>
                                    <select className="form-input" value={form.actor_id} onChange={e => setForm({ ...form, actor_id: e.target.value })}>
                                        <option value="">— Unassigned —</option>
                                        {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                                    <label className="form-label">Personality & Traits</label>
                                    <textarea className="form-input" rows={2} value={form.personality_traits} onChange={e => setForm({ ...form, personality_traits: e.target.value })} placeholder=" Brave, quiet, mysterious, always carries a flask" />
                                </div>
                                <div className="form-field" style={{ gridColumn: 'span 2' }}>
                                    <label className="form-label">Outfit / Costume Description</label>
                                    <input className="form-input" value={form.outfit_description} onChange={e => setForm({ ...form, outfit_description: e.target.value })} placeholder=" Dark leather jacket, combat boots" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                                <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setEditingId(null); }}>Cancel</button>
                                <button className="btn btn-primary" style={{ padding: '0 32px' }} onClick={handleSave}>{editingId ? 'Save Changes' : 'Create Character'}</button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 16 }} />)}
                        </div>
                    ) : characters.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '80px 20px', borderRadius: 24, background: 'var(--color-surface-2)', border: '2px dashed var(--color-border)' }}>
                            <div style={{ fontSize: 64, marginBottom: 16 }}>👥</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>No characters in this project yet</div>
                            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', maxWidth: 300, margin: '8px auto 24px' }}>Add characters to start assigning actors and generating scenes.</p>
                            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Add First Character</button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
                            {characters.map(ch => {
                                const actor = findActor(ch.actor_id);
                                return (
                                    <div key={ch.id} className="card" style={{ padding: 24, position: 'relative', borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 200 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ position: 'relative' }}>
                                                {actor?.face_image_url ? (
                                                    <img src={actor.face_image_url} alt={actor.name} style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover', border: '3px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                                ) : (
                                                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: '2px dashed var(--color-border)' }}>👤</div>
                                                )}
                                                {actor?.lora_url && <div title="AI LoRA Ready" style={{ position: 'absolute', bottom: -4, right: -4, background: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', border: '1px solid #7c3aed' }}>🧠</div>}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>{ch.name}</div>
                                                {actor ? (
                                                    <div style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ fontSize: 10 }}>🎬</span> {actor.name}
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 600, marginTop: 2 }}>🎭 Unassigned</div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            {ch.personality_traits && (
                                                <div style={{ fontSize: 13, color: 'var(--color-text-primary)', marginBottom: 10, lineHeight: 1.4, display: 'flex', gap: 8 }}>
                                                    <span style={{ opacity: 0.5 }}>⚡</span>
                                                    <span>{ch.personality_traits}</span>
                                                </div>
                                            )}
                                            {ch.outfit_description && (
                                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 8 }}>
                                                    <span style={{ opacity: 0.5 }}>👔</span>
                                                    <span>{ch.outfit_description}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 12 }}>
                                            <button
                                                onClick={() => handleEdit(ch)}
                                                className="btn btn-ghost btn-sm"
                                                style={{ color: 'var(--color-text-secondary)' }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => deleteChar(ch.id)}
                                                className="btn btn-ghost btn-sm"
                                                style={{ color: 'var(--color-danger)', opacity: 0.6 }}
                                            >
                                                Delete Role
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            {t && <div style={{ position: 'fixed', bottom: 24, right: 24, background: t.err ? 'var(--color-danger)' : '#1e293b', color: '#fff', padding: '11px 18px', borderRadius: 12, zIndex: 10000 }}>{t.msg}</div>}
        </div>
    );
}
