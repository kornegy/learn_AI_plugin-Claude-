/** Checks the plugin's model-facing content against platform limits (RESEARCH.md §2.1). */
import { describe, it, expect } from 'vitest';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/mcp/tools.js';
import type { Mentor } from '../../src/services/mentor.js';

const ROOT = path.resolve(__dirname, '../../..');
const PORTABLE_SKILL_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

function frontmatter(raw: string): Record<string, unknown> {
  const text = raw.replace(/\r\n/g, '\n'); // tolerate CRLF checkouts
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('no frontmatter');
  return YAML.parse(m[1]!) as Record<string, unknown>;
}

async function mdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await mdFiles(p)));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function toolNames(): string[] {
  const names: string[] = [];
  const fake = { registerTool: (name: string) => names.push(name) } as unknown as McpServer;
  registerTools(fake, {} as Mentor, () => '/');
  return names;
}

describe('skills', async () => {
  const skillDirs = (await fs.readdir(path.join(ROOT, 'skills'))).sort();

  it('has the four skills', () => {
    expect(skillDirs).toEqual(['assess', 'code-mentor', 'mentor', 'source-research']);
  });

  it.each(skillDirs)('%s: portable frontmatter, size limits, working links', async (dir) => {
    const file = path.join(ROOT, 'skills', dir, 'SKILL.md');
    const text = (await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n');
    const fm = frontmatter(text);
    expect(fm.name).toBe(dir);
    for (const key of Object.keys(fm)) expect(PORTABLE_SKILL_KEYS.has(key), `non-portable key "${key}"`).toBe(true);
    expect(String(fm.description).length).toBeLessThanOrEqual(1024);
    expect(text.split('\n').length).toBeLessThan(500);
    expect(text.length).toBeLessThan(20_000); // ≈ 5k tokens: survives compaction
    for (const [, link] of text.matchAll(/\]\(([^)#]+)\)/g)) {
      if (/^https?:/.test(link!)) continue;
      expect(existsSync(path.join(ROOT, 'skills', dir, link!)), `${dir}: broken link ${link}`).toBe(true);
    }
  });

  it('assess and mentor share the same assessment rubric', async () => {
    const a = await fs.readFile(path.join(ROOT, 'skills/mentor/references/assessment.md'), 'utf8');
    const b = await fs.readFile(path.join(ROOT, 'skills/assess/references/assessment.md'), 'utf8');
    expect(b).toBe(a);
  });
});

describe('commands, agents, output styles', () => {
  it('every command has a description', async () => {
    const files = (await fs.readdir(path.join(ROOT, 'commands'))).sort();
    expect(files).toEqual(['export.md', 'forget.md', 'plan.md', 'reflect.md', 'research.md', 'review.md', 'settings.md', 'start.md', 'status.md']);
    for (const f of files) expect(String(frontmatter(await fs.readFile(path.join(ROOT, 'commands', f), 'utf8')).description).length).toBeGreaterThan(20);
  });

  it('the researcher agent is read-only', async () => {
    const fm = frontmatter(await fs.readFile(path.join(ROOT, 'agents/researcher.md'), 'utf8'));
    expect(fm.tools).toBe('WebSearch, WebFetch');
  });

  it('the output style is never forced on users', async () => {
    const fm = frontmatter(await fs.readFile(path.join(ROOT, 'output-styles/mentor.md'), 'utf8'));
    expect(fm['force-for-plugin']).toBeUndefined();
  });
});

describe('cross references', () => {
  it('every mentor_* tool mentioned in content exists', async () => {
    const tools = new Set(toolNames());
    expect(tools.size).toBe(21);
    const files = [...(await mdFiles(path.join(ROOT, 'skills'))), ...(await mdFiles(path.join(ROOT, 'commands'))), ...(await mdFiles(path.join(ROOT, 'output-styles')))];
    for (const f of files) {
      const text = await fs.readFile(f, 'utf8');
      for (const [name] of text.matchAll(/\bmentor_[a-z_]+\b/g)) {
        if (name === 'mentor_') continue;
        expect(tools.has(name), `${path.relative(ROOT, f)} mentions unknown tool ${name}`).toBe(true);
      }
    }
  });

  it('plugin layout is installable everywhere: no top-level bin/, config points at built files', async () => {
    expect(existsSync(path.join(ROOT, 'bin'))).toBe(false);
    const mcp = JSON.parse(await fs.readFile(path.join(ROOT, '.mcp.json'), 'utf8'));
    const hooks = JSON.parse(await fs.readFile(path.join(ROOT, 'hooks/hooks.json'), 'utf8'));
    const hookArgs = Object.values(hooks.hooks as Record<string, { hooks: { args: string[] }[] }[]>).flatMap((groups) =>
      groups.flatMap((g) => g.hooks.flatMap((x) => x.args)),
    );
    const files = [...mcp.mcpServers['learning-mentor'].args, ...hookArgs].filter((a: string) => a.startsWith('${CLAUDE_PLUGIN_ROOT}'));
    expect(files.length).toBe(3);
    for (const f of files) expect(existsSync(f.replace('${CLAUDE_PLUGIN_ROOT}', ROOT)), f).toBe(true);
  });

  it('plugin.json and server package agree on the version', async () => {
    const plugin = JSON.parse(await fs.readFile(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'server/package.json'), 'utf8'));
    expect(plugin.version).toBe(pkg.version);
  });
});

/**
 * The automated checks of Anthropic's plugin directory (docs/DIRECTORY_SUBMISSION.md). A failure here
 * would block a submission, stop validation, or hold the plugin for a reviewer.
 */
describe('plugin directory rules', () => {
  const tracked = (): { mode: string; file: string }[] | null => {
    try {
      const out = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: ROOT, encoding: 'utf8' });
      return out
        .split('\0')
        .filter(Boolean)
        .map((line) => ({ mode: line.split(' ')[0]!, file: line.split('\t')[1]! }));
    } catch {
      return null; // not a git checkout (e.g. an installed copy): nothing to check
    }
  };

  it('repository layout: file count, sizes, names, no symlinks or system files', async () => {
    const files = tracked();
    if (!files) return;
    expect(files.length).toBeLessThanOrEqual(512);
    const seen = new Set<string>();
    for (const { mode, file } of files) {
      expect(mode, `${file} must be a regular file, not a symlink or submodule`).toMatch(/^100(644|755)$/);
      const base = path.posix.basename(file);
      expect(['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(base) || file.includes('__MACOSX'), file).toBe(false);
      for (const part of file.split('/')) {
        expect(part, `${file}: name must be valid on Windows and macOS`).not.toMatch(/[:<>"|?*]|[. ]$/);
        expect(part.split('.')[0]!.toLowerCase(), file).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)$/);
      }
      expect(seen.has(file.toLowerCase()), `${file} differs from another file only by case`).toBe(false);
      seen.add(file.toLowerCase());
      expect(path.extname(file).toLowerCase(), `${file}: binary type the directory can't inspect`).not.toMatch(
        /^\.(ico|pdf|zip|gz|tgz|exe|dll|so|dylib|node|wasm|mcpb|dxt|bin)$/,
      );
      const size = (await fs.stat(path.join(ROOT, file))).size;
      expect(size, `${file} is over the directory's 5 MiB limit`).toBeLessThan(5 * 1024 * 1024);
    }
  });

  it('no .gitattributes rules that rewrite files, no root lockfile install', () => {
    expect(existsSync(path.join(ROOT, '.gitattributes'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'package.json'))).toBe(false);
  });

  it('listing fields point at real files and https pages', async () => {
    const plugin = JSON.parse(await fs.readFile(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
    expect(plugin.name).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
    expect(plugin.description && plugin.author?.name && plugin.version && plugin.license).toBeTruthy();
    const icon = await fs.readFile(path.join(ROOT, plugin.icon));
    expect(icon.subarray(1, 4).toString('ascii')).toBe('PNG');
    for (const key of ['homepage', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl']) {
      expect(plugin[key], key).toMatch(/^https:\/\/github\.com\/kornegy\/learn_AI_plugin-Claude-/);
    }
    const readme = (await fs.readFile(path.join(ROOT, 'README.md'), 'utf8')).replace(/```[\s\S]*?```/g, '');
    expect(readme.split(/\s+/).filter(Boolean).length).toBeGreaterThan(40);
  });

  it('shipped bundles are readable, not minified, and come with license notices', async () => {
    const dist = path.join(ROOT, 'server/dist');
    const files = [
      ...(await fs.readdir(dist)).map((f) => path.join(dist, f)),
      ...(await fs.readdir(path.join(dist, 'chunks'))).map((f) => path.join(dist, 'chunks', f)),
    ].filter((f) => f.endsWith('.mjs'));
    for (const f of files) {
      const lines = (await fs.readFile(f, 'utf8')).split('\n');
      const avg = lines.reduce((n, l) => n + l.length, 0) / lines.length;
      expect(avg, `${f} looks minified`).toBeLessThan(80);
    }
    const notices = await fs.readFile(path.join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    for (const dep of ['@modelcontextprotocol/sdk', 'zod', 'yaml', 'ts-fsrs']) expect(notices).toContain(`## ${dep} `);
  });
});
