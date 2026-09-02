# WebinarOps site

Astro implementation of the `WebinarOps Site.dc.html` Claude Design mockup
(handoff bundle in the repo root: `README.md`, `chats/`, `project/`).

Three routes, prerendered to static HTML at build time:

- `/` — home / marketing page
- `/process` — "The Process" page
- `/forecast` — the 6-step webinar forecast wizard (`src/components/ForecastWizard.tsx`,
  a client-side React island). Submitting step 6 posts to `/api/submit-forecast`,
  a server route (not prerendered) that emails the submission via
  [Resend](https://resend.com).

## Local setup

```bash
npm install
cp .env.example .env   # then fill in RESEND_API_KEY
npm run dev
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes, for the forecast email to send | Resend API key. Without it `/api/submit-forecast` returns a 500 and the wizard shows an inline error asking the lead to email `hello@webinarops.com` directly. |
| `FORECAST_NOTIFY_TO` | No (defaults to `alo@webinarops.io`) | Who receives the notification email for each forecast submission. |
| `FORECAST_NOTIFY_FROM` | Yes, in production | The `from` address. **Must be on a domain verified in your Resend account** (e.g. `forecast@webinarops.io`) or Resend will reject the send. |

## Deploying to Vercel

The project already targets the Vercel adapter (`astro.config.mjs`). Push this
directory to a repo, import it in Vercel, and set the environment variables
above in the Vercel project settings. `npm run build` is the build command
Vercel will run automatically.

## What's carried over from the mockup vs. changed for production

- All copy, layout, colors, and the forecast calculator math (`src/lib/forecast.ts`)
  are ported as-is from `WebinarOps Site.dc.html`.
- In the mockup, only the "Scenario and goals" step (5) was wired to state —
  steps 1–4 were static placeholder inputs. Here, every field across all 6
  steps is a real controlled input, because the whole point of wiring
  submission to email is that the data has to actually be captured.
- The mockup's step-6 "COMPLETE / N UNKNOWN" badges were hardcoded example
  numbers; here they're computed live from what the visitor has actually
  filled in.
- First-touch attribution (landing page, referrer, `utm_*` params) is
  captured client-side on load and included in the notification email —
  the mockup's copy referenced "first touch captured" but had nothing behind
  it.
- The mockup's persistent Back/Continue footer bar also rendered (harmlessly)
  underneath step 6, next to that step's own submit button. That redundant
  "Continue" is hidden on step 6 here.
- Legal footer links (Privacy Policy, Terms, Earnings Disclaimer) are still
  `#` placeholders, as they were in the mockup — no legal copy was provided
  to build real pages from.
