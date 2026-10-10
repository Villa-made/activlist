# T02.1 — Cloudflare Workers AI / Gemma 4 Vision provider spike

**Date:** 2026-10-10  
**Owner:** Developer C  
**Branch:** `feature/vision-provider-validation`  
**Status:** **DONE (T02.1 technical spike)** — the documented Cloudflare provider SDK produced interpretable, differentiated decisions for both approved fixtures. The parent T02/public-release gate remains **REVIEW** pending human licence/privacy sign-off and later strict output handling.

## Scope and safety

This is a provider spike only. It does not add a production adapter or change an
API contract. Any external test must use only two self-owned, non-personal test
images; do not send citizen photos or identifiable personal data. Tokens, account
IDs, raw image bytes, and raw provider responses must not be committed or logged.

## Repository and T00 preflight

| Check | Actual result |
| --- | --- |
| Current branch | `feature/vision-provider-validation` |
| T00 status | Human-confirmed complete by the release owner on 2026-10-10; the unchecked repository tracker entry was deliberately not edited because this task owns only `tests/ai/**` |
| Cloudflare configuration/test harness | No `wrangler.*` or existing `tests/ai/` directory before this document |
| `CLOUDFLARE_ACCOUNT_ID` presence | `true` (value was not read or logged) |
| `CLOUDFLARE_AUTH_TOKEN` presence | `true` (value was not read or logged) |
| Local configuration | `.env` is ignored by Git; two configured image paths and descriptions exist |
| Fixture privacy preflight | Relevant fixture replaced after an initial exclusion; final relevant fixture shows a bottle/recycling container and non-identifying partial hands only. Irrelevant fixture shows houseplants. |
| Real inference performed | Yes — two direct REST passes plus one successful temporary provider-SDK pass over the same relevant/irrelevant fixtures |

Credentials were used only in process memory to authenticate the documented REST
endpoint. They were not printed, committed, or included in the evidence below.

## Commands actually executed

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/tasks/todo.md
Get-Content -Raw docs/tasks/agent-instructions.md
Get-Content -Raw docs/specs/SPEC-ai-validation.md
Get-Content -Raw docs/design/decisions/ADR-004-validacion-visual-gratuita.md
Get-Content -Raw docs/design/api-contracts.md
Get-Content -Raw docs/design/architecture.md
Get-Content -Raw docs/design/release-checklist.md
rg -n --hidden -S "Cloudflare|Workers AI|gemma|CF_API|CLOUDFLARE|T00|provider-spike|ai/" . -g '!node_modules' -g '!dist'
$hasAccount = -not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_ACCOUNT_ID)
$hasToken = -not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_AUTH_TOKEN)
[PSCustomObject]@{CLOUDFLARE_ACCOUNT_ID_present=$hasAccount; CLOUDFLARE_AUTH_TOKEN_present=$hasToken} | ConvertTo-Json -Compress
git branch --show-current
git status --short
```

Computer-use session inventory executed: `await cua.getState()`; result contained
no browser sessions. No UI login or credential entry was attempted.

Initial redacted credential-presence result, before the user supplied the local
ignored `.env` file:

```json
{"CLOUDFLARE_ACCOUNT_ID_present":false,"CLOUDFLARE_AUTH_TOKEN_present":false}
```

Additional actual command (values redacted) used `Invoke-RestMethod` twice per
pass against the documented endpoint, with a `prompt` containing the configured
description and an `image` data URI built in memory from each fixture:

```powershell
Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/<redacted>/ai/run/@cf/google/gemma-4-26b-a4b-it" `
  -Method Post -Headers @{ Authorization = 'Bearer <redacted>'; 'Content-Type' = 'application/json' } `
  -Body '<prompt and image data URI built in memory>' -TimeoutSec 90
```

The initial local sandbox attempt failed before an HTTP response with the
redacted transport error `Se ha terminado la conexión: Error inesperado de
recepción.` Retrying with approved external network access produced the results
below. No command printed environment values, image bytes, or raw request bodies.

Final local integrity checks: `git diff --check` passed. `npm run build` was
attempted after Node.js was installed for the temporary spike tool, but stopped
because the repository's project dependencies are not installed and `tsc` is not
available. This documentation-only spike did not change source or build
configuration.

## HTTP / inference results

| Case | Intended evidence | HTTP outcome | Sanitized model response | Quota observation |
| --- | --- | --- | --- | --- |
| Relevant — pass 1 | Own, non-identifying recycling image with matching description | `200`, `success: true`, 1,201 ms | Response-text field was not captured; model metadata identified `@cf/google/gemma-4-26b-a4b-it-external` | 79 prompt + 16 completion tokens; **1.1545454263687134 neurons** |
| Irrelevant — pass 1 | Own, non-identifying plant image with recycling description | `200`, `success: true`, 573 ms | Response-text field was not captured; model metadata identified `@cf/google/gemma-4-26b-a4b-it-external` | 70 prompt + 16 completion tokens; **1.0727272033691406 neurons** |
| Relevant — pass 2 | Same relevant fixture | `200`, `success: true`, 1,554 ms | `Simplest possible discrete` repeated; not an interpretable decision | 79 prompt + 16 completion tokens; **1.1545454263687134 neurons** |
| Irrelevant — pass 2 | Same irrelevant fixture | `200`, `success: true`, 33,731 ms | `(O si la pregunta es...)` repeated; not an interpretable decision | 70 prompt + 16 completion tokens; **1.0727272033691406 neurons** |

