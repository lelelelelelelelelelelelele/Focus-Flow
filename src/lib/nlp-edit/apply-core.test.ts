import { describe, it, expect } from 'vitest';
import type { Task, Zone } from '@/types';
import type { EditOp } from './schema';
import { planOps, OP_LIMIT, type Snapshot } from './apply-core';

// ---- 最小构造器（照 file-mirror-core.test.ts 风格） ----
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    zoneId: 'z1',
    parentId: null,
    isCollapsed: false,
    title: id,
    description: '',
    completed: false,
    priority: 'medium',
    urgency: 'low',
    deadline: null,
    deadlineType: 'none',
    order: 0,
    createdAt: 0,
    expanded: false,
    totalWorkTime: 0,
    ...over,
  };
}

function zone(id: string, over: Partial<Zone> = {}): Zone {
  return { id, color: '#fff', order: 0, createdAt: 0, ...over };
}

function snap(zones: Zone[], tasks: Task[]): Snapshot {
  return { zones, tasks };
}

// ============ happy path：add_task ============
describe('planOps · add_task（happy path）', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('合法 add → plan + added 预览 + add action', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 'new' }]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toEqual([
      {
        kind: 'add',
        zoneId: 'z1',
        title: 'new',
        description: undefined,
        priority: undefined,
        deadline: undefined,
        deadlineType: undefined,
        parentId: null,
      },
    ]);
    expect(r.diff.added).toEqual([{ zoneId: 'z1', title: 'new', parentId: null }]);
    expect(r.hasDeletes).toBe(false);
  });

  it('add 到已存在 parent → 合法', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 'child', parentId: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind === 'plan') expect(r.diff.added[0].parentId).toBe('a');
  });
});

// ============ happy path：update_task ============
describe('planOps · update_task（happy path）', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('partial 更新 → 仅携带改动字段（不含 id/op）', () => {
    const r = planOps(s, [
      { op: 'update_task', id: 'a', title: 'X', priority: 'high' },
    ]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toEqual([
      { kind: 'update', id: 'a', updates: { title: 'X', priority: 'high' } },
    ]);
    expect(r.diff.updated).toEqual([{ id: 'a', changes: { title: 'X', priority: 'high' } }]);
  });
});

