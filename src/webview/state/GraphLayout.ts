import { Commit } from '../../extension/protocol/types';

export interface GraphCommit extends Commit {
  lane: number;
  colorLane: number;
  connections: GraphConnection[];
  activeLanes: { lane: number, colorLane: number }[];
  hasChild: boolean;
}

export interface GraphConnection {
  fromLane: number;
  toLane: number;
  type: 'line' | 'merge' | 'fork';
  toSha: string;
  colorLane: number;
}

export class GraphLayout {
  private static COLORS = [
    '#3794ff', '#4ec9b0', '#f48771', '#cca700', '#c586c0', 
    '#b5cea8', '#ce9178', '#569cd6', '#dcdcaa', '#d16969'
  ];

  public static getLaneColor(lane: number): string {
    return this.COLORS[lane % this.COLORS.length];
  }

  public static compute(commits: Commit[]): GraphCommit[] {
    const graphCommits: GraphCommit[] = [];
    const activeLanes: (string | null)[] = []; 
    const colorLanes: number[] = []; // Tracks which color each active lane is using
    const shaToIndex = new Map<string, number>();
    
    commits.forEach((c, i) => shaToIndex.set(c.sha, i));

    let nextColorIdx = 0;

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];

      // Identify which lanes are already active (passed through from the row above)
      const initialActiveLanes = activeLanes
        .map((sha, idx) => (sha !== null) ? { lane: idx, colorLane: colorLanes[idx] } : null)
        .filter((l): l is { lane: number, colorLane: number } => l !== null);

      let lane = activeLanes.indexOf(commit.sha);
      const hasChild = lane !== -1;

      // Determine if this commit should start a new color segment
      // We change color ONLY if it's a branch tip (head or remote)
      const hasBranchRef = commit.refs?.some(r => r.type === 'head' || r.type === 'remote');
      
      if (lane === -1) {
        lane = activeLanes.findIndex(l => l === null);
        if (lane === -1) {
          lane = activeLanes.length;
          activeLanes.push(commit.sha);
          colorLanes.push(nextColorIdx++);
        } else {
          activeLanes[lane] = commit.sha;
          colorLanes[lane] = nextColorIdx++;
        }
      } else if (hasBranchRef) {
        colorLanes[lane] = nextColorIdx++;
      }

      const currentColorIdx = colorLanes[lane];
      const connections: GraphConnection[] = [];
      const lanesToKeepOpen = new Set<number>();
      
      commit.parents.forEach((parentSha, pIdx) => {
        if (shaToIndex.has(parentSha)) {
          let parentLane = activeLanes.indexOf(parentSha);
          if (parentLane === -1) {
             if (pIdx === 0) {
                activeLanes[lane] = parentSha;
                parentLane = lane;
             } else {
                parentLane = activeLanes.findIndex(l => l === null);
                if (parentLane === -1) {
                  parentLane = activeLanes.length;
                  activeLanes.push(parentSha);
                  colorLanes.push(nextColorIdx++);
                } else {
                  activeLanes[parentLane] = parentSha;
                  colorLanes[parentLane] = nextColorIdx++;
                }
             }
          }
          lanesToKeepOpen.add(parentLane);

          connections.push({
            fromLane: lane,
            toLane: parentLane,
            type: pIdx === 0 ? 'line' : 'merge',
            toSha: parentSha,
            colorLane: pIdx === 0 ? currentColorIdx : colorLanes[parentLane]
          });
        }
      });

      // Capture active lanes that pass through from top to bottom
      // We exclude the current commit's lane because it handles its own lines
      const activeAtTop = initialActiveLanes.filter(l => l.lane !== lane);

      graphCommits.push({
        ...commit,
        lane,
        colorLane: currentColorIdx,
        connections,
        activeLanes: activeAtTop,
        hasChild
      });

      // If this lane is not needed for a parent, clear it
      if (!lanesToKeepOpen.has(lane)) {
        activeLanes[lane] = null;
      }
    }

    return graphCommits;
  }
}
