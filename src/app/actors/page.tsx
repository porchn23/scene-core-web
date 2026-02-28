'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

import { supabase } from '@/lib/supabase';
import { actorService } from '@/lib/services';
import type { ActorRead } from '@/lib/services';

const TENANT_ID = '7a39f072-bb89-4777-8f9f-a938196f35a7';

// (ActorRead ถูก import จาก @/lib/services แล้ว)

// ── Helpers ──────────────────────────────────────────────────────
function useToast() {
    const [t, setT] = useState<{ msg: string; err?: boolean } | null>(null);
    const show = useCallback((msg: string, err = false) => { setT({ msg, err }); setTimeout(() => setT(null), 3500); }, []);
    return { t, show };
}

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

    // When value changes reset img state
    useEffect(() => { if (value) { setImgOk(false); setImgLoading(true); } else { setImgOk(false); setImgLoading(false); } }, [value]);

    const autoPrompt = [gender?.toLowerCase(), ageRange && `${ageRange} years old`, ethnicity, basePrompt,
        'portrait photo, face clearly visible, natural studio lighting, plain white background, casting reference, photorealistic'].filter(Boolean).join(', ');

    // Upload File → Supabase Storage ตรง
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

    // AI Generate — ยังไม่พร้อมเนื่องจากต้องใช้ backend สำหรับ Gemini
    const handleGenerate = async () => {
        setUploadStatus('❌ AI Generate ยังไม่พร้อมใช้งาน — ใช้ Upload หรือ Paste URL แทน');
        setTimeout(() => setUploadStatus(''), 5000);
    };

    const MODES = [
        { k: 'upload' as const, emoji: '📁', label: 'Upload' },
        { k: 'url' as const, emoji: '🔗', label: 'Paste URL' },
        { k: 'ai' as const, emoji: '✨', label: 'AI Generate' },
    ];


    const showImg = isSafeUrl(value);

    return (
        <div style={{ display: 'flex', gap: 20 }}>

            {/* ── Preview (portrait) ── */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 140, height: 190, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg,#1a1a2e,#2a2a4a)', border: '2px solid var(--color-border)', position: 'relative', flexShrink: 0 }}>
                    {showImg && (
                        <img
                            key={value}
                            src={value}
                            alt="preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: imgOk ? 'block' : 'none' }}
                            onLoad={() => { setImgOk(true); setImgLoading(false); }}
                            onError={() => { setImgOk(false); setImgLoading(false); }}
                        />
                    )}
                    {/* Placeholder / loading overlay */}
                    {(!showImg || !imgOk) && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'rgba(255,255,255,0.25)' }}>
                            {imgLoading
                                ? <div style={{ width: 24, height: 24, border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: 'rgba(255,255,255,0.6)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                                : <><span style={{ fontSize: 36 }}>🎭</span><span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>No photo</span></>
                            }
                        </div>
                    )}
                    {/* Generating overlay */}
                    {(generating || uploading) && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '0 8px' }}>
                                {uploading ? 'Uploading…' : 'Generating…'}
                            </span>
                        </div>
                    )}
                </div>
                {showImg && imgOk && (
                    <button onClick={() => onChange('')} style={{ fontSize: 10, color: 'var(--color-danger)', background: 'none', border: '1px solid var(--color-danger)', borderRadius: 6, padding: '3px 12px', cursor: 'pointer' }}>✕ Remove</button>
                )}
                {uploadStatus && (
                    <div style={{
                        fontSize: 10, textAlign: 'center', fontWeight: 600,
                        color: uploadStatus.startsWith('✅') ? '#16a34a' : uploadStatus.startsWith('❌') ? '#dc2626' : '#6366f1',
                        background: uploadStatus.startsWith('✅') ? '#f0fdf4' : uploadStatus.startsWith('❌') ? '#fef2f2' : '#eef2ff',
                        border: `1px solid ${uploadStatus.startsWith('✅') ? '#86efac' : uploadStatus.startsWith('❌') ? '#fca5a5' : '#c7d2fe'}`,
                        borderRadius: 6, padding: '4px 8px', width: '100%', boxSizing: 'border-box' as const
                    }}>
                        {uploadStatus}
                    </div>
                )}
            </div>

            {/* ── Right side ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Mode buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                    {MODES.map(({ k, emoji, label }) => (
                        <button key={k} type="button" onClick={() => setMode(k)}
                            style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: `1.5px solid ${mode === k ? 'var(--color-accent)' : 'var(--color-border)'}`, background: mode === k ? 'var(--color-accent-light)' : 'var(--color-surface-2)', color: mode === k ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.12s', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
                            <div style={{ fontSize: 18, marginBottom: 2 }}>{emoji}</div>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Upload mode */}
                {mode === 'upload' && (
                    <div
                        onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && !uploading) handleFile(f); }}
                        onClick={() => { if (!uploading) fileRef.current?.click(); }}
                        style={{ flex: 1, border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 12, padding: 20, textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: dragOver ? 'var(--color-accent-light)' : 'var(--color-surface-2)', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 120, opacity: uploading ? 0.6 : 1 }}>
                        <div style={{ fontSize: 28 }}>📸</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Drop photo here</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>or click to browse</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2, opacity: 0.7 }}>JPG · PNG · WEBP</div>
                        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                    </div>
                )}

                {/* URL mode */}
                {mode === 'url' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                        <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && urlInput) onChange(urlInput); }}
                            placeholder="https://example.com/actor-photo.jpg"
                            className="form-input" style={{ fontSize: 12 }} />
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                            onClick={() => { if (urlInput) onChange(urlInput); }}>Use This URL</button>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
                            วาง URL รูปภาพสาธารณะ เช่น Unsplash, Imgur, Google Drive (public link), CDN ฯลฯ<br />
                            แล้วกด Enter หรือ "Use This URL"
                        </div>
                    </div>
                )}

                {/* AI Generate mode */}
                {mode === 'ai' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                        <div style={{ background: 'linear-gradient(135deg,#fef9ff,#f0f4ff)', border: '1px solid #c4b5fd', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#5b21b6', lineHeight: 1.5 }}>
                            <strong>✨ Gemini Imagen AI</strong><br />
                            สร้างภาพ <strong>หน้าตานักแสดง</strong> ด้วย Gemini Imagen 3 — คุณภาพสูง บันทึกถาวรใน Supabase
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prompt ที่ใช้สร้างภาพ</div>
                        <div style={{ padding: '8px 12px', background: 'var(--color-surface-2)', borderRadius: 8, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6, fontStyle: 'italic', minHeight: 60 }}>
                            {autoPrompt || <span style={{ opacity: 0.4 }}>กรอก Gender, Ethnicity, Age และ Appearance Prompt ก่อน</span>}
                        </div>
                        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating || !autoPrompt}
                            style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', background: generating ? undefined : 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                            {generating
                                ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Generating with Gemini…</>
                                : '✨ Generate with Gemini Imagen'}
                        </button>
                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>Powered by Google Gemini Imagen 3 — ภาพถูกบันทึกใน Supabase Storage</div>
                    </div>
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
                if (error) {
                    alert(`Upload failed: ${error.message}`);
                    continue;
                }
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
                <div key={i} style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative', border: '1px solid var(--color-border)', flexShrink: 0 }}>
                    <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="ref" />
                    <button onClick={() => onChange(urls.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
            ))}
            <div onClick={() => !uploading && fileRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 8, border: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', background: 'var(--color-surface-2)', opacity: uploading ? 0.5 : 1, transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ fontSize: 22, color: 'var(--color-text-secondary)' }}>+</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{uploading ? '...' : 'Add'}</span>
                <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// LORA UPLOADER
// ══════════════════════════════════════════════════════════════
function LoRAUploader({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

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
        } catch (e: any) {
            alert(`Upload failed: ${e.message}`);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                <div onClick={() => !uploading && fileRef.current?.click()} style={{ padding: '24px', borderRadius: 12, border: '2px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'wait' : 'pointer', background: 'var(--color-surface-2)', transition: 'all 0.2s' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{uploading ? 'Uploading LoRA…' : 'Upload LoRA File'}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>.safetensors or .ckpt files allowed</div>
                    <input ref={fileRef} type="file" accept=".safetensors,.ckpt" style={{ display: 'none' }} onChange={handleFile} />
                </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input className="form-input" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Or paste public LoRA URL here..." style={{ fontSize: 12 }} />
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ACTOR CARD
// ══════════════════════════════════════════════════════════════
function ActorCard({ actor, onEdit, onDelete }: { actor: ActorRead; onEdit: () => void; onDelete: () => void; }) {
    const [hovered, setHovered] = useState(false);
    const [imgOk, setImgOk] = useState(false);
    const safe = isSafeUrl(actor.face_image_url);

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', transition: 'transform 0.15s,box-shadow 0.15s', transform: hovered ? 'translateY(-3px)' : 'none', boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)' }}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            {/* Portrait Photo */}
            <div style={{ position: 'relative', aspectRatio: '3/4', background: 'linear-gradient(135deg,#1a1a2e,#16213e)', overflow: 'hidden' }}>
                {safe && (
                    <img
                        src={actor.face_image_url}
                        alt={actor.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transition: 'transform 0.3s', transform: hovered ? 'scale(1.04)' : 'scale(1)', display: imgOk ? 'block' : 'none' }}
                        onLoad={() => setImgOk(true)}
                        onError={() => setImgOk(false)}
                    />
                )}
                {/* fallback */}
                {(!safe || !imgOk) && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.15)' }}>
                        <span style={{ fontSize: 52 }}>🎭</span>
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>No photo</span>
                    </div>
                )}
                {/* gradient overlay */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', background: 'linear-gradient(transparent,rgba(0,0,0,0.88))' }} />

                {/* badges */}
                <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <span style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>Lv.{actor.level}</span>
                        <span style={{ background: actor.visibility === 'public' ? 'rgba(48,209,88,0.85)' : 'rgba(100,100,100,0.7)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>{actor.visibility === 'public' ? '🌎 PUBLIC' : '🔒 PRIVATE'}</span>
                    </div>
                    {actor.lora_training_status === 'training' && (
                        <span style={{ background: 'linear-gradient(90deg, #7c3aed, #db2777)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, animation: 'pulse 1.5s infinite', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'spin 1s linear infinite' }} /> ⚙️ TRAINING LORA...
                        </span>
                    )}
                </div>
                {actor.usage_fee > 0 && <div style={{ position: 'absolute', top: 8, right: 8, background: 'var(--color-accent)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>${actor.usage_fee}/shot</div>}

                {/* Name over photo */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 12px' }}>
                    {actor.lora_url && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(124,58,237,0.9)', backdropFilter: 'blur(8px)', padding: '2px 8px', borderRadius: 4, marginBottom: 6 }}>
                            <span style={{ fontSize: 10 }}>🧠</span>
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>LoRA ACTIVE</span>
                        </div>
                    )}
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', marginBottom: 2 }}>{actor.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {actor.gender && <span>{actor.gender}</span>}
                        {actor.age_range && <span>· {actor.age_range}</span>}
                        {actor.ethnicity && <span>· {actor.ethnicity}</span>}
                    </div>
                </div>
            </div>

            {/* Info */}
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {actor.description && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box', overflow: 'hidden' }}>{actor.description}</div>
                )}

                {/* Stats */}
                <div style={{ display: 'flex', background: 'var(--color-surface-2)', borderRadius: 8, overflow: 'hidden' }}>
                    {[
                        { label: 'Score', value: actor.popularity_score.toFixed(0), icon: '⭐' },
                        { label: 'XP', value: actor.experience_points >= 1000 ? `${(actor.experience_points / 1000).toFixed(1)}k` : String(actor.experience_points), icon: '🏅' },
                    ].map(({ label, value, icon }) => (
                        <div key={label} style={{ flex: 1, padding: '6px 8px', textAlign: 'center', borderRight: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{icon} {value}</div>
                            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                        </div>
                    ))}
                    <div style={{ flex: 1, padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: actor.visibility === 'public' ? '#30d158' : '#94a3b8', display: 'inline-block', marginRight: 3 }} />{actor.visibility}</div>
                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Status</div>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)', border: '1px solid var(--color-danger)', padding: '5px 10px' }} onClick={e => { e.stopPropagation(); onDelete(); }}>Delete</button>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// ACTOR FORM MODAL
// ══════════════════════════════════════════════════════════════
function ActorFormModal({ actor, onClose, onSaved }: { actor?: ActorRead | null; onClose: () => void; onSaved: (a: ActorRead) => void; }) {
    const { t: toast, show: notify } = useToast();
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState<'profile' | 'photo' | 'prompt' | 'lora'>('profile');

    const [name, setName] = useState(actor?.name ?? '');
    const [desc, setDesc] = useState(actor?.description ?? '');
    const [gender, setGender] = useState(actor?.gender ?? '');
    const [ageRange, setAgeRange] = useState(actor?.age_range ?? '');
    const [ethnicity, setEthnicity] = useState(actor?.ethnicity ?? '');
    const [faceUrl, setFaceUrl] = useState(() => {
        const u = actor?.face_image_url ?? '';
        return isSafeUrl(u) ? u : '';
    });
    const [imageUrls, setImageUrls] = useState<string[]>(actor?.image_urls || []);
    const [basePrompt, setBasePrompt] = useState(actor?.base_prompt ?? '');
    const [negPrompt, setNegPrompt] = useState(actor?.negative_prompt ?? '');
    const [visibility, setVisibility] = useState(actor?.visibility ?? 'private');
    const [usageFee, setUsageFee] = useState(actor?.usage_fee ?? 0);
    const [loraUrl, setLoraUrl] = useState(actor?.lora_url ?? null);
    const [trainingStatus, setTrainingStatus] = useState(actor?.lora_training_status ?? null);
    const [training, setTraining] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) { notify('Name is required', true); return; }
        if (!faceUrl.trim()) { notify('Please add a photo first — use Upload, URL, or AI Generate tab', true); setTab('photo'); return; }
        setSaving(true);
        try {
            const body = { name, description: desc || null, gender: gender || null, age_range: ageRange || null, ethnicity: ethnicity || null, face_image_url: faceUrl, image_urls: imageUrls, base_prompt: basePrompt || ' ', negative_prompt: negPrompt || null, visibility, usage_fee: usageFee, voice_profile: actor?.voice_profile ?? {}, lora_url: loraUrl };
            let result: ActorRead;
            if (actor) {
                result = await actorService.update(actor.id, body);
            } else {
                result = await actorService.create({ ...body, tenant_id: TENANT_ID });
            }
            onSaved(result);
        } catch (e: any) { notify(e.message || 'Failed to save', true); }
        finally { setSaving(false); }
    };

    const startTraining = async () => {
        if (!actor) { notify('Please save actor profile first before training', true); return; }
        if ((imageUrls?.length || 0) < 5) { notify('Need at least 5 reference photos for training', true); setTab('photo'); return; }
        setTraining(true);
        try {
            await actorService.train(actor.id);
            setTrainingStatus('training');
            notify('🚀 LoRA training started! This will take 20-30 mins.');
        } catch (e: any) { notify(e.message || 'Training failed', true); }
        finally { setTraining(false); }
    };

    const TABS = [
        { k: 'profile' as const, label: '👤 Profile' },
        { k: 'photo' as const, label: '📸 Photo & Look' },
        { k: 'prompt' as const, label: '🤖 AI Prompt' },
        { k: 'lora' as const, label: '🧠 LoRA File' },
    ];

    const hasPhoto = isSafeUrl(faceUrl);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--color-surface)', borderRadius: 20, width: '100%', maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden', position: 'relative' }}>

                {/* Header */}
                <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{actor ? `Edit: ${actor.name}` : 'Add New Actor'}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>Build a casting profile with photo and AI generation settings</div>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-surface-2)', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '14px 24px 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                    {TABS.map(({ k, label }) => (
                        <button key={k} onClick={() => setTab(k)}
                            style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', transition: 'all 0.15s', background: tab === k ? 'var(--color-accent)' : 'transparent', color: tab === k ? '#fff' : 'var(--color-text-secondary)', position: 'relative' }}>
                            {label}
                            {k === 'photo' && !hasPhoto && <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* PROFILE */}
                    {tab === 'profile' && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Actor full name" autoFocus /></div>
                                <div className="form-group"><label className="form-label">Visibility</label>
                                    <select className="form-input" value={visibility} onChange={e => setVisibility(e.target.value)}>
                                        <option value="private">🔒 Private</option><option value="public">🌎 Public (Marketplace)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group"><label className="form-label">Description / Notes</label><textarea className="form-input" rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Acting specialty, personality, background…" style={{ resize: 'none' }} /></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <div className="form-group"><label className="form-label">Gender</label>
                                    <select className="form-input" value={gender} onChange={e => setGender(e.target.value)}>
                                        <option value="">— Select —</option>{['Male', 'Female', 'Non-binary', 'Other'].map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="form-group"><label className="form-label">Age Range</label>
                                    <select className="form-input" value={ageRange} onChange={e => setAgeRange(e.target.value)}>
                                        <option value="">— Select —</option>{['Under 18', '18-24', '25-35', '30-40', '40-50', '50-60', '60+'].map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                                <div className="form-group"><label className="form-label">Usage Fee ($/shot)</label><input className="form-input" type="number" min={0} step={0.5} value={usageFee} onChange={e => setUsageFee(parseFloat(e.target.value) || 0)} /></div>
                            </div>
                            <div className="form-group"><label className="form-label">Ethnicity / Background</label>
                                <select className="form-input" value={ethnicity} onChange={e => setEthnicity(e.target.value)}>
                                    <option value="">— Select —</option>
                                    {['East Asian', 'Southeast Asian', 'South Asian', 'Black / African', 'Middle Eastern', 'Latino / Hispanic', 'Caucasian / European', 'Mixed', 'Other'].map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                        </>
                    )}

                    {/* PHOTO */}
                    {tab === 'photo' && (
                        <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: 'var(--color-text-primary)' }}>Main Portrait Photo *</div>
                                    <ImageInputPanel value={faceUrl} onChange={setFaceUrl} basePrompt={basePrompt} gender={gender} ethnicity={ethnicity} ageRange={ageRange} />
                                </div>

                                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, color: 'var(--color-text-primary)' }}>Additional Reference Photos <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>(Optional)</span></div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>อัปโหลดหลายๆ มุมเพื่อช่วยให้ AI เรียนรู้ใบหน้าของนักแสดงคนนี้ได้ดีขึ้นเวลาเรนเดอร์ footage</div>
                                    <MultiImageUploader urls={imageUrls} onChange={setImageUrls} />
                                </div>
                            </div>

                            <div style={{ marginTop: 8, background: 'linear-gradient(135deg,#fff7ed,#fef3c7)', border: '1px solid #fbbf24', borderRadius: 12, padding: '10px 14px', fontSize: 11, color: '#92400e', lineHeight: 1.6 }}>
                                <strong>📋 Casting Reference:</strong> รูปภาพที่ดีควรเห็น <strong>ใบหน้าและรูปร่างชัดเจน</strong> — หน้าตรง แสงสม่ำเสมอ ไม่มีเสื้อผ้าปิดบัง เพื่อให้ประเมินนักแสดงได้ง่าย
                            </div>
                        </>
                    )}

                    {/* AI PROMPT */}
                    {tab === 'prompt' && (
                        <>
                            <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                                <strong>🤖 Base Prompt</strong> — อธิบายรูปลักษณ์นักแสดงสำหรับ AI generation ใน shot ต่างๆ ยิ่งละเอียดยิ่งดี
                            </div>
                            <div className="form-group">
                                <label className="form-label">Appearance Prompt</label>
                                <textarea className="form-input" rows={5} value={basePrompt} onChange={e => setBasePrompt(e.target.value)}
                                    placeholder="e.g. A tall woman with long dark wavy hair, warm brown eyes, olive skin, high cheekbones, slim athletic build, expressive face, defined jawline"
                                    style={{ resize: 'vertical', lineHeight: 1.7 }} />
                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>💡 ระบุ ทรงผม สีตา ผิวพรรณ รูปร่าง ลักษณะใบหน้าที่โดดเด่น — จะถูกนำไปใช้ใน AI Generate photo ด้วย</div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Negative Prompt</label>
                                <textarea className="form-input" rows={2} value={negPrompt} onChange={e => setNegPrompt(e.target.value)} placeholder="blurry, deformed, cartoon, anime, unrealistic" style={{ resize: 'none', fontFamily: 'monospace', fontSize: 11 }} />
                            </div>
                            {(gender || ageRange || ethnicity || basePrompt) && (
                                <div style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 14px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', marginBottom: 6 }}>✨ AI Casting Prompt Preview</div>
                                    <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.7, fontStyle: 'italic' }}>
                                        {[gender, ageRange, ethnicity, basePrompt, 'studio portrait, face clearly visible, natural lighting, plain background, realistic, casting reference'].filter(Boolean).join(', ')}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    {/* LoRA */}
                    {tab === 'lora' && (
                        <>
                            <div style={{ background: 'var(--color-surface-2)', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                                <strong>🧠 LoRA Model (Low-Rank Adaptation)</strong> — อัปโหลดไฟล์โมเดลใบหน้านักแสดงคนนี้โดยเฉพาะ เพื่อความเป๊ะสูงสุดเวลา Generate วิดีโอ
                            </div>
                            <div className="form-group">
                                <label className="form-label">LoRA File (.safetensors / .ckpt)</label>
                                <LoRAUploader value={loraUrl} onChange={setLoraUrl} />
                            </div>

                            {/* Train Section */}
                            {!loraUrl && (
                                <div style={{ marginTop: 20, padding: 20, background: 'var(--color-surface-2)', borderRadius: 16, border: '1px solid var(--color-border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Train New LoRA</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16, lineHeight: 1.5 }}>
                                        สร้างโมเดล LoRA เฉพาะตัวจากรูปถ่าย {imageUrls.length} รูปที่คุณอัปโหลดไว้<br />
                                        (ต้องการรูปถ่ายใบหน้าอย่างน้อย 5-10 รูปเพื่อผลลัพธ์ที่ดี)
                                    </div>

                                    {trainingStatus === 'training' ? (
                                        <div style={{ padding: '12px', background: 'linear-gradient(90deg,#7c3aed,#db2777)', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                            <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                            TRAINING IN PROGRESS... (25%)
                                        </div>
                                    ) : (
                                        <button className="btn btn-primary" onClick={startTraining} disabled={training || !actor} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', justifyContent: 'center' }}>
                                            {training ? 'Starting Training...' : '🚀 Start Training from Photos'}
                                        </button>
                                    )}
                                    {!actor && <div style={{ fontSize: 10, color: 'var(--color-danger)', marginTop: 8 }}>* กรุณากด Save เพื่อบันทึกโปรไฟล์นักแสดงก่อนเริ่มเทรน</div>}
                                </div>
                            )}

                            <div style={{ marginTop: 12, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: 12, padding: '12px 14px', fontSize: 11, color: '#166534', lineHeight: 1.7 }}>
                                💡 <strong>Tip:</strong> หากคุณมี LoRA ของนักแสดงคนนี้อยู่แล้ว การอัปโหลดไฟล์จะช่วยให้ AI จดจำเอกลักษณ์ (Identity) ได้แม่นยำกว่าการใช้แค่ Prompt เพียงอย่างเดียวมาก
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 140 }}>
                        {saving ? 'Saving…' : actor ? 'Save Changes' : 'Create Actor'}
                    </button>
                </div>

                {/* Inline toast */}
                {toast && (
                    <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: toast.err ? 'var(--color-danger)' : '#1e293b', color: '#fff', padding: '9px 20px', borderRadius: 10, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 10, animation: 'slideUp 200ms ease' }}>
                        {toast.msg}
                    </div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function ActorsPage() {
    const { t: toast, show: notify } = useToast();
    const [actors, setActors] = useState<ActorRead[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterGender, setFilterGender] = useState('');
    const [filterVis, setFilterVis] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingActor, setEditingActor] = useState<ActorRead | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try { setActors(await actorService.list()); }
            catch { setActors([]); }
            setLoading(false);
        })();
    }, []);

    const handleSaved = (a: ActorRead) => {
        setActors(prev => editingActor ? prev.map(x => x.id === a.id ? a : x) : [a, ...prev]);
        setModalOpen(false); setEditingActor(null);
        notify(editingActor ? 'Actor updated!' : 'Actor created! 🎭');
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        try {
            await actorService.delete(deletingId);
            setActors(p => p.filter(a => a.id !== deletingId));
            setDeletingId(null);
            notify('Actor deleted.');
        } catch (e: any) { notify(e.message || 'Failed', true); }
    };

    const filtered = actors.filter(a => {
        if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !(a.description || '').toLowerCase().includes(search.toLowerCase())) return false;
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

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap', alignItems: 'stretch' }}>
                        {[
                            { label: 'Total', value: actors.length, color: 'var(--color-accent)' },
                            { label: 'Public', value: actors.filter(a => a.visibility === 'public').length, color: '#30d158' },
                            { label: 'Private', value: actors.filter(a => a.visibility === 'private').length, color: '#94a3b8' },
                            { label: 'Avg Score', value: (actors.reduce((s, a) => s + a.popularity_score, 0) / (actors.length || 1)).toFixed(1), color: '#ff9f0a' },
                        ].map(s => (
                            <div key={s.label} className="stat-card" style={{ flex: '1 1 120px', minWidth: 110 }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.label}</div>
                            </div>
                        ))}
                        <button className="btn btn-primary" style={{ alignSelf: 'center', marginLeft: 'auto', padding: '10px 20px' }} onClick={() => { setEditingActor(null); setModalOpen(true); }}>
                            + Add Actor
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="form-input" placeholder="🔍 Search actors…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 320 }} />
                        <select className="form-input" value={filterGender} onChange={e => setFilterGender(e.target.value)} style={{ flex: '0 0 130px' }}>
                            <option value="">All Genders</option>{['Male', 'Female', 'Non-binary', 'Other'].map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select className="form-input" value={filterVis} onChange={e => setFilterVis(e.target.value)} style={{ flex: '0 0 130px' }}>
                            <option value="">All Status</option><option value="public">Public</option><option value="private">Private</option>
                        </select>
                        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-tertiary)' }}>{filtered.length} / {actors.length}</div>
                    </div>

                    {/* Grid */}
                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 18 }}>
                            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ aspectRatio: '3/4', borderRadius: 16 }} />)}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>🎭</div>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>{actors.length === 0 ? 'No actors yet' : 'No results'}</div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 20 }}>{actors.length === 0 ? 'Add your first actor to build your cast.' : 'Try adjusting your search.'}</div>
                            {actors.length === 0 && <button className="btn btn-primary" onClick={() => { setEditingActor(null); setModalOpen(true); }}>+ Add First Actor</button>}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 18 }}>
                            {filtered.map(actor => (
                                <ActorCard key={actor.id} actor={actor}
                                    onEdit={() => { setEditingActor(actor); setModalOpen(true); }}
                                    onDelete={() => setDeletingId(actor.id)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Form Modal */}
            {modalOpen && <ActorFormModal actor={editingActor} onClose={() => { setModalOpen(false); setEditingActor(null); }} onSaved={handleSaved} />}

            {/* Delete Confirm */}
            {deletingId && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', textAlign: 'center' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Delete Actor?</div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>This will permanently delete the actor and all associated data.</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeletingId(null)}>Cancel</button>
                            <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000, background: toast.err ? 'var(--color-danger)' : '#1e293b', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 12, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', animation: 'slideUp 240ms cubic-bezier(0.34,1.56,0.64,1)' }}>{toast.msg}</div>}

            <style>{`
        .form-group{display:flex;flex-direction:column;gap:5px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%{opacity:1}50%{opacity:0.75}100%{opacity:1}}
      `}</style>
        </div>
    );
}
