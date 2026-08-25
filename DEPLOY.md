# Do2Date — moving from GitHub Pages to Vercel

The site itself does not change. Same HTML, same CSS, same JS, served the same
way. What Vercel adds is `api/`, which is the only place `GEMINI_API_KEY` can
live without shipping to every visitor's browser.

Do these in order. Steps 1 and 2 can be done before you touch DNS, so the new
deployment is already working when you point the domain at it.

---

## 0. Gemini API key — and one decision about tiers

Get the key at **aistudio.google.com/apikey**. Sign in with a Google account,
click *Create API key*, copy it. Free, no card required.

Then decide which tier that key runs on, because it is not only a billing
question.

**Free tier.** Costs nothing. Per Google's
[API terms](https://ai.google.dev/gemini-api/terms), on the unpaid service
"Google uses the content you submit to the Services and any generated responses
to provide, improve, and develop Google products and services and machine
learning technologies," and "human reviewers may read, annotate, and process
your API input and output."

**Paid tier.** Enable billing on the Google Cloud project behind the key. The
same terms then say "Google doesn't use your prompts ... or responses to improve
our products," and drop the human-review clause.

**The code is identical either way.** Enabling billing changes the terms, not the
API — same key, same model name, no redeploy. So this is a switch you can flip
whenever, without touching anything in this repo.

What makes it worth thinking about: the documents going through this endpoint are
*other people's* syllabi. They carry instructor names, direct email addresses,
office numbers and hours, and sometimes accessibility or accommodation language.
The students uploading them agreed to use a homework tracker, not to have their
professor's contact details read by reviewers at Google.

A sane sequence: **free tier while you are the only one testing it, paid tier
before you tell other students to sign up.** With the built-in cap of 10 parses
per student per month and Flash pricing, real usage costs very little — but check
current rates yourself at ai.google.dev/gemini-api/docs/pricing rather than
trusting a number written here, since they move.

The other free-tier catch is rate limits: requests-per-minute on the free tier is
low, and a burst of students uploading syllabi in the first week of term will hit
it. That surfaces as "The syllabus reader is unavailable right now" and is logged
as `MODEL_429`. It is the signal to enable billing, not a bug.

---

## 1. Firebase: service account

The parse endpoint needs to prove who is calling and keep a spend counter the
caller cannot edit. Both need admin credentials.

1. Firebase console → Project settings → **Service accounts** → *Generate new
   private key*. A `.json` file downloads.
2. Base64-encode it. Vercel's dashboard mangles multiline values, so paste it as
   one line:

   ```powershell
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json")) | Set-Clipboard
   ```

3. **Do not commit this file.** `.gitignore` covers `.env`, but the JSON itself
   should never enter the repo. Anyone holding it has full read/write on your
   entire database, bypassing every security rule.

---

## 2. Vercel

1. vercel.com → *Add New* → *Project* → import `AChristmas10/AssignmentOrganizer`.
2. Framework preset: **Other**. There is no build step; `vercel.json` already
   says so.
3. Environment variables (all three, Production + Preview):

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | from aistudio.google.com/apikey |
   | `FIREBASE_SERVICE_ACCOUNT` | the base64 string from step 1 |
   | `FIREBASE_DATABASE_URL` | `https://do2date-default-rtdb.firebaseio.com` |

4. Deploy. You get a `*.vercel.app` URL — **test the syllabus upload there
   before moving DNS.** If something is misconfigured, this is where you find
   out, while the live site is still untouched.

---

## 3. Firebase: authorized domain

Auth → Settings → **Authorized domains** → add your `*.vercel.app` domain, and
`do2date.com` if it is not already there. Google sign-in silently fails on any
domain not in this list, and the error it gives is unhelpful.

---

## 4. DNS cutover

**Order matters: Vercel first, registrar second.** Vercel generates the exact
records for your project when you add the domain, and they are not the same for
everyone — the `www` CNAME in particular is now project-specific, something like
`d1d4fc829fe7bc7c.vercel-dns-017.com`. Do not copy a CNAME target out of a blog
post or out of this file. Read it off your own dashboard.

### 4a. Add the domain in Vercel

Project → **Settings** → **Domains** → **Add Domain** → type `do2date.com`.

Vercel will offer to add `www.do2date.com` too. Say yes — it sets up the
redirect so both spellings work.

The page then shows an **Invalid Configuration** state with the DNS records it
wants. That is expected: the records don't exist yet. That panel is your source
of truth for the next step.

### 4b. Add those records at Porkbun

**ACCOUNT** (top right) → **Domain Management** → find `do2date.com` → **Details**
dropdown → the edit icon next to **DNS Records**.

Porkbun's editor has three fields: **Type**, **Host**, **Answer**.

The one thing that catches people: for the root domain, **Host is left BLANK**.
Not `@`, not `do2date.com` — empty. Only `www` goes in the Host field, and only
for the www record.

**Delete first:**
- Porkbun's default `pixie.porkbun.com` records (its parking page — these exist
  on every new domain and will fight the new ones)
