import { NextRequest, NextResponse } from 'next/server';
import { Communicate, listVoices } from 'edge-tts-universal';
import { requireUser } from '@/lib/api-auth';


// get all available voices
// Authenticated: leaving this open turns a documented API surface into a free
// TTS proxy. Every existing caller sits on a signed-in /dashboard page.

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const voices = await listVoices();
    return NextResponse.json({ voices });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Failed to fetch voices' }, { status: 500 });
  }
}

// synthesize text to speech

// edge-tts validates these strictly and throws on a bad format:
//   rate/volume must match /^[+-]\d+%$/   (e.g. "+20%", "-10%")
//   pitch must match       /^[+-]\d+Hz$/  (e.g. "+10Hz", "-10Hz")
// Normalize defensively so a missing/malformed value falls back instead of 500ing.
function normalizeParam(value: unknown, pattern: RegExp, fallback: string): string {
  if (typeof value === 'string' && pattern.test(value.trim())) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Tolerate a bare number by applying the fallback's unit and sign
    const unit = fallback.replace(/^[+-]?\d+/, '');
    const normalized = `${value >= 0 ? '+' : ''}${Math.trunc(value)}${unit}`;
    if (pattern.test(normalized)) return normalized;
  }
  return fallback;
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { text, voice, rate, volume, pitch } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const selectedVoice = voice || 'de-DE-AmalaNeural';
    const communicate = new Communicate(text, {
      voice: selectedVoice,
      rate: normalizeParam(rate, /^[+-]\d+%$/, '-20%'),
      volume: normalizeParam(volume, /^[+-]\d+%$/, '+20%'),
      pitch: normalizeParam(pitch, /^[+-]\d+Hz$/, '-10Hz'),
    });

    const buffers: Buffer[] = [];
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio' && chunk.data) {
        buffers.push(chunk.data);
      }
    }

    const audioBuffer = Buffer.concat(buffers);
    const base64Audio = audioBuffer.toString('base64');
    return NextResponse.json({ audio: base64Audio });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Failed to generate speech' }, { status: 500 });
  }
}
