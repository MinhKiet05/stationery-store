import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(check, description) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

export async function openTestBrowser() {
  let process;
  let endpoint = globalThis.process.env.CDP_URL;
  if (!endpoint) {
    const executable = [globalThis.process.env.CHROME_PATH,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/usr/bin/google-chrome', '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find(candidate => candidate && existsSync(candidate));
    if (!executable) throw new Error('Set CHROME_PATH to Chrome/Edge/Chromium.');
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-return-test-'));
    process = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
      '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
    process.on('error', error => console.error(error.message));
    try { await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'Chrome startup'); }
    catch (error) { process.kill(); throw error; }
    const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    endpoint = `http://127.0.0.1:${port}`;
  }
  const tab = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const exceptions = [];
  const consoleErrors = [], failedRequests = [];
  const pending = new Map();
  let nextID = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    if (message.method === 'Network.loadingFailed' && !message.params.canceled) failedRequests.push(message.params);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextID;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const click = async selector => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing element: ' + ${JSON.stringify(selector)});
      element.scrollIntoView({block: 'center'});
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await delay(40);
  };
  const type = async (selector, value) => {
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block: 'center'}); element.focus(); element.select(); })()`);
    await send('Input.insertText', { text: value });
    await delay(20);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  return { send, evaluate, click, type, exceptions, consoleErrors, failedRequests, close: async () => {
    if (socket.readyState === WebSocket.OPEN) {
      if (process) await send('Browser.close').catch(() => {});
      else await fetch(`${endpoint}/json/close/${tab.id}`).catch(() => {});
    }
    socket.close(); process?.kill();
  } };
}