- The four GitHub Pages `A` records: `185.199.108.153`, `185.199.109.153`,
  `185.199.110.153`, `185.199.111.153`
- Any `www` CNAME pointing at `achristmas10.github.io`

**Then add:**

| Type | Host | Answer |
|---|---|---|
| `A` | *(blank)* | `76.76.21.21` |
| `CNAME` | `www` | *the project-specific target from your Vercel dashboard* |

Leave every other record alone. `MX` records are email and `TXT` records are
verification for other services — neither has anything to do with hosting, and
deleting them breaks things unrelated to this.

### 4c. Wait

Back in Vercel, the domain flips to **Valid Configuration** on its own, usually
within minutes. Vercel then issues the TLS certificate automatically — you do
not do anything for HTTPS.

Until it flips, the old GitHub Pages site keeps serving. There is no window where
do2date.com is down.

If it still says invalid after an hour, the usual causes are: the host field was
typed as `do2date.com` instead of `@`, an old GitHub `A` record is still present,
or the registrar has its own parking/forwarding toggle switched on that overrides
the records.

Once DNS has moved, delete the `CNAME` file from the repo root. It is a GitHub
Pages artifact and does nothing on Vercel.

---

## 5. Firebase security rules — do this regardless

These are the *entire* authorization boundary for Do2Date. The database URL is
in `index.html`, visible to anyone, so whatever these rules allow, the public
can do.

Realtime Database → Rules. Your current rules (confirmed 2026-08-25) are already
correct on the part that matters — `users/$uid` is scoped to the owner, and the
leaderboard write is pinned to the caller's own uid. Two additions:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "leaderboards": {
      "$gameType": {
        ".read": true,
        "$uid": {
          ".write": "$uid === auth.uid",
          ".validate": "newData.hasChildren(['username','score','timestamp']) && newData.child('username').isString() && newData.child('username').val().length <= 20 && newData.child('score').isNumber() && newData.child('timestamp').isNumber()"
        }
      }
    },
    "syllabusQuota": {
      ".read": false,
      ".write": false
    }
  }
}
```

- **`.validate` on the leaderboard entry.** Without it a signed-in user can write
  anything at all under their own uid — a 4 MB string, a nested object, a score
  of `1e308`. The rule constrains it to the three fields `games.js` actually
  writes. It does not stop someone forging a *score* (any client-written
  leaderboard has that hole), but it stops the path being used as free storage.

- **`syllabusQuota` denied explicitly.** Unlisted paths already default to deny,
  so this changes nothing functionally — it is there so that nobody later adds a
  broad rule above it and quietly hands students the ability to reset their own
  spend limit. The server writes this path with admin credentials, which bypass
  rules entirely.

Test in the **Rules Playground** before publishing. A wrong rule here locks every
student out of their own data.

### Leaderboard names — FIXED, but you must clear the old rows

`games.js` used to publish `currentUser.email.split('@')[0]` to
`leaderboards/$gameType`, which is `".read": true` — world readable, no account
needed, fetchable with a plain GET to
`https://do2date-default-rtdb.firebaseio.com/leaderboards.json`. For a university
address the local part is a real identifier and the domain is guessable, so the
leaderboard reconstructed working email addresses for every student who played a
game.

Now fixed in code: students pick a leaderboard name the first time they submit a
score, pre-filled with an anonymous `Student####`, editable afterwards from the
account menu. It is stored at `users/$uid/displayName`, which the existing rules
already protect. The leaderboard render also HTML-escapes the name — it is
written by other users and shown in everyone else's browser, and it was being
interpolated raw.

**The code fix does not touch rows already published.** Clear them once, after
deploying:

Firebase console → Realtime Database → **Data** tab → hover the `leaderboards`
node → click the **⋮** menu → **Delete**. Scores reset, which for a mini-game
leaderboard costs nothing next to leaving the addresses up.

Do this *after* the new `games.js` is live, or the next player to finish a game
republishes their email-derived name into a fresh node.

---

## 6. Local development

```bash
npm install
npm test                 # date logic, 65 cases across 9 zones
npm i -g vercel && vercel dev   # serves the site AND the api/ function
```

`vercel dev` pulls your environment variables down after `vercel link`. Opening
`index.html` directly from disk works for everything except syllabus parsing —
there is no server, which is the whole point.
