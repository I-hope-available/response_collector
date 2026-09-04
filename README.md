# Response Collector

Firefox extension for collecting good and bad LLM response examples as a reusable persona-evaluation dataset.

The first target is Qwen. The immediate use case is collecting examples that can later be used to evaluate prompt compression without relying on vague manual impressions.

## MVP

Build a Firefox WebExtension that works on the Qwen web chat UI.

### Collection

- Inject two small controls next to each assistant response: `☆` (positive) and `×` (negative).
- Clicking either control stores a sample immediately.
- A sample contains the selected assistant response and up to the preceding 3 conversation messages, preserving their roles and order.
- Also store the page URL, collection timestamp, source (`qwen`), and label (`positive` or `negative`).
- Do not collect unrelated page text, hidden prompts, account information, or other conversations.
- Prevent accidental duplicate collection of the same response with the same label. It should still be possible to change/reclassify a sample deliberately later.

### Storage

Use `browser.storage.local` for the MVP. No server and no external network requests are required.

Suggested logical record shape:

```json
{
  "id": "stable-or-generated-id",
  "source": "qwen",
  "url": "https://...",
  "collected_at": "2026-09-05T00:00:00.000Z",
  "label": "positive",
  "context": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "response": "..."
}
```

The exact schema may be refined, but exported data must remain plain, documented, and easy to migrate.

### Popup

The browser-action popup should show:

- total sample count
- positive count
- negative count
- `Export JSONL` button

Export one JSON object per line as UTF-8 `.jsonl`. Do not export internal extension-only state.

### Architecture

Keep site-specific DOM logic isolated behind an adapter so other chat sites can be added later without rewriting storage/export logic.

Suggested structure (adjust if a simpler structure is justified):

```text
manifest.json
src/
  content/
    index.js
    adapters/
      qwen.js
  storage.js
  export-jsonl.js
  popup/
    popup.html
    popup.js
    popup.css
```

Avoid frameworks and build tooling unless they provide a concrete benefit. Plain JavaScript/CSS/HTML is preferred for this MVP.

## Qwen adapter requirements

Qwen is a dynamic SPA, so do not assume the initial DOM is final.

- Observe newly rendered assistant messages and attach controls idempotently.
- Avoid brittle selectors where more semantic/stable attributes or structural checks are available.
- Centralize selectors/heuristics inside `qwen.js`.
- Extract clean visible message text, excluding collector controls and unrelated UI chrome.
- Preserve code blocks as text in the collected content.
- Do not interfere with Qwen's own buttons, scrolling, generation, or message interaction.
- Fail quietly if the page structure is not recognized; log useful diagnostic information to the console in development-friendly form.

## Acceptance criteria

1. The extension loads temporarily in current Firefox without a build step.
2. Opening a supported Qwen conversation adds `☆` and `×` to assistant responses, including responses rendered after navigation/generation.
3. Clicking `☆` stores a positive sample; clicking `×` stores a negative sample.
4. The stored response text matches the selected assistant response.
5. Up to 3 immediately preceding messages are stored in correct chronological order and with correct roles.
6. Repeated DOM mutations do not create duplicate controls.
7. Popup counts reflect stored samples.
8. Export produces valid JSONL that can be parsed line-by-line.
9. Reloading Firefox/the page does not erase collected samples.
10. No data is sent to an external service.

## Out of scope for the first MVP

Do **not** add these until the basic collection loop works reliably:

- ChatGPT/Claude/Gemini support
- tags
- free-form notes / `why_good` / `why_bad`
- star ratings
- configurable context depth
- cloud sync
- local server/database
- automatic LLM judging
- persona evaluation itself

## Next phases

After the Qwen MVP is proven against the live site:

1. tags and short annotations
2. sample browser/edit/delete/reclassify UI
3. configurable context depth
4. ChatGPT adapter and other site adapters
5. dataset validation/versioning
6. automated persona regression evaluation

## Development rule

Prioritize a reliable collection loop over UI polish. If Qwen DOM assumptions are uncertain, document them clearly instead of hiding them in generic code. Keep the collected dataset independent of the extension implementation so it remains useful even if this extension is replaced later.