// ============ happy path：delete_task + 级联 ============
describe('planOps · delete_task（happy path + 级联）', () => {
  it('删叶子 → removedIds 仅自身，cascadeCount 0', () => {
    const s = snap([zone('z1')], [task('a')]);
    const r = planOps(s, [{ op: 'delete_task', id: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.diff.deleted.removedIds).toEqual(['a']);
    expect(r.diff.deleted.cascadeCount).toBe(0);
    expect(r.hasDeletes).toBe(true);
    expect(r.deleteCount).toBe(1);
  });

  it('删父 → 级联展开整棵子树，cascadeCount 反映额外删除数', () => {
    // a -> b -> c, a -> d ；删 a 应连带 b/c/d（共 4）
    const s = snap(
      [zone('z1')],
      [
        task('a'),
        task('b', { parentId: 'a' }),
        task('c', { parentId: 'b' }),
        task('d', { parentId: 'a' }),
      ],
    );
    const r = planOps(s, [{ op: 'delete_task', id: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.diff.deleted.requestedIds).toEqual(['a']);
    expect([...r.diff.deleted.removedIds].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.diff.deleted.cascadeCount).toBe(3); // b,c,d 额外
    expect(r.deleteCount).toBe(4);
  });

  it('删父+子重叠 → removedIds 去重，不重复计数', () => {
    const s = snap([zone('z1')], [task('a'), task('b', { parentId: 'a' })]);
    const r = planOps(s, [
      { op: 'delete_task', id: 'a' },
      { op: 'delete_task', id: 'b' },
    ]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect([...r.diff.deleted.removedIds].sort()).toEqual(['a', 'b']);
    expect(r.deleteCount).toBe(2);
  });
});

// ============ 混合 op happy path ============
describe('planOps · 混合 op', () => {
  it('add+update+delete 同批 → actions 顺序保持', () => {
    const s = snap([zone('z1')], [task('a'), task('b')]);
    const ops: EditOp[] = [
      { op: 'add_task', zoneId: 'z1', title: 'n' },
      { op: 'update_task', id: 'a', completed: true },
      { op: 'delete_task', id: 'b' },
    ];
    const r = planOps(s, ops);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions.map((x) => x.kind)).toEqual(['add', 'update', 'delete']);
    expect(r.diff.added).toHaveLength(1);
    expect(r.diff.updated).toHaveLength(1);
    expect(r.deleteCount).toBe(1);
  });
});

// ============ 护栏：空 ops ============
describe('planOps · 护栏 · 空 ops', () => {
  it('空数组 → noop（合法，不落地）', () => {
    expect(planOps(snap([zone('z1')], []), []).kind).toBe('noop');
  });
});

// ============ 护栏：未知 id（不静默） ============
describe('planOps · 护栏 · 未知 id', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('update 未知 id → UNKNOWN_TASK_ID', () => {
    const r = planOps(s, [{ op: 'update_task', id: 'nope', title: 'x' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('UNKNOWN_TASK_ID');
      expect(r.error.opIndex).toBe(0);
    }
  });

  it('delete 未知 id → UNKNOWN_TASK_ID（不静默跳过）', () => {
    const r = planOps(s, [{ op: 'delete_task', id: 'ghost' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_TASK_ID');
  });
});

// ============ 护栏：bad zoneId ============
describe('planOps · 护栏 · 未知 zoneId', () => {
  it('add 到不存在 zone → UNKNOWN_ZONE_ID', () => {
    const r = planOps(snap([zone('z1')], []), [
      { op: 'add_task', zoneId: 'zX', title: 't' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_ZONE_ID');
  });
});

// ============ 护栏：bad parentId ============
describe('planOps · 护栏 · 未知 parentId', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('add 到不存在 parent → UNKNOWN_PARENT_ID', () => {
    const r = planOps(s, [
      { op: 'add_task', zoneId: 'z1', title: 't', parentId: 'missing' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
  });

  it('update 设到不存在 parent → UNKNOWN_PARENT_ID', () => {
    const r = planOps(s, [{ op: 'update_task', id: 'a', parentId: 'missing' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
  });

  it('parentId 显式 null 合法（顶级任务）', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 't', parentId: null }]);
    expect(r.kind).toBe('plan');
  });
});

// ============ 护栏：超上限 ============
describe('planOps · 护栏 · op 数量上限', () => {
  it(`> OP_LIMIT(${OP_LIMIT}) → OP_LIMIT_EXCEEDED`, () => {
    const s = snap([zone('z1')], []);
    const ops: EditOp[] = Array.from({ length: OP_LIMIT + 1 }, () => ({
      op: 'add_task' as const,
      zoneId: 'z1',
      title: 't',
    }));
    const r = planOps(s, ops);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('OP_LIMIT_EXCEEDED');
      expect(r.error.opIndex).toBe(-1);
    }
  });

  it(`== OP_LIMIT(${OP_LIMIT}) → 合法`, () => {
    const s = snap([zone('z1')], []);
    const ops: EditOp[] = Array.from({ length: OP_LIMIT }, () => ({
      op: 'add_task' as const,
      zoneId: 'z1',
      title: 't',
    }));
    expect(planOps(s, ops).kind).toBe('plan');
  });
});

// ============ fail-fast：错误带出错下标 ============
describe('planOps · fail-fast', () => {
  it('第 2 个 op 出错 → opIndex=1，不返回部分计划', () => {
    const s = snap([zone('z1')], [task('a')]);
    const r = planOps(s, [
      { op: 'update_task', id: 'a', title: 'ok' },
      { op: 'delete_task', id: 'nope' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('UNKNOWN_TASK_ID');
      expect(r.error.opIndex).toBe(1);
    }
  });
});

// ============ 已知缺口 known-gap（见 docs/harness/test-points.md TP7-TP9） ============
// 钉住"当前行为"作为 known-gap 的可见锚点；T1/T2/T3 落地后把对应 todo 转为正式断言。
describe('planOps · 已知缺口 known-gap', () => {
  it('TP7: 一次性建新多层树（新父+新子同批）→ 当前 UNKNOWN_PARENT_ID（T1 落地后应支持）', () => {
    const s = snap([zone('z1')], []);
    const r = planOps(s, [
      { op: 'add_task', zoneId: 'z1', title: '上线' }, // 新父，落地前无 id
      { op: 'add_task', zoneId: 'z1', title: '部署', parentId: '上线' }, // 引用尚未创建的父
    ]);
    // 当前：批内新父无法被引用 → fail-fast。T1（tempId 批内引用）落地后改为期望 plan。
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
      expect(r.error.opIndex).toBe(1);
    }
  });

  // T1：schema 加 tempId 批内引用（或顺序 apply 回灌真 id），支持一次性建新多层树
  it.todo('TP7/T1: add_task 支持 tempId，批内新父可被后续 op 引用 → 建新树不再报错');

  // T2：diff 暴露父任务名（不只 parentId），让人看出 add-subtask 挂到了谁——防 LLM 静默错挂
  it.todo('TP8/T2: DiffPreview.added 暴露 parent 可读名/标识，UI 能显示“挂到 X 下”');

  // T3：re-parent 环/深度守护（把父挪到自己子孙下 → 应报错，而非静默成环）
  it.todo('TP9/T3: update_task.parentId 指向自身子孙 → 新增 CYCLE/INVALID 错误，而非成环');
});
