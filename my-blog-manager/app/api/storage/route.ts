import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

type FileEntry = { name: string; relPath: string; bytes: number };

async function walkDir(dir: string, rootDir: string, ignoreDirs: Set<string>): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(full, rootDir, ignoreDirs)));
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        results.push({
          name: entry.name,
          relPath: path.relative(rootDir, full).replaceAll('\\', '/'),
          bytes: stat.size,
        });
      } catch {
        // Ignore transient unreadable files
      }
    }
  }
  return results;
}

export async function GET() {
  const managerRoot = process.env.XHS_MANAGER_ROOT ?? process.cwd();
  const repoRoot = path.resolve(managerRoot, '..');
  const siteRoot = path.join(repoRoot, 'YZBlogs');
  const gitRoot = path.join(repoRoot, '.git');

  const ignoreSite = new Set(['node_modules', '.next', 'out']);
  const [gitFiles, siteFiles] = await Promise.all([
    walkDir(gitRoot, repoRoot, new Set()),
    walkDir(siteRoot, siteRoot, ignoreSite),
  ]);

  const gitBytes = gitFiles.reduce((sum, f) => sum + f.bytes, 0);
  const siteBytes = siteFiles.reduce((sum, f) => sum + f.bytes, 0);
  const publicFiles = siteFiles.filter(f => f.relPath.startsWith('public/'));
  const publicBytes = publicFiles.reduce((sum, f) => sum + f.bytes, 0);
  const musicFiles = publicFiles.filter(f => f.relPath.startsWith('public/music/'));
  const musicBytes = musicFiles.reduce((sum, f) => sum + f.bytes, 0);
  const briefingCoverFiles = publicFiles.filter(f => f.relPath.startsWith('public/images/briefing/'));
  const briefingCoverBytes = briefingCoverFiles.reduce((sum, f) => sum + f.bytes, 0);

  const largestFiles = [...siteFiles]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);

  return Response.json(
    {
      checkedAt: new Date().toISOString(),
      git: { bytes: gitBytes, fileCount: gitFiles.length, softLimitBytes: 1024 * 1024 * 1024 },
      site: { bytes: siteBytes, fileCount: siteFiles.length, cfFileLimit: 20000, cfMaxFileBytes: 25 * 1024 * 1024 },
      breakdown: {
        publicBytes,
        publicCount: publicFiles.length,
        musicBytes,
        musicCount: musicFiles.length,
        briefingCoverBytes,
        briefingCoverCount: briefingCoverFiles.length,
        otherPublicBytes: Math.max(0, publicBytes - musicBytes - briefingCoverBytes),
      },
      largestFiles,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
