import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types';

// migration.ts 顶层 import 了 Tauri 耦合的 ./db 与 ./db-legacy。
// 这里桩掉这两个模块，使纯函数 convertDbSettingsToApp 可在 node 环境单测。
vi.mock('./db', () => ({
  saveWorkspace: vi.fn(),
  saveHistoryWorkspace: vi.fn(),
  saveSettings: vi.fn(),
  setDbVersion: vi.fn(),
  getDbVersion: vi.fn(),
  saveCustomTemplate: vi.fn(),
}));
vi.mock('./db-legacy', () => ({ dbGetItem: vi.fn() }));

import { convertDbSettingsToApp } from './migration';

function dbSettings(over: Partial<Parameters<typeof convertDbSettingsToApp>[0] & object> = {}) {
  return {
    work_duration: 1500,
    break_duration: 300,
    long_break_duration: 900,
    auto_start_break: 0,
    sound_enabled: 1,
    collapsed: 0,
    collapse_position_x: 100,
    collapse_position_y: 200,
    sort_mode: 'zone',
    priority_weight: 0.4,
    urgency_weight: 0.6,
    ...over,
  };
}

describe('convertDbSettingsToApp（DB 设置 → 应用设置）', () => {
  it('传入 null 返回默认设置', () => {
    expect(convertDbSettingsToApp(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('数值与开关字段正确映射', () => {
    const r = convertDbSettingsToApp(dbSettings());
    expect(r.workDuration).toBe(1500);
    expect(r.breakDuration).toBe(300);
    expect(r.longBreakDuration).toBe(900);
  });

  it('0/1 整数正确转布尔', () => {
    const on = convertDbSettingsToApp(dbSettings({ auto_start_break: 1, sound_enabled: 1, collapsed: 1 }));
    expect(on.autoStartBreak).toBe(true);
    expect(on.soundEnabled).toBe(true);
    expect(on.collapsed).toBe(true);

    const off = convertDbSettingsToApp(dbSettings({ auto_start_break: 0, sound_enabled: 0, collapsed: 0 }));
    expect(off.autoStartBreak).toBe(false);
    expect(off.soundEnabled).toBe(false);
    expect(off.collapsed).toBe(false);
  });

  it('折叠位置映射为 {x,y}', () => {
    const r = convertDbSettingsToApp(dbSettings({ collapse_position_x: 33, collapse_position_y: 77 }));
    expect(r.collapsePosition).toEqual({ x: 33, y: 77 });
  });

  it('排序配置映射，且 urgency_weight=0 时回退 0.6', () => {
    const r = convertDbSettingsToApp(dbSettings({ sort_mode: 'priority', priority_weight: 0.7, urgency_weight: 0 }));
    expect(r.globalViewSort.mode).toBe('priority');
    expect(r.globalViewSort.priorityWeight).toBe(0.7);
    expect(r.globalViewSort.deadlineWeight).toBe(0.6); // 0 → 回退默认
  });
});
