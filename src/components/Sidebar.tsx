'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Sidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAuth();

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M5 8h8a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4a2 2 0 012-2z" />
                    </svg>
                </div>
                <div className="sidebar-logo-text">
                    <span className="sidebar-logo-name">Scene Core</span>
                    <span className="sidebar-logo-sub">AI Video Studio</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {navItems.map((group) => (
                    <div key={group.section}>
                        <div className="sidebar-section-label">{group.section}</div>
                        {group.items.map((item) => {
                            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`nav-item ${isActive ? 'active' : ''}`}
                                >
                                    <span className="nav-item-icon">{item.icon}</span>
                                    {item.label}
                                    {('badge' in item && (item as any).badge) && (
                                        <span className="nav-item-badge">{(item as any).badge as React.ReactNode}</span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* User Footer */}
            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-avatar">
                        {user ? (
                            <img src={user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${user.email}`} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                        ) : (
                            'SC'
                        )}
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name" title={user?.email}>{user?.user_metadata.full_name || user?.email || 'Scene Core Admin'}</div>
                        <div className="sidebar-user-role">{user ? 'Director' : 'Guest'}</div>
                    </div>
                    {user && (
                        <button
                            onClick={() => signOut()}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 4,
                                cursor: 'pointer',
                                color: 'var(--color-text-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 4,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ff4d4d'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                            title="Sign Out"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </aside>
    );
}

const navItems = [
    {
        section: 'Overview',
        items: [
            {
                label: 'Dashboard',
                href: '/dashboard',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                ),
            },
        ],
    },
    {
        section: 'Production',
        items: [
            {
                label: 'Projects',
                href: '/projects',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                ),
            }
        ],
    },
    {
        section: 'Assets',
        items: [
            {
                label: 'Actors',
                href: '/actors',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                ),
            },
            {
                label: 'Locations',
                href: '/locations',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2C8.686 2 6 4.686 6 8c0 5.25 6 13 6 13s6-7.75 6-13c0-3.314-2.686-6-6-6z" />
                        <circle cx="12" cy="8" r="2.5" />
                    </svg>
                ),
            },
            {
                label: 'Characters',
                href: '/characters',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87" />
                        <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                ),
            },
        ],
    },
    {
        section: 'System',
        items: [
            {
                label: 'Render Jobs',
                href: '/render-jobs',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                ),
            },
            {
                label: 'Billing',
                href: '/billing',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                ),
            },
            {
                label: 'Users',
                href: '/users',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87" />
                        <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                ),
            },
            {
                label: 'Tenants',
                href: '/tenants',
                icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <polyline points="9,22 9,12 15,12 15,22" />
                    </svg>
                ),
            },
        ],
    },
];
