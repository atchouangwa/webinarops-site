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
| `RESEND_API_KEY` | Yes, for the forecast email to send | Resend API key. Without it `/api/submit-forecast` returns a 500 and the wizard shows an inline error asking the lead to email `alo@webinarops.io` directly. |
| `FORECAST_NOTIFY_TO` | No (defaults to `alo@webinarops.io`) | Who receives the notification email for each forecast submission. |
| `FORECAST_NOTIFY_FROM` | No | Defaults to `WebinarOps Forecast <forecast@updates.webinarops.io>`. **Verify `updates.webinarops.io` in your Resend account** before sending. Any override must also use a verified sending domain. |

## Deploying to Vercel

The project already targets the Vercel adapter (`astro.config.mjs`). Push this
directory to a repo, import it in Vercel, and set the environment variables
above in the Vercel project settings. `npm run build` is the build command
Vercel will run automatically.

For the existing deployment, use the `webinarops` project in the
`jake-5083s-projects` Vercel workspace:

1. In Settings → Environment Variables, set `RESEND_API_KEY` as a sensitive
   server-side variable for Production. Never commit the actual key to GitHub.
2. Set `FORECAST_NOTIFY_FROM` to
   `WebinarOps Forecast <forecast@updates.webinarops.io>`. This also replaces any
   existing sender override that would take precedence over the code default.
3. Keep `FORECAST_NOTIFY_TO=alo@webinarops.io` unless notifications should go
   to another inbox.
4. Confirm `updates.webinarops.io` is verified in Resend, then redeploy to load
   the environment changes. Configure Preview separately if email testing is needed.

After deployment, `HEAD /api/submit-forecast` returns `204` when the server can
read a nonempty `RESEND_API_KEY`, or `503` when it cannot. This check sends no
email, exposes no key, and does not validate the key or confirm domain verification.
If it returns `503`, check that the variable is named exactly `RESEND_API_KEY`,
belongs to this project, and includes Production, then create a new deployment.

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

## Forecast scope

All forecast inputs and outputs describe one webinar and its associated replay
and follow-up sales. Ad budget is the total spend for that webinar’s registration
campaign; organic registrations are for the same event. Conservative, target, and
upside are alternative outcomes for that one event, not additional runs. The
homepage illustration uses the same calculator and default assumptions.
