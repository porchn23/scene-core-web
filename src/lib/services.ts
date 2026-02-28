import { supabase } from './supabase';

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
}

export const projectService = {
    /** List all projects */
    list: async (offset = 0, limit = 100): Promise<ProjectRead[]> => {
        const { data, error } = await supabase.from('projects').select('*').range(offset, offset + limit - 1).order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data as ProjectRead[];
    },

    /** GET by ID */
    getById: async (id: string): Promise<ProjectRead> => {
        const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data as ProjectRead;
    },

    /** ดึง script data จาก shots + dialogues ของ project นี้ */
    getScript: async (id: string): Promise<unknown> => {
        const { data: scenes } = await supabase.from('scenes').select('*, shots(*, shot_dialogues(*))').eq('project_id', id).order('scene_order');
        return scenes ?? [];
    },

    /** Create project */
    create: async (payload: ProjectCreate): Promise<ProjectRead> => {
        const { data, error } = await supabase.from('projects').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as ProjectRead;
    },

    /** Update project */
    update: async (id: string, payload: ProjectUpdate): Promise<ProjectRead> => {
        const { data, error } = await supabase.from('projects').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as ProjectRead;
    },

    /** Delete project */
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('projects').delete().eq('id', id);
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
    created_at: string;
    updated_at: string;
}

