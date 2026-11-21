# Phase 0 — Foundation

## Goal

Turn an empty folder into a running Next.js app with the shared helpers every later phase uses, a local Supabase stack, unit and browser tests, continuous integration, and a staging deploy on AWS Amplify.

## Requirements covered

None directly. PRD section 11.4 (request logging) starts here.

## Before you start

Read `plan/README.md` sections 1, 3, 5, and 9.

| Need | Check | Get it |
|---|---|---|
| Node.js 22 or newer | `node -v` | https://nodejs.org |
| npm | `npm -v` | comes with Node.js |
| Git | `git --version` | https://git-scm.com |
| Docker Desktop, running | `docker info` prints a server version | https://www.docker.com |
| Supabase account | sign in at https://supabase.com | free |
| AWS account with Amplify access | sign in to the AWS console | task 16 |
| Google billing-enabled project with a Gemini API key | the key appears in Google AI Studio | needed in P2; create it now |

Keep every key and password in a password manager. Never paste one into a file that git tracks.

## Files this phase creates or changes

| Path | Purpose |
|---|---|
| whole Next.js project | from `create-next-app` |
| `.nvmrc` | Node version |
| `package.json` | scripts, engines |
| `tsconfig.json` | strict settings |
| `.env.example`, `.env.local` | variable names; local values |
| `src/lib/env.ts` | validated environment |
| `src/lib/errors.ts` | error codes and `AppError` |
| `src/lib/log.ts` | one JSON log line per request |
| `src/lib/api.ts` | `handleRoute`, `jsonOk`, `jsonError` |
| `src/lib/supabase/config.ts` | public Supabase settings |
| `src/lib/supabase/browser.ts` | Supabase client for client components |
| `src/lib/supabase/server.ts` | Supabase client for server components and routes |
| `src/proxy.ts` or `src/middleware.ts` | refreshes the session on each request |
| `src/strings/en.ts` | all user-visible text |
| `src/components/disclaimer.tsx` | safety disclaimer |
| `src/app/globals.css` | colours, base text size |
| `src/app/layout.tsx` | root layout |
| `src/app/page.tsx` | landing page |
| `src/app/health/route.ts` | health check |
| `vitest.config.ts`, `src/test/env.test.ts`, `src/test/errors.test.ts` | unit tests |
| `playwright.config.ts`, `e2e/smoke.spec.ts` | browser tests |
| `supabase/` | from `supabase init` |
| `supabase/seed.sql` | empty |
| `.github/workflows/ci.yml` | CI |
| `amplify.yml` | Amplify build |

---

## Tasks

### Task 1 — Record the environment

```
node -v
npm -v
git --version
docker info --format '{{.ServerVersion}}'
```

Write the four outputs in the Exit log. If `docker info` fails, start Docker Desktop and run it again.

### Task 2 — Create the project

Create the empty app root folder and enter it:

