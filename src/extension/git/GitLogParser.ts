import { Commit, Ref } from '../protocol/types';

export class GitLogParser {
  public static parseLog(stdout: string): Commit[] {
    const lines = stdout.split('\n').filter(line => line.trim().length > 0);
    return lines.map(line => {
      const parts = line.split('\t');
      if (parts.length < 7) return null;
      const [sha, parentsRaw, authorName, authorEmail, authorDateIso, subject, decorations] = parts;
      return {
        sha,
        parents: parentsRaw ? parentsRaw.split(' ') : [],
        authorName,
        authorEmail,
        authorDateIso,
        subject,
        decorations: decorations || ''
      };
    }).filter((c): c is Commit => c !== null);
  }

  public static parseDecorations(decorations: string): Ref[] {
    if (!decorations) return [];
    // Format: "HEAD -> master, origin/master, tag: v1.0"
    return decorations.split(', ').map(part => {
      let name = part.trim();
      let type: Ref['type'] = 'other';
      if (name.startsWith('HEAD -> ')) {
        name = name.substring(8);
        type = 'head';
      } else if (name.startsWith('tag: ')) {
        name = name.substring(5);
        type = 'tag';
      } else if (name.includes('/')) {
        type = 'remote';
      } else if (name === 'HEAD') {
        type = 'head';
      }
      return { name, type };
    });
  }
}
