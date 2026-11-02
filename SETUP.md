# Putting Dice Tracker online

This makes Dice Tracker a real website with its own sign-in and one shared database. Everyone in the
house sees the same games, live, from their own phone. It takes about 20 minutes, once.

Two free services do the work:

| Service | What it does | Cost |
|---|---|---|
| **GitHub Pages** | Hosts the website at `https://mdwsn.github.io/die-stat-tracker/` | Free |
| **Supabase** | Accounts, sign-in, and the database that holds every group, player and game | Free tier |

You do the steps that need your accounts. Claude does everything that touches code.

---

## Step 1 · Let your Mac upload to GitHub (once)

Claude saves each change as a "commit". Uploading ("pushing") commits to GitHub needs a key.

1. Go to **github.com/settings/personal-access-tokens/new**.
2. **Token name:** `dice-tracker`. **Expiration:** 1 year.
3. **Repository access:** *Only select repositories* → pick **die-stat-tracker**.
4. **Permissions → Repository permissions → Contents:** set it to **Read and write**.
5. Press **Generate token** and copy it. It starts with `github_pat_`.
6. In Claude, run the command below. It uploads everything Claude has saved so far.
   - When it asks for a **Username**, type `mdwsn`.
   - When it asks for a **Password**, paste the token. Nothing appears while you paste; that's normal.
   - Press Return.

   ```
   cd ~/Downloads/die-stat-tracker && git push origin main
   ```

Your Mac's keychain remembers the token from now on, so Claude can upload future changes itself.

## Step 2 · Create the database (Supabase)

1. Go to **supabase.com** and press **Start your project**. Sign up with **Continue with GitHub**,
   which is the quickest way.
2. Press **New project**:
   - **Name:** `dice-tracker`
   - **Database password:** press *Generate a password*, then save it somewhere like Notes.
     The app never needs it, but you'd need it to recover the database.
   - **Region:** *East US (North Virginia)* or *Central US*, close to Chicago.
   - Press **Create new project** and wait about a minute while it sets up.
3. Open **SQL Editor** in the left sidebar, then **New query**.
4. Open `supabase/schema.sql` from this folder, copy **all** of it, paste it into the editor, and press **Run**.
   You should see *Success. No rows returned.* That builds the tables, plus the rules that decide who can
   see what. It's safe to run again later.

## Step 3 · Set up sign-in

1. Go to **Authentication → Sign In / Providers → Email**. Make sure **Email** is enabled, and turn
   **Confirm email** **off**.
   *Why:* Supabase's built-in email only reaches people on your Supabase team, so confirmation emails
   would never get to the brothers. With confirmation off, people sign up with an email and password
   and they're in.
2. Go to **Authentication → URL Configuration**:
   - **Site URL:** `https://mdwsn.github.io/die-stat-tracker/`
   - **Redirect URLs:** add `https://mdwsn.github.io/die-stat-tracker/**`
   - Press **Save**.

## Step 4 · Send Claude two values

Find them under **Project Settings** (the cog icon), or with the **Connect** button at the top of the project:

1. **Project URL**, which looks like `https://abcdefghijklm.supabase.co`.
2. **Publishable key**, under **API Keys**. It starts with `sb_publishable_`. If you only see the
   older kind, use the **anon / public** key.

Paste both into the chat. **Both are meant to be public.** They go into the website's code, and the
database rules from step 2 are what protect the data. **Never paste the `service_role` or `secret` key
anywhere.** That one can bypass every rule.

Claude puts them into `js/config.js`, tests against your real project, and uploads.

## Step 5 · Turn the website on (GitHub Pages)

1. Open **github.com/mdwsn/die-stat-tracker → Settings → Pages**.
2. **Source:** *Deploy from a branch*. **Branch:** `main`, folder `/ (root)`. Press **Save**.
3. About a minute later the site is live at **https://mdwsn.github.io/die-stat-tracker/**.

From then on, every upload updates the site within a minute or two.

## Step 6 · Use it

1. Open the site on your phone, create your account, and create **Psi Upsilon Omega**.
2. Go to **House → Invite people → Copy invite link** and send it in the group chat.
   Anyone who opens it and signs up joins the house and can log games.
3. On iPhone, add it to your home screen: Safari → Share → **Add to Home Screen**.
   It then opens like an app.

---

## Optional, later

- **"Continue with Google".** One-tap sign-in with no passwords. It needs a Google Cloud OAuth client
  (the same kind of setup as Command Center's Google Calendar), with its client ID and secret pasted into
  **Supabase → Authentication → Sign In / Providers → Google**. Then Claude sets `google: true` in
  `js/config.js`.
- **Password reset emails.** Supabase's built-in email can't reach the brothers, so "forgot password" needs
  an email service. Resend's free tier works: **Supabase → Authentication → Emails → SMTP Settings**.
- **Your own domain**, like `dicetracker.app`, which costs about $10–15 a year. Buy it from a registrar
  such as Cloudflare or Porkbun. Then add it under **GitHub → Settings → Pages → Custom domain** and update
  **Site URL** in step 3.
