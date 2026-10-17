# Daily Schedule

A browser app for building the daily class routine of a training course and printing it as an A4 landscape sheet. It follows the NAEM advanced-course routine: a centered course header, the date and day number, batch rows, a recap and day-manager column, numbered sessions, and vertical break columns.

Everything runs on the page. There is no server. The schedule is stored in this browser, and a JSON file is the way to move it to another computer. The built site can be hosted on GitHub Pages.

The first visit opens the sample for **Day 07, Sunday 18/10/2026**, with batches 9th through 13th, the tea break and the prayer and lunch break, and the 9th batch sessions merged the way they are on the printed sheet.

## Run it locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4731

```bash
npm test
npm run build
npm run preview
```

## What you can edit

- Header lines, and which of them are the bold course title and subtitle.
- The date. The weekday is filled in from the date. The day number is separate (`Day – 07`).
- How many sessions there are (1 to 10). Each session can have its own length. The default for a new session is 60 minutes.
- Breaks with any label and length, placed before, between, or after sessions. Session numbers skip the breaks.
- The day start time and the recap length. Every range on the sheet is calculated from those, in order, and shown as `09.00 - 09.30`.
- Batch rows: add, rename, reorder, and remove them. Each batch has a roster of student IDs (for example 01–30). Pick one or more as that day’s day managers. They print as `ID No.- 09 & 10`.
- A cell’s module code, note, and teachers. Codes and names suggest matches from the module and teacher lists. Several teachers print as `Prof. Asisul, Md. Sazzad Ali & Muhammad Yeakub Ali`.
- A merge of two or more adjacent sessions for a single batch, and unmerge. A break between sessions blocks the merge.
- An optional warning when the same teacher is in two batches during one session. A merged cell counts for every session it covers. The warning stays in the editor; it is not printed.
- Auto-rotate. **Duplicate to next day** copies the routine, adds one day to the date, adds one to the day number, and, when rotate is on, assigns the next IDs in each roster.
- The footer: a signature image, the signature date, the name, and the designation lines.

**Print / PDF** opens the browser print dialog. The page size is A4 landscape. Choose **Save as PDF** there if you want a file. **PNG** downloads the sheet as an image. **JSON** / **Import** save and restore the whole schedule. **Sample** puts the Day 07 sheet back.

## Deploy to GitHub Pages

The production build uses relative asset paths, so it works at a project URL such as `https://<user>.github.io/<repo>/` as well as a site root.

1. Push this project to a GitHub repository. The default branch should be `main` (or change the branch name in the workflow below).
2. In the repository, open **Settings → Pages → Build and deployment**, and set **Source** to **GitHub Actions**.
3. The workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs on every push to `main`. It installs dependencies, runs `npm run build`, and publishes the `dist` folder.
4. When the action finishes, the Pages URL is on the workflow run and under Settings → Pages.

To publish by hand instead, run `npm run build` and upload the `dist` directory to whatever static host you use. No environment variables are required.

Schedules are not stored on GitHub. Each visitor’s routine stays in their own browser. Use **JSON** to keep a backup or to share a file.
