# 📝 MavPad — Encrypted Notepad

A single-file, end-to-end encrypted notepad that syncs between your devices with one code. No account, no server storing your notes, no tracking.

[![Buy Me A Coffee](https://img.shields.io/badge/☕-Buy%20me%20a%20coffee-FFDD00)](https://buymeacoffee.com/wilsonsamiano)

**Current release:** beta 0.1.0

## Features

- 🔐 **AES-256-GCM encryption** — every note and topic name is encrypted on your device. The key is stretched from your sync code with PBKDF2 (310,000 iterations, SHA-256).
- 🔗 **Sync with a code** — enter the same sync code on each device, press **Sync**, and devices find each other peer-to-peer. Everything exchanged is ciphertext; the relay never sees plaintext.
- 📑 **Topics on the left** — create topics, collapse/expand them, move notes between topics, search across everything.
- 🖼 **Pictures** — paste, drag-and-drop, or attach images; they're compressed and stored encrypted with the note.
- 🎨 **Light, dark, and brown** themes.
- 📲 **PWA installable** — install it from GitHub Pages and use it offline.
- 🔄 **Self-updating** — checks GitHub Releases and tells you when a new version drops.
- 💾 **Encrypted backups** — export/import a backup file; useless without your sync code.

## Use it

**Easiest (PWA):** open the GitHub Pages link in the release notes → *Install app* / *Add to Home Screen*.

**Single file:** download `index.html` from the release assets — double-click it and it works (offline, from `file://`). Sync needs internet once to load the peer library.

## Security model

- Your sync code (~99 bits of entropy, generated on-device) is the **only secret**. Both sides independently derive the identical AES-256 key from it — the key is never transmitted.
- The sync room ID is a SHA-256 hash of the code: only someone holding the code can find or join your room.
- Stored notes are AES-256-GCM ciphertext in IndexedDB. Wrong code = undecryptable.
- Pasted/synced HTML is sanitized before rendering.
- ⚠️ There is **no recovery**. Lose the code, lose the notes. "Remember on this device" stores the code locally for convenience — use the 🔒 lock button on shared devices.

## Versioning

Beta numbering starts at `beta 0.1.0`; GitHub release tags are `vN` where N = versionCode (the app checks this to offer updates).

---
Made by Maverick for Wilson. ☕ [Buy me a coffee](https://buymeacoffee.com/wilsonsamiano)
