const $ = (id) => document.getElementById(id);

const state = {
  cards: [],
  selected: null,
  card: null,
  editing: false,
  dirty: false,
  q: '',
  layer: '',
  audit: null,
  inbox: [],
  newFileTouched: false,
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `请求失败 (${res.status})`);
    error.data = data;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inline(value) {
  let s = escapeHtml(value);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
    if (!/^(https?:|#|\/|\.)/i.test(href)) return label;
    return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  return s;
}

function renderMarkdown(md) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let inCode = false;
  let code = [];
  let list = [];
  let table = [];

  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    list = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.map((line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    const sep = rows[1] && rows[1].every((c) => /^:?-{3,}:?$/.test(c));
    const head = sep ? rows[0] : null;
    const body = sep ? rows.slice(2) : rows;
    let html = '<table>';
    if (head) html += `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
    html += `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    out.push(html);
    table = [];
  };

  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        inCode = false;
        code = [];
      } else {
        flushList();
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) { code.push(line); continue; }

    if (/^\s*$/.test(line)) {
      flushList();
      flushTable();
      continue;
    }

    if (/^\|/.test(line)) {
      flushList();
      table.push(line);
      continue;
    }
    flushTable();

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      flushList();
      out.push('<hr />');
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushList();
      out.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ''))}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ''));
      continue;
    }
    flushList();

    out.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushList();
  flushTable();
  return out.join('\n');
}

