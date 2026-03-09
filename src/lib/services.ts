import { supabase } from './supabase';

// Helper to prevent "undefined" string UUID errors
const validateUUID = (id: any, name: string) => {
    if (!id || id === 'undefined' || id === '[object Object]') {
        throw new Error(`Invalid ${name}: ${id}`);
    }
};

// ===================== ACTIVITY LOG =====================
export interface ActivityLogRead {
    id: string;
    tenant_id: string;
    project_id?: string | null;
    user_id?: string | null;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    details: Record<string, any>;
    created_at: string;
}

export const activityLogService = {
    log: async (params: {
        tenantId: string;
        userId?: string;
        projectId?: string;
        action: string;
        entityType: string;
        entityId?: string;
        details?: Record<string, any>;
    }) => {
        try {
            // Get user profile ID from auth ID
            let validUserId = null;
            if (params.userId) {
                const { data: userProfile } = await supabase
                    .from('users')
                    .select('id')
                    .eq('auth_id', params.userId)
                    .maybeSingle();
                validUserId = userProfile?.id || null;
            }
            
            const { error } = await supabase.rpc('insert_activity_log', {
                p_tenant_id: params.tenantId,
                p_action: params.action,
                p_entity_type: params.entityType,
                p_user_id: validUserId,
                p_project_id: params.projectId,
                p_entity_id: params.entityId,
                p_details: params.details || {}
            });
            if (error) console.error('Activity log error:', error);
        } catch (e) {
            console.error('Activity log exception:', e);
        }
    },

    list: async (tenantId: string, options?: {
        projectId?: string;
        userId?: string;
        entityType?: string;
        limit?: number;
    }): Promise<ActivityLogRead[]> => {
        let query = supabase
            .from('activity_logs')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (options?.projectId) query = query.eq('project_id', options.projectId);
        if (options?.userId) query = query.eq('user_id', options.userId);
        if (options?.entityType) query = query.eq('entity_type', options.entityType);
        if (options?.limit) query = query.limit(options.limit);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data as ActivityLogRead[];
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
    create: async (payload: ProjectCreate, tenantId: string, userId?: string): Promise<ProjectRead> => {
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('projects').insert({ ...payload, tenant_id: tenantId }).select().single();
        if (error) throw new Error(error.message);
        
        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: data.id,
            action: 'create',
            entityType: 'project',
            entityId: data.id,
            details: { name: data.name, aspect_ratio: data.aspect_ratio }
        });
        
        return data as ProjectRead;
    },

    /** Update project */
    update: async (id: string, payload: ProjectUpdate, tenantId: string, userId?: string): Promise<ProjectRead> => {
        validateUUID(id, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('projects').update(payload).eq('id', id).eq('tenant_id', tenantId).select().single();
        if (error) throw new Error(error.message);
        
        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: id,
            action: 'update',
            entityType: 'project',
            entityId: id,
            details: payload
        });
        
        return data as ProjectRead;
    },

    /** Delete project */
    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');

        // Verify ownership
        const { count: projectCount } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', id).eq('tenant_id', tenantId);
        if (!projectCount) throw new Error('Project not found or unauthorized');

        // Step 1: get all scene IDs (includes scenes with no episode_id)
        const { data: scenes } = await supabase.from('scenes').select('id').eq('project_id', id);
        const sceneIds = scenes?.map(s => s.id) ?? [];

        if (sceneIds.length > 0) {
            // Step 2: get all shot IDs in these scenes
            const { data: shots } = await supabase.from('shots').select('id').in('scene_id', sceneIds);
            const shotIds = shots?.map(s => s.id) ?? [];

            if (shotIds.length > 0) {
                // Break circular FK: shots.selected_generation_id → shot_generations
                await supabase.from('shots').update({ selected_generation_id: null }).in('id', shotIds);
                // Delete shot-level dependencies before deleting shots
                await supabase.from('render_jobs').delete().in('shot_id', shotIds);
                await supabase.from('shot_dialogues').delete().in('shot_id', shotIds);
                await supabase.from('shot_generations').delete().in('shot_id', shotIds);
                await supabase.from('shots').delete().in('id', shotIds);
            }

            // Delete render_jobs referencing scenes, then scenes
            await supabase.from('render_jobs').delete().in('scene_id', sceneIds);
            await supabase.from('scenes').delete().in('id', sceneIds);
        }

        // Delete remaining project-level dependencies
        await supabase.from('render_jobs').delete().eq('project_id', id);
        await supabase.from('episodes').delete().eq('project_id', id);
        await supabase.from('characters').delete().eq('project_id', id);
        await supabase.from('locations').delete().eq('project_id', id);

        const { error } = await supabase.from('projects').delete().eq('id', id).eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);
        
        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: id,
            action: 'delete',
            entityType: 'project',
            entityId: id,
            details: { deleted: true }
        });
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
    owner_id?: string;
    created_at: string;
    updated_at: string;
}

