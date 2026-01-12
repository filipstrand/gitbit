export interface Commit {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDateIso: string;
  subject: string;
  decorations: string;
  refs?: Ref[];
}

export interface Ref {
  name: string;
  type: 'head' | 'remote' | 'tag' | 'other';
}

export interface Branch {
  name: string;
  remote: boolean;
  current: boolean;
}

export interface Change {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
  oldPath?: string;
}

export interface RepoInfo {
  root: string;
  label: string;
  /**
   * Unix timestamp in seconds of the latest commit in the repo (0 if unknown / no commits).
   * Used for sorting the repo dropdown by "most recently updated".
   */
  lastCommitUnix?: number;
  /**
   * True when the repo has any uncommitted changes (including untracked files).
   */
  hasUncommittedChanges?: boolean;
  /**
   * Current branch name for the repo (e.g. "main"). If the repo is in detached HEAD state,
   * this may be "detached".
   */
  currentBranch?: string;
}

export type SelectionMode = 'single' | 'range';

export interface SelectionState {
  mode: SelectionMode;
  anchorSha?: string;
  selectedShas: string[];
  range?: {
    oldestSha: string;
    newestSha: string;
    baseSha: string;
  };
}

export interface RequestMessage {
  type: string;
  requestId: string;
  payload?: any;
}

export interface ResponseMessage {
  type: 'ok' | 'error';
  requestId: string;
  data?: any;
  message?: string;
  details?: string;
}

export interface EventMessage {
  type: 'event/repoChanged';
  payload?: any;
}

export type Message = RequestMessage | ResponseMessage | EventMessage;
