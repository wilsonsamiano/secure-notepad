# 📝 MavPad — Encrypted Notepad

A single-file, end-to-end encrypted notepad. No account, no tracking.

**Install the app:** [https://wilsonsamiano.github.io/secure-notepad/](https://wilsonsamiano.github.io/secure-notepad/)

[![Buy Me A Coffee](https://img.shields.io/badge/☕-Buy%20me%20a%20coffee-FFDD00)](https://buymeacoffee.com/wilsonsamiano)

**Current release:** [beta 0.3.0](https://github.com/wilsonsamiano/secure-notepad/releases/tag/v3)

## Install on a computer

1. Open [https://wilsonsamiano.github.io/secure-notepad/](https://wilsonsamiano.github.io/secure-notepad/) in Chrome or Edge.
2. On the lock screen, click **Install app** if it appears.
3. If it does not, use the install icon in the address bar, or the browser menu → **Install MavPad** / **Apps → Install MavPad**.

That installs it like a desktop app. It works offline after the first load. Use the same sync code you already use on your phone.

## Features

- 🔐 **AES-256-GCM encryption** — notes, topics, and passwords are encrypted on your device. The key is stretched from your sync code with PBKDF2 (310,000 iterations, SHA-256).
- 🔗 **Sync starts after unlock** — same sync code on each device. Devices find each other peer-to-peer. The relay only sees ciphertext.
- 🤝 **Share one pad** — an invite code opens that pad only, not the whole notebook.
- 🔑 **Passwords** — store logins, or import a CSV exported from Apple Passwords or Brave. Delete the CSV after import.
- 📑 **Topics on the left** — collapse them, move notes, search.
- 🖼 **Pictures** — paste, drop, or attach. Stored encrypted with the note.
- 🎨 **Light, dark, and brown** themes.
- 💾 **Encrypted backups** — useless without your sync code.

## Security model

- Your sync code is the **only secret**. Both sides derive the same AES-256 key from it. The key is never transmitted.
- The sync room ID is a SHA-256 hash of the code. Only someone with the code can join.
- Notes and passwords are AES-256-GCM ciphertext in IndexedDB. Wrong code = undecryptable.
- A pad invite never includes your other pads or your passwords.
- ⚠️ There is **no recovery**. Lose the code, lose the notes. "Remember on this device" stores the code locally — use the lock button on a shared computer.

## Versioning

GitHub release tags are `vN`, where N is the app versionCode. The app checks Releases and tells you when a newer one exists.

---
Made by Maverick for Wilson. ☕ [Buy me a coffee](https://buymeacoffee.com/wilsonsamiano)