export const tenantService = {
    list: async (authId?: string, offset = 0, limit = 100): Promise<TenantRead[]> => {
        if (!authId) return [];

        // 1. Get tenants YOU OWN (via owner_id)
        const { data: owned, error: ownedErr } = await supabase
            .from('tenants')
            .select('*')
            .eq('owner_id', authId);

        // 2. Get tenants YOU ARE A MEMBER OF (via tenant_members table)
        // We query tenant_members where user_id maps to our profile.
        // First get profile ID
        const { data: profile } = await supabase.from('users').select('id').eq('auth_id', authId).maybeSingle();

        let memberTenants: any[] = [];
        if (profile) {
            const { data: memberOf, error: memberErr } = await supabase
                .from('tenant_members')
                .select('tenant:tenants(*)')
                .eq('user_id', profile.id);

            if (memberErr) throw new Error('Data verification failed.');

            memberTenants = (memberOf as any[])
                .map(r => r.tenant)
                .filter(t => t && t.id);
        }

        const all = [...(owned || []), ...memberTenants];

        // Remove duplicates by ID (in case you are both owner and listed as member)
        const unique = Array.from(new Map(all.map(t => [t.id, t])).values());

        return unique as TenantRead[];
    },

    create: async (payload: { name: string; plan: string; owner_email?: string; owner_auth_id?: string; display_name?: string; avatar_url?: string }): Promise<TenantRead> => {
        const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
            name: payload.name,
            plan: payload.plan,
            owner_id: payload.owner_auth_id
        }).select().single();
        if (tErr) throw new Error(tErr.message);

        if (payload.owner_email && payload.owner_auth_id) {
            // Ensure profile exists
            let { data: profile } = await supabase.from('users').select('id').ilike('email', payload.owner_email).maybeSingle();
            if (!profile) {
                const { data: newP } = await supabase.from('users').insert({
                    email: payload.owner_email,
                    auth_id: payload.owner_auth_id || null,
                    display_name: payload.display_name || 'Studio Owner',
                    avatar_url: payload.avatar_url || null
                }).select().single();
                profile = newP;
            }
            if (profile) {
                await supabase.from('tenant_members').insert({
                    user_id: profile.id,
                    tenant_id: tenant.id,
                    role: 'owner'
                });
            }
        }
        return tenant as TenantRead;
    },

    getById: async (id: string): Promise<TenantRead> => {
        const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data as TenantRead;
    },

    update: async (id: string, payload: Record<string, unknown>, authId: string): Promise<TenantRead> => {
        validateUUID(id, 'Tenant ID');
        const { data: tenant } = await supabase.from('tenants').select('owner_id').eq('id', id).maybeSingle();
        if (!tenant) throw new Error('Tenant not found');
        if (tenant.owner_id !== authId) throw new Error('Unauthorized: only the tenant owner can perform this action');

        const { data, error } = await supabase.from('tenants').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as TenantRead;
    },

    delete: async (id: string, authId: string): Promise<void> => {
        validateUUID(id, 'Tenant ID');
        // S-4: Must be the owner of the tenant (not just any admin)
        const { data: tenant } = await supabase.from('tenants').select('owner_id').eq('id', id).maybeSingle();
        if (!tenant) throw new Error('Tenant not found');
        if (tenant.owner_id !== authId) throw new Error('Unauthorized: only the tenant owner can delete this studio');

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

    create: async (payload: SceneCreate, tenantId: string, userId?: string): Promise<SceneRead> => {
        // Verify project belongs to tenant
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('scenes').insert(payload).select().single();
        if (error) throw new Error(error.message);

        // After creation, sync orders
        await sceneService.syncSceneOrders(payload.project_id, tenantId);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: payload.project_id,
            action: 'create',
            entityType: 'scene',
            entityId: data.id,
            details: { scene_order: data.scene_order, title: data.title }
        });

        return data as SceneRead;
    },

    update: async (id: string, payload: SceneUpdate, tenantId: string, userId?: string): Promise<SceneRead> => {
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

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: original.project_id,
            action: 'update',
            entityType: 'scene',
            entityId: id,
            details: payload
        });

        return data as SceneRead;
    },

    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Scene ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('scenes').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        // Delete all shots in this scene manually to ensure all dependencies are cleared
        const { data: shots } = await supabase.from('shots').select('id').eq('scene_id', id);
        if (shots && shots.length > 0) {
            for (const shot of shots) {
                await shotService.delete(shot.id, tenantId, userId);
            }
        }

        const { error } = await supabase.from('scenes').delete().eq('id', id);
        if (error) throw new Error(error.message);

        await sceneService.syncSceneOrders(original.project_id, tenantId);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: original.project_id,
            action: 'delete',
            entityType: 'scene',
            entityId: id,
            details: { deleted: true }
        });
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

    create: async (payload: EpisodeCreate, tenantId: string, userId?: string): Promise<EpisodeRead> => {
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('episodes').insert(payload).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: payload.project_id,
            action: 'create',
            entityType: 'episode',
            entityId: data.id,
            details: { episode_number: data.episode_number, title: data.title }
        });

        return data as EpisodeRead;
    },

    update: async (id: string, payload: EpisodeUpdate, tenantId: string, userId?: string): Promise<EpisodeRead> => {
        validateUUID(id, 'Episode ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('episodes').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('episodes').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: original.project_id,
            action: 'update',
            entityType: 'episode',
            entityId: id,
            details: payload
        });

        return data as EpisodeRead;
    },

    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Episode ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('episodes').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const projectId = original.project_id;

        // Delete all scenes in this episode manually to ensure all dependencies are cleared
        const { data: scenes } = await supabase.from('scenes').select('id').eq('episode_id', id);
        if (scenes && scenes.length > 0) {
            for (const sc of scenes) {
                await sceneService.delete(sc.id, tenantId, userId);
            }
        }

        const { error } = await supabase.from('episodes').delete().eq('id', id);
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId,
            action: 'delete',
            entityType: 'episode',
            entityId: id,
            details: { deleted: true }
        });
    },
};

