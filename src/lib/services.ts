import { supabase } from './supabase';

// Helper to prevent "undefined" string UUID errors
const validateUUID = (id: any, name: string) => {
    if (!id || id === 'undefined' || id === '[object Object]') {
        throw new Error(`Invalid ${name}: ${id}`);
    }
};

// ===================== PROJECTS =====================
export interface ProjectRead {
    id: string;
    name: string;
    logline?: string | null;
    project_type: string;
    genre?: string | null;
    aspect_ratio: string;
    resolution: string;
    tenant_id: string;
    status: string;
    created_at: string;
    updated_at: string;
    timeline_data?: any;
}

export interface ProjectCreate {
    name: string;
    logline?: string;
    project_type?: string;
    genre?: string;
    aspect_ratio?: string;
    resolution?: string;
    tenant_id: string;
}

export interface ProjectUpdate {
    name?: string;
    logline?: string;
    project_type?: string;
    genre?: string;
    aspect_ratio?: string;
    resolution?: string;
    status?: string;
    timeline_data?: any;
}

export const projectService = {
    list: async (tenantId: string, offset = 0, limit = 100): Promise<ProjectRead[]> => {
        validateUUID(tenantId, 'Tenant ID');
        let query = supabase.from('projects')
            .select('*')
            .eq('tenant_id', tenantId);

        const { data, error } = await query
            .range(offset, offset + limit - 1)
            .order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data as ProjectRead[];
    },

    /** GET by ID */
    getById: async (id: string, tenantId: string): Promise<ProjectRead> => {
        validateUUID(id, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('projects').select('*').eq('id', id).eq('tenant_id', tenantId).single();
        if (error) throw new Error(error.message);
        return data as ProjectRead;
    },

    /** ดึง script data จาก shots + dialogues ของ project นี้ */
    getScript: async (id: string, tenantId: string): Promise<unknown> => {
        // Verify project belongs to tenant first
        const { count, error: checkErr } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', id).eq('tenant_id', tenantId);
        if (checkErr || !count) throw new Error('Unauthorized or Project not found');

        const { data: scenes } = await supabase.from('scenes').select('*, shots(*, shot_dialogues(*))').eq('project_id', id).order('scene_order');
        return scenes ?? [];
    },

    /** Create project */
    create: async (payload: ProjectCreate, tenantId: string): Promise<ProjectRead> => {
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('projects').insert({ ...payload, tenant_id: tenantId }).select().single();
        if (error) throw new Error(error.message);
        return data as ProjectRead;
    },

    /** Update project */
    update: async (id: string, payload: ProjectUpdate, tenantId: string): Promise<ProjectRead> => {
        validateUUID(id, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('projects').update(payload).eq('id', id).eq('tenant_id', tenantId).select().single();
        if (error) throw new Error(error.message);
        return data as ProjectRead;
    },

    /** Delete project */
    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');

        // Cascading delete episodes (which deletes scenes -> shots -> dependencies)
        const { data: episodes } = await supabase.from('episodes').select('id').eq('project_id', id);
        if (episodes && episodes.length > 0) {
            for (const ep of episodes) {
                await episodeService.delete(ep.id, tenantId);
            }
        }

        // Delete characters and locations associated with the project
        await supabase.from('characters').delete().eq('project_id', id);
        await supabase.from('locations').delete().eq('project_id', id);

        const { error } = await supabase.from('projects').delete().eq('id', id).eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);
    },
};

// ===================== TENANTS =====================
export interface TenantRead {
    id: string;
    name: string;
    plan: string;
    credit_balance: number;
    is_active: boolean;
    api_keys?: Record<string, string>;
    created_at: string;
    updated_at: string;
}

