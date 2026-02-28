'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { supabase } from '@/lib/supabase';

const TENANT_ID = '7a39f072-bb89-4777-8f9f-a938196f35a7';

interface Project { id: string; name: string; aspect_ratio: string; project_type?: string; status?: string; created_at: string; updated_at: string; }
interface RenderJob { id: string; shot_id: string; status: string; created_at: string; }
interface Tenant { id: string; name: string; plan: string; credit_balance: number; }

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, jRes, tRes] = await Promise.all([
        supabase.from('projects').select('*').order('updated_at', { ascending: false }),
        supabase.from('render_jobs').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('tenants').select('*').eq('id', TENANT_ID).maybeSingle(),
      ]);

      if (pRes.data) setProjects(pRes.data as Project[]);
      if (jRes.data) setJobs(jRes.data as RenderJob[]);
      if (tRes.data) setTenant(tRes.data as Tenant);
    } catch (error) {
      console.error('Loader error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const pendingJobs = jobs.filter((j: RenderJob) => j.status === 'processing' || j.status === 'pending').length;
  const completedJobs = jobs.filter((j: RenderJob) => j.status === 'completed').length;

  const stats = [
    { label: 'Total Projects', value: String(projects.length), iconColor: 'var(--color-accent)', iconBg: 'var(--color-accent-light)', emoji: '📂' },
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
          {/* Welcome Banner */}
          <div className="welcome-banner">
            <div>
              <div className="welcome-title">{greeting}, Director 🎬</div>
              <div className="welcome-subtitle">
                {loading ? 'Loading…' : `You have ${pendingJobs} render job${pendingJobs !== 1 ? 's' : ''} in progress and ${projects.length} project${projects.length !== 1 ? 's' : ''}.`}
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
                <div className="stat-card-value">{loading ? '…' : stat.value}</div>
                <div className="stat-card-label">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Main Row */}
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
                {loading ? (
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
                  <div className="credit-amount">{loading ? '…' : tenant?.credit_balance?.toLocaleString() ?? '0'}</div>
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

          {/* Render Jobs */}
          <div className="dashboard-grid">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Render Queue</div>
                  <div className="card-subtitle">Active & pending generation jobs</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 0 3px var(--color-success-light)' }} />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Live</span>
                </div>
              </div>
              <div className="job-list">
                {loading ? (
                  <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 40, borderRadius: 6, marginBottom: 8 }} /><div className="skeleton" style={{ height: 40, borderRadius: 6 }} /></div>
                ) : jobs.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No render jobs</div>
                ) : jobs.slice(0, 5).map((job: RenderJob) => (
                  <div className="job-item" key={job.id}>
                    <div className="job-icon" style={{
                      background: job.status === 'completed' ? 'var(--color-success-light)' : job.status === 'processing' ? 'var(--color-warning-light)' : 'var(--color-surface-3)',
                      color: job.status === 'completed' ? 'var(--color-success)' : job.status === 'processing' ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
                      fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {job.status === 'completed' ? '✅' : job.status === 'processing' ? '⏳' : job.status === 'failed' ? '❌' : '🕐'}
                    </div>
                    <div className="job-info">
                      <div className="job-name">Job {job.id.slice(0, 8)}…</div>
                      <div className="job-time">{new Date(job.created_at).toLocaleString('th-TH')}</div>
                    </div>
                    {statusBadge(job.status)}
                  </div>
                ))}
              </div>
              {jobs.length > 5 && (
                <div style={{ padding: '8px 16px', textAlign: 'center' }}>
                  <Link href="/render-jobs" style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>View all {jobs.length} jobs →</Link>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Quick Actions</div>
                </div>
                <div className="quick-actions">
                  {([
                    { label: 'New Project', sub: 'Start from scratch', color: 'var(--color-accent)', bg: 'var(--color-accent-light)', emoji: '📂', href: '/projects' },
                    { label: 'Add Actor', sub: 'Register to marketplace', color: 'var(--color-purple)', bg: 'var(--color-purple-light)', emoji: '🎭', href: '/actors' },
                    { label: 'View Characters', sub: 'Manage cast', color: 'var(--color-success)', bg: 'var(--color-success-light)', emoji: '👤', href: '/characters' },
                    { label: 'Top-Up Credits', sub: 'Add balance', color: 'var(--color-warning)', bg: 'var(--color-warning-light)', emoji: '💳', href: '/billing' },
                  ]).map(action => (
                    <Link key={action.label} href={action.href} style={{ textDecoration: 'none' }}>
                      <button className="quick-action-btn">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
