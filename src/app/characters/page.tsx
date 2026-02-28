'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { characterService, actorService, projectService } from '@/lib/services';
import type { CharacterRead as Character, ActorRead as Actor, ProjectRead as Project } from '@/lib/services';

export default function CharactersPage() {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [actors, setActors] = useState<Actor[]>([]);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selProject, setSelProject] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', personality_traits: '', outfit_description: '', actor_id: '' });

    const loadProjects = useCallback(async () => {
        try {
            const data = await projectService.list();
            setProjects(data as Project[]);
            if (data.length > 0 && !selProject) setSelProject((data[0] as Project).id);
        } catch { }
    }, [selProject]);

    const loadData = useCallback(async () => {
        if (!selProject) { setLoading(false); return; }
        setLoading(true);
        try {
            const [cr, ar] = await Promise.all([
                characterService.listByProject(selProject),
                actorService.list(),
            ]);
            setCharacters(cr as Character[]);
            setActors(ar as Actor[]);
        } catch { } finally { setLoading(false); }
    }, [selProject]);

    useEffect(() => { loadProjects(); }, [loadProjects]);
    useEffect(() => { if (selProject) loadData(); }, [selProject, loadData]);

    const createChar = async () => {
        if (!form.name.trim() || !selProject) return;
        try {
            await characterService.create({ ...form, project_id: selProject, actor_id: form.actor_id || null });
            setForm({ name: '', personality_traits: '', outfit_description: '', actor_id: '' });
            setShowCreate(false); loadData();
        } catch (e) { console.error(e); }
    };

    const deleteChar = async (id: string) => {
        if (!confirm('Delete this character?')) return;
        try {
            await characterService.delete(id);
            loadData();
        } catch (e) { console.error(e); }
    };

    const findActor = (id?: string | null) => id ? actors.find(a => a.id === id) : undefined;

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Characters" />
                <div className="page-container" style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>👤 Characters</h2>
                            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>ตัวละครในบทภาพยนตร์</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select className="form-input" value={selProject} onChange={e => setSelProject(e.target.value)} style={{ fontSize: 12, minWidth: 180 }}>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Character</button>
                        </div>
                    </div>

                    {showCreate && (
                        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🎭 New Character</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div className="form-field"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-field">
                                    <label className="form-label">Cast Actor</label>
                                    <select className="form-input" value={form.actor_id} onChange={e => setForm({ ...form, actor_id: e.target.value })}>
                                        <option value="">— None —</option>
                                        {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-field" style={{ gridColumn: 'span 2' }}><label className="form-label">Personality Traits</label><input className="form-input" value={form.personality_traits} onChange={e => setForm({ ...form, personality_traits: e.target.value })} placeholder="e.g. Brave, quiet, mysterious" /></div>
                                <div className="form-field" style={{ gridColumn: 'span 2' }}><label className="form-label">Outfit Description</label><input className="form-input" value={form.outfit_description} onChange={e => setForm({ ...form, outfit_description: e.target.value })} placeholder="e.g. Dark leather jacket, combat boots" /></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={createChar}>Create</button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240,1fr))', gap: 12 }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />)}
                        </div>
                    ) : characters.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 48, marginBottom: 8 }}>🎭</div>
                            <div style={{ fontSize: 14 }}>No characters for this project</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240,1fr))', gap: 12 }}>
                            {characters.map(ch => {
                                const actor = findActor(ch.actor_id);
                                return (
                                    <div key={ch.id} className="card" style={{ padding: 16, position: 'relative' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                            {actor?.face_image_url ? (
                                                <img src={actor.face_image_url} alt={actor.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-accent)' }} />
                                            ) : (
                                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎭</div>
                                            )}
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700 }}>{ch.name}</div>
                                                {actor && <div style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 600 }}>🎬 {actor.name}</div>}
                                            </div>
                                        </div>
                                        {ch.personality_traits && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>🧠 {ch.personality_traits}</div>}
                                        {ch.outfit_description && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>👔 {ch.outfit_description}</div>}
                                        <button onClick={() => deleteChar(ch.id)} style={{ position: 'absolute', top: 10, right: 10, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', opacity: 0.5 }}>🗑</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
