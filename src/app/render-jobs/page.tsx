'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { renderJobService } from '@/lib/services';
import type { RenderJobRead as RenderJob } from '@/lib/services';

function statusStyle(s: string) {
    switch (s) {
        case 'completed': return { bg: '#dcfce7', c: '#15803d', label: '✅ Completed' };
        case 'processing': return { bg: '#fef9c3', c: '#a16207', label: '⏳ Processing' };
        case 'failed': return { bg: '#fee2e2', c: '#b91c1c', label: '❌ Failed' };
        default: return { bg: '#f1f5f9', c: '#64748b', label: '🕐 Pending' };
    }
}

export default function RenderJobsPage() {
    const [jobs, setJobs] = useState<RenderJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await renderJobService.list();
            setJobs(data as RenderJob[]);
        } catch (e: any) {
            setError(e.detail || e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateStatus = async (id: string, status: string) => {
        try {
            await renderJobService.updateStatus(id, status);
            load();
        } catch (e: any) { console.error(e); }
    };

    const deleteJob = async (id: string) => {
        if (!confirm('Delete this render job?')) return;
        try {
            await renderJobService.delete(id);
            load();
        } catch (e: any) { console.error(e); }
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
                            <div style={{ fontSize: 12, marginTop: 4 }}>Go to a project → select a shot → click "Render" to start</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {jobs.map(job => {
                                const st = statusStyle(job.status);
                                return (
                                    <div key={job.id} className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 10, background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                                            {job.status === 'completed' ? '✅' : job.status === 'processing' ? '⏳' : job.status === 'failed' ? '❌' : '🕐'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Job: {job.id.slice(0, 8)}…</div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                                                Shot: {job.shot_id.slice(0, 8)}… · Provider: {job.provider} · {new Date(job.created_at).toLocaleString('th-TH')}
                                            </div>
                                            {job.error_log && <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>Error: {job.error_log}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.c }}>{st.label}</span>
                                            <select value={job.status} onChange={e => updateStatus(job.id, e.target.value)}
                                                style={{ fontSize: 10, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', cursor: 'pointer' }}>
                                                {['pending', 'processing', 'completed', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <button onClick={() => deleteJob(job.id)} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', opacity: 0.6 }}>🗑</button>
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
