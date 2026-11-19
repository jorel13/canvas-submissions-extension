# Canvas Submitted Work (Edge extension)

Shows the submitted assignments for the Canvas user you're logged in as. If you're an observer (parent), it shows them for the student you observe.

## Install
Quick install on Windows: open PowerShell and run

```powershell
irm https://raw.githubusercontent.com/jorel13/canvas-submissions-extension/main/install.ps1 | iex
```

then follow the steps it prints. For step-by-step instructions, manual install, updating and troubleshooting, see **[INSTALL.md](INSTALL.md)**.

## Use
1. Log in to Canvas (e.g. `https://yourschool.instructure.com`) and keep a Canvas tab active.
2. Click the extension icon. It loads submissions due in the last 30 days.
3. Change the student, the due-date range, or the course filter, or search by name. Click a column header to sort. **Export CSV** saves the current view.

## Deadline watch
The top section lists every active course and how long until it reaches the no-submission deadline (10 days by default):
- **Last submission** is the most recent submission in that course. If there are none, the count starts from the course or term start date.
- **Deadline** is that date plus the limit. Courses at or past it show in red, courses within the warning window in amber, and the list is sorted with the most urgent first.
- Change the limit and the warning window, or count only school days (Mon–Fri). These settings are saved in the browser.
- **Hide** removes courses that never have assignments (homeroom, clubs) from the list. Use **Show N hidden** to see them again.

## How it works
- The popup runs code inside the active Canvas tab, so requests go out with your existing login session. The extension stores no cookies or tokens.
- It calls `/api/v1/users/self` and `/api/v1/users/self/observees` to work out who you are and which students you observe. It picks the student Canvas has saved in the `k5_observed_user_for_<id>` cookie as the default.
- Submissions come from the same `GetUserCourseWork` GraphQL query Canvas uses (`onlySubmitted: true`), with `score` and `grade` added and pagination handled.
- It only has permission for `https://*.instructure.com/*`.

## Disclaimer
This project is not affiliated with or endorsed by Instructure. Canvas is a trademark of Instructure, Inc. The extension uses an internal Canvas GraphQL query that may change without notice.

## License
[MIT](LICENSE)

## Publishing a release
1. Raise `version` in `manifest.json` and commit.
2. Tag and push: `git tag v1.2.3 && git push origin main v1.2.3` (the tag must match the manifest version).
3. The **Release** GitHub Action builds `canvas-submitted-work.zip` and publishes the release. Installed copies show an update notice within a day.
