# OfflineTeX Research

**Free, installable, offline-first LaTeX editor for iPhone and iPad**, with a responsive UI, local document storage, project ZIP import/export and an optional on-device WebAssembly compiler for scientific papers.

**Status: working editor prototype, compiler deployment not yet verified on an iOS device.**

**Reviewed source update (3 November 2026):** Fixed autosave/import race conditions, recovery after failed writes, PDF ownership when switching projects mid-compilation, unsafe selection of a non-`.tex` main file from ZIP metadata, and caching of Siglum package-dependency metadata. Added automated regression tests and made the GitHub build run the existing logic tests. **Real iPadOS PDF compilation is still untested; this is not a verified production app.** This project does **not** require a Mac, Apple Developer account or paid app subscription. However, you need a free GitHub account and an internet connection **once** to publish the installable website and download the TeX engine/packages. An iOS PWA is not an `.ipa` or an App Store app.

## What is included

- Responsive iPhone Files / Editor / PDF tabs, and a three-pane iPad/desktop workspace.
- CodeMirror LaTeX highlighting, line numbers, editing shortcuts, find/replace, undo/redo and a horizontally scrollable mathematics/LaTeX toolbar.
- IndexedDB projects saved **locally on your device**, with automatic saving; multiple `.tex` documents, folders, `.bib`, `.cls`, `.sty`, `.bst`, image and PDF assets.
- Scientific article, minimal and empty document templates.
- Import existing Overleaf project ZIPs; export a complete source ZIP; export compiled PDFs.
- Compiler adapter to MIT-licensed **Siglum 0.2.0 / TeX Live 2026** (pdfLaTeX, XeLaTeX, BibTeX), with an offline download option for bundled scientific packages.
- A GitHub Actions workflow to fetch the matching WebAssembly compiler, TeX Live bundle assets and publish the app on **free GitHub Pages**, without a local build toolchain.

### Important limitations

- The source ZIP is deliberately small and **does not contain the ~29 MB WASM engine or the much larger scientific TeX package bundles**. The GitHub deployment workflow downloads these from the upstream Siglum v0.2.0 release. Opening `index.html` from your Files app will not compile a PDF.
- The editor and ZIP functionality were tested in a browser simulation. The GitHub Actions build, actual Siglum compilation, offline compilation after cache warmup and iPhone/iPad hardware have **not** been tested in this environment. It is not honest to call this a validated full Overleaf replacement yet.
- The TeX engine supports **bundled** scientific packages, not the entire CTAN catalog. Common packages include `amsmath`, `amssymb`, `mathtools`, `graphicx`, `siunitx`, `hyperref`, `tikz`, `pgfplots`, `natbib`, and many others, where present in the released bundles. For specialized journal templates, use **Add files** to include the `.cls`, `.sty`, `.bst`, or other dependencies alongside your `.tex` files. Some templates still won't compile.
- Compilers: pdfLaTeX or XeLaTeX. BibTeX support is provided by Siglum; Biber, shell-escape, `minted` (when shell escape is required), `pythontex`, and arbitrary external programs are **not** supported by this static hosted design. `biblatex` documents configured for Biber are not supported without changing the bibliography backend.
- Compiling scientific papers on device is memory intensive. Siglum documents approximately **512 MB of RAM**; older iPhones/iPads may run out of memory. Package downloads may consume hundreds of MB of storage.
- iOS may clear website data under storage pressure. **Export ZIP backups of your research frequently.** The app does not sync projects to an account or backup service.
- Safari's embedded PDF viewer can differ by iOS version. If the preview is blank, tap **Open** or **PDF** to view/save the output separately.

## Install it without a Mac (Windows or Linux, via free GitHub Pages)

This is a source project rather than a live hosted site. To install it, first publish it on your GitHub account.

