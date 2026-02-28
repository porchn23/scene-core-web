'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Modal from '@/components/Modal';
import { projectService, tenantService } from '@/lib/services';
import type { ProjectRead, ProjectCreate, ProjectUpdate, TenantRead } from '@/lib/services';

// ===================== CONSTANTS =====================
const ASPECT_OPTIONS = ['16:9', '9:16', '4:3', '1:1', '2.39:1'];
const RESOLUTION_OPTIONS = ['720p', '1080p', '4K'];
const PROJECT_TYPE_OPTIONS = ['short_film', 'commercial', 'music_video', 'series_episode', 'other'];
const GENRE_OPTIONS = ['action', 'comedy', 'drama', 'horror', 'romance', 'sci-fi', 'fantasy', 'thriller', 'documentary', 'animation'];

function getEmoji(name: string): string {
    const map: Record<string, string> = {
        kingdom: '🏰', noir: '🌆', blossom: '🌸', sea: '🐋', escape: '🚂', neon: '⚡',
        future: '🤖', love: '❤️', war: '⚔️', space: '🚀', forest: '🌲', city: '🏙️',
    };
    const lower = name.toLowerCase();
    for (const [key, emoji] of Object.entries(map)) {
        if (lower.includes(key)) return emoji;
    }
    return '🎬';
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// ===================== STATUS BADGE =====================
function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { cls: string; label: string }> = {
        active: { cls: 'badge-success', label: 'Active' },
        processing: { cls: 'badge-warning', label: 'Processing' },
        completed: { cls: 'badge-neutral', label: 'Completed' },
        draft: { cls: 'badge-neutral', label: 'Draft' },
        archived: { cls: 'badge-neutral', label: 'Archived' },
    };
    const { cls, label } = map[status] ?? { cls: 'badge-neutral', label: status };
    return <span className={`badge ${cls}`}><span className="badge-dot" />{label}</span>;
}

// ===================== ERROR BANNER =====================
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div style={{
            background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-md)', padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 20,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)', fontWeight: 500 }}>{message}</span>
            </div>
            <button className="btn btn-sm" style={{ background: 'var(--color-danger)', color: 'white' }} onClick={onRetry}>
                Retry
            </button>
        </div>
    );
}

