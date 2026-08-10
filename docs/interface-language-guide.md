# Interface language guide

The interface should feel like a calm, welcoming studio companion. It explains
what matters to the person using it and leaves the machinery backstage.

## Voice

- Warm, confident, and concise.
- Gently playful when the user is waiting or exploring.
- Plainspoken when something needs attention.
- Precise when dimensions, safety, saving, or fabrication are involved.

## Writing principles

1. Lead with the experience. Say `Making brochure`, not how many captures,
   prompts, uploads, or rendering passes are underway.
2. Keep progress messages light. Use one short status, one pleasant headline,
   and at most one supporting sentence.
3. Let a little whimsy soften a wait, never obscure an action or an error.
4. Name the next useful action directly: `Try again`, `Download`, or
   `Back to design`.
5. Hide implementation details such as providers, storage systems, file
   resolutions, and internal model terminology.
6. Preserve trust-bearing details. Say whether work is saved, show real
   dimensions, and keep fabrication or safety qualifications explicit.

## Preferred patterns

| Moment | Prefer | Avoid |
| --- | --- | --- |
| Starting | Making brochure | Creating four coordinated views |
| Waiting | Prepare for a little whimsy | Describing capture and rendering steps |
| Finishing | Adding the finishing touches | Listing uploads and file resolutions |
| Empty state | A lovely blank slate | No records found |
| Error | A small hiccup. Try again. | Raw service or provider errors |

Warmth belongs in the presentation layer. Technical logs and diagnostics should
remain available to developers without becoming user-facing copy.
