# Grant Completeness Assistant

A review tool that checks a draft grant application against the funder's guideline. An LLM
extracts the requirements and maps the application to them with verbatim citations; a human
reviewer confirms, corrects or rejects every mapping; completion is then calculated by plain,
tested code — never by the model.

> It is a completeness aid for a human reviewer. It does **not** make legal or funding-eligibility
> decisions, and the UI and the exported summary both say so.

**Live app:** _add Vercel URL here_ · **Demo:** click **Load sample review** → **Run assessment**.

## What it does

| Area | How |
|---|---|
| Requirement extraction | LLM lists eligibility, content and submission requirements, tags each **mandatory** vs **recommended**, and quotes the guideline sentence it came from. |
| Mapping + citations | LLM maps the application to every requirement as met / weak / ambiguous / missing, quoting the application text (or naming a supporting document) as evidence. |
| Citation check | Every quote is checked against the source text in code (case/whitespace/dash-insensitive). Quotes that aren't really in the document are flagged ⚠ as possible fabrication, and a met/weak/ambiguous judgement with no citation at all is flagged in the UI and in the summary. |
| Gaps & questions | Clarification questions for weak/ambiguous/missing items, and claims in the application that no supplied evidence backs up (also quote-checked). |
| Human review | Each mapping: **Confirm**, **Correct** (pick the real coverage, a required note, and optionally the right evidence — itself checked against the application) or **Reject** (required note); **Undo** returns it to pending. Every decision is written to an append-only audit log. |
| Deterministic completion | `server/src/lib/completion.ts`: only human-reviewed items count. Confirmed → AI value, corrected → reviewer value, rejected → missing, pending → not counted. Mandatory and recommended are reported separately. |
| Supporting documents | Metadata only (name, type, notes, status provided/requested/missing). Required attachments named in the guideline are matched to them deterministically and listed as provided / requested / missing. |
| Versioning | Every save of the guideline or application creates an immutable version with a SHA-256 content hash. Identical re-saves are a no-op. |
| Stale detection | An assessment records which versions it ran on. If the latest version of either document has a different hash, the assessment shows a stale banner and offers a re-run. |
| Summary | `GET /api/assessments/:id/summary` builds a Markdown report from the *reviewed* data (pending items appear as "awaiting review"); viewable, copyable and downloadable. |
| Logs | Structured JSON request logs with request ids (pino), and an `ai_runs` table with step, model, attempt, duration, tokens and errors for every LLM call — shown in the UI as the "AI workflow log". |

## Architecture

```
client/  React 19 + TypeScript (Vite) — cases, document editor, review screen
server/  Express 5 + TypeScript
  src/ai/        prompts, zod output schemas, Gemini + offline mock providers, pipeline
  src/lib/       pure logic: completion, citations, stale detection, document matching, summary
  src/routes/    REST API
  src/db/        Drizzle schema (Postgres)
  test/          Vitest unit tests
api/index.ts     Vercel serverless entry (same Express app)
samples/         demo guideline, draft application (with deliberate gaps), supporting docs
```

**AI workflow (two calls per assessment):**
1. `extract` — guideline → requirements (code, text, category, level, source quote, required attachment).
2. `map` — requirements + application + supporting-doc metadata → mappings, clarification questions, unsupported claims.

The assessment runs **in the background**: `POST /api/cases/:id/assessments` validates the inputs,
creates the assessment row and returns `202` straight away; the AI work continues (via Vercel's
`waitUntil`) and records its progress (`extracting → mapping → saving`). The review page polls
every 3 s and shows a live progress panel, so a slow model never holds an HTTP request open.
A run that never records an outcome (e.g. the platform killed it) is marked failed after 6 minutes.

Both calls use Gemini's JSON mode with a JSON Schema generated from the zod schemas, then the
output is validated with zod anyway. Invalid output is retried once; every attempt is logged.
Every call has a hard timeout (`GEMINI_TIMEOUT_MS`, default 45 s). A 429/503 is retried once with
back-off; a timeout or repeated failure hands over to a lighter model (`GEMINI_FALLBACK_MODELS`).
Documents are wrapped in tags and the prompt tells the model to treat them as data, not
instructions (basic prompt-injection hygiene).

**Data model:** `cases` · `document_versions` · `supporting_documents` · `assessments` ·
`requirements` · `mappings` · `findings` · `ai_runs` · `audit_events`.

## Running locally

Requirements: Node 20+, a Postgres database (Neon free tier works), a Gemini API key (free tier).

```bash
cp .env.example .env          # fill DATABASE_URL and GEMINI_API_KEY
npm install
npm --prefix client install
npm run db:push               # create tables
npm run dev:server            # API on :8787
npm run dev:client            # UI on :5173 (proxies /api)
```

Set `AI_PROVIDER=mock` to run without an API key — a deterministic keyword heuristic stands in
for the model (much weaker, but exercises the full pipeline and UI).

## Tests

```bash
npm test
```

22 unit tests over the behaviour that matters most: completion maths and review-state rules,
citation verification (including rejecting paraphrased/invented quotes), stale detection
(including "re-save of identical text is not a change"), model-output parsing/validation
(malformed JSON, bad enums, missing fields, markdown fences), supporting-document matching, the
summary (disclaimer, pending ≠ met, stale warning), and that the mock provider's output passes
the same validation as the real model's.

`npm run check:gemini` runs the real two-step workflow on `samples/` and prints what came back.

## Deployment

Vercel: the Vite build is served as static files and `api/index.ts` runs the Express app as a
serverless function. `maxDuration` is 300 s so the background assessment (`waitUntil`) has room —
a run takes ~1–3 minutes on the free Gemini tier, longer when the primary model is overloaded.
Postgres is Neon (serverless HTTP driver, no connection pool to manage). Environment variables
are set in the Vercel project, never committed.

## Out of scope (deliberately not built)

External grant-database search, submitting applications, financial forecasting, OCR / PDF
parsing, and writing or rewriting application text. The tool also never states whether an
applicant *is* eligible or should be funded — only what the documents do and don't show.

## Scope decisions and limitations

- **Text input only.** Documents are pasted as text (max 60,000 characters each); no file upload,
  PDF parsing or OCR. Supporting documents are metadata, not files.
- **No authentication / multi-user.** It is a single-workspace demo; the audit log records what
  changed and when, not who.
- **No job queue.** The background run lives inside one serverless invocation (`waitUntil`, up to
  300 s). That fits these document sizes; much longer documents would need a real queue/worker.
- **Free-tier LLM.** Gemini's free tier can return 503 "high demand" or hang for minutes; timeouts,
  retries and a fallback model reduce but don't eliminate failures. The fallback model is faster but
  extracts somewhat less thoroughly. A failed run is saved with its error and can be re-run.
- **Model judgement is advisory.** Coverage labels come from the model and can be wrong — that's
  why nothing counts towards completion until a human reviews it, and why citations are verified.
- **Re-running creates a new assessment** rather than carrying reviews over; earlier assessments
  and their reviews are preserved.
- **Supporting-document matching is lexical.** A badly named attachment may not match its
  requirement; the reviewer can see and correct the statuses.
