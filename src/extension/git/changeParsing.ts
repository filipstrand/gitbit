import { Change } from '../protocol/types';

export function parseUncommittedChangesFromPorcelain(stdout: string): Change[] {
  return stdout
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(line => {
      const status = line.substring(0, 2).trim();
      const rest = line.substring(3).trim().replace(/\/+$/, '');
      if (status.startsWith('R')) {
        const [oldPath, newPath] = rest.split(' -> ');
        return { status: 'R' as const, oldPath, path: newPath };
      }
      const char = status[0] !== ' ' ? status[0] : status[1];
      return { status: char as Change['status'], path: rest };
    });
}

export function getDefaultSquashTitle(rangeCommitsOldestFirst: Array<{ subject: string }>): string {
  return rangeCommitsOldestFirst[0]?.subject || 'Squashed commit';
}

