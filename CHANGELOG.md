# Changelog

## [0.3.0] - Phase 3: Manuscript Formatting
### Added
- BatStateU — Capstone Manuscript template with adjustable Template settings; the editor page now follows font, size, paper, margins, spacing, indent, alignment and chapter heading size. The abstract is single-spaced.
- Editable title page with multiple authors (Last, First M.I.) and institutional fields; fully editable degree and introductory statements.
- Editable approval sheet with unlimited signatories, roles, titles and designation labels; add, edit, remove, reorder.
- Placeholder support in statements ({title}, {authors}, {degree}, {program}, ...).
- Generated table of contents (no page numbers yet).
- New files: `js/frontmatter.js`; new project fields `meta` and `format`.
### Changed
- Title Page, Approval Sheet and Table of Contents are now openable entries instead of "auto" placeholders.
- Chapter headings in the editor show "CHAPTER N" and the title, bold and uppercase.
- No Firestore rules change is needed.

## [0.2.2] - Bug fix
### Fixed
- Login form still showed above the projects list after signing in. Views are now hidden with the `hidden` attribute and inline `display:none`, so they stay hidden even if the browser serves an old cached stylesheet.
- Added `?v=0.2.2` to CSS and JS links so browsers load the updated files. Bump this number whenever files change.
- The login error message is cleared once sign-in succeeds.

## [0.2.1] - Bug fix
### Fixed
- Signing in left the login form visible above the projects list. Author CSS (`display:grid`, `display:block`, `display:inline-flex`) was overriding the `hidden` attribute. Added a global `[hidden]{display:none!important}` rule in `css/styles.css`. This also fixes the always-visible "Full name" field on the sign-in form and the "Add chapter" button showing for read-only users.

## [0.2.0] - Phase 2: Thesis Editor
### Added
- Three-panel editor (`editor.html`, `js/editor.js`, `js/doc-model.js`, `css/editor.css`).
- Structure tree with collapsible groups; add, rename, reorder and delete chapters; current section highlighted.
- Writing blocks: paragraph, section, subsection, list (six styles); add, reorder, delete, convert section and subsection.
- File outline with click-to-jump; automatic heading numbers.
- Toolbar (undo, redo, bold, italic, underline, list style, alignment) and shortcuts (Ctrl+B/I/U/Z/Y/S).
- Debounced Firestore autosave per chapter, save status, word count, estimated pages, current chapter.
- Firestore `chapters` subcollection and matching security rules.
### Changed
- Duplicating a project now copies its chapters; deleting a project now deletes its chapters.
- Removed `js/editor-stub.js`.
### Notes
- Image, table, citation and equation buttons are disabled and labelled "soon". Preview is a placeholder until Phase 5.
- You must republish `firestore.rules`.

## [0.1.1] - Free-plan revision
### Changed
- Removed Firebase Storage (requires a paid plan). Deleted `storage.rules` and the Storage import in `js/firebase-config.js`.
- Phase 4 images will be compressed in the browser and stored as small Firestore documents instead.
### Fixed
- Split Firestore `update` and `delete` rules so project deletion is not blocked by a null `request.resource`.

## [0.1.0] - Phase 1: Foundation and Setup
### Added
- Project structure, single Firebase initialization (`js/firebase-config.js`).
- Email/password and Google sign-in, sign-out, password reset.
- Dashboard: create, open, rename, delete, duplicate, search, sort, last-modified date, sharing status, template.
- Text-based "ririrish" logo and subtle glassmorphism design system with a solid fallback when `backdrop-filter` is unsupported; light and dark themes.
- `firestore.rules` (owner control, invited users read) and deny-all `storage.rules`.
- GitHub Pages readiness (`.nojekyll`, relative paths only).
- `editor.html` placeholder that loads a project and confirms access.
### Notes
- Share button is disabled and labelled "soon" until Phase 7.
- Deleting a project removes its document only; subcollections and Storage files will be cleaned up once they exist (Phases 4 and 6).
