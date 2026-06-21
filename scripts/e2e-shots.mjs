// E2E 三态截图：无头 chromium 驱动 dev app（localhost:8088 = 最新代码），
// 走真实流程（配置表单 → 输入 → 生成[经 /__byok 真打 MiMo] → 预览 → 应用 → 落地树），逐态截图。
// 凭据从 gitignore 的 .byok.local.json 读，截图存 docs/delivery/。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('.byok.local.json', 'utf8'));
const HARD_CASE =
  '下午要干三件事：改PPT、写周报、回客户邮件；其中「写周报」下面有三个小点：收集数据、写初稿、改定稿。';
const OUT = 'docs/delivery';
const shot = (p) => ({ path: `${OUT}/${p}`, animations: 'disabled' });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 760 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });

try {
  await page.goto('http://localhost:8088', { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="nlp-trigger"]', { timeout: 15000 });
  await page.waitForTimeout(800);

  // 无头 profile 无持久化（Tauri sqlite 在浏览器 no-op）→ store 为空，需先建一个分区才能落任务
  await page.click('[title="添加分区"]');
  const zoneInput = page.locator('input[placeholder="分区名称"]');
  await zoneInput.waitFor({ timeout: 5000 });
  await zoneInput.fill('工作');
  await zoneInput.press('Enter');
  await page.waitForTimeout(600);
  // 选中该分区，落地后任务在任务列表里可见
  const zone = page.locator('.zone-item:not(.global) .zone-content').first();
  if (await zone.count()) await zone.click();
  await page.waitForTimeout(400);

  // 打开 AI 对话框 → 未配置 → 配置表单
  await page.click('[data-testid="nlp-trigger"]');
  await page.waitForSelector('[data-testid="nlp-config"]', { timeout: 8000 });
  await page.fill('[data-testid="cfg-base"]', cfg.base);
  await page.fill('[data-testid="cfg-key"]', cfg.key);
  await page.fill('[data-testid="cfg-model"]', cfg.model);
  if (cfg.provider) await page.fill('[data-testid="cfg-provider"]', cfg.provider);
  await page.waitForTimeout(300);
  await page.screenshot(shot('phase4-shot0-config.png')); // 应用内 BYOK 配置表单（Phase 5）

  // 保存配置 → 进入输入态
  await page.click('[data-testid="cfg-save"]');
  await page.waitForSelector('[data-testid="nlp-input"]', { timeout: 8000 });
  await page.fill('[data-testid="nlp-input"]', HARD_CASE);
  await page.waitForTimeout(300);
  await page.screenshot(shot('phase4-shot1-input.png')); // ① 对话框输入态

  // 生成预览（真打 MiMo，经 /__byok 代理）。MiMo 偶尔返回空 ops / 反问 → 重试至多 4 次。
  let got = false;
  for (let attempt = 1; attempt <= 4 && !got; attempt++) {
    await page.click('[data-testid="nlp-generate"]');
    const res = await Promise.race([
      page.waitForSelector('[data-testid="nlp-added"]', { timeout: 45000 }).then(() => 'added').catch(() => 'to'),
      page.waitForSelector('[data-testid="nlp-error"]', { timeout: 45000 }).then(() => 'error').catch(() => 'to'),
    ]);
    if (res === 'added') { got = true; break; }
    const msg = await page.locator('[data-testid="nlp-error"]').first().textContent().catch(() => '');
    console.log(`generate attempt ${attempt}: ${res} ${(msg || '').slice(0, 60)}`);
    await page.waitForTimeout(1200);
  }
  if (!got) throw new Error('generate never produced a preview after retries');
  await page.waitForTimeout(600);
  await page.screenshot(shot('phase4-shot2-preview.png')); // ② diff 预览（含父任务名）

  // 应用 → 落地 → 对话框关闭 → 任务树
  await page.click('[data-testid="nlp-apply"]');
  await page.waitForSelector('[data-testid="nlp-apply"]', { state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot(shot('phase4-shot3-tree.png')); // ③ 落地后任务树

  const landed = await page.evaluate(() => document.body.innerText.includes('写周报') && document.body.innerText.includes('收集数据'));
  console.log('RESULT ' + JSON.stringify({ landed, errs: errs.slice(0, 5) }, null, 2));
} catch (e) {
  await page.screenshot({ path: '/tmp/e2e-fail.png' });
  console.log('E2E_FAIL ' + String(e).slice(0, 300));
  console.log('ERRS ' + JSON.stringify(errs.slice(0, 8)));
} finally {
  await browser.close();
}
