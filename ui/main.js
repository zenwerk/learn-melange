import { create_session } from 'melange-output/src/main.js';

const session = create_session();
const outputEl = document.getElementById('output');
const inputEl = document.getElementById('input');

const history = [];
let historyIndex = -1;
let savedInput = '';

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function appendLine(html) {
  const line = document.createElement('div');
  line.innerHTML = html;
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function formatNumber(v) {
  return v.toString();
}

function formatResult(result, inputText) {
  if (result.success) {
    if (result.kind === 'expr') {
      return `<span class="result">- : float = ${formatNumber(result.value)}</span>`;
    } else if (result.kind === 'binding') {
      return `<span class="binding">val ${escapeHtml(result.name)} : float = ${formatNumber(result.value)}</span>`;
    }
  } else {
    const lines = [];
    if (result.error_column !== null && result.error_column > 0) {
      const promptLen = 'calc ❯ '.length;
      const padding = ' '.repeat(promptLen + result.error_column);
      lines.push(`<span class="caret">${padding}^</span>`);
    }
    const col = result.error_column !== null && result.error_column > 0
      ? ` at column ${result.error_column}`
      : '';
    lines.push(`<span class="error">Error${col}: ${escapeHtml(result.error_message)}</span>`);
    return lines.join('\n');
  }
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = inputEl.value.trim();
    if (!text) return;

    history.push(text);
    historyIndex = history.length;
    savedInput = '';

    appendLine(`<span class="prompt">calc ❯ </span><span class="input-echo">${escapeHtml(text)}</span>`);

    const result = session.eval(text);
    appendLine(formatResult(result, text));

    inputEl.value = '';
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (history.length === 0) return;
    if (historyIndex === history.length) {
      savedInput = inputEl.value;
    }
    if (historyIndex > 0) {
      historyIndex--;
      inputEl.value = history[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex < history.length - 1) {
      historyIndex++;
      inputEl.value = history[historyIndex];
    } else if (historyIndex === history.length - 1) {
      historyIndex = history.length;
      inputEl.value = savedInput;
    }
  }
});

// Focus input when clicking anywhere in terminal
document.getElementById('terminal').addEventListener('click', () => {
  inputEl.focus();
});
