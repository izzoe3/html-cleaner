
'use strict';
// All editor / HTML source synchronisation lives here.
(() => {
  const $ = id => document.getElementById(id);
  const source = $('htmlSource');

  const allowedAttrs = [
    'href', 'src', 'alt', 'title', 'target', 'rel',
    'colspan', 'rowspan', 'scope', 'headers'
  ];

  let editor = null;
  let lastInput = 'editor';
  let sourceTimer = null;
  let outputTimer = null;
  let writingEditor = false;
  let expanded = false;
  let beforeClean = null;
  let lastCleanSignature = null;
  let contentRevision = 0;

  function renderAttributes() {
    $('attrChips').replaceChildren();

    allowedAttrs.forEach((attr, index) => {
      const chip = document.createElement('span');
      chip.className = 'chip';

      const label = document.createTextNode(attr);
      const remove = document.createElement('button');

      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove ' + attr);

      remove.addEventListener('click', () => {
        allowedAttrs.splice(index, 1);
        renderAttributes();
      });

      chip.append(label, remove);
      $('attrChips').append(chip);
    });
  }

  function addAttributes() {
    const field = $('attrInput');

    field.value
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(x => /^[a-z_:][a-z0-9_.:-]*$/.test(x))
      .forEach(x => {
        if (!allowedAttrs.includes(x)) {
          allowedAttrs.push(x);
        }
      });

    field.value = '';
    renderAttributes();
  }

  function updateAttrUI() {
    const mode = $('attrMode').value;

    $('attrListWrap').hidden =
      mode === 'remove-all' || mode === 'none';

    $('attrListLabel').textContent =
      mode === 'blocklist'
        ? 'Blocked attributes:'
        : 'Allowed attributes:';
  }

  function lineCount(value) {
    $('lineCount').textContent =
      (value ? value.split('\n').length : 0) + ' lines';
  }

  function wordCount() {
    if (!editor) return;

    const text = new DOMParser()
      .parseFromString(editor.getData(), 'text/html')
      .body.textContent || '';

    $('wordCount').textContent =
      (text.trim().match(/\S+/g) || []).length + ' words';
  }

  function setMode(text) {
    $('modeTag').textContent = text;
  }

  function showEditorHTML() {
    if (!editor || lastInput !== 'editor') return;

    const html = Cleaner.unwrapTableFigures(editor.getData());

    source.value = $('prettyPrint').checked
      ? Cleaner.prettyHTML(html)
      : html;

    lineCount(source.value);

    $('statRaw').textContent =
      html.length.toLocaleString() + ' ch';

    $('statCleaned').textContent = '—';
    $('statRed').textContent = '—';

    setMode('editing');
  }

  function applySourceToEditor() {
    if (!editor || lastInput !== 'source') return;

    clearTimeout(sourceTimer);
    writingEditor = true;

    try {
      editor.setData(source.value);
    } finally {
      writingEditor = false;
    }

    wordCount();
    setMode('source edited');
  }

  function onEditorChange() {
    if (writingEditor) return;

    lastInput = 'editor';
    contentRevision++;

    lastCleanSignature = null;
    beforeClean = null;

    $('undoCleanBtn').disabled = true;

    clearTimeout(outputTimer);

    outputTimer = setTimeout(showEditorHTML, 140);

    wordCount();
  }

  function onSourceChange() {
    lastInput = 'source';
    contentRevision++;

    lastCleanSignature = null;
    beforeClean = null;

    $('undoCleanBtn').disabled = true;

    clearTimeout(outputTimer);
    clearTimeout(sourceTimer);

    lineCount(source.value);

    sourceTimer = setTimeout(applySourceToEditor, 500);

    setMode('source editing');
  }

  function clean() {
    if (!editor) return;

    clearTimeout(outputTimer);
    clearTimeout(sourceTimer);

    // Source edits take precedence over editor content.
    const raw = lastInput === 'source'
      ? source.value
      : Cleaner.unwrapTableFigures(editor.getData());

    if (!raw.trim()) return;

    const signature = JSON.stringify([
      contentRevision,
      raw,
      Cleaner.optionsFromUI(allowedAttrs),
      Array.from(allowedAttrs),

      ...[
        'attrMode',
        'stripMso',
        'stripClass',
        'stripStyle',
        'collapseEmpty',
        'unwrapDivSpan',
        'semanticTags',
        'removeComments',
        'removeData'
      ].map(id => {
        const el = $(id);

        return el.type === 'checkbox'
          ? el.checked
          : el.value;
      })
    ]);

    if (signature === lastCleanSignature) {
      setMode('✓ already cleaned — no further changes');
      return;
    }

    const cleaned = Cleaner.cleanHTML(
      raw,
      Cleaner.optionsFromUI(allowedAttrs)
    );

    const output = $('prettyPrint').checked
      ? Cleaner.prettyHTML(cleaned)
      : cleaned;

    // Store both panels before cleaning for Undo Clean.
    beforeClean = {
      data: editor.getData(),
      source: source.value,
      lastInput,
      stats: [
        'statRaw',
        'statCleaned',
        'statRed'
      ].map(id => $(id).textContent)
    };

    $('undoCleanBtn').disabled = false;

    writingEditor = true;

    try {
      editor.setData(cleaned);
    } finally {
      writingEditor = false;
    }

    source.value = output;
    lastInput = 'source';

    lineCount(output);
    wordCount();

    $('statRaw').textContent =
      raw.length.toLocaleString() + ' ch';

    $('statCleaned').textContent =
      cleaned.length.toLocaleString() + ' ch';

    $('statRed').textContent =
      (raw.length
        ? Math.round(
            (1 - cleaned.length / raw.length) * 100
          )
        : 0) + '%';

    lastCleanSignature = signature;

    setMode('✓ cleaned');
  }

  function undoClean() {
    if (!editor || !beforeClean) return;

    clearTimeout(outputTimer);
    clearTimeout(sourceTimer);

    writingEditor = true;

    try {
      editor.setData(beforeClean.data);
    } finally {
      writingEditor = false;
    }

    source.value = beforeClean.source;
    lastInput = beforeClean.lastInput;

    [
      'statRaw',
      'statCleaned',
      'statRed'
    ].forEach((id, i) => {
      $(id).textContent = beforeClean.stats[i];
    });

    beforeClean = null;
    lastCleanSignature = null;
    contentRevision++;

    $('undoCleanBtn').disabled = true;

    lineCount(source.value);
    wordCount();

    setMode('↶ clean undone');
  }

  function clear() {
    if (!editor || !confirm(
      'Clear both the visual editor and HTML source?'
    )) {
      return;
    }

    clearTimeout(outputTimer);
    clearTimeout(sourceTimer);

    writingEditor = true;

    try {
      editor.setData('');
    } finally {
      writingEditor = false;
    }

    source.value = '';

    beforeClean = null;
    lastCleanSignature = null;

    $('undoCleanBtn').disabled = true;

    lastInput = 'editor';

    lineCount('');
    wordCount();

    for (const id of [
      'statRaw',
      'statCleaned',
      'statRed'
    ]) {
      $(id).textContent = '—';
    }

    setMode('cleared');
  }

  async function copy() {
    if (!source.value.trim()) return;

    try {
      await navigator.clipboard.writeText(source.value);

      $('copyBtn').textContent = '✓ Copied';

      setTimeout(() => {
        $('copyBtn').textContent = 'Copy';
      }, 1600);

    } catch (error) {
      source.focus();
      source.select();

      setMode('Select and copy (Cmd/Ctrl+C)');
    }
  }

  function formatSource() {
    if (!source.value.trim()) return;

    clearTimeout(sourceTimer);
    clearTimeout(outputTimer);

    source.value = Cleaner.prettyHTML(source.value);

    contentRevision++;
    lastCleanSignature = null;
    lastInput = 'source';

    lineCount(source.value);

    applySourceToEditor();

    setMode('HTML formatted');
  }

  function toggleExpand() {
    expanded = !expanded;

    $('mainLayout').classList.toggle(
      'source-expanded',
      expanded
    );

    $('expandSourceBtn').textContent =
      expanded ? 'Restore ↔' : 'Expand ↔';

    $('expandSourceBtn').setAttribute(
      'aria-pressed',
      String(expanded)
    );
  }

  function fail(error) {
    console.error(
      'CKEditor failed to initialise',
      error
    );

    setMode('Editor unavailable');

    $('editor').textContent =
      'CKEditor failed to start. Check vendor/ckeditor5 files and your browser console.';

    $('cleanBtn').disabled = true;
  }

  function boot() {
    renderAttributes();
    updateAttrUI();

    $('attrMode').addEventListener(
      'change',
      updateAttrUI
    );

    $('addAttrBtn').addEventListener(
      'click',
      addAttributes
    );

    $('attrInput').addEventListener(
      'keydown',
      e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addAttributes();
        }
      }
    );

    $('cleanBtn').addEventListener('click', clean);

    $('undoCleanBtn').addEventListener(
      'click',
      undoClean
    );

    $('clearBtn').addEventListener('click', clear);
    $('copyBtn').addEventListener('click', copy);

    $('formatSourceBtn').addEventListener(
      'click',
      formatSource
    );

    $('expandSourceBtn').addEventListener(
      'click',
      toggleExpand
    );

    source.addEventListener('input', onSourceChange);

    $('prettyPrint').addEventListener(
      'change',
      () => {
        if (lastInput === 'editor') {
          showEditorHTML();
        }
      }
    );

    if (!window.CKEDITOR) {
      fail(new Error(
        'Missing CKEditor 5 UMD vendor file'
      ));
      return;
    }

    const CK = window.CKEDITOR;

    const requiredNames = [
      'Essentials',
      'Paragraph',
      'Heading',
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Link',
      'List',
      'BlockQuote',
      'Table',
      'TableToolbar',
      'TableProperties',
      'TableCellProperties',
      'TableColumnResize',
      'PasteFromOffice',
      'RemoveFormat',
      'GeneralHtmlSupport'
    ];

    if (
      typeof CK.ClassicEditor?.create !== 'function'
    ) {
      fail(new Error(
        'ClassicEditor is not exported by the CKEditor UMD bundle'
      ));
      return;
    }

    const missing = requiredNames.filter(
      name => typeof CK[name] !== 'function'
    );

    if (missing.length) {
      fail(new Error(
        'CKEditor plugins missing from your UMD bundle: ' +
        missing.join(', ')
      ));
      return;
    }

    const plugins = requiredNames.map(
      name => CK[name]
    );

    const toolbar = [
      'undo',
      'redo',
      '|',
      'heading',
      '|',
      'bold',
      'italic',
      'underline',
      'strikethrough'
    ];

    // Enable optional features when installed.
    const optionalGroups = [
      {
        names: [
          'Subscript',
          'Superscript'
        ],
        items: [
          'subscript',
          'superscript'
        ]
      },
      {
        names: ['Alignment'],
        items: ['alignment']
      },
      {
        names: [
          'Indent',
          'IndentBlock'
        ],
        items: [
          'outdent',
          'indent'
        ]
      },
      {
        names: [
          'FontSize',
          'FontColor',
          'FontBackgroundColor'
        ],
        items: [
          'fontSize',
          'fontColor',
          'fontBackgroundColor'
        ]
      },
      {
        names: ['Highlight'],
        items: ['highlight']
      },
      {
        names: [
          'SpecialCharacters',
          'SpecialCharactersEssentials'
        ],
        items: ['specialCharacters']
      },
      {
        names: ['HorizontalLine'],
        items: ['horizontalLine']
      },
      {
        names: ['CodeBlock'],
        items: ['codeBlock']
      },
      {
        names: ['ListProperties'],
        items: []
      }
    ];

    const enabled = new Set(requiredNames);

    for (const group of optionalGroups) {
      if (
        group.names.every(
          name => typeof CK[name] === 'function'
        )
      ) {
        group.names.forEach(name => {
          if (!enabled.has(name)) {
            plugins.push(CK[name]);
            enabled.add(name);
          }
        });
      }
    }

    const has = name => enabled.has(name);

    if (has('Subscript')) {
      toolbar.push(
        'subscript',
        'superscript'
      );
    }

    toolbar.push(
      'removeFormat',
      '|',
      'link',
      'bulletedList',
      'numberedList'
    );

    if (has('Alignment')) {
      toolbar.push('|', 'alignment');
    }

    if (has('Indent')) {
      toolbar.push(
        'outdent',
        'indent'
      );
    }

    toolbar.push(
      '|',
      'insertTable',
      'blockQuote'
    );

    if (has('HorizontalLine')) {
      toolbar.push('horizontalLine');
    }

    if (has('SpecialCharacters')) {
      toolbar.push('specialCharacters');
    }

    if (has('CodeBlock')) {
      toolbar.push('codeBlock');
    }

    if (has('FontSize')) {
      toolbar.push(
        '|',
        'fontSize',
        'fontColor',
        'fontBackgroundColor'
      );
    }

    if (has('Highlight')) {
      toolbar.push('highlight');
    }

    const editorConfig = {
      licenseKey: 'GPL',

      plugins,

      toolbar: {
        items: toolbar,
        shouldNotGroupWhenFull: true
      },

      heading: {
        options: [
          {
            model: 'paragraph',
            title: 'Paragraph',
            class: 'ck-heading_paragraph'
          },

          ...[1, 2, 3, 4, 5, 6].map(
            level => ({
              model: 'heading' + level,
              view: 'h' + level,
              title: 'Heading ' + level,
              class: 'ck-heading_heading' + level
            })
          )
        ]
      },

      table: {
        contentToolbar: [
          'tableColumn',
          'tableRow',
          'mergeTableCells',
          'tableProperties',
          'tableCellProperties'
        ],

        tableToolbar: [
          'tableColumn',
          'tableRow',
          'mergeTableCells'
        ]
      },

      htmlSupport: {
        allow: [
          {
            name: /^(table|thead|tbody|tfoot|tr|td|th)$/,
            attributes: [
              'colspan',
              'rowspan',
              'scope',
              'headers',
              'width',
              'height'
            ]
          }
        ]
      },

      link: {
        addTargetToExternalLinks: true
      },

      placeholder:
        'Paste text or tables from Word / Google Docs, then edit everything here…'
    };

    if (has('Alignment')) {
      editorConfig.alignment = {
        options: [
          'left',
          'center',
          'right',
          'justify'
        ]
      };
    }

    if (has('FontSize')) {
      editorConfig.fontSize = {
        options: [
          'tiny',
          'small',
          'default',
          'big',
          'huge'
        ],

        supportAllValues: false
      };
    }

    if (has('ListProperties')) {
      editorConfig.list = {
        properties: {
          styles: true,
          startIndex: true,
          reversed: true
        }
      };
    }

    CK.ClassicEditor.create(
      $('editor'),
      editorConfig
    )
      .then(instance => {
        editor = instance;

        editor.model.document.on(
          'change:data',
          onEditorChange
        );

        lastInput = 'editor';

        showEditorHTML();
        wordCount();

        setMode('ready');
      })
      .catch(fail);
  }

  boot();
})();