```
mkdir carecircle
cd carecircle
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

If it asks questions, choose: TypeScript yes, ESLint yes, Tailwind CSS yes, `src/` directory yes, App Router yes, Turbopack: the default, import alias `@/*`, React Compiler: no. If it offers to create an `AGENTS.md` or similar file for AI tools, choose no.

Now copy the plan folder into the app root as `plan/` (README section 1).

```
npm ls next react typescript --depth=0
```

Write the versions in the Exit log. `next` must be 16.x. If it is not, write the version you got under "Blocked" and stop.

Replace the contents of `src/app/page.tsx` and `src/app/globals.css` later in this phase. Do not delete config files.

**Check:** `npm run build` succeeds.

### Task 3 — Install dependencies

```
npm install @supabase/supabase-js @supabase/ssr zod pdf-lib server-only
npm install -D vitest @playwright/test supabase
npx playwright install chromium
npm ls @supabase/supabase-js @supabase/ssr zod pdf-lib vitest @playwright/test supabase --depth=0
```

Write the versions in the Exit log.

**Check:** the last command prints no `missing` or `invalid` line.

### Task 4 — Node version, scripts, engines

Create `.nvmrc`:

```
22
```

In `package.json`, set `scripts` to exactly:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset",
  "db:test": "supabase test db"
}
```

Add next to `scripts`:

```json
"engines": { "node": ">=22" }
```

Add `"plan/**"` to the ignore list in `eslint.config.mjs` (the plan contains code examples, not app code). The file created by `create-next-app` has an ignores array; add the entry there.

**Check:** `npm run lint` and `npm run typecheck` exit with code 0.

### Task 5 — Strict TypeScript

In `tsconfig.json` under `compilerOptions`, make sure these two are present:

```json
"strict": true,
"noUncheckedIndexedAccess": true
```

Add `"plan"` to the `exclude` array.

**Check:** `npm run typecheck` exits 0.

### Task 6 — Environment

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  APP_URL: z.string().url(),
});

export type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string | undefined;
  geminiModel: string | undefined;
  demoMode: boolean;
  appUrl: string;
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${names}`);
  }
  const value = parsed.data;
  return {
    supabaseUrl: value.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: value.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    geminiApiKey: value.GEMINI_API_KEY,
    geminiModel: value.GEMINI_MODEL,
    demoMode: value.DEMO_MODE === "true",
    appUrl: value.APP_URL.replace(/\/$/, ""),
  };
}

export function getEnv(): Env {
  return parseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    DEMO_MODE: process.env.DEMO_MODE,
    APP_URL: process.env.APP_URL,
  });
}
```

`getEnv` names each variable explicitly. Next.js only replaces `process.env.NAME` written out in full, so never read `process.env` as a whole object.

`getEnv` is for server code only. Client components read `process.env.NEXT_PUBLIC_*` through `src/lib/supabase/config.ts` (task 8).

Create `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=
DEMO_MODE=true
APP_URL=http://localhost:3000
```

Make sure `.gitignore` contains both lines below. Add any that are missing.

```
.env
.env*.local
```

### Task 7 — Local Supabase

```
npx supabase init
npx supabase start
npx supabase status
```

`supabase init` creates `supabase/config.toml`. If it asks about generating VS Code or IntelliJ settings, answer no. The first `supabase start` downloads containers and takes several minutes.

Create `.env.local` with values from `supabase status`:

| `.env.local` name | Value from `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` (usually `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon key`, or `Publishable key` on newer CLI versions |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key`, or `Secret key` on newer CLI versions |
| `DEMO_MODE` | `true` |
| `APP_URL` | `http://localhost:3000` |

Leave `GEMINI_API_KEY` and `GEMINI_MODEL` empty until P2.

Write in the Exit log which key names your CLI printed, and the local mail viewer URL from `supabase status` (listed as Inbucket or Mailpit). Sign-up emails appear there in P1.

In `supabase/config.toml`, find the `[auth]` section and set:

```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
```

Then restart: `npx supabase stop` and `npx supabase start`.

Create an empty `supabase/seed.sql`. Create empty folders `supabase/migrations/` (may already exist) and `supabase/tests/`. Git does not track empty folders; that is fine.

Create the staging project in the Supabase dashboard: New project, region = the closest one to India offered (Mumbai if listed). Save the database password in your password manager. Write the region in the Exit log. Do not link the CLI to it yet (P6).

**Check:** `npx supabase status` lists the services as running.

### Task 8 — Supabase clients

Create `src/lib/supabase/config.ts`:

```ts
export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase public configuration is missing");
  }
  return { url, anonKey };
}
```

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const config = getPublicSupabaseConfig();
  return createBrowserClient(config.url, config.anonKey);
}
```

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getPublicSupabaseConfig } from "./config";

export async function createSupabaseServerClient() {
  const config = getPublicSupabaseConfig();
  const cookieStore = await cookies();
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for") ?? "";
  const clientIp = forwarded.split(",")[0]?.trim() ?? "";
  return createServerClient(config.url, config.anonKey, {
    global: {
      headers: clientIp ? { "x-client-ip": clientIp } : {},
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
```

The `x-client-ip` header passes the visitor's IP address to the database, which records it in the audit log (P1). It is best-effort, can be faked, and is never used for access decisions.

Writing cookies works only in route handlers and the proxy file. In a server component, Supabase only needs to write cookies when it refreshes the session, and the proxy (task 9) refreshes it first. If you see the error "Cookies can only be modified in a Server Action or Route Handler" while loading a page, check that the proxy file exists and its matcher covers that page.

Compare these files with the Next.js App Router example in the official `@supabase/ssr` documentation for your installed version. Note any difference in "Notes".

**Check:** `npm run typecheck` exits 0.

### Task 9 — Session refresh file

Read the official Next.js documentation for your installed version (task 2) and find the request interception file convention. Next.js 16 calls it `proxy.ts` (exported function `proxy`). Older versions called it `middleware.ts` (exported function `middleware`). Use whatever your version's docs say. Write the name and the doc link in the Exit log.

Create `src/proxy.ts` (or `src/middleware.ts`):

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const supabaseConfig = getPublicSupabaseConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|health|manifest.webmanifest|icon.svg|icon-192.png|icon-512.png).*)",
  ],
};
```

If the file is `middleware.ts`, rename the function to `middleware`.

This file only refreshes the session. It does not redirect anyone. Pages check the user themselves (P1).

**Check:** done in task 14.

### Task 10 — Errors, logging, route wrapper

Create `src/lib/errors.ts`:

```ts
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "EXPIRED",
  "ALREADY_USED",
  "CONSENT_REQUIRED",
  "TOO_EARLY",
  "FILE_TOO_LARGE",
  "FILE_EMPTY",
  "UNSUPPORTED_FILE_TYPE",
  "PDF_TOO_LONG",
  "PDF_ENCRYPTED",
  "AI_UNAVAILABLE",
  "AI_INVALID_OUTPUT",
  "AI_BLOCKED",
  "AI_NOT_CONFIGURED",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  EXPIRED: 410,
  ALREADY_USED: 409,
  CONSENT_REQUIRED: 403,
  TOO_EARLY: 409,
  FILE_TOO_LARGE: 413,
  FILE_EMPTY: 400,
  UNSUPPORTED_FILE_TYPE: 415,
  PDF_TOO_LONG: 422,
  PDF_ENCRYPTED: 422,
  AI_UNAVAILABLE: 503,
  AI_INVALID_OUTPUT: 502,
  AI_BLOCKED: 422,
  AI_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function statusFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
```

Create `src/lib/log.ts`:

```ts
type RequestLog = {
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
};

export function logRequest(entry: RequestLog) {
  console.log(JSON.stringify({ level: "info", type: "request", ...entry }));
}

export function logFailure(requestId: string, code: string) {
  console.error(JSON.stringify({ level: "error", type: "failure", requestId, code }));
}
```

These two functions are the only logging in the app. Never log request bodies, database error messages, names, medicine names, file contents, or AI output.

`api.ts` imports the strings file, so create `src/strings/en.ts` exactly as shown in task 12 now, before `api.ts`. Then create `src/lib/api.ts`:

```ts
import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { logFailure, logRequest } from "./log";
import { strings } from "@/strings/en";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function jsonError(error: unknown, requestId: string) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId } },
      { status: error.status, headers: NO_STORE },
    );
  }
  logFailure(requestId, "INTERNAL");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: strings.errors.INTERNAL, requestId } },
    { status: 500, headers: NO_STORE },
  );
}

type Handler<P> = (request: Request, context: { params: P; requestId: string }) => Promise<Response>;

export function handleRoute<P extends Record<string, string> = Record<string, never>>(handler: Handler<P>) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let response: Response;
    try {
      const params = await context.params;
      response = await handler(request, { params, requestId });
    } catch (error) {
      response = jsonError(error, requestId);
    }
    logRequest({
      requestId,
      method: request.method,
      route: new URL(request.url).pathname,
      status: response.status,
      durationMs: Date.now() - started,
    });
    return response;
  };
}
```

Every route handler in later phases is written like this:

```ts
export const POST = handleRoute<{ patientId: string }>(async (request, { params, requestId }) => {
  return jsonOk({ ok: true, requestId, patientId: params.patientId });
});
```

If `npm run build` reports that an exported route function has the wrong type, read the "Route Handlers" page of the Next.js docs for your version, adjust the type of `context` in `handleRoute` to match, and note it.

### Task 11 — Unit tests

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

Create `src/test/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODES, isErrorCode, statusFor } from "@/lib/errors";

describe("errors", () => {
  it("maps every error code to a 4xx or 5xx status", () => {
    for (const code of ERROR_CODES) {
      expect(statusFor(code)).toBeGreaterThanOrEqual(400);
      expect(statusFor(code)).toBeLessThanOrEqual(599);
    }
  });

  it("carries code and status on AppError", () => {
    const error = new AppError("NOT_FOUND", "Missing");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.status).toBe(404);
  });

  it("recognises known codes and rejects unknown ones", () => {
    expect(isErrorCode("EXPIRED")).toBe(true);
    expect(isErrorCode("expired")).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});
```

Create `src/test/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  APP_URL: "http://localhost:3000/",
};

describe("parseEnv", () => {
  it("accepts the minimum set, defaults demo mode off, trims the trailing slash", () => {
    const env = parseEnv(valid);
    expect(env.demoMode).toBe(false);
    expect(env.appUrl).toBe("http://localhost:3000");
  });

  it("turns DEMO_MODE=true into true", () => {
    expect(parseEnv({ ...valid, DEMO_MODE: "true" }).demoMode).toBe(true);
  });

  it("names a missing Supabase URL", () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects a malformed APP_URL", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not a url" })).toThrow(/APP_URL/);
  });

  it("rejects an unknown DEMO_MODE value", () => {
    expect(() => parseEnv({ ...valid, DEMO_MODE: "yes" })).toThrow(/DEMO_MODE/);
  });
});
```

**Check:** `npm test` shows 8 tests passed.

### Task 12 — Strings and disclaimer

Create `src/strings/en.ts`:

```ts
export const strings = {
  appName: "CareCircle",
  disclaimer:
    "CareCircle helps families organise care. It is not a medical device and does not give medical advice. Every medicine read from a document must be checked by a person before it is used.",
  footerDisclaimer: "CareCircle does not give medical advice. Check medicines with the doctor or pharmacist.",
  landing: {
    title: "Family care coordination",
    body: "Keep prescriptions, medicine times, and checkups in one place for the people you look after.",
    signIn: "Sign in",
    signUp: "Create an account",
  },
  errors: {
    UNAUTHENTICATED: "Please sign in again.",
    FORBIDDEN: "You do not have permission to do this.",
    NOT_FOUND: "We could not find that.",
    VALIDATION_FAILED: "Some details are missing or not valid.",
    CONFLICT: "This has already changed. Refresh the page and try again.",
    EXPIRED: "This link has expired. Ask for a new one.",
    ALREADY_USED: "This link has already been used.",
    CONSENT_REQUIRED: "Consent is needed before documents can be added.",
    TOO_EARLY: "This dose is not due yet.",
    FILE_TOO_LARGE: "The file is larger than 10 MB.",
    FILE_EMPTY: "The file is empty.",
    UNSUPPORTED_FILE_TYPE: "Only JPEG, PNG, and PDF files can be added.",
    PDF_TOO_LONG: "PDFs can have at most 5 pages.",
    PDF_ENCRYPTED: "This PDF is password protected. Remove the password and try again.",
    AI_UNAVAILABLE: "The document reader is not available right now. Try again in a minute, or enter the medicines by hand.",
    AI_INVALID_OUTPUT: "The document reader gave an answer we could not use. Try again, or enter the medicines by hand.",
    AI_BLOCKED: "The document reader could not process this file. Enter the medicines by hand.",
    AI_NOT_CONFIGURED: "The document reader is not set up.",
    RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
    INTERNAL: "Something went wrong. Quote this reference if it continues:",
  },
} as const;
```

Later phases add more keys to this object. Never remove keys.

Create `src/components/disclaimer.tsx`:

```tsx
import { strings } from "@/strings/en";

export function Disclaimer({ variant = "full" }: { variant?: "full" | "footer" }) {
  return (
    <p role="note" className="text-base text-ink">
      {variant === "footer" ? strings.footerDisclaimer : strings.disclaimer}
    </p>
  );
}
```

### Task 13 — Styles and layout

Replace `src/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --color-ink: #0f172a;
  --color-muted: #475569;
  --color-paper: #ffffff;
  --color-panel: #f1f5f9;
  --color-line: #cbd5e1;
  --color-accent: #0b5cad;
  --color-accent-ink: #ffffff;
  --color-ok: #166534;
  --color-warn: #92400e;
  --color-danger: #b91c1c;
}

html {
  font-size: 18px;
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 2px;
}
```

The `@theme` block creates Tailwind classes such as `bg-accent`, `text-ink`, `text-muted`, `border-line`, `text-danger`. Every colour above meets 4.5:1 contrast on white (accent, ok, warn, danger, ink, muted) or is a background. Check any new colour with a contrast checker first.

Because `html` is 18 px and Tailwind sizes use `rem`, `min-h-12` is 54 px, above the 48 px touch target minimum.

If your Tailwind version does not support `@theme` (Tailwind 3), write the same colours in `tailwind.config.ts` under `theme.extend.colors` and note it.

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { strings } from "@/strings/en";

export const metadata: Metadata = {
  title: strings.appName,
  description: strings.landing.body,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

### Task 14 — Landing page and health route

Replace `src/app/page.tsx` with:

```tsx
import Link from "next/link";
import { Disclaimer } from "@/components/disclaimer";
import { strings } from "@/strings/en";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold">{strings.landing.title}</h1>
      <p className="text-lg">{strings.landing.body}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/sign-in" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-lg font-semibold text-accent-ink">
          {strings.landing.signIn}
        </Link>
        <Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-accent px-6 text-lg font-semibold text-accent">
          {strings.landing.signUp}
        </Link>
      </div>
      <Disclaimer />
    </main>
  );
}
```

The sign-in and sign-up pages arrive in P1. Until then the links show a 404; that is expected.

Create `src/app/health/route.ts`:

```ts
import { jsonOk } from "@/lib/api";

export function GET() {
  return jsonOk({ ok: true });
}
```

Delete the starter images in `public/` that `create-next-app` added (for example `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) if nothing uses them.

**Check:** `npm run build` succeeds. Then `npm run dev`, and in a second terminal `curl -s http://localhost:3000/health` prints `{"ok":true}`. Open http://localhost:3000 and see the title and disclaimer. Stop the dev server.

### Task 15 — Browser tests

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/health",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
```

`workers: 1` keeps tests from interfering with each other's database rows in later phases.

Create `e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("landing page shows the title and the disclaimer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Family care coordination" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("not a medical device");
});

test("health endpoint answers ok", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
```

**Check:** `npm run test:e2e` prints `4 passed`.

### Task 16 — CI and Amplify settings

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder
      APP_URL: http://localhost:3000
      DEMO_MODE: "true"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

CI runs lint, types, unit tests, and the build. Database tests and browser tests need Docker and a local Supabase, so they run on the builder's machine at the end of every phase (exit checks).

Create `amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm install 22
        - nvm use 22
        - npm ci
    build:
      commands:
        - env | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|GEMINI_API_KEY|GEMINI_MODEL|DEMO_MODE|APP_URL)=' >> .env.production
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - "**/*"
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

