# Agent usage

> Draft written during the build — Himanshu to review and edit in his own words before submitting.

## Tools

- **Claude Code** (Anthropic, Claude Opus model) in the terminal — the main pair-programmer:
  scaffolding, backend, frontend, tests, and running the app/API against the real services.
- **Gemini (`gemini-flash-latest`)** — the LLM inside the product, not a coding tool.

## How the work was split

I made the product and design calls; the agent did most of the typing and I reviewed the code it
produced.

- **Me:** chose this problem over the expert one; chose React + Express over Next.js because
  that's the stack I can defend line by line; set the rule that completion must be calculated
  by code from human-reviewed items only; decided documents are text-only and supporting docs
  are metadata; set up the Neon and Gemini accounts.
- **Delegated to the agent:** project scaffold, Drizzle schema, Express routes, the two-step AI
  pipeline, zod schemas, React pages, CSS, unit tests, README draft.

## Representative prompts

- "Plan the architecture for a grant completeness checker: React frontend, Express backend,
  Postgres, Gemini. The LLM must never decide the completion percentage — that has to be
  deterministic code over human-reviewed mappings."
- "Every quote the model returns must be checked against the source document in code, and
  unverifiable quotes flagged in the UI."
- "Write tests for the completion rules: confirmed uses the AI value, corrected uses the
  reviewer's, rejected counts as missing, pending isn't counted."
- "Run the full pipeline on the sample documents against the real model and show me what it
  extracted and which citations failed verification."

## Agent mistakes and suggestions I rejected

- **Default model didn't exist for my account.** The first code used `gemini-2.5-flash`; the API
  returned 404 ("no longer available to new users"). Switched to `gemini-flash-latest`, found
  by listing the models the key can actually use.
- **No handling for 503 "high demand".** The first real run crashed on a 503. Added
  exponential back-off and a fallback model, then confirmed it recovered from three 503s in a row.
- **Sections treated as attachments.** On the first real run the model listed "itemised budget"
  as a missing supporting document, though the budget is a section of the application. Tightened
  the extraction prompt so only separate attachments count.
- **Suggested Singapore for the database region**, then corrected it: the functions run in Vercel's
  US East region, so the database belongs next to them, not next to me.
- **Rejected:** letting the LLM output a completion score; enabling Neon object storage and
  Neon's CLI/MCP setup (not needed); file upload/OCR (out of scope).
- **Agent's own test-script bug:** a smoke test indexed a zsh array from 0 (zsh starts at 1), so
  one API call went to the wrong URL — caught when the response wasn't JSON; the app was fine.
- **TypeScript config clash:** constructor parameter properties failed the client's
  `erasableSyntaxOnly` setting; rewrote as explicit fields.

## How the output was verified

- `npm test` — 22 unit tests on completion, citations, stale detection, output parsing,
  document matching and the summary.
- Ran the real two-step workflow on `samples/` (19 requirements extracted, all source quotes
  verified) and checked by hand that the planted gaps were caught: missing partner letter,
  one year of audited accounts instead of two, a weak sustainability section, no outcome
  measurement, and two unbacked claims.
- API smoke tests against the real database: confirm / correct / reject / reject-without-note
  (400), too-short document (400), identical re-save (no new version), edited application
  (new version → assessment marked stale), summary export.
- Bundled the API as CommonJS and ran it, to check the serverless build before deploying.
- Went through the UI in the browser on the sample review.
