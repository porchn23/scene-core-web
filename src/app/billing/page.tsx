'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { tenantService, billingService } from '@/lib/services';
import type { TenantRead as Tenant, TransactionRead as Transaction } from '@/lib/services';

import { useAuth } from '@/context/AuthContext';

export default function BillingPage() {
    const { tenantId, loading: authLoading } = useAuth();
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [history, setHistory] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [topUpAmount, setTopUpAmount] = useState(100);
    const [topUpDesc, setTopUpDesc] = useState('Top-up credit');
    const [topping, setTopping] = useState(false);
    const [toast, setToast] = useState('');

    const load = useCallback(async (tId: string) => {
        setLoading(true);
        try {
            const [t, h] = await Promise.all([
                tenantService.getById(tId),
                billingService.listTransactions(tId),
            ]);
            setTenant(t as Tenant);
            setHistory(h as Transaction[]);
        } catch (e: any) {
            console.error('Billing load error:', e);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (tenantId) {
            load(tenantId);
        }
    }, [tenantId, load]);

    const handleTopUp = async () => {
        if (!tenantId) return;
        setTopping(true);
        try {
            await billingService.topup(tenantId, topUpAmount, topUpDesc);
            setToast(`✅ Top-up ${topUpAmount} credits สำเร็จ!`);
            setTimeout(() => setToast(''), 4000);
            load(tenantId);
        } catch (e: any) {
            setToast(`❌ ${e.detail || e.message || 'Top-up failed'}`);
            setTimeout(() => setToast(''), 4000);
        } finally { setTopping(false); }
    };

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Billing" />
                <div className="page-container" style={{ maxWidth: 800, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>💰 Billing & Credits</h2>
                    <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 20px' }}>การเงินและ Transaction ของค่ายหนัง</p>

                    {toast && <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, background: toast.startsWith('✅') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${toast.startsWith('✅') ? '#86efac' : '#fca5a5'}`, fontSize: 12, fontWeight: 600, color: toast.startsWith('✅') ? '#15803d' : '#b91c1c' }}>{toast}</div>}

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />)}
                        </div>
                    ) : (
                        <>
                            {/* Balance card */}
                            <div className="card" style={{ padding: 24, marginBottom: 16, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', borderRadius: 16 }}>
                                <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, marginBottom: 4 }}>CREDIT BALANCE</div>
                                <div style={{ fontSize: 36, fontWeight: 800 }}>{tenant?.credit_balance?.toLocaleString() ?? '—'}</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>Plan: {tenant?.plan?.toUpperCase() ?? '—'} · {tenant?.name ?? '—'}</div>
                            </div>

                            {/* Top-up form */}
                            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🪙 Top-Up Credits</div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: 120 }}>
                                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>AMOUNT</label>
                                        <input type="number" value={topUpAmount} onChange={e => setTopUpAmount(Number(e.target.value))}
                                            className="form-input" style={{ width: '100%' }} min={1} />
                                    </div>
                                    <div style={{ flex: 2, minWidth: 200 }}>
                                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>DESCRIPTION</label>
                                        <input value={topUpDesc} onChange={e => setTopUpDesc(e.target.value)} className="form-input" style={{ width: '100%' }} />
                                    </div>
                                    <button className="btn btn-primary" onClick={handleTopUp} disabled={topping} style={{ whiteSpace: 'nowrap' }}>
                                        {topping ? 'Processing…' : '💳 Top Up'}
                                    </button>
                                </div>
                            </div>

                            {/* Transaction history */}
                            <div className="card" style={{ padding: 20 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📜 Transaction History</div>
                                {history.length === 0 ? (
                                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>No transactions yet</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {history.map(tx => (
                                            <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: 8, background: tx.transaction_type === 'credit' ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                                                    {tx.transaction_type === 'credit' ? '💰' : '💸'}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600 }}>{tx.description || tx.transaction_type}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{new Date(tx.created_at).toLocaleString('th-TH')}</div>
                                                </div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: tx.transaction_type === 'credit' ? '#15803d' : '#b91c1c' }}>
                                                    {tx.transaction_type === 'credit' ? '+' : '-'}{tx.amount}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