The `env | grep` line exists because Amplify's Next.js server cannot read Amplify's environment variables at runtime unless they are written into `.env.production` during the build. Compare this with the current Amplify Hosting documentation for Next.js server-side rendering and environment variables, and note any change. `SUPABASE_SERVICE_ROLE_KEY` is deliberately not in the list.

### Task 17 — First commit and staging deploy

```
git add -A
git status
```

Check that `.env.local` is not listed. Then:

```
git commit -m "chore(p0): foundation"
```

Create an empty repository on GitHub, add it as `origin`, and push `main`.

In the AWS console, open AWS Amplify, choose "Create new app", connect the GitHub repository, branch `main`. Amplify should detect Next.js and use `amplify.yml`. In the app's environment variables, add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | staging project URL (Supabase dashboard, Project Settings, API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon or publishable key |
| `DEMO_MODE` | `true` |
| `APP_URL` | the Amplify URL, for example `https://main.xxxxxxxx.amplifyapp.com` (set after the first deploy, then redeploy) |

Deploy. Open `<staging URL>/health`.

Write the staging URL in the Exit log.

---

## Exit checks

| Command | Expected |
|---|---|
| `npm run build` | succeeds |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 8 passed |
| `npm run test:e2e` | 4 passed |
| `npx supabase status` | services running |
| `curl -s <staging URL>/health` | `{"ok":true}` |
| GitHub Actions `ci` on `main` | green |

## Exit log

```
(builder fills this in: tool versions, Next.js version, proxy file name and doc link,
Supabase key names printed by the CLI, local mail viewer URL, staging Supabase region,
staging URL, and the pass lines of each exit check)
```

## Notes

```
(differences between this plan and the installed libraries' documentation)
```

## Blocked

```
(none)
```

## Out of scope for this phase

- Database tables (P1).
- Sign-in and sign-up pages (P1).
- Gemini configuration (P2).
- Linking the CLI to the staging database (P6).