// ===================== SHOTS =====================
export interface ShotRead {
    id: string;
    scene_id: string;
    shot_order: number;
    target_duration: number;
    timestamp_start?: number;
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
    timestamp_start?: number;
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
    timestamp_start?: number;
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

    create: async (payload: ShotCreate, tenantId: string, userId?: string): Promise<ShotRead> => {
        const { data: scene } = await supabase.from('scenes').select('project_id, projects!inner(*)').eq('id', payload.scene_id).eq('projects.tenant_id', tenantId).single();
        if (!scene) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('shots').insert(payload).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: scene.project_id,
            action: 'create',
            entityType: 'shot',
            entityId: data.id,
            details: { shot_order: data.shot_order }
        });

        return data as ShotRead;
    },

    update: async (id: string, payload: ShotUpdate, tenantId: string, userId?: string): Promise<ShotRead> => {
        const { data: original } = await supabase.from('shots').select('scenes!inner(project_id, projects!inner(*))').eq('id', id).eq('scenes.projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('shots').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        const shotProjectId = (original.scenes as any)?.project_id;
        await activityLogService.log({
            tenantId,
            userId,
            projectId: shotProjectId,
            action: 'update',
            entityType: 'shot',
            entityId: id,
            details: payload
        });

        return data as ShotRead;
    },

    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Shot ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('shots').select('scene_id, scenes(project_id)').eq('id', id).single();
        if (!original) throw new Error('Unauthorized');

        const projectId = (original.scenes as any)?.project_id;

        // Circular reference cleanup
        await supabase.from('shots').update({ selected_generation_id: null }).eq('id', id);

        // Delete dependencies
        await supabase.from('shot_dialogues').delete().eq('shot_id', id);
        await supabase.from('render_jobs').delete().eq('shot_id', id);
        await supabase.from('shot_generations').delete().eq('shot_id', id);

        const { error } = await supabase.from('shots').delete().eq('id', id);
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId,
            action: 'delete',
            entityType: 'shot',
            entityId: id,
            details: { deleted: true }
        });
    },

    generate: async (shotId: string, projectId: string, sceneId: string, tenantId: string, type: 'video' | 'image' = 'video', provider: 'runway' | 'pika' | 'kling' | 'luma' = 'runway'): Promise<{ job_id: string; status: string }> => {
        console.log('=== GENERATE WORKFLOW ===');
        console.log('1. Starting generate for shot:', shotId, 'type:', type);
        
        validateUUID(shotId, 'Shot ID');
        validateUUID(projectId, 'Project ID');
        validateUUID(tenantId, 'Tenant ID');

        // 1. Verify ownership
        console.log('2. Verifying ownership...');
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', projectId).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        // 2. Check credits FIRST (before doing anything)
        console.log('3. Checking credits...');
        const { data: tenant, error: tenantErr } = await supabase.from('tenants').select('credit_balance').eq('id', tenantId).single();
        if (tenantErr) throw new Error(tenantErr.message);

        const cost = type === 'video' ? 10 : 2;
        console.log('   Cost:', cost, 'Current balance:', tenant?.credit_balance);
        if ((tenant?.credit_balance ?? 0) < cost) {
            throw new Error(`Insufficient credits. Need ${cost} credits, have ${tenant?.credit_balance ?? 0}`);
        }

        // 3. Deduct credits
        console.log('4. Deducting credits...');
        const { error: deductErr } = await supabase.rpc('deduct_credits', { p_amount: cost, p_tenant_id: tenantId });
        if (deductErr) {
            throw new Error('Failed to deduct credits: ' + deductErr.message);
        }

        // 4. Get shot data for prompt building
        console.log('5. Getting shot data...');
        const { data: shot } = await supabase.from('shots').select('*').eq('id', shotId).single();
        if (!shot) {
            await supabase.rpc('add_credits', { p_amount: cost, p_tenant_id: tenantId });
            throw new Error('Shot not found');
        }

        // 5. Build visual_prompt from shot data
        console.log('6. Building visual_prompt...');
        const buildPromptFromShot = (s: any): string => {
            const parts: string[] = [];
            if (s.camera_angle) parts.push(`${s.camera_angle} shot`);
            if (s.motion_type && s.motion_type !== 'Static') parts.push(`${s.motion_type} camera`);
            if (s.focal_length) parts.push(`${s.focal_length} lens`);
            if (s.target_duration) parts.push(`${s.target_duration}s`);
            
            try {
                const script = JSON.parse(s.sfx_prompt || '{}');
                if (script.action) parts.push(script.action);
                if (script.dialogue?.length) {
                    const dialogues = script.dialogue
                        .map((d: any) => `${d.character}: "${d.line}"${d.emotion !== 'Neutral' ? ` (${d.emotion})` : ''}`)
                        .join(' / ');
                    parts.push(dialogues);
                }
                if (script.notes) parts.push(`Notes: ${script.notes}`);
            } catch {}
            
            return parts.join('. ');
        };

        const visualPrompt = buildPromptFromShot(shot);
        console.log('   Generated prompt:', visualPrompt?.substring(0, 100) + '...');

        // 6. Update shot with visual_prompt
        console.log('7. Updating shot with visual_prompt...');
        await supabase.from('shots').update({ 
            visual_prompt: visualPrompt
        }).eq('id', shotId);

        // 7. Create render job
        console.log('8. Creating render job...');
        const jobType = type === 'image' ? 'render_image' : 'render_video';
        const { data: job, error: jobErr } = await supabase.from('render_jobs').insert({
            shot_id: shotId,
            project_id: projectId,
            scene_id: sceneId,
            status: 'pending',
            job_type: jobType,
            provider: provider,
            credit_cost: cost,
            preview_image_url: null,
        }).select().single();
        
        if (jobErr) {
            await supabase.rpc('add_credits', { p_amount: cost, p_tenant_id: tenantId });
            await supabase.from('shots').update({ visual_prompt: null }).eq('id', shotId);
            throw new Error(jobErr.message);
        }

        console.log('   Job created:', job.id, 'status:', job.status);

        // 8. Update shot status to processing
        console.log('9. Updating shot status to processing...');
        await supabase.from('shots').update({ status: 'processing' }).eq('id', shotId);

        // 10. Call external API to process the job
        console.log('11. Calling external API...');
        const apiEndpoint = type === 'image' 
            ? `${process.env.NEXT_PUBLIC_RENDER_API_URL}/api/render/image`
            : `${process.env.NEXT_PUBLIC_RENDER_API_URL}/api/render/video`;
        
        console.log('   API URL:', apiEndpoint);
        console.log('   NEXT_PUBLIC_RENDER_API_URL:', process.env.NEXT_PUBLIC_RENDER_API_URL);
        
        try {
            console.log('   Sending request...');
            const apiResponse = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shot_id: shotId,
                    render_job_id: job.id,
                    scene_id: sceneId,
                    project_id: projectId,
                    priority: 5
                })
            });

            console.log('   Response status:', apiResponse.status);

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                throw new Error(`API error: ${apiResponse.status} - ${errorText}`);
            }

            const apiResult = await apiResponse.json();
            console.log('   API Response:', apiResult);
        } catch (apiError: any) {
            console.error('   API call failed:', apiError.message);
            // Don't throw - let the job stay in processing and handle errors via polling/realtime
        }

        // Return job_id immediately for frontend to subscribe
        console.log('=== GENERATE COMPLETE ===');
        console.log('   Returning job_id:', job.id);
        return { job_id: job.id, status: job.status };
    },

    // Subscribe to job status changes (using Redis instead of Supabase realtime)
    subscribeToJob: (jobId: string, onUpdate: (status: string, data: any) => void) => {
        // Redis-based subscription - no-op for now
        console.log('   Using Redis for job updates (Supabase realtime disabled)');
        return () => {};
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
    create: async (payload: CharacterCreate, tenantId: string, userId?: string): Promise<CharacterRead> => {
        validateUUID(tenantId, 'Tenant ID');
        validateUUID(payload.project_id, 'Project ID');
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('characters').insert(payload).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: payload.project_id,
            action: 'create',
            entityType: 'character',
            entityId: data.id,
            details: { name: data.name }
        });

        return data as CharacterRead;
    },
    update: async (id: string, payload: CharacterUpdate, tenantId: string, userId?: string): Promise<CharacterRead> => {
        validateUUID(id, 'Character ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('characters').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('characters').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: original.project_id,
            action: 'update',
            entityType: 'character',
            entityId: id,
            details: payload
        });

        return data as CharacterRead;
    },
    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Character ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('characters').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const projectId = original.project_id;

        // L-2: Clear FK reference from shot_dialogues before deleting character
        await supabase.from('shot_dialogues').update({ character_id: null }).eq('character_id', id);

        const { error } = await supabase.from('characters').delete().eq('id', id);
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId,
            action: 'delete',
            entityType: 'character',
            entityId: id,
            details: { deleted: true }
        });
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
    visual_dna?: string | null;
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
    create: async (payload: ActorCreate, tenantId: string, userId?: string): Promise<ActorRead> => {
        validateUUID(tenantId, 'Tenant ID');
        const body = {
            ...payload,
            tenant_id: tenantId,
            voice_profile: payload.voice_profile || { provider: 'elevenlabs', voice_id: 'default' }
        };
        const { data, error } = await supabase.from('actors').insert(body).select().single();
        if (error) throw new Error(error.message);

        // Log activity (no project_id for actors)
        await activityLogService.log({
            tenantId,
            userId,
            action: 'create',
            entityType: 'actor',
            entityId: data.id,
            details: { name: data.name }
        });

        return data as ActorRead;
    },
    update: async (id: string, payload: ActorUpdate, tenantId: string, userId?: string): Promise<ActorRead> => {
        validateUUID(id, 'Actor ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data, error } = await supabase.from('actors')
            .update(payload)
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .select()
            .single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            action: 'update',
            entityType: 'actor',
            entityId: id,
            details: payload
        });

        return data as ActorRead;
    },
    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Actor ID');
        validateUUID(tenantId, 'Tenant ID');

        // L-4: Remove actor assignment from characters (actor is already verified to belong to tenantId)
        await supabase.from('characters').update({ actor_id: null }).eq('actor_id', id);

        const { error } = await supabase.from('actors')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            action: 'delete',
            entityType: 'actor',
            entityId: id,
            details: { deleted: true }
        });
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

    /** Generate Visual DNA for an actor */
    generateVisualDNA: async (id: string, tenantId: string): Promise<{ jobId: string; visualDNA?: string }> => {
        validateUUID(id, 'Actor ID');
        validateUUID(tenantId, 'Tenant ID');

        // Verify ownership
        const { data: actor } = await supabase.from('actors').select('*').eq('id', id).eq('tenant_id', tenantId).single();
        if (!actor) throw new Error('Unauthorized or Actor not found');

        // Create render job
        const { data: job, error: jobErr } = await supabase.from('render_jobs').insert({
            actor_id: id,
            status: 'pending',
            job_type: 'generate_visual_dna'
        }).select().single();
        if (jobErr) throw new Error(jobErr.message);

        // Call external API
        const apiEndpoint = `${process.env.NEXT_PUBLIC_RENDER_API_URL}/api/actors/generate-dna`;
        const apiResponse = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actor_id: id,
                render_job_id: job.id,
                priority: 5
            })
        });

        if (!apiResponse.ok) {
            await supabase.from('render_jobs').update({ status: 'failed', error_log: 'API call failed' }).eq('id', job.id);
            throw new Error('Failed to generate Visual DNA');
        }

        const data = await apiResponse.json();
        
        // If visual_dna is returned immediately, update the job and actor
        if (data.visual_dna) {
            await supabase.from('render_jobs').update({ status: 'completed' }).eq('id', job.id);
            await supabase.from('actors').update({ visual_dna: data.visual_dna }).eq('id', id);
            return { jobId: job.id, visualDNA: data.visual_dna };
        }

        return { jobId: job.id };
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
    create: async (payload: { project_id: string;[key: string]: any }, tenantId: string, userId?: string): Promise<LocationRead> => {
        const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', payload.project_id).eq('tenant_id', tenantId);
        if (!count) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('locations').insert(payload).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: payload.project_id,
            action: 'create',
            entityType: 'location',
            entityId: data.id,
            details: { name: data.name }
        });

        return data as LocationRead;
    },
    update: async (id: string, payload: Record<string, unknown>, tenantId: string, userId?: string): Promise<LocationRead> => {
        const { data: original } = await supabase.from('locations').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('locations').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId: original.project_id,
            action: 'update',
            entityType: 'location',
            entityId: id,
            details: payload
        });

        return data as LocationRead;
    },
    delete: async (id: string, tenantId: string, userId?: string): Promise<void> => {
        validateUUID(id, 'Location ID');
        validateUUID(tenantId, 'Tenant ID');
        const { data: original } = await supabase.from('locations').select('project_id, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        if (!original) throw new Error('Unauthorized');

        const projectId = original.project_id;

        // Remove location assignment from scenes
        await supabase.from('scenes').update({ location_id: null }).eq('location_id', id);

        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) throw new Error(error.message);

        // Log activity
        await activityLogService.log({
            tenantId,
            userId,
            projectId,
            action: 'delete',
            entityType: 'location',
            entityId: id,
            details: { deleted: true }
        });
    },
};