function relativeTime(iso) {
  const date = new Date(iso);
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function badge(text, cls = '') {
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

async function loadState() {
  const data = await api('/api/state');
  $('workspace').textContent = data.proceduresDir;
  $('stat').textContent = `${data.cards} 张卡 · ${formatBytes(data.bytes)}`;
}

function renderList() {
  const list = $('list');
  const empty = $('list-empty');
  list.innerHTML = '';
  $('search-count').textContent = state.q ? `${state.cards.length} 命中` : '';
  if (!state.cards.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const card of state.cards) {
    const button = document.createElement('button');
    button.className = `card-item${state.selected === card.file ? ' active' : ''}`;
    button.type = 'button';
    button.innerHTML = `
      <div class="row">
        <strong>${escapeHtml(card.title)}</strong>
        ${card.layer ? badge(card.layer, card.layer) : ''}
      </div>
      <div class="snippet">${escapeHtml(card.snippet || '')}</div>
      <div class="sub">
        <span>${escapeHtml(card.file)}</span>
        <span>${relativeTime(card.updated)}</span>
        <span>${formatBytes(card.bytes)}</span>
      </div>
    `;
    button.addEventListener('click', () => selectCard(card.file));
    list.appendChild(button);
  }
}

async function loadCards() {
  const q = encodeURIComponent(state.q);
  const layer = encodeURIComponent(state.layer);
  const data = await api(`/api/cards?q=${q}&layer=${layer}`);
  state.cards = data.cards;
  renderList();
}

async function selectCard(file) {
  if (state.editing && state.dirty) {
    if (!confirm('当前编辑未保存，确定切换？')) return;
  }
  const card = await api(`/api/card?file=${encodeURIComponent(file)}`);
  state.card = card;
  state.selected = file;
  state.editing = false;
  state.dirty = false;
  renderList();
  renderCard();
}

function renderCard() {
  const card = state.card;
  $('welcome').classList.add('hidden');
  $('card').classList.remove('hidden');
  $('card-title').textContent = card.title;
  $('card-path').textContent = card.file;
  $('card-badges').innerHTML = [
    card.layer ? badge(card.layer, card.layer) : '',
    card.status ? badge(card.status, 'status') : '',
    badge(formatBytes(card.bytes)),
  ].join('');
  $('card-meta').innerHTML = `
    <span><strong>文件</strong> <code>${escapeHtml(card.file)}</code></span>
    <span><strong>更新</strong> ${relativeTime(card.updated)}</span>
    <span><strong>大小</strong> ${formatBytes(card.bytes)}</span>
    <span><strong>层</strong>
      <select id="card-layer" class="select">
        <option value="">未分层</option>
        <option value="fixed">fixed</option>
        <option value="env">env</option>
        <option value="task">task</option>
      </select>
    </span>
  `;
  const layerSelect = $('card-layer');
  layerSelect.value = card.layer || '';
  layerSelect.addEventListener('change', async () => {
    try {
      const updated = await api('/api/layer', {
        method: 'POST',
        body: JSON.stringify({ file: card.file, layer: layerSelect.value }),
      });
      state.card = updated;
      renderCard();
      await loadCards();
      toast('层已更新');
    } catch (error) {
      toast(error.message);
      layerSelect.value = card.layer || '';
    }
  });
  $('card-preview').innerHTML = renderMarkdown(card.raw.replace(/^#\s+.+\r?\n?/, ''));
  $('card-preview').classList.remove('hidden');
  $('edit-wrap').classList.add('hidden');
  $('edit-btn').classList.remove('hidden');
  $('copy-btn').classList.remove('hidden');
  $('editor').value = card.raw;
  $('dirty').textContent = '';
}

function startEdit() {
  if (!state.card) return;
  state.editing = true;
  state.dirty = false;
  $('card-preview').classList.add('hidden');
  $('edit-wrap').classList.remove('hidden');
  $('edit-btn').classList.add('hidden');
  $('copy-btn').classList.add('hidden');
  $('editor').value = state.card.raw;
  $('dirty').textContent = '';
  $('editor').focus();
}

function cancelEdit() {
  if (!state.card) return;
  state.editing = false;
  state.dirty = false;
  renderCard();
}

async function saveEdit() {
  if (!state.editing || !state.card) return;
  const content = $('editor').value;
  try {
    const updated = await api('/api/card', {
      method: 'PUT',
      body: JSON.stringify({
        file: state.card.file,
        content,
        previousContent: state.card.raw,
      }),
    });
    state.card = updated;
    state.editing = false;
    state.dirty = false;
    renderCard();
    await loadCards();
    await loadState();
    toast('已保存');
  } catch (error) {
    if (error.data?.current !== undefined) {
      const refresh = confirm('文件已被外部修改，未保存。刷新到磁盘版本？');
      if (refresh) {
        await selectCard(state.card.file);
        toast('已刷新');
      } else {
        $('dirty').textContent = '未保存：磁盘已变化';
      }
      return;
    }
    toast(error.message);
  }
}

function openNew(prefill = '') {
  state.newFileTouched = false;
  $('new-file').value = '';
  $('new-trigger').value = prefill;
  $('new-layer').value = '';
  $('new-preferred').value = '';
  $('new-fallback').value = '';
  $('new-deadend').value = '';
  $('new-why').value = '';
  $('new-verification').value = '';
  $('new-evidence').value = '';
  $('new-error').classList.add('hidden');
  if (prefill) setSuggestedFile();
  $('modal').classList.remove('hidden');
  setTimeout(() => $('new-trigger').focus(), 30);
}

function closeNew() {
  $('modal').classList.add('hidden');
}

function suggestedName() {
  const trigger = $('new-trigger').value.trim();
  let base = trigger.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40);
  if (!base) base = `新卡-${Date.now()}`;
  return `${base}.md`;
}

function setSuggestedFile() {
  if (state.newFileTouched) return;
  $('new-file').value = suggestedName();
}

function buildCardContent() {
  const filename = $('new-file').value.trim();
  const name = filename.replace(/\.md$/i, '') || '新卡';
  const trigger = $('new-trigger').value.trim();
  const preferred = $('new-preferred').value.trim();
  const fallback = $('new-fallback').value.trim();
  const deadend = $('new-deadend').value.trim();
  const why = $('new-why').value.trim();
  const verification = $('new-verification').value.trim();
  const evidence = $('new-evidence').value.trim();

  if (!trigger) throw new Error('触发现象不能为空');
  if (!filename) throw new Error('文件名不能为空');

  return `# ${name}

> **触发**：${trigger}
> **验证**：${verification || '（待补）'}

## 首选

${preferred || '（待补）'}

## 被挡时

${fallback || '（待补）'}

## 别再来

| 弯路 | 为什么不通 |
| --- | --- |
| ${deadend || '（待补）'} | ${why || '（待补）'} |

## 注意

- ${why || '（待补）'}

证据：${evidence || '（待补）'}
`;
}

async function createCard() {
  try {
    const content = buildCardContent();
    const file = $('new-file').value.trim();
    const created = await api('/api/card', {
      method: 'POST',
      body: JSON.stringify({ file, content, layer: $('new-layer').value }),
    });
    closeNew();
    await loadCards();
    await loadState();
    await selectCard(created.file);
    toast('卡片已创建');
  } catch (error) {
    $('new-error').textContent = error.message;
    $('new-error').classList.remove('hidden');
  }
}

async function openInbox() {
  $('inbox-panel').classList.remove('hidden');
  await loadInbox();
}

async function loadInbox() {
  const data = await api('/api/inbox');
  state.inbox = data.items;
  renderInbox();
}

function renderInbox() {
  const box = $('inbox-list');
  box.innerHTML = '';
  if (!state.inbox.length) {
    box.innerHTML = '<div class="inbox-empty">收件箱是空的。踩到坑先记一行。</div>';
    return;
  }
  for (const item of state.inbox) {
    const row = document.createElement('div');
    row.className = 'inbox-item';
    row.innerHTML = `<span>${escapeHtml(item.text)}</span>`;
    const button = document.createElement('button');
    button.className = 'btn small ghost';
    button.textContent = '整理成卡';
    button.addEventListener('click', () => {
      closeInbox();
      openNew(item.text.replace(/^[-*]\s*/, ''));
    });
    row.appendChild(button);
    box.appendChild(row);
  }
}

async function addInbox() {
  const input = $('inbox-input');
  const text = input.value.trim();
  if (!text) return;
  try {
    const data = await api('/api/inbox', { method: 'POST', body: JSON.stringify({ text }) });
    state.inbox = data.items;
    input.value = '';
    renderInbox();
    toast('已记下');
  } catch (error) {
    toast(error.message);
  }
}

function closeInbox() {
  $('inbox-panel').classList.add('hidden');
}

async function openAudit() {
  $('audit-panel').classList.remove('hidden');
  $('audit-sub').textContent = '运行中…';
  $('audit-body').innerHTML = '<div class="audit-empty">正在检查卡片…</div>';
  try {
    const audit = await api('/api/audit', { method: 'POST' });
    state.audit = audit;
    renderAudit();
  } catch (error) {
    $('audit-sub').textContent = '';
    $('audit-body').innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
  }
}

function renderAudit() {
  const body = $('audit-body');
  const audit = state.audit;
  if (!audit || !audit.available) {
    $('audit-sub').textContent = '';
    body.innerHTML = '<div class="audit-empty">没有找到 procedures-audit 工具。</div>';
    return;
  }
  if (!audit.parsed) {
    $('audit-sub').textContent = `exit ${audit.exitCode ?? '?'}`;
    body.innerHTML = `<pre class="audit-raw">${escapeHtml(audit.raw || '')}</pre>`;
    return;
  }
  const p0 = audit.parsed.P0 ?? [];
  const p1 = audit.parsed.P1 ?? [];
  $('audit-sub').textContent = `${audit.parsed.cards ?? 0} 张卡`;
  body.innerHTML = `
    <div class="audit-summary">
      <div class="audit-stat"><strong>${p0.length}</strong><span>P0</span></div>
      <div class="audit-stat"><strong>${p1.length}</strong><span>P1</span></div>
      <div class="audit-stat"><strong>${audit.parsed.cards ?? 0}</strong><span>cards</span></div>
    </div>
  `;
  if (!p0.length && !p1.length) {
    body.innerHTML += '<div class="audit-empty">没有发现 P0/P1 问题。</div>';
    return;
  }
  for (const [label, items] of [['P0', p0], ['P1', p1]]) {
    if (!items.length) continue;
    body.innerHTML += `<div class="audit-section">${label}</div>`;
    for (const issue of items) {
      const button = document.createElement('button');
      button.className = 'audit-issue';
      button.type = 'button';
      button.innerHTML = `
        <div class="issue-head">
          <span class="badge ${label === 'P0' ? 'env' : 'task'}">${label}</span>
          <span class="issue-card">${escapeHtml(issue.card || '')}</span>
        </div>
        <div class="issue-detail">${escapeHtml(issue.kind || '')}${issue.detail ? ` · ${escapeHtml(issue.detail)}` : ''}</div>
      `;
      button.addEventListener('click', () => {
        const card = state.cards.find((c) => c.name === issue.card || c.title === issue.card);
        if (card) {
          $('audit-panel').classList.add('hidden');
          selectCard(card.file);
        }
      });
      body.appendChild(button);
    }
  }
}

function closeAudit() {
  $('audit-panel').classList.add('hidden');
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 2200);
}

async function copyPath() {
  if (!state.card) return;
  await navigator.clipboard.writeText(`${state.card.file}`);
  toast('路径已复制');
}

function bind() {
  $('new-btn').addEventListener('click', () => openNew());
  $('audit-btn').addEventListener('click', openAudit);
  $('inbox-btn').addEventListener('click', openInbox);
  $('audit-close').addEventListener('click', closeAudit);
  $('inbox-close').addEventListener('click', closeInbox);
  $('modal-close').addEventListener('click', closeNew);
  $('modal-cancel').addEventListener('click', closeNew);
  $('modal-create').addEventListener('click', createCard);
  $('copy-btn').addEventListener('click', copyPath);
  $('edit-btn').addEventListener('click', startEdit);
  $('cancel-btn').addEventListener('click', cancelEdit);
  $('save-btn').addEventListener('click', saveEdit);
  $('inbox-add').addEventListener('click', addInbox);
  $('new-trigger').addEventListener('input', setSuggestedFile);
  $('new-file').addEventListener('input', () => { state.newFileTouched = true; });
  $('editor').addEventListener('input', () => {
    state.dirty = $('editor').value !== (state.card?.raw ?? '');
    $('dirty').textContent = state.dirty ? '未保存' : '';
  });
  $('modal').addEventListener('click', (event) => {
    if (event.target === $('modal')) closeNew();
  });
  $('search').addEventListener('input', debounce(() => {
    state.q = $('search').value.trim();
    loadCards();
  }, 160));
  $('layer-filter').addEventListener('change', () => {
    state.layer = $('layer-filter').value;
    loadCards();
  });
  $('inbox-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addInbox();
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if (event.key === 'Escape') {
      if (!$('modal').classList.contains('hidden')) return closeNew();
      if (!$('inbox-panel').classList.contains('hidden')) return closeInbox();
      if (!$('audit-panel').classList.contains('hidden')) return closeAudit();
      if (state.editing) return cancelEdit();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && state.editing) {
      event.preventDefault();
      saveEdit();
      return;
    }
    if (typing) return;
    if (event.key === 'j' || event.key === 'k') {
      if (!state.cards.length) return;
      event.preventDefault();
      const current = state.cards.findIndex((card) => card.file === state.selected);
      const step = event.key === 'j' ? 1 : -1;
      const next = state.cards[Math.min(state.cards.length - 1, Math.max(0, (current < 0 ? 0 : current) + step))];
      if (next) selectCard(next.file);
    } else if (event.key === '/') {
      event.preventDefault();
      $('search').focus();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      openNew();
    } else if (event.key.toLowerCase() === 'e' && state.card) {
      event.preventDefault();
      if (!state.editing) startEdit();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) event.preventDefault();
  });
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function main() {
  bind();
  try {
    await loadState();
    await loadCards();
    const initialFile = new URLSearchParams(location.search).get('file');
    if (initialFile) await selectCard(initialFile);
  } catch (error) {
    toast(error.message);
  }
}

main();
