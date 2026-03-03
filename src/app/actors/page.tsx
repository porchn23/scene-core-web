'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { supabase } from '@/lib/supabase';
import { actorService } from '@/lib/services';
import type { ActorRead } from '@/lib/services';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';

// ── Helpers ──────────────────────────────────────────────────────

// ── Safe image: returns true placeholder if url looks broken ────
function isSafeUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('data:image/')) return true; // base64
    if (url.includes('example.com') || url.includes('placeholder')) return false;
    return true;
}

// ══════════════════════════════════════════════════════════════
// IMAGE INPUT PANEL
// ══════════════════════════════════════════════════════════════
function ImageInputPanel({
    value, onChange, basePrompt, gender, ethnicity, ageRange,
}: {
    value: string; onChange: (url: string) => void;
    basePrompt?: string; gender?: string; ethnicity?: string; ageRange?: string;
}) {
    const [mode, setMode] = useState<'upload' | 'url' | 'ai'>('upload');
    const [urlInput, setUrlInput] = useState('');
    const [generating, setGenerating] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [imgOk, setImgOk] = useState(false);
    const [imgLoading, setImgLoading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (value) { setImgOk(false); setImgLoading(true); } else { setImgOk(false); setImgLoading(false); } }, [value]);

    const autoPrompt = [gender?.toLowerCase(), ageRange && `${ageRange} years old`, ethnicity, basePrompt,
        'portrait photo, face clearly visible, natural studio lighting, plain white background, casting reference, photorealistic'].filter(Boolean).join(', ');

    const handleFile = async (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setUploading(true);
        setUploadStatus('Uploading to Supabase…');
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const fileName = `actors/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from('actor-photos').upload(fileName, file, { contentType: file.type });
            if (uploadErr) throw new Error(uploadErr.message);
            const { data: urlData } = supabase.storage.from('actor-photos').getPublicUrl(fileName);
            onChange(urlData.publicUrl);
            setUploadStatus('✅ Uploaded to Supabase!');
            setTimeout(() => setUploadStatus(''), 3000);
        } catch (e: any) {
            setUploadStatus(`❌ ${e.message}`);
        } finally {
            setUploading(false);
        }
    };

    const MODES = [
        { k: 'upload' as const, emoji: '📁', label: 'Upload' },
        { k: 'url' as const, emoji: '🔗', label: 'Paste URL' },
    ];

    const showImg = isSafeUrl(value);

    return (
        <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 140, height: 190, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg,#1a1a2e,#2a2a4a)', border: '2px solid var(--color-border)', position: 'relative', flexShrink: 0 }}>
                    {showImg && (
                        <img key={value} src={value} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: imgOk ? 'block' : 'none' }} onLoad={() => { setImgOk(true); setImgLoading(false); }} onError={() => { setImgOk(false); setImgLoading(false); }} />
                    )}
                    {(!showImg || !imgOk) && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'rgba(255,255,255,0.25)' }}>
                            {imgLoading ? <div style={{ width: 24, height: 24, border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: 'rgba(255,255,255,0.6)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} /> : <><span style={{ fontSize: 36 }}>🎭</span><span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>No photo</span></>}
                        </div>
                    )}
                    {(generating || uploading) && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '0 8px' }}>{uploading ? 'Uploading…' : 'Processing…'}</span>
                        </div>
                    )}
                </div>
                {showImg && imgOk && <button onClick={() => onChange('')} style={{ fontSize: 10, color: 'var(--color-danger)', background: 'none', border: '1px solid var(--color-danger)', borderRadius: 6, padding: '3px 12px', cursor: 'pointer' }}>✕ Remove</button>}
                {uploadStatus && <div style={{ fontSize: 10, textAlign: 'center', fontWeight: 600, color: uploadStatus.startsWith('✅') ? '#16a34a' : uploadStatus.startsWith('❌') ? '#dc2626' : '#6366f1', background: uploadStatus.startsWith('✅') ? '#f0fdf4' : uploadStatus.startsWith('❌') ? '#fef2f2' : '#eef2ff', border: `1px solid ${uploadStatus.startsWith('✅') ? '#86efac' : uploadStatus.startsWith('❌') ? '#fca5a5' : '#c7d2fe'}`, borderRadius: 6, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}>{uploadStatus}</div>}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {MODES.map(({ k, emoji, label }) => (
                        <button key={k} type="button" onClick={() => setMode(k)} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: `1.5px solid ${mode === k ? 'var(--color-accent)' : 'var(--color-border)'}`, background: mode === k ? 'var(--color-accent-light)' : 'var(--color-surface-2)', color: mode === k ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.12s', fontSize: 11, fontWeight: 700, textAlign: 'center' }}><div style={{ fontSize: 18, marginBottom: 2 }}>{emoji}</div>{label}</button>
                    ))}
                </div>
                {mode === 'upload' && (
                    <div onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && !uploading) handleFile(f); }} onClick={() => { if (!uploading) fileRef.current?.click(); }} style={{ flex: 1, border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 12, padding: 20, textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: dragOver ? 'var(--color-accent-light)' : 'var(--color-surface-2)', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 120, opacity: uploading ? 0.6 : 1 }}><div style={{ fontSize: 28 }}>📸</div><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Drop photo here</div><div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>or click to browse</div><input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} /></div>
                )}
                {mode === 'url' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}><input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && urlInput) onChange(urlInput); }} placeholder="https://example.com/actor-photo.jpg" className="form-input" style={{ fontSize: 12 }} /><button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { if (urlInput) onChange(urlInput); }}>Use This URL</button></div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MULTI IMAGE UPLOADER
// ══════════════════════════════════════════════════════════════
function MultiImageUploader({ urls, onChange }: { urls: string[], onChange: (u: string[]) => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            const newUrls = [...urls];
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                const ext = file.name.split('.').pop() || 'jpg';
                const fileName = `actors/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                const { error } = await supabase.storage.from('actor-photos').upload(fileName, file, { contentType: file.type });
                if (error) continue;
                const { data } = supabase.storage.from('actor-photos').getPublicUrl(fileName);
                newUrls.push(data.publicUrl);
            }
            onChange(newUrls);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {urls.map((url, i) => (
                <div key={i} style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative', border: '1px solid var(--color-border)', flexShrink: 0 }}><img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="ref" /><button onClick={() => onChange(urls.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button></div>
            ))}
            <div onClick={() => !uploading && fileRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 8, border: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', background: 'var(--color-surface-2)', opacity: uploading ? 0.5 : 1, transition: 'background 0.2s', flexShrink: 0 }}><span style={{ fontSize: 22, color: 'var(--color-text-secondary)' }}>+</span><input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFile} /></div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// LORA UPLOADER
// ══════════════════════════════════════════════════════════════
function LoRAUploader({
    actorId,
    value,
    status,
    imageCount,
    onChange,
    onTrain
}: {
    actorId?: string;
    value: string | null;
    status?: string | null;
    imageCount: number;
    onChange: (v: string | null) => void;
    onTrain: () => Promise<void>;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [training, setTraining] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'safetensors';
            const fileName = `loras/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error } = await supabase.storage.from('lora-files').upload(fileName, file, { contentType: 'application/octet-stream' });
            if (error) throw error;
            const { data } = supabase.storage.from('lora-files').getPublicUrl(fileName);
            onChange(data.publicUrl);
        } catch (e: any) { alert(`Upload failed: ${e.message}`); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
    };

    const handleTrainClick = async () => {
        if (!actorId) return;
        setTraining(true);
        try {
            await onTrain();
        } catch (e: any) {
            alert(`Training failed to start: ${e.message}`);
        } finally {
            setTraining(false);
        }
    };

    const isTraining = status === 'training';
    const hasEnoughImages = imageCount >= 4;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status Indicator */}
            {status && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    background: isTraining ? 'var(--color-warning-light)' : 'var(--color-surface-2)',
                    color: isTraining ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                    border: '1px solid currentColor',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                }}>
                    {isTraining ? '⚙️ Training in progress...' : `Status: ${status}`}
                </div>
            )}

            {/* Manual Upload/URL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Model Configuration</div>
                {value ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: 24 }}>🧠</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value.split('/').pop()}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>LoRA Model File</div>
                        </div>
                        <button onClick={() => onChange(null)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                    </div>
                ) : (
                    <div onClick={() => !uploading && !isTraining && fileRef.current?.click()} style={{ padding: '24px', borderRadius: 12, border: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading || isTraining ? 'wait' : 'pointer', background: 'var(--color-surface-2)', transition: 'all 0.2s', opacity: isTraining ? 0.5 : 1 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{uploading ? 'Uploading LoRA…' : 'Upload LoRA File'}</div>
                        <input ref={fileRef} type="file" accept=".safetensors,.ckpt" style={{ display: 'none' }} onChange={handleFile} />
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input className="form-input" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Or paste public LoRA URL here..." style={{ fontSize: 12 }} disabled={isTraining} />
                </div>
            </div>

            {/* AI Training Section */}
            {!value && actorId && (
                <div style={{
                    marginTop: 8,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)' }}>AI Model Training</div>
                    <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                        Train a custom LoRA model based on this actor's reference photos.
                        Requires at least 4 photos for best results.
                    </p>

                    <button
                        className="btn btn-primary"
                        disabled={training || isTraining || !hasEnoughImages}
                        onClick={handleTrainClick}
                        style={{ width: '100%', justifyContent: 'center', gap: 10 }}
                    >
                        {training || isTraining ? (
                            <>
                                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                {training ? 'Starting...' : 'Training...'}
                            </>
                        ) : (
                            <>🧠 Start LoRA Training</>
                        )}
                    </button>

                    {!hasEnoughImages && (
                        <div style={{ fontSize: 10, color: 'var(--color-danger)', fontWeight: 600 }}>
                            ⚠️ Need {4 - imageCount} more reference photos to start training.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ACTOR CARD
// ══════════════════════════════════════════════════════════════
function ActorCard({ actor, isOwner, onEdit, onDelete, onViewProfile }: { actor: ActorRead; isOwner: boolean; onEdit: () => void; onDelete: () => void; onViewProfile: () => void; }) {
    const [hovered, setHovered] = useState(false);
    const [imgOk, setImgOk] = useState(false);
    const safe = isSafeUrl(actor.face_image_url);

    const isPublic = actor.visibility === 'public';

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', transition: 'transform 0.15s,box-shadow 0.15s', transform: hovered ? 'translateY(-3px)' : 'none', boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <div style={{ position: 'relative', aspectRatio: '3/4', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', overflow: 'hidden', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onViewProfile(); }}>
                {safe && <img src={actor.face_image_url} alt={actor.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transition: 'transform 0.3s', transform: hovered ? 'scale(1.04)' : 'scale(1)', display: imgOk ? 'block' : 'none' }} onLoad={() => setImgOk(true)} onError={() => setImgOk(false)} />}
                {(!safe || !imgOk) && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.15)' }}><span style={{ fontSize: 52 }}>🎭</span></div>}

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(transparent,rgba(0,0,0,0.88))' }} />

                <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>Lv.{actor.level}</span>
                        {isPublic && <span style={{ background: 'var(--color-accent)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>🌎 PUBLIC</span>}
                        {actor.lora_url && <span style={{ background: '#7c3aed', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>🧠 LoRA</span>}
                        {actor.lora_training_status === 'training' && <span style={{ background: '#f59e0b', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>⚙️ TRAINING</span>}
                    </div>
                </div>

                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    {actor.usage_fee > 0 && <span style={{ background: 'rgba(255,255,255,0.9)', color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8 }}>🪙 {actor.usage_fee}</span>}
                </div>

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', marginBottom: 2 }}>{actor.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {actor.gender} {actor.age_range && `· ${actor.age_range}`} {actor.ethnicity && `· ${actor.ethnicity}`}
                    </div>
                </div>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    {isOwner ? (
                        <>
                            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)', border: '1px solid var(--color-danger)', padding: '5px 10px' }} onClick={e => { e.stopPropagation(); onDelete(); }}>Delete</button>
                        </>
                    ) : (
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); onViewProfile(); }}>View Profile</button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ACTOR FORM MODAL
// ══════════════════════════════════════════════════════════════
function ActorFormModal({ actor, onClose, onSaved }: { actor?: ActorRead | null; onClose: () => void; onSaved: (a: ActorRead) => void; }) {
    const { tenantId, userProfile } = useAuth();
    const { t: toast, show: notify } = useToast();
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState<'profile' | 'photo' | 'prompt' | 'lora'>('profile');

    const [name, setName] = useState(actor?.name ?? '');
    const [desc, setDesc] = useState(actor?.description ?? '');
    const [gender, setGender] = useState(actor?.gender ?? '');
    const [ageRange, setAgeRange] = useState(actor?.age_range ?? '');
    const [ethnicity, setEthnicity] = useState(actor?.ethnicity ?? '');
    const [faceUrl, setFaceUrl] = useState(actor?.face_image_url ?? '');
    const [imageUrls, setImageUrls] = useState<string[]>(actor?.image_urls || []);
    const [basePrompt, setBasePrompt] = useState(actor?.base_prompt ?? '');
    const [negPrompt, setNegPrompt] = useState(actor?.negative_prompt ?? '');
    const [visibility, setVisibility] = useState(actor?.visibility ?? 'private');
    const [usageFee, setUsageFee] = useState(actor?.usage_fee ?? 0);
    const [loraUrl, setLoraUrl] = useState(actor?.lora_url ?? null);

    const handleSave = async () => {
        if (!name.trim()) { notify('Name is required', true); return; }
        if (!faceUrl.trim()) { notify('Please add a photo first', true); setTab('photo'); return; }
        setSaving(true);
        try {
            const body = {
                name,
                description: desc || null,
                gender: gender || null,
                age_range: ageRange || null,
                ethnicity: ethnicity || null,
                face_image_url: faceUrl,
                image_urls: imageUrls,
                base_prompt: basePrompt || ' ',
                negative_prompt: negPrompt || null,
                visibility,
                usage_fee: usageFee,
                lora_url: loraUrl,
                tenant_id: tenantId
            };
            let result: ActorRead;
            if (actor && tenantId) {
                result = await actorService.update(actor.id, body, tenantId);
            } else {
                if (!tenantId) throw new Error('Tenant ID required');
                result = await actorService.create(body as any, tenantId);
            }
            onSaved(result);
        } catch (e: any) { notify(e.message || 'Failed to save', true); } finally { setSaving(false); }
    };

    const TABS = [{ k: 'profile' as const, label: '👤 Profile' }, { k: 'photo' as const, label: '📸 Photo' }, { k: 'prompt' as const, label: '🤖 AI Prompt' }, { k: 'lora' as const, label: '🧠 LoRA' }];

    const [loraStatus, setLoraStatus] = useState(actor?.lora_training_status ?? null);

    const handleTrainLoRA = async () => {
        if (!actor) return;
        try {
            if (!tenantId) return;
            await actorService.train(actor.id, tenantId);
            setLoraStatus('training');
            notify('Training started seamlessly!');
            // Update the local storage/parent state as well
            handleSave();
        } catch (e: any) {
            notify(e.message || 'Failed to start training', true);
            throw e;
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--color-surface)', borderRadius: 20, width: '100%', maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontWeight: 800, fontSize: 18 }}>{actor ? `Edit: ${actor.name}` : 'Add New Actor'}</div></div><button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer' }}>×</button></div>
                <div style={{ display: 'flex', gap: 4, padding: '14px 24px 0', borderBottom: '1px solid var(--color-border)' }}>{TABS.map(({ k, label }) => (<button key={k} onClick={() => setTab(k)} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', background: tab === k ? 'var(--color-accent)' : 'transparent', color: tab === k ? '#fff' : 'var(--color-text-secondary)' }}>{label}</button>))}</div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {tab === 'profile' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label className="form-label">Name *</label>
                                    <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Actor full name" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Visibility</label>
                                    <select className="form-input" value={visibility} onChange={e => setVisibility(e.target.value)}>
                                        <option value="private">🔒 Private (Studio Only)</option>
                                        <option value="public">🌎 Public (Marketplace)</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label className="form-label">Gender</label>
                                    <select className="form-input" value={gender} onChange={e => setGender(e.target.value)}>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Non-binary">Non-binary</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Age Range</label>
                                    <input className="form-input" value={ageRange} onChange={e => setAgeRange(e.target.value)} placeholder="e.g. 20-30" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Ethnicity</label>
                                    <input className="form-input" value={ethnicity} onChange={e => setEthnicity(e.target.value)} placeholder="e.g. Asian, Caucasian" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea className="form-input" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Briefly describe the actor..." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Usage Fee (Credits)</label>
                                <input type="number" className="form-input" value={usageFee} onChange={e => setUsageFee(Number(e.target.value))} />
                            </div>
                        </>
                    )}
                    {tab === 'photo' && (<div><ImageInputPanel value={faceUrl} onChange={setFaceUrl} basePrompt={basePrompt} gender={gender} ethnicity={ethnicity} ageRange={ageRange} /><div style={{ marginTop: 20 }}><MultiImageUploader urls={imageUrls} onChange={setImageUrls} /></div></div>)}
                    {tab === 'prompt' && (<div className="form-group"><label className="form-label">Appearance Prompt</label><textarea className="form-input" rows={5} value={basePrompt} onChange={e => setBasePrompt(e.target.value)} /></div>)}
                    {tab === 'lora' && (
                        <LoRAUploader
                            actorId={actor?.id}
                            value={loraUrl}
                            status={loraStatus}
                            imageCount={imageUrls.length}
                            onChange={setLoraUrl}
                            onTrain={handleTrainLoRA}
                        />
                    )}
                </div>
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Actor'}</button></div>
            </div>
            {toast && <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: toast.err ? 'var(--color-danger)' : '#1e293b', color: '#fff', padding: '9px 20px', borderRadius: 10, fontSize: 12 }}>{toast.msg}</div>}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ACTOR PROFILE VIEWER MODAL
// ══════════════════════════════════════════════════════════════
function ActorProfileViewer({ actor, onClose }: { actor: ActorRead; onClose: () => void }) {
    const [activeImg, setActiveImg] = useState(actor.face_image_url);
    const allImages = [actor.face_image_url, ...(actor.image_urls || [])].filter(Boolean);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
            <div style={{ display: 'flex', background: 'var(--color-surface)', borderRadius: 32, overflow: 'hidden', width: '100%', maxWidth: 1100, height: '88vh', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>

                {/* Image Section */}
                <div style={{ flex: '1.4', background: '#050505', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, overflow: 'hidden' }}>
                        <img src={activeImg} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, transition: 'all 0.3s' }} alt={actor.name} />
                    </div>
                    {/* Thumbnail Strip */}
                    {allImages.length > 1 && (
                        <div style={{ height: 100, background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 10, padding: 15, overflowX: 'auto', justifyContent: 'center' }}>
                            {allImages.map((url, i) => (
                                <img
                                    key={i}
                                    src={url}
                                    onClick={() => setActiveImg(url)}
                                    style={{
                                        height: '100%',
                                        aspectRatio: '1',
                                        objectFit: 'cover',
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        border: activeImg === url ? '2px solid var(--color-accent)' : '2px solid transparent',
                                        opacity: activeImg === url ? 1 : 0.5,
                                        transition: 'all 0.2s'
                                    }}
                                />
                            ))}
                        </div>
                    )}
                    {/* Floating Badges on Image */}
                    <div style={{ position: 'absolute', top: 24, left: 24, display: 'flex', gap: 8 }}>
                        <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.2)' }}>Lv.{actor.level} EX</div>
                        {actor.visibility === 'public' && <div style={{ background: 'var(--color-accent)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 30 }}>🌎 MARKETPLACE</div>}
                    </div>
                </div>

                {/* Info Section */}
                <div style={{ flex: '1', padding: '48px 40px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>{actor.name}</h1>
                                {actor.lora_url && <div title="AI LoRA Ready" style={{ width: 44, height: 44, background: '#f5f3ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, cursor: 'help', border: '1px solid #ddd6fe' }}>🧠</div>}
                            </div>
                            {actor.lora_training_status === 'training' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#f59e0b', background: '#fef3c7', padding: '4px 12px', borderRadius: 6, marginTop: 12 }}>
                                    <span className="animate-pulse">⚙️</span> AI TRAINING IN PROGRESS
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-2)', border: 'none', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    </div>

                    {/* Stats Chips */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 32, flexWrap: 'wrap' }}>
                        {actor.gender && <div style={{ padding: '8px 16px', background: 'var(--color-surface-2)', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>🏷️ {actor.gender}</div>}
                        {actor.age_range && <div style={{ padding: '8px 16px', background: 'var(--color-surface-2)', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>🎂 {actor.age_range} Years</div>}
                        {actor.ethnicity && <div style={{ padding: '8px 16px', background: 'var(--color-surface-2)', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>🌏 {actor.ethnicity}</div>}
                    </div>

                    <div style={{ marginTop: 40 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Description</h3>
                        <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
                            {actor.description || 'No description provided for this actor.'}
                        </div>
                    </div>

                    {/* Decision Data */}
                    <div style={{ marginTop: 'auto', paddingTop: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: 'linear-gradient(135deg,#f8faff,#f0f4ff)', border: '1px solid #e0e7ff', borderRadius: 20 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Daily Usage Fee</div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--color-accent)', marginTop: 4 }}>🪙 {actor.usage_fee || 0} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>Credits</span></div>
                            </div>
                            <button className="btn btn-primary" style={{ padding: '12px 28px', borderRadius: 14, fontSize: 15, fontWeight: 800 }} onClick={onClose}>
                                Select for Project
                            </button>
                        </div>

                        {actor.lora_url && (
                            <div style={{ padding: '16px 20px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ fontSize: 24 }}>✨</div>
                                <div style={{ fontSize: 13, color: '#5b21b6', lineHeight: 1.4 }}>
                                    This actor is <strong>AI-Enabled</strong>. You can use their custom LoRA model to generate scenes with infinite poses and expressions.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function ActorsPage() {
    const { tenantId } = useAuth();
    const { t, show: notify } = useToast();
    const [actors, setActors] = useState<ActorRead[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterGender, setFilterGender] = useState('');
    const [filterVis, setFilterVis] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingActor, setEditingActor] = useState<ActorRead | null>(null);
    const [viewingActor, setViewingActor] = useState<ActorRead | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadActors = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try { setActors(await actorService.list(tenantId)); }
        catch { setActors([]); }
        setLoading(false);
    }, [tenantId]);

    useEffect(() => { loadActors(); }, [loadActors]);

    const handleSaved = (a: ActorRead) => {
        setActors(prev => editingActor ? prev.map(x => x.id === a.id ? a : x) : [a, ...prev]);
        setModalOpen(false); setEditingActor(null);
        notify('Saved!');
    };

    const handleDelete = async () => {
        if (!deletingId || !tenantId) return;
        try { await actorService.delete(deletingId, tenantId); setActors(p => p.filter(a => a.id !== deletingId)); setDeletingId(null); notify('Deleted.'); }
        catch (e: any) { notify(e.message || 'Failed - You may not own this actor', true); }
    };

    const filtered = actors.filter(a => {
        if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterGender && a.gender !== filterGender) return false;
        if (filterVis && a.visibility !== filterVis) return false;
        return true;
    });

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <TopBar title="Cast & Actors" />
                <div className="page-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}><div style={{ fontSize: 24, fontWeight: 800 }}>{actors.length} Actors</div><button className="btn btn-primary" onClick={() => { setEditingActor(null); setModalOpen(true); }}>+ Add Actor</button></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 18 }}>
                        {loading ? [1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ aspectRatio: '3/4', borderRadius: 16 }} />) : filtered.map(actor => (
                            <ActorCard
                                key={actor.id}
                                actor={actor}
                                isOwner={actor.tenant_id === tenantId}
                                onEdit={() => { setEditingActor(actor); setModalOpen(true); }}
                                onDelete={() => setDeletingId(actor.id)}
                                onViewProfile={() => setViewingActor(actor)}
                            />
                        ))}
                    </div>
                </div>
            </div>
            {modalOpen && <ActorFormModal actor={editingActor} onClose={() => setModalOpen(false)} onSaved={handleSaved} />}
            {viewingActor && <ActorProfileViewer actor={viewingActor} onClose={() => setViewingActor(null)} />}
            {deletingId && <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ background: 'var(--color-surface)', padding: 28, borderRadius: 16 }}><h3>Delete Actor?</h3><div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button className="btn btn-secondary" onClick={() => setDeletingId(null)}>Cancel</button><button className="btn btn-danger" onClick={handleDelete}>Delete</button></div></div></div>}
            {t && <div style={{ position: 'fixed', bottom: 24, right: 24, background: t.err ? 'var(--color-danger)' : '#1e293b', color: '#fff', padding: '11px 18px', borderRadius: 12, zIndex: 10000 }}>{t.msg}</div>}
        </div>
    );
}
