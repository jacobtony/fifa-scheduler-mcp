# mcp-fifa-scheduler

An MCP (Model Context Protocol) server that creates and notifies calendar-style events for FIFA World Cup matches of your favourite team. The server exposes a single tool, `create_match_event`, which gathers the match details from the user and posts them to a local backend that schedules the event and emails a reminder to the recipient.

## What `src/index.ts` does

`src/index.ts` is the entire server implementation. Here is a breakdown of its responsibilities:

### 1. Bootstrapping the MCP server

- Imports `McpServer` and `StdioServerTransport` from the MCP SDK, plus `zod` for input validation.
- Instantiates an `McpServer` named `fifaScheduler` (version `1.0.0`).
- Declares the **server** capabilities it supports during initialization:
  - `tools: { listChanged: true }` — the server can notify clients when its tool list changes.
- Note: `elicitation` is a **client** capability, so it is intentionally **not** declared in the server's capabilities. The server only checks for it at runtime (see below). Some of the clients that support Elicitation

### 2. Registering the `create_match_event` tool

The tool is registered with `server.registerTool(...)` and described as:

> "Create a match event for the match in the world cup and send to the mail of the recipient."

Its input schema (all optional, validated with `zod`) acts as a fallback for clients that cannot render an interactive form:

| Field | Type | Purpose |
| --- | --- | --- |
| `favoriteTeam` | `string` (optional) | The team whose match you want an event for. |
| `recipientEmail` | `string` (optional) | The email address that will receive the reminder. |
| `minutesRemaining` | `number` (optional) | Minutes before kickoff to be reminded. |

### 3. Collecting input via elicitation

When the tool is invoked, the handler:

1. Checks whether the connected **client** advertises **form elicitation** support via `server.server.getClientCapabilities()?.elicitation?.form`.
2. **If form elicitation is supported**, it calls `server.server.elicitInput({ mode: "form", ... })` to ask the user for (or confirm) three values through a structured form:
   - `email` — recipient email (defaults to the passed-in value or a fallback address).
   - `reminderMinutes` — integer between `0` and `1440`.
   - `favoriteTeam` — the team name.
   - All three fields are marked as `required`.
3. If the user does **not** accept the form (`elicitation.action !== "accept"`) or returns no content, the tool returns a friendly "cancelled" message.
4. **If form elicitation is not supported**, the tool returns an error message explaining that a form-capable client is required (because the recipient email can only be collected through the form).

### 4. Creating the event (backend call)

Once the inputs are gathered, the handler:

- Sends a `POST` request to `http://localhost:3000/create-event` with a JSON body containing `favoriteTeam`, `email`, and `reminderMinutes`.
- Handles failures gracefully:
  - A non-`ok` HTTP response returns an error result including the status code.
  - Network/exception errors are caught and reported as an error result.
- On success, it logs the response (to `stderr`) and returns a confirmation message such as:

  > "Match event for Argentina created and sent to user@example.com with a 60-minute reminder."

### 5. Starting the server

- The `main()` function creates a `StdioServerTransport` and connects the server to it, so the server communicates over **stdio**.
- Any fatal error in `main()` is logged and the process exits with code `1`.

> Note: The server logs informational/diagnostic output to `stderr` (`console.error`) because `stdout` is reserved for the MCP protocol messages over stdio.

## Understanding MCP Elicitation

**Elicitation** is an MCP feature that lets a **server request additional input from the user**, *mid-request*, through the **client**. Instead of forcing all parameters to be supplied up front when a tool is called, the server can pause and ask the user for the information it needs — interactively.

### Why it exists

Tools often need data that:

- The model/agent doesn't have (e.g., a personal email address).
- Should be confirmed by a human before an action is taken (e.g., sending an email or creating a calendar event).
- Is better captured through a structured form than guessed by the model.

Elicitation provides a standard, secure way to collect that data without hard-coding it or trusting the model to invent it.

### How it works

1. **Capability negotiation.** Elicitation is a **client capability**. During initialization, the client advertises whether it supports elicitation (and which modes, such as `form`). The server checks this at runtime via `getClientCapabilities()`.
2. **The server requests input.** When a tool needs more data, the server calls `elicitInput({ ... })` with:
   - A `mode` (e.g., `"form"`).
   - A human-readable `message`.
   - A `requestedSchema` (JSON Schema) describing the fields, their types, validation rules, titles, descriptions, and defaults.
3. **The client renders a UI.** The client shows the user a form (or other appropriate UI) based on the schema, validating the input against the provided constraints.
4. **The user responds.** The result contains an `action`:
   - `accept` — the user submitted the form; the data is in `content`.
   - `decline` / `cancel` — the user refused or dismissed; the server should handle this gracefully (no action taken).
5. **The server continues.** With the collected, validated data, the server completes its work.

### Elicitation in this project

This server uses **form elicitation** to collect the recipient email, reminder time, and favourite team. Key points illustrated by the code:

- It **gracefully degrades**: if the client doesn't support form elicitation, the tool returns a clear message instead of failing silently. (Here, the email is considered mandatory, so a form-capable client is required.)
- It **respects user choice**: if the user cancels the form, no event is created.
- It uses the schema's **defaults and validation** (e.g., `minimum`/`maximum` for reminder minutes, `minLength` for strings) so the client can guide the user toward valid input.

### Best practices (general)

- Always check the client capability before calling `elicitInput`, and provide a fallback path.
- Keep schemas minimal and well-described (titles, descriptions, sensible defaults).
- Never use elicitation to request secrets the user wouldn't expect a tool to ask for; be transparent about why the data is needed.
- Always handle the non-`accept` actions so the user can safely back out.

## Project structure

```
package.json      # package metadata, scripts, and dependencies
tsconfig.json     # TypeScript compiler configuration
README.md         # this file
src/
  index.ts        # MCP server implementation (the file documented above)
build/
  index.js        # compiled output (entry point / bin)
```

## Getting started

### Prerequisites

- Node.js (ESM-capable version).
- A backend listening on `http://localhost:3000/create-event` that accepts a JSON `POST` body of `{ favoriteTeam, email, reminderMinutes }`.
- An MCP client that supports **form elicitation** (required to collect the recipient email).

### Build

```bash
npm install
npm run build
```

This compiles `src/index.ts` to `build/index.js` and makes it executable.

### Run

The server speaks MCP over **stdio**, so it is typically launched by an MCP client rather than run directly. Configure your client to start it via the `mcp-fifa-scheduler` bin or:

```bash
node build/index.js
```

## Tool reference

### `create_match_event`

Creates a World Cup match event and emails a reminder to the recipient.

**Inputs (all optional; used as fallbacks when a form can't be rendered):**

- `favoriteTeam` (`string`) — Favourite team of the user.
- `recipientEmail` (`string`) — Email of the recipient.
- `minutesRemaining` (`number`) — Minutes remaining before the match starts.

**Behaviour:** Prompts the user via form elicitation for the email, reminder minutes, and favourite team, then posts the result to the local `create-event` backend and returns a confirmation message.