// ===================== PROJECT FORM =====================
function ProjectForm({
    initial, mode, tenants, loading, error,
    onSubmit, onClose,
}: {
    initial?: Partial<ProjectRead>;
    mode: 'create' | 'edit';
    tenants: TenantRead[];
    loading: boolean;
    error: string;
    onSubmit: (data: ProjectCreate | ProjectUpdate) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? '');
    const [logline, setLogline] = useState(initial?.logline ?? '');
    const [projectType, setProjectType] = useState(initial?.project_type ?? 'short_film');
    const [genre, setGenre] = useState(initial?.genre ?? '');
    const [aspectRatio, setAspectRatio] = useState(initial?.aspect_ratio ?? '16:9');
    const [resolution, setResolution] = useState(initial?.resolution ?? '1080p');
    const [tenantId, setTenantId] = useState(initial?.tenant_id ?? tenants[0]?.id ?? '');
    const [status, setStatus] = useState(initial?.status ?? 'draft');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (mode === 'create') {
            const payload: ProjectCreate = {
                name: name.trim(),
                logline: logline.trim() || undefined,
                project_type: projectType,
                genre: genre || undefined,
                aspect_ratio: aspectRatio,
                resolution,
                tenant_id: tenantId,
            };
            onSubmit(payload);
        } else {
            const payload: ProjectUpdate = {
                name: name.trim(),
                logline: logline.trim() || undefined,
                project_type: projectType,
                genre: genre || undefined,
                aspect_ratio: aspectRatio,
                resolution,
                status,
            };
            onSubmit(payload);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '65vh', overflowY: 'auto' }}>

                {/* Name */}
                <div className="form-field">
                    <label className="form-label">Project Name <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                    <input className="form-input" type="text" placeholder="e.g. The Lost Kingdom" value={name}
                        onChange={e => setName(e.target.value)} autoFocus />
                </div>

                {/* Logline */}
                <div className="form-field">
                    <label className="form-label">Logline <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                    <textarea className="form-input" placeholder="One-sentence summary of your film…" value={logline}
                        onChange={e => setLogline(e.target.value)} rows={2} style={{ resize: 'none' }} />
                </div>

                {/* Type + Genre */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-field">
                        <label className="form-label">Project Type</label>
                        <select className="form-select" value={projectType} onChange={e => setProjectType(e.target.value)}>
                            {PROJECT_TYPE_OPTIONS.map(t => (
                                <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-field">
                        <label className="form-label">Genre <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                        <select className="form-select" value={genre} onChange={e => setGenre(e.target.value)}>
                            <option value="">— None —</option>
                            {GENRE_OPTIONS.map(g => (
                                <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Aspect Ratio */}
                <div className="form-field">
                    <label className="form-label">Aspect Ratio</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ASPECT_OPTIONS.map(ar => (
                            <button key={ar} type="button" onClick={() => setAspectRatio(ar)}
                                className={`aspect-btn ${aspectRatio === ar ? 'active' : ''}`}>
                                <span className="aspect-preview" style={{ aspectRatio: ar.replace(':', '/') }} />
                                <span>{ar}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resolution */}
                <div className="form-field">
                    <label className="form-label">Resolution</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {RESOLUTION_OPTIONS.map(r => (
                            <button key={r} type="button" onClick={() => setResolution(r)}
                                style={{
                                    flex: 1, padding: '7px 0', borderRadius: 'var(--radius-sm)',
                                    border: `1.5px solid ${resolution === r ? 'var(--color-accent)' : 'var(--color-border)'}`,
                                    background: resolution === r ? 'var(--color-accent-light)' : 'var(--color-surface-2)',
                                    color: resolution === r ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                }}>
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Studio (create only) */}
                {mode === 'create' && (
                    <div className="form-field">
                        <label className="form-label">Studio (Tenant) <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                        {tenants.length > 0 ? (
                            <select className="form-select" value={tenantId} onChange={e => setTenantId(e.target.value)}>
                                {tenants.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} — {t.credit_balance.toLocaleString()} credits</option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ padding: '9px 12px', background: 'var(--color-danger-light)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
                                No studios found. Please create a tenant first.
                            </div>
                        )}
                    </div>
                )}

                {/* Status (edit only) */}
                {mode === 'edit' && (
                    <div className="form-field">
                        <label className="form-label">Status</label>
                        <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                            {['draft', 'active', 'processing', 'completed', 'archived'].map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* API Error */}
                {error && (
                    <div style={{
                        background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)',
                        borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                        fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)',
                    }}>
                        {error}
                    </div>
                )}
            </div>

            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading || (mode === 'create' && tenants.length === 0)}>
                    {loading ? (mode === 'create' ? 'Creating…' : 'Saving…') : (mode === 'create' ? 'Create Project' : 'Save Changes')}
                </button>
            </div>
        </form>
    );
}

// ===================== CONFIRM DELETE =====================
function ConfirmDelete({ open, project, loading, onClose, onConfirm }: {
    open: boolean; project: ProjectRead | null; loading: boolean;
    onClose: () => void; onConfirm: () => void;
}) {
    return (
        <Modal open={open} onClose={onClose} title="Delete Project" width={400}>
            <div style={{ padding: '20px 24px' }}>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    Are you sure you want to permanently delete <strong>&ldquo;{project?.name}&rdquo;</strong>?
                    This will remove all associated scenes, shots, and dialogues.
                </p>
            </div>
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                <button className="btn" style={{ background: 'var(--color-danger)', color: 'white' }}
                    onClick={onConfirm} disabled={loading}>
                    {loading ? 'Deleting…' : 'Delete Project'}
                </button>
            </div>
        </Modal>
    );
}

// ===================== MAIN PAGE =====================
export default function ProjectsPage() {
    const [projects, setProjects] = useState<ProjectRead[]>([]);
    const [tenants, setTenants] = useState<TenantRead[]>([]);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState('');

    const [filterStatus, setFilterStatus] = useState('all');
    const [filterAspect, setFilterAspect] = useState('all');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Modals
    const [createOpen, setCreateOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<ProjectRead | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ProjectRead | null>(null);

    const [mutating, setMutating] = useState(false);
    const [mutateError, setMutateError] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const notify = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // ---- Load data ----
    const reload = useCallback(async () => {
        setLoading(true);
        setApiError('');
        try {
            const [ps, ts] = await Promise.all([
                projectService.list(),
                tenantService.list(),
            ]);
            setProjects(ps);
            setTenants(ts);
        } catch (err: unknown) {
            const e = err as { detail?: string };
            setApiError(e?.detail ?? 'Failed to connect to API. Is the backend running?');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    // ---- Create ----
    const handleCreate = async (payload: ProjectCreate | ProjectUpdate) => {
        setMutating(true);
        setMutateError('');
        try {
            const created = await projectService.create(payload as ProjectCreate);
            setProjects(prev => [created, ...prev]);
            setCreateOpen(false);
            notify('Project created successfully!');
        } catch (err: unknown) {
            const e = err as { detail?: string };
            setMutateError(e?.detail ?? 'Failed to create project.');
        } finally {
            setMutating(false);
        }
    };

    // ---- Edit ----
    const handleEdit = async (payload: ProjectCreate | ProjectUpdate) => {
        if (!editTarget) return;
        setMutating(true);
        setMutateError('');
        try {
            const updated = await projectService.update(editTarget.id, payload as ProjectUpdate);
            setProjects(prev => prev.map(p => p.id === editTarget.id ? updated : p));
            setEditTarget(null);
            notify('Project updated!');
        } catch (err: unknown) {
            const e = err as { detail?: string };
            setMutateError(e?.detail ?? 'Failed to update project.');
        } finally {
            setMutating(false);
        }
    };

    // ---- Delete ----
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setMutating(true);
        try {
            await projectService.delete(deleteTarget.id);
            setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
            setDeleteTarget(null);
            notify('Project deleted.');
        } catch (err: unknown) {
            const e = err as { detail?: string };
            notify(e?.detail ?? 'Failed to delete project.', 'error');
        } finally {
            setMutating(false);
        }
    };

    // ---- Filter ----
    const filtered = projects.filter(p => {
        if (filterStatus !== 'all' && p.status !== filterStatus) return false;
        if (filterAspect !== 'all' && p.aspect_ratio !== filterAspect) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const counts: Record<string, number> = { all: projects.length };
    projects.forEach(p => { counts[p.status] = (counts[p.status] ?? 0) + 1; });

    // ---- Render ----
    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Projects" />
                <div className="page-container">

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div>
                            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
                                All Projects
                            </h2>
                            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                {loading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''} across ${tenants.length} studio${tenants.length !== 1 ? 's' : ''}`}
                            </p>
                        </div>
                        <button className="btn btn-primary" onClick={() => { setMutateError(''); setCreateOpen(true); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            New Project
                        </button>
                    </div>

                    {/* API Error */}
                    {apiError && <ErrorBanner message={apiError} onRetry={reload} />}

                    {/* Toolbar */}
                    <div style={{
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 20,
                        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    }}>
                        {/* Status tabs */}
                        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
                            {['all', 'active', 'processing', 'draft', 'completed', 'archived'].map(s => (
                                <button key={s} onClick={() => setFilterStatus(s)} style={{
                                    padding: '5px 12px', borderRadius: 'var(--radius-full)',
                                    fontSize: 'var(--font-size-xs)', fontWeight: 500, cursor: 'pointer', border: 'none',
                                    transition: 'all var(--transition-fast)',
                                    background: filterStatus === s ? 'var(--color-accent)' : 'transparent',
                                    color: filterStatus === s ? 'white' : 'var(--color-text-secondary)',
                                }}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                    <span style={{ marginLeft: 5, opacity: 0.75, fontSize: 11 }}>{counts[s] ?? 0}</span>
                                </button>
                            ))}
                        </div>

                        {/* Aspect filter */}
                        <select className="form-select" style={{ width: 130 }} value={filterAspect} onChange={e => setFilterAspect(e.target.value)}>
                            <option value="all">All Ratios</option>
                            {ASPECT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>

                        {/* Search */}
                        <div className="topbar-search" style={{ width: 200 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" />
                        </div>

                        {/* Refresh */}
                        <button className="icon-btn" onClick={reload} title="Refresh" style={{ flexShrink: 0 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                            </svg>
                        </button>

                        {/* View toggle */}
                        <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                            {(['grid', 'list'] as const).map(v => (
                                <button key={v} onClick={() => setViewMode(v)} style={{
                                    width: 32, height: 30, background: viewMode === v ? 'var(--color-surface-3)' : 'transparent',
                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: viewMode === v ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                                    transition: 'all var(--transition-fast)',
                                }}>
                                    {v === 'grid' ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                                            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                                        </svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Loading skeletons */}
                    {loading && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                                    <div className="skeleton" style={{ height: 110 }} />
                                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div className="skeleton" style={{ height: 16, width: '70%' }} />
                                        <div className="skeleton" style={{ height: 12, width: '50%' }} />
                                        <div className="skeleton" style={{ height: 30, marginTop: 4 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && !apiError && filtered.length === 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', color: 'var(--color-text-tertiary)' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
                            <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                                {search || filterStatus !== 'all' ? 'No projects match your filters' : 'No projects yet'}
                            </div>
                            <div style={{ fontSize: 'var(--font-size-sm)', marginBottom: 20 }}>
                                {search || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first project to get started'}
                            </div>
                            {!search && filterStatus === 'all' && (
                                <button className="btn btn-primary" onClick={() => { setMutateError(''); setCreateOpen(true); }}>
                                    Create First Project
                                </button>
                            )}
                        </div>
                    )}

                    {/* Grid View */}
                    {!loading && filtered.length > 0 && viewMode === 'grid' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                            {filtered.map(project => {
                                const tenant = tenants.find(t => t.id === project.tenant_id);
                                return (
                                    <div key={project.id} style={{
                                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                                        boxShadow: 'var(--shadow-sm)', transition: 'all var(--transition-base)',
                                    }}
                                        onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = ''; }}
                                    >
                                        {/* Thumbnail */}
                                        <Link href={`/projects/${project.id}`}>
                                            <div style={{
                                                height: 110, background: 'linear-gradient(135deg, var(--color-surface-2) 0%, var(--color-surface-3) 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, position: 'relative',
                                            }}>
                                                {getEmoji(project.name)}
                                                <div style={{
                                                    position: 'absolute', bottom: 8, right: 8,
                                                    background: 'rgba(0,0,0,0.5)', color: 'white',
                                                    fontSize: 10, fontWeight: 700, padding: '2px 7px',
                                                    borderRadius: 'var(--radius-full)', letterSpacing: '0.04em',
                                                }}>
                                                    {project.aspect_ratio}
                                                </div>
                                                {project.genre && (
                                                    <div style={{
                                                        position: 'absolute', top: 8, left: 8,
                                                        background: 'rgba(0,0,0,0.45)', color: 'white',
                                                        fontSize: 10, fontWeight: 600, padding: '2px 7px',
                                                        borderRadius: 'var(--radius-full)', textTransform: 'capitalize',
                                                    }}>
                                                        {project.genre}
                                                    </div>
                                                )}
                                            </div>
                                        </Link>

                                        {/* Info */}
                                        <div style={{ padding: '14px 16px 12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                                <Link href={`/projects/${project.id}`} style={{
                                                    fontSize: 'var(--font-size-base)', fontWeight: 600,
                                                    color: 'var(--color-text-primary)', letterSpacing: '-0.01em', flex: 1,
                                                }}>
                                                    {project.name}
                                                </Link>
                                                <StatusBadge status={project.status} />
                                            </div>

                                            {project.logline && (
                                                <p style={{
                                                    fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)',
                                                    fontStyle: 'italic', marginBottom: 8, lineHeight: 1.4,
                                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                                }}>
                                                    {project.logline}
                                                </p>
                                            )}

                                            <div style={{ display: 'flex', gap: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                                                {tenant && <span>🏢 {tenant.name}</span>}
                                                <span>·</span>
                                                <span>{project.resolution}</span>
                                                <span>·</span>
                                                <span>{timeAgo(project.updated_at)}</span>
                                            </div>

                                            {/* Actions */}
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <Link href={`/projects/${project.id}`} className="btn btn-secondary btn-sm"
                                                    style={{ flex: 1, justifyContent: 'center' }}>
                                                    Open
                                                </Link>
                                                <button className="btn btn-ghost btn-sm" onClick={() => { setMutateError(''); setEditTarget(project); }}
                                                    style={{ padding: '5px 8px' }} title="Edit">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                                                    </svg>
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(project)}
                                                    style={{ padding: '5px 8px', color: 'var(--color-danger)' }} title="Delete">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                                                        <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* List View */}
                    {!loading && filtered.length > 0 && viewMode === 'list' && (
                        <div className="card">
                            {filtered.map((project, idx) => {
                                const tenant = tenants.find(t => t.id === project.tenant_id);
                                return (
                                    <div key={project.id} style={{
                                        display: 'grid', gridTemplateColumns: '42px 1fr 100px 80px 110px 120px',
                                        alignItems: 'center', gap: 14, padding: '13px 20px',
                                        borderBottom: idx < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                                        transition: 'background var(--transition-fast)',
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                                    >
                                        <div style={{
                                            width: 42, height: 42, borderRadius: 'var(--radius-sm)',
                                            background: 'var(--color-surface-2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                                        }}>
                                            {getEmoji(project.name)}
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <Link href={`/projects/${project.id}`} style={{
                                                fontSize: 'var(--font-size-sm)', fontWeight: 600,
                                                color: 'var(--color-text-primary)', display: 'block',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {project.name}
                                            </Link>
                                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                                                {tenant?.name ?? project.tenant_id.slice(0, 8)} · Updated {formatDate(project.updated_at)}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                            {project.aspect_ratio}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                                            {project.resolution}
                                        </span>
                                        <StatusBadge status={project.status} />
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                            <Link href={`/projects/${project.id}`} className="btn btn-secondary btn-sm">Open</Link>
                                            <button className="btn btn-ghost btn-sm" onClick={() => { setMutateError(''); setEditTarget(project); }} style={{ padding: '5px 8px' }}>
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                                                </svg>
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(project)}
                                                style={{ padding: '5px 8px', color: 'var(--color-danger)' }}>
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                                                    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </div>
            </div>

            {/* Create Modal */}
            <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Project" subtitle="Set up a new film production" width={520}>
                <ProjectForm mode="create" tenants={tenants} loading={mutating} error={mutateError}
                    onSubmit={handleCreate} onClose={() => setCreateOpen(false)} />
            </Modal>

            {/* Edit Modal */}
            <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Project" subtitle={editTarget?.name} width={520}>
                {editTarget && (
                    <ProjectForm mode="edit" initial={editTarget} tenants={tenants} loading={mutating} error={mutateError}
                        onSubmit={handleEdit} onClose={() => setEditTarget(null)} />
                )}
            </Modal>

            {/* Delete Confirm */}
            <ConfirmDelete open={!!deleteTarget} project={deleteTarget} loading={mutating}
                onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
                    background: toast.type === 'success' ? 'var(--color-text-primary)' : 'var(--color-danger)',
                    color: 'white', padding: '12px 18px', borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-size-sm)', fontWeight: 500, boxShadow: 'var(--shadow-lg)',
                    animation: 'slideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    {toast.type === 'success' ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    )}
                    {toast.msg}
                </div>
            )}

            <style>{`
        .form-field { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
        .form-input {
          background: var(--color-surface-2); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); padding: 9px 12px;
          font-size: var(--font-size-sm); color: var(--color-text-primary);
          outline: none; transition: all var(--transition-fast); font-family: inherit; width: 100%;
        }
        .form-input:focus { border-color: var(--color-accent); box-shadow: var(--shadow-focus); background: var(--color-surface); }
        .form-select {
          background: var(--color-surface-2); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); padding: 8px 12px;
          font-size: var(--font-size-sm); color: var(--color-text-primary);
          outline: none; cursor: pointer; font-family: inherit; width: 100%;
          transition: border-color var(--transition-fast);
        }
        .form-select:focus { border-color: var(--color-accent); }
        .aspect-grid { display: flex; gap: 8px; flex-wrap: wrap; }
        .aspect-btn {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 8px 10px; border-radius: var(--radius-sm);
          border: 1.5px solid var(--color-border); background: var(--color-surface-2);
          cursor: pointer; font-size: 11px; font-weight: 500; color: var(--color-text-secondary);
          transition: all var(--transition-fast); min-width: 58px;
        }
        .aspect-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
        .aspect-btn.active { border-color: var(--color-accent); background: var(--color-accent-light); color: var(--color-accent); }
        .aspect-preview {
          display: block; width: 28px; max-height: 22px;
          border: 1.5px solid currentColor; border-radius: 2px;
        }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
        </div>
    );
}
