'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/context/AuthContext';
import { projectService, sceneService, shotService, renderJobService, type ProjectRead, type SceneRead, type ShotRead } from '@/lib/services';
import { supabase } from '@/lib/supabase';

const PIXELS_PER_SECOND = 40;
const TRACK_HEIGHT = 70;

// Aspect ratio helper
const getAspectRatioStyle = (aspectRatio?: string) => {
    switch (aspectRatio) {
        case '9:16': return { aspectRatio: '9/16' };
        case '1:1': return { aspectRatio: '1/1' };
        case '4:3': return { aspectRatio: '4/3' };
        case '2.39:1': return { aspectRatio: '2.39/1' };
        case '21:9': return { aspectRatio: '21/9' };
        default: return { aspectRatio: '16/9' }; // default 16:9
    }
};

interface TimelineClip {
    id: string;
    shotId: string;
    groupId?: string; // Links video+audio together
    trackId: string; // 'V1', 'V2', 'A1', 'A2'
    type: 'video' | 'audio';
    url: string | null;
    startTime: number; // in seconds
    duration: number; // in seconds
    sourceStart: number; // in seconds
    transitionStart?: 'none' | 'cross_dissolve' | 'dip_black' | 'dip_white';
    transitionStartDuration?: number; // in seconds
    transitionEnd?: 'none' | 'cross_dissolve' | 'dip_black' | 'dip_white';
    transitionEndDuration?: number; // in seconds
    label: string;
    thumbnail: string | null;
    volume?: number; // 0-1, default 1
    muted?: boolean;
}

