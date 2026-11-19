# ririrish

Write your thesis. Let ririrish handle the formatting.

> create a read me everytime you create new edits to the website

**Permanent development rule:** every change updates `README.md` and adds an entry to `CHANGELOG.md` (new features, bug fixes, changed setup or Firebase steps).

## Overview
A thesis-writing site inspired by Overleaf, built for students. It will format manuscripts to the BatStateU Capstone Manuscript template automatically. **Current status: Phase 1 of 9 (foundation and dashboard).**

## Features (Phase 1)
- Sign up, sign in (email or Google), reset password
- Dashboard: create, open, rename, delete, duplicate, search, sort projects
- Subtle glassmorphism UI with accessible contrast and a fallback without `backdrop-filter`

## Technology stack
HTML, CSS, JavaScript (ES modules, no build step), Firebase Authentication, Firestore, Storage (used from Phase 4). PDF.js and a compile service arrive in Phase 5.

## Folder structure
```
index.html          login + dashboard
editor.html         placeholder (editor arrives in Phase 2)
css/styles.css      design system
js/firebase-config.js  the ONLY Firebase initialization
js/auth.js          authentication helpers
js/projects.js      project CRUD (Firestore)
js/app.js           dashboard UI
js/editor-stub.js   editor placeholder logic
firestore.rules  storage.rules  CHANGELOG.md  .nojekyll
```

## Installation
1. Copy this folder into your existing repository (reuse your existing Firebase config; do not add a second initialization).
2. Paste your web app config into `js/firebase-config.js`.
3. Serve locally with any static server, e.g. `python -m http.server 8000`. Do not open via `file://` (ES modules need http).

## Firebase configuration
1. Authentication > Sign-in method: enable **Email/Password** and **Google**.
2. Authentication > Settings > Authorized domains: add `YOUR_USERNAME.github.io` (and `localhost`).
3. Firestore: publish `firestore.rules`. Storage: publish `storage.rules`.
4. Firebase web config values are public identifiers; never put Admin credentials or private secrets in this repo.

### Firestore collections
`projects/{projectId}`: `title, authors[], template, ownerId, ownerName, collaborators{uid: role}, collaboratorIds[], sharing, createdAt, updatedAt`.
Planned: `projects/{id}/content`, `projects/{id}/versions`, `projects/{id}/lock` (Phases 2, 6, 7).

### Storage structure (from Phase 4)
`projects/{projectId}/images/{file}`. Phase 1 rules deny all access.

### Security rules
Owners create, read, update, delete. Invited users (`collaboratorIds`) can read. Editor-role updates and edit locks are added in Phase 7.

## GitHub Pages deployment
Push to your repo, then Settings > Pages > Deploy from branch (`main`, root). All paths are relative, so project sites under `/repo-name/` work.

## Known limitations
- No editor yet (placeholder page only).
- Sharing UI is disabled until Phase 7.
- Deleting a project does not yet remove subcollections or Storage files (none exist yet).
- Projects created before this version, if any, need `ownerId` and `collaboratorIds` fields to appear.

## Development roadmap
1 Foundation (done) · 2 Thesis editor · 3 Manuscript formatting · 4 Images and tables · 5 PDF and preview · 6 Cloud saving and history · 7 Sharing and edit lock · 8 Advanced tools · 9 Testing and deployment

## Future tools (not implemented; no buttons in the UI)
AI Proofread, Rewrite Selection, Explain Selection, Academic Tone, Consistency Checker, Citation Checker, Formatting Inspector, Document Comparison, Adviser Comments, Thesis Rescue, Defense Preparation.
