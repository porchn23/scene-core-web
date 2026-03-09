'use client';
import { useState, useEffect, use, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Modal';
import { projectService, episodeService, sceneService, shotService, characterService, actorService, locationService } from '@/lib/services';
import { supabase } from '@/lib/supabase';
import type { ProjectRead, ProjectUpdate, EpisodeRead, EpisodeCreate, EpisodeUpdate, SceneRead, SceneCreate, SceneUpdate, ShotRead, ShotCreate, ShotUpdate, CharacterRead, ActorRead, LocationRead } from '@/lib/services';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/useToast';

// ── constants ──────────────────────────────────────────────────
const ANGLES = ['Wide', 'Medium', 'Close-up', 'Extreme Close-up', 'Low Angle', 'High Angle', 'Aerial', 'Dutch Angle', 'POV', 'Over Shoulder'];
const MOTIONS = ['Static', 'Pan L', 'Pan R', 'Tilt Up', 'Tilt Dn', 'Dolly In', 'Dolly Out', 'Track', 'Crane Up', 'Handheld', 'Whip Pan'];
const LENSES = ['14mm', '24mm', '35mm', '50mm', '85mm', '100mm', '135mm', '200mm'];
const EMOTIONS = ['Neutral', 'Happy', 'Sad', 'Angry', 'Fearful', 'Tense', 'Hopeful', 'Disgusted', 'Surprised'];
const PACINGS = ['Slow', 'Medium', 'Fast', 'Very Fast'];

// ── shot data stored in sfx_prompt as JSON ────────────────────
interface ShotScript { action: string; dialogue: DLine[]; notes: string; }
interface DLine { id: string; character: string; line: string; emotion: string; pacing: string; }
function parseShotScript(raw?: string | null): ShotScript {
    try { return { action: '', dialogue: [], notes: '', ...JSON.parse(raw ?? '{}') }; } catch { return { action: '', dialogue: [], notes: '' }; }
}
function stringifyShotScript(s: ShotScript) { return JSON.stringify(s); }

// ── helpers ────────────────────────────────────────────────────
function statusStyle(s: string) {
    const m: any = { completed: { bg: '#d1fae5', c: '#065f46' }, processing: { bg: '#fef3c7', c: '#92400e' }, ready: { bg: '#dbeafe', c: '#1e40af' }, failed: { bg: '#fee2e2', c: '#991b1b' } };
    return m[s] ?? { bg: '#f1f5f9', c: '#64748b' };
}
function isSafeUrl(url: string) {
    if (!url) return false;
    if (url.startsWith('data:')) return true;
    if (url.includes('example.com') || url.includes('placeholder')) return false;
    return true;
}

// ── Actor Avatar ───────────────────────────────────────────────
function ActorAvatar({ actor, size = 36 }: { actor?: ActorRead | null; size?: number }) {
    const [ok, setOk] = useState(false);
    useEffect(() => { setOk(false); }, [actor?.face_image_url]);
    if (!actor?.face_image_url) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4 }}>👤</div>;
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: '#f1f5f9', overflow: 'hidden', flexShrink: 0, position: 'relative', border: '1px solid rgba(0,0,0,0.05)' }}>
            <img src={actor.face_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: ok ? 1 : 0, transition: 'opacity 0.2s' }} onLoad={() => setOk(true)} />
            {!ok && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: 'rgba(255,255,255,0.4)' }}>🎭</div>}
        </div>
    );
}

