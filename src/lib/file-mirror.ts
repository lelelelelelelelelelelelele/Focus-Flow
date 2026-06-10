// src/lib/file-mirror.ts
// 任务的本地 JSON 镜像层（Step 1）
// ------------------------------------------------------------------
// 目标：把 tasks/zones 双向镜像到一个本地 JSON 文件，让 Claude Code 等外部
//       工具能直接编辑任务文件、app 自动拾取；同时给数据一份人类可读、可恢复
//       的副本（缓解 SQLite-in-WebView 的数据丢失问题）。
//
// 设计要点：
//   1. 不替换 SQLite：SQLite 仍是主存，本文件是【附加的】双向镜像。
//   2. 不动 storage-adapter 的防御锁：只读它的 hydration / switch 状态做 gate。
//   3. 读用【轮询】（readTextFile），不用原生 watch —— 当前 capability 未授予
//      fs:allow-watch，轮询零依赖、对 atomic-save 更鲁棒，自用 todo 完全够。
//   4. 回声锁：维护一个 canonical 基线，导出 / 导入都更新它，两个方向互不触发
//      死循环（canonical 对格式 / 键序 / 数组顺序不敏感，只认真正的字段变化）。
//   5. 只在 main 窗口运行，避免 float 窗口成为第二个写者。
// ------------------------------------------------------------------

import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Task, Zone } from '@/types';
import { useAppStore } from '@/store';
import { computeAllTaskTimes } from '@/store/slices/taskSlice';
import { getIsHydrated, getIsSwitching, getIsReloadingForSwitch } from '@/lib/storage-adapter';
import { persistentLog } from '@/lib/persistent-log';

const MIRROR_FILENAME = 'focus-flow-tasks.json';
const POLL_INTERVAL_MS = 1500;
const EXPORT_DEBOUNCE_MS = 600;
const MIRROR_VERSION = 1;

interface MirrorFile {
  version: number;
  exportedAt?: number;
  zones: Zone[];
  tasks: Task[];
}

let _started = false;
let _baseline: string | null = null;   // canonical(zones, tasks) 基线，回声锁用
let _didBootReconcile = false;          // 启动对账是否已完成
let _polling = false;                   // 防止 tick 重入
let _exportTimer: ReturnType<typeof setTimeout> | null = null;
let _mirrorPath: string | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getMirrorPath(): Promise<string> {
  if (_mirrorPath) return _mirrorPath;
  const dir = await appDataDir();
  _mirrorPath = await join(dir, MIRROR_FILENAME);
  return _mirrorPath;
}

// 稳定序列化：深度排序对象键，使比较对格式 / 键序不敏感
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = obj[k];
        return acc;
      }, {} as Record<string, unknown>);
    }
    return v;
  });
}

function sortById<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// canonical：按 id 排序数组 + 深度排序键 → 只认真正的数据变化（忽略格式 / 顺序）
function canonical(zones: Zone[], tasks: Task[]): string {
  return stableStringify({ zones: sortById(zones), tasks: sortById(tasks) });
}

// ---------------- 导出：store -> 文件 ----------------

function scheduleExport(): void {
  if (_exportTimer) clearTimeout(_exportTimer);
  _exportTimer = setTimeout(() => { void exportToFile(); }, EXPORT_DEBOUNCE_MS);
}

async function exportToFile(): Promise<void> {
  if (!isTauri()) return;
  // 未水合 / 启动对账未完成前不导出，避免初始空状态覆盖文件里的好数据
  if (!getIsHydrated() || !_didBootReconcile) return;
  if (getIsSwitching() || getIsReloadingForSwitch()) return;

  const state = useAppStore.getState();
  const zones = (state.zones || []) as Zone[];
  const tasks = (state.tasks || []) as Task[];
  const canon = canonical(zones, tasks);
  if (canon === _baseline) return;  // 无实质变化（回声锁）

  const payload: MirrorFile = { version: MIRROR_VERSION, exportedAt: Date.now(), zones, tasks };
  try {
    const path = await getMirrorPath();
    await writeTextFile(path, JSON.stringify(payload, null, 2));
    _baseline = canon;
    persistentLog('FileMirror', 'exported to file', 'DEBUG', { tasks: tasks.length, zones: zones.length });
  } catch (e) {
    persistentLog('FileMirror', 'export failed', 'WARN', String(e));
  }
}

