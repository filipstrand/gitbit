import { describe, expect, it } from 'vitest';
import {
  getDefaultSquashTitle,
  parseUncommittedChangesFromPorcelain
} from '../../../src/extension/git/changeParsing';

describe('parseUncommittedChangesFromPorcelain', () => {
  it('parses untracked files with full path and no trailing slash', () => {
    const out = '?? pipelines/fibo_bbq/examples/\n?? pipelines/fibo_fast/examples/simple.py';
    const parsed = parseUncommittedChangesFromPorcelain(out);

    expect(parsed).toEqual([
      { status: '?', path: 'pipelines/fibo_bbq/examples' },
      { status: '?', path: 'pipelines/fibo_fast/examples/simple.py' }
    ]);
  });

  it('parses rename entries and regular status lines', () => {
    const out = 'R  old/name.txt -> new/name.txt\n M src/file.ts';
    const parsed = parseUncommittedChangesFromPorcelain(out);

    expect(parsed).toEqual([
      { status: 'R', oldPath: 'old/name.txt', path: 'new/name.txt' },
      { status: 'M', path: 'src/file.ts' }
    ]);
  });
});

describe('getDefaultSquashTitle', () => {
  it('uses the earliest commit subject in oldest-first range', () => {
    const title = getDefaultSquashTitle([
      { subject: 'earliest commit message' },
      { subject: 'middle commit message' },
      { subject: 'latest commit message' }
    ]);
    expect(title).toBe('earliest commit message');
  });

  it('falls back when no commits are provided', () => {
    expect(getDefaultSquashTitle([])).toBe('Squashed commit');
  });
});