// ===================== USERS =====================
export interface UserRead {
    id: string;
    email: string;
    auth_id?: string;
    display_name?: string;
    avatar_url?: string;
    created_at: string;
    role?: string; // Appended for UI convenience in listByTenant
}

export const userService = {
    listByTenant: async (tenantId: string, authId: string): Promise<UserRead[]> => {
        // SECURITY: Verify the requester belongs to this tenant before listing users
        const { data: profile } = await supabase.from('users').select('id').eq('auth_id', authId).maybeSingle();
        const { data: check } = profile ? await supabase.from('tenant_members').select('id').eq('tenant_id', tenantId).eq('user_id', profile.id).maybeSingle() : { data: null };
        const { data: checkOwner } = await supabase.from('tenants').select('id').eq('id', tenantId).eq('owner_id', authId).maybeSingle();

        if (!check && !checkOwner) throw new Error('Unauthorized access to member list');

        // Get all tenant members
        const { data: members, error: membersErr } = await supabase
            .from('tenant_members')
            .select('user_id, role, invited_email')
            .eq('tenant_id', tenantId);
        if (membersErr) throw new Error(membersErr.message);
        
        console.log('members with email:', JSON.stringify(members, null, 2));

        if (!members || members.length === 0) return [];

        // Get user details for those who have user_id
        const userIds = members.map(m => m.user_id).filter(Boolean);
        console.log('tenantId:', tenantId, 'userIds:', userIds);
        
        const { data: users } = userIds.length > 0 ? await supabase
            .from('users')
            .select('*')
            .in('id', userIds) : { data: null };
        
        console.log('users from DB:', JSON.stringify(users, null, 2));

        const result = members.map(m => {
            const user = users?.find(u => u.id === m.user_id);
            const entry: UserRead = {
                id: m.user_id || m.invited_email,
                email: user?.email || m.invited_email || (m.user_id ? `ID: ${m.user_id.slice(0, 8)}` : 'Pending'),
                display_name: user?.display_name,
                role: m.role,
                created_at: user?.created_at || new Date().toISOString()
            };
            if (user?.auth_id) entry.auth_id = user.auth_id;
            if (user?.avatar_url) entry.avatar_url = user.avatar_url;
            return entry;
        });
        
        return result;
    },
    create: async (payload: { email: string; tenant_id: string; role: string }): Promise<UserRead> => {
        // First check if user exists in users table by email
        console.log('Looking for user with email:', payload.email);
        
        console.log('=== START INVITE ===');
        console.log('payload:', payload);
        
        // Use RPC to find user (bypasses RLS)
        const { data: rpcResult, error: rpcError } = await supabase
            .rpc('get_user_by_email', { search_email: payload.email });
        
        console.log('rpcResult:', rpcResult);
        console.log('rpcError:', rpcError);
        
        const existingUser = rpcResult && rpcResult.length > 0 ? rpcResult[0] : null;

        if (!existingUser) {
            throw new Error('User not found with email: ' + payload.email);
        }

        // User exists, add to tenant_members
        const { error: insertErr } = await supabase
            .from('tenant_members')
            .upsert({
                tenant_id: payload.tenant_id,
                user_id: existingUser.id,
                role: payload.role || 'member',
                invited_email: payload.email
            }, { onConflict: 'tenant_id,user_id' });

        if (insertErr) throw new Error(insertErr.message);
        
        return {
            id: existingUser.id,
            email: payload.email,
            role: payload.role,
            created_at: new Date().toISOString()
        } as UserRead;
    },
    // Leaving update and delete placeholders that might need adjustments if required by the app
    update: async (id: string, payload: Record<string, unknown>): Promise<UserRead> => {
        const { data, error } = await supabase.from('users').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as UserRead;
    },
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
    removeFromTenant: async (tenantId: string, userId: string): Promise<void> => {
        const { error } = await supabase.from('tenant_members')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('user_id', userId);
        if (error) throw new Error(error.message);
    }
};

