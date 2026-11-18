"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { number } from "@/lib/format";
import type { Matrices, System } from "@/lib/api";

export function SystemGraph({
  model,
  matrices,
  light,
  onConnect,
  onSelect,
  compact = false,
}: {
  model: System;
  matrices?: Matrices;
  light: boolean;
  compact?: boolean;
  onConnect?: (value: Connection) => void;
  onSelect?: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const modules = model.modules.map((item) => ({
      id: item.id,
      label: item.name,
    }));
    const terminal = [
      { id: "SUCCESS", label: "Успіх" },
      { id: "FAILURE", label: "Відмова" },
    ];
    let links = (model.transitions ?? []).map((e) => ({
      ...e,
      probability: e.probability,
    }));
    if (matrices && !matrices.routing) {
      links = matrices.matrix.flatMap((row, i) =>
        i >= modules.length
          ? []
          : row.flatMap((weight, j) =>
              weight > 0
                ? [
                    {
                      source: matrices.states[i],
                      target: matrices.states[j],
                      probability: weight,
                    },
                  ]
                : [],
            ),
      );
    }
    if (!compact && (!matrices || matrices.routing)) {
      links.push(
        ...model.modules
          .filter((item) => (item.reliability ?? 0.99) < 1)
          .map((item) => ({
            source: item.id,
            target: "FAILURE",
            probability: 1 - (item.reliability ?? 0.99),
          })),
      );
    }
    const nodes: Node[] = [
      ...modules,
      ...terminal.filter((t) => !compact || t.id === "SUCCESS"),
    ].map((item, index) => ({
      id: item.id,
      data: { label: item.label },
      position: {
        x: (index % (compact ? 2 : 3)) * 220,
        y: Math.floor(index / (compact ? 2 : 3)) * 125,
      },
      className:
        item.id === "SUCCESS"
          ? "flow-node flow-success"
          : item.id === "FAILURE"
            ? "flow-node flow-failure"
            : "flow-node",
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    }));
    const allowed = new Set(nodes.map((n) => n.id));
    const edges: Edge[] = links
      .filter(
        (e) =>
          e.probability > 0 && allowed.has(e.source) && allowed.has(e.target),
      )
      .map((e, index) => ({
        id: `${e.source}-${e.target}-${index}`,
        source: e.source,
        target: e.target,
        type: e.source === e.target ? "straight" : "smoothstep",
        label: compact ? undefined : number(e.probability),
        labelBgStyle: { fill: light ? "#fff" : "#192a40", fillOpacity: 1 },
        labelStyle: { fill: light ? "#23456d" : "#cce0f6" },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.target === "FAILURE" ? "#dc7b85" : "#5f9fe9",
        },
        style: {
          stroke: e.target === "FAILURE" ? "#b26675" : "#5f9fe9",
          strokeWidth: 1.5,
        },
      }));
    return { nodes, edges };
  }, [model, matrices, compact, light]);

  return (
    <div className={`flow ${compact ? "flow-compact" : ""}`}>
      <ReactFlow
        key={nodes.map((n) => n.id).join("|")}
        nodes={nodes}
        edges={edges}
        colorMode={light ? "light" : "dark"}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.15}
        maxZoom={1.7}
        nodesConnectable={Boolean(onConnect)}
        onConnect={onConnect}
        onNodeClick={(_, node) => onSelect?.(node.id)}
        preventScrolling={false}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1.2} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
