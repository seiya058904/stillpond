// Regressions for gesture history and audio failures, using native browser input
// and Web Audio. Only the audio HTTP response is replaced with controlled data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PACKAGE || 'playwright');
const url = process.env.QA_FISH_URL || 'http://127.0.0.1:4173/stillpond/';
const out = process.env.QA_SCREENSHOT_DIR;
const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || undefined, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'] });
const results = [];
const ready = page => page.waitForFunction(() => document.querySelector('#pond')?.getContext('webgl2') && !document.querySelector('.pond-status'));
const settle = page => page.waitForFunction(() => [...document.querySelectorAll('.settings-drawer, .settings-page')]
  .every(e => e.getAnimations({ subtree: true }).every(a => a.playState !== 'running')));
// One second of silent PCM exercises real decoding without platform AAC codecs.
const wav = Buffer.alloc(16044);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
const screenshot = async (page, name) => {
  if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, `${name}.png`) }); }
};
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, locale: width === 390 ? 'zh-CN' : 'en-US' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    try {
      await page.goto(url); await ready(page);
      await page.locator('.settings-trigger').click(); await settle(page);
      const slider = page.locator('#pond-density');
      const initial = Number(await slider.inputValue());
      const undo = page.getByRole('button', { name: width === 390 ? '撤销' : 'Undo', exact: true });
      const redo = page.getByRole('button', { name: width === 390 ? '重做' : 'Redo', exact: true });
      const box = await slider.boundingBox();
      const point = value => ({ x: box.x + 14 + (box.width - 28) * value / 48, y: box.y + box.height / 2 });
      const cdp = await context.newCDPSession(page);
      const down = async value => {
        if (width === 390) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(value)] });
        else { await page.mouse.move(point(value).x, point(value).y); await page.mouse.down(); }
      };
      const move = async value => {
        if (width === 390) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(value)] });
        else await page.mouse.move(point(value).x, point(value).y, { steps: 3 });
      };
      const up = async () => width === 390
        ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) : page.mouse.up();
      await down(initial); await move(25);
      await page.waitForTimeout(900); // The regression is a pause within a held gesture.
      await move(40); await up();
      assert.equal(Number(await slider.inputValue()), 40);
      await undo.click(); assert.equal(Number(await slider.inputValue()), initial);
      await redo.click(); assert.equal(Number(await slider.inputValue()), 40);
      await undo.click();
      await down(initial); await move(20); await up();
      await down(20); await move(30); await up();
      await undo.click(); assert.equal(Number(await slider.inputValue()), 20);
      await undo.click(); assert.equal(Number(await slider.inputValue()), initial);
      await slider.focus(); await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(900);
      await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
      assert.equal(Number(await slider.inputValue()), initial + 2);
      await undo.click(); assert.equal(Number(await slider.inputValue()), initial);
      // Losing focus ends a held keyboard edit even without its keyup event.
      await slider.focus(); await page.keyboard.down('ArrowRight'); await slider.blur(); await page.keyboard.up('ArrowRight');
      await slider.press('ArrowRight');
      await undo.click(); assert.equal(Number(await slider.inputValue()), initial + 1);
      await undo.click(); assert.equal(Number(await slider.inputValue()), initial);
      assert.equal(await page.locator('.settings-drawer').getAttribute('data-pond-preview'), null);
      assert.deepEqual(errors, []);
      results.push({ width, gestureHistory: true, keyboardHistory: true, errors });
    } catch (error) {
      results.push({ width, error: String(error) }); await screenshot(page, `gesture-failed-${width}`).catch(() => {}); throw error;
    } finally { await context.close(); }
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await context.addInitScript(() => {
    window.__audioContexts = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.__audioContexts.push(this); }
      createGain() { const gain = super.createGain(); this.__gain = gain; return gain; }
    };
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  let mode = 'failure', requests = 0, releaseSlow;
  await page.route('**/audio/**', async route => {
    requests++;
    const response = mode;
    if (response === 'slow') await new Promise(resolve => { releaseSlow = resolve; });
    await route.fulfill(response === 'failure' ? { status: 503, body: 'Controlled test failure' }
      : { status: 200, contentType: 'audio/wav', body: response === 'invalid' ? Buffer.from('not audio') : wav }).catch(() => {});
  });
  try {
    await page.goto(url); await ready(page);
    const sound = page.locator('[data-audio-status]');
    const status = value => page.waitForSelector(`[data-audio-status="${value}"]`);
    await sound.click(); await status('error');
    assert.equal(await sound.getAttribute('aria-pressed'), 'false');
    assert.equal(await sound.getAttribute('aria-label'), 'Retry sound');
    await screenshot(page, 'audio-failed-mobile');
    for (let i = 0; i < 3; i++) await page.locator('#pond').click({ position: { x: 100, y: 250 + i * 40 } });
    await page.keyboard.press('Shift');
    assert.equal(requests, 1, 'pond input must not retry a failed audio request');
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
    await status('error'); assert.equal(requests, 1);
    mode = 'invalid'; await sound.click(); await status('error');
    assert.equal(requests, 2, 'an explicit retry reaches the decoder');
    mode = 'success'; await sound.click(); await status('playing');
    assert.equal(requests, 3); assert.equal(await sound.getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await status('paused');
    await page.waitForFunction(() => window.__audioContexts.at(-1).state === 'suspended');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow'))); await status('playing');
    await sound.click(); await status('off');
    await page.waitForFunction(() => window.__audioContexts.at(-1).state === 'suspended');
    await sound.click(); await status('playing');
    assert.equal(requests, 3, 'toggling a loaded sound reuses its buffer');

    await page.reload(); await status('waiting');
    mode = 'slow'; await page.locator('#pond').click({ position: { x: 100, y: 300 } }); await status('loading');
    await page.waitForFunction(() => window.__audioContexts.length === 1);
    // Wait for the intercepted request, independently of React's loading status.
    const requestDeadline = Date.now() + 10_000;
    while (!releaseSlow && Date.now() < requestDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseSlow, 'the slow request reaches interception');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await status('paused');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow'))); await status('loading');
    await sound.click(); await status('off');
    await page.waitForFunction(() => window.__audioContexts.every(c => c.state === 'closed'));
    mode = 'success'; await sound.click(); await status('playing');
    releaseSlow();
    await page.waitForTimeout(150); // Let the cancelled request's completion run.
    assert.equal(await sound.getAttribute('data-audio-status'), 'playing');
    assert.equal(await page.evaluate(() => window.__audioContexts.filter(c => c.state !== 'closed').length), 1);
    await screenshot(page, 'audio-recovered-mobile');
    assert.deepEqual(errors, []);
    results.push({ audioFailureAndRetry: true, decodeFailure: true, visibility: true, cancellation: true, requests, errors });
  } catch (error) {
    results.push({ audioError: String(error) }); await screenshot(page, 'audio-test-failed').catch(() => {}); throw error;
  } finally { releaseSlow?.(); await context.close(); }
} finally {
  if (out) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'interaction-results.json'), JSON.stringify(results, null, 2)); }
  await browser.close();
}
console.log(JSON.stringify(results));
