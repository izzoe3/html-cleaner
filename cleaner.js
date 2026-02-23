// ─────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────
let allowedAttrs = ['href','src','alt','title','width','height','target','rel','colspan','rowspan'];
let liveMode = true;
let debounceTimer = null;
let htmlSyncTimer = null;

// ─────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────
renderAttrChips();
document.getElementById('attrMode').addEventListener('change', updateAttrUI);
document.getElementById('attrInput').addEventListener('keydown', e => { if (e.key === 'Enter') addAttr(); });
updateAttrUI();

const editor     = document.getElementById('editor');
const htmlSource = document.getElementById('htmlSource');

editor.addEventListener('input', onEditorChange);
htmlSource.addEventListener('input', onHtmlSourceChange);
document.addEventListener('selectionchange', updateToolbarState);

// Switch back to live mode on next WYSIWYG keystroke or paste
editor.addEventListener('keydown', () => { liveMode = true; });
editor.addEventListener('paste',   () => { setTimeout(() => { liveMode = true; showRawHTML(); }, 50); });

// ─────────────────────────────────────────────────
// Editor → HTML source  (left → right, live)
// ─────────────────────────────────────────────────
function onEditorChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (liveMode) showRawHTML();
    updateWordCount();
  }, 80);
}

function showRawHTML() {
  const raw        = editor.innerHTML || '';
  const prettyPrint = document.getElementById('prettyPrint').checked;
  const display    = prettyPrint ? prettyHTML(raw) : raw;
  htmlSource.value = display;
  updateLineCount(display);
  document.getElementById('statRaw').textContent     = raw.length + ' ch';
  document.getElementById('statCleaned').textContent = '—';
  document.getElementById('statRed').textContent     = '—';
  document.getElementById('modeTag').textContent     = 'live preview';
}

// ─────────────────────────────────────────────────
// HTML source → WYSIWYG  (right → left, on edit)
// ─────────────────────────────────────────────────
function onHtmlSourceChange() {
  liveMode = false;
  clearTimeout(htmlSyncTimer);
  htmlSyncTimer = setTimeout(() => {
    const html       = htmlSource.value;
    editor.innerHTML = html;
    updateWordCount();
    updateLineCount(html);
    document.getElementById('modeTag').textContent = 'html edited';
    setTimeout(() => { liveMode = true; }, 300);
  }, 400);
}

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────
function updateWordCount() {
  const text  = editor.innerText || '';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  document.getElementById('wordCount').textContent = words + ' words';
}

function updateLineCount(text) {
  const lines = (text.match(/\n/g) || []).length + 1;
  document.getElementById('lineCount').textContent = lines + ' lines';
}

// ─────────────────────────────────────────────────
// Clean button
// ─────────────────────────────────────────────────
function runClean() {
  const rawHTML = editor.innerHTML || '';
  if (!rawHTML.trim()) return;

  const cleaned     = cleanHTML(rawHTML);
  editor.innerHTML  = cleaned;

  const prettyPrint = document.getElementById('prettyPrint').checked;
  const out         = prettyPrint ? prettyHTML(cleaned) : cleaned;

  htmlSource.value  = out;
  updateLineCount(out);

  const rawLen = rawHTML.length;
  const outLen = out.length;
  const pct    = rawLen > 0 ? Math.round((1 - outLen / rawLen) * 100) : 0;

  document.getElementById('statRaw').textContent     = rawLen.toLocaleString() + ' ch';
  document.getElementById('statCleaned').textContent = outLen.toLocaleString() + ' ch';
  document.getElementById('statRed').textContent     = pct + '%';
  document.getElementById('modeTag').textContent     = '✓ cleaned';
  updateWordCount();

  liveMode = false;
}

