'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { locationService, projectService } from '@/lib/services';
import type { LocationRead as Location, ProjectRead as Project } from '@/lib/services';
import { useAuth } from '@/context/AuthContext';

export default function LocationsPage() {
    const { tenantId } = useAuth();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selProject, setSelProject] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', environment_type: '', lighting_condition: '' });

    const [editingLocId, setEditingLocId] = useState<string | null>(null);

    const loadProjects = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await projectService.list(tenantId);
            setProjects(data as Project[]);
            setSelProject(prev => (data.length > 0 && !prev) ? (data[0] as Project).id : prev);
        } catch { }
    }, [tenantId]);

    const loadLocations = useCallback(async () => {
        if (!selProject || !tenantId) { setLoading(false); return; }
        setLoading(true);
        try {
            const data = await locationService.listByProject(selProject, tenantId);
            setLocations(data as Location[]);
        } catch { } finally { setLoading(false); }
    }, [selProject, tenantId]);

    useEffect(() => { loadProjects(); }, [loadProjects]);
    useEffect(() => { if (selProject) loadLocations(); }, [selProject, loadLocations]);

    const handleSave = async () => {
        if (!form.name.trim() || !selProject || !tenantId) return;
        try {
            if (editingLocId) {
                await locationService.update(editingLocId, form, tenantId);
            } else {
                await locationService.create({ ...form, project_id: selProject }, tenantId);
            }
            setForm({ name: '', description: '', environment_type: '', lighting_condition: '' });
            setShowCreate(false);
            setEditingLocId(null);
            loadLocations();
        } catch (e) { console.error(e); }
    };

    const handleEdit = (loc: Location) => {
        setForm({
            name: loc.name,
            description: loc.description || '',
            environment_type: loc.environment_type || '',
            lighting_condition: loc.lighting_condition || ''
        });
        setEditingLocId(loc.id);
        setShowCreate(true);
    };

    const deleteLocation = async (id: string) => {
        if (!confirm('Delete this location?') || !tenantId) return;
        try {
            await locationService.delete(id, tenantId);
            loadLocations();
        } catch (e) { console.error(e); }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Locations" />
                <div className="page-container" style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>🗺️ Locations</h2>
                            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>สถานที่ถ่ายทำในแต่ละโปรเจกต์</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select className="form-input" value={selProject} onChange={e => setSelProject(e.target.value)} style={{ fontSize: 12, minWidth: 180 }}>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={() => { setForm({ name: '', description: '', environment_type: '', lighting_condition: '' }); setEditingLocId(null); setShowCreate(true); }}>+ Add Location</button>
                        </div>
                    </div>

                    {showCreate && (
                        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{editingLocId ? '📝 Edit Location' : '📍 New Location'}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div className="form-field"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                                <div className="form-field"><label className="form-label">Environment Type</label><input className="form-input" value={form.environment_type} onChange={e => setForm({ ...form, environment_type: e.target.value })} placeholder="e.g. Interior, Exterior, Studio" /></div>
                                <div className="form-field" style={{ gridColumn: 'span 2' }}><label className="form-label">Description</label><input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                                <div className="form-field"><label className="form-label">Lighting</label><input className="form-input" value={form.lighting_condition} onChange={e => setForm({ ...form, lighting_condition: e.target.value })} placeholder="e.g. Natural, Low-key, Studio" /></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                                <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setEditingLocId(null); }}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSave}>{editingLocId ? '💾 Save Changes' : 'Create'}</button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260,1fr))', gap: 12 }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12 }} />)}
                        </div>
                    ) : locations.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 48, marginBottom: 8 }}>📍</div>
                            <div style={{ fontSize: 14 }}>No locations for this project</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260,1fr))', gap: 12 }}>
                            {locations.map(loc => (
                                <div key={loc.id} className="card" style={{ padding: 16, position: 'relative' }}>
                                    <div style={{ fontSize: 28, marginBottom: 8 }}>📍</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{loc.name}</div>
                                    {loc.description && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6, lineHeight: 1.5 }}>{loc.description}</div>}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {loc.environment_type && <span style={{ fontSize: 10, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{loc.environment_type}</span>}
                                        {loc.lighting_condition && <span style={{ fontSize: 10, background: '#fef9c3', color: '#a16207', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{loc.lighting_condition}</span>}
                                    </div>
                                    <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
                                        <button onClick={() => handleEdit(loc)} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>✏️</button>
                                        <button onClick={() => deleteLocation(loc.id)} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}>🗑</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