// ---------------- 导入：文件 -> store ----------------

function parseMirror(raw: string): MirrorFile | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.zones)) return null;
    return { version: parsed.version ?? MIRROR_VERSION, zones: parsed.zones, tasks: parsed.tasks };
  } catch {
    return null;
  }
}

async function readMirror(): Promise<MirrorFile | null> {
  const path = await getMirrorPath();
  if (!(await exists(path))) return null;
  const raw = await readTextFile(path);
  return parseMirror(raw);
}

function applySnapshot(zones: Zone[], tasks: Task[]): void {
  // 先更新基线，再 setState：这样 setState 触发的订阅导出会因 canonical 相等而跳过，
  // 不会把刚导入的文件又原样回写一遍（也避免回声死循环）。
  _baseline = canonical(zones, tasks);
  useAppStore.setState({ tasks, zones, taskComputedTimes: computeAllTaskTimes(tasks) });
  persistentLog('FileMirror', 'imported from file', 'INFO', { tasks: tasks.length, zones: zones.length });
}

// 启动对账：只跑一次，决定文件还是 store 为准
async function bootReconcile(): Promise<void> {
  const state = useAppStore.getState();
  const storeZones = (state.zones || []) as Zone[];
  const storeTasks = (state.tasks || []) as Task[];
  const storeCanon = canonical(storeZones, storeTasks);

  let file: MirrorFile | null = null;
  try {
    file = await readMirror();
  } catch (e) {
    persistentLog('FileMirror', 'boot read failed', 'WARN', String(e));
  }

  // 文件缺失 / 损坏 / 无效 → 用 store 数据初始化或修复文件
  if (!file) {
    _baseline = storeCanon;
    _didBootReconcile = true;
    await exportToFile();
    return;
  }

  // 安全护栏：文件任务为空但 store 有任务 → 不让空 / 损坏文件覆盖好数据，改为用 store 修复
  if (file.tasks.length === 0 && storeTasks.length > 0) {
    persistentLog('FileMirror', 'boot: empty file vs non-empty store → healing file', 'WARN');
    _baseline = storeCanon;
    _didBootReconcile = true;
    await exportToFile();
    return;
  }

  _didBootReconcile = true;
  if (canonical(file.zones, file.tasks) !== storeCanon) {
    // 文件较新（含 app 关闭期间 cc 的编辑）→ 文件为准导入
    applySnapshot(file.zones, file.tasks);
  } else {
    _baseline = storeCanon;
  }
}

async function tick(): Promise<void> {
  if (_polling || !isTauri()) return;
  if (!getIsHydrated()) return;                       // 等水合完成
  if (getIsSwitching() || getIsReloadingForSwitch()) return;
  _polling = true;
  try {
    if (!_didBootReconcile) {
      await bootReconcile();
      return;
    }
    const file = await readMirror();
    if (!file) return;                                // 文件暂不可读 / 无效，跳过本次
    if (canonical(file.zones, file.tasks) !== _baseline) {
      applySnapshot(file.zones, file.tasks);
    }
  } catch (e) {
    persistentLog('FileMirror', 'poll tick failed', 'WARN', String(e));
  } finally {
    _polling = false;
  }
}

export function initFileMirror(): void {
  if (_started || !isTauri()) return;
  // 只在 main 窗口运行，避免 float 窗口成为第二个写者
  try {
    if (getCurrentWindow().label !== 'main') return;
  } catch {
    // 取不到窗口信息（非 Tauri / 异常）则不启动
    return;
  }
  _started = true;

  // 导出：监听 tasks / zones 引用变化（防抖）
  useAppStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks || state.zones !== prev.zones) {
      scheduleExport();
    }
  });

  // 导入：轮询文件
  setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  void tick();  // 尽快尝试一次（水合后即对账）

  persistentLog('FileMirror', 'initialized', 'INFO', { interval: POLL_INTERVAL_MS });

  // 暴露给控制台调试：查看镜像文件路径
  (window as unknown as Record<string, unknown>).getMirrorPath = getMirrorPath;
}
