// Real WebGL2 acceptance against an externally built candidate and isolated storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const url = process.env.QA_FISH_URL || 'http://127.0.0.1:4173/stillpond/';
const out = process.env.QA_SCREENSHOT_DIR;
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const results = [];
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const activate = locator => viewport.width === 390 ? locator.tap() : locator.click();
    const context = await browser.newContext({ viewport, hasTouch: viewport.width === 390, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const warnings = [];
    const failedRequests = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    await context.route('**/*', route => route.request().url().startsWith(new URL(url).origin + '/') ? route.continue() : route.abort());
    await context.addInitScript(() => {
      window.__fishGpu = { draws: 0, lost: 0, restored: 0 };
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = WebGL2RenderingContext.prototype[name];
        if (original) WebGL2RenderingContext.prototype[name] = function (...args) {
          window.__fishGpu.draws++;
          return original.apply(this, args);
        };
      }
      window.addEventListener('webglcontextlost', () => window.__fishGpu.lost++, true);
      window.addEventListener('webglcontextrestored', () => window.__fishGpu.restored++, true);
      if (!localStorage.getItem('stillpond:qa-migration-seeded')) {
        localStorage.setItem('stillpond:pond-settings:v1', JSON.stringify({
          version: 1, config: { koi: { initialCount: 17 } }, weather: 'mist', rain: true
        }));
        localStorage.setItem('stillpond:qa-migration-seeded', 'yes');
      }
    });
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__fishGpu.draws > 0 && !document.querySelector('.pond-status'));
      assert.match(await page.title(), /Stillpond/);
      const identity = await page.evaluate(() => {
        const canvas = document.querySelector('#pond');
        const gl = canvas.getContext('webgl2');
        window.__fishLose = gl.getExtension('WEBGL_lose_context');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { webgl2: gl instanceof WebGL2RenderingContext, width: gl.drawingBufferWidth,
          height: gl.drawingBufferHeight, renderer: gl.getParameter(gl.RENDERER),
          unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
          extension: !!window.__fishLose };
      });
      assert.equal(identity.webgl2, true);
      assert.equal(identity.extension, true);
      assert.ok(identity.width > 0 && identity.height > 0);
      const firstFrame = await page.locator('#pond').screenshot();
      await page.waitForTimeout(250);
      const secondFrame = await page.locator('#pond').screenshot();
      assert.notEqual(hash(firstFrame), hash(secondFrame), 'actual rendered pond pixels change over time');

      await activate(page.locator('.settings-trigger'));
      const density = page.locator('#pond-density');
      const medaka = page.locator('.preference-row:has(label[for="pond-medaka"]) [role="switch"]');
      const rain = page.locator('.preference-row:has(label[for="pond-rain"]) [role="switch"]');
      assert.equal(await density.inputValue(), '17');
      assert.equal(await medaka.getAttribute('aria-checked'), 'true');
      await density.focus();
      await density.press('ArrowRight');
      assert.equal(await density.inputValue(), '18');
      await activate(page.locator('.weather-card--moonlight'));
      await page.evaluate(() => window.__fishLose.loseContext());
      await page.waitForFunction(() => window.__fishGpu.lost === 1 && !!document.querySelector('.pond-status'));
      const lostDraws = await page.evaluate(() => window.__fishGpu.draws);
      // Light koi/weather changes and a heavy tiny-fish respawn use real controls while GL is lost.
      await density.focus();
      await density.press('ArrowRight');
      await activate(page.locator('.weather-card--sunset'));
      await activate(medaka);
      assert.equal(await rain.getAttribute('aria-checked'), 'false');
      await activate(rain);
      await page.waitForTimeout(250);
      assert.equal(await density.inputValue(), '19');
      assert.equal(await medaka.getAttribute('aria-checked'), 'false');
      assert.equal(await page.evaluate(() => window.__fishGpu.draws), lostDraws, 'lost context stops GPU drawing');
      await page.evaluate(() => window.__fishLose.restoreContext());
      await page.waitForFunction(() => window.__fishGpu.restored === 1 && !document.querySelector('.pond-status') && window.__fishGpu.draws > 0);
      await page.waitForFunction(before => window.__fishGpu.draws > before, lostDraws);
      assert.equal(await page.locator('.weather-card--sunset').getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');

      const beforeHide = await page.evaluate(() => {
        window.dispatchEvent(new Event('pagehide'));
        return window.__fishGpu.draws;
      });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__fishGpu.draws), beforeHide, 'pagehide pauses the runtime');
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      await page.waitForFunction(before => window.__fishGpu.draws > before, beforeHide);
      const saved = await page.evaluate(() => ({
        v1: localStorage.getItem('stillpond:pond-settings:v1'),
        v2: JSON.parse(localStorage.getItem('stillpond:pond-settings:v2'))
      }));
      assert.equal(saved.v1, null);
      assert.equal(saved.v2.overrides['koi.initialCount'], 19);
      assert.equal(saved.v2.overrides['tiny-fish.visibleSchoolCount'], 0);
      assert.equal(saved.v2.weather, 'sunset');
      assert.equal(saved.v2.rain, true);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__fishGpu.draws > 0 && !document.querySelector('.pond-status'));
      await activate(page.locator('.settings-trigger'));
      assert.equal(await density.inputValue(), '19');
      assert.equal(await medaka.getAttribute('aria-checked'), 'false');
      assert.equal(await page.locator('.weather-card--sunset').getAttribute('aria-pressed'), 'true');
      assert.equal(await rain.getAttribute('aria-checked'), 'true');
      await page.keyboard.press('Escape');
      await page.locator('[role="dialog"]').waitFor({ state: 'hidden' });
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        await page.screenshot({ path: path.join(out, `pond-restored-reloaded-${viewport.width}.png`) });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(failedRequests, []);
      const result = { viewport, identity, motionHashes: [hash(firstFrame), hash(secondFrame)], saved,
        contextLossRecovery: true, lightAndHeavySettingsWhileLost: true, reload: true,
        syntheticPageHideShow: true, consoleErrors: errors, consoleWarnings: warnings, failedRequests };
      results.push(result);
      console.log(JSON.stringify({ pass: true, ...result }));
    } finally {
      await context.close();
    }

    for (const failure of ['quota', 'getter-denied']) {
      const faultContext = await browser.newContext({ viewport, hasTouch: viewport.width === 390, serviceWorkers: 'block' });
      const faultPage = await faultContext.newPage();
      faultPage.setDefaultTimeout(15000);
      const faultErrors = [];
      faultPage.on('pageerror', error => faultErrors.push(String(error)));
      faultPage.on('console', message => { if (message.type() === 'error') faultErrors.push(message.text()); });
      await faultContext.route('**/*', route => route.request().url().startsWith(new URL(url).origin + '/') ? route.continue() : route.abort());
      await faultContext.addInitScript(mode => {
        const storage = localStorage;
        window.__faultStorage = storage;
        if (mode === 'quota') {
          if (!storage.getItem('stillpond:pond-settings:v1')) storage.setItem('stillpond:pond-settings:v1', JSON.stringify({
            version: 1, config: { koi: { initialCount: 17 } }, weather: 'mist', rain: true
          }));
          const setItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === 'stillpond:pond-settings:v2') throw new DOMException('QA quota', 'QuotaExceededError');
            return setItem.call(this, key, value);
          };
        } else Object.defineProperty(window, 'localStorage', {
          configurable: true, get() { throw new DOMException('QA storage denied', 'SecurityError'); }
        });
      }, failure);
      try {
        await faultPage.goto(url, { waitUntil: 'networkidle' });
        await faultPage.waitForFunction(() => document.querySelector('#pond')?.getContext('webgl2') && !document.querySelector('.pond-status'));
        await activate(faultPage.locator('.settings-trigger'));
        const faultDensity = faultPage.locator('#pond-density');
        const initialCount = failure === 'quota' ? 17 : 14;
        assert.equal(await faultDensity.inputValue(), String(initialCount));
        await faultDensity.focus();
        await faultDensity.press('ArrowRight');
        await activate(faultPage.locator('.weather-card--sunset'));
        await faultPage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        await faultPage.evaluate(() => window.dispatchEvent(new Event('pageshow')));
        assert.equal(await faultDensity.inputValue(), String(initialCount + 1));
        assert.equal(await faultPage.locator('.weather-card--sunset').getAttribute('aria-pressed'), 'true');
        const retained = await faultPage.evaluate(() => ({
          v1: window.__faultStorage.getItem('stillpond:pond-settings:v1'),
          v2: window.__faultStorage.getItem('stillpond:pond-settings:v2')
        }));
        assert.equal(retained.v2, null);
        if (failure === 'quota') assert.equal(JSON.parse(retained.v1).config.koi.initialCount, 17);
        await faultPage.reload({ waitUntil: 'networkidle' });
        await faultPage.waitForFunction(() => !document.querySelector('.pond-status'));
        await activate(faultPage.locator('.settings-trigger'));
        assert.equal(await faultDensity.inputValue(), String(initialCount));
        assert.deepEqual(faultErrors, []);
        const result = { viewport, failure, sessionSettingsUsable: true, reloadCount: initialCount, retained, consoleErrors: faultErrors };
        results.push(result);
        console.log(JSON.stringify({ pass: true, ...result }));
      } finally {
        await faultContext.close();
      }
    }
  }
  if (out) fs.writeFileSync(path.join(out, 'browser-settings-results.json'), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
