# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev        # Start Next.js dev server
npm run build      # Production build
npm run lint       # ESLint check
npm run test       # Vitest watch mode
npm run test:run   # Single test run
```

## Architecture Overview

**Stack:** Next.js 15 + React 19 + Supabase (PostgreSQL) + Tailwind + shadcn/ui + Recharts

### Key Patterns

1. **Server Components** for pages (`page.tsx`) - fetch data directly with Supabase
2. **Client Components** (`*Client.tsx`) - interactive UI with `"use client"` directive
3. **Server Actions** (`actions.ts`) - mutations with validation, use `revalidatePath()` for cache invalidation

### Data Flow

```
page.tsx (Server) → fetches data via Supabase → passes to Client Component
Client Component → invokes Server Action → action validates, mutates DB → revalidatePath()
```

### Module Structure

Each feature follows this pattern:
```
app/protected/[module]/
├── page.tsx              # Server Component (SSR, data fetching)
├── [Feature]Client.tsx   # Client Component (forms, interactivity)
└── actions.ts            # Server Actions (CRUD operations)
```

### Supabase Integration

- **Server:** `import { createClient } from "@/lib/supabase/server"` - uses cookies for SSR
- **Client:** `import { createClient } from "@/lib/supabase/client"` - browser client
- Always validate user session in Server Actions before DB operations

## Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| Accounts | `/protected/accounts` | Bank accounts/cards management |
| Categories | `/protected/categories` | Expense categories with colors |
| Transactions | `/protected/transactions` | CRUD + bulk import from PDF |
| Reports | `/protected/reports` | Visualizations with Recharts |
| Rules | `/protected/rules` | Auto-classification rules |
| PDF Parser | `lib/pdf/` | Statement parsing (text + OCR fallback) |

## PDF Parsing

`parseStatementPdfAuto()` in `lib/pdf/statementParser.ts`:
- Tries text extraction first (pdfjs-dist)
- Falls back to OCR (tesseract) if insufficient transactions
- Returns `{ transactions: Tx[], parserUsed: "text" | "ocr" }`

## Types

Main types in `types/db.ts`: `Account`, `Category`, `Transaction`, `MerchantRule`, `Budget`

## Error Handling

Use `sanitizeDbError()` from `lib/errors.ts` to convert PostgreSQL errors to safe user messages.

## UI Components

- shadcn/ui components in `components/ui/` (New York style)
- Dark theme by default with next-themes
- Use `cn()` from `lib/utils.ts` for conditional classes

## Testing

- Vitest with 60s timeout for OCR tests
- Mock `server-only` via `vitest.config.ts` alias
- Tests in `lib/[module]/__tests__/`
