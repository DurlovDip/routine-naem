import type { CellContent, DayPlan, SessionSlot } from "./types";

export type TeacherCandidate = {
  id: string;
  name: string;
  designation?: string;
};

export type BatchItem = {
  id: string;
  name: string;
};

export type GridAssignment = {
  batchId: string;
  batchName: string;
  sessionIndex: number;
  sessionId: string;
  teacherId: string | null;
  teacherName: string | null;
  conflict?: boolean;
};

export type GenerateGridResult = {
  assignments: GridAssignment[];
  teacherLoad: Record<string, number>;
  totalSlots: number;
  assignedSlots: number;
  unassignedSlots: number;
  hasUnassigned: boolean;
};

type FlowEdge = {
  to: number;
  capacity: number;
  flow: number;
  cost: number;
  rev: number;
};

class MinCostBipartiteMatcher {
  private n: number;
  private graph: FlowEdge[][];

  constructor(n: number) {
    this.n = n;
    this.graph = Array.from({ length: n }, () => []);
  }

  addEdge(from: number, to: number, capacity: number, cost: number) {
    const a: FlowEdge = { to, capacity, flow: 0, cost, rev: this.graph[to].length };
    const b: FlowEdge = { to: from, capacity: 0, flow: 0, cost: -cost, rev: this.graph[from].length };
    this.graph[from].push(a);
    this.graph[to].push(b);
  }

  solve(source: number, sink: number): { flow: number; cost: number } {
    let flow = 0;
    let cost = 0;

    while (true) {
      const dist = Array(this.n).fill(Infinity);
      const parentEdge: Array<FlowEdge | null> = Array(this.n).fill(null);
      const parentNode = Array(this.n).fill(-1);
      const inQueue = Array(this.n).fill(false);
      const queue: number[] = [];

      dist[source] = 0;
      queue.push(source);
      inQueue[source] = true;

      while (queue.length > 0) {
        const u = queue.shift()!;
        inQueue[u] = false;

        for (const edge of this.graph[u]) {
          if (edge.capacity - edge.flow > 0 && dist[edge.to] > dist[u] + edge.cost) {
            dist[edge.to] = dist[u] + edge.cost;
            parentEdge[edge.to] = edge;
            parentNode[edge.to] = u;
            if (!inQueue[edge.to]) {
              queue.push(edge.to);
              inQueue[edge.to] = true;
            }
          }
        }
      }

      if (dist[sink] === Infinity) break;

      // Augment 1 unit of flow along shortest path
      let curr = sink;
      while (curr !== source) {
        const edge = parentEdge[curr]!;
        edge.flow += 1;
        this.graph[edge.to][edge.rev].flow -= 1;
        curr = parentNode[curr];
      }

      flow += 1;
      cost += dist[sink];
    }

    return { flow, cost };
  }

  getMatched(batchCount: number, teacherOffset: number): Map<number, number> {
    const matched = new Map<number, number>();
    for (let b = 0; b < batchCount; b++) {
      const bNode = b + 1;
      for (const edge of this.graph[bNode]) {
        if (edge.flow === 1 && edge.to >= teacherOffset) {
          matched.set(b, edge.to - teacherOffset);
          break;
        }
      }
    }
    return matched;
  }
}

/**
 * Generates a conflict-free teacher routine across sessions and batches.
 * - In any given session s, a teacher cannot be in more than 1 batch.
 * - Respects the teacher's availability: if availability[teacherId][s] === false, teacher is not scheduled in session s.
 * - DIVERSIFIES TEACHERS: Tries not to assign the same teacher to the same batch more than once if possible.
 * - Balances workload fairly among available teachers across the day.
 */