// ─────────────────────────────────────────────────
// Core HTML cleaner
// ─────────────────────────────────────────────────
function cleanHTML(html) {
  const attrMode       = document.getElementById('attrMode').value;
  const stripMso       = document.getElementById('stripMso').checked;
  const stripClass     = document.getElementById('stripClass').checked;
  const stripStyle     = document.getElementById('stripStyle').checked;
  const collapseEmpty  = document.getElementById('collapseEmpty').checked;
  const semanticTags   = document.getElementById('semanticTags').checked;
  const removeComments = document.getElementById('removeComments').checked;
  const removeEvents   = document.getElementById('removeEvents').checked;
  const removeData     = document.getElementById('removeData').checked;
  const unwrapDivSpan  = document.getElementById('unwrapDivSpan').checked;

  const parser = new DOMParser();
  const doc    = parser.parseFromString(html, 'text/html');
  const root   = doc.body;

  // ── Remove HTML comments ──────────────────────
  if (removeComments) {
    const iter  = document.createNodeIterator(root, NodeFilter.SHOW_COMMENT);
    const nodes = [];
    let n;
    while ((n = iter.nextNode())) nodes.push(n);
    nodes.forEach(c => c.parentNode && c.parentNode.removeChild(c));
  }

  // Formatting tags — never remove or strip content from these
  const FORMATTING_TAGS = new Set([
    'strong','em','u','s','strike','ins','del','mark','sub','sup','code','b','i'
  ]);

  // ── Rescue inline-style formatting (Google Docs pattern) ──
  // Runs BEFORE style stripping so bold/italic/underline survive
  if (semanticTags) {
    root.querySelectorAll('[style]').forEach(el => {
      const style      = el.getAttribute('style') || '';
      const isBold      = /font-weight\s*:\s*(bold|700|800|900)/i.test(style);
      const isItalic    = /font-style\s*:\s*italic/i.test(style);
      const isUnderline = /text-decoration\s*:[^;]*underline/i.test(style);
      const isStrike    = /text-decoration\s*:[^;]*line-through/i.test(style);

      const wrapWith = (tagName) => {
        const wrapper = doc.createElement(tagName);
        while (el.firstChild) wrapper.appendChild(el.firstChild);
        el.appendChild(wrapper);
      };

      if (isStrike)    wrapWith('s');
      if (isUnderline) wrapWith('u');
      if (isItalic)    wrapWith('em');
      if (isBold)      wrapWith('strong');

      // Strip the now-redundant formatting properties from the style
      const cleaned = style
        .split(';')
        .filter(r => {
          const rule = r.trim().toLowerCase();
          return !/^font-weight/.test(rule)
              && !/^font-style/.test(rule)
              && !/^text-decoration/.test(rule);
        })
        .join(';')
        .trim();
      cleaned ? el.setAttribute('style', cleaned) : el.removeAttribute('style');
    });

    root.querySelectorAll('b').forEach(el => swapTag(el, 'strong', doc));
    root.querySelectorAll('i').forEach(el => swapTag(el, 'em', doc));
  }

  // ── Unwrap <div> and <span> (keep children) ──
  if (unwrapDivSpan) {
    Array.from(root.querySelectorAll('div, span')).reverse().forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
  }

  // ── Per-element attribute cleanup ─────────────
  root.querySelectorAll('*').forEach(el => {
    const tagName     = el.tagName.toLowerCase();
    const isFormatting = FORMATTING_TAGS.has(tagName);

    // Strip mso-* rules from style attribute
    if (stripMso && el.hasAttribute('style')) {
      const cleanedStyle = el.getAttribute('style')
        .split(';')
        .filter(r => r.trim() && !r.trim().toLowerCase().startsWith('mso-'))
        .join(';').trim();
      cleanedStyle ? el.setAttribute('style', cleanedStyle) : el.removeAttribute('style');
    }

    Array.from(el.attributes).map(a => a.name).forEach(attr => {
      const a      = attr.toLowerCase();
      let remove   = false;

      if (!isFormatting) {
        if      (attrMode === 'remove-all') remove = true;
        else if (attrMode === 'allowlist')  remove = !allowedAttrs.includes(a);
        else if (attrMode === 'blocklist')  remove = allowedAttrs.includes(a);
      }

      if (stripClass && a === 'class')           remove = true;
      if (stripStyle && a === 'style')           remove = true;
      if (removeEvents && a.startsWith('on'))    remove = true;
      if (removeData   && a.startsWith('data-')) remove = true;

      if (remove) el.removeAttribute(attr);
    });
  });

  // ── Remove empty block elements ───────────────
  if (collapseEmpty) {
    let changed = true;
    while (changed) {
      changed = false;
      root.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6').forEach(el => {
        const inner = el.innerHTML.replace(/&nbsp;/gi, '').trim();
        if (!inner) { el.parentNode && el.parentNode.removeChild(el); changed = true; }
      });
    }
  }

  let out = root.innerHTML.trim();
  out = out.replace(/(\s*&nbsp;\s*)+/g, ' ').trim();
  return out;
}

// ─────────────────────────────────────────────────
// Toolbar formatting
// ─────────────────────────────────────────────────
function fmt(cmd, value) {
  editor.focus();
  document.execCommand(cmd, false, value || null);
  onEditorChange();
}

function applyBlock(tag) {
  editor.focus();
  document.execCommand('formatBlock', false, tag);
  onEditorChange();
}

function insertLink() {
  const url = prompt('Enter URL:', 'https://');
  if (url) fmt('createLink', url);
}

