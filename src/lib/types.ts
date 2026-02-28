// ===================== CORE TYPES =====================

export type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1' | '2.39:1';

export type ProjectStatus = 'draft' | 'active' | 'processing' | 'completed' | 'archived';
export type RenderJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ===================== PROJECT =====================
export interface Project {
    id: string;
    name: string;
    aspect_ratio: AspectRatio;
    tenant_id: string;
    status: ProjectStatus;
    created_at: string;
    updated_at: string;
    scene_count?: number;
    shot_count?: number;
}

export interface CreateProjectPayload {
    name: string;
    aspect_ratio: AspectRatio;
    tenant_id: string;
}

export interface UpdateProjectPayload {
    name?: string;
    aspect_ratio?: AspectRatio;
    status?: ProjectStatus;
}

// ===================== SCRIPT TREE =====================
export interface Dialogue {
    id: string;
    shot_id: string;
    character_id?: string;
    character_name?: string;
    text: string;
    tone?: string;
    pacing?: string;
    order: number;
}

export interface Shot {
    id: string;
    scene_id: string;
    title: string;
    description?: string;
    camera_angle?: string;
    motion_type?: string;
    status: RenderJobStatus | 'draft' | 'ready';
    order: number;
    duration?: number;
    dialogues?: Dialogue[];
}

export interface Scene {
    id: string;
    project_id: string;
    title: string;
    description?: string;
    mood?: string;
    setting?: string;
    order: number;
    shots?: Shot[];
}

export interface ProjectScript {
    project: Project;
    scenes: Scene[];
}

// ===================== OTHERS =====================
export interface Tenant {
    id: string;
    name: string;
    credit_balance: number;
}

export interface ApiError {
    detail: string;
    status: number;
}
