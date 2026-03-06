import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Persistent store for camera config (video_source).
 * Uses Vercel KV when KV_REST_API_URL is set; else JSON file under ./data.
 */

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'cameraConfig.json');
const KV_KEY = 'camera_config';

export interface CameraConfig {
  video_source: string | null;
}

function hasKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readFromKV(): Promise<CameraConfig | null> {
  try {
    const { kv } = await import('@vercel/kv');
    const raw = await kv.get<CameraConfig>(KV_KEY);
    if (raw && typeof raw === 'object' && 'video_source' in raw) {
      return raw as CameraConfig;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeToKV(config: CameraConfig): Promise<void> {
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(KV_KEY, config);
  } catch {
    // ignore
  }
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readFromDisk(): CameraConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) return null;
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'video_source' in parsed) {
      return parsed as CameraConfig;
    }
    return null;
  } catch {
    return null;
  }
}

function writeToDisk(config: CameraConfig): void {
  try {
    ensureDir();
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export async function getCameraConfig(): Promise<CameraConfig | null> {
  return hasKV() ? await readFromKV() : readFromDisk();
}

export async function setCameraConfig(config: CameraConfig): Promise<void> {
  if (hasKV()) {
    await writeToKV(config);
  } else {
    writeToDisk(config);
  }
}