export function generateScheduleGrid({
  sessionCount,
  batches,
  selectedTeachers,
  availability,
}: {
  sessionCount: number;
  batches: BatchItem[];
  selectedTeachers: TeacherCandidate[];
  availability: Record<string, boolean[]>;
}): GenerateGridResult {
  const teacherLoad: Record<string, number> = {};
  selectedTeachers.forEach((t) => {
    teacherLoad[t.id] = 0;
  });

  // Track how many times teacher T has taught batch B across the routine
  const batchTeacherHistory: Record<string, Record<string, number>> = {};
  batches.forEach((b) => {
    batchTeacherHistory[b.id] = {};
  });

  const assignments: GridAssignment[] = [];
  let assignedCount = 0;
  let unassignedCount = 0;

  for (let s = 0; s < sessionCount; s++) {
    const sessionId = `s${s + 1}`;

    // Teachers who are marked as free in session s
    const available = selectedTeachers.filter((t) => {
      const freeList = availability[t.id];
      return freeList ? freeList[s] !== false : true;
    });

    const m = batches.length;
    const k = available.length;

    if (k === 0) {
      // No available teachers for this session
      for (let b = 0; b < m; b++) {
        unassignedCount++;
        assignments.push({
          batchId: batches[b].id,
          batchName: batches[b].name,
          sessionIndex: s,
          sessionId,
          teacherId: null,
          teacherName: null,
          conflict: true,
        });
      }
      continue;
    }

    // Min-cost max flow bipartite matching for this session
    // Nodes:
    // 0: source
    // 1 .. m: batches
    // m + 1 .. m + k: teachers
    // m + k + 1: sink
    const source = 0;
    const teacherOffset = m + 1;
    const sink = m + k + 1;
    const totalNodes = sink + 1;

    const matcher = new MinCostBipartiteMatcher(totalNodes);

    for (let b = 0; b < m; b++) {
      matcher.addEdge(source, 1 + b, 1, 0);
    }

    for (let t = 0; t < k; t++) {
      matcher.addEdge(teacherOffset + t, sink, 1, 0);
    }

    for (let b = 0; b < m; b++) {
      const batchId = batches[b].id;
      for (let t = 0; t < k; t++) {
        const teacher = available[t];
        const timesTaught = batchTeacherHistory[batchId]?.[teacher.id] || 0;
        const load = teacherLoad[teacher.id] || 0;

        // Cost formula:
        // - Heavy penalty for repeat assignment of same teacher to same batch (10,000 per prior class)
        // - Secondary cost for load balancing (10 per total class today)
        const cost = timesTaught * 10000 + load * 10;
        matcher.addEdge(1 + b, teacherOffset + t, 1, cost);
      }
    }

    matcher.solve(source, sink);
    const matched = matcher.getMatched(m, teacherOffset);

    for (let b = 0; b < m; b++) {
      const batch = batches[b];
      const teacherIdx = matched.get(b);

      if (teacherIdx !== undefined && available[teacherIdx]) {
        const teacher = available[teacherIdx];
        assignedCount++;
        teacherLoad[teacher.id] = (teacherLoad[teacher.id] || 0) + 1;
        batchTeacherHistory[batch.id][teacher.id] = (batchTeacherHistory[batch.id][teacher.id] || 0) + 1;

        assignments.push({
          batchId: batch.id,
          batchName: batch.name,
          sessionIndex: s,
          sessionId,
          teacherId: teacher.id,
          teacherName: teacher.name,
          conflict: false,
        });
      } else {
        unassignedCount++;
        assignments.push({
          batchId: batch.id,
          batchName: batch.name,
          sessionIndex: s,
          sessionId,
          teacherId: null,
          teacherName: null,
          conflict: true,
        });
      }
    }
  }

  const totalSlots = sessionCount * batches.length;

  return {
    assignments,
    teacherLoad,
    totalSlots,
    assignedSlots: assignedCount,
    unassignedSlots: unassignedCount,
    hasUnassigned: unassignedCount > 0,
  };
}

/**
 * Applies generated assignments to a DayPlan:
 * - Updates day.cells with assigned teachers
 * - Leaves module code empty for manual selection as requested
 * - Ensures day has required session slots
 */
export function applyGeneratedGridToDay({
  day,
  assignments,
  sessionCount,
}: {
  day: DayPlan;
  assignments: GridAssignment[];
  sessionCount: number;
}): DayPlan {
  // Ensure day has at least sessionCount session slots
  const existingSessionSlots = day.slots.filter((s) => s.kind === "session");
  const slots = [...day.slots];

  if (existingSessionSlots.length < sessionCount) {
    for (let i = existingSessionSlots.length; i < sessionCount; i++) {
      const newSlot: SessionSlot = {
        id: `s${i + 1}`,
        kind: "session",
        durationMin: day.defaultSessionMin || 60,
      };
      slots.push(newSlot);
    }
  }

  // Update cells
  const cells: Record<string, CellContent> = { ...day.cells };

  for (const item of assignments) {
    if (!item.batchId || !item.sessionId) continue;
    const key = `${item.batchId}:${item.sessionId}`;
    const prev = cells[key] || { code: "", note: "", teachers: [] };

    cells[key] = {
      ...prev,
      // Module code remains manual as requested
      code: prev.code || "",
      note: prev.note || "",
      teachers: item.teacherName ? [item.teacherName] : [],
    };
  }

  return {
    ...day,
    slots,
    cells,
  };
}
