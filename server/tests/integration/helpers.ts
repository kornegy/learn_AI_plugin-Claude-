import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fixedClock } from '../../src/core/clock.js';
import { Mentor } from '../../src/services/mentor.js';
import { createServer } from '../../src/mcp/main.js';

export interface Harness {
  root: string;
  workspace: string;
  clock: ReturnType<typeof fixedClock>;
  mentor: Mentor;
  client: Client;
  call(name: string, args?: Record<string, unknown>): Promise<{ text: string; isError: boolean; json: Record<string, unknown> }>;
  close(): Promise<void>;
}

export async function makeHarness(startIso = '2026-10-01T10:00:00Z'): Promise<Harness> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'lm-int-'));
  const root = path.join(base, 'LearningMentor');
  const workspace = path.join(base, 'learning');
  await fs.mkdir(workspace, { recursive: true });
  const clock = fixedClock(startIso);
  const mentor = new Mentor(root, clock);
  const server = createServer(mentor, () => workspace);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return {
    root,
    workspace,
    clock,
    mentor,
    client,
    async call(name, args = {}) {
      const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
      const text = res.content.map((c) => c.text).join('\n');
      const nl = text.indexOf('\n');
      let json: Record<string, unknown> = {};
      if (!res.isError && nl !== -1) {
        try {
          json = JSON.parse(text.slice(nl + 1)) as Record<string, unknown>;
        } catch {
          json = {};
        }
      }
      return { text, isError: !!res.isError, json };
    },
    async close() {
      await client.close();
      await fs.rm(base, { recursive: true, force: true });
    },
  };
}

/** Sets up a learner with a C++ path and an active topic plan. */
export async function seedCpp(h: Harness): Promise<void> {
  await h.call('mentor_init', { workspace_path: h.workspace, language: 'ru' });
  await h.call('mentor_plan_path', {
    subject: 'cpp',
    goal: 'Write small systems programs',
    create_missing: true,
    topics: [
      { topic_id: 'cpp/variables', title: 'Переменные' },
      { topic_id: 'cpp/memory-basics', title: 'Память', prerequisites: ['cpp/variables'] },
      { topic_id: 'cpp/pointers', title: 'Указатели', prerequisites: ['cpp/variables', 'cpp/memory-basics'] },
    ],
  });
  await h.call('mentor_plan_topic', {
    topic_id: 'cpp/pointers',
    goal: 'Use pointers to read and modify values',
    stages: [
      { id: 'why', title: 'Зачем нужны указатели', goal: 'Explain two problems pointers solve', criteria: [{ kind: 'explanation' }] },
      { id: 'deref', title: 'Разыменование', goal: 'Predict *p reads and writes', criteria: [{ kind: 'explanation' }, { kind: 'application' }] },
      { id: 'practice', title: 'Практика', goal: 'Solve a task without hints', criteria: [{ kind: 'application', independent: true }] },
    ],
  });
}
