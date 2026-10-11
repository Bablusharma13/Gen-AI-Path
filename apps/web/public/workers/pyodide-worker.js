/* GenPath AI — Python sandbox worker.
 *
 * Runs learner code with Pyodide (CPython compiled to WebAssembly) inside this dedicated Web
 * Worker, in the learner's own browser. The worker has no DOM access; the page terminates and
 * recreates it on timeout. Nothing here ever runs on GenPath servers.
 */
'use strict';

const PYODIDE_VERSION = '0.29.5';
const INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';
const MAX_OUTPUT_CHARS = 20000;

let pyodidePromise = null;

function loadRuntime() {
  if (!pyodidePromise) {
    importScripts(INDEX_URL + 'pyodide.js');
    // eslint-disable-next-line no-undef
    pyodidePromise = loadPyodide({ indexURL: INDEX_URL });
  }
  return pyodidePromise;
}

self.onmessage = async function (event) {
  const msg = event.data || {};
  const id = msg.id;

  if (msg.type === 'init') {
    try {
      const py = await loadRuntime();
      self.postMessage({ id: id, type: 'ready', version: py.version });
    } catch (err) {
      self.postMessage({ id: id, type: 'error', error: String((err && err.message) || err) });
    }
    return;
  }

  if (msg.type !== 'run' || typeof msg.code !== 'string') return;

  let stdout = '';
  let stderr = '';
  let truncated = false;
  const append = function (kind, text) {
    const current = kind === 'out' ? stdout : stderr;
    if (current.length >= MAX_OUTPUT_CHARS) {
      truncated = true;
      return;
    }
    const next = (current + text + '\n').slice(0, MAX_OUTPUT_CHARS);
    if (next.length < (current + text + '\n').length) truncated = true;
    if (kind === 'out') stdout = next;
    else stderr = next;
  };

  try {
    const py = await loadRuntime();
    py.setStdout({
      batched: function (s) {
        append('out', s);
      },
    });
    py.setStderr({
      batched: function (s) {
        append('err', s);
      },
    });
    await py.runPythonAsync(msg.code);
    self.postMessage({
      id: id,
      type: 'done',
      stdout: stdout,
      stderr: stderr,
      truncated: truncated,
      error: null,
    });
  } catch (err) {
    self.postMessage({
      id: id,
      type: 'done',
      stdout: stdout,
      stderr: stderr,
      truncated: truncated,
      error: String((err && err.message) || err),
    });
  }
};
