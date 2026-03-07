// ============================================
// Render Worker - Uses LISTEN/NOTIFY (no polling!)
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service role key
);

const AI_PROVIDERS = {
  runway: generateRunway,
  pika: generatePika,
  kling: generateKling,
  luma: generateLuma,
};

async function main() {
  console.log('🎬 Render Worker started - listening for jobs...');

  // Listen for new jobs (instead of polling!)
  supabase.channel('render_jobs')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'render_jobs',
      filter: "status=eq.pending"
    }, async (payload) => {
      const job = payload.new as any;
      console.log('📬 New job received:', job?.id);
      await processJob(job);
    })
    .subscribe();

  // Keep alive
  console.log('✅ Worker is listening for render jobs...');
}

async function processJob(job: any) {
  const { id: jobId, shot_id: shotId, provider = 'runway', job_type: jobType } = job;
  
  try {
    // 1. Get shot data
    const { data: shot } = await supabase
      .from('shots')
      .select('*, scenes(*, projects(*))')
      .eq('id', shotId)
      .single();

    if (!shot) throw new Error('Shot not found');

    // 2. Build prompt
    const prompt = buildPrompt(shot);

    // 3. Call AI provider
    const generateFn = AI_PROVIDERS[provider as keyof typeof AI_PROVIDERS];
    if (!generateFn) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Update status to processing
    await supabase.from('render_jobs').update({ status: 'processing' }).eq('id', jobId);
    await supabase.from('shots').update({ status: 'processing' }).eq('id', shotId);

    // 4. Generate (this is async - wait for result)
    const result = await generateFn(prompt, {
      duration: shot.target_duration || 5,
      aspect_ratio: shot.scenes?.projects?.aspect_ratio || '16:9',
    });

    // 5. Update with result
    await supabase.from('shots').update({
      status: 'completed',
      preview_image_url: result.url,
    }).eq('id', shotId);

    await supabase.from('render_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    console.log(`✅ Job ${jobId} completed!`);

  } catch (error: any) {
    console.error(`❌ Job ${jobId} failed:`, error.message);

    // Rollback credits
    const cost = jobType === 'render_video' ? 10 : 2;
    await supabase.rpc('add_credits', { 
      tenant_id: job.tenant_id, 
      amount: cost 
    }).catch(() => {});

    await supabase.from('shots').update({ status: 'failed' }).eq('id', shotId);
    await supabase.from('render_jobs').update({
      status: 'failed',
      error_log: error.message,
    }).eq('id', jobId);
  }
}

function buildPrompt(shot: any): string {
  const parts = [];
  
  if (shot.camera_angle) parts.push(`${shot.camera_angle} shot`);
  if (shot.motion_type && shot.motion_type !== 'Static') {
    parts.push(`with ${shot.motion_type} camera movement`);
  }
  if (shot.focal_length) parts.push(`using ${shot.focal_length} lens`);

  // Parse sfx_prompt for script
  try {
    const script = JSON.parse(shot.sfx_prompt || '{}');
    if (script.action) parts.push(script.action);
    if (script.dialogue?.length) {
      const dialogues = script.dialogue
        .map((d: any) => `${d.character}: "${d.line}"`)
        .join('. ');
      parts.push(dialogues);
    }
  } catch {}

  return parts.join('. ');
}

// AI Provider implementations
async function generateRunway(prompt: string, options: any) {
  const res = await fetch('https://api.runwayml.com/v1/generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, model: 'gen3a', ...options }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Runway API error');
  
  // Wait for generation to complete
  return waitForCompletion(data.id, 'runway');
}

async function generatePika(prompt: string, options: any) {
  const res = await fetch('https://api.pika.art/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PIKA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, ...options }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Pika API error');
  
  return waitForCompletion(data.id, 'pika');
}

async function generateKling(prompt: string, options: any) {
  const res = await fetch('https://api.klingai.com/v1/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.KLING_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'kling-v1', prompt, ...options }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Kling API error');
  
  return waitForCompletion(data.task_id, 'kling');
}

async function generateLuma(prompt: string, options: any) {
  const res = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LUMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, ...options }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Luma API error');
  
  return waitForCompletion(data.generations?.[0]?.id, 'luma');
}

// Poll for completion (or use webhook in production)
async function waitForCompletion(taskId: string, provider: string): Promise<{ url: string }> {
  const maxAttempts = 120; // 2 minutes max
  const delay = 1000; // 1 second
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delay));
    
    const status = await checkStatus(taskId, provider);
    
    if (status.status === 'completed') {
      return { url: status.url };
    }
    if (status.status === 'failed') {
      throw new Error(status.error || 'Generation failed');
    }
  }
  
  throw new Error('Generation timeout');
}

async function checkStatus(taskId: string, provider: string) {
  // Implement status check for each provider
  // This is provider-specific
  return { status: 'completed', url: '' };
}

main();
