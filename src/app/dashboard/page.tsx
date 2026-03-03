'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface Project { id: string; name: string; aspect_ratio: string; project_type?: string; status?: string; created_at: string; updated_at: string; }
interface RenderJob { id: string; shot_id: string; status: string; created_at: string; }
interface Tenant { id: string; name: string; plan: string; credit_balance: number; }
interface Actor { id: string; name: string; face_image_url: string; gender: string; age_range: string; updated_at: string; level: number; }

function statusBadge(status: string) {
  switch (status) {
    case 'active': return <span className="badge badge-success"><span className="badge-dot" />Active</span>;
    case 'processing': return <span className="badge badge-warning"><span className="badge-dot" />Processing</span>;
    case 'completed': return <span className="badge badge-neutral"><span className="badge-dot" />Completed</span>;
    case 'draft': return <span className="badge badge-neutral"><span className="badge-dot" />Draft</span>;
    case 'pending': return <span className="badge badge-neutral"><span className="badge-dot" />Pending</span>;
    case 'failed': return <span className="badge badge-warning"><span className="badge-dot" />Failed</span>;
    default: return null;
  }
}

export default function DashboardPage() {
  const { user, tenantId, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [totalProjects, setTotalProjects] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeJobIdx, setActiveJobIdx] = useState(0);

  const load = useCallback(async (tId: string) => {
    setLoading(true);
    try {
      const [pRes, tRes, aRes, countRes] = await Promise.all([
        supabase.from('projects').select('*').eq('tenant_id', tId).order('updated_at', { ascending: false }).limit(5),
        supabase.from('tenants').select('*').eq('id', tId).maybeSingle(),
        supabase.from('actors').select('*').eq('tenant_id', tId).order('updated_at', { ascending: false }).limit(5),
        supabase.from('projects').select('*', { count: 'exact', head: true }).eq('tenant_id', tId),
      ]);

      const { data: allJobs } = await supabase.from('render_jobs').select('*, projects!inner(*)').eq('projects.tenant_id', tId).order('created_at', { ascending: false }).limit(10);

      if (pRes.data) setProjects(pRes.data as Project[]);
      if (allJobs) setJobs(allJobs as any[]);
      if (tRes.data) setTenant(tRes.data as Tenant);
      if (aRes.data) setActors(aRes.data as Actor[]);
      if (countRes.count !== null) setTotalProjects(countRes.count);
    } catch (error) {
      console.error('Loader error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenantId) {
      load(tenantId);
    }
  }, [tenantId, load]);

  useEffect(() => {
    if (jobs.length > 1) {
      const timer = setInterval(() => {
        setActiveJobIdx(p => (p + 1) % Math.min(jobs.length, 5));
      }, 5000); // Rotate every 5 seconds
      return () => clearInterval(timer);
    }
  }, [jobs]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const pendingJobs = jobs.filter((j: RenderJob) => j.status === 'processing' || j.status === 'pending').length;
  const completedJobs = jobs.filter((j: RenderJob) => j.status === 'completed').length;

  const isDataLoading = authLoading || (tenantId && loading);
  const isProfileMissing = user && !tenantId && !authLoading;

  const stats = [
    { label: 'Total Projects', value: String(totalProjects), iconColor: 'var(--color-accent)', iconBg: 'var(--color-accent-light)', emoji: '📂' },
    { label: 'Render Jobs', value: String(jobs.length), iconColor: 'var(--color-warning)', iconBg: 'var(--color-warning-light)', emoji: '⚙️' },
    { label: 'In Progress', value: String(pendingJobs), iconColor: 'var(--color-success)', iconBg: 'var(--color-success-light)', emoji: '⏳' },
    { label: 'Credits', value: tenant?.credit_balance?.toLocaleString() ?? '—', iconColor: 'var(--color-purple)', iconBg: 'var(--color-purple-light)', emoji: '💰' },
  ];

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar title="Dashboard" />
        <div className="page-container">

          {isProfileMissing && (
            <div className="card" style={{ background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)', marginBottom: 20 }}>
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 32 }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-warning)' }}>Profile Synchronization Delayed</div>
                  <p style={{ fontSize: 13, margin: '4px 0 0' }}>We couldn't connect your account to a studio tenant yet. Please refresh or click the button below.</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Retry Sync</button>
              </div>
            </div>
          )}

          {/* Welcome Banner */}
          <div className="welcome-banner">
            <div>
              <div className="welcome-title">{greeting}, {user?.user_metadata.full_name?.split(' ')[0] || 'Director'} 🎬</div>
              <div className="welcome-subtitle">
                {isDataLoading ? 'Loading…' : `You have ${pendingJobs} render job${pendingJobs !== 1 ? 's' : ''} in progress and ${totalProjects} project${totalProjects !== 1 ? 's' : ''}.`}
              </div>
            </div>
            <Link href="/render-jobs" className="welcome-cta">View Render Queue →</Link>
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="stat-card" key={stat.label}>
                <div className="stat-card-header">
                  <div className="stat-card-icon" style={{ background: stat.iconBg, color: stat.iconColor, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {stat.emoji}
                  </div>
                </div>
                <div className="stat-card-value">{isDataLoading ? '…' : stat.value}</div>
                <div className="stat-card-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Render Status Bar (Latest Only with Cycling) */}
          {!isDataLoading && jobs.length > 0 && jobs[activeJobIdx] && (
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 20,
              padding: '14px 28px',
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
              overflow: 'hidden'
            }}>
              <div key={jobs[activeJobIdx].id} className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className={jobs[activeJobIdx].status === 'processing' || jobs[activeJobIdx].status === 'pending' ? 'animate-pulse' : ''} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: (jobs[activeJobIdx].status === 'processing' || jobs[activeJobIdx].status === 'pending') ? 'var(--color-warning)' : jobs[activeJobIdx].status === 'completed' ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  boxShadow: (jobs[activeJobIdx].status === 'processing' || jobs[activeJobIdx].status === 'pending') ? '0 0 0 6px var(--color-warning-light)' : 'none',
                }} />
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Live Job Status:</strong>
                  <span style={{ marginLeft: 8 }}>Render #{jobs[activeJobIdx].id.slice(0, 8)}… is {jobs[activeJobIdx].status.toUpperCase()}</span>
                  <span style={{ opacity: 0.5, marginLeft: 12 }}>({new Date(jobs[activeJobIdx].created_at).toLocaleTimeString('th-TH')})</span>
                </div>
              </div>
              <Link href="/render-jobs" style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-accent)', textDecoration: 'none', background: 'var(--color-accent-light)', padding: '6px 14px', borderRadius: 30 }}>
                QUEUE DETAILS →
              </Link>
            </div>
          )}

          {/* Main Row: Projects & Studio Account */}
          <div className="dashboard-grid-wide">
            {/* Recent Projects */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Recent Projects</div>
                  <div className="card-subtitle">From your production database</div>
                </div>
                <Link href="/projects" className="btn btn-ghost btn-sm">View all →</Link>
              </div>
              <div className="project-list">
                {isDataLoading ? (
                  <div style={{ padding: 20 }}><div className="skeleton" style={{ height: 40, borderRadius: 6, marginBottom: 8 }} /><div className="skeleton" style={{ height: 40, borderRadius: 6 }} /></div>
                ) : projects.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No projects yet</div>
                ) : projects.slice(0, 5).map((p: Project) => (
                  <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="project-row">
                      <div className="project-row-name">
                        <div className="project-thumb" style={{ background: 'var(--color-surface-2)' }}>🎬</div>
                        <div>
                          <div className="project-title">{p.name}</div>
                          <div className="project-meta">{p.aspect_ratio} · {p.project_type?.replace('_', ' ') || '—'}</div>
                        </div>
                      </div>
                      {statusBadge(p.status || 'draft')}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Credit & Tenant */}
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Studio Account</div>
                  <div className="card-subtitle">{tenant?.name ?? 'Loading…'}</div>
                </div>
              </div>
              <div className="credit-display">
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div className="credit-amount">{isDataLoading ? '…' : tenant?.credit_balance?.toLocaleString() ?? '0'}</div>
                  <div className="credit-unit">credits</div>
                </div>
                <Link href="/billing" className="btn btn-secondary btn-sm">Top Up</Link>
              </div>
              <div className="credit-mini-stats">
                <div className="credit-stat">
                  <div className="credit-stat-value">{completedJobs}</div>
                  <div className="credit-stat-label">Jobs completed</div>
                </div>
                <div className="credit-stat">
                  <div className="credit-stat-value">{pendingJobs}</div>
                  <div className="credit-stat-label">In progress</div>
                </div>
                <div className="credit-stat">
                  <div className="credit-stat-value">{tenant?.plan?.toUpperCase() ?? '—'}</div>
                  <div className="credit-stat-label">Plan</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions & Studio Actors */}
          <div className="dashboard-grid">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Quick Actions</div>
              </div>
              <div className="quick-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {([
                  { label: 'New Project', sub: 'Start from scratch', color: 'var(--color-accent)', bg: 'var(--color-accent-light)', emoji: '📂', href: '/projects' },
                  { label: 'Add Actor', sub: 'Register to marketplace', color: 'var(--color-purple)', bg: 'var(--color-purple-light)', emoji: '🎭', href: '/actors' },
                  { label: 'View Characters', sub: 'Manage cast', color: 'var(--color-success)', bg: 'var(--color-success-light)', emoji: '👤', href: '/characters' },
                  { label: 'Top-Up Credits', sub: 'Add balance', color: 'var(--color-warning)', bg: 'var(--color-warning-light)', emoji: '💳', href: '/billing' },
                ]).map(action => (
                  <Link key={action.label} href={action.href} style={{ textDecoration: 'none' }}>
                    <button className="quick-action-btn" style={{ width: '100%', textAlign: 'left' }}>
                      <div className="quick-action-icon" style={{ background: action.bg, color: action.color, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {action.emoji}
                      </div>
                      <div>
                        <div className="quick-action-text">{action.label}</div>
                        <div className="quick-action-sub">{action.sub}</div>
                      </div>
                    </button>
                  </Link>
                ))}
              </div>
            </div>

            {/* Studio Actors */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header">
                <div>
                  <div className="card-title">Studio Cast & Actors</div>
                  <div className="card-subtitle">AI Actors available for your productions</div>
                </div>
                <Link href="/actors" className="btn btn-ghost btn-sm">Manage Cast →</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-6)' }}>
                {isDataLoading ? (
                  Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 8 }} />)
                ) : actors.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12, gridColumn: '1 / -1' }}>No actors registered yet</div>
                ) : actors.map((a: Actor) => (
                  <Link key={a.id} href="/actors" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', transition: 'all var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface-2)'}>
                      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: '#ddd', overflow: 'hidden', flexShrink: 0 }}>
                        <img src={a.face_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{a.gender} {a.age_range ? `· ${a.age_range}` : ''}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
