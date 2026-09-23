# BWC Ganesha Quiz

Host console for a live quiz show with questions from the Mahabharata and Ramayana. Runs on this laptop, and a phone and tablet on the same Wi-Fi connect to it. No internet is needed.

## Run it

```bash
npm run quiz
```

This builds the app, starts it, and opens the start page on the laptop. The terminal and the start page both list the addresses for the phone and tablet. Press Ctrl+C in the terminal to stop.

Port 3000 must be free, so stop any other dev server first. For development with live reload, use `npm run dev` instead.

## Three screens

| Device | Address | What it does |
| --- | --- | --- |
| Your phone | `http://<laptop-ip>:3000/host` | All the controls. Sign in once with the admin password; you stay signed in for the show day, even if you refresh. |
| Contestant's computer | `http://localhost:3000/display` | The show screen. No buttons. |
| Question reader's tablet | `http://<laptop-ip>:3000/display` | The same show screen. |

- **Setup:** connect everything to the venue Wi-Fi. On the display devices, tap **Tap to start this screen** once. It turns on sound and full screen.
- **Live updates:** every tap on the phone shows up on the other screens within a fraction of a second.
- **No early answers:** the correct answer is never sent to any screen before the reveal, so the tablet can't show it early.
- **Sounds:** play on every device. Each screen has a 🔊 button in the corner to mute just that device.
- **Connection light:** the dot in the corner is green when connected. If Wi-Fi drops, the screens reconnect on their own and pick up where the game is.
- **Refresh or restart:** refreshing any screen, or even restarting the laptop's server, doesn't lose the current run.
- **Firewall:** the first time a phone connects, Windows may ask whether Node.js can use private networks. Click **Allow**.
- **Fallback:** the original one-screen version is still at `/classic`.

## During a run

These controls are on the host phone, and also in the `/classic` single-screen version.

- **Show options:** each question first appears on its own so you can read it out. Click **Show options & start timer** to reveal A–D and start the countdown. Reading time doesn't count toward the contestant's total, and lifelines unlock once the options are showing.
- **Lock answer:** clicking an option only highlights it. You can change it, or click it again to clear it. Nothing is decided until you click **🔒 Lock answer**. If time runs out before you lock, it counts as time's up.
- **Checking screen:** after you lock, "Checking the answer…" sometimes appears for 3.5 seconds before the result. It always appears for a wrong answer, and appears at random for about 1 in 5 correct answers. The timer stays stopped while it shows. To change how long it shows or how often, edit `CHECKING_SCREEN_MS` and `CORRECT_CHECK_CHANCE` in `src/lib/game-config.ts`.
- **Skip question:** replaces the current question with a new one of the same difficulty at the same question number. Time spent on the skipped question isn't counted, and you can skip as often as you like while spare questions remain.
- **Next question:** after a correct answer, the app waits until you click **Next question**.
- **Resume player:** after a wrong answer or time's up, if the question was faulty, you have two choices:
  - **Count as correct:** the player moves on to the next question.
  - **Replace question:** the player gets a new question at the same number, and time on the faulty one isn't counted.

  Either way, the saved elimination is removed, so only the player's final result is kept.
- **Lifelines:** **Phone a Friend** and **Audience Poll** sit at the top, and each contestant can use each one once. Clicking one pauses the timer. Run the lifeline offline, then click **Resume timer**. If you clicked it by mistake, **Undo** gives it back. Paused time doesn't count toward the contestant's total time.
- **End run:** stops a run without saving it, for technical problems.

## Sounds

These files live in `public/`. Keep the names exactly as below; to swap a sound, replace the file with a new one of the same name.

| File | Plays when |
| --- | --- |
| `start.mp3` | You click **Start** for a contestant. It also serves as question 1's sound. |
| `Question.mp3` | A new question appears, from question 2 onwards, including after a skip or replacement. |
| `clock tick.mp3` | Loops while the timer runs: from **Show options** until the answer is locked or time runs out. It stops during a lifeline and restarts on **Resume timer**. |
| `winner.mp3` | The Winner screen appears. |
| `heartbeat.mp3` | Loops while the "Checking the answer…" screen is up, and stops when the result appears. |
| `wrong 1.mp3` to `wrong 6.mp3` | A wrong answer or time's up. One is picked at random each time, never the same one twice in a row. |

When the tick starts, it cuts off `start.mp3` or `Question.mp3` if either is still playing, so they never overlap.

## Rankings

http://localhost:3000/rankings shows two tables:

- **Today's ranking:** use the date picker to see any other day.
- **Overall ranking:** every run across all days of the event.

Every row has a **Delete** button that removes that player's result from both tables, after you confirm.

Ranking order is most correct answers first, then fastest total time. Exact ties share a rank. There's also a CSV download of every result, which opens correctly in Excel, including Hindi names.

## Admin

http://localhost:3000/admin (linked from the setup screen) is password protected. The first time you open it, it asks you to create a password. After that, it asks for the password **every time** you open Admin. Leaving the page, refreshing it, or clicking **🔒 Lock** locks it again. The password is stored only as a hash in `data/admin.json`. **Forgot it?** Delete `data/admin.json` and the page will ask you to set a new one.

Admin shows how many questions are left in each difficulty:

- **Left:** questions never asked on any day.
- **Asked so far** and **asked today**.
- **Full days left:** a worst-case estimate, assuming 7 contestants who all reach question 16.
- **By granth:** the same counts split into महाभारत and रामायण.

**Reset questions**, at the bottom, marks every question as never asked again, after you confirm. Results and rankings aren't affected.

A category turns red when it has fewer questions left than one full day could use. The app picks never-asked questions first, then ones last asked on an earlier day, and only reuses today's questions as a last resort.

## Files

| Path | What it is |
| --- | --- |
| `data/questions.json` | The question bank. English and Devanagari both work. Save it as UTF-8. It needs at least 7 easy, 5 medium, and 4 hard questions, and it's re-read at the start of every run, so there's no need to restart. |
| `data/logs/results.json` | One record per contestant (date, name, outcome, level reached, correct answers, total seconds). |
| `data/logs/used-questions.json` | Every question asked, with the first and last date it was asked. This drives question selection and the Admin counts. |
| `src/lib/game-config.ts` | Quiz name, tier sizes, timer lengths, lifelines, and the contestants-per-day figure used on Admin. |

Delete `data/logs/` to wipe all results and question history before the event starts. Don't delete it between days, or you'll lose the overall ranking and the record of which questions were already asked.