// ===================== RENDER JOBS =====================
export interface RenderJobRead {
    id: string;
    shot_id?: string | null;
    project_id?: string | null;
    scene_id?: string | null;
    actor_id?: string | null;
    status: string;
    job_type: 'render_video' | 'render_image' | 'train_lora' | 'generate_visual_dna';
    provider?: string | null;
    error_log?: string | null;
    created_at: string;
    updated_at: string;
    projects?: { name?: string; tenant_id?: string };
    actors?: { name?: string; tenant_id?: string };
    tenant_name?: string;
}

export const renderJobService = {
    list: async (tenantId?: string): Promise<RenderJobRead[]> => {
        // Get jobs from projects with tenant info
        const { data: projectJobs, error: projectError } = await supabase
            .from('render_jobs')
            .select('*, projects!inner(name, tenant_id)')
            .not('project_id', 'is', null);
        
        // Get jobs from actors with tenant info
        const { data: actorJobs, error: actorError } = await supabase
            .from('render_jobs')
            .select('*, actors!inner(name, tenant_id)')
            .is('project_id', null)
            .not('actor_id', 'is', null);
        
        if (projectError) throw new Error(projectError.message);
        if (actorError) throw new Error(actorError.message);
        
        // Get tenant names
        const tenantIds = new Set<string>();
        [...(projectJobs || []), ...(actorJobs || [])].forEach((job: any) => {
            const tid = job.projects?.tenant_id || job.actors?.tenant_id;
            if (tid) tenantIds.add(tid);
        });
        
        const { data: tenants } = await supabase.from('tenants').select('id, name').in('id', Array.from(tenantIds));
        const tenantMap = new Map((tenants || []).map((t: any) => [t.id, t.name]));
        
        // Combine and add tenant name
        const allJobs = [...(projectJobs || []), ...(actorJobs || [])].map((job: any) => ({
            ...job,
            tenant_name: tenantMap.get(job.projects?.tenant_id || job.actors?.tenant_id) || '-'
        }));
        
        allJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        // Filter by tenantId if provided
        let filtered = allJobs;
        if (tenantId) {
            filtered = allJobs.filter((job: any) => 
                job.projects?.tenant_id === tenantId || job.actors?.tenant_id === tenantId
            );
        }
        
        return filtered as any[];
    },
    updateStatus: async (id: string, status: string, tenantId: string): Promise<RenderJobRead> => {
        validateUUID(id, 'Job ID');
        validateUUID(tenantId, 'Tenant ID');
        // Check project-based job
        const { data: projectJob } = await supabase.from('render_jobs').select('*, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        // Check actor-based job
        const { data: actorJob } = projectJob ? { data: null } : await supabase.from('render_jobs').select('*, actors!inner(*)').eq('id', id).eq('actors.tenant_id', tenantId).single();
        
        if (!projectJob && !actorJob) throw new Error('Unauthorized');

        const { data, error } = await supabase.from('render_jobs').update({ status }).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as RenderJobRead;
    },
    delete: async (id: string, tenantId: string): Promise<void> => {
        validateUUID(id, 'Job ID');
        validateUUID(tenantId, 'Tenant ID');
        // Check project-based job
        const { data: projectJob } = await supabase.from('render_jobs').select('*, projects!inner(*)').eq('id', id).eq('projects.tenant_id', tenantId).single();
        // Check actor-based job
        const { data: actorJob } = projectJob ? { data: null } : await supabase.from('render_jobs').select('*, actors!inner(*)').eq('id', id).eq('actors.tenant_id', tenantId).single();
        
        if (!projectJob && !actorJob) throw new Error('Unauthorized');

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
        if (txErr) throw new Error(txErr.message);

        // 2) อัปเดตยอดเครดิตของ tenant
        const { data: tenant, error: tErr } = await supabase.from('tenants').select('credit_balance').eq('id', tenantId).single();
        if (tErr) throw new Error(tErr.message);
        const newBalance = (tenant?.credit_balance ?? 0) + amount;
        const { error: uErr } = await supabase.from('tenants').update({ credit_balance: newBalance }).eq('id', tenantId);
        if (uErr) {
            console.error('CRITICAL: Transaction recorded but balance update failed', { tenantId, amount });
            throw new Error(uErr.message);
        }

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
