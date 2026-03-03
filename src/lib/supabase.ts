import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// ── Storage helpers ────────────────────────────────────────────
const BUCKET = 'actor-photos';

/**
 * Upload a File object to Supabase Storage.
 * Returns the public URL of the uploaded file.
 */
export async function uploadActorPhoto(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `actors/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
    });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

/**
 * Fetch a remote image URL and upload it to Supabase Storage.
 * Useful for saving AI-generated images (Pollinations.ai) permanently.
 */
export async function uploadActorPhotoFromUrl(remoteUrl: string): Promise<string> {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`Failed to fetch image from URL: ${res.statusText}`);

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const blob = await res.blob();
    const file = new File([blob], `ai_generated.${ext}`, { type: contentType });

    return uploadActorPhoto(file);
}

/**
 * Upload a base64 data URL to Supabase Storage.
 * Used when user uploads a local file (stored as base64 in state).
 */
export async function uploadActorPhotoFromBase64(dataUrl: string): Promise<string> {
    const [meta, base64] = dataUrl.split(',');
    const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const file = new File([bytes], `upload.${ext}`, { type: mime });
    return uploadActorPhoto(file);
}
