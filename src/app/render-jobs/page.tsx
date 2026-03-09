'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

import { renderJobService } from '@/lib/services';
import type { RenderJobRead as RenderJob } from '@/lib/services';

function statusStyle(s: string) {
    switch (s) {
        case 'completed': return { color: '#22c55e', label: '✓' };
        case 'processing': return { color: '#fbbf24', label: '◐' };
        case 'failed': return { color: '#ef4444', label: '✗' };
        default: return { color: '#64748b', label: '○' };
    }
}

function getJobTypeMeta(type: string) {
    switch (type) {
        case 'render_video': return { label: 'VIDEO', color: '#3b82f6' };
        case 'render_image': return { label: 'IMAGE', color: '#8b5cf6' };
        case 'train_lora': return { label: 'LORA', color: '#ec4899' };
        case 'generate_visual_dna': return { label: 'DNA', color: '#14b8a6' };
        default: return { label: 'JOB', color: '#64748b' };
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
            const sorted = (data as RenderJob[]).sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setJobs(sorted.slice(0, 30));
        } catch (e: unknown) {
            setError((e as { detail?: string; message?: string }).detail || (e as Error).message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { load(); }, [load, tenantId]);

    // Supabase realtime subscription with error handling
    useEffect(() => {
        if (!tenantId) return;

        try {
            const channel = supabase
                .channel('render_jobs_realtime')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'render_jobs' 
                }, (payload) => {
                    console.log('Realtime update received:', payload);
                    load();
                })
                .subscribe((status, err) => {
                    if (err) {
                        console.error('Realtime subscription error:', err);
                    }
                    console.log('Realtime status:', status);
                });

            return () => {
                supabase.removeChannel(channel);
            };
        } catch (err) {
            console.error('Failed to setup realtime:', err);
        }
    }, [tenantId, load]);

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Render Jobs" />
                <div className="page-container" style={{ maxWidth: 1200, margin: '0 auto', paddingTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, fontFamily: 'monospace' }}>⚡ RENDER_JOBS_LOG</h2>
                            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '4px 0 0', fontFamily: 'monospace' }}>latest 30 entries</p>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); load(); }}>↻ reload</button>
                    </div>

                    <div style={{ 
                        fontFamily: 'monospace', 
                        fontSize: 11, 
                        background: '#0f172a', 
                        borderRadius: 8, 
                        padding: '8px 0',
                        border: '1px solid #1e293b'
                    }}>
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '24px 50px 60px 130px 120px 1fr 70px 60px',
                            gap: 6, 
                            padding: '6px 16px',
                            color: '#64748b',
                            fontWeight: 600,
                            borderBottom: '1px solid #1e293b',
                            fontSize: 10
                        }}>
                            <span>STAT</span>
                            <span>TYPE</span>
                            <span>JOB</span>
                            <span>TENANT</span>
                            <span>TARGET</span>
                            <span>LOG</span>
                            <span>CREATED</span>
                            <span>STATUS</span>
                        </div>

                        {loading ? (
                            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>Loading...</div>
                        ) : error ? (
                            <div style={{ padding: 20, color: '#ef4444', textAlign: 'center' }}>⚠ {error}</div>
                        ) : jobs.length === 0 ? (
                            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No jobs found</div>
                        ) : (
                            jobs.map((job, idx) => {
                                const st = statusStyle(job.status);
                                const jType = getJobTypeMeta(job.job_type);
                                const targetName = job.projects?.name || (job.actor_id ? `Actor:${job.actor_id.split('-')[0]}` : '-');
                                
                                return (
                                    <div key={job.id} style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: '24px 50px 60px 130px 120px 1fr 70px 60px',
                                        gap: 6, 
                                        padding: '6px 16px',
                                        alignItems: 'center',
                                        borderBottom: idx < jobs.length - 1 ? '1px solid #1e293b' : 'none',
                                        background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.5)' : 'transparent'
                                    }}>
                                        <span style={{ color: st.color, fontSize: 11 }}>{st.label}</span>
                                        <span style={{ color: jType.color, fontWeight: 600, fontSize: 10 }}>{jType.label}</span>
                                        <span style={{ color: '#94a3b8', fontSize: 9 }}>{job.id.split('-')[0]}</span>
                                        <span style={{ color: '#a78bfa', fontSize: 10, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.tenant_name}>
                                            {job.tenant_name || '-'}
                                        </span>
                                        <span style={{ color: '#e2e8f0', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={targetName}>{targetName}</span>
                                        <span style={{ color: job.error_log ? '#fbbf24' : '#64748b', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.error_log || '-'}>
                                            {job.error_log || '-'}
                                        </span>
                                        <span style={{ color: '#64748b', fontSize: 9 }}>{new Date(job.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span style={{ color: st.color, fontWeight: 600, fontSize: 9 }}>{job.status.toUpperCase()}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