Observed response usage across the four calls totals approximately **4.4545452595
neurons**. Dashboard before/after values were not captured, so this is API-returned
usage rather than an account-dashboard quota measurement. No paid-plan upgrade,
AI Gateway credit, or billing action was requested or performed.

## Corrected provider-SDK vision test

Cloudflare's official `workers-ai-provider` README documents vision messages as a
text part plus an image part and says that format works with REST credentials. A
temporary, `--no-save` installation was made in an operating-system temporary
directory; no package was added to this repository. The current SDK recommends a
`file` image part with an `image/*` media type, so that form was used with
`temperature: 0` and `maxOutputTokens: 512`.

| Case | Provider-SDK result | Interpretable decision | Usage returned by SDK |
| --- | --- | --- | --- |
| Relevant | `success: true`, 10,771 ms | `APPROVED` — the response identified the plastic bottle and yellow recycling container as coherent with the description | 347 input + 492 output = 839 total tokens |
| Irrelevant | `success: true`, 8,487 ms | `REJECTED` — the response identified potted plants as unrelated to recycling evidence | 344 input + 402 output = 746 total tokens |

Both responses contained a JSON object enclosed in Markdown code fences. The
decision/reason content is interpretable and differentiated as required for the
spike, but the response is **not strict JSON as requested**. A future T06 adapter
must validate the external response and treat malformed/unexpected formats as a
technical failure; it must not approve by default.

## Documented provider facts (not account-specific verification)

- Cloudflare lists `@cf/google/gemma-4-26b-a4b-it` as Cloudflare-hosted and
  vision-capable. Its REST endpoint is
  `POST /client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/google/gemma-4-26b-a4b-it`;
  Cloudflare requires an Account ID and an API token. [Model documentation](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [REST API documentation](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- Workers Free includes 10,000 neurons/day. Limits reset at 00:00 UTC; when a
  limit is exceeded, later operations fail. Moving above that allocation requires
  Workers Paid, which is out of scope. Usage is observable in the Workers AI
  dashboard. [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- Cloudflare describes prompts and images as Customer Content, says it does not
  use that content to train or improve services without explicit consent, and
  notes that model licenses remain the customer's responsibility. This does not
  replace the team’s privacy/legal review for a public Spanish beta. [Cloudflare data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- Google's Gemma terms apply to hosted use and require compliance with the terms;
  no account-specific licence acceptance or territory determination was observed
  during this blocked spike. [Gemma terms](https://ai.google.dev/gemma/terms/)

## Technical blockers and required rerun

1. **Native raw REST format remains unverified:** direct guessed REST formats
   yielded unusable `200` responses or `400`. The official provider SDK is the
   verified technical route for the later adapter; do not hand-roll an equivalent
   raw payload without an official schema or fresh proof.
2. **Strict-format caveat:** the SDK results wrapped otherwise valid decision JSON
   in code fences. T06 needs a bounded parser/validator and must fail closed on
   anything outside its accepted response contract.
3. **Quota evidence is incomplete:** the direct responses expose per-call neuron usage,
   but dashboard usage before/after and enforced-limit (`429` or equivalent)
   evidence have not been captured. Do not intentionally exhaust the Free quota.
4. **Licence/territory review remains human/legal work:** documentation was
   reviewed, but this spike cannot certify legal suitability for a public Spanish
   beta.
5. Do not claim an approval decision beyond this fixture evidence. T06 must use
   server-held credentials, validate output, and fail closed on provider failure.

## Human reviewer record

**Reviewer:** Santi  
**Date:** 2026-10-10  
**Scope:** Cloudflare Free-plan and quota observation for this technical spike.

The reviewer reported that the account used for this spike is on **Workers Free**.
The Workers AI dashboard showed **48.38 / 10,000 neurons used today**. This is
within the documented daily Free allocation and is consistent with the recorded
test activity. No Workers Paid upgrade was enabled for this spike.

This record accepts the technical provider evidence for continued development;
it is not a legal-compliance certification, territory determination, or approval
to launch a public beta. The privacy, licence, retention, notice, removal, and
other release-checklist gates remain subject to the designated human release
decision.

## Conclusion

**T02.1 is DONE.** The official provider SDK processed both approved images with
differentiated, interpretable results on the team account without paid billing.
The parent T02 remains a public-release **NO-GO** until human licence/privacy
review and the remaining release gates are closed. T02.2 was not started.

