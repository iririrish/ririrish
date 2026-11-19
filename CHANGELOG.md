# Changelog

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
