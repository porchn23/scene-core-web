// ============================================
// Render Worker - Calls external API (localhost:8000)
// Run with: npx tsx workers/render-worker.ts
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_BASE = 'http://localhost:8000';

interface RenderJob {
    id: string;
    shot_id: string;
    project_id: string;
    scene_id: string;
    job_type: string;
    provider: string;
    status: string;
    credit_cost?: number;
}

async function main() {
    console.log('🎬 Render Worker started');
    console.log('📡 Listening for new jobs...');

    // Listen for new jobs using Realtime
    supabase.channel('render_jobs')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'render_jobs',
            filter: 'status=eq.pending'
        }, async (payload) => {
            const job = payload.new as RenderJob;
            console.log(`\n📬 New job received: ${job.id}`);
            await processJob(job);
        })
        .subscribe();

    console.log('✅ Worker is listening for render jobs...');
}

async function processJob(job: RenderJob) {
    try {
        console.log(`🔄 Processing job: ${job.id}`);
        console.log(`   Job type: ${job.job_type}`);
        console.log(`   Shot ID: ${job.shot_id}`);

        // 1. Update job to processing
        await supabase
            .from('render_jobs')
            .update({ status: 'processing' })
            .eq('id', job.id);

        // 2. Get shot data
        const { data: shot } = await supabase
            .from('shots')
            .select('visual_prompt, project_id, scene_id')
            .eq('id', job.shot_id)
            .single();

        if (!shot) {
            throw new Error('Shot not found');
        }

        // 3. Call external API
        const endpoint = job.job_type === 'render_image' 
            ? `${API_BASE}/api/render/image`
            : `${API_BASE}/api/render/video`;

        console.log(`📤 Calling API: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                shot_id: job.shot_id,
                render_job_id: job.id,
                scene_id: shot.scene_id || job.scene_id,
                project_id: shot.project_id || job.project_id,
                priority: 5
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`📥 API Response:`, result);

        // 4. Update job with result
        await supabase
            .from('render_jobs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
            })
            .eq('id', job.id);

        // 5. Update shot status
        await supabase
            .from('shots')
            .update({ status: 'completed' })
            .eq('id', job.shot_id);

        console.log(`✅ Job ${job.id} completed!`);

    } catch (error: any) {
        console.error(`❌ Job ${job.id} failed:`, error.message);

        // 6. Rollback credits
        if (job.credit_cost && job.project_id) {
            const { data: project } = await supabase
                .from('projects')
                .select('tenant_id')
                .eq('id', job.project_id)
                .single();

            if (project?.tenant_id) {
                await supabase.rpc('add_credits', { 
                    p_amount: job.credit_cost, 
                    p_tenant_id: project.tenant_id 
                });
                console.log(`🔄 Credits rolled back: ${job.credit_cost}`);
            }
        }

        // 7. Update job status to failed
        await supabase
            .from('render_jobs')
            .update({
                status: 'failed',
                error_log: error.message
            })
            .eq('id', job.id);

        // 8. Update shot status
        await supabase
            .from('shots')
            .update({ status: 'failed' })
            .eq('id', job.shot_id);
    }
}

main().catch(console.error);
