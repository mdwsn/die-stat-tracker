# Dice Tracker — roadmap

A working plan for turning Dice Tracker from one house's stat sheet into a product other houses use.
Updated 1 November 2026. Edit it as decisions get made.

## Where it stands

**Built and tested (123 automated checks):** sign-in, one database for many houses, invite links, live
updates between phones, watching and TV mode, offline-safe saving, newer-save-wins, backups, home-screen
install, and the whole stat and award engine.

**Not running yet.** The database isn't connected, so the live site saves to each phone separately. Two
steps change that:

1. **Connect Supabase** (SETUP.md steps 2–4, about 15 minutes). This single step turns on accounts,
   shared data, invite links and live games across devices.
2. **Uploads.** GitHub needs your sign-in every time, because the token isn't saved where Claude can use it.

## Phase 0 · Foundations (this week)

| | What | Why | Who | Cost |
|---|---|---|---|---|
| ☐ | Create the Supabase project and send Claude the URL + publishable key | Nothing is shared until this exists | You, then Claude | Free |
| ☐ | Save the GitHub token where Claude can use it (or install GitHub's sign-in tool) | So every change ships without you running a command | You | Free |
| ☐ | Custom email sending (Resend) + turn **Confirm email** back on | Real email verification and "forgot password". Without it, anyone can sign up with any address, and a lost password is a lost account | You (account), Claude (setup) | Free tier |
| ☐ | "Continue with Google" | One tap, no passwords. Most students already have a school Google account | You (Google Cloud), Claude | Free |
| ☐ | Automatic tests on GitHub before each update goes live | A broken upload never reaches the live site. Needs **Workflows: Read and write** added to your GitHub token; without it, GitHub rejects the upload | Claude, after you update the token | Free |
| ☐ | A real name and domain (`dicetracker.app` or a better brand) | Looks official, and makes the address easy to share. Check the name isn't taken first | You | ~$12/year |

## Phase 1 · Great for one house (the next month)

Make Psi Upsilon Omega use it every game night, then fix whatever they complain about. That's the product
test.

- **Your real stat sheet.** Send the full header row from the spreadsheet; so far it has 2 of its columns.
  Then import the old spreadsheet's games so the history starts on day one.
- **Group admin.** Owner and member roles, removing someone, a fresh invite code if the link leaks,
  leaving a group.
- **Names on accounts.** A profile name per person, so "who's in the group" and "who logged this" show
  names instead of nothing.
- **Watch links for anyone.** Share one game live with people who aren't in the group, with no account.
  For parties and rivals.
- **Edit history.** "Matt changed the score from 7–5 to 7–4 at 11:42pm." It builds trust when people argue
  about whether a game counted.
- **Quick wins.** Rematch with the same teams, end-of-night recap of every game, and a shareable recap image
  for Instagram stories (also a growth loop: every story is an ad).

## Phase 2 · Many houses (next semester)

- **Onboarding for a new house in under 2 minutes:** create group → paste the invite link in the house chat.
  This already mostly works; measure it.
- **Schools and inter-house play.** An optional school tag per group, cross-house leaderboards, and
  challenge matches between houses.
- **Tournaments** (philanthropy events, IFC nights): brackets, seeding from season stats, and a live bracket
  on the TV.
- **Trust and legal before strangers sign up:** a privacy policy and terms page, account deletion, and a
  contact address. Keep the app about the game: no drink tracking, which keeps schools and app stores
  comfortable.
- **Know when it breaks:** error reporting (Sentry free tier) and simple privacy-friendly usage stats.

## Phase 3 · A business (once 10+ houses use it weekly)

- Free for houses, always. Possible paid tier later: tournament hosting for Greek-life councils and campus
  events, or a season-archive "yearbook".
- A native app wrapper (App Store / Play Store) only if home-screen install isn't enough. The site already
  installs like an app.
- Metrics to watch from day one: weekly active houses, games logged per week, share of games finished
  (vs. abandoned), people watching each live game, and whether houses are still active 4 weeks after
  starting.

## Data and storage: the foundation

- **Postgres on Supabase is the right long-term home.** It's a real database, so many houses fit with
  each kept separate by rules the database itself enforces (`supabase/schema.sql`). It also makes it easy
  to move to a bigger plan or another host later, because it's standard Postgres.
- **Free tier limits** (check supabase.com/pricing for current numbers): about 500 MB of data, which is tens
  of thousands of games. **Free projects pause after a week with no activity**, and they don't get
  automatic backups. **Move to the Pro plan (~$25/month) before other houses depend on it:** no pausing,
  plus daily backups. Until then, House → Backup is the safety net.
- **Two databases once it's real:** a "staging" copy for trying changes and the real one for houses.
  Schema changes get tested on staging first.
- **Games are stored as one record each** (the full game, every tap included). That's simple and fast for
  now. When cross-house stats arrive, add summary tables the database keeps up to date, instead of
  rewriting how games are saved.

## Live and cross-device: how it works

The person scoring taps on their phone; each tap saves to the database and goes out to everyone in the
group within a second (Supabase Realtime). Anyone who opens the site sees a **Live** bar, can **watch** the
game update tap by tap, put it in **TV mode** on a laptop or TV, or press **Help score** to take over. With no
signal, taps are kept on the phone and upload when the signal returns; if another phone saved the game
more recently, the newer version wins and the offline phone is told. One phone should score each game.
