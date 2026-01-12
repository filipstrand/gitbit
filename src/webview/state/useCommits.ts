import { useState, useEffect, useCallback, useMemo } from 'react';
import { Commit, Branch } from '../../extension/protocol/types';
import { request } from './vscode';
import { GraphLayout, GraphCommit } from './GraphLayout';

export function useCommits() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('HEAD');
  const [searchQuery, setSearchQuery] = useState('');
  const hasUncommitted = useMemo(() => commits.some(c => c.sha === 'UNCOMMITTED'), [commits]);

  const filteredCommits = useMemo(() => {
    if (!searchQuery) return commits;
    const query = searchQuery.toLowerCase();
    return commits.filter(c => 
      c.subject.toLowerCase().includes(query) || 
      c.sha.toLowerCase().includes(query) ||
      (c as any).message?.toLowerCase().includes(query)
    );
  }, [commits, searchQuery]);

  const graphCommits = useMemo(() => GraphLayout.compute(filteredCommits), [filteredCommits]);

  const maxLanes = useMemo(() => {
    let max = 0;
    graphCommits.forEach(c => {
      max = Math.max(max, c.lane);
      c.activeLanes.forEach(al => {
        max = Math.max(max, al.lane);
      });
      c.connections.forEach(conn => {
        max = Math.max(max, conn.toLane);
      });
    });
    return max + 1;
  }, [graphCommits]);

  const fetchBranches = useCallback(async () => {
    try {
      const data = await request<Branch[]>('branches/list');
      setBranches(data);
    } catch (err: any) {
      console.error('Failed to fetch branches', err);
    }
  }, []); // No dependency on selectedBranch

  const fetchCommits = useCallback(async (limit = 500, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await request<Commit[]>('commits/list', { limit, branch: selectedBranch });
      setCommits(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedBranch]);

  const refresh = useCallback((silent = false) => {
    fetchBranches();
    fetchCommits(500, silent);
  }, [fetchBranches, fetchCommits]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    fetchCommits();
  }, [fetchCommits]);

  useEffect(() => {
    let timer: any;
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'event/repoChanged') {
        clearTimeout(timer);
        timer = setTimeout(() => {
          refresh(true); // Silent refresh for auto-updates
        }, 200); // 200ms debounce to reduce flickering during rapid changes
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearTimeout(timer);
    };
  }, [refresh]);

  return { 
    commits: graphCommits, 
    maxLanes,
    branches,
    loading, 
    error, 
    hasUncommitted,
    selectedBranch,
    setSelectedBranch,
    searchQuery,
    setSearchQuery,
    refresh
  };
}
