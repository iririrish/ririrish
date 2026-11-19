# ririrish

Write your thesis. Let ririrish handle the formatting.

> create a read me everytime you create new edits to the website

**Permanent development rule:** every change updates `README.md` and adds an entry to `CHANGELOG.md` (new features, bug fixes, changed setup or Firebase steps).

## Overview
A thesis-writing site inspired by Overleaf, built for students. It will format manuscripts to the BatStateU Capstone Manuscript template automatically. **Current status: Phase 5 of 9 (PDF and preview).**

## Features (Phase 1)
- Sign up, sign in (email or Google), reset password
- Dashboard: create, open, rename, delete, duplicate, search, sort projects
- Subtle glassmorphism UI with accessible contrast and a fallback without `backdrop-filter`
- Three-panel editor: structure tree (collapsible), writing area, preview placeholder
- Chapters: add, rename, move up/down, delete. Front and back matter have fixed entries
- Blocks: paragraphs, sections, subsections, lists (bullets, 1 2 3, A B C, a b c, I II III, i ii iii); add, edit, reorder (a section moves with its content), delete, convert section/subsection
- Toolbar: undo, redo, bold, italic, underline, list styles, alignment. Shortcuts: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, Ctrl+Y, Ctrl+S
- File outline that jumps to headings; automatic section numbers (1.1, 1.1.1)
- BatStateU — Capstone Manuscript template (Times New Roman 12 pt, US Letter, 1 inch margins, double spacing, 0.5 inch indent, justified, 14 pt bold uppercase chapter headings, single-spaced abstract, Harvard references). Font, size, paper, margins, spacing, indent, alignment and heading size are adjustable under **Template settings**; the writing page follows them
- **Matches the official capstone manuscript template** (`Castone_Manuscript_Template.pdf`): title page and approval sheet layouts, front matter order (Approval Sheet, Abstract, Acknowledgement, Table of Contents, Lists), chapter headings as `CHAPTER 1. TITLE`, section headings uppercase bold not indented, subsection headings proper case bold with a 5 pt indent, 2nd subsection with a 10 pt indent (numbered 1.1, 1.1.1, 1.1.1.1; no deeper levels), abstract with italic keywords and a 200–250 word / 5 keyword check
- New projects start with the template's starter chapters and sections; existing projects are not changed
- Editable title page: research title, multiple authors (Last, First M.I., add/remove/reorder), degree, program, specialization, university, campus, college, department, academic year, submission date, introductory statement and degree statement
- Editable approval sheet: approval statement, optional certification, unlimited signatories (name, academic title and position, role, designation label; add/remove/reorder)
- Statements support placeholders such as {title}, {authors}, {degree}, {program}, so changing a field updates every page that uses it
- Table of contents with dot leaders, generated from chapters and sections as in the template (with real page numbers in the generated PDF)
- Images: upload (PNG, JPG, WebP), drag and drop, preview before inserting, replace, delete, caption, alt text, left/center/right alignment, corner resize handles with locked aspect ratio (unlockable), numeric width/height in inches, restore original size; never wider than the page margins. Images are compressed to WebP in the browser, stored in Supabase Storage, and recorded in Firestore
- Tables: choose rows and columns, edit cells (bold/italic), add/remove rows and columns, merge right/down, split, drag to resize columns, per-column alignment, header row, caption and label, delete; **Copy LaTeX** produces a booktabs `table` (with `multicolumn`/`multirow` for merged cells)
- Figure and table numbering across the whole manuscript; List of Tables and List of Figures generated from captions
- `[[figure: caption]]` and `[[table: caption]]` on their own line, then Enter, create a figure or table
- **Real PDF generation** (`js/pdf.js`, runs in the browser, no server): template fonts, margins, line spacing, indents, justification, headings, lists, tables with merged cells, figures with captions, title page, approval sheet, abstract, acknowledgement, chapters, appendix. Page numbers: title page unnumbered, front matter in roman numerals (ii, iii, ...), body in arabic from Chapter 1. The table of contents, list of tables and list of figures carry real page numbers (calculated over several passes)
- Live preview panel (PDF.js): green **Recompile**, page counter, previous/next page, zoom in/out, fit width, **Download PDF**, and an "Edited since last compile" hint. The preview shows the actual generated PDF, not an HTML imitation
- **Layout** menu: Editor + PDF, Editor only, PDF only (remembered per browser); the PDF-only view uses the whole workspace and resizes correctly
- Thin, quiet scrollbars
- Debounced autosave to Firestore with Saving / Saved / Error status; word count and estimated pages