export const tenantService = {
    list: async (authId?: string, offset = 0, limit = 100): Promise<TenantRead[]> => {
        if (!authId) return [];

        // Fetch tenants where the user is a member
        const { data, error } = await supabase
            .from('users')
            .select('tenant:tenants(*)')
            .eq('auth_id', authId)
            .range(offset, offset + limit - 1);

        if (error) throw new Error(error.message);
        return (data as any[]).map(r => r.tenant).filter(Boolean) as TenantRead[];
    },

    create: async (payload: { name: string; plan: string; owner_email?: string; owner_auth_id?: string; display_name?: string; avatar_url?: string }): Promise<TenantRead> => {
        const { data: tenant, error: tErr } = await supabase.from('tenants').insert({ name: payload.name, plan: payload.plan }).select().single();
        if (tErr) throw new Error(tErr.message);

        if (payload.owner_email) {
            await supabase.from('users').insert({
                email: payload.owner_email,
                auth_id: payload.owner_auth_id || null,
                tenant_id: tenant.id,
                role: 'admin',
                display_name: payload.display_name || 'Studio Owner',
                avatar_url: payload.avatar_url || null
            });
        }
        return tenant as TenantRead;
    },

    getById: async (id: string): Promise<TenantRead> => {
        const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data as TenantRead;
    },

    update: async (id: string, payload: Record<string, unknown>): Promise<TenantRead> => {
        const { data, error } = await supabase.from('tenants').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as TenantRead;
    },

    delete: async (id: string, authId: string): Promise<void> => {
        validateUUID(id, 'Tenant ID');
        // Ownership check
        const { data: user } = await supabase.from('users').select('role').eq('tenant_id', id).eq('auth_id', authId).maybeSingle();
        if (!user || user.role !== 'admin') throw new Error('Unauthorized or not an admin');

        const { error } = await supabase.from('tenants').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== SCENES =====================
export interface SceneRead {
    id: string;
    project_id: string;
    episode_id?: string | null;
    scene_order: number;
    title?: string | null;
    setting: string;
    location_id?: string | null;
    time_of_day: string;
    weather?: string | null;
    mood?: string | null;
    description?: string | null;
    status: string;
    character_states?: Record<string, { age?: string; outfit?: string }> | null;
}

export interface SceneCreate {
    project_id: string;
    episode_id?: string | null;
    scene_order: number;
    title?: string | null;
    setting?: string;
    location_id?: string | null;
    time_of_day?: string;
    weather?: string | null;
    mood?: string | null;
    description?: string | null;
    status?: string;
    character_states?: Record<string, { age?: string; outfit?: string }> | null;
}

export interface SceneUpdate {
    episode_id?: string | null;
    scene_order?: number;
    title?: string | null;
    setting?: string;
    location_id?: string | null;
    time_of_day?: string;
    weather?: string | null;
    mood?: string | null;
    description?: string | null;
    status?: string;
    character_states?: Record<string, { age?: string; outfit?: string }> | null;
}

export const sceneService = {
    listByProject: async (projectId: string, tenantId: string): Promise<SceneRead[]> => {
        validateUUID(projectId, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('scenes')
            .select('*, projects!inner(*)')
            .eq('project_id', projectId)
            .eq('projects.tenant_id', tenantId)
            .order('scene_order');
        if (error) throw new Error(error.message);
        return data as SceneRead[];
    },

    create: async (payload: SceneCreate, tenantId: string): Promise<SceneRead> => {
        // Verify project belongs to tenant
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('scenes').insert(payload).select().single();
        if (error) throw new Error(error.message);

        // After creation, sync orders
        await sceneService.syncSceneOrders(payload.project_id, tenantId);

        return data as SceneRead;
    },

    update: async (id: string, payload: SceneUpdate, tenantId: string): Promise<SceneRead> => {
        // Verify ownership through project join
        const { data: original } = await supabase.from('scenes')
            .select('project_id, projects!inner(*)')
            .eq('id', id)
            .eq('projects.tenant_id', tenantId)
            .single();
        if (!original) throw new Error('Unauthorized or Scene not found');

        const { data, error } = await supabase.from('scenes').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        if ('episode_id' in payload || 'scene_order' in payload) {
            await sceneService.syncSceneOrders(original.project_id, tenantId);
        }

        return data as SceneRead;
    },

    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Scene ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('scenes').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        // Delete all shots in this scene manually to ensure all dependencies are cleared
        const { data: shots } = await supabase.from('shots').select('id').eq('scene_id', id);
        if (shots && shots.length > 0) {
            for (const shot of shots) {
                await shotService.delete(shot.id, tenantId);
            }
        }

        const { error } = await supabase.from('scenes').delete().eq('id', id);
        if (error) throw new Error(error.message);

        await sceneService.syncSceneOrders(original.project_id, tenantId);
    },

    syncSceneOrders: async (projectId: string, tenantId: string): Promise<void> => {
        const { data: allEp } = await supabase.from('episodes').select('id, episode_number').eq('project_id', projectId);
        const { data: allScenes } = await supabase.from('scenes').select('id, episode_id, scene_order, projects!inner(*)').eq('project_id', projectId).eq('projects.tenant_id', tenantId);

        if (!allScenes) return;

        const sorted = [...allScenes].sort((a, b) => {
            const epA = allEp?.find(e => e.id === a.episode_id)?.episode_number ?? 999999;
            const epB = allEp?.find(e => e.id === b.episode_id)?.episode_number ?? 999999;
            if (epA !== epB) return epA - epB;
            return a.scene_order - b.scene_order;
        });

        for (let i = 0; i < sorted.length; i++) {
            const desiredOrder = i + 1;
            if (sorted[i].scene_order !== desiredOrder) {
                await supabase.from('scenes').update({ scene_order: desiredOrder }).eq('id', sorted[i].id);
            }
        }
    },
};

// ===================== EPISODES =====================
export interface EpisodeRead {
    id: string;
    project_id: string;
    episode_number: number;
    title?: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface EpisodeCreate {
    project_id: string;
    episode_number: number;
    title?: string | null;
    status?: string;
}

export interface EpisodeUpdate {
    episode_number?: number;
    title?: string | null;
    status?: string;
}

export const episodeService = {
    listByProject: async (projectId: string, tenantId: string): Promise<EpisodeRead[]> => {
        const { data, error } = await supabase.from('episodes')
            .select('*, projects!inner(*)')
            .eq('project_id', projectId)
            .eq('projects.tenant_id', tenantId)
            .order('episode_number');
        if (error) throw new Error(error.message);
        return data as EpisodeRead[];
    },

    create: async (payload: EpisodeCreate, tenantId: string): Promise<EpisodeRead> => {
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('episodes').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as EpisodeRead;
    },

    update: async (id: string, payload: EpisodeUpdate, tenantId: string): Promise<EpisodeRead> => {
        validateUUID(id, 'Episode ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('episodes').select('projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('episodes').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as EpisodeRead;
    },

    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Episode ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('episodes').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        // Delete all scenes in this episode manually to ensure all dependencies are cleared
        const { data: scenes } = await supabase.from('scenes').select('id').eq('episode_id', id);
        if (scenes && scenes.length > 0) {
            for (const sc of scenes) {
                await sceneService.delete(sc.id, tenantId);
            }
        }

        const { error } = await supabase.from('episodes').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== SHOTS =====================
export interface ShotRead {
    id: string;
    scene_id: string;
    shot_order: number;
    target_duration: number;
    camera_angle?: string | null;
    motion_type?: string | null;
    focal_length?: string | null;
    sfx_prompt?: string | null;
    preview_image_url?: string | null;
    status: string;
    is_locked: boolean;
    selected_generation_id?: string | null;
    video_url?: string | null;
    created_at: string;
    updated_at: string;
}

export interface ShotCreate {
    scene_id: string;
    shot_order: number;
    target_duration?: number;
    camera_angle?: string | null;
    motion_type?: string | null;
    focal_length?: string | null;
    sfx_prompt?: string | null;
    status?: string;
    video_url?: string | null;
}

export interface ShotUpdate {
    shot_order?: number;
    target_duration?: number;
    camera_angle?: string | null;
    motion_type?: string | null;
    focal_length?: string | null;
    sfx_prompt?: string | null;
    status?: string;
    is_locked?: boolean;
    video_url?: string | null;
    ai_prompt?: string | null;
}

export const shotService = {
    listByScene: async (sceneId: string, tenantId: string): Promise<ShotRead[]> => {
        const { data, error } = await supabase.from('shots')
            .select('*, scenes!inner(project_id, projects!inner(*))')
            .eq('scene_id', sceneId)
            .eq('scenes.projects.tenant_id', tenantId)
            .order('shot_order');
        if (error) throw new Error(error.message);
        return data as ShotRead[];
    },

    listByProject: async (projectId: string, tenantId: string): Promise<ShotRead[]> => {
        const { data, error } = await supabase.from('shots')
            .select('*, scenes!inner(project_id, projects!inner(*))')
            .eq('scenes.project_id', projectId)
            .eq('scenes.projects.tenant_id', tenantId)
            .order('shot_order');
        if (error) throw new Error(error.message);
        return data as ShotRead[];
    },

    create: async (payload: ShotCreate, tenantId: string): Promise<ShotRead> => {
        const { data: scene } = await supabase.from('scenes').select('project_id, projects!inner(*)').eq('id', payload.scene_id).eq('projects.tenant_id', tenantId).single();
        if (!scene) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('shots').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as ShotRead;
    },

    update: async (id: string, payload: ShotUpdate, tenantId: string): Promise<ShotRead> => {
        const { data: original } = await supabase.from('shots').select('scenes!inner(project_id, projects!inner(*))').eq('id', id).eq('scenes.projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('shots').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as ShotRead;
    },

    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Shot ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('shots').select('scenes!inner(project_id, projects!inner(*))').eq('id', id).eq('scenes.projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        // Circular reference cleanup
        await supabase.from('shots').update({ selected_generation_id: null }).eq('id', id);

        // Delete dependencies
        await supabase.from('shot_dialogues').delete().eq('shot_id', id);
        await supabase.from('render_jobs').delete().eq('shot_id', id);
        await supabase.from('shot_generations').delete().eq('shot_id', id);

        const { error } = await supabase.from('shots').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },

    generate: async (shotId: string, projectId: string, sceneId: string, tenantId: string, type: 'video' | 'image' = 'video'): Promise<unknown> => {
        // Verify ownership
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', projectId).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data: job, error: jobErr } = await supabase.from('render_jobs').insert({
            shot_id: shotId, project_id: projectId, scene_id: sceneId, status: 'pending', job_type: type === 'image' ? 'render_image' : 'render_video'
        }).select().single();
        if (jobErr) throw { detail: jobErr.message };
        await supabase.from('shots').update({ status: 'processing' }).eq('id', shotId);
        return job;
    },
};

// ===================== CHARACTERS =====================
export interface CharacterRead {
    id: string;
    project_id: string;
    name: string;
    personality_traits?: string | null;
    outfit_description?: string | null;
    actor_id?: string | null;
    created_at: string;
}

export interface CharacterCreate {
    project_id: string;
    name: string;
    personality_traits?: string | null;
    outfit_description?: string | null;
    actor_id?: string | null;
}

export interface CharacterUpdate {
    name?: string;
    personality_traits?: string | null;
    outfit_description?: string | null;
    actor_id?: string | null;
}

export const characterService = {
    listByProject: async (projectId: string, tenantId: string): Promise<CharacterRead[]> => {
        validateUUID(projectId, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('characters')
            .select('*, projects!inner(*)')
            .eq('project_id', projectId)
            .eq('projects.tenant_id', tenantId)
            .order('name');
        if (error) throw new Error(error.message);
        return data as CharacterRead[];
    },
    create: async (payload: CharacterCreate, tenantId: string): Promise<CharacterRead> => {
        validateUUID(tenantId, 'Tenant ID');
        validateUUID(payload.project_id, 'Project ID');
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('characters').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as CharacterRead;
    },
    update: async (id: string, payload: CharacterUpdate, tenantId: string): Promise<CharacterRead> => {
        validateUUID(id, 'Character ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('characters').select('projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('characters').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as CharacterRead;
    },
    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Character ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('characters').select('projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { error } = await supabase.from('characters').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== ACTORS =====================
export interface ActorRead {
    id: string;
    tenant_id: string;
    name: string;
    description?: string | null;
    gender?: string | null;
    age_range?: string | null;
    ethnicity?: string | null;
    base_prompt: string;
    negative_prompt?: string | null;
    face_image_url: string;
    image_urls?: string[] | null;
    voice_profile: Record<string, string>;
    visibility: string;
    usage_fee: number;
    level: number;
    experience_points: number;
    popularity_score: number;
    lora_url?: string | null;
    lora_training_status?: string | null;
    lora_training_id?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ActorCreate {
    tenant_id: string;
    name: string;
    description?: string | null;
    gender?: string | null;
    age_range?: string | null;
    ethnicity?: string | null;
    base_prompt: string;
    negative_prompt?: string | null;
    face_image_url: string;
    image_urls?: string[] | null;
    voice_profile: Record<string, string>;
    visibility: string;
    usage_fee: number;
    lora_url?: string | null;
    lora_training_status?: string | null;
    lora_training_id?: string | null;
}

export interface ActorUpdate {
    name?: string;
    description?: string | null;
    gender?: string | null;
    age_range?: string | null;
    ethnicity?: string | null;
    base_prompt?: string;
    negative_prompt?: string | null;
    face_image_url?: string;
    image_urls?: string[] | null;
    voice_profile?: Record<string, string>;
    visibility?: string;
    usage_fee?: number;
    lora_url?: string | null;
    lora_training_status?: string | null;
    lora_training_id?: string | null;
}

export const actorService = {
    list: async (tenantId?: string): Promise<ActorRead[]> => {
        let query = supabase.from('actors').select('*');
        if (tenantId) {
            validateUUID(tenantId, 'Tenant ID');
            query = query.or(`tenant_id.eq.${tenantId},visibility.eq.public`);
        } else {
            query = query.eq('visibility', 'public');
        }
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data as ActorRead[];
    },
    create: async (payload: ActorCreate, tenantId: string): Promise<ActorRead> => {
        validateUUID(tenantId, 'Tenant ID');
        const body = {
            ...payload,
            tenant_id: tenantId,
            voice_profile: payload.voice_profile || { provider: 'elevenlabs', voice_id: 'default' }
        };
        const { data, error } = await supabase.from('actors').insert(body).select().single();
        if (error) throw new Error(error.message);
        return data as ActorRead;
    },
    update: async (id: string, payload: ActorUpdate, tenantId: string): Promise<ActorRead> => {
        validateUUID(id, 'Actor ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('actors')
            .update(payload)
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data as ActorRead;
    },
    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Actor ID');
        validateUUID(tenantId, 'Tenant ID');

        // Remove actor assignment from characters
        await supabase.from('characters').update({ actor_id: null }).eq('actor_id', id).eq('projects.tenant_id', tenantId);

        const { error } = await supabase.from('actors')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);
    },
    /** Start LoRA Training (Mock/Trigger) */
    train: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Actor ID');
        validateUUID(tenantId, 'Tenant ID');

        // Verify ownership
        const { data: actor } = await supabase.from('actors').select('*').eq('id', id).eq('tenant_id', tenantId).single();
        if (!actor) throw new Error('Unauthorized or Actor not found');

        // Queue a render job for LoRA training
        const { error: jobErr } = await supabase.from('render_jobs').insert({
            actor_id: id,
            status: 'pending',
            job_type: 'train_lora'
        });
        if (jobErr) throw new Error(jobErr.message);

        // Update the actor record for UI feedback
        const { error } = await supabase.from('actors').update({
            lora_training_status: 'training',
            lora_training_id: `train_${Date.now()}`
        }).eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== LOCATIONS =====================
export interface LocationRead {
    id: string;
    project_id: string;
    name: string;
    description?: string;
    environment_type?: string;
    lighting_condition?: string;
    image_reference_url?: string;
    created_at: string;
}

export const locationService = {
    listByProject: async (projectId: string, tenantId: string): Promise<LocationRead[]> => {
        validateUUID(projectId, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('locations')
            .select('*, projects!inner(*)')
            .eq('project_id', projectId)
            .eq('projects.tenant_id', tenantId)
            .order('name');
        if (error) throw new Error(error.message);
        return data as LocationRead[];
    },
    create: async (payload: { project_id: string;[key: string]: any }, tenantId: string): Promise<LocationRead> => {
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('locations').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as LocationRead;
    },
    update: async (id: string, payload: Record<string, unknown>, tenantId: string): Promise<LocationRead> => {
        const { data: original } = await supabase.from('locations').select('projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('locations').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as LocationRead;
    },
    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Location ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('locations').select('projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        // Remove location assignment from scenes
        await supabase.from('scenes').update({ location_id: null }).eq('location_id', id);

        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== USERS =====================
export interface UserRead {
    id: string;
    email: string;
    auth_id?: string;
    display_name?: string;
    avatar_url?: string;
    role: string;
    tenant_id: string;
    created_at: string;
}

export const userService = {
    listByTenant: async (tenantId: string): Promise<UserRead[]> => {
        const { data, error } = await supabase.from('users').select('*').eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);
        return data as UserRead[];
    },
    create: async (payload: Record<string, unknown>): Promise<UserRead> => {
        const { data, error } = await supabase.from('users').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as UserRead;
    },
    update: async (id: string, payload: Record<string, unknown>): Promise<UserRead> => {
        const { data, error } = await supabase.from('users').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as UserRead;
    },
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== RENDER JOBS =====================
export interface RenderJobRead {
    id: string;
    shot_id?: string | null;
    project_id?: string | null;
    scene_id?: string | null;
    actor_id?: string | null;
    status: string;
    job_type: 'render_video' | 'render_image' | 'train_lora';
    provider?: string | null;
    error_log?: string | null;
    created_at: string;
    updated_at: string;
    projects?: { name?: string };
}

export const renderJobService = {
    list: async (tenantId?: string): Promise<RenderJobRead[]> => {
        if (tenantId) {
            validateUUID(tenantId, 'Tenant ID');
            const { data, error } = await supabase.from('render_jobs').select('*, projects!inner(*)').eq('projects.tenant_id', tenantId).order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return data as any[];
        }
        return [];
    },
    updateStatus: async (id: string, status: string, tenantId: string): Promise<RenderJobRead> => {
        validateUUID(id, 'Job ID');
        validateUUID(tenantId, 'Tenant ID');
        // Join with projects to verify tenant
        const { data: job } = await supabase.from('render_jobs').select('*, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!job) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('render_jobs').update({ status }).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as RenderJobRead;
    },
    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Job ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: job } = await supabase.from('render_jobs').select('*, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!job) throw new Error('Unauthorized');

        const { error } = await supabase.from('render_jobs').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== BILLING =====================
export interface TransactionRead {
    id: string;
    tenant_id: string;
    amount: number;
    transaction_type: string;
    description?: string;
    created_at: string;
}

export const billingService = {
    listTransactions: async (tenantId: string): Promise<TransactionRead[]> => {
        const { data, error } = await supabase.from('transactions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data as TransactionRead[];
    },
    /** เติมเครดิตผ่าน Supabase ตรง — insert transaction + update tenant balance */
    topup: async (tenantId: string, amount: number, description: string): Promise<Record<string, unknown>> => {
        // 1) บันทึก transaction
        const { error: txErr } = await supabase.from('transactions').insert({
            tenant_id: tenantId,
            transaction_type: 'credit',
            amount,
            description: description || 'Top-up credit',
        });
        if (txErr) throw { detail: txErr.message };

        // 2) อัปเดตยอดเครดิตของ tenant
        const { data: tenant, error: tErr } = await supabase.from('tenants').select('credit_balance').eq('id', tenantId).single();
        if (tErr) throw { detail: tErr.message };
        const newBalance = (tenant?.credit_balance ?? 0) + amount;
        const { error: uErr } = await supabase.from('tenants').update({ credit_balance: newBalance }).eq('id', tenantId);
        if (uErr) throw { detail: uErr.message };

        return { tenant_id: tenantId, new_balance: newBalance };
    },
};

// ===================== DIALOGUES =====================
export interface DialogueRead {
    id: string;
    shot_id: string;
    character_name: string;
    line_text: string;
    tone?: string | null;
    pacing?: string | null;
    line_order: number;
    created_at: string;
}

export const dialogueService = {
    listByShot: async (shotId: string): Promise<DialogueRead[]> => {
        const { data, error } = await supabase.from('shot_dialogues').select('*').eq('shot_id', shotId).order('line_order');
        if (error) throw new Error(error.message);
        return data as DialogueRead[];
    },
    create: async (payload: Record<string, unknown>, tenantId: string): Promise<DialogueRead> => {
        // Auth check via shot -> scene -> project -> tenant
        if (!payload.shot_id) throw new Error('Shot ID required');
        const { data: shot } = await supabase.from('shots').select('scenes!inner(projects!inner(tenant_id))').eq('id', payload.shot_id).single();
        if (!shot || (shot.scenes as any).projects.tenant_id !== tenantId) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('shot_dialogues').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as DialogueRead;
    },
    delete: async (id: string, tenantId: string): Promise<void> => {
        // Auth check via dialogue -> shot -> scene -> project -> tenant
        const { data: diag } = await supabase.from('shot_dialogues').select('shots!inner(scenes!inner(projects!inner(tenant_id)))').eq('id', id).single();
        if (!diag || (diag.shots as any).scenes.projects.tenant_id !== tenantId) throw new Error('Unauthorized');

        const { error } = await supabase.from('shot_dialogues').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};
