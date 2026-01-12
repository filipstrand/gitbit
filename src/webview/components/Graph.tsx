import React from 'react';
import { GraphCommit, GraphLayout } from '../state/GraphLayout';

interface GraphProps {
  commit: GraphCommit;
}

const LANE_WIDTH = 12;
const RADIUS = 4;
const BASE_ROW_HEIGHT = 24;
const GRAPH_OFFSET = 20;

export const Graph: React.FC<GraphProps> = ({ commit }) => {
  const rowHeight = BASE_ROW_HEIGHT;
  return (
    <svg 
      width="100%"
      height={rowHeight}
      style={{ display: 'block' }}
    >
      {/* Vertical lines for active lanes passing through */}
      {commit.activeLanes.map(l => (
        <line 
          key={l.lane}
          x1={l.lane * LANE_WIDTH + GRAPH_OFFSET} 
          y1={0} 
          x2={l.lane * LANE_WIDTH + GRAPH_OFFSET} 
          y2={rowHeight} 
          stroke={GraphLayout.getLaneColor(l.colorLane)} 
          strokeWidth="2" 
        />
      ))}

      {/* Connections FROM this commit to parents */}
      {commit.connections.map((conn, i) => {
        const x1 = commit.lane * LANE_WIDTH + GRAPH_OFFSET;
        const x2 = conn.toLane * LANE_WIDTH + GRAPH_OFFSET;
        const color = GraphLayout.getLaneColor(conn.colorLane);
        
        if (conn.fromLane === conn.toLane) {
          return (
            <line 
              key={i}
              x1={x1} y1={rowHeight/2} 
              x2={x1} y2={rowHeight} 
              stroke={color} 
              strokeWidth="2" 
            />
          );
        } else {
          // Smooth Bezier curve to parent in different lane
          // Using monotonic Y-coordinates to avoid kinks (12 -> 17 -> 21 -> 24)
          const cp1y = rowHeight * 0.7;
          const cp2y = rowHeight * 0.85;
          const d = `M ${x1} ${rowHeight / 2} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${rowHeight}`;
          return (
            <path 
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="2"
            />
          );
        }
      })}

      {/* Connection TO this commit from child above (if it exists) */}
      {commit.hasChild && (
        <line 
          x1={commit.lane * LANE_WIDTH + GRAPH_OFFSET} 
          y1={0} 
          x2={commit.lane * LANE_WIDTH + GRAPH_OFFSET} 
          y2={rowHeight/2} 
          stroke={GraphLayout.getLaneColor(commit.colorLane)} 
          strokeWidth="2" 
        />
      )}

      {/* Commit dot */}
      <circle 
        cx={commit.lane * LANE_WIDTH + GRAPH_OFFSET} 
        cy={rowHeight/2} 
        r={RADIUS} 
        fill={commit.sha === 'UNCOMMITTED' ? 'none' : GraphLayout.getLaneColor(commit.colorLane)} 
        stroke={GraphLayout.getLaneColor(commit.colorLane)}
        strokeWidth={commit.sha === 'UNCOMMITTED' ? '2' : '1'}
      />
      {commit.sha === 'UNCOMMITTED' && (
        <circle 
          cx={commit.lane * LANE_WIDTH + GRAPH_OFFSET} 
          cy={rowHeight/2} 
          r={RADIUS - 2} 
          fill="var(--vscode-editor-background)"
        />
      )}
    </svg>
  );
};
