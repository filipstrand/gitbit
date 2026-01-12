import { useState, useEffect, useCallback } from 'react';
import { Change } from '../../extension/protocol/types';
import { request } from './vscode';

export interface CommitDetails {
  sha: string;
  authorName: string;
  authorEmail: string;
  authorDateIso: string;
  subject: string;
  message: string;
  parents: string[];
}

export function useCommitDetails(sha: string | null) {
  const [details, setDetails] = useState<CommitDetails | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (silent = false) => {
    if (!sha) {
      setDetails(null);
      setChanges([]);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const [d, c] = await Promise.all([
        request<CommitDetails>('commit/details', { sha }),
        request<Change[]>('commit/changes', { sha })
      ]);
      setDetails(d);
      setChanges(c);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sha]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    let timer: any;
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'event/repoChanged' && sha) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          fetch(true); // Silent refresh for auto-updates
        }, 250); // Slightly more delay than the main list to ensure the backend is ready
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearTimeout(timer);
    };
  }, [fetch, sha]);

  return { details, changes, loading };
}
