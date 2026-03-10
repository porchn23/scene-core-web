import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    let ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    let ollamaModel = process.env.DEFAULT_MODEL || 'gpt-oss:20b-cloud';
    
    // Strip "ollama/" prefix if present
    if (ollamaModel.startsWith('ollama/')) {
        ollamaModel = ollamaModel.replace('ollama/', '');
    }
    
    try {
        const { prompt, system } = await request.json();
        
        console.log(`[AI] Calling Ollama at ${ollamaUrl} with model ${ollamaModel}`);
        
        const ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                messages: [
                    { role: 'system', content: system || 'You are an expert film director with deep knowledge of cinematography, shot composition, and storytelling.' },
                    { role: 'user', content: prompt }
                ],
                stream: false
            })
        });

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();
            console.error(`[AI] Ollama error (${ollamaResponse.status}):`, errorText);
            return NextResponse.json(
                { error: `Ollama error (${ollamaResponse.status}): ${errorText}` },
                { status: 500 }
            );
        }

        const data = await ollamaResponse.json();
        const result = data.message?.content || '';
        
        console.log(`[AI] Success, result:`, result.substring(0, 200));
        
        return NextResponse.json({ result });
    } catch (error: any) {
        console.error('[AI] Request failed:', error.message);
        return NextResponse.json(
            { error: `AI request failed: ${error.message}. Make sure Ollama is running at ${ollamaUrl}` },
            { status: 500 }
        );
    }
}