function insertTable() {
  const rows = parseInt(prompt('Number of rows:', '3') || '0');
  const cols = parseInt(prompt('Number of columns:', '3') || '0');
  if (!rows || !cols) return;

  let html = '<table><thead><tr>';
  for (let c = 0; c < cols; c++) html += `<th>Header ${c + 1}</th>`;
  html += '</tr></thead><tbody>';
  for (let r = 0; r < rows - 1; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) html += '<td>&nbsp;</td>';
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>';

  document.execCommand('insertHTML', false, html);
  onEditorChange();
}

function updateToolbarState() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount)           return;
  if (!editor.contains(sel.anchorNode)) return;

  let node = sel.anchorNode;
  while (node && node !== editor) {
    const tag     = node.nodeName && node.nodeName.toLowerCase();
    const fmtSel  = document.getElementById('blockFormat');
    const match   = Array.from(fmtSel.options).find(o => o.value === tag);
    if (match) { fmtSel.value = tag; break; }
    node = node.parentNode;
  }
}

// ─────────────────────────────────────────────────
// Attribute chips (sidebar)
// ─────────────────────────────────────────────────
function renderAttrChips() {
  document.getElementById('attrChips').innerHTML = allowedAttrs
    .map((a, i) => `<span class="chip">${a}<button onclick="removeAttr(${i})">×</button></span>`)
    .join('');
}

function addAttr() {
  const inp = document.getElementById('attrInput');
  inp.value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean).forEach(v => {
    if (!allowedAttrs.includes(v)) allowedAttrs.push(v);
  });
  inp.value = '';
  renderAttrChips();
}

function removeAttr(i) {
  allowedAttrs.splice(i, 1);
  renderAttrChips();
}

function updateAttrUI() {
  const mode = document.getElementById('attrMode').value;
  document.getElementById('attrListWrap').style.display =
    (mode === 'remove-all' || mode === 'none') ? 'none' : '';
  document.getElementById('attrListLabel').textContent =
    mode === 'blocklist' ? 'Blocked attrs:' : 'Allowed attrs:';
}

// ─────────────────────────────────────────────────
// Pretty print
// ─────────────────────────────────────────────────
function prettyHTML(html) {
  const voids = new Set([
    'area','base','br','col','embed','hr','img','input',
    'link','meta','param','source','track','wbr'
  ]);
  const inlineTags = new Set([
    'a','abbr','acronym','b','bdo','big','br','button','cite','code','dfn',
    'em','i','img','input','kbd','label','map','object','output','q','samp',
    'select','small','span','strong','sub','sup','textarea','time','tt','u','var'
  ]);

  let out = '', depth = 0;
  const re = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>|[^<]+)/gi;
  let m;

  while ((m = re.exec(html))) {
    const tok      = m[0].trim();
    if (!tok) continue;
    const tag      = (tok.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/) || [])[1] || '';
    const isInline = inlineTags.has(tag.toLowerCase());

    if (tok.startsWith('<!--')) {
      out += '  '.repeat(depth) + tok + '\n';
    } else if (tok.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      out += '  '.repeat(depth) + tok + '\n';
    } else if (tok.startsWith('<')) {
      out += '  '.repeat(depth) + tok + '\n';
      if (!voids.has(tag.toLowerCase()) && !tok.endsWith('/>') && !isInline) depth++;
    } else {
      const t = tok.replace(/\s+/g, ' ');
      if (t) out += '  '.repeat(depth) + t + '\n';
    }
  }
  return out.trim();
}

// ─────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────
function swapTag(el, newTagName, doc) {
  if (!el.parentNode) return;
  const newEl = doc.createElement(newTagName);
  Array.from(el.attributes).forEach(a => newEl.setAttribute(a.name, a.value));
  while (el.firstChild) newEl.appendChild(el.firstChild);
  el.parentNode.replaceChild(newEl, el);
}

function clearAll() {
  editor.innerHTML  = '';
  htmlSource.value  = '';
  liveMode          = true;
  document.getElementById('lineCount').textContent     = '—';
  document.getElementById('wordCount').textContent     = '0 words';
  document.getElementById('statRaw').textContent       = '—';
  document.getElementById('statCleaned').textContent   = '—';
  document.getElementById('statRed').textContent       = '—';
  document.getElementById('modeTag').textContent       = 'live preview';
}

function copyOutput() {
  const text = htmlSource.value;
  if (!text.trim()) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn      = document.getElementById('copyBtn');
    btn.textContent = '✓ Copied';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Copy'; btn.style.color = ''; }, 1800);
  });
}