export default function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { tenantId } = useAuth();
    const [project, setProject] = useState<ProjectRead | null>(null);
    const [scenes, setScenes] = useState<SceneRead[]>([]);
    const [shots, setShots] = useState<ShotRead[]>([]);
    const [showMediaModal, setShowMediaModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [clips, setClips] = useState<TimelineClip[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Sync ref with state when user seeks or playback stops
    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    // Editing Tools State
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<'move' | 'cut'>('move');
    const [selectedTransition, setSelectedTransition] = useState<'none' | 'cross_dissolve' | 'dip_black' | 'dip_white'>('none');

    // Track visibility and mute
    const [trackVisibility, setTrackVisibility] = useState<Record<string, boolean>>({
        V1: true, V2: true, A1: true, A2: true
    });
    const [trackMute, setTrackMute] = useState<Record<string, boolean>>({
        V1: false, V2: false, A1: false, A2: false
    });

    // Zoom / Scale 
    const [scale, setScale] = useState(1);
    const pps = PIXELS_PER_SECOND * scale;

    const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
    const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const timelineRef = useRef<HTMLDivElement>(null);
    const currentTimeRef = useRef<number>(0);

    // Load waveform data for audio clips
    const loadWaveform = useCallback(async (clipId: string, url: string) => {
        if (waveforms[clipId] || !url) return;
        
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            
            const channelData = audioBuffer.getChannelData(0);
            const samples = 200; // Number of bars to display
            const blockSize = Math.floor(channelData.length / samples);
            const peaks: number[] = [];
            
            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(channelData[i * blockSize + j]);
                }
                peaks.push(sum / blockSize);
            }
            
            // Normalize
            const max = Math.max(...peaks);
            const normalized = peaks.map(p => p / (max || 1));
            
            setWaveforms(prev => ({ ...prev, [clipId]: normalized }));
        } catch (err) {
            console.error('Failed to load waveform:', err);
        }
    }, [waveforms]);

    // Load waveforms for all audio clips
    useEffect(() => {
        clips.filter(c => c.type === 'audio' && c.url && !waveforms[c.id]).forEach(clip => {
            loadWaveform(clip.id, clip.url!);
        });
    }, [clips, waveforms, loadWaveform]);

    // Initial Load
    useEffect(() => {
        if (!tenantId) return;
        (async () => {
            setLoading(true);
            try {
                const [proj, scns, shts] = await Promise.all([
                    projectService.getById(id, tenantId),
                    sceneService.listByProject(id, tenantId),
                    shotService.listByProject(id, tenantId),
                ]);
                setProject(proj);
                setScenes(scns);
                setShots(shts);

                const sortedScenes = scns.sort((a, b) => a.scene_order - b.scene_order);
                const orderedShots: ShotRead[] = [];
                for (const scene of sortedScenes) {
                    const sceneShots = shts.filter(s => s.scene_id === scene.id).sort((a, b) => a.shot_order - b.shot_order);
                    orderedShots.push(...sceneShots);
                }

                let initialClips: TimelineClip[] = [];
                if (proj.timeline_data && proj.timeline_data.clips) {
                    // Migrate: add groupId to existing clips that don't have one
                    const existingClips = proj.timeline_data.clips as TimelineClip[];
                    const shotsMap = new Map(orderedShots.map((s, i) => [s.id, i]));
                    
                    initialClips = existingClips.map((clip: TimelineClip, idx: number) => {
                        if (clip.groupId) return clip;
                        // Create groupId based on shotId
                        const shotIdx = shotsMap.get(clip.shotId) ?? idx;
                        return { ...clip, groupId: `g_${clip.shotId}_${shotIdx}` };
                    });
                } else {
                    let t = 0;
                    orderedShots.forEach((shot, i) => {
                        const dur = Math.max(1, shot.target_duration || 3);
                        const groupId = `g_${shot.id}_${i}`;
                        initialClips.push({
                            id: `v_${shot.id}_${i}`,
                            shotId: shot.id,
                            groupId,
                            trackId: 'V1',
                            type: 'video',
                            url: shot.video_url || null,
                            startTime: t,
                            duration: dur,
                            sourceStart: 0,
                            label: `S${sortedScenes.find(s => s.id === shot.scene_id)?.scene_order || 0}.${shot.shot_order}`,
                            thumbnail: shot.preview_image_url || null,
                        });
                        initialClips.push({
                            id: `a_${shot.id}_${i}`,
                            shotId: shot.id,
                            groupId,
                            trackId: 'A1',
                            type: 'audio',
                            url: shot.video_url || null,
                            startTime: t,
                            duration: dur,
                            sourceStart: 0,
                            label: `Audio ${shot.shot_order}`,
                            thumbnail: null,
                            volume: 1,
                            muted: false,
                        });
                        t += dur;
                    });
                }
                setClips(initialClips);

            } catch (err: any) {
                setError(err.message || 'Failed to load timeline.');
            } finally {
                setLoading(false);
            }
        })();
    }, [id, tenantId]);

    // --- Drag & Drop / Resize Logic ---
    // Instead of thrashing the `clips` array on every pixel move, we store active drag state
    const [dragState, setDragState] = useState<{
        clipId: string;
        action: 'move' | 'resizeLeft' | 'resizeRight';
        startX: number;
        startY: number;
        initialStart: number;
        initialDuration: number;
        initialSourceStart: number;
        initialTrack: string;
        currentStart: number;
        currentDuration: number;
        currentSourceStart: number;
        currentTrack: string;
    } | null>(null);

    const tracks = [
        { id: 'V2', type: 'video', icon: '🎬', name: 'V2' },
        { id: 'V1', type: 'video', icon: '🎬', name: 'V1' },
        { id: 'A1', type: 'audio', icon: '🎵', name: 'A1' },
        { id: 'A2', type: 'audio', icon: '🎵', name: 'A2' },
    ];

    const handlePointerDown = (e: React.PointerEvent, clip: TimelineClip, action: 'move' | 'resizeLeft' | 'resizeRight') => {
        e.preventDefault();
        e.stopPropagation();

        if (activeTool === 'cut' && action === 'move') {
            const rect = timelineRef.current?.getBoundingClientRect();
            if (!rect) return;
            const scrollLeft = timelineRef.current?.scrollLeft || 0;
            const x = (e.clientX - rect.left) + scrollLeft;
            const timeCut = x / pps;

            // Validate cut inside clip
            if (timeCut > clip.startTime + 0.1 && timeCut < clip.startTime + clip.duration - 0.1) {
                const clip1: TimelineClip = { ...clip, id: clip.id + '_' + Date.now() + 'A', duration: timeCut - clip.startTime };
                const clip2: TimelineClip = {
                    ...clip,
                    id: clip.id + '_' + Date.now() + 'B',
                    startTime: timeCut,
                    duration: clip.duration - (timeCut - clip.startTime),
                    sourceStart: clip.sourceStart + (timeCut - clip.startTime),
                    transitionStart: 'none'
                };

                setClips(prev => prev.flatMap(c => c.id === clip.id ? [clip1, clip2] : [c]));
                setSelectedClipId(null);
            }
            return;
        }

        setSelectedClipId(clip.id);
        setSelectedTransition(clip.transitionStart || 'none'); // Default to showing start trans for simplicity in UI, but handled individually now

        if (e.target instanceof Element) e.target.setPointerCapture(e.pointerId);

        setDragState({
            clipId: clip.id,
            action,
            startX: e.clientX,
            startY: e.clientY,
            initialStart: clip.startTime,
            initialDuration: clip.duration,
            initialSourceStart: clip.sourceStart,
            initialTrack: clip.trackId,
            currentStart: clip.startTime,
            currentDuration: clip.duration,
            currentSourceStart: clip.sourceStart,
            currentTrack: clip.trackId
        });
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!dragState) return;

        const deltaX = e.clientX - dragState.startX;
        const deltaSeconds = deltaX / pps;

        let newStart = dragState.initialStart;
        let newDur = dragState.initialDuration;
        let newSourceStart = dragState.initialSourceStart;
        let newTrack = dragState.initialTrack;

        if (dragState.action === 'move') {
            newStart = Math.max(0, dragState.initialStart + deltaSeconds);

            // Allow vertical track switching if moving
            const deltaY = e.clientY - dragState.startY;
            const trackOffset = Math.round(deltaY / TRACK_HEIGHT);
            if (trackOffset !== 0) {
                const clipType = clips.find(c => c.id === dragState.clipId)?.type;
                const compatibleTracks = tracks.filter(t => t.type === clipType);
                const currentIndex = compatibleTracks.findIndex(t => t.id === dragState.initialTrack);
                const nextIndex = Math.max(0, Math.min(compatibleTracks.length - 1, currentIndex + trackOffset));
                newTrack = compatibleTracks[nextIndex].id;
            }
        } else if (dragState.action === 'resizeLeft') {
            const maxDeltaShrink = dragState.initialDuration - 0.01;
            const maxDeltaExpand = -dragState.initialSourceStart; // can only expand until sourceStart is 0
            const actualDelta = Math.max(maxDeltaExpand, Math.min(maxDeltaShrink, deltaSeconds));

            // Cannot push start before 0
            const allowedDelta = Math.max(-dragState.initialStart, actualDelta);
            newStart = dragState.initialStart + allowedDelta;
        } else if (dragState.action === 'resizeRight') {
            newDur = Math.max(0.01, dragState.initialDuration + deltaSeconds);
        }

        // Apply magnetic snapping (bypass if holding Shift key)
        if (!e.shiftKey) {
            const SNAP_TOLERANCE = 0.08; // 80ms snapping window
            if (Math.abs(newStart - currentTime) < SNAP_TOLERANCE) {
                if (dragState.action === 'move') newStart = currentTime;
                if (dragState.action === 'resizeLeft') {
                    const snapDelta = currentTime - dragState.initialStart;
                    if (dragState.initialSourceStart + snapDelta >= 0 && currentTime >= 0) newStart = currentTime;
                }
            }
            if (Math.abs(newStart) < SNAP_TOLERANCE) {
                if (dragState.action === 'move') newStart = 0;
                if (dragState.action === 'resizeLeft') {
                    const snapDelta = -dragState.initialStart;
                    if (dragState.initialSourceStart + snapDelta >= 0) newStart = 0;
                }
            }

            // Snap right edge to playhead when resizing right
            if (dragState.action === 'resizeRight') {
                const currentEnd = newStart + newDur;
                if (Math.abs(currentEnd - currentTime) < SNAP_TOLERANCE) {
                    newDur = Math.max(0.01, currentTime - newStart);
                }
            }
        }

        // Recalculate duration and source start if resizeLeft
        if (dragState.action === 'resizeLeft') {
            const change = newStart - dragState.initialStart;
            newDur = dragState.initialDuration - change;
            newSourceStart = dragState.initialSourceStart + change;
        }

        setDragState(prev => prev ? { ...prev, currentStart: newStart, currentDuration: newDur, currentSourceStart: newSourceStart, currentTrack: newTrack } : null);
    }, [dragState, pps, currentTime, tracks, clips]);

    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (dragState) {
            if (e.target instanceof Element && ('releasePointerCapture' in e.target)) {
                try { e.target.releasePointerCapture((e as any).pointerId); } catch (err) { }
            }

            setClips(prev => {
                const editedClip = prev.find(c => c.id === dragState.clipId);
                const isMove = dragState.action === 'move';
                
                // If moving (not trimming), sync paired clip with same groupId
                if (isMove && editedClip?.groupId) {
                    const deltaStart = dragState.currentStart - dragState.initialStart;
                    
                    return prev.map(c => {
                        if (c.id === dragState.clipId) {
                            return { ...c, startTime: dragState.currentStart, duration: dragState.currentDuration, sourceStart: dragState.currentSourceStart, trackId: dragState.currentTrack };
                        }
                        // Sync paired clip (same groupId)
                        if (c.groupId === editedClip.groupId && c.id !== dragState.clipId) {
                            return {
                                ...c,
                                startTime: c.startTime + deltaStart
                            };
                        }
                        return c;
                    });
                }

                // Trim mode: allow P-cut/J-cut (no sync)
                return prev.map(c => {
                    if (c.id === dragState.clipId) {
                        return { ...c, startTime: dragState.currentStart, duration: dragState.currentDuration, sourceStart: dragState.currentSourceStart, trackId: dragState.currentTrack };
                    }
                    return c;
                });
            });

            setDragState(null);
        }
    }, [dragState]);

    useEffect(() => {
        if (dragState) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            return () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
            };
        }
    }, [dragState, handlePointerMove, handlePointerUp]);

    // --- Playback Engine ---
    const playLoop = useCallback((timestamp: number) => {
        if (!isPlaying) return;

        const now = performance.now();
        
        // Use delta time from ref for smooth progression
        if (lastTimeRef.current === 0) {
            lastTimeRef.current = now;
        }
        
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        
        // Update current time from ref
        let newTime = currentTimeRef.current + delta;
        
        // Find current active clip for this time
        const activeClips = clips.filter(c => 
            c.url && 
            trackVisibility[c.trackId] !== false &&
            newTime >= c.startTime && 
            newTime < c.startTime + c.duration
        );
        
        // Sync media elements to match timeline time
        activeClips.forEach(clip => {
            if (clip.type === 'video') {
                const vid = videoRefs.current[clip.id];
                if (vid && vid.readyState >= 2) {
                    const expectedMediaTime = Math.max(0, newTime - clip.startTime) + clip.sourceStart;
                    if (Math.abs(vid.currentTime - expectedMediaTime) > 0.1) {
                        vid.currentTime = expectedMediaTime;
                    }
                    if (vid.paused) vid.play().catch(() => {});
                }
            } else {
                const aud = audioRefs.current[clip.id];
                if (aud && aud.readyState >= 2) {
                    const expectedMediaTime = Math.max(0, newTime - clip.startTime) + clip.sourceStart;
                    if (Math.abs(aud.currentTime - expectedMediaTime) > 0.1) {
                        aud.currentTime = expectedMediaTime;
                    }
                    const isTrackMuted = trackMute[clip.trackId] || false;
                    aud.volume = (clip.muted || isTrackMuted) ? 0 : (clip.volume ?? 1);
                    if (aud.paused) aud.play().catch(() => {});
                }
            }
        });

        // Pause media that's not in the current time range
        [...Object.entries(videoRefs.current), ...Object.entries(audioRefs.current)].forEach(([id, media]) => {
            if (!media) return;
            const clip = clips.find(c => c.id === id);
            if (!clip || !trackVisibility[clip.trackId]) return;
            
            const isActive = newTime >= clip.startTime && newTime < clip.startTime + clip.duration;
            if (!isActive && !media.paused) {
                media.pause();
            }
        });

        // Check max time
        const visibleClips = clips.filter(c => trackVisibility[c.trackId] !== false);
        const maxTime = Math.max(...visibleClips.map(c => c.startTime + c.duration), 5);

        if (newTime >= maxTime) {
            setIsPlaying(false);
            return;
        }

        // Update both ref and state
        currentTimeRef.current = newTime;
        setCurrentTime(newTime);

        animationRef.current = requestAnimationFrame(playLoop);
    }, [isPlaying, clips, trackVisibility, trackMute]);

    useEffect(() => {
        if (isPlaying) {
            lastTimeRef.current = performance.now();
            animationRef.current = requestAnimationFrame(playLoop);
        } else if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isPlaying, playLoop]);

    // Determine what is visible under the playhead for Video
    // We get the current active V2 clip (highest priority) or V1 clip (respecting visibility)
    const activeV2 = clips.find(c => c.type === 'video' && c.trackId === 'V2' && trackVisibility.V2 !== false && currentTime >= c.startTime && currentTime < c.startTime + c.duration);
    const activeV1 = clips.find(c => c.type === 'video' && c.trackId === 'V1' && trackVisibility.V1 !== false && currentTime >= c.startTime && currentTime < c.startTime + c.duration);

    const topVideoClip = activeV2 || activeV1 || null;

    // Find the previous clip on the same track to transition FROM (Start Transition of Top Clip)
    let prevVideoClip: TimelineClip | null = null;
    let transitionProgress = 0;
    let transitionType = 'none';
    let isTransitioningOut = false; // Is the top clip transitioning OUT right now?

    if (topVideoClip) {
        const timeSinceStart = currentTime - topVideoClip.startTime;
        const timeUntilEnd = (topVideoClip.startTime + topVideoClip.duration) - currentTime;
        const transDurationStart = topVideoClip.transitionStartDuration || 0.5;
        const transDurationEnd = topVideoClip.transitionEndDuration || 0.5;

        // 1. Check if we are at the START of the clip and it has a transitionStart
        if (timeSinceStart >= 0 && timeSinceStart < transDurationStart && topVideoClip.transitionStart && topVideoClip.transitionStart !== 'none') {
            transitionType = topVideoClip.transitionStart;
            transitionProgress = timeSinceStart / transDurationStart; // 0 to 1

            if (transitionType === 'cross_dissolve') {
                // Find nearest previous clip on the SAME track
                prevVideoClip = clips.filter(c => c.type === 'video' && c.trackId === topVideoClip.trackId && c.startTime < topVideoClip.startTime)
                    .sort((a, b) => b.startTime - a.startTime)[0] || null;

                // Only cross dissolve if previous clip actually butts up against this one or overlaps
                if (prevVideoClip && (topVideoClip.startTime - (prevVideoClip.startTime + prevVideoClip.duration) > 0.1)) {
                    prevVideoClip = null; // Too much gap
                }
            }
        }
        // 2. Check if we are at the END of the clip and it has a transitionEnd
        else if (timeUntilEnd > 0 && timeUntilEnd <= transDurationEnd && topVideoClip.transitionEnd && topVideoClip.transitionEnd !== 'none') {
            isTransitioningOut = true;
            transitionType = topVideoClip.transitionEnd;
            transitionProgress = 1 - (timeUntilEnd / transDurationEnd); // 0 to 1 (0 at start of fade out, 1 at end)
        }
    }

    let dipBlackOpacity = 0;
    let dipWhiteOpacity = 0;

    if (transitionType === 'dip_black') {
        // If transitioning OUT, it goes TO black (opacity increases). If IN, it comes FROM black (opacity decreases).
        dipBlackOpacity = isTransitioningOut ? transitionProgress : (1 - transitionProgress);
    }
    if (transitionType === 'dip_white') {
        dipWhiteOpacity = isTransitioningOut ? transitionProgress : (1 - transitionProgress);
    }

    // Apply active dragging overrides to the topVideoClip if we are dragging it
    const getPlayerClip = (clip: TimelineClip | null) => {
        if (!clip) return null;
        if (clip.id === dragState?.clipId) {
            return {
                ...clip,
                startTime: dragState.currentStart,
                duration: dragState.currentDuration,
                sourceStart: dragState.currentSourceStart,
            };
        }
        return clip;
    };

    const playerVideoClip = getPlayerClip(topVideoClip);
    const prevPlayerVideoClip = getPlayerClip(prevVideoClip);

    useEffect(() => {
        if (!isPlaying) {
            Object.values(videoRefs.current).forEach(vid => {
                if (vid && !vid.paused) vid.pause();
            });
        }

        if (!playerVideoClip || !playerVideoClip.url) {
            return;
        }

        const activeVid = videoRefs.current[playerVideoClip.id];
        if (activeVid) {
            const expectedTime = Math.max(0, currentTime - playerVideoClip.startTime) + playerVideoClip.sourceStart;
            if (Math.abs(activeVid.currentTime - expectedTime) > 0.15) activeVid.currentTime = expectedTime;
            if (isPlaying && activeVid.paused) activeVid.play().catch(e => console.log("Play interrupted", e));
        }

        // Keep previous video playing if we are in cross dissolve
        if (prevPlayerVideoClip && prevPlayerVideoClip.url) {
            const prevVid = videoRefs.current[prevPlayerVideoClip.id];
            if (prevVid) {
                // Continue simulation of time for previous clip into the overlap
                const expectedTimePrev = Math.max(0, currentTime - prevPlayerVideoClip.startTime) + prevPlayerVideoClip.sourceStart;
                if (Math.abs(prevVid.currentTime - expectedTimePrev) > 0.15) prevVid.currentTime = expectedTimePrev;
                if (isPlaying && prevVid.paused) prevVid.play().catch(e => console.log("Play interrupted", e));
            }
        }

        // Pause others to be safe
        Object.entries(videoRefs.current).forEach(([id, vid]) => {
            if (vid && id !== playerVideoClip?.id && id !== prevPlayerVideoClip?.id && !vid.paused) {
                vid.pause();
            }
        });

    }, [playerVideoClip, prevPlayerVideoClip, isPlaying, currentTime]);

    // Audio Playback Sync
    useEffect(() => {
        if (!isPlaying) {
            Object.values(audioRefs.current).forEach(aud => {
                if (aud && !aud.paused) aud.pause();
            });
            return;
        }

        // Find all active audio clips at currentTime (respecting track visibility and mute)
        const activeAudioClips = clips.filter(c => 
            c.type === 'audio' && 
            c.url &&
            trackVisibility[c.trackId] !== false &&
            currentTime >= c.startTime && 
            currentTime < c.startTime + c.duration
        );

        activeAudioClips.forEach(audioClip => {
            const audioEl = audioRefs.current[audioClip.id];
            if (!audioEl) return;

            // Calculate expected time in source based on clip timing and sourceStart offset
            const expectedTime = Math.max(0, currentTime - audioClip.startTime) + audioClip.sourceStart;
            
            // Sync audio position
            if (Math.abs(audioEl.currentTime - expectedTime) > 0.15) {
                audioEl.currentTime = expectedTime;
            }
            
            // Set volume and mute (combine clip mute + track mute)
            const isTrackMuted = trackMute[audioClip.trackId] || false;
            audioEl.volume = (audioClip.muted || isTrackMuted) ? 0 : (audioClip.volume ?? 1);
            
            // Play if not playing
            if (audioEl.paused) {
                audioEl.play().catch(e => console.log("Audio play interrupted", e));
            }
        });

        // Pause audio clips that are not active or are muted
        Object.entries(audioRefs.current).forEach(([id, aud]) => {
            if (!aud) return;
            const clip = clips.find(c => c.id === id);
            if (!clip) return;
            
            const isTrackVisible = trackVisibility[clip.trackId] !== false;
            const isTrackMuted = trackMute[clip.trackId] || false;
            const isActive = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
            
            if ((!isActive || !isTrackVisible || isTrackMuted) && !aud.paused) {
                aud.pause();
            }
        });

    }, [clips, currentTime, isPlaying, trackVisibility, trackMute]);

    // --- Timeline Interaction ---
    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0 || dragState) return; // ignore right click or if dragging
        const rect = e.currentTarget.getBoundingClientRect();
        const scrollLeft = timelineRef.current?.scrollLeft || 0;
        const x = (e.clientX - rect.left) + scrollLeft;
        const newTime = Math.max(0, x / pps);
        currentTimeRef.current = newTime;
        setCurrentTime(newTime);
        
        // Also seek media elements to this position
        clips.forEach(clip => {
            if (!clip.url) return;
            const isVisible = trackVisibility[clip.trackId] !== false;
            if (!isVisible) return;
            
            if (newTime >= clip.startTime && newTime < clip.startTime + clip.duration) {
                const mediaTime = Math.max(0, newTime - clip.startTime) + clip.sourceStart;
                if (clip.type === 'video') {
                    const vid = videoRefs.current[clip.id];
                    if (vid && vid.readyState >= 2) vid.currentTime = mediaTime;
                } else {
                    const aud = audioRefs.current[clip.id];
                    if (aud && aud.readyState >= 2) aud.currentTime = mediaTime;
                }
            }
        });
    };

    // Auto-scroll
    useEffect(() => {
        if (isPlaying && timelineRef.current) {
            const playheadX = currentTime * pps;
            const scrollLeft = timelineRef.current.scrollLeft;
            const clientWidth = timelineRef.current.clientWidth;
            if (playheadX > scrollLeft + clientWidth * 0.75) {
                timelineRef.current.scrollLeft = playheadX - clientWidth * 0.25;
            }
        }
    }, [currentTime, isPlaying, pps]);

    // --- Rendering Helpers ---
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const maxTimelineTime = Math.max(...clips.map(c => c.startTime + c.duration), 60) + 10;
    const timelineWidth = maxTimelineTime * pps;

    // --- Loading / Error states ---
    // (Moved to after all hooks)
    // --- Actions ---
    const handleSaveTimeline = async () => {
        if (!tenantId) return;
        setIsSaving(true);
        try {
            await projectService.update(id, { timeline_data: { clips } }, tenantId);
        } catch (err: any) {
            console.error('Failed to save timeline:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = async () => {
        if (!tenantId || !project) return;
        setIsExporting(true);
        try {
            // First save timeline
            await projectService.update(id, { timeline_data: { clips } }, tenantId);
            
            // Create a render job for final export
            const { data: job, error: jobErr } = await supabase.from('render_jobs').insert({
                project_id: id,
                scene_id: null,
                shot_id: null,
                status: 'pending',
                job_type: 'compose_timeline',
                provider: 'ffmpeg',
                credit_cost: 0,
                preview_image_url: null,
            }).select().single();

            if (jobErr) throw new Error(jobErr.message);

            // Redirect to render jobs page
            window.location.href = '/render-jobs';
        } catch (err: any) {
            console.error('Failed to export:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDeleteSelected = () => {
        if (selectedClipId) {
            const clipToDelete = clips.find(c => c.id === selectedClipId);
            if (clipToDelete?.groupId) {
                // Delete both video and audio in the group
                setClips(prev => prev.filter(c => c.groupId !== clipToDelete.groupId));
            } else {
                setClips(prev => prev.filter(c => c.id !== selectedClipId));
            }
            setSelectedClipId(null);
        }
    };

    const handleApplyTransition = (t: 'none' | 'cross_dissolve' | 'dip_black' | 'dip_white', pos: 'start' | 'end') => {
        setSelectedTransition(t);
        if (selectedClipId) {
            setClips(prev => prev.map(c => {
                if (c.id === selectedClipId) {
                    if (pos === 'start') return { ...c, transitionStart: t };
                    if (pos === 'end') return { ...c, transitionEnd: t };
                }
                return c;
            }));
        }
    };

    const handleApplyTransitionDuration = (duration: number, pos: 'start' | 'end') => {
        if (selectedClipId && !isNaN(duration) && duration > 0.1) {
            setClips(prev => prev.map(c => {
                if (c.id === selectedClipId) {
                    if (pos === 'start') return { ...c, transitionStartDuration: duration };
                    if (pos === 'end') return { ...c, transitionEndDuration: duration };
                }
                return c;
            }));
        }
    };

    // Audio controls
    const handleVolumeChange = (volume: number) => {
        if (selectedClipId) {
            setClips(prev => prev.map(c => {
                if (c.id === selectedClipId && c.type === 'audio') {
                    return { ...c, volume, muted: volume === 0 };
                }
                return c;
            }));
        }
    };

    const handleMuteToggle = () => {
        if (selectedClipId) {
            setClips(prev => prev.map(c => {
                if (c.id === selectedClipId && c.type === 'audio') {
                    return { ...c, muted: !c.muted };
                }
                return c;
            }));
        }
    };

    const handleAddMedia = (shot: ShotRead) => {
        try {
            const scene = scenes.find(s => s.id === shot.scene_id);
            const hasMedia = shot.video_url || shot.preview_image_url;
            
            if (!hasMedia) {
                alert('This shot has no media available. Please render it first.');
                return;
            }

            const duration = Math.max(1, shot.target_duration || 3);
            const timestamp = Date.now();
            const groupId = `g_${shot.id}_${timestamp}`;
            
            const newVideoClip: TimelineClip = {
                id: `v_${shot.id}_${timestamp}`,
                shotId: shot.id,
                groupId,
                trackId: 'V1',
                type: 'video',
                url: shot.video_url || null,
                startTime: currentTime,
                duration,
                sourceStart: 0,
                transitionStartDuration: 0.5,
                transitionEndDuration: 0.5,
                label: `S${scene?.scene_order || 0}.${shot.shot_order}`,
                thumbnail: shot.preview_image_url || null,
            };

            const newAudioClip: TimelineClip = {
                id: `a_${shot.id}_${timestamp}`,
                shotId: shot.id,
                groupId,
                trackId: 'A1',
                type: 'audio',
                url: shot.video_url || null,
                startTime: currentTime,
                duration,
                sourceStart: 0,
                label: `S${scene?.scene_order || 0}.${shot.shot_order} Audio`,
                thumbnail: null,
                volume: 1,
                muted: false,
            };

            console.log('Adding clips:', newVideoClip, newAudioClip);
            setClips([...clips, newVideoClip, newAudioClip]);
            setShowMediaModal(false);
        } catch (err) {
            console.error('Error adding clip:', err);
            alert('Failed to add clip');
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            
            const maxTime = Math.max(...clips.map(c => c.startTime + c.duration), 5);
            
            // Arrow keys: 1 frame (~33ms) or 100ms with shift
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const step = e.shiftKey ? 0.1 : 0.033;
                const newTime = Math.max(0, currentTimeRef.current - step);
                currentTimeRef.current = newTime;
                setCurrentTime(newTime);
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const step = e.shiftKey ? 0.1 : 0.033;
                const newTime = Math.min(maxTime, currentTimeRef.current + step);
                currentTimeRef.current = newTime;
                setCurrentTime(newTime);
            }
            
            // < / , : go back 1 frame, Shift+< : go back 10 frames - also moves selected clip
            if (e.key === '<' || e.key === ',') {
                e.preventDefault();
                const step = e.shiftKey ? 0.33 : 0.033; // 10 frames or 1 frame
                
                // If clip is selected, move the clip
                if (selectedClipId && activeTool === 'move') {
                    setClips(prev => {
                        const clip = prev.find(c => c.id === selectedClipId);
                        if (!clip) return prev;
                        
                        const newStart = Math.max(0, clip.startTime - step);
                        const delta = newStart - clip.startTime;
                        
                        return prev.map(c => {
                            if (c.id === selectedClipId) {
                                return { ...c, startTime: newStart };
                            }
                            // Also move paired clip (same groupId)
                            if (c.groupId === clip.groupId && c.id !== selectedClipId) {
                                return { ...c, startTime: Math.max(0, c.startTime + delta) };
                            }
                            return c;
                        });
                    });
                } else {
                    // Just move playhead
                    const newTime = Math.max(0, currentTimeRef.current - step);
                    currentTimeRef.current = newTime;
                    setCurrentTime(newTime);
                }
            }
            
            // > / . : go forward 1 frame, Shift+> : go forward 10 frames - also moves selected clip
            if (e.key === '>' || e.key === '.') {
                e.preventDefault();
                const step = e.shiftKey ? 0.33 : 0.033; // 10 frames or 1 frame
                
                // If clip is selected, move the clip
                if (selectedClipId && activeTool === 'move') {
                    setClips(prev => {
                        const clip = prev.find(c => c.id === selectedClipId);
                        if (!clip) return prev;
                        
                        const newStart = Math.min(maxTime - clip.duration, clip.startTime + step);
                        const delta = newStart - clip.startTime;
                        
                        return prev.map(c => {
                            if (c.id === selectedClipId) {
                                return { ...c, startTime: newStart };
                            }
                            // Also move paired clip (same groupId)
                            if (c.groupId === clip.groupId && c.id !== selectedClipId) {
                                return { ...c, startTime: c.startTime + delta };
                            }
                            return c;
                        });
                    });
                } else {
                    // Just move playhead
                    const newTime = Math.min(maxTime, currentTimeRef.current + step);
                    currentTimeRef.current = newTime;
                    setCurrentTime(newTime);
                }
            }
            
            if (e.key === 'Backspace' || e.key === 'Delete') handleDeleteSelected();
            if (e.key === 'v' || e.key === 'V') setActiveTool('move');
            if (e.key === 'c' || e.key === 'C') setActiveTool('cut');
            if (e.key === ' ') { e.preventDefault(); setIsPlaying(p => !p); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipId, activeTool, clips]);

    // --- Loading / Error states ---
    if (loading) return <div className="app-layout"><Sidebar /><div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="spinner" style={{ marginRight: 10 }} /> Loading Timeline Engine...</div></div>;
    if (error) return <div className="app-layout"><Sidebar /><div className="main-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}><div style={{ fontSize: 40 }}>⚠️</div><div style={{ color: 'var(--color-danger)' }}>{error}</div><Link href={`/projects/${id}`} className="btn btn-secondary">← Back</Link></div></div>;

    return (
        <div className="app-layout" style={{ userSelect: 'none' }}>
            <Sidebar />
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', background: '#09090b', color: '#f4f4f5', overflow: 'hidden' }}>

                {/* Navbar */}
                <div 
                    style={{ padding: '8px 20px', background: '#18181b', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 9999, position: 'relative' }}
                    onClick={() => {
                        if (showMediaModal) {
                            console.log('Closing modal via navbar click');
                            setShowMediaModal(false);
                        }
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href={`/projects/${id}`} className="btn btn-ghost btn-sm" style={{ color: '#a1a1aa', padding: '4px 8px' }}>← Project</Link>
                        <h1 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{project?.name} <span style={{ color: '#71717a', fontWeight: 500, fontSize: 11, marginLeft: 6 }}>Master Sequence</span></h1>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                        <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6, marginRight: 10 }}>
                            Zoom:
                            <input type="range" min="0.5" max="3" step="0.1" value={scale} onChange={e => setScale(parseFloat(e.target.value))} style={{ width: 80, accentColor: 'var(--color-accent)' }} />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Opening modal, shots:', shots.length);
                                    setShowMediaModal(true);
                                }} 
                                className="btn btn-secondary btn-sm" 
                                style={{ padding: '6px 16px', background: '#27272a', borderColor: '#3f3f46', color: '#fff' }}
                            >
                                + Add Clip
                            </button>
                            {showMediaModal && (
                                <div 
                                    style={{ 
                                        position: 'fixed', 
                                        top: 60, 
                                        right: 20, 
                                        width: 320, 
                                        background: '#fafafa', 
                                        border: '1px solid #ccc', 
                                        borderRadius: 8, 
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.6)', 
                                        zIndex: 99999, 
                                        maxHeight: '70vh', 
                                        overflowY: 'auto', 
                                        color: '#000'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* MODAL CONTENT */}
                                    <div style={{ padding: 12, borderBottom: '1px solid #ddd', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fafafa' }}>
                                        <span>Project Media ({shots.length} shots)</span>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowMediaModal(false);
                                            }} 
                                            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {shots.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#666', fontSize: 12 }}>No shots found.</div> : null}
                                    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {shots.map(shot => {
                                            const scene = scenes.find(sc => sc.id === shot.scene_id);
                                            const hasVideo = !!shot.video_url;
                                            const hasImage = !!shot.preview_image_url;
                                            const hasMedia = hasVideo || hasImage;
                                            const mediaType = hasVideo ? 'video' : hasImage ? 'image' : 'none';
                                            
                                            return (
                                                <div 
                                                    key={shot.id} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        console.log('Click on shot:', shot.id, 'hasMedia:', hasMedia, 'type:', mediaType);
                                                        if (hasMedia) {
                                                            handleAddMedia(shot);
                                                        }
                                                    }} 
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: 10, 
                                                        padding: 8, 
                                                        borderRadius: 4, 
                                                        cursor: hasMedia ? 'pointer' : 'not-allowed',
                                                        background: hasMedia ? '#fff' : '#f0f0f0',
                                                        opacity: hasMedia ? 1 : 0.6,
                                                        border: '1px solid #eee'
                                                    }} 
                                                >
                                                    <div style={{ width: 60, height: 34, background: '#eee', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                                                        {hasVideo && shot.preview_image_url ? (
                                                            <>
                                                                <img src={shot.preview_image_url || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                <div style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.7)', borderRadius: 2, padding: '1px 3px', fontSize: 8, color: '#fff' }}>▶</div>
                                                            </>
                                                        ) : hasImage ? (
                                                            <img src={shot.preview_image_url || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <span style={{ fontSize: 9, color: '#999' }}>No Img</span>
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            S{scene?.scene_order || 0}.{shot.shot_order}
                                                            {mediaType === 'video' && <span style={{ fontSize: 9, background: '#ef4444', color: '#fff', padding: '1px 4px', borderRadius: 2 }}>VIDEO</span>}
                                                            {mediaType === 'image' && <span style={{ fontSize: 9, background: '#3b82f6', color: '#fff', padding: '1px 4px', borderRadius: 2 }}>IMAGE</span>}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#666' }}>{shot.target_duration}s {!hasMedia && '(No Media)'}</div>
                                                    </div>
                                                    <div style={{ fontSize: 16, color: hasMedia ? '#666' : '#ccc' }}>{hasMedia ? '+' : '—'}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={handleSaveTimeline} 
                            disabled={isSaving} 
                            className="btn btn-secondary btn-sm" 
                            style={{ 
                                padding: '6px 16px',
                                background: isSaving ? '#22c55e' : '#27272a',
                                border: '1px solid #3f3f46',
                                color: '#fff',
                                cursor: isSaving ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s'
                            }}
                        >
                            {isSaving ? (
                                <>
                                    <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    💾 Save Timeline
                                </>
                            )}
                        </button>
                        <button 
                            onClick={handleExport}
                            disabled={isExporting}
                            className="btn btn-primary btn-sm" 
                            style={{ 
                                background: isExporting ? '#22c55e' : 'linear-gradient(135deg, #4f46e5, #7c3aed)', 
                                border: 'none', 
                                padding: '6px 16px',
                                cursor: isExporting ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s'
                            }}
                        >
                            {isExporting ? (
                                <>
                                    <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    🎬 Export Final
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Video Player */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#000', overflow: 'hidden' }}>
                    <div style={{ flex: 1, background: '#000', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                            {clips.filter(c => c.type === 'video' && c.url).map(clip => {
                            const isMainActive = playerVideoClip?.id === clip.id;
                            const isPrevActive = prevPlayerVideoClip?.id === clip.id;
                            const isActive = isMainActive || isPrevActive;

                            let opacity = isActive ? 1 : 0;
                            let zIndex = 1;

                            if (isMainActive) {
                                zIndex = 10;
                                if (transitionType === 'cross_dissolve') {
                                    opacity = transitionProgress; // Fade IN
                                }
                            } else if (isPrevActive) {
                                zIndex = 9; // Below main, but visible
                                if (transitionType === 'cross_dissolve') {
                                    opacity = 1 - transitionProgress; // Fade OUT
                                }
                            }

                            const hasAudioClip = !!clip.groupId && clips.some(c => c.type === 'audio' && c.groupId === clip.groupId && c.url);
                            
                            return (
                                <video
                                    key={clip.id}
                                    ref={el => { videoRefs.current[clip.id] = el; }}
                                    src={clip.url!}
                                    style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        opacity,
                                        pointerEvents: isActive ? 'auto' : 'none',
                                        zIndex
                                    }}
                                    playsInline
                                    preload="auto"
                                    muted={hasAudioClip}
                                    onClick={() => setIsPlaying(!isPlaying)}
                                />
                            );
                        })}

                        {/* Hidden Audio Elements for Playback */}
                        {clips.filter(c => c.type === 'audio' && c.url).map(clip => (
                            <audio
                                key={clip.id}
                                ref={el => { audioRefs.current[clip.id] = el; }}
                                src={clip.url!}
                                preload="auto"
                                onLoadedData={() => loadWaveform(clip.id, clip.url!)}
                            />
                        ))}

                        {dipBlackOpacity > 0 && <div style={{ position: 'absolute', inset: 0, background: 'black', opacity: dipBlackOpacity, zIndex: 15, pointerEvents: 'none' }} />}
                        {dipWhiteOpacity > 0 && <div style={{ position: 'absolute', inset: 0, background: 'white', opacity: dipWhiteOpacity, zIndex: 15, pointerEvents: 'none' }} />}

                        {playerVideoClip && !playerVideoClip.url && (
                            <div style={{ position: 'absolute', inset: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: '#000', width: '100%', height: '100%' }} onClick={() => setIsPlaying(!isPlaying)}>
                                {playerVideoClip.thumbnail ? (
                                    <img src={playerVideoClip.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Frame" />
                                ) : <div style={{ fontSize: 24, color: '#3f3f46' }}>[ Media Missing ]</div>}
                            </div>
                        )}

                        {!playerVideoClip && (
                            <div style={{ color: '#3f3f46', fontSize: 14 }}>[ No Visual Media ]</div>
                        )}

                        <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: 6, fontSize: 14, fontFamily: 'Courier Prime, monospace', fontWeight: 700, color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)', pointerEvents: 'none', zIndex: 25, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                            {formatTime(currentTime)}
                        </div>

                        {/* Audio Volume Controls - positioned above video */}
                        {selectedClipId && clips.find(c => c.id === selectedClipId)?.type === 'audio' && (
                            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: 8, border: '1px solid #27272a', zIndex: 25, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>🔊 Audio:</div>
                                <button 
                                    onClick={handleMuteToggle}
                                    style={{ width: 28, height: 28, borderRadius: 4, border: 'none', background: clips.find(c => c.id === selectedClipId)?.muted ? '#ef4444' : '#27272a', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    {clips.find(c => c.id === selectedClipId)?.muted ? '🔇' : '🔊'}
                                </button>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={clips.find(c => c.id === selectedClipId)?.volume ?? 1} 
                                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                    style={{ width: 80, accentColor: '#10b981' }}
                                />
                                <div style={{ fontSize: 10, color: '#a1a1aa', minWidth: 30 }}>
                                    {Math.round((clips.find(c => c.id === selectedClipId)?.volume ?? 1) * 100)}%
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                    <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 16, zIndex: 25 }}>
                        <button onClick={() => { currentTimeRef.current = 0; setCurrentTime(0); }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(39,39,42,0.9)', border: '1px solid #3f3f46', color: '#e4e4e7', cursor: 'pointer', fontSize: 12, backdropFilter: 'blur(4px)' }}>⏮</button>
                        <button onClick={() => setIsPlaying(!isPlaying)} style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', border: 'none', color: '#000', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: !isPlaying ? 4 : 0, boxShadow: '0 4px 12px rgba(0,0,0,0.6)', transition: 'transform 0.1s' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                            {isPlaying ? '⏸' : '▶'}
                        </button>
                    </div>
                </div>

                {/* Editor Toolbox */}
                <div style={{ height: 44, background: '#18181b', borderTop: '1px solid #27272a', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, flexShrink: 0, justifyContent: 'space-between' }}>
                    {/* Basic Tools */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                            onClick={() => setActiveTool('move')}
                            style={{ width: 32, height: 32, borderRadius: 4, border: 'none', background: activeTool === 'move' ? '#3f3f46' : 'transparent', color: activeTool === 'move' ? '#fff' : '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Selection Tool (V)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" /></svg>
                        </button>
                        <button
                            onClick={() => setActiveTool('cut')}
                            style={{ width: 32, height: 32, borderRadius: 4, border: 'none', background: activeTool === 'cut' ? '#ef4444' : 'transparent', color: activeTool === 'cut' ? '#fff' : '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Blade / Cut Tool (C)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></svg>
                        </button>
                        <div style={{ width: 1, height: 20, background: '#27272a', margin: '0 8px' }} />
                        <button
                            onClick={handleDeleteSelected}
                            style={{ width: 32, height: 32, borderRadius: 4, border: 'none', background: 'transparent', color: selectedClipId ? '#a1a1aa' : '#3f3f46', cursor: selectedClipId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Delete Selected Clip (Del)"
                            onMouseEnter={e => selectedClipId && (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={e => selectedClipId && (e.currentTarget.style.color = '#a1a1aa')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        </button>
                    </div>

                    {/* Transitions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: selectedClipId ? 1 : 0.5, pointerEvents: selectedClipId ? 'auto' : 'none' }}>

                        {/* Start Transition */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' }}>Fade IN:</div>
                            <div style={{ display: 'flex', background: '#09090b', borderRadius: 6, padding: 2, border: '1px solid #27272a' }}>
                                <button onClick={() => handleApplyTransition('none', 'start')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionStart === 'none' || !clips.find(c => c.id === selectedClipId)?.transitionStart ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>None</button>
                                <button onClick={() => handleApplyTransition('cross_dissolve', 'start')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionStart === 'cross_dissolve' ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>X-Dissolve</button>
                                <button onClick={() => handleApplyTransition('dip_black', 'start')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionStart === 'dip_black' ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>Black</button>
                                <button onClick={() => handleApplyTransition('dip_white', 'start')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionStart === 'dip_white' ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>White</button>
                                <input type="number" step="0.1" min="0.1" value={clips.find(c => c.id === selectedClipId)?.transitionStartDuration || 0.5} onChange={(e) => handleApplyTransitionDuration(parseFloat(e.target.value), 'start')} style={{ width: 44, background: '#18181b', color: '#a1a1aa', border: 'none', borderLeft: '1px solid #27272a', padding: '0 6px', fontSize: 11, outline: 'none' }} title="Duration (sec)" />
                            </div>
                        </div>

                        {/* End Transition */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' }}>Fade OUT:</div>
                            <div style={{ display: 'flex', background: '#09090b', borderRadius: 6, padding: 2, border: '1px solid #27272a' }}>
                                <button onClick={() => handleApplyTransition('none', 'end')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionEnd === 'none' || !clips.find(c => c.id === selectedClipId)?.transitionEnd ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>None</button>
                                <button onClick={() => handleApplyTransition('cross_dissolve', 'end')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionEnd === 'cross_dissolve' ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>X-Dissolve</button>
                                <button onClick={() => handleApplyTransition('dip_black', 'end')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionEnd === 'dip_black' ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>Black</button>
                                <button onClick={() => handleApplyTransition('dip_white', 'end')} style={{ background: clips.find(c => c.id === selectedClipId)?.transitionEnd === 'dip_white' ? '#3f3f46' : 'transparent', color: '#fff', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}>White</button>
                                <input type="number" step="0.1" min="0.1" value={clips.find(c => c.id === selectedClipId)?.transitionEndDuration || 0.5} onChange={(e) => handleApplyTransitionDuration(parseFloat(e.target.value), 'end')} style={{ width: 44, background: '#18181b', color: '#a1a1aa', border: 'none', borderLeft: '1px solid #27272a', padding: '0 6px', fontSize: 11, outline: 'none' }} title="Duration (sec)" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timeline UI (NLE Style) */}
                <div style={{ height: 320, background: '#18181b', borderTop: '1px solid #27272a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

                    {/* Tracks Wrapper */}
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                        {/* Headers Panel */}
                        <div style={{ width: 120, background: '#18181b', borderRight: '1px solid #27272a', display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0 }}>
                            <div style={{ height: 30, background: '#202024', borderBottom: '1px solid #27272a' }} />
                            {tracks.map(t => {
                                const isVisible = trackVisibility[t.id] !== false;
                                const isMuted = trackMute[t.id] || false;
                                const isDisabled = !isVisible || isMuted;
                                return (
                                <div key={t.id} style={{ height: TRACK_HEIGHT, borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', padding: '0 8px', background: isDisabled ? '#18181b' : '#202024', gap: 4 }}>
                                    {/* Track Toggle */}
                                    <div style={{ display: 'flex', gap: 2 }}>
                                        <button 
                                            onClick={() => setTrackVisibility(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                            title={isVisible ? 'Disable track' : 'Enable track'}
                                            style={{ 
                                                width: 20, height: 20, borderRadius: 3, border: 'none', 
                                                background: isVisible ? '#22c55e' : '#27272a', 
                                                color: isVisible ? '#fff' : '#71717a', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            ✓
                                        </button>
                                        {t.type === 'audio' && (
                                            <button 
                                                onClick={() => setTrackMute(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                                                title={isMuted ? 'Unmute' : 'Mute'}
                                                style={{ 
                                                    width: 20, height: 20, borderRadius: 3, border: 'none', 
                                                    background: isMuted ? '#f59e0b' : '#27272a', 
                                                    color: isMuted ? '#fff' : '#71717a', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {isMuted ? '🔇' : '🔊'}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: isDisabled ? '#52525a' : '#e4e4e7', letterSpacing: 0.5 }}>
                                        <span>{t.type === 'video' ? '🎬' : '🎵'}</span>
                                        <span style={{ marginLeft: 6 }}>{t.name}</span>
                                    </div>
                                </div>
                                );
                            })}
                        </div>

                        {/* Scrolling Tracks Content */}
                        <div ref={timelineRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative', background: '#09090b', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ width: timelineWidth, position: 'relative', minHeight: '100%' }} onClick={handleTimelineClick}>

                                {/* Time Ruler Top */}
                                <div style={{ height: 30, background: '#18181b', borderBottom: '1px solid #27272a', position: 'relative', pointerEvents: 'none' }}>
                                    {[...Array(Math.ceil(maxTimelineTime / 2))].map((_, i) => (
                                        <div key={i} style={{ position: 'absolute', left: i * 2 * pps, bottom: 0, borderLeft: '1px solid #52525b', paddingLeft: 4, fontSize: 10, color: '#a1a1aa', height: 16 }}>
                                            00:{(i * 2).toString().padStart(2, '0')}
                                        </div>
                                    ))}
                                </div>

                                {/* Track Lanes */}
                                {tracks.map(t => (
                                    <div key={t.id} style={{ height: TRACK_HEIGHT, borderBottom: '1px solid #27272a', position: 'relative' }} />
                                ))}

                                {/* Clips Rendering */}
                                {clips.map(clip => {
                                    const isTrackVisible = trackVisibility[clip.trackId] !== false;
                                    const isTrackMuted = trackMute[clip.trackId] || false;
                                    
                                    const isDragging = dragState?.clipId === clip.id;
                                    const renderStart = isDragging ? dragState.currentStart : clip.startTime;
                                    const renderDur = isDragging ? dragState.currentDuration : clip.duration;
                                    const renderTrack = isDragging ? dragState.currentTrack : clip.trackId;

                                    const trackIndex = tracks.findIndex(t => t.id === renderTrack);
                                    if (trackIndex === -1) return null; // Invisible

                                    const topPos = 30 + (trackIndex * TRACK_HEIGHT) + 4; // +4 for padding

                                    const isVideo = clip.type === 'video';
                                    const bgStart = isVideo ? '#4f46e5' : '#10b981';
                                    const bgEnd = isVideo ? '#3730a3' : '#047857';

                                    return (
                                        <div key={clip.id}
                                            onPointerDown={(e) => handlePointerDown(e, clip, 'move')}
                                            style={{
                                                position: 'absolute',
                                                left: renderStart * pps,
                                                width: Math.max(2, renderDur * pps),
                                                top: topPos,
                                                height: TRACK_HEIGHT - 8,
                                                background: `linear-gradient(135deg, ${bgStart}, ${bgEnd})`,
                                                borderRadius: 4,
                                                border: `1px ${isDragging ? 'solid #fff' : selectedClipId === clip.id ? 'solid #fbbf24' : 'solid rgba(255,255,255,0.15)'}`,
                                                cursor: activeTool === 'cut' ? 'crosshair' : isDragging ? 'grabbing' : 'grab',
                                                display: 'flex',
                                                opacity: isDragging ? 0.9 : (!isTrackVisible || isTrackMuted) ? 0.35 : 1,
                                                filter: (!isTrackVisible || isTrackMuted) ? 'grayscale(60%)' : 'none',
                                                flexDirection: 'column',
                                                overflow: 'hidden',
                                                boxShadow: isDragging ? '0 10px 20px rgba(0,0,0,0.5)' : selectedClipId === clip.id ? '0 0 0 2px rgba(251,191,36,0.5)' : '0 2px 4px rgba(0,0,0,0.5)',
                                                zIndex: isDragging || selectedClipId === clip.id ? 20 : 5,
                                            }}>

                                            {/* Transition Indicator Start */}
                                            {clip.transitionStart && clip.transitionStart !== 'none' && (
                                                <div style={{ position: 'absolute', top: 0, left: 0, width: 24, bottom: 0, background: clip.transitionStart === 'dip_white' ? 'linear-gradient(90deg, #fff, transparent)' : clip.transitionStart === 'dip_black' ? 'linear-gradient(90deg, #000, transparent)' : 'linear-gradient(90deg, #fbbf24, transparent)', opacity: 0.8, pointerEvents: 'none', zIndex: 11 }} />
                                            )}

                                            {/* Transition Indicator End */}
                                            {clip.transitionEnd && clip.transitionEnd !== 'none' && (
                                                <div style={{ position: 'absolute', top: 0, right: 0, width: 24, bottom: 0, background: clip.transitionEnd === 'dip_white' ? 'linear-gradient(270deg, #fff, transparent)' : clip.transitionEnd === 'dip_black' ? 'linear-gradient(270deg, #000, transparent)' : 'linear-gradient(270deg, #fbbf24, transparent)', opacity: 0.8, pointerEvents: 'none', zIndex: 11 }} />
                                            )}

                                            {/* Resize Handles */}
                                            <div onPointerDown={(e) => handlePointerDown(e, clip, 'resizeLeft')} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, cursor: 'w-resize', zIndex: 10, background: 'linear-gradient(90deg, rgba(255,255,255,0.3), transparent)' }} />
                                            <div onPointerDown={(e) => handlePointerDown(e, clip, 'resizeRight')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: 'e-resize', zIndex: 10, background: 'linear-gradient(270deg, rgba(255,255,255,0.3), transparent)' }} />

                                            {/* Thumbnails (Video only) */}
                                            {isVideo && clip.thumbnail && (
                                                <div style={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none', display: 'flex' }}>
                                                    <img src={clip.thumbnail} style={{ height: '100%', objectFit: 'cover' }} />
                                                </div>
                                            )}

                                            {/* Audio Waveform with Volume */}
                                            {!isVideo && (
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                                                    {/* Volume indicator bar */}
                                                    <div style={{ height: 6, background: '#065f46', width: '100%', position: 'relative' }}>
                                                        <div 
                                                            style={{ 
                                                                height: '100%', 
                                                                width: `${(clip.volume ?? 1) * 100}%`, 
                                                                background: clip.muted ? '#ef4444' : '#10b981',
                                                                transition: 'width 0.2s'
                                                            }} 
                                                        />
                                                    </div>
                                                    {/* Waveform - scaled to clip duration */}
                                                    <div style={{ flex: 1, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 1, opacity: clip.muted ? 0.3 : 0.8, overflow: 'hidden' }}>
                                                        {(waveforms[clip.id] || []).length > 0 ? (
                                                            (() => {
                                                                const allPeaks = waveforms[clip.id];
                                                                const barsNeeded = Math.floor(renderDur * 10); // 10 bars per second
                                                                const totalPeaks = allPeaks.length;
                                                                const step = totalPeaks / barsNeeded;
                                                                
                                                                return [...Array(Math.min(barsNeeded, 100))].map((_, i) => {
                                                                    const peakIndex = Math.floor(i * step);
                                                                    const height = allPeaks[peakIndex] || 0;
                                                                    return (
                                                                        <div 
                                                                            key={i} 
                                                                            style={{ 
                                                                                flex: 1,
                                                                                height: `${Math.max(8, height * 100)}%`, 
                                                                                background: '#a7f3d0', 
                                                                                borderRadius: 1,
                                                                                opacity: (clip.volume ?? 1),
                                                                                minWidth: 1
                                                                            }} 
                                                                        />
                                                                    );
                                                                });
                                                            })()
                                                        ) : (
                                                            <div style={{ color: '#52525a', fontSize: 9, width: '100%', textAlign: 'center' }}>Loading...</div>
                                                        )}
                                                    </div>
                                                    {/* Click to adjust volume */}
                                                    <div 
                                                        style={{ 
                                                            position: 'absolute', 
                                                            inset: 0, 
                                                            cursor: 'pointer',
                                                            zIndex: 5 
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                                                            const x = e.clientX - rect.left;
                                                            const newVol = Math.max(0, Math.min(1, x / rect.width));
                                                            if (selectedClipId === clip.id) {
                                                                handleVolumeChange(newVol);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            )}

                                            {/* Label */}
                                            <div style={{ position: 'absolute', top: 4, left: 10, fontSize: 10, fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.8)', zIndex: 2, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                                                {clip.label} {!isVideo && `·${Math.round((clip.volume ?? 1) * 100)}%`}
                                                {clip.muted && ' 🔇'}
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 4, right: 10, fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', zIndex: 2, pointerEvents: 'none' }}>
                                                {renderDur.toFixed(1)}s
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Playhead Line */}
                                <div style={{ position: 'absolute', top: 0, bottom: 0, left: currentTime * pps, width: 2, background: '#ef4444', pointerEvents: 'none', zIndex: 50, boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)' }}>
                                    <div style={{ width: 14, height: 14, background: '#ef4444', position: 'absolute', top: 18, left: -6, transform: 'rotate(45deg)', borderRadius: 2 }} />
                                    <div style={{ width: 14, height: 14, background: '#ef4444', position: 'absolute', top: 0, left: -6, borderRadius: '2px 2px 0 0' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            <style>{`
                .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
