import { describe, expect, it } from 'vitest';
import { GitLogParser } from '../../../src/extension/git/GitLogParser';

describe('GitLogParser', () => {
  it('parses git log lines into commit objects', () => {
    const input = [
      'abc123\tdef456 ghi789\tAlice\talice@example.com\t2026-03-11T10:00:00Z\tfeat: add button\tHEAD -> main, origin/main',
      'def456\t\tBob\tbob@example.com\t2026-03-10T09:00:00Z\tinitial\t'
    ].join('\n');

    const commits = GitLogParser.parseLog(input);
    expect(commits).toHaveLength(2);
    expect(commits[0].sha).toBe('abc123');
    expect(commits[0].parents).toEqual(['def456', 'ghi789']);
    expect(commits[0].subject).toBe('feat: add button');
    expect(commits[1].parents).toEqual([]);
  });

  it('classifies decorations by type', () => {
    const refs = GitLogParser.parseDecorations('HEAD -> main, origin/main, tag: v1.2.3, HEAD');
    expect(refs).toEqual([
      { name: 'main', type: 'head' },
      { name: 'origin/main', type: 'remote' },
      { name: 'v1.2.3', type: 'tag' },
      { name: 'HEAD', type: 'head' }
    ]);
  });
});