1. Create a **free GitHub account** if you don't have one: https://github.com/signup .
2. On a Windows or Linux computer, extract `OfflineTeX_Research_Source.zip`. It should contain `index.html`, `.github/`, `src/`, `vendor/`, `scripts/`, etc. **Do not upload your private manuscripts into this source repository.**
3. Create a new **public** GitHub repository, e.g. `offline-tex-research`.
4. Upload/push all the extracted source files to the new repository's **`main` branch**, preserving the subdirectories, especially `.github/workflows/deploy.yml`. The easiest method on Windows is [GitHub Desktop](https://desktop.github.com/): File → Add local repository (or create a repository from the extracted folder) → commit → Publish repository (uncheck *Keep this code private*). On Linux use Git commands or the GitHub website.
5. In the repository on GitHub, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Then open **Actions → Deploy free offline LaTeX web app** and run the workflow if it didn't run automatically (or push a change). A successful run will show the Pages URL.
6. Your URL will normally look like `https://YOUR-USERNAME.github.io/offline-tex-research/`. Keep the repository **public**, since GitHub Pages for free plans is limited to public repositories.
7. On your **iPhone/iPad**, open the resulting HTTPS URL in **Safari**, tap the **Share** button → **Add to Home Screen**, and choose **Open as Web App** if shown. Launch the installed app from the Home Screen.
8. While on Wi-Fi, tap **Offline** (small circular button in the header). On an older iPad, start with **Essentials** and a small test document before downloading **Scientific packages**. For maximum supported bundled packages choose **All** (larger download and storage use). Compile a minimal test paper once while online, then try again with Airplane Mode enabled. Offline compilation remains experimental until tested on your specific iPad.

If the workflow fails while downloading Siglum assets, check the **Actions** log for the precise error. The upstream GitHub release URL is version-pinned in `scripts/prepare-runtime.sh`; if the upstream assets are deleted or repackaged it must be updated. If the first deployment works, you can use the app offline as long as Safari retains its cached runtime and project storage.

> **Privacy**: GitHub Pages hosts only the app's *code and publicly downloadable compiler*. Your imported `.tex`, `.bib`, figures and compiled PDFs are stored in your browser's local IndexedDB, not automatically uploaded to GitHub. Avoid putting research data in the public GitHub repo itself.

## Getting started

1. Tap **Files** → **Import ZIP** for a complete project from Overleaf, or **New project**.
2. In **Project settings**, select the `main.tex` entry point and pdfLaTeX or XeLaTeX.
3. Tap **Editor**; type on the normal iOS keyboard, or use the shortcut toolbar above the bottom edge of the app.
4. Tap **Compile** → **PDF**. If there is an error, open the **Compilation log** to inspect it.
5. Tap **Files** → **Export ZIP** regularly. This creates a portable backup with your `.tex`, `.bib`, `.cls`, `.sty`, images, etc.

## Source / dependencies / licensing

This repository is MIT licensed for original application code. The vendored CodeMirror 5 and JSZip libraries are available under MIT-compatible licensing. Siglum engine 0.2.0 is MIT licensed. TeX Live/CTAN packages have their own licenses. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

- Siglum source: https://github.com/SiglumProject/siglum
- TeX Live package catalogue: https://ctan.org/
- Apple Home Screen installation: https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages

## Development / tests

The editor itself is static HTML/CSS/JavaScript. `src/db.js` owns local data, `src/archive.js` manages ZIP projects, `src/compiler.js` wraps the optional runtime, `src/app.js` provides the interface. `sw.js` caches the app shell and compiler assets.

Build/publish on GitHub Actions via `.github/workflows/deploy.yml`.

For a local browser-only UI preview, run a standard HTTP server at the project root, for example `python -m http.server 8000`, and open `http://localhost:8000` (no native Mac needed). The editor/ZIP features work, but compilation requires a built engine and downloaded runtime. The syntax test is `npm run test:syntax` (needs Node.js). The original visual tests and new regression tests under `tests/` use development-only Playwright/Chromium and are not needed for installing the app. To run them where Chromium and Playwright are available, use `python tests/test_visual.py` and `python tests/test_regressions.py`.

### Security and limitations of the preview

LaTeX compilation is in a browser worker; user projects do not leave the device through this application. The default compiler has external CTAN fetching disabled, so downloads only fetch public app/runtime assets hosted by your own Pages site. Browser data remains under Safari's origin and can be cleared independently of a project's exported ZIP.

Original project © 2026. Not affiliated with Overleaf, ShareLaTeX, Siglum or TeX Live.
