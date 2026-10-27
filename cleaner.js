'use strict';
// HTML cleaning engine. Does not depend on CKEditor.
const Cleaner = (() => {
  const structuralAttrs = new Set(['colspan', 'rowspan', 'scope', 'headers']);
  const forbiddenTags = new Set(['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link', 'base', 'svg', 'math', 'template']);
  const dangerousUrl = /^\s*(?:javascript|vbscript|data):/i;
  const emptyBlockTags = 'p,div,h1,h2,h3,h4,h5,h6';

  function optionsFromUI(allowedAttrs) {
    const get = id => document.getElementById(id).checked;
    return {
      attrMode: document.getElementById('attrMode').value,
      allowedAttrs: new Set(allowedAttrs.map(a => a.toLowerCase())),
      stripMso: get('stripMso'), stripClass: get('stripClass'),
      stripStyle: get('stripStyle'), collapseEmpty: get('collapseEmpty'),
      unwrapDivSpan: get('unwrapDivSpan'), semanticTags: get('semanticTags'),
      removeComments: get('removeComments'), removeData: get('removeData')
    };
  }

  function replaceTag(element, tagName, doc) {
    const replacement = doc.createElement(tagName);
    for (const attr of Array.from(element.attributes)) replacement.setAttribute(attr.name, attr.value);
    while (element.firstChild) replacement.appendChild(element.firstChild);
    element.replaceWith(replacement);
    return replacement;
  }

  function unwrap(element) {
    element.replaceWith(...Array.from(element.childNodes));
  }

  // CKEditor 5 uses <figure class="table"> around editable tables. This is
  // editor UI structure, not required for WordPress output. Leave other
  // figures (especially figures containing images/captions) untouched.
  function unwrapTableFigures(input) {
    const doc = new DOMParser().parseFromString(input || '', 'text/html');
    doc.body.querySelectorAll('figure.table').forEach(figure => {
      const children = Array.from(figure.children);
      const table = children.find(el => el.tagName.toLowerCase() === 'table');
      if (!table) return;
      const caption = children.find(el => el.tagName.toLowerCase() === 'figcaption');
      if (caption && caption.textContent.trim() && !table.querySelector('caption')) {
        const tableCaption = doc.createElement('caption');
        tableCaption.textContent = caption.textContent;
        table.prepend(tableCaption);
      }
      // Do not silently discard other content inside a nonstandard figure.
      const extras = children.filter(el => el !== table && el !== caption);
      if (extras.length) return;
      figure.replaceWith(table);
    });
    return doc.body.innerHTML.trim();
  }

  function cleanHTML(input, config) {
    const doc = new DOMParser().parseFromString(input || '', 'text/html');
    const root = doc.body;

    for (const el of Array.from(root.querySelectorAll('*')).reverse()) {
      if (forbiddenTags.has(el.tagName.toLowerCase())) el.remove();
    }
    // Comments are removed without affecting text or table cells.
    if (config.removeComments) {
      const iterator = doc.createNodeIterator(root, NodeFilter.SHOW_COMMENT);
      const comments = [];
      let node;
      while ((node = iterator.nextNode())) comments.push(node);
      comments.forEach(comment => comment.remove());
    }
    if (config.semanticTags) {
      root.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style') || '';
        const tags = [];
        if (/font-weight\s*:\s*(bold|[7-9]00)\b/i.test(style)) tags.push('strong');
        if (/font-style\s*:\s*italic\b/i.test(style)) tags.push('em');
        if (/text-decoration(?:-line)?\s*:[^;]*underline/i.test(style)) tags.push('u');
        if (/text-decoration(?:-line)?\s*:[^;]*line-through/i.test(style)) tags.push('s');
        if (tags.length && el.childNodes.length) {
          let children = Array.from(el.childNodes);
          for (const tag of tags) {
            const wrapper = doc.createElement(tag);
            children.forEach(child => wrapper.appendChild(child));
            el.appendChild(wrapper);
            children = [wrapper];
          }
        }
      });
      root.querySelectorAll('b').forEach(el => replaceTag(el, 'strong', doc));
      root.querySelectorAll('i').forEach(el => replaceTag(el, 'em', doc));
    }
    if (config.unwrapDivSpan) {
      Array.from(root.querySelectorAll('div,span')).reverse().forEach(unwrap);
    }
    root.querySelectorAll('*').forEach(el => {
      if (config.stripMso && el.hasAttribute('style')) {
        const kept = (el.getAttribute('style') || '').split(';')
          .filter(rule => rule.trim() && !/^mso-/i.test(rule.trim())).join(';').trim();
        if (kept) el.setAttribute('style', kept);
        else el.removeAttribute('style');
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        // Mandatory safeguards: optional attribute modes cannot override these.
        let remove = name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'formaction') && dangerousUrl.test(value));
        if (!structuralAttrs.has(name)) {
          if (config.attrMode === 'remove-all') remove = true;
          if (config.attrMode === 'allowlist' && !config.allowedAttrs.has(name)) remove = true;
          if (config.attrMode === 'blocklist' && config.allowedAttrs.has(name)) remove = true;
        }
        if (config.stripClass && name === 'class') remove = true;
        if (config.stripStyle && name === 'style') remove = true;
        if (config.removeData && name.startsWith('data-')) remove = true;
        if (remove) el.removeAttribute(attr.name);
      }
    });
    if (config.collapseEmpty) {
      for (const el of Array.from(root.querySelectorAll(emptyBlockTags)).reverse()) {
        const hasMeaningfulChild = el.querySelector('img,table,ul,ol,hr,video,audio');
        if (!hasMeaningfulChild && !el.textContent.replace(/\u00a0/g, ' ').trim()) el.remove();
      }
    }
    // Remove only CKEditor's table-specific figure wrapper in export HTML.
    // Other figure types are retained.
    return unwrapTableFigures(root.innerHTML.trim());
  }

  // Display-only pretty printer. It does not strip attributes or change text.
  // Inline content, whitespace-sensitive content and mixed-content elements
  // are kept on one line to avoid changing their visible spacing.
  function prettyHTML(html) {
    if (!html || !html.trim()) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = new Set([
      'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dt', 'dd',
      'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
      'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p',
      'section', 'summary', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'ul'
    ]);
    const preserve = new Set(['pre', 'code', 'script', 'style', 'textarea']);
    const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
      'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const indentation = level => '  '.repeat(level);

    // Detect the end of the opening tag without confusing a quoted > for its end.
    function openingTag(element) {
      const htmlText = element.outerHTML;
      let quote = null;
      for (let i = 1; i < htmlText.length; i++) {
        const char = htmlText[i];
        if (quote) { if (char === quote) quote = null; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') return htmlText.slice(0, i + 1);
      }
      return htmlText;
    }

    function serialize(node, level) {
      if (node.nodeType === Node.COMMENT_NODE) {
        return [indentation(level) + '<!--' + node.data + '-->'];
      }
      if (node.nodeType === Node.TEXT_NODE) {
        // Keep text exactly as parsed: never collapse or trim meaningful text.
        return [indentation(level) + node.textContent];
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return [];
      const tag = node.tagName.toLowerCase();
      const start = openingTag(node);
      if (voids.has(tag)) return [indentation(level) + start];
      if (preserve.has(tag)) return [indentation(level) + node.outerHTML];

      const children = Array.from(node.childNodes);
      const hasSignificantText = children.some(child => child.nodeType === Node.TEXT_NODE && child.textContent.length > 0);
      const hasNonBlockChild = children.some(child => child.nodeType === Node.ELEMENT_NODE && !blocks.has(child.tagName.toLowerCase()));
      const containsBlock = children.some(child => child.nodeType === Node.ELEMENT_NODE && blocks.has(child.tagName.toLowerCase()));

      // Keep paragraphs, cells and mixed inline content intact on one line.
      // This avoids introducing text nodes inside inline-rich content.
      if (!containsBlock || hasSignificantText || hasNonBlockChild) {
        return [indentation(level) + node.outerHTML];
      }
      const lines = [indentation(level) + start];
      for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
        lines.push(...serialize(child, level + 1));
      }
      lines.push(indentation(level) + '</' + tag + '>');
      return lines;
    }

    const result = [];
    for (const node of doc.body.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
      result.push(...serialize(node, 0));
    }
    return result.join('\n');
  }
  return { optionsFromUI, cleanHTML, prettyHTML, unwrapTableFigures };
})();