## Technology stack
HTML, CSS, JavaScript (ES modules, no build step), Firebase Authentication and Firestore on the free Spark plan, plus Supabase Storage on its free plan for image files (no paid services). PDF generation uses pdf-lib and the preview uses PDF.js, both loaded from CDNs and both free.

## Folder structure
```
index.html          login + dashboard
editor.html         three-panel thesis editor
css/styles.css      design system
css/editor.css      editor layout
js/firebase-config.js  the ONLY Firebase initialization
js/auth.js          authentication helpers
js/projects.js      project CRUD (Firestore)
js/app.js           dashboard UI
js/editor.js        editor UI
js/frontmatter.js   title page, approval sheet, table of contents
js/doc-model.js     chapters and blocks, Firestore load/save
js/blocks-media.js  figure and table editing
js/images.js        image compression, upload, delete (Supabase + Firestore record)
js/supabase-config.js  Supabase URL, anon key, bucket name
js/latex.js         table to LaTeX
js/pdf.js           PDF layout engine (pdf-lib)
js/preview.js       PDF.js viewer
supabase-setup.sql  bucket and policies (run once)
firestore.rules  CHANGELOG.md  .nojekyll
```

## Installation
1. Copy this folder into your existing repository (reuse your existing Firebase config; do not add a second initialization).
2. Paste your web app config into `js/firebase-config.js`.
3. Serve locally with any static server, e.g. `python -m http.server 8000`. Do not open via `file://` (ES modules need http).

## Firebase configuration
1. Authentication > Sign-in method: enable **Email/Password** and **Google**.
2. Authentication > Settings > Authorized domains: add `YOUR_USERNAME.github.io` (and `localhost`).
3. Firestore Database > Create database (production mode), then Rules tab: publish `firestore.rules`. Stay on the free Spark plan; do not enable Storage.
4. Firebase web config values are public identifiers; never put Admin credentials or private secrets in this repo.

### Firestore collections
`projects/{projectId}`: `title, authors[], template, ownerId, ownerName, collaborators{uid: role}, collaboratorIds[], sharing, createdAt, updatedAt`.
`projects/{id}/chapters/{chapterId}`: `kind` (front, main, back), `title`, `order`, `blocks[]` (`id, type p|h1|h2|list, html, align?, listStyle?`), `updatedAt`. One document per chapter keeps each under Firestore's 1 MiB limit and limits writes to the chapter being edited.
Project document fields added in Phase 3: `meta` (degree, program, specialization, university, campus, college, department, academicYear, submissionDate, introStatement, degreeStatement, approvalStatement, certification, `authorList[]`, `signatories[]`) and `format` (template settings). Existing projects get defaults on first open; nothing is written until you edit.
Planned: `projects/{id}/versions`, `projects/{id}/lock` (Phases 6, 7).

### Images (free plan)
Supabase Storage holds the actual files; Firestore holds only a small record per image, so Firestore stays light. Record at `projects/{id}/images/{imageId}`: `ownerId, fileName, originalName, storagePath, imageUrl, size, width, height, caption, uploadedAt`. Files are saved as `images/{userId}/{projectId}/{imageId}.webp`. Chapter blocks keep the image URL so images show without extra reads. Duplicating a project copies its files; deleting a project deletes its files.

