import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('src') || '';
  if (!raw.startsWith('/images/') || raw.includes('..') || raw.includes('\\')) {
    return new Response('Forbidden', { status: 403 });
  }
  const managerRoot = process.env.XHS_MANAGER_ROOT ?? process.cwd();
  const publicRoot = path.resolve(managerRoot, '..', 'YZBlogs', 'public');
  const target = path.resolve(publicRoot, raw.slice(1));
  if (!target.startsWith(publicRoot + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  const ext = path.extname(target).toLowerCase();
  const contentType = MIME_MAP[ext];
  if (!contentType) {
    return new Response('Unsupported type', { status: 415 });
  }
  try {
    const data = await fs.readFile(target);
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
