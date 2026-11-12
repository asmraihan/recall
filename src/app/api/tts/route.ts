import { NextRequest, NextResponse } from 'next/server';
import { EdgeTTS } from '@andresaya/edge-tts';
import { requireUser } from '@/lib/api-auth';

export const runtime = 'nodejs';

const DEFAULT_VOICE = 'de-DE-AmalaNeural';

// get all available voices
// Authenticated: leaving this open turns a documented API surface into a free
// TTS proxy. Every existing caller sits on a signed-in /dashboard page.

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const voices = await new EdgeTTS().getVoices();
    return NextResponse.json({ voices });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Failed to fetch voices' }, { status: 502 });
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

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const selectedVoice = typeof voice === 'string' && voice.trim() ? voice.trim() : DEFAULT_VOICE;
    const tts = new EdgeTTS();
    await tts.synthesize(text, selectedVoice, {
      rate: normalizeParam(rate, /^[+-]\d+%$/, '-20%'),
      volume: normalizeParam(volume, /^[+-]\d+%$/, '+20%'),
      pitch: normalizeParam(pitch, /^[+-]\d+Hz$/, '-10Hz'),
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
    });

    return NextResponse.json({ audio: tts.toBuffer().toString('base64') });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Failed to generate speech' }, { status: 502 });
  }
}