export const tenantService = {
    list: async (offset = 0, limit = 100): Promise<TenantRead[]> => {
        const { data, error } = await supabase.from('tenants').select('*').range(offset, offset + limit - 1).order('name');
        if (error) throw new Error(error.message);
        return data as TenantRead[];
    },

    getById: async (id: string): Promise<TenantRead> => {
        const { data, error } = await supabase.from('tenants').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data as TenantRead;
    },

    create: async (payload: Record<string, unknown>): Promise<TenantRead> => {
        const { data, error } = await supabase.from('tenants').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as TenantRead;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('tenants').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== SCENES =====================
export interface SceneRead {
    id: string;
    project_id: string;
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
    listByProject: async (projectId: string): Promise<SceneRead[]> => {
        const { data, error } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('scene_order');
        if (error) throw new Error(error.message);
        return data as SceneRead[];
    },

    create: async (payload: SceneCreate): Promise<SceneRead> => {
        const { data, error } = await supabase.from('scenes').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as SceneRead;
    },

    update: async (id: string, payload: SceneUpdate): Promise<SceneRead> => {
        const { data, error } = await supabase.from('scenes').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as SceneRead;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('scenes').delete().eq('id', id);
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
}

export const shotService = {
    listByScene: async (sceneId: string): Promise<ShotRead[]> => {
        const { data, error } = await supabase.from('shots').select('*').eq('scene_id', sceneId).order('shot_order');
        if (error) throw new Error(error.message);
        return data as ShotRead[];
    },

    getById: async (id: string): Promise<ShotRead> => {
        const { data, error } = await supabase.from('shots').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data as ShotRead;
    },

    create: async (payload: ShotCreate): Promise<ShotRead> => {
        const { data, error } = await supabase.from('shots').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as ShotRead;
    },

    update: async (id: string, payload: ShotUpdate): Promise<ShotRead> => {
        const { data, error } = await supabase.from('shots').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as ShotRead;
    },

    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('shots').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },

    /** สร้าง render job สำหรับ shot นี้ + เปลี่ยนสถานะเป็น processing */
    generate: async (shotId: string): Promise<unknown> => {
        const { data: job, error: jobErr } = await supabase.from('render_jobs').insert({ shot_id: shotId, status: 'pending' }).select().single();
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
    age?: number | null;
    age_description?: string | null;
    personality_traits?: string | null;
    outfit_description?: string | null;
    actor_id?: string | null;
    created_at: string;
}

export interface CharacterCreate {
    project_id: string;
    name: string;
    age?: number | null;
    age_description?: string | null;
    personality_traits?: string | null;
    outfit_description?: string | null;
    actor_id?: string | null;
}

export interface CharacterUpdate {
    name?: string;
    age?: number | null;
    age_description?: string | null;
    personality_traits?: string | null;
    outfit_description?: string | null;
    actor_id?: string | null;
}

export const characterService = {
    listByProject: async (projectId: string): Promise<CharacterRead[]> => {
        const { data, error } = await supabase.from('characters').select('*').eq('project_id', projectId);
        if (error) throw new Error(error.message);
        return data as CharacterRead[];
    },
    create: async (payload: CharacterCreate): Promise<CharacterRead> => {
        const { data, error } = await supabase.from('characters').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as CharacterRead;
    },
    update: async (id: string, payload: CharacterUpdate): Promise<CharacterRead> => {
        const { data, error } = await supabase.from('characters').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as CharacterRead;
    },
    delete: async (id: string): Promise<void> => {
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
    list: async (): Promise<ActorRead[]> => {
        const { data, error } = await supabase.from('actors').select('*');
        if (error) throw new Error(error.message);
        return data as ActorRead[];
    },
    create: async (payload: ActorCreate): Promise<ActorRead> => {
        const { data, error } = await supabase.from('actors').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as ActorRead;
    },
    update: async (id: string, payload: ActorUpdate): Promise<ActorRead> => {
        const { data, error } = await supabase.from('actors').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as ActorRead;
    },
    /** Start LoRA Training (Mock/Trigger) */
    train: async (id: string): Promise<void> => {
        // ในระบบจริง จะเรียก Edge Function หรือ External API (เช่น Replicate/FAL)
        // เพื่อเริ่มการเทรนจากรูปใน image_urls
        const { error } = await supabase.from('actors').update({
            lora_training_status: 'training',
            lora_training_id: `train_${Date.now()}`
        }).eq('id', id);
        if (error) throw new Error(error.message);
    },
    /** Delete actor */
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('actors').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }
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
    listByProject: async (projectId: string): Promise<LocationRead[]> => {
        const { data, error } = await supabase.from('locations').select('*').eq('project_id', projectId);
        if (error) throw new Error(error.message);
        return data as LocationRead[];
    },
    create: async (payload: Record<string, unknown>): Promise<LocationRead> => {
        const { data, error } = await supabase.from('locations').insert(payload).select().single();
        if (error) throw new Error(error.message);
        return data as LocationRead;
    },
    update: async (id: string, payload: Record<string, unknown>): Promise<LocationRead> => {
        const { data, error } = await supabase.from('locations').update(payload).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as LocationRead;
    },
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('locations').delete().eq('id', id);
        if (error) throw new Error(error.message);
    },
};

// ===================== USERS =====================
export interface UserRead {
    id: string;
    email: string;
    display_name?: string;
    role: string;
    tenant_id: string;
    created_at: string;
}

export const userService = {
    list: async (): Promise<UserRead[]> => {
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw new Error(error.message);
        return data as UserRead[];
    },
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
    shot_id: string;
    status: string;
    provider?: string | null;
    error_log?: string | null;
    created_at: string;
    updated_at: string;
}

export const renderJobService = {
    list: async (): Promise<RenderJobRead[]> => {
        const { data, error } = await supabase.from('render_jobs').select('*').order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data as RenderJobRead[];
    },
    updateStatus: async (id: string, status: string): Promise<RenderJobRead> => {
        const { data, error } = await supabase.from('render_jobs').update({ status }).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data as RenderJobRead;
    },
    delete: async (id: string): Promise<void> => {
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
        if (error) throw { detail: error.message };
        return data as DialogueRead[];
    },
    create: async (payload: Record<string, unknown>): Promise<DialogueRead> => {
        const { data, error } = await supabase.from('shot_dialogues').insert(payload).select().single();
        if (error) throw { detail: error.message };
        return data as DialogueRead;
    },
    delete: async (id: string): Promise<void> => {
        const { error } = await supabase.from('shot_dialogues').delete().eq('id', id);
        if (error) throw { detail: error.message };
    },
};
