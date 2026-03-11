import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const reposToCleanup: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'GitBit Tests',
      GIT_AUTHOR_EMAIL: 'gitbit-tests@example.com',
      GIT_COMMITTER_NAME: 'GitBit Tests',
      GIT_COMMITTER_EMAIL: 'gitbit-tests@example.com'
    }
  }).trim();
}

function createRepoWithLinearHistory(messages: string[]): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitbit-rewrite-'));
  reposToCleanup.push(repo);
  git(repo, ['init', '-b', 'main']);
  for (const msg of messages) {
    fs.writeFileSync(path.join(repo, `${msg.toLowerCase()}.txt`), `${msg}\n`, 'utf8');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', msg]);
  }
  return repo;
}

afterEach(() => {
  while (reposToCleanup.length > 0) {
    const repo = reposToCleanup.pop()!;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('history rewrite integration (real git)', () => {
  it('squashes two newest commits into one and keeps tip content', () => {
    const repo = createRepoWithLinearHistory(['A', 'B', 'C', 'D']);

    const newest = git(repo, ['rev-parse', 'HEAD']);
    const oldest = git(repo, ['rev-parse', 'HEAD~1']);
    const base = git(repo, ['rev-parse', `${oldest}^`]);

    git(repo, ['checkout', newest]);
    git(repo, ['reset', '--soft', base]);
    git(repo, ['commit', '-m', 'C+D squashed']);
    const squashed = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['checkout', 'main']);
    git(repo, ['reset', '--hard', squashed]);

    expect(git(repo, ['log', '-1', '--format=%s'])).toBe('C+D squashed');
    expect(git(repo, ['rev-list', '--count', 'HEAD'])).toBe('3');
  });

  it('drops a middle commit by replaying newer commits onto parent', () => {
    const repo = createRepoWithLinearHistory(['A', 'B', 'C', 'D']);

    const dropSha = git(repo, ['rev-parse', 'HEAD~1']); // C
    const parentSha = git(repo, ['rev-parse', `${dropSha}^`]); // B
    git(repo, ['rebase', '--onto', parentSha, dropSha, 'main']);

    const subjects = git(repo, ['log', '--format=%s', '-n', '3']).split('\n');
    expect(subjects).toEqual(['D', 'B', 'A']);
  });

  it('reorders commits by replaying selected commits to a new position', () => {
    const repo = createRepoWithLinearHistory(['A', 'B', 'C']);

    const shaA = git(repo, ['rev-parse', 'HEAD~2']);
    const shaB = git(repo, ['rev-parse', 'HEAD~1']);
    const shaC = git(repo, ['rev-parse', 'HEAD']);

    git(repo, ['checkout', '-b', 'reorder-tmp', shaA]);
    git(repo, ['cherry-pick', shaC]);
    git(repo, ['cherry-pick', shaB]);
    const reorderedTip = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['checkout', 'main']);
    git(repo, ['reset', '--hard', reorderedTip]);

    const subjects = git(repo, ['log', '--format=%s', '-n', '3']).split('\n');
    expect(subjects).toEqual(['B', 'C', 'A']);
  });
});

