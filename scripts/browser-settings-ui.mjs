// Interaction acceptance for the settings UI. Use an isolated browser and the
// same QA_FISH_URL / QA_PLAYWRIGHT_PACKAGE / QA_SCREENSHOT_DIR as browser-settings.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const url = process.env.QA_FISH_URL || 'http://127.0.0.1:4173/stillpond/';
const out = process.env.QA_SCREENSHOT_DIR;
const cases = [
  { width: 390, height: 844, locale: 'zh-CN', colorScheme: 'light' },
  { width: 390, height: 844, locale: 'en-US', colorScheme: 'dark' },
  { width: 320, height: 568, locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce' },
  { width: 844, height: 390, locale: 'en-US', colorScheme: 'dark' },
  { width: 1280, height: 900, locale: 'zh-CN', colorScheme: 'light' },
];
const results = [];
const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || undefined, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  for (const sample of cases) {
    const { width, height, locale, colorScheme, reducedMotion = 'no-preference' } = sample;
    const mobile = width < 768;
    const context = await browser.newContext({ viewport: { width, height }, locale, colorScheme, reducedMotion, hasTouch: width < 1000, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await context.route('**/*', route => route.request().url().startsWith(new URL(url).origin + '/') ? route.continue() : route.abort());
    const zh = locale === 'zh-CN';
    const undoName = zh ? '撤销' : 'Undo', redoName = zh ? '重做' : 'Redo';
    const activePage = () => page.locator('.settings-page:not([inert])');
    const settle = () => page.waitForFunction(() => [...document.querySelectorAll('.settings-drawer, .settings-page, .settings-confirmation')]
      .every(element => element.getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')));
    const touchDrag = async (from, to) => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let step = 1; step <= 12; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
    const screenshot = async name => {
      if (!out) return;
      fs.mkdirSync(out, { recursive: true });
      await page.screenshot({ path: path.join(out, `${width}-${locale}-${colorScheme}-${name}.png`) });
    };
    try {
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('#pond')?.getContext('webgl2') && !document.querySelector('.pond-status'));
      const gpu = await page.evaluate(() => {
        const gl = document.querySelector('#pond').getContext('webgl2');
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      });
      await page.locator('.settings-trigger').click();
      await settle();
      const density = page.locator('#pond-density');
      const undo = page.getByRole('button', { name: undoName, exact: true });
      const redo = page.getByRole('button', { name: redoName, exact: true });
      const initial = Number(await density.inputValue());
      assert.equal(await redo.isDisabled(), true);
      if (mobile) {
        const box = await density.boundingBox();
        const from = { x: box.x + 14 + (box.width - 28) * initial / 48, y: box.y + box.height / 2 };
        await touchDrag(from, { x: from.x + 40, y: from.y });
        assert.ok(Number(await density.inputValue()) > initial, 'touch dragging edits the slider');
        assert.equal(await page.locator('.settings-drawer').getAttribute('data-pond-preview'), null, 'a slider drag never collapses the editor');
        await undo.click(); assert.equal(Number(await density.inputValue()), initial);
      }
      await density.focus(); await density.press('ArrowRight');
      assert.equal(Number(await density.inputValue()), initial + 1);
      await undo.click(); assert.equal(Number(await density.inputValue()), initial);
      await redo.click(); assert.equal(Number(await density.inputValue()), initial + 1);
      await undo.click();
      await density.focus(); await density.press('ArrowLeft');
      assert.equal(await redo.isDisabled(), true, 'a new edit discards the redo branch');
      await undo.click();

      // The fish list retains its route, live values, and exact scroll position.
      await page.locator('[data-preference="fish"]').click(); await settle();
      const sterlet = page.locator('[data-species="sterlet"]');
      await sterlet.locator('.ios-stepper button').last().click();
      await page.locator('[data-species="bubble-eye"]').scrollIntoViewIfNeeded();
      const scrollTop = await activePage().evaluate(element => element.scrollTop);
      await settle();
      await screenshot('editor');
      if (mobile) {
        const canvasSize = await page.locator('#pond').evaluate(element => [element.width, element.height]);
        await page.locator('.settings-preview-toggle').click();
        await page.waitForFunction(() => Math.abs(document.querySelector('.settings-drawer').getBoundingClientRect().top - (innerHeight - 72)) < 1);
        await settle();
        assert.equal(await page.locator('.settings-preview-toggle').getAttribute('aria-expanded'), 'false');
        assert.deepEqual(await page.locator('#pond').evaluate(element => [element.width, element.height]), canvasSize);
        await screenshot('pond-preview');
        await page.locator('#pond').click({ position: { x: width / 2, y: height / 3 } });
        await page.locator('.settings-preview-toggle').focus();
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => !!document.activeElement.closest('.settings-scroll, .settings-navbar')), false, 'collapsed editor controls cannot receive focus');
        }
        await page.locator('.settings-preview-toggle').click(); await settle();
        assert.equal(await page.locator('.settings-drawer').getAttribute('data-page'), 'fish');
        assert.equal(await activePage().evaluate(element => element.scrollTop), scrollTop);
        assert.equal(await sterlet.locator('output').innerText(), '1');
        // A short swipe on the handle also collapses; sliders never initiate it.
        const handle = await page.locator('[data-slot="drawer-swipe-handle"]').boundingBox();
        await touchDrag({ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, { x: handle.x + handle.width / 2, y: height - 90 });
        await page.waitForSelector('.settings-drawer[data-pond-preview]'); await settle();
        await page.locator('.settings-preview-toggle').focus(); await page.keyboard.press('Escape'); await settle();
        assert.equal(await page.locator('.settings-drawer').getAttribute('data-page'), 'fish', 'Escape from preview returns to the same editor');
        assert.equal(await page.locator('.settings-drawer').getAttribute('data-pond-preview'), null);
        if (width === 390 && zh) {
          await page.locator('.settings-preview-toggle').click(); await settle();
          await page.setViewportSize({ width: 844, height: 390 }); await settle();
          assert.equal(await page.locator('.settings-drawer').getAttribute('data-pond-preview'), null);
          assert.equal(await page.locator('.settings-drawer').getAttribute('data-page'), 'fish');
          await page.setViewportSize({ width, height }); await settle();
          assert.equal(await page.locator('.settings-drawer').getAttribute('data-pond-preview'), 'true');
          await page.locator('.settings-preview-toggle').click(); await settle();
        }
      } else {
        const drawerBox = await page.locator('.settings-drawer').boundingBox();
        const dockBox = await page.locator('.control-dock').boundingBox();
        assert.ok(dockBox.x >= 0 && dockBox.x + dockBox.width < drawerBox.x, 'dock remains outside the side panel');
      }

      // Reset is a nested modal, while ordinary editing stays non-modal.
      await page.locator('.settings-back').click(); await settle();
      await page.locator('[data-preference="reset"]').click();
      const alert = page.getByRole('alertdialog');
      await alert.waitFor(); await settle();
      await page.waitForFunction(() => document.activeElement?.classList.contains('settings-sheet__cancel'));
      assert.equal(await page.locator('.settings-reset-backdrop').isVisible(), true);
      await screenshot('reset');
      for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Tab']) {
        await page.keyboard.press(key);
        // Base UI's focus guards return focus on the next animation frame.
        await page.waitForFunction(() => !!document.activeElement?.closest('[role="alertdialog"]'));
      }
      const covered = await page.evaluate(() => document.elementFromPoint(20, 20)?.classList.contains('settings-reset-backdrop'));
      assert.equal(covered, true, 'reset blocks pointer input to the pond');
      await page.keyboard.press('Escape'); await alert.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-preference') === 'reset');
      assert.equal(await page.locator('.settings-drawer').isVisible(), true, 'Escape dismisses only the confirmation');
      await page.locator('[data-preference="reset"]').click(); await settle();
      await alert.locator('.settings-sheet__action--danger').click(); await alert.waitFor({ state: 'hidden' });
      await undo.click();
      await page.locator('[data-preference="fish"]').click(); await settle();
      assert.equal(await sterlet.locator('output').innerText(), '1', 'undo restores the pre-reset population');
      await redo.click(); assert.equal(await sterlet.locator('output').innerText(), '0', 'redo reapplies reset');
      await undo.click();

      if (mobile) {
        await page.locator('.settings-back').click(); await settle();
        await page.locator('[data-preference="advanced"]').click(); await settle();
        // Navigation restores focus when Motion's spring completes; this can
        // finish after the browser reports no native animations. Wait before
        // opening a select, or the late focus move would dismiss its popup.
        await page.waitForFunction(() => document.activeElement?.classList.contains('settings-back'));
        const search = page.locator('.settings-search input');
        await search.fill('koi');
        await page.locator('#preview-family').click();
        const option = page.locator('.settings-select-option').nth(1);
        const selected = await option.innerText(); await option.click();
        await page.locator('.family-preview-toggle').click();
        const previewLabel = await page.locator('.pond-preview-label').innerText();
        const advancedScroll = await activePage().evaluate(element => element.scrollTop);
        await page.locator('.settings-preview-toggle').click(); await settle();
        await page.locator('.settings-preview-toggle').click(); await settle();
        assert.equal(await search.inputValue(), 'koi');
        assert.ok((await page.locator('#preview-family').innerText()).includes(selected));
        assert.equal(await page.locator('.pond-preview-label').innerText(), previewLabel);
        assert.equal(await activePage().evaluate(element => element.scrollTop), advancedScroll);
      }

      // The last live edit is saved; history and preview remain session-only UI.
      await page.getByRole('button', { name: zh ? '关闭设置' : 'Close settings', exact: true }).click();
      await page.locator('.settings-drawer').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.classList.contains('settings-trigger'));
      await page.reload(); await page.locator('.settings-trigger').click();
      await page.locator('[data-preference="fish"]').click(); await settle();
      assert.equal(await sterlet.locator('output').innerText(), '1');
      assert.equal(await redo.isDisabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      const result = { ...sample, gpu, reversibleEdits: true, preview: mobile, resetFocusAndBackdrop: true, reload: true, consoleErrors: errors };
      results.push(result); console.log(JSON.stringify({ pass: true, ...result }));
    } catch (error) {
      results.push({ ...sample, pass: false, error: String(error) });
      await screenshot('failed').catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
} finally {
  if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'settings-ui-results.json'), JSON.stringify(results, null, 2)); }
  await browser.close();
}
