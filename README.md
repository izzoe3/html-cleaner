# HTML Cleaner V4 — fixes

Replace `index.html`, `editor.js`, `cleaner.js`, and `style.css` in your project. Keep `vendor/ckeditor5/` unchanged.

- **Undo Clean:** restores both the CKEditor document and the source as they were before the last cleaning. It is a one-step safeguard, not persistent version history.
- **Repeat-clean guard:** if you click Clean again without making edits or altering cleaning settings, it does nothing.
- **Table figures:** CKEditor uses `<figure class="table">` internally. The HTML source output and cleaned HTML unwrap only this specific wrapper, leaving semantic figures untouched. When editing resumes, CKEditor may recreate its internal wrapper; this is expected.
- **Table width:** expanded CKEditor table wrapper is set to full editor width so narrower first tables no longer appear centered due to default figure margins.

Check: paste from Word and Google Docs, test merged cells, press Clean repeatedly, Undo Clean, and edit after cleaning.

The application still needs the existing self-hosted CKEditor UMD vendor assets.