// ── Highlighter ──────────────────────────────────────────────────
function ActionText({ text, characters }: { text: string; characters: CharacterRead[] }) {
    if (!text) return null;
    if (!characters || characters.length === 0) return <span>{text}</span>;
    const sorted = [...characters].filter(c => c.name.trim().length > 0).sort((a, b) => b.name.length - a.name.length);
    if (sorted.length === 0) return <span>{text}</span>;

    const escapedNames = sorted.map(c => c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(@(?:${escapedNames.join('|')}))(?![a-zA-Z0-9])`, 'gi');
    const parts = text.split(regex);

    return (
        <span style={{ whiteSpace: 'pre-wrap' }}>
            {parts.map((p, i) => {
                if (p.startsWith('@')) {
                    const name = p.slice(1);
                    const match = sorted.find(c => c.name.toLowerCase() === name.toLowerCase());
                    if (match) {
                        return (
                            <strong key={i} style={{ color: 'var(--color-accent)', fontWeight: 800, background: 'rgba(99,102,241,0.08)', padding: '0 3px', borderRadius: 4 }}>
                                {p.toUpperCase()}
                            </strong>
                        );
                    }
                }
                return p;
            })}
        </span>
    );
}


// ══════════════════════════════════════════════════════════════
//  SCREENPLAY SHOT BLOCK  — the core writing unit
// ══════════════════════════════════════════════════════════════
interface ShotBlockProps {
    shot: ShotRead;
    isActive: boolean;
    onActivate: () => void;
    onSave: (id: string, payload: ShotUpdate) => Promise<void>;
    onDelete: () => void;
    onRender: (type: 'video' | 'image') => void;
    scrollRef?: (el: HTMLDivElement | null) => void;
    characters: CharacterRead[];
    actors: ActorRead[];
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    isFirst?: boolean;
    isLast?: boolean;
}

function ShotBlock({ shot, isActive, onActivate, onSave, onDelete, onRender, scrollRef, characters, actors, onMoveUp, onMoveDown, isFirst, isLast }: ShotBlockProps) {
    const [script, setScript] = useState<ShotScript>(() => parseShotScript(shot.sfx_prompt));
    const [angle, setAngle] = useState(shot.camera_angle ?? '');
    const [motion, setMotion] = useState(shot.motion_type ?? '');
    const [lens, setLens] = useState(shot.focal_length ?? '');
    const [dur, setDur] = useState(shot.target_duration);
    const [status, setStatus] = useState(shot.status);
    const [saving, setSaving] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [actionFocused, setActionFocused] = useState(false);

    // -- Mention logic --
    const [mentionState, setMentionState] = useState<{ active: boolean; query: string; index: number }>({ active: false, query: '', index: 0 });
    const actionTextRef = useRef<HTMLTextAreaElement>(null);
    const cursorPositionRef = useRef<number>(0);

    const mentionChars = characters.filter(c => c.name.toLowerCase().includes(mentionState.query.toLowerCase()) && c.name.trim().length > 0);

    const handleActionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursorPos = e.target.selectionStart;
        cursorPositionRef.current = cursorPos;
        updateScript('action', val);

        const textBeforeCursor = val.slice(0, cursorPos);
        const match = textBeforeCursor.match(/@([a-zA-Z0-9_\u0E00-\u0E7F]*)$/);

        if (match) {
            setMentionState({ active: true, query: match[1], index: 0 });
        } else {
            setMentionState(p => ({ ...p, active: false }));
        }
    };

    const handleActionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!mentionState.active) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMentionState(p => ({ ...p, index: (p.index + 1) % mentionChars.length }));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMentionState(p => ({ ...p, index: (p.index - 1 + mentionChars.length) % mentionChars.length }));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (mentionChars.length > 0) {
                e.preventDefault();
                insertMention(mentionChars[mentionState.index].name);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setMentionState(p => ({ ...p, active: false }));
        }
    };

    const insertMention = (name: string) => {
        const textBeforeCursor = script.action.slice(0, cursorPositionRef.current);
        const textAfterCursor = script.action.slice(cursorPositionRef.current);
        const match = textBeforeCursor.match(/@([a-zA-Z0-9_\u0E00-\u0E7F]*)$/);

        if (match) {
            const matchIndex = match.index!;
            const newText = textBeforeCursor.slice(0, matchIndex) + `@${name} ` + textAfterCursor;
            updateScript('action', newText);
            setMentionState({ active: false, query: '', index: 0 });

            setTimeout(() => {
                if (actionTextRef.current) {
                    actionTextRef.current.focus();
                    const pos = matchIndex + name.length + 2;
                    actionTextRef.current.setSelectionRange(pos, pos);
                }
            }, 0);
        }
    };

    useEffect(() => { setStatus(shot.status); }, [shot.status]);

    const save = useCallback(async (overrides?: Partial<{ angle: string; motion: string; lens: string; dur: number; status: string; script: ShotScript }>) => {
        setSaving(true);
        const a = overrides?.angle ?? angle;
        const m = overrides?.motion ?? motion;
        const l = overrides?.lens ?? lens;
        const d = overrides?.dur ?? dur;
        const s = overrides?.status ?? status;
        const sc = overrides?.script ?? script;
        await onSave(shot.id, { camera_angle: a || null, motion_type: m || null, focal_length: l || null, target_duration: d, status: s, sfx_prompt: stringifyShotScript(sc) });
        setSaving(false);
    }, [angle, motion, lens, dur, status, script, onSave, shot.id]);

    const updateScript = (key: keyof ShotScript, val: any) => {
        setScript(prev => {
            const next = { ...prev, [key]: val };
            return next;
        });
    };

    const addDLine = () => updateScript('dialogue', [...script.dialogue, { id: String(Date.now()), character: '', line: '', emotion: 'Neutral', pacing: 'Medium' }]);
    const updDLine = (id: string, k: keyof DLine, v: string) => updateScript('dialogue', script.dialogue.map(d => d.id === id ? { ...d, [k]: v } : d));
    const delDLine = (id: string) => updateScript('dialogue', script.dialogue.filter(d => d.id !== id));

    const sc = statusStyle(status);

    // Auto-compose prompt
    const autoPrompt = () => {
        const parts: string[] = [];
        if (angle) parts.push(`${angle} shot`);
        if (motion && motion !== 'Static') parts.push(`${motion} camera`);
        if (lens) parts.push(`${lens} lens`);
        if (dur) parts.push(`${dur}s`);
        if (script.action) parts.push(script.action);
        if (script.dialogue.length > 0) {
            const dl = script.dialogue.map(d => `${d.character}: "${d.line}"${d.emotion !== 'Neutral' ? ` (${d.emotion})` : ''}${d.pacing !== 'Medium' ? ` — ${d.pacing} pace` : ''}`).join(' / ');
            parts.push(dl);
        }
        if (script.notes) parts.push(`Notes: ${script.notes}`);
        return parts.join('. ');
    };

    const handleDownload = useCallback(async (url: string, filename: string) => {
        try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            const burl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = burl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(burl), 10000);
        } catch (e) {
            window.open(url, '_blank');
        }
    }, []);

    const isVideoPreview = shot.preview_image_url?.match(/\.(mp4|webm|ogg|mov)$|^data:video/i);
    const hasVideo = !!shot.video_url || isVideoPreview;
    const videoUrlToPlay = shot.video_url || (isVideoPreview ? shot.preview_image_url : null);
    const [playingState, setPlayingState] = useState<{ url: string, id: string } | null>(null);

    return (
        <div ref={scrollRef} onClick={onActivate}
            style={{ marginBottom: 0, borderBottom: '1px solid var(--color-border)', background: isActive ? '#fffffe' : '#fafafa', transition: 'background 0.15s', cursor: 'text' }}
        >
            {/* ── SHOT HEADER (like a slug line for shot) ── */}
            <div style={{ display: 'flex', gap: 24, padding: '10px 24px 6px', borderTop: isActive ? '2px solid var(--color-accent)' : '2px solid transparent' }}>

                {/* Header Left (Script Side) */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <button onClick={e => { e.stopPropagation(); if (onMoveUp) onMoveUp(); }} disabled={isFirst} style={{ background: 'none', border: 'none', fontSize: 12, cursor: isFirst ? 'default' : 'pointer', opacity: isFirst ? 0.2 : 0.6, padding: 0, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>
                            <button onClick={e => { e.stopPropagation(); if (onMoveDown) onMoveDown(); }} disabled={isLast} style={{ background: 'none', border: 'none', fontSize: 12, cursor: isLast ? 'default' : 'pointer', opacity: isLast ? 0.2 : 0.6, padding: 0, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>
                        </div>
                        <span style={{ fontFamily: 'Courier Prime, Courier New, monospace', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-primary)' }}>
                            SHOT {shot.shot_order}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface-2)', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            {[angle || '—', motion || 'Static', lens || '—'].join(' · ')} · {dur}s
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {saving && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Saving…</span>}
                        <select value={status} onChange={e => { setStatus(e.target.value); save({ status: e.target.value }); }}
                            style={{ fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '2px 8px', border: '1.5px solid', borderColor: sc.bg, background: sc.bg, color: sc.c, outline: 'none', cursor: 'pointer' }}>
                            {['draft', 'ready', 'processing', 'completed', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={e => { e.stopPropagation(); setShowCamera(p => !p); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                            {showCamera ? '▲ Camera' : '📷 Camera'}
                        </button>
                        {['draft', 'completed', 'failed'].includes(status) && (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {!shot.preview_image_url?.match(/\.(mp4|webm|ogg|mov)$|^data:video/i) && (
                                    <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 10 }} onClick={e => { e.stopPropagation(); onRender('image'); }}>📸 Image</button>
                                )}
                                <button
                                    className="btn btn-primary"
                                    style={{ padding: '3px 10px', fontSize: 10, opacity: shot.preview_image_url ? 1 : 0.5, cursor: shot.preview_image_url ? 'pointer' : 'not-allowed' }}
                                    onClick={e => { e.stopPropagation(); if (shot.preview_image_url) onRender('video'); }}
                                    title={!shot.preview_image_url ? "Please render an image first" : ""}
                                    disabled={!shot.preview_image_url}
                                >
                                    ▶ Video
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Header Right (Image Side) */}
                <div style={{ width: 220, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, opacity: 0.5, padding: '0 2px' }}>×</button>
                </div>
            </div>

            {/* ── CAMERA SETUP PANEL ── */}
            {showCamera && (
                <div style={{ margin: '0 24px', padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Angle</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {ANGLES.map(a => <PillBtn key={a} label={a} active={angle === a} onClick={() => { const v = a === angle ? '' : a; setAngle(v); save({ angle: v }); }} />)}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Motion</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {MOTIONS.map(m => <PillBtn key={m} label={m} active={motion === m} onClick={() => { const v = m === motion ? '' : m; setMotion(v); save({ motion: v }); }} />)}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Lens</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {LENSES.map(l => <PillBtn key={l} label={l} active={lens === l} onClick={() => { const v = l === lens ? '' : l; setLens(v); save({ lens: v }); }} />)}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>Duration</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="range" min={1} max={60} value={dur} onChange={e => setDur(Number(e.target.value))} onMouseUp={() => save({ dur })} style={{ width: 160, accentColor: 'var(--color-accent)' }} />
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-accent)', minWidth: 24 }}>{dur}s</span>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 24, padding: '0 24px 12px' }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 24, borderRight: '1px solid var(--color-border)' }}>
                    {/* ── ACTION / DESCRIPTION ── */}
                    <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Action / Direction</div>
                        {actionFocused ? (
                            <div style={{ position: 'relative' }}>
                                <textarea
                                    ref={actionTextRef}
                                    value={script.action}
                                    onChange={handleActionChange}
                                    onKeyDown={handleActionKeyDown}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            setActionFocused(false);
                                            setMentionState(p => ({ ...p, active: false }));
                                            save({ script });
                                        }, 150);
                                    }}
                                    autoFocus
                                    placeholder="Describe the action, movement, environment, and emotional beat of this shot. What does the camera see?"
                                    rows={document.activeElement === null ? 4 : Math.max(2, script.action.split('\n').length)}
                                    style={{ width: '100%', fontFamily: 'Courier Prime, Courier New, monospace', fontSize: 13, lineHeight: 1.8, color: '#1e293b', background: 'transparent', border: 'none', outline: 'none', resize: 'vertical', boxSizing: 'border-box', letterSpacing: '0.01em', padding: 0 }}
                                />
                                {mentionState.active && mentionChars.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 150, overflowY: 'auto', minWidth: 200 }}>
                                        {mentionChars.map((c, idx) => (
                                            <div
                                                key={c.id}
                                                style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', background: idx === mentionState.index ? 'var(--color-surface-2)' : '#fff', fontWeight: idx === mentionState.index ? 700 : 400 }}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    insertMention(c.name);
                                                }}
                                            >
                                                @{c.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div onClick={() => setActionFocused(true)} style={{ width: '100%', fontFamily: 'Courier Prime, Courier New, monospace', fontSize: 13, lineHeight: 1.8, color: script.action ? '#1e293b' : '#94a3b8', border: 'none', outline: 'none', paddingBottom: 6, cursor: 'text', minHeight: 32 }}>
                                {script.action ? <ActionText text={script.action} characters={characters} /> : "Describe the action, movement, environment..."}
                            </div>
                        )}
                    </div>

                    {/* ── DIALOGUE BLOCKS ── */}
                    <div style={{ marginBottom: 8 }}>
                        {script.dialogue.map((d) => {
                            const matchedChar = characters.find(c => c.name.toUpperCase() === d.character.toUpperCase());
                            const matchedActor = matchedChar?.actor_id ? actors.find(a => a.id === matchedChar.actor_id) : undefined;

                            return (
                                <div key={d.id} style={{ marginBottom: 14, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    {/* Row 1: Avatar + Character name + delete btn */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                        <ActorAvatar actor={matchedActor} size={34} />
                                        <input
                                            value={d.character} placeholder="CHARACTER"
                                            onChange={e => updDLine(d.id, 'character', e.target.value)}
                                            onBlur={() => save({ script })}
                                            list={`chars-${shot.id}-${d.id}`}
                                            style={{ fontFamily: 'Courier Prime, Courier New, monospace', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', background: matchedChar ? 'rgba(99,102,241,0.06)' : 'transparent', border: 'none', borderBottom: matchedChar ? '2px solid var(--color-accent)' : '2px solid transparent', outline: 'none', color: '#1e293b', width: 140, borderRadius: '4px 4px 0 0', padding: '2px 6px' }}
                                        />
                                        <datalist id={`chars-${shot.id}-${d.id}`}>
                                            {characters.map(c => <option key={c.id} value={c.name.toUpperCase()} />)}
                                        </datalist>
                                        {matchedActor && (
                                            <span style={{ fontSize: 9, color: 'var(--color-accent)', fontWeight: 700, background: 'rgba(99,102,241,0.08)', padding: '1px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                                                {matchedActor.name}
                                            </span>
                                        )}
                                        <button onClick={() => { const next = { ...script, dialogue: script.dialogue.filter(x => x.id !== d.id) }; setScript(next); save({ script: next }); }} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, marginLeft: 'auto', flexShrink: 0 }}>×</button>
                                    </div>
                                    {/* Row 2: Emotion + Pacing pills */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginLeft: 44, marginBottom: 6 }}>
                                        {EMOTIONS.map(em => <PillBtn key={em} label={em} active={d.emotion === em} small onClick={() => { updDLine(d.id, 'emotion', em); save({ script }); }} />)}
                                        <span style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 3px' }} />
                                        {PACINGS.map(p => <PillBtn key={p} label={p} active={d.pacing === p} small onClick={() => { updDLine(d.id, 'pacing', p); save({ script }); }} />)}
                                    </div>
                                    {/* Row 3: Dialogue text */}
                                    <div style={{ marginLeft: 44 }}>
                                        <textarea
                                            value={d.line} placeholder="Dialogue line…"
                                            onChange={e => updDLine(d.id, 'line', e.target.value)}
                                            onBlur={() => save({ script })}
                                            rows={2}
                                            style={{ width: '100%', fontFamily: 'Courier Prime, Courier New, monospace', fontSize: 13, lineHeight: 1.8, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px dashed #e2e8f0', outline: 'none', resize: 'none', boxSizing: 'border-box', color: '#1e293b', fontStyle: 'italic' }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        <div style={{ textAlign: 'center', marginBottom: 4 }}>
                            <button onClick={e => { e.stopPropagation(); addDLine(); }}
                                style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'none', border: '1px dashed #cbd5e1', borderRadius: 99, padding: '3px 14px', cursor: 'pointer', fontFamily: 'Courier Prime, Courier New, monospace' }}>
                                + Add Dialogue
                            </button>
                        </div>
                    </div>

                    {/* ── PRODUCTION NOTES ── */}
                    <div style={{ marginBottom: 4 }}>
                        <textarea
                            value={script.notes} placeholder="Production notes: SFX, lighting, props, VFX cues…"
                            onChange={e => updateScript('notes', e.target.value)}
                            onBlur={() => save({ script })}
                            rows={1}
                            style={{ width: '100%', fontFamily: 'Courier Prime, Courier New, monospace', fontSize: 11, lineHeight: 1.6, color: '#64748b', fontStyle: 'italic', background: 'transparent', border: 'none', borderTop: '1px solid #f1f5f9', outline: 'none', resize: 'none', boxSizing: 'border-box', paddingTop: 6 }}
                        />
                    </div>

                </div>

                {/* ── PREVIEW IMAGE ── */}
                <div style={{ width: 220, flexShrink: 0, paddingBottom: 12 }}>
                    <div style={{ aspectRatio: '16/9', background: 'var(--color-surface-2)', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {shot.preview_image_url || shot.video_url ? (
                            <>
                                {isVideoPreview ? (
                                    <video src={shot.preview_image_url!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                                ) : (
                                    <img src={shot.preview_image_url || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                                {hasVideo && videoUrlToPlay && (
                                    <div
                                        onClick={(e) => { e.stopPropagation(); setPlayingState({ url: videoUrlToPlay, id: shot.id }); }}
                                        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', transition: 'background 0.2s', cursor: 'pointer' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.4)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.2)')}
                                    >
                                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transform: 'scale(1)', transition: 'transform 0.1s' }} onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.9)')} onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
                                            <div style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '11px solid #000', marginLeft: 3 }}></div>
                                        </div>
                                    </div>
                                )}
                                {(shot.preview_image_url || shot.video_url) && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const dlUrl = shot.video_url || shot.preview_image_url!;
                                            const isVid = !!shot.video_url || isVideoPreview;
                                            handleDownload(dlUrl, `shot-${shot.shot_order}-${isVid ? 'vid' : 'img'}.${isVid ? 'mp4' : 'jpg'}`);
                                        }}
                                        title="Download Asset"
                                        style={{ position: 'absolute', bottom: 8, left: 8, width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.9)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 10 }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    </button>
                                )}
                            </>
                        ) : (
                            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 11, textAlign: 'center' }}>
                                <div style={{ fontSize: 18, marginBottom: 4 }}>📸</div>
                                No Preview
                            </div>
                        )}
                        <div style={{ position: 'absolute', top: 4, right: 4, background: sc.bg, color: sc.c, borderRadius: 4, padding: '1px 5px', fontSize: 8, fontWeight: 700 }}>{shot.status}</div>
                    </div>
                </div>
            </div>

            {/* ── AI PROMPT preview (collapsed by default) ── */}
            {
                isActive && (
                    <div style={{ margin: '0 24px 12px', padding: '8px 12px', background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', marginBottom: 3 }}>✨ AI Generation Prompt</div>
                        <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.6, fontStyle: 'italic' }}>
                            {autoPrompt() || <span style={{ opacity: 0.4 }}>Fill in camera setup, action, and dialogue to compose the AI prompt.</span>}
                        </div>
                    </div>
                )
            }

            {/* Save bar */}
            {
                isActive && (
                    <div style={{ padding: '6px 24px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => save()}>
                            {saving ? 'Saving…' : 'Save Shot'}
                        </button>
                    </div>
                )
            }

            <Modal open={!!playingState} onClose={() => setPlayingState(null)} title="Preview Video" width={800}>
                <div style={{ background: '#000', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {playingState && <video src={playingState.url} style={{ width: '100%', height: '100%' }} controls autoPlay />}
                    {playingState && (
                        <button
                            onClick={() => handleDownload(playingState.url, `shot-${playingState.id}.mp4`)}
                            style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download
                        </button>
                    )}
                </div>
            </Modal>
        </div>
    );
}

function PillBtn({ label, active, small, onClick }: { label: string; active: boolean; small?: boolean; onClick: () => void; }) {
    return (
        <button type="button" onClick={e => { e.stopPropagation(); onClick(); }}
            style={{
                padding: small ? '1px 6px' : '3px 9px', borderRadius: 99, border: '1.5px solid',
                borderColor: active ? 'var(--color-accent)' : '#e2e8f0',
                background: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : '#64748b',
                fontSize: small ? 9 : 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap'
            }}>
            {label}
        </button>
    );
}

// ══════════════════════════════════════════════════════════════
// LOCATION FORM
// ══════════════════════════════════════════════════════════════
function LocationForm({ location, loading, onSubmit, onClose }: { location?: Partial<LocationRead>; loading: boolean; onSubmit: (d: any) => void; onClose: () => void; }) {
    const [name, setName] = useState(location?.name ?? '');
    const [desc, setDesc] = useState(location?.description ?? '');
    const [lighting, setLighting] = useState(location?.lighting_condition ?? '');
    const [imgUrl, setImgUrl] = useState(location?.image_reference_url ?? '');
    function submit(e: React.FormEvent) { e.preventDefault(); onSubmit({ name, description: desc || null, lighting_condition: lighting || null, image_reference_url: imgUrl || null }); }
    return (
        <form onSubmit={submit}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-field"><label className="form-label">Location Name *</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="e.g. Abandoned Warehouse" /></div>
                <div className="form-field"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the physical space..." /></div>
                <div className="form-field"><label className="form-label">Lighting Hint</label><input className="form-input" placeholder="e.g. Natural sunlight, neon, moody..." value={lighting} onChange={e => setLighting(e.target.value)} /></div>
                <div className="form-field"><label className="form-label">Reference Image URL</label><input className="form-input" type="url" value={imgUrl} onChange={e => setImgUrl(e.target.value)} placeholder="https://..." /></div>
            </div>
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : location?.id ? 'Save' : 'Create'}</button>
            </div>
        </form>
    );
}

// ══════════════════════════════════════════════════════════════
// SCENE FORM
// ══════════════════════════════════════════════════════════════
function SceneForm({ scene, nextOrder, locations, loading, onSubmit, onClose }: { scene?: Partial<SceneRead>; nextOrder: number; locations: LocationRead[]; loading: boolean; onSubmit: (d: Omit<SceneCreate, 'project_id'>) => void; onClose: () => void; }) {
    const [order, setOrder] = useState(scene?.scene_order ?? nextOrder);
    const [title, setTitle] = useState(scene?.title ?? '');
    const [setting, setSetting] = useState(scene?.setting ?? 'INT');
    const [locationId, setLocationId] = useState(scene?.location_id ?? '');
    const [tod, setTod] = useState(scene?.time_of_day ?? 'DAY');
    const [mood, setMood] = useState(scene?.mood ?? '');
    const [weather, setWeather] = useState(scene?.weather ?? '');
    const [description, setDescription] = useState(scene?.description ?? '');
    function submit(e: React.FormEvent) { e.preventDefault(); onSubmit({ scene_order: Number(order), title: title || null, setting, location_id: locationId || null, time_of_day: tod, mood: mood || null, weather: weather || null, description: description || null }); }
    return (
        <form onSubmit={submit}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-field"><label className="form-label">Scene Title</label><input className="form-input" placeholder="e.g. The Awakening (Optional)" value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 100px 1fr', gap: 10 }}>
                    <div className="form-field"><label className="form-label">Scene #</label><input className="form-input" type="number" value={order} min={1} onChange={e => setOrder(Number(e.target.value))} /></div>
                    <div className="form-field"><label className="form-label">INT / EXT</label>
                        <select className="form-input" value={setting} onChange={e => setSetting(e.target.value)}>
                            <option value="INT">INT</option>
                            <option value="EXT">EXT</option>
                            <option value="INT/EXT">INT/EXT</option>
                        </select>
                    </div>
                    <div className="form-field"><label className="form-label">Location</label>
                        <select className="form-input" value={locationId} onChange={e => setLocationId(e.target.value)}>
                            <option value="">— Generic / No assigned location —</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-field"><label className="form-label">Time of Day</label>
                        <select className="form-select" value={tod} onChange={e => setTod(e.target.value)}>
                            {['DAY', 'NIGHT', 'DUSK', 'DAWN', 'GOLDEN HOUR', 'BLUE HOUR', 'OVERCAST'].map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="form-field"><label className="form-label">Weather</label><input className="form-input" placeholder="Foggy, Rainy…" value={weather} onChange={e => setWeather(e.target.value)} /></div>
                </div>
                <div className="form-field"><label className="form-label">Mood / Atmosphere</label><input className="form-input" placeholder="Tense, Melancholic, Triumphant…" value={mood} onChange={e => setMood(e.target.value)} /></div>
                <div className="form-field"><label className="form-label">Scene Description</label><textarea className="form-input" placeholder="Describe the scene's action and events..." rows={3} value={description} onChange={e => setDescription(e.target.value)} /></div>
            </div>
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : scene?.id ? 'Save' : 'Create Scene'}</button>
            </div>
        </form>
    );
}

function EpisodeForm({ episode, nextNumber, loading, onSubmit, onClose }: { episode?: Partial<EpisodeRead>; nextNumber: number; loading: boolean; onSubmit: (d: any) => void; onClose: () => void; }) {
    const [num, setNum] = useState(episode?.episode_number ?? nextNumber);
    const [title, setTitle] = useState(episode?.title ?? '');

    function submit(e: React.FormEvent) {
        e.preventDefault();
        onSubmit({ episode_number: Number(num), title: title || `Episode ${num}` });
    }

    return (
        <form onSubmit={submit}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12 }}>
                    <div className="form-field">
                        <label className="form-label">EP #</label>
                        <input className="form-input" type="number" min={1} value={num} onChange={e => setNum(Number(e.target.value))} required />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Episode Title</label>
                        <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. The Beginning" autoFocus />
                    </div>
                </div>
            </div>
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : episode?.id ? 'Save' : 'Create'}</button>
            </div>
        </form>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { userProfile, tenantId, loading: authLoading, user } = useAuth();
    const { t: toast, show: notify } = useToast();
    const [project, setProject] = useState<ProjectRead | null>(null);
    const [scenes, setScenes] = useState<SceneRead[]>([]);
    const [episodes, setEpisodes] = useState<EpisodeRead[]>([]);
    const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | 'all'>('all');
    const [characters, setCharacters] = useState<CharacterRead[]>([]);
    const [actors, setActors] = useState<ActorRead[]>([]);
    const [locations, setLocations] = useState<LocationRead[]>([]);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState('');
    const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
    const [sceneShots, setSceneShots] = useState<Record<string, ShotRead[]>>({});
    const [loadingShots, setLoadingShots] = useState<Record<string, boolean>>({});
    const [activeShot, setActiveShot] = useState<string | null>(null);
    const [editProjectOpen, setEditProjectOpen] = useState(false);
    const [sceneModalOpen, setSceneModalOpen] = useState(false);
    const [editingScene, setEditingScene] = useState<SceneRead | null>(null);
    const [episodeModalOpen, setEpisodeModalOpen] = useState(false);
    const [editingEpisode, setEditingEpisode] = useState<EpisodeRead | null>(null);
    const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
    const [movingSceneId, setMovingSceneId] = useState<string | null>(null);
    const [deletingShotId, setDeletingShotId] = useState<string | null>(null);
    const [mutating, setMutating] = useState(false);
    const [charModalOpen, setCharModalOpen] = useState(false);
    const [editingChar, setEditingChar] = useState<CharacterRead | null>(null);
    const [deletingCharId, setDeletingCharId] = useState<string | null>(null);
    const [locModalOpen, setLocModalOpen] = useState(false);
    const [editingLoc, setEditingLoc] = useState<LocationRead | null>(null);
    const [leftTab, setLeftTab] = useState<'scenes' | 'characters'>('scenes');
    const [castModalSceneId, setCastModalSceneId] = useState<string | null>(null);
    const [castModalCharId, setCastModalCharId] = useState<string | null>(null);
    const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
    const shotRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const loadShotsFor = useCallback(async (sceneId: string) => {
        if (!tenantId) return;
        // Use functional state updates to avoid dependency on sceneShots/loadingShots
        setLoadingShots(p => {
            if (p[sceneId]) return p;
            (async () => {
                try {
                    const s = await shotService.listByScene(sceneId, tenantId);
                    setSceneShots(prev => ({ ...prev, [sceneId]: s.sort((a, b) => a.shot_order - b.shot_order) }));
                } catch (err) {
                    console.error('Failed to load shots:', err);
                    setSceneShots(prev => ({ ...prev, [sceneId]: [] }));
                } finally {
                    setLoadingShots(prev => ({ ...prev, [sceneId]: false }));
                }
            })();
            return { ...p, [sceneId]: true };
        });
    }, [tenantId]);

    const pickScene = useCallback((sid: string) => { setSelectedSceneId(sid); setActiveShot(null); loadShotsFor(sid); }, [loadShotsFor]);

    useEffect(() => {
        if (authLoading) return; // Keep loading true while auth is initializing

        if (!tenantId) {
            setLoading(false);
            return;
        }
        (async () => {
            setLoading(true);
            try {
                // Fetch core data first
                const [proj, sc, chars, acts, locs] = await Promise.all([
                    projectService.getById(id, tenantId),
                    sceneService.listByProject(id, tenantId),
                    characterService.listByProject(id, tenantId),
                    actorService.list(tenantId),
                    locationService.listByProject(id, tenantId),
                ]);

                setProject(proj);
                const sorted = sc.sort((a, b) => a.scene_order - b.scene_order);
                setScenes(sorted);
                setCharacters(chars);
                setActors(acts);
                setLocations(locs);

                // Fetch episodes separately
                try {
                    const ep = await episodeService.listByProject(id, tenantId);
                    setEpisodes(ep);

                    // If it's a series and we have episodes, default to first episode
                    if ((proj.project_type === 'series' || proj.project_type === 'series_episode') && ep.length > 0) {
                        setSelectedEpisodeId(ep[0].id);
                        const epScenes = sorted.filter(s => s.episode_id === ep[0].id);
                        if (epScenes.length > 0) pickScene(epScenes[0].id);
                    } else if (sorted.length > 0) {
                        pickScene(sorted[0].id);
                    }
                } catch (epError) {
                    console.error('Failed to fetch episodes:', epError);
                    if (sorted.length > 0) pickScene(sorted[0].id);
                }

            } catch (e: any) {
                console.error(e);
                setApiError(e?.detail ?? e?.message ?? 'Failed to load.');
            }
            finally { setLoading(false); }
        })();
    }, [id, tenantId, authLoading, pickScene]);

    const handleSceneSubmit = async (data: Omit<SceneCreate, 'project_id'>) => {
        setMutating(true);
        try {
            if (!tenantId) return;
            const payload = { ...data, episode_id: selectedEpisodeId !== 'all' ? selectedEpisodeId : null };
            if (editingScene) {
                const u = await sceneService.update(editingScene.id, payload as SceneUpdate, tenantId, user?.id);
                setScenes(p => p.map(s => s.id === u.id ? u : s).sort((a, b) => a.scene_order - b.scene_order));
                notify('Scene updated!');
            }
            else {
                const c = await sceneService.create({ ...payload, project_id: id } as SceneCreate, tenantId, user?.id);
                setScenes(p => [...p, c].sort((a, b) => a.scene_order - b.scene_order));
                pickScene(c.id);
                notify('Scene created!');
            }
            setSceneModalOpen(false); setEditingScene(null);
        } catch (e: any) {
            console.error(e);
            notify(e.message || 'Failed.', true);
        } finally { setMutating(false); }
    };

    const handleAddEpisode = () => {
        setEditingEpisode(null);
        setEpisodeModalOpen(true);
    };

    const handleEpisodeSubmit = async (data: EpisodeCreate | EpisodeUpdate) => {
        setMutating(true);
        try {
            if (!tenantId) return;
            if (editingEpisode) {
                const u = await episodeService.update(editingEpisode.id, data as EpisodeUpdate, tenantId, user?.id);
                setEpisodes(p => p.map(e => e.id === u.id ? u : e).sort((a, b) => a.episode_number - b.episode_number));
                notify('Episode updated!');
            } else {
                const c = await episodeService.create({ ...data, project_id: id } as EpisodeCreate, tenantId, user?.id);
                setEpisodes(p => [...p, c].sort((a, b) => a.episode_number - b.episode_number));
                setSelectedEpisodeId(c.id);
                notify('Episode added!');
            }
            setEpisodeModalOpen(false);
            setEditingEpisode(null);
        } catch {
            notify('Failed to save episode.', true);
        } finally {
            setMutating(false);
        }
    };

    const handleDeleteEpisode = async (eid: string) => {
        if (!eid || !tenantId) return;
        if (!confirm('Delete this episode? Scenes will be unassigned.')) return;
        setMutating(true);
        try {
            await episodeService.delete(eid, tenantId, user?.id);
            setEpisodes(p => p.filter(e => e.id !== eid));
            setScenes(p => p.map(s => s.episode_id === eid ? { ...s, episode_id: null } : s));
            if (selectedEpisodeId === eid) setSelectedEpisodeId('all');
            notify('Episode deleted.');
        } catch { notify('Failed.', true); } finally { setMutating(false); }
    };

    const handleDeleteScene = async () => {
        if (!deletingSceneId || !tenantId) return;
        setMutating(true);
        try { await sceneService.delete(deletingSceneId, tenantId, user?.id); setScenes(p => p.filter(s => s.id !== deletingSceneId)); if (selectedSceneId === deletingSceneId) setSelectedSceneId(null); setDeletingSceneId(null); notify('Scene deleted.'); }
        catch { notify('Failed.', true); } finally { setMutating(false); }
    };

    const handleMoveSceneSubmit = async (targetEpisodeId: string | 'none', sceneIdOverride?: string) => {
        const sid = sceneIdOverride || movingSceneId;
        if (!sid || !tenantId) return;
        setMutating(true);
        try {
            await sceneService.update(sid, { episode_id: targetEpisodeId === 'none' ? null : targetEpisodeId }, tenantId, user?.id);
            const freshScenes = await sceneService.listByProject(id, tenantId);
            setScenes(freshScenes.sort((a, b) => a.scene_order - b.scene_order));
            setMovingSceneId(null);
            notify('Scene moved successfully!');
        } catch (e: any) {
            notify(e.message || 'Failed to move scene.', true);
        } finally {
            setMutating(false);
        }
    };

    const handleLocSubmit = async (data: any) => {
        if (!tenantId) return;
        setMutating(true);
        try {
            if (editingLoc) {
                const u = await locationService.update(editingLoc.id, data, tenantId, user?.id);
                setLocations(p => p.map(l => l.id === u.id ? u : l));
                notify('Location updated!');
            }
            else {
                const c = await locationService.create({ ...data, project_id: id }, tenantId, user?.id);
                setLocations(p => [...p, c]);
                notify('Location created!');
                // Auto-assign to current scene if open
                if (selectedSceneId) {
                    const u = await sceneService.update(selectedSceneId, { location_id: c.id }, tenantId, user?.id);
                    setScenes(p => p.map(s => s.id === u.id ? u : s));
                }
            }
            setLocModalOpen(false); setEditingLoc(null);
        } catch (e: any) { notify(e.message, true); }
        finally { setMutating(false); }
    };

    const handleDeleteLoc = async (lid: string) => {
        if (!lid || !tenantId) return;
        if (!confirm('Delete this location?')) return;
        setMutating(true);
        try { await locationService.delete(lid, tenantId, user?.id); setLocations(p => p.filter(l => l.id !== lid)); notify('Location deleted.'); }
        catch (e: any) { notify(e.message, true); }
        finally { setMutating(false); }
    };

    const handleSceneStateSubmit = async (charId: string, payload: { age?: string; outfit?: string } | null) => {
        if (!castModalSceneId || !tenantId) return;
        const scene = scenes.find(s => s.id === castModalSceneId);
        if (!scene) return;
        setMutating(true);
        try {
            const nextStates = { ...(scene.character_states || {}) };
            if (payload) {
                nextStates[charId] = payload;
            } else {
                delete nextStates[charId];
            }
            const u = await sceneService.update(castModalSceneId, { character_states: nextStates as any }, tenantId, user?.id);
            setScenes(p => p.map(s => s.id === u.id ? { ...s, character_states: nextStates } : s));
            setCastModalSceneId(null); setCastModalCharId(null);
            notify('Character state updated.');
        } catch { notify('Failed to save state.', true); } finally { setMutating(false); }
    };

    const handleAddShot = async () => {
        if (!selectedSceneId || !tenantId) return;
        setMutating(true);
        try {
            const existing = sceneShots[selectedSceneId] ?? [];
            const c = await shotService.create({ scene_id: selectedSceneId, shot_order: existing.length + 1, target_duration: 5 }, tenantId, user?.id);
            setSceneShots(p => ({ ...p, [selectedSceneId]: [...(p[selectedSceneId] ?? []), c] }));
            setActiveShot(c.id);
            setTimeout(() => shotRefs.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
            notify('Shot added!');
        } catch { notify('Failed.', true); } finally { setMutating(false); }
    };

    const handleSaveShot = async (shotId: string, payload: ShotUpdate) => {
        if (!tenantId) return;
        try {
            const u = await shotService.update(shotId, payload, tenantId, user?.id);
            setSceneShots(p => ({ ...p, [u.scene_id]: (p[u.scene_id] ?? []).map(s => s.id === shotId ? u : s).sort((a, b) => a.shot_order - b.shot_order) }));
        } catch { notify('Failed to save shot.', true); }
    };

    const handleDeleteShot = async () => {
        if (!deletingShotId || !tenantId) return;
        const sceneId = Object.entries(sceneShots).find(([, shots]) => shots.some(s => s.id === deletingShotId))?.[0];
        setMutating(true);
        try {
            await shotService.delete(deletingShotId, tenantId, user?.id);
            if (sceneId) setSceneShots(p => ({ ...p, [sceneId]: p[sceneId].filter(s => s.id !== deletingShotId) }));
            if (activeShot === deletingShotId) setActiveShot(null);
            setDeletingShotId(null); notify('Shot deleted.');
        } catch { notify('Failed.', true); } finally { setMutating(false); }
    };

    const handleMoveShot = async (dir: 'up' | 'down', shotIndex: number) => {
        if (!selectedSceneId || !sceneShots[selectedSceneId]) return;
        const arr = [...sceneShots[selectedSceneId]];
        if (dir === 'up' && shotIndex > 0) {
            const temp = arr[shotIndex];
            arr[shotIndex] = arr[shotIndex - 1];
            arr[shotIndex - 1] = temp;
        } else if (dir === 'down' && shotIndex < arr.length - 1) {
            const temp = arr[shotIndex];
            arr[shotIndex] = arr[shotIndex + 1];
            arr[shotIndex + 1] = temp;
        } else {
            return;
        }

        if (!tenantId) return;
        // update orders locally
        const reordered = arr.map((s, i) => ({ ...s, shot_order: i + 1 }));
        setSceneShots(p => ({ ...p, [selectedSceneId]: reordered }));

        // save to DB in background
        setMutating(true);
        try {
            await Promise.all(reordered.map(s => shotService.update(s.id, { shot_order: s.shot_order }, tenantId, user?.id)));
        } catch {
            notify('Failed to save order', true);
        } finally {
            setMutating(false);
        }
    };

    const handleRender = async (shotId: string, type: 'video' | 'image' = 'video') => {
        if (!selectedSceneId || !tenantId) return;
        
        try {
            console.log('=== FRONTEND: Starting render ===');
            
            // 1. Create job - returns job_id immediately
            console.log('1. Calling shotService.generate()...');
            const { job_id, status } = await shotService.generate(shotId, id, selectedSceneId, tenantId, type);
            console.log('2. Got job_id:', job_id, 'status:', status);
            
            notify(`🎬 Job ${job_id.slice(0,8)} queued! (${status})`);

            // 2. Update local state
            console.log('3. Updating local state to processing...');
            setSceneShots(p => ({
                ...p,
                [selectedSceneId]: (p[selectedSceneId] || []).map(s =>
                    s.id === shotId ? { ...s, status: 'processing' } : s
                )
            }));

            // 3. Subscribe to job status changes (Realtime)
            console.log('4. Subscribing to realtime updates...');
            shotService.subscribeToJob(job_id, async (newStatus, data) => {
                console.log('5. 📡 Received status update:', newStatus);
                console.log('   Full data:', data);
                
                if (newStatus === 'completed') {
                    console.log('6. ✅ Render completed! Fetching shot data...');
                    
                    // Fetch latest shot data from DB
                    const { data: updatedShot } = await supabase
                        .from('shots')
                        .select('*')
                        .eq('id', shotId)
                        .single();
                    
                    console.log('   Updated shot:', updatedShot);
                    
                    setSceneShots(prev => ({
                        ...prev,
                        [selectedSceneId]: (prev[selectedSceneId] || []).map(s =>
                            s.id === shotId ? { 
                                ...s, 
                                status: updatedShot?.status || 'completed', 
                                preview_image_url: updatedShot?.preview_image_url || s.preview_image_url 
                            } : s
                        )
                    }));
                    notify('✅ Render completed!');
                } else if (newStatus === 'failed') {
                    console.log('6. ❌ Render failed!', data.error_log);
                    setSceneShots(prev => ({
                        ...prev,
                        [selectedSceneId]: (prev[selectedSceneId] || []).map(s =>
                            s.id === shotId ? { ...s, status: 'failed' } : s
                        )
                    }));
                    notify('❌ Render failed: ' + (data.error_log || 'Unknown error'), true);
                }
            });
        } catch (e: any) { 
            console.error('ERROR:', e); 
            notify(e.detail || e.message || 'Failed to queue render.', true); 
        }
    };

    // Character CRUD
    const handleCharSubmit = async (data: { name: string; personality_traits: string; outfit_description: string; actor_id: string }) => {
        if (!tenantId) return;
        setMutating(true);
        try {
            if (editingChar) {
                const u = await characterService.update(editingChar.id, { name: data.name, personality_traits: data.personality_traits || null, outfit_description: data.outfit_description || null, actor_id: data.actor_id || null }, tenantId, user?.id);
                setCharacters(p => p.map(c => c.id === u.id ? u : c));
                notify('Character updated!');
            } else {
                const c = await characterService.create({ name: data.name, personality_traits: data.personality_traits || null, outfit_description: data.outfit_description || null, actor_id: data.actor_id || null, project_id: id }, tenantId, user?.id);
                setCharacters(p => [...p, c]);
                notify('Character added!');
            }
            setCharModalOpen(false); setEditingChar(null);
        } catch { notify('Failed.', true); } finally { setMutating(false); }
    };

    const handleDeleteChar = async () => {
        if (!deletingCharId || !tenantId) return;
        setMutating(true);
        try {
            await characterService.delete(deletingCharId, tenantId, user?.id);
            setCharacters(p => p.filter(c => c.id !== deletingCharId));
            setDeletingCharId(null);
            notify('Character deleted.');
        }
        catch { notify('Failed.', true); } finally { setMutating(false); }
    };

    const filteredScenes = useMemo(() => {
        if (selectedEpisodeId === 'all') return scenes;
        return scenes.filter(s => s.episode_id === selectedEpisodeId);
    }, [scenes, selectedEpisodeId]);

    const selectedScene = scenes.find(s => s.id === selectedSceneId);
    const currentShots = selectedSceneId ? sceneShots[selectedSceneId] ?? [] : [];
    const isLoadingShots = !!loadingShots[selectedSceneId ?? ''];

    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
                {/* Top bar */}
                <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link href="/projects" style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 600 }}>← Projects</Link>
                        <span style={{ color: '#e2e8f0' }}>/</span>
                        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Courier Prime,Courier New,monospace' }}>{project?.name ?? '…'}</span>
                        {project && (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', background: 'var(--color-surface-2)', padding: '2px 8px', borderRadius: 4 }}>{project.aspect_ratio} · {project.project_type?.replace('_', ' ')}</span>
                                {project.genre && (
                                    <span style={{ fontSize: 10, color: '#fff', background: 'var(--color-accent)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>🎨 {project.genre}</span>
                                )}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={async () => {
                            setMutating(true);
                            try {
                                if (!tenantId) throw new Error('Tenant ID required');
                                const data: any = await projectService.getScript(id, tenantId);
                                const win = window.open('', '_blank');
                                if (!win) return;

                                const html = `
                                    <!DOCTYPE html>
                                    <html>
                                    <head>
                                        <title>Shooting Script: ${project?.name}</title>
                                        <meta charset="utf-8">
                                        <style>
                                            @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600;800&display=swap');
                                            
                                            :root { --c-text: #1a1a1a; --c-gray: #737373; --c-light: #f5f5f5; --c-border: #e5e5e5; }
                                            body { margin: 0; padding: 0; font-family: 'Courier Prime', Courier, monospace; color: var(--c-text); background: #ebecf0; line-height: 1.4; display: flex; flex-direction: column; align-items: center; }
                                            
                                            .document { max-width: 850px; width: 100%; background: #fff; margin: 40px auto; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
                                            
                                            /* Cover Page */
                                            .cover { height: 1056px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 80px; box-sizing: border-box; position: relative; page-break-after: always; }
                                            .cover-border { position: absolute; top: 40px; bottom: 40px; left: 40px; right: 40px; border: 2px solid var(--c-text); }
                                            .cover h1 { font-family: 'Inter', sans-serif; font-size: 48px; font-weight: 800; text-transform: uppercase; letter-spacing: -1px; margin: 0 0 20px; line-height: 1.1; }
                                            .cover h2 { font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 400; color: var(--c-gray); margin: 0 0 60px; max-width: 500px; line-height: 1.5; }
                                            .cover-meta { font-family: 'Inter', sans-serif; font-size: 12px; color: var(--c-gray); margin-top: auto; padding-bottom: 40px; }
                                            .cover-meta div { margin-bottom: 8px; }
                                            .cover-meta strong { color: var(--c-text); }

                                            /* Script Content */
                                            .script-pages { padding: 60px 80px; }
                                            
                                            .scene-heading { font-family: 'Inter', sans-serif; font-weight: 800; font-size: 15px; text-transform: uppercase; border-bottom: 2px solid var(--c-text); padding-bottom: 6px; margin: 60px 0 20px; letter-spacing: 0.5px; page-break-after: avoid; display: flex; gap: 10px; }
                                            .scene-order { color: var(--c-gray); }
                                            
                                            .scene-action { font-style: italic; color: #444; margin-bottom: 40px; max-width: 85%; }

                                            /* Shot Layout */
                                            .shot { display: flex; gap: 40px; margin-bottom: 40px; page-break-inside: avoid; }
                                            .shot-text { flex: 1; min-width: 0; }
                                            .shot-visual { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
                                            
                                            .shot-header { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 12px; color: var(--c-gray); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
                                            .shot-badge { background: var(--c-light); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: var(--c-text); }
                                            
                                            .action { margin-bottom: 20px; }
                                            
                                            .dialogue-wrapper { width: 85%; margin: 0 auto 20px; }
                                            .dialogue-char { text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
                                            .dialogue-emo { text-align: center; font-size: 12px; font-style: italic; color: #555; margin-bottom: 4px; }
                                            .dialogue-line { text-align: center; }
                                            
                                            .shot-note { font-size: 12px; color: var(--c-gray); border-left: 2px solid var(--c-border); padding-left: 12px; margin-top: 10px; font-style: italic; }

                                            /* Visual Box */
                                            .img-box { width: 100%; aspect-ratio: ${project?.aspect_ratio ? project.aspect_ratio.replace(':', '/') : '16/9'}; background: var(--c-light); border-radius: 6px; overflow: hidden; position: relative; border: 1px solid var(--c-border); }
                                            .img-box img { width: 100%; height: 100%; object-fit: cover; }
                                            .img-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; font-size: 11px; color: #999; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
                                            .img-overlay { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.65); color: #fff; font-family: 'Inter', sans-serif; font-size: 10px; padding: 4px 8px; border-radius: 4px; font-weight: 600; letter-spacing: 0.5px; backdrop-filter: blur(4px); }

                                            /* Watermark & Footer */
                                            .watermark { position: fixed; bottom: 20px; left: 0; right: 0; text-align: center; font-family: 'Inter', sans-serif; font-size: 10px; color: #aaa; text-transform: uppercase; letter-spacing: 2px; }

                                            /* Floating Print Actions */
                                            .print-actions { position: fixed; top: 20px; right: 20px; display: flex; gap: 10px; font-family: 'Inter', sans-serif; z-index: 100; }
                                            .btn { padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.1s; display: flex; align-items: center; gap: 8px; }
                                            .btn:active { transform: scale(0.96); }
                                            .btn-primary { background: #111; color: #fff; }
                                            .btn-secondary { background: #fff; color: #111; border: 1px solid var(--c-border); }

                                            @media print {
                                                body { background: #fff; }
                                                .document { box-shadow: none; margin: 0; max-width: none; }
                                                .print-actions { display: none; }
                                                .cover { height: 100vh; }
                                                .script-pages { padding: 0; }
                                                .watermark { position: fixed; bottom: 15px; }
                                            }
                                        </style>
                                    </head>
                                    <body>
                                        <div class="print-actions">
                                            <button class="btn btn-secondary" onclick="window.close()">Cancel</button>
                                            <button class="btn btn-primary" onclick="window.print()">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                                Print / Save PDF
                                            </button>
                                        </div>

                                        <div class="document">
                                            <!-- Cover -->
                                            <div class="cover">
                                                <div class="cover-border"></div>
                                                <div style="margin-top:auto">
                                                    <h1>${project?.name || 'Untitled Project'}</h1>
                                                    ${project?.logline ? `<h2>${project.logline}</h2>` : ''}
                                                </div>
                                                <div class="cover-meta">
                                                    <div><strong>Visual Style:</strong> ${project?.genre || 'Standard Cinematic'}</div>
                                                    <div><strong>Aspect Ratio:</strong> ${project?.aspect_ratio || '16:9'}</div>
                                                    <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                                </div>
                                            </div>

                                            <!-- Script -->
                                            <div class="script-pages">
                                                ${data.map((scene: any) => `
                                                    <div class="scene-heading">
                                                        <span class="scene-order">${String(scene.scene_order).padStart(3, '0')}.</span>
                                                        <span>${scene.setting}</span>
                                                        <span>${scene.title ? `- ${scene.title}` : ''}</span>
                                                        <span style="margin-left:auto">${scene.time_of_day}</span>
                                                    </div>
                                                    ${scene.description ? `<div class="scene-action">${scene.description}</div>` : ''}
                                                    
                                                    ${scene.shots.sort((a: any, b: any) => a.shot_order - b.shot_order).map((shot: any) => {
                                    const script = parseShotScript(shot.sfx_prompt);
                                    return `
                                                            <div class="shot">
                                                                <div class="shot-text">
                                                                    <div class="shot-header">
                                                                        Shot ${shot.shot_order}
                                                                        ${shot.camera_angle ? `<span class="shot-badge">${shot.camera_angle}</span>` : ''}
                                                                        ${shot.motion_type ? `<span class="shot-badge">${shot.motion_type}</span>` : ''}
                                                                    </div>
                                                                    
                                                                    ${script.action ? `<div class="action">${script.action}</div>` : ''}
                                                                    
                                                                    ${script.dialogue.map((d: any) => `
                                                                        <div class="dialogue-wrapper">
                                                                            <div class="dialogue-char">${d.character}</div>
                                                                            ${d.emotion && d.emotion !== 'Neutral' ? `<div class="dialogue-emo">(${d.emotion})</div>` : ''}
                                                                            <div class="dialogue-line">${d.line}</div>
                                                                        </div>
                                                                    `).join('')}
                                                                    
                                                                    ${script.notes ? `<div class="shot-note">${script.notes}</div>` : ''}
                                                                </div>
                                                                <div class="shot-visual">
                                                                    <div class="img-box">
                                                                        ${shot.preview_image_url
                                            ? `<img src="${shot.preview_image_url}" />`
                                            : `<div class="img-empty">No Reference</div>`
                                        }
                                                                        <div class="img-overlay">${shot.target_duration}s</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        `;
                                }).join('')}
                                                `).join('')}
                                            </div>
                                        </div>
                                        
                                        <div class="watermark">SceneCore AI Shooting Script · Confidential</div>
                                    </body>
                                    </html>
                                `;
                                win.document.write(html);
                                win.document.close();
                            } catch (e) { notify('Failed to export.', true); }
                        }}>📑 Export Script</button>
                        <Link href={`/projects/${id}/timeline`} className="btn btn-secondary btn-sm" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none' }}>
                            🎞️ View Timeline
                        </Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditProjectOpen(true)}>Edit Project</button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 700, margin: '0 auto', width: '100%' }}>
                        {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 8 }} />)}
                    </div>
                ) : apiError ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 36 }}>⚠️</div><div style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{apiError}</div>
                        <Link href="/projects" className="btn btn-secondary">← Back</Link>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                        {/* ===== LEFT: Scene + Characters Navigator ===== */}
                        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
                            {/* Tab switcher */}
                            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                                {(['scenes', 'characters'] as const).map(tab => (
                                    <button key={tab} onClick={() => setLeftTab(tab)}
                                        style={{ flex: 1, padding: '8px 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none', background: leftTab === tab ? 'var(--color-accent-light)' : 'transparent', color: leftTab === tab ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer', borderBottom: leftTab === tab ? '2px solid var(--color-accent)' : '2px solid transparent', transition: 'all 0.12s' }}>
                                        {tab === 'scenes' ? '🎬 Scenes' : '🎭 Cast'}
                                    </button>
                                ))}
                            </div>

                            {/* SCENES TAB */}
                            {leftTab === 'scenes' && (
                                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {(project?.project_type === 'series' || project?.project_type === 'series_episode') && (
                                        <div style={{ marginBottom: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Episodes</span>
                                                <button onClick={handleAddEpisode} style={{ fontSize: 10, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+ New EP</button>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <button
                                                    onClick={() => setSelectedEpisodeId('all')}
                                                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--color-accent-light)'; }}
                                                    onDragLeave={e => { e.currentTarget.style.background = selectedEpisodeId === 'all' ? 'var(--color-accent)' : 'transparent'; }}
                                                    onDrop={async e => {
                                                        e.preventDefault();
                                                        e.currentTarget.style.background = selectedEpisodeId === 'all' ? 'var(--color-accent)' : 'transparent';
                                                        const sid = e.dataTransfer.getData('sceneId');
                                                        if (sid) handleMoveSceneSubmit('none', sid);
                                                    }}
                                                    style={{
                                                        textAlign: 'left', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                        background: selectedEpisodeId === 'all' ? 'var(--color-accent)' : 'transparent',
                                                        color: selectedEpisodeId === 'all' ? '#fff' : 'var(--color-text-secondary)',
                                                        border: 'none', cursor: 'pointer', transition: 'background 0.2s'
                                                    }}
                                                >
                                                    📂 All Scenes
                                                </button>
                                                {episodes.map(ep => (
                                                    <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <button
                                                            onClick={() => setSelectedEpisodeId(ep.id)}
                                                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = 'var(--color-accent-light)'; }}
                                                            onDragLeave={e => { e.currentTarget.style.background = selectedEpisodeId === ep.id ? 'var(--color-accent)' : 'transparent'; }}
                                                            onDrop={async e => {
                                                                e.preventDefault();
                                                                e.currentTarget.style.background = selectedEpisodeId === ep.id ? 'var(--color-accent)' : 'transparent';
                                                                const sid = e.dataTransfer.getData('sceneId');
                                                                if (sid) handleMoveSceneSubmit(ep.id, sid);
                                                            }}
                                                            style={{
                                                                flex: 1, textAlign: 'left', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                                background: selectedEpisodeId === ep.id ? 'var(--color-accent)' : 'transparent',
                                                                color: selectedEpisodeId === ep.id ? '#fff' : 'var(--color-text-secondary)',
                                                                border: 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'background 0.2s'
                                                            }}
                                                        >
                                                            🎬 EP {ep.episode_number}: {ep.title}
                                                        </button>
                                                        <div style={{ display: 'flex', gap: 2, opacity: 0.3 }}>
                                                            <button onClick={() => { setEditingEpisode(ep); setEpisodeModalOpen(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}>✏️</button>
                                                            <button onClick={() => handleDeleteEpisode(ep.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}>✕</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {selectedEpisodeId === 'all' ? 'All Scenes' : 'Episode Scenes'}
                                        </span>
                                        <button onClick={() => { setEditingScene(null); setSceneModalOpen(true); }} style={{ fontSize: 10, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+ New Scene</button>
                                    </div>

                                    <div style={{ flex: 1, overflowY: 'auto' }}>
                                        {filteredScenes.length === 0 ? (
                                            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}>No scenes here yet.</div>
                                        ) : (
                                            filteredScenes.map((scene) => {
                                                const isActive = scene.id === selectedSceneId;
                                                return (
                                                    <div key={scene.id}
                                                        onClick={() => pickScene(scene.id)}
                                                        draggable
                                                        onDragStart={e => {
                                                            e.dataTransfer.setData('sceneId', scene.id);
                                                            e.dataTransfer.effectAllowed = 'move';
                                                        }}
                                                        style={{
                                                            padding: '9px 12px', borderRadius: 10, cursor: 'grab',
                                                            background: isActive ? 'var(--color-accent-light)' : 'transparent',
                                                            border: `1px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                                                            transition: 'all 0.12s',
                                                            marginBottom: 2
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                {scene.title && <div style={{ fontSize: 12, fontWeight: 800, color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)', marginBottom: 3 }}>{scene.title}</div>}
                                                                <div style={{ fontSize: 10, fontWeight: scene.title ? 600 : 800, color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{scene.scene_order}. {scene.setting || 'INT'}. {scene.location_id ? locations.find(l => l.id === scene.location_id)?.name : 'UNTITLED'}</div>
                                                                <div style={{ fontSize: 9, color: '#94a3b8' }}>{scene.time_of_day}{scene.mood && ` · ${scene.mood}`}</div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.5, padding: '1px 3px' }} onClick={() => { setMovingSceneId(scene.id); }} title="Move to Episode">➡️</button>
                                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.5, padding: '1px 3px' }} onClick={() => { setEditingScene(scene); setSceneModalOpen(true); }} title="Edit Scene">✏️</button>
                                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.5, padding: '1px 3px', color: 'var(--color-danger)' }} onClick={() => setDeletingSceneId(scene.id)} title="Delete Scene">🗑</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* CHARACTERS TAB */}
                            {leftTab === 'characters' && (
                                <>
                                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => { setEditingChar(null); setCharModalOpen(true); }}>+ Add</button>
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
                                        {characters.length === 0 ? (
                                            <div style={{ padding: '32px 10px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 11 }}><div style={{ fontSize: 24, marginBottom: 6 }}>🎭</div>No characters yet.</div>
                                        ) : characters.map(char => {
                                            const actor = char.actor_id ? actors.find(a => a.id === char.actor_id) : undefined;
                                            return (
                                                <div key={char.id} style={{ padding: '8px 9px', borderRadius: 9, marginBottom: 5, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <ActorAvatar actor={actor} size={32} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.name}</div>
                                                        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{actor ? actor.name : 'No actor cast'}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6, padding: '2px 3px' }} onClick={() => { setEditingChar(char); setCharModalOpen(true); }}>✏️</button>
                                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.6, padding: '2px 3px', color: 'var(--color-danger)' }} onClick={() => setDeletingCharId(char.id)}>🗑</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ===== CENTER: Screenplay Document ===== */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {selectedScene ? (
                                <>
                                    {/* Scene heading & Location info */}
                                    <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                                        <div style={{ padding: '14px 24px 10px' }}>
                                            {selectedScene.title && <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 6 }}>{selectedScene.title}</div>}
                                            <div style={{ fontFamily: 'Courier Prime,Courier New,monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1e293b', marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                                                {selectedScene.scene_order}. {selectedScene.setting || 'INT'}. {selectedScene.location_id ? locations.find(l => l.id === selectedScene.location_id)?.name : 'UNTITLED'}
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', fontFamily: 'Courier Prime,Courier New,monospace' }}>
                                                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', fontFamily: 'Courier Prime,Courier New,monospace', alignItems: 'center' }}>
                                                    <span>{selectedScene.time_of_day}</span>
                                                    {selectedScene.mood && <span>· {selectedScene.mood}</span>}
                                                    {selectedScene.weather && <span>· {selectedScene.weather}</span>}
                                                    <span style={{ color: isLoadingShots ? '#94a3b8' : 'var(--color-accent)' }}>{currentShots.length} shot{currentShots.length !== 1 ? 's' : ''}</span>
                                                    {!isLoadingShots && currentShots.some(s => s.video_url || (s.preview_image_url?.match(/\.(mp4|webm|ogg|mov)$|^data:video/i))) && (
                                                        <button
                                                            onClick={async () => {
                                                                const videos = currentShots.filter(s => s.video_url || (s.preview_image_url?.match(/\.(mp4|webm|ogg|mov)$|^data:video/i)));
                                                                notify(`Downloading ${videos.length} videos...`);
                                                                for (const v of videos) {
                                                                    const url = v.video_url || v.preview_image_url!;
                                                                    const filename = `scene-${selectedScene.scene_order}-shot-${v.shot_order}.mp4`;
                                                                    // Use individual download trick
                                                                    const resp = await fetch(url);
                                                                    const blob = await resp.blob();
                                                                    const burl = URL.createObjectURL(blob);
                                                                    const link = document.createElement('a');
                                                                    link.href = burl; link.download = filename;
                                                                    document.body.appendChild(link); link.click();
                                                                    document.body.removeChild(link);
                                                                    setTimeout(() => URL.revokeObjectURL(burl), 5000);
                                                                    await new Promise(r => setTimeout(r, 600)); // Gap to avoid browser blocking multiple downloads
                                                                }
                                                            }}
                                                            style={{ background: 'var(--color-success)', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', marginLeft: 12 }}
                                                        >
                                                            ⬇️ Download All Scene Videos
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Embedded Location Block */}
                                        {(() => {
                                            const loc = selectedScene.location_id ? locations.find(l => l.id === selectedScene.location_id) : null;
                                            return (
                                                <div style={{ margin: '0 24px 14px', padding: '12px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 10, display: 'flex', gap: 14 }}>
                                                    {loc ? (
                                                        <>
                                                            <div style={{ width: 64, height: 64, borderRadius: 8, background: '#e2e8f0', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                                                                {isSafeUrl(loc.image_reference_url || '') ? <img src={loc.image_reference_url!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Location" /> : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.5 }}>📍</div>}
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)' }}>📍 {loc.name}</div>
                                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                                        <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => { setEditingLoc(loc); setLocModalOpen(true); }}>Edit</button>
                                                                        <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 10, color: 'var(--color-danger)' }} onClick={() => handleDeleteLoc(loc.id)}>Delete</button>
                                                                    </div>
                                                                </div>
                                                                {loc.description && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{loc.description}</div>}
                                                                {loc.lighting_condition && <div style={{ fontSize: 10, fontWeight: 700, color: '#ca8a04', marginTop: 4 }}>💡 Lighting: {loc.lighting_condition}</div>}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No location specified for this scene</div>
                                                            <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => { setEditingLoc(null); setLocModalOpen(true); }}>+ Create New Location</button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Scene Action / Description */}
                                        {selectedScene.description && (
                                            <div style={{ margin: '0 24px 14px', fontSize: 13, lineHeight: 1.6, color: '#334155', fontFamily: 'Courier Prime,Courier New,monospace' }}>
                                                {selectedScene.description.split('\n').map((para, i) => (
                                                    <p key={i} style={{ marginBottom: 8 }}>
                                                        <ActionText text={para} characters={characters} />
                                                    </p>
                                                ))}
                                            </div>
                                        )}

                                        {/* Scene Character States */}
                                        <div style={{ margin: '0 24px 16px', padding: '12px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎭 Cast Details in This Scene</div>
                                                <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 10 }} onClick={() => setCastModalSceneId(selectedScene.id)}>+ Add State Override</button>
                                            </div>
                                            {selectedScene.character_states && Object.keys(selectedScene.character_states).length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {Object.entries(selectedScene.character_states).map(([cId, state]) => {
                                                        const char = characters.find(c => c.id === cId);
                                                        if (!char) return null;
                                                        return (
                                                            <div key={cId} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer', transition: 'all 0.15s' }} onClick={() => { setCastModalSceneId(selectedScene.id); setCastModalCharId(cId); }}>
                                                                <ActorAvatar actor={actors.find(a => a.id === char.actor_id)} size={28} />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>{char.name}</div>
                                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                                                                        {state.age && <span style={{ fontSize: 10, padding: '1px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 4, fontWeight: 600 }}>🕰 Age: {state.age}</span>}
                                                                        {state.outfit && <span style={{ fontSize: 10, padding: '1px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: 4, fontWeight: 600 }}>👕 {state.outfit}</span>}
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Edit ›</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>No specific character states defined for this scene. Characters will appear as their default profile.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Shot blocks — scrollable screenplay */}
                                    <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
                                        {isLoadingShots ? (
                                            <div style={{ padding: '32px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 6 }} />)}
                                            </div>
                                        ) : currentShots.length === 0 ? (
                                            <div style={{ padding: '80px 48px', textAlign: 'center', color: '#94a3b8', fontFamily: 'Courier Prime,Courier New,monospace' }}>
                                                <div style={{ fontSize: 36, marginBottom: 12 }}>_</div>
                                                <div style={{ fontSize: 13, marginBottom: 16 }}>No shots written yet.</div>
                                                <div style={{ fontSize: 11, marginBottom: 24, fontStyle: 'italic' }}>Click &quot;Add Shot&quot; to begin scripting this scene.</div>
                                                <button className="btn btn-primary" onClick={handleAddShot}>+ Add First Shot</button>
                                            </div>
                                        ) : (
                                            currentShots.map((shot, i) => (
                                                <div
                                                    key={shot.id}
                                                    draggable
                                                    onDragStart={e => {
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        e.dataTransfer.setData('shotIndex', i.toString());
                                                    }}
                                                    onDragOver={e => {
                                                        e.preventDefault();
                                                        e.dataTransfer.dropEffect = 'move';
                                                    }}
                                                    onDrop={e => {
                                                        e.preventDefault();
                                                        if (!selectedSceneId) return;
                                                        const draggedIndex = Number(e.dataTransfer.getData('shotIndex'));
                                                        if (!isNaN(draggedIndex) && draggedIndex !== i) {
                                                            const arr = [...currentShots];
                                                            const [draggedItem] = arr.splice(draggedIndex, 1);
                                                            arr.splice(i, 0, draggedItem);
                                                            const reordered = arr.map((s, idx) => ({ ...s, shot_order: idx + 1 }));
                                                            setSceneShots(p => ({ ...p, [selectedSceneId]: reordered }));
                                                            if (!tenantId) return;
                                                            setMutating(true);
                                                            Promise.all(reordered.map(s => shotService.update(s.id, { shot_order: s.shot_order }, tenantId, user?.id)))
                                                                .catch(() => notify('Failed to save order', true))
                                                                .finally(() => setMutating(false));
                                                        }
                                                    }}
                                                >
                                                    <ShotBlock
                                                        shot={shot}
                                                        isActive={activeShot === shot.id}
                                                        onActivate={() => setActiveShot(shot.id)}
                                                        onSave={handleSaveShot}
                                                        onDelete={() => setDeletingShotId(shot.id)}
                                                        onRender={(type) => handleRender(shot.id, type)}
                                                        scrollRef={el => { shotRefs.current[shot.id] = el; }}
                                                        characters={characters}
                                                        actors={actors}
                                                        isFirst={i === 0}
                                                        isLast={i === currentShots.length - 1}
                                                        onMoveUp={() => handleMoveShot('up', i)}
                                                        onMoveDown={() => handleMoveShot('down', i)}
                                                    />
                                                </div>
                                            ))
                                        )}
                                        {/* End of scene marker */}
                                        {currentShots.length > 0 && (
                                            <div style={{ padding: '24px 48px 60px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                                                <span style={{ fontFamily: 'Courier Prime,Courier New,monospace', fontSize: 11, color: '#94a3b8', letterSpacing: '0.15em' }}>— END OF SCENE {selectedScene.scene_order} —</span>
                                                <button className="btn btn-primary" onClick={handleAddShot} disabled={mutating}>
                                                    + Add Shot
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8', fontFamily: 'Courier Prime,Courier New,monospace' }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                                    <div style={{ fontSize: 13 }}>Select a scene to begin writing</div>
                                </div>
                            )}
                        </div>

                        {/* Right sidebar removed */}
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000, background: toast.err ? 'var(--color-danger)' : '#1e293b', color: '#fff', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', animation: 'slideUp 240ms cubic-bezier(0.34,1.56,0.64,1)' }}>{toast.msg}</div>}

            {/* Character Modal */}
            <Modal open={charModalOpen} onClose={() => { setCharModalOpen(false); setEditingChar(null); }} title={editingChar ? 'Edit Character' : 'Add Character'} width={500}>
                <CharacterForm char={editingChar ?? undefined} actors={actors} loading={mutating} onSubmit={handleCharSubmit} onClose={() => { setCharModalOpen(false); setEditingChar(null); }} />
            </Modal>
            <Modal open={!!deletingCharId} onClose={() => setDeletingCharId(null)} title="Delete Character" width={360}>
                <div style={{ padding: '16px 24px 20px' }}><p style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>Delete this character?</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setDeletingCharId(null)}>Cancel</button>
                        <button className="btn btn-danger" onClick={handleDeleteChar} disabled={mutating}>{mutating ? 'Deleting…' : 'Delete'}</button>
                    </div>
                </div>
            </Modal>
            <Modal open={editProjectOpen} onClose={() => setEditProjectOpen(false)} title="Edit Project">
                {project && tenantId && <EditProjectForm project={project} loading={mutating} onSubmit={async p => { setMutating(true); try { const u = await projectService.update(project.id, p, tenantId, user?.id); setProject(u); setEditProjectOpen(false); notify('Saved!'); } catch { notify('Failed.', true); } finally { setMutating(false); } }} onClose={() => setEditProjectOpen(false)} />}
            </Modal>
            <Modal open={sceneModalOpen} onClose={() => { setSceneModalOpen(false); setEditingScene(null); }} title={editingScene ? 'Edit Scene' : 'New Scene'} width={520}>
                <SceneForm scene={editingScene ?? undefined} nextOrder={scenes.length + 1} locations={locations} loading={mutating} onSubmit={handleSceneSubmit} onClose={() => { setSceneModalOpen(false); setEditingScene(null); }} />
            </Modal>
            <Modal open={episodeModalOpen} onClose={() => { setEpisodeModalOpen(false); setEditingEpisode(null); }} title={editingEpisode ? 'Edit Episode' : 'New Episode'} width={400}>
                <EpisodeForm
                    episode={editingEpisode ?? undefined}
                    nextNumber={episodes.length + 1}
                    loading={mutating}
                    onSubmit={handleEpisodeSubmit}
                    onClose={() => { setEpisodeModalOpen(false); setEditingEpisode(null); }}
                />
            </Modal>
            <Modal open={!!deletingSceneId} onClose={() => setDeletingSceneId(null)} title="Delete Scene" width={360}>
                <div style={{ padding: '16px 24px 20px' }}><p style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>Delete this scene and all shots?</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setDeletingSceneId(null)}>Cancel</button>
                        <button className="btn btn-danger" onClick={handleDeleteScene} disabled={mutating}>{mutating ? 'Deleting…' : 'Delete'}</button>
                    </div>
                </div>
            </Modal>

            <Modal open={!!movingSceneId} onClose={() => setMovingSceneId(null)} title="Move Scene to Episode" width={360}>
                <div style={{ padding: '16px 24px 20px' }}>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 12, fontSize: 13 }}>Select the destination episode for this scene. It will be moved to the end of that episode.</p>
                    <div className="form-field" style={{ marginBottom: 20 }}>
                        <select
                            className="form-input"
                            id="move_scene_select"
                            defaultValue={scenes.find(s => s.id === movingSceneId)?.episode_id || "none"}
                        >
                            <option value="none">-- No Episode (Loose Scene) --</option>
                            {episodes.map(ep => (
                                <option key={ep.id} value={ep.id}>EP {ep.episode_number}: {ep.title}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setMovingSceneId(null)}>Cancel</button>
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                const sel = document.getElementById('move_scene_select') as HTMLSelectElement;
                                if (sel) handleMoveSceneSubmit(sel.value);
                            }}
                            disabled={mutating}
                        >
                            {mutating ? 'Moving…' : 'Move Scene'}
                        </button>
                    </div>
                </div>
            </Modal>
            <Modal open={!!deletingShotId} onClose={() => setDeletingShotId(null)} title="Delete Shot" width={360}>
                <div style={{ padding: '16px 24px 20px' }}><p style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>Delete this shot permanently?</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => setDeletingShotId(null)}>Cancel</button>
                        <button className="btn btn-danger" onClick={handleDeleteShot} disabled={mutating}>{mutating ? 'Deleting…' : 'Delete'}</button>
                    </div>
                </div>
            </Modal>
            <Modal open={locModalOpen} onClose={() => { setLocModalOpen(false); setEditingLoc(null); }} title={editingLoc ? 'Edit Location' : 'New Location'} width={400}>
                <LocationForm location={editingLoc ?? undefined} loading={mutating} onSubmit={handleLocSubmit} onClose={() => { setLocModalOpen(false); setEditingLoc(null); }} />
            </Modal>

            <Modal open={!!castModalSceneId} onClose={() => { setCastModalSceneId(null); setCastModalCharId(null); }} title="Scene Character State" width={440}>
                <SceneStateForm sceneId={castModalSceneId!} defaultCharId={castModalCharId} characters={characters} scenes={scenes} loading={mutating} onSubmit={handleSceneStateSubmit} onClose={() => { setCastModalSceneId(null); setCastModalCharId(null); }} />
            </Modal>

            <Modal open={!!playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} title="Preview Video" width={800}>
                <div style={{ background: '#000', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {playingVideoUrl && <video src={playingVideoUrl} style={{ width: '100%', height: '100%' }} controls autoPlay />}
                </div>
            </Modal>

            <style>{`
        .form-field{display:flex;flex-direction:column;gap:5px}
        .form-label{font-size:10px;font-weight:700;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.06em}
        .form-input{background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:8px 11px;font-size:var(--font-size-sm);color:var(--color-text-primary);outline:none;transition:border-color .15s;font-family:inherit;width:100%;box-sizing:border-box}
        .form-input:focus{border-color:var(--color-accent);box-shadow:0 0 0 3px var(--color-accent-light)}
        .form-select{background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:8px 11px;font-size:var(--font-size-sm);color:var(--color-text-primary);outline:none;cursor:pointer;font-family:inherit;width:100%}
        @keyframes slideUp{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap');
      `}</style>
        </div>
    );
}

// ── Character Form ─────────────────────────────────────────────
function CharacterForm({ char, actors, loading, onSubmit, onClose }: {
    char?: CharacterRead; actors: ActorRead[]; loading: boolean;
    onSubmit: (d: { name: string; personality_traits: string; outfit_description: string; actor_id: string }) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(char?.name ?? '');
    const [personality, setPersonality] = useState(char?.personality_traits ?? '');
    const [outfit, setOutfit] = useState(char?.outfit_description ?? '');
    const [actorId, setActorId] = useState(char?.actor_id ?? '');
    const [actorSearch, setActorSearch] = useState('');

    const filtered = actorSearch
        ? actors.filter(a => a.name.toLowerCase().includes(actorSearch.toLowerCase()))
        : actors;

    const selectedActor = actorId ? actors.find(a => a.id === actorId) : undefined;

    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit({ name, personality_traits: personality, outfit_description: outfit, actor_id: actorId }); }}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-field">
                    <label className="form-label">Character Name</label>
                    <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. JOHN, DR. CARTER…" autoFocus style={{ fontFamily: 'Courier Prime,Courier New,monospace', textTransform: 'uppercase', fontWeight: 700 }} />
                </div>
                <div className="form-field">
                    <label className="form-label">Personality Traits</label>
                    <textarea className="form-input" value={personality} onChange={e => setPersonality(e.target.value)} placeholder="Brave, sarcastic, conflicted…" rows={2} style={{ resize: 'none' }} />
                </div>
                <div className="form-field">
                    <label className="form-label">Outfit / Appearance</label>
                    <textarea className="form-input" value={outfit} onChange={e => setOutfit(e.target.value)} placeholder="Dark trench coat, worn boots…" rows={2} style={{ resize: 'none' }} />
                </div>

                {/* Actor picker */}
                <div className="form-field">
                    <label className="form-label">Cast Actor</label>
                    {/* Selected actor preview */}
                    {selectedActor && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(99,102,241,0.07)', borderRadius: 10, border: '1.5px solid var(--color-accent)', marginBottom: 8 }}>
                            <ActorAvatar actor={selectedActor} size={40} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--color-text-primary)' }}>{selectedActor.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{selectedActor.gender} · {selectedActor.age_range}</div>
                            </div>
                            <button type="button" onClick={() => setActorId('')} style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Remove</button>
                        </div>
                    )}
                    <input className="form-input" value={actorSearch} onChange={e => setActorSearch(e.target.value)} placeholder="Search actors…" style={{ marginBottom: 6 }} />
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface-2)' }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary)' }}>No actors found</div>
                        ) : filtered.map(actor => (
                            <div key={actor.id} onClick={() => { setActorId(actor.id); setActorSearch(''); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: actorId === actor.id ? 'rgba(99,102,241,0.08)' : 'transparent', borderLeft: actorId === actor.id ? '3px solid var(--color-accent)' : '3px solid transparent', transition: 'all 0.1s' }}>
                                <ActorAvatar actor={actor} size={32} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>{actor.name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{actor.gender}{actor.age_range ? ` · ${actor.age_range}` : ''}</div>
                                </div>
                                {actorId === actor.id && <span style={{ fontSize: 16 }}>✅</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ padding: '12px 24px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>{loading ? 'Saving…' : char ? 'Save' : 'Add Character'}</button>
            </div>
        </form>
    );
}

// ── Edit Project Form ──────────────────────────────────────────
function EditProjectForm({ project, loading, onSubmit, onClose }: { project: ProjectRead; loading: boolean; onSubmit: (d: ProjectUpdate) => void; onClose: () => void; }) {
    const [name, setName] = useState(project.name);
    const [logline, setLogline] = useState(project.logline ?? '');
    const [ar, setAr] = useState(project.aspect_ratio);
    const [status, setStatus] = useState(project.status);
    const [genre, setGenre] = useState(project.genre ?? '');
    const [pt, setPt] = useState(project.project_type);

    const STYLES = [
        { id: 'marvel', name: 'Marvel Studio', img: '/styles/marvel.png' },
        { id: 'pixar', name: 'Pixar Animation', img: '/styles/pixar.png' },
        { id: 'ghibli', name: 'Studio Ghibli', img: '/styles/ghibli.png' },
        { id: 'wb', name: 'Warner Bros (Epic)', img: '/styles/wb.png' },
        { id: 'wes', name: 'Wes Anderson', img: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=200&h=110&auto=format&fit=crop' },
    ];

    return (
        <form onSubmit={e => { e.preventDefault(); onSubmit({ name, logline: logline || undefined, aspect_ratio: ar, status, genre: genre || undefined, project_type: pt }); }}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="form-field"><label className="form-label">Name</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
                <div className="form-field"><label className="form-label">Logline</label><textarea className="form-input" value={logline} onChange={e => setLogline(e.target.value)} rows={2} style={{ resize: 'none' }} /></div>

                <div className="form-field">
                    <label className="form-label">Visual Style Reference</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        <button type="button" onClick={() => setGenre('')} style={{ padding: 6, borderRadius: 8, border: '1.5px solid', borderColor: genre === '' ? 'var(--color-accent)' : 'var(--color-border)', background: genre === '' ? 'var(--color-accent-light)' : 'var(--color-surface-2)', textAlign: 'center', cursor: 'pointer' }}>
                            <div style={{ fontSize: 16, opacity: 0.5 }}>🚫</div>
                            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 2 }}>None</div>
                        </button>
                        {STYLES.map(s => (
                            <button key={s.id} type="button" onClick={() => setGenre(s.name)} style={{ padding: 3, borderRadius: 8, border: '1.5px solid', borderColor: genre === s.name ? 'var(--color-accent)' : 'var(--color-border)', background: genre === s.name ? 'var(--color-accent-light)' : 'var(--color-surface-2)', textAlign: 'left', cursor: 'pointer', overflow: 'hidden' }}>
                                <div style={{ height: 32, background: '#000', borderRadius: 4, overflow: 'hidden' }}><img src={s.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                                <div style={{ fontSize: 8, fontWeight: 800, marginTop: 2, padding: '0 2px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{s.name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-field"><label className="form-label">Project Type</label>
                        <select className="form-select" value={pt} onChange={e => setPt(e.target.value)}>
                            {['short_film', 'commercial', 'music_video', 'series_episode', 'other'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                        </select>
                    </div>
                    <div className="form-field"><label className="form-label">Aspect Ratio</label><select className="form-select" value={ar} onChange={e => setAr(e.target.value)}>{['16:9', '9:16', '4:3', '1:1', '2.39:1'].map(a => <option key={a}>{a}</option>)}</select></div>
                </div>
                <div className="form-field"><label className="form-label">Status</label><select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>{['draft', 'active', 'processing', 'completed', 'archived'].map(s => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ padding: '12px 24px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
            </div>
        </form>
    );
}
// ── Scene Character State Form ────────────────────────────────────
function SceneStateForm({ sceneId, defaultCharId, characters, scenes, loading, onSubmit, onClose }: {
    sceneId: string; defaultCharId: string | null; characters: CharacterRead[]; scenes: SceneRead[]; loading: boolean;
    onSubmit: (charId: string, payload: { age?: string; outfit?: string } | null) => void; onClose: () => void;
}) {
    const scene = scenes.find(s => s.id === sceneId);
    const existingStates = useMemo(() => scene?.character_states || {}, [scene?.character_states]);

    const getInitialAge = (cId: string) => existingStates[cId]?.age || '';
    const getInitialOutfit = (cId: string) => existingStates[cId]?.outfit || '';

    const [charId, setCharId] = useState(defaultCharId ?? '');
    const [age, setAge] = useState(getInitialAge(charId));
    const [outfit, setOutfit] = useState(getInitialOutfit(charId));

    const handleCharChange = (newCharId: string) => {
        setCharId(newCharId);
        setAge(getInitialAge(newCharId));
        setOutfit(getInitialOutfit(newCharId));
    };

    const isEdit = charId && !!existingStates[charId];

    return (
        <form onSubmit={e => { e.preventDefault(); if (charId) onSubmit(charId, { age: age || undefined, outfit: outfit || undefined }); }}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    Override character appearance specifically for this scene.
                </div>
                <div className="form-field">
                    <label className="form-label">Character</label>
                    <select className="form-select" value={charId} onChange={e => handleCharChange(e.target.value)} disabled={!!defaultCharId} required>
                        <option value="">-- Select Character --</option>
                        {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                {charId && (
                    <>
                        <div className="form-field">
                            <label className="form-label">Age / Form (Optional)</label>
                            <input className="form-input" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 5 years old, teenage form..." />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Outfit / Condition (Optional)</label>
                            <input className="form-input" value={outfit} onChange={e => setOutfit(e.target.value)} placeholder="e.g. Muddy school uniform, business suit..." />
                        </div>
                    </>
                )}
            </div>
            <div style={{ padding: '12px 24px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', alignItems: 'center' }}>
                {isEdit && <button type="button" style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} onClick={() => onSubmit(charId, null)} disabled={loading}>Remove Override</button>}
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading || !charId}>{loading ? 'Saving…' : 'Save State'}</button>
            </div>
        </form>
    );
}
