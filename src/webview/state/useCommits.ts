import { useState, useEffect, useCallback, useMemo } from 'react';
import { Commit, Branch, GlobalSearchGroup, GlobalSearchResponse } from '../../extension/protocol/types';
import { request } from './vscode';
import { GraphLayout, GraphCommit } from './GraphLayout';

const PAGE_SIZE = 500;
type SearchScope = 'context' | 'global';

export function useCommits() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextSkip, setNextSkip] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('--all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('context');
  const [globalGroups, setGlobalGroups] = useState<GlobalSearchGroup[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalTotalMatches, setGlobalTotalMatches] = useState(0);
  const [globalScannedRepos, setGlobalScannedRepos] = useState(0);
  const hasUncommitted = useMemo(() => commits.some(c => c.sha === 'UNCOMMITTED'), [commits]);
  const isGlobalSearchActive = useMemo(
    () => searchScope === 'global' && searchQuery.trim().length > 0,
    [searchScope, searchQuery]
  );

  const filteredCommits = useMemo(() => {
    if (!searchQuery) return commits;
    const query = searchQuery.toLowerCase();
    return commits.filter(c => 
      c.subject.toLowerCase().includes(query) || 
      c.sha.toLowerCase().includes(query) ||
      c.authorName.toLowerCase().includes(query) ||
      c.authorEmail.toLowerCase().includes(query) ||
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

  const fetchCommits = useCallback(async (options?: {
    limit?: number;
    skip?: number;
    silent?: boolean;
    append?: boolean;
  }) => {
    const limit = options?.limit ?? PAGE_SIZE;
    const skip = options?.skip ?? 0;
    const silent = options?.silent ?? false;
    const append = options?.append ?? false;

    if (!silent && !append) setLoading(true);
    if (append) setLoadingMore(true);
    setError(null);
    try {
      const payload: any = { limit, branch: selectedBranch };
      if (skip > 0) payload.skip = skip;
      const data = await request<Commit[]>('commits/list', payload);
      const hasUncommittedRow = skip === 0 && data.length > 0 && data[0].sha === 'UNCOMMITTED';
      const pageCount = hasUncommittedRow ? data.length - 1 : data.length;
      setHasMore(pageCount === limit);
      setNextSkip(skip + limit);
      if (append) {
        setCommits(prev => [...prev, ...data]);
      } else {
        setCommits(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!silent && !append) setLoading(false);
      if (append) setLoadingMore(false);
    }
  }, [selectedBranch]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchCommits({ limit: PAGE_SIZE, skip: nextSkip, silent: true, append: true });
  }, [fetchCommits, hasMore, loading, loadingMore, nextSkip]);

  const refresh = useCallback((silent = false) => {
    fetchBranches();
    setHasMore(true);
    setNextSkip(PAGE_SIZE);
    fetchCommits({ limit: PAGE_SIZE, skip: 0, silent, append: false });
  }, [fetchBranches, fetchCommits]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    if (!isGlobalSearchActive) {
      setGlobalGroups([]);
      setGlobalLoading(false);
      setGlobalTotalMatches(0);
      setGlobalScannedRepos(0);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setGlobalLoading(true);
      try {
        const res = await request<GlobalSearchResponse>('search/global', {
          query: searchQuery.trim()
        });
        if (cancelled) return;
        setGlobalGroups(Array.isArray(res.groups) ? res.groups : []);
        setGlobalTotalMatches(Number(res.totalMatches || 0));
        setGlobalScannedRepos(Number(res.scannedRepos || 0));
      } catch {
        if (cancelled) return;
        setGlobalGroups([]);
        setGlobalTotalMatches(0);
        setGlobalScannedRepos(0);
      } finally {
        if (!cancelled) setGlobalLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isGlobalSearchActive, searchQuery]);

  useEffect(() => {
    setHasMore(true);
    setNextSkip(PAGE_SIZE);
    fetchCommits({ limit: PAGE_SIZE, skip: 0, append: false });
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
    loadingMore,
    hasMore,
    error, 
    hasUncommitted,
    selectedBranch,
    setSelectedBranch,
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    isGlobalSearchActive,
    globalGroups,
    globalLoading,
    globalTotalMatches,
    globalScannedRepos,
    refresh,
    loadMore
  };
}
