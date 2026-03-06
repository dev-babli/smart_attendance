import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getCameraConfig, setCameraConfig } from 'lib/cameraConfigStore';

function isValidVideoSource(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  return s.startsWith('rtsp://') || s.startsWith('http://') || s.startsWith('https://') || s === '0';
}

export async function GET() {
  try {
    const config = await getCameraConfig();
    return NextResponse.json({
      video_source: config?.video_source ?? null,
    });
  } catch {
    return NextResponse.json({ video_source: null });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { video_source } = body;

    if (video_source === null || video_source === undefined || video_source === '') {
      await setCameraConfig({ video_source: null });
      return NextResponse.json({ video_source: null });
    }

    if (!isValidVideoSource(video_source)) {
      return NextResponse.json(
        { error: 'video_source must be rtsp://, http://, https:// URL or 0' },
        { status: 400 }
      );
    }

    const trimmed = video_source.trim();
    await setCameraConfig({ video_source: trimmed });
    return NextResponse.json({ video_source: trimmed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
