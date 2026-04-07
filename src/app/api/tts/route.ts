import { NextRequest, NextResponse } from 'next/server';
import { Communicate, listVoices } from 'edge-tts-universal';


// get all available voices

export async function GET(request: NextRequest) {
  try {
    const voices = await listVoices();
    return NextResponse.json({ voices });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Failed to fetch voices' }, { status: 500 });
  }
}

// synthesize text to speech

export async function POST(request: Request) {
  try {
    const { text, voice } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const selectedVoice = voice || 'de-DE-AmalaNeural';
    const communicate = new Communicate(text, {
      voice: selectedVoice,
      rate: '-20%',    // Slower speed for better comprehension
      volume: '+20%',  // Louder for clarity
      pitch: '-10Hz'   // Slightly higher pitch for clearer pronunciation
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
