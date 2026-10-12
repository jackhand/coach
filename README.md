# Coach

Mobile workout log and rest timer (PWA). Front end is static and public; all data lives in the owner's own Google account.

- Front end: this repo, served by GitHub Pages.
- Backend: `apps-script/Code.gs`, deployed by the owner as a Google Apps Script web app (Execute as: Me, Access: Anyone). It reads program and exercise library markdown files from a private Drive folder and writes sets to a private Google Sheet. Every request needs a private key that is set only in the deployed script, never in this repo.
- First open: paste the web app URL and key in Settings, or open a setup link of the form `https://<pages-url>/#u=<url>&k=<key>` (the part after # is never sent to any server).

Features: coach tips and per-exercise equipment setup inside each exercise card, Set done button that starts the rest timer before you log, edit or delete any logged set, drop set counter, left/right reps for single-limb moves (rest starts after the first side), bodyweight moves with added load plus body weight, rest target based on what comes next (same muscle vs new muscle), soft beeps in the last 10 s (mute toggle), feedback toasts, Finish workout button,, log sets by typing or voice (Chrome on Android; hidden where unsupported), count-up rest timer (green under target, red over), estimated 1RM (Epley and Brzycki), offline queue with automatic retry, undo last set, day picker, two profiles.

No health data, program content, logs, or keys belong in this repo.