### Security rules
Owners create, read, update, delete. Invited users (`collaboratorIds`) can read. Owners can read and write `chapters`; invited users can read them. **Republish `firestore.rules` after updating to this version.** Image records follow the same rule (owner writes, members read). Editor-role writes and edit locks are added in Phase 7.

## Supabase Storage setup (free, no card needed)
1. Create a free project at supabase.com. Keep the default spend cap on so it can never bill you.
2. SQL Editor: paste and run `supabase-setup.sql`. It creates the public bucket `thesis-images` (2 MB limit, WebP only) and the access policies.
3. Project Settings > API: copy the **Project URL** and the **anon public** key into `js/supabase-config.js`.
4. Republish `firestore.rules` (it now includes image records).

**Security note.** The anon key is public in the site source, and the browser uploads directly. The bucket therefore accepts WebP files up to 2 MB from anyone who has that key, and allows listing and deleting inside the bucket. File paths contain unguessable ids, and the free plan caps total storage at 1 GB, but this is not strict per-user security. A stricter design (a free Supabase Edge Function that checks the Firebase login before issuing upload links) can be added later.

## GitHub Pages deployment
Push to your repo, then Settings > Pages > Deploy from branch (`main`, root). All paths are relative, so project sites under `/repo-name/` work.

## Known limitations
- Citation and equation buttons are disabled ("soon").
- Image storage needs the Supabase setup above; without it the Image button explains what is missing.
- Image uploads are limited by the browser's compression to under 2 MB WebP (longest side 1600 px).
- Changing rows or columns splits any merged cells. Merging uses "merge right" and "merge down" on the active cell rather than drag-selecting a range.
- Deleting an image is permanent and clears undo history for that chapter. Figure and table numbers are continuous through the document.
- The PDF is built by ririrish's own layout engine, not LaTeX or Word, so line and page breaks can differ slightly from Word. It uses the PDF standard fonts (Times for Times New Roman and Georgia, Helvetica for Arial). Characters outside the Western European set (for example Greek letters) are replaced with "?"; equations arrive later.
- Front matter is numbered with roman numerals and the body restarts at 1 at Chapter 1 (the sample PDF is ambiguous). Confirm with your adviser.
- Table header rows are not repeated when a table continues on a new page; very long tables break only between rows. Bibliography is not in the PDF yet.
- The preview needs internet access to load PDF.js and pdf-lib from their CDNs.
- Bibliography is still an "auto" placeholder. 
- The template was checked against the supplied official PDF (US Letter, TNR 12, headings, title page, approval sheet, TOC). Margins and exact spacing are not stated in the PDF, so they stay at the brief's values; **verify them against the latest official BatStateU manuscript guidelines before treating the template as final.** Institution defaults (College of Engineering, Batangas State University - The National Engineering University, Alangilan, Batangas City) come from that PDF and are editable. The dean's name is left blank.
- Template settings apply to the editor page and to the generated PDF.
- Only the project owner can edit; collaborators get read access until Phase 7.
- Rich text uses the browser's `execCommand`, which is deprecated but still supported everywhere.
- Sharing UI is disabled until Phase 7.
- Deleting a project does not yet remove its subcollections (none exist yet).
- Free plan: images are compressed and limited in size; very large images are downscaled.
- Projects created before this version, if any, need `ownerId` and `collaboratorIds` fields to appear.

## Development roadmap
1 Foundation (done) · 2 Thesis editor (done) · 3 Manuscript formatting (done) · 4 Images and tables (done) · 5 PDF and preview (done) · 6 Cloud saving and history · 7 Sharing and edit lock · 8 Advanced tools · 9 Testing and deployment

## Future tools (not implemented; no buttons in the UI)
AI Proofread, Rewrite Selection, Explain Selection, Academic Tone, Consistency Checker, Citation Checker, Formatting Inspector, Document Comparison, Adviser Comments, Thesis Rescue, Defense Preparation.
