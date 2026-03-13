import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitRunner } from '../../../src/extension/git/GitRunner';

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

import * as cp from 'child_process';

function createFakeChild() {
  const processEmitter = new EventEmitter() as any;
  processEmitter.stdout = new EventEmitter();
  processEmitter.stderr = new EventEmitter();
  processEmitter.kill = vi.fn();
  return processEmitter;
}

describe('GitRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('collects stdout/stderr and strips BOM from stdout', async () => {
    const child = createFakeChild();
    (cp.spawn as any).mockReturnValue(child);
    const runner = new GitRunner('/repo');

    const resultPromise = runner.run(['status']);
    child.stdout.emit('data', Buffer.from('\uFEFFok-output', 'utf8'));
    child.stderr.emit('data', Buffer.from('warn-output', 'utf8'));
    child.emit('close', 0);

    await expect(resultPromise).resolves.toEqual({
      stdout: 'ok-output',
      stderr: 'warn-output',
      exitCode: 0
    });
    expect(cp.spawn).toHaveBeenCalledWith('git', ['--no-pager', 'status'], { cwd: '/repo' });
  });

  it('kills process and rejects when command times out', async () => {
    vi.useFakeTimers();
    const child = createFakeChild();
    (cp.spawn as any).mockReturnValue(child);
    const runner = new GitRunner('/repo');

    const resultPromise = runner.run(['log'], 50);
    const assertion = expect(resultPromise).rejects.toThrow("Command 'git --no-pager log' timed out after 50ms");
    await vi.advanceTimersByTimeAsync(51);

    await assertion;
    expect(child.kill).toHaveBeenCalled();
  });

  it('resolves repo root from a file uri using parent directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbit-runner-'));
    const filePath = path.join(tmpDir, 'file.ts');
    fs.writeFileSync(filePath, 'x', 'utf8');
    const runSpy = vi.spyOn(GitRunner.prototype, 'run').mockResolvedValue({
      stdout: '/real/repo\n',
      stderr: '',
      exitCode: 0
    });

    const root = await GitRunner.getRepoRoot({ fsPath: filePath } as any);

    expect(root).toBe('/real/repo');
    expect(runSpy).toHaveBeenCalledWith(['rev-parse', '--show-toplevel']);
    expect((runSpy.mock.instances[0] as unknown as GitRunner).cwd).toBe(fs.realpathSync(tmpDir));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when rev-parse fails', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbit-runner-fail-'));
    vi.spyOn(GitRunner.prototype, 'run').mockResolvedValue({
      stdout: '',
      stderr: 'not a repo',
      exitCode: 1
    });

    const root = await GitRunner.getRepoRoot({ fsPath: tmpDir } as any);
    expect(root).toBeUndefined();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
