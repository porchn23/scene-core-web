'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface TopBarProps {
    title: string;
}

export default function TopBar({ title }: TopBarProps) {
    const { user, signOut } = useAuth();
    const router = useRouter();

    const handleLogout = async () => {
        await signOut();
    };

    return (
        <header className="topbar">
            <h1 className="topbar-title">{title}</h1>

            {/* Search */}
            <div className="topbar-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" placeholder="Search projects, shots..." />
            </div>

            {/* Actions */}
            <div className="topbar-actions">
                {/* Notification */}
                <button className="icon-btn" aria-label="Notifications">
                    <div className="icon-btn-dot" />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                    </svg>
                </button>
            </div>
        </header>
    );
}
