'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';

import { renderJobService } from '@/lib/services';
import type { RenderJobRead as RenderJob } from '@/lib/services';

function statusStyle(s: string) {
    switch (s) {
        case 'completed': return { bg: '#dcfce7', c: '#15803d', label: '✅ Completed' };
        case 'processing': return { bg: '#fef9c3', c: '#a16207', label: '⏳ Processing' };
        case 'failed': return { bg: '#fee2e2', c: '#b91c1c', label: '❌ Failed' };
        default: return { bg: '#e2e8f0', c: '#475569', label: '🕐 Pending' };
    }
}

function getJobTypeMeta(type: string) {
    switch (type) {
        case 'render_video': return { label: 'Video Generation', icon: '▶️', color: 'var(--color-primary)' };
        case 'render_image': return { label: 'Image Preview', icon: '📸', color: 'var(--color-secondary)' };
        case 'train_lora': return { label: 'Actor LoRA Training', icon: '🎭', color: 'var(--color-purple)' };
        default: return { label: type || 'Unknown Task', icon: '⚙️', color: 'var(--color-text-secondary)' };
    }
}

export default function RenderJobsPage() {
    const { tenantId } = useAuth();
    const [jobs, setJobs] = useState<RenderJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!tenantId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await renderJobService.list(tenantId);
            setJobs(data as RenderJob[]);
        } catch (e: unknown) {
            setError((e as { detail?: string; message?: string }).detail || (e as Error).message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { load(); }, [load, tenantId]);

    const updateStatus = async (id: string, status: string) => {
        if (!tenantId) return;
        try {
            await renderJobService.updateStatus(id, status, tenantId);
            load();
        } catch (e) { console.error(e); }
    };

    const deleteJob = async (id: string) => {
        if (!window.confirm('Delete this render job?') || !tenantId) return;
        try {
            await renderJobService.delete(id, tenantId);
            load();
        } catch (e) { console.error(e); }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Render Jobs" />
                <div className="page-container" style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div>
                            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>⚙️ Render Jobs</h2>
                            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '4px 0 0' }}>ติดตามสถานะการเจนวิดีโอทั้งหมด</p>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); load(); }}>🔄 Refresh</button>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />)}
                        </div>
                    ) : error ? (
                        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-danger)' }}>⚠️ {error}</div>
                    ) : jobs.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>No render jobs yet</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Go to a project → select a shot → click &quot;Render&quot; to start</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {jobs.map(job => {
                                const st = statusStyle(job.status);
                                const jType = getJobTypeMeta(job.job_type);
                                return (
                                    <div key={job.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 10, background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                                            {job.status === 'completed' ? '✅' : job.status === 'processing' ? '⏳' : job.status === 'failed' ? '❌' : '🕐'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: jType.color || 'var(--color-text-primary)' }}>
                                                    {jType.icon} {jType.label}
                                                </div>
                                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', background: 'var(--color-surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                                                    Job: {job.id.split('-')[0]}
                                                </div>
                                            </div>

                                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 6 }}>
                                                {job.projects && <div style={{ display: 'flex', gap: 4 }}><span>Project:</span> <strong style={{ color: 'var(--color-text-primary)' }}>{job.projects.name}</strong></div>}
                                                {!job.projects && job.project_id && <div style={{ display: 'flex', gap: 4 }}><span>Project ID:</span> <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{job.project_id.split('-')[0]}</span></div>}
                                                {job.scene_id && <div style={{ display: 'flex', gap: 4 }}><span>Scene:</span> <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{job.scene_id.split('-')[0]}</span></div>}
                                                {job.shot_id && <div style={{ display: 'flex', gap: 4 }}><span>Shot:</span> <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{job.shot_id.split('-')[0]}</span></div>}
                                                {job.actor_id && <div style={{ display: 'flex', gap: 4 }}><span>Actor:</span> <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{job.actor_id.split('-')[0]}</span></div>}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                                <div>Provider: <strong style={{ color: 'var(--color-text-secondary)' }}>{job.provider || 'auto'}</strong></div>
                                                <div>Created: {new Date(job.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>

                                            {job.error_log && (
                                                <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, color: '#b91c1c', fontFamily: 'monospace' }}>
                                                    <strong>Error:</strong> {job.error_log}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: st.bg, color: st.c }}>{st.label}</span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <select value={job.status} onChange={e => updateStatus(job.id, e.target.value)}
                                                    style={{ fontSize: 10, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', cursor: 'pointer' }}>
                                                    {['pending', 'processing', 'completed', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <button onClick={() => deleteJob(job.id)} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', opacity: 0.6 }}>🗑</button>
                                            </div>
                                        </div>
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
