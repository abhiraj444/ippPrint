# Build Spec: Native IPP Printer Proof-of-Concept

**Goal (one sentence):** prove that a printer physically connected to a laptop can be added on an Android phone using Android's built-in "Add printer by IP/address" flow (Default Print Service, IPP protocol) — reachable over the internet, not just the local Wi-Fi — with the user able to choose which of their laptop's printers gets exposed and under what public name.

This builds on top of the existing tunnel infrastructure (`relay-worker/` Cloudflare Worker + Durable Object, `laptop-agent/` Node agent) already specified in `Laptop_Tunnel_Service_Build_Spec.md`. **Read that document first — this spec assumes it is already built and working (the WebSocket tunnel, registration, and generic request/response forwarding).** This spec only adds the IPP layer on top.

## 1. Background: what Android actually needs (confirmed, not assumed)

Android's built-in Default Print Service (Mopria-based, present on Android 8+) supports adding a printer manually by entering an IPP URL directly in the printer picker — not just automatic discovery. The path is: **Share → Print → printer picker → Add printer → enter `ipps://<host>/<path>`**. This is a native OS feature; no companion app is required for this proof-of-concept.

**What this means technically:** the phone will send raw HTTP POST requests with `Content-Type: application/ipp` (a binary-encoded body) to whatever URL is entered. Our job is to make something at that URL respond the way a real printer would.

## 2. Architecture addition

```
Android "Add Printer" → ipps://relay-worker.your-subdomain.workers.dev/printers/{printerSlug}
                                    |
                          Cloudflare Worker: parses/builds minimal IPP responses directly,
                          OR forwards the raw IPP request to the laptop over the existing tunnel
                          (reuse the existing generic request/response protocol — do NOT invent
                          a new message type; an IPP request is just an HTTP POST with a binary
                          body, which the existing "request"/"response" tunnel messages already
                          carry via the base64 `body` field)
                                    |
                          Laptop Agent: runs a real embedded IPP server library against the
                          actual local printer, OR (simpler for this PoC) the agent itself
                          parses just the handful of operations below and replies without a
                          full IPP library
                                    |
                          Real printer via CUPS (`lp`) / Windows Spooler
```

Decide up front which side implements the IPP protocol parsing: **do it in `laptop-agent`, not in the Cloudflare Worker.** Reasons: (1) the Worker should stay a dumb byte-relay, consistent with its existing role, (2) printer enumeration (Section 4) has to happen on the laptop anyway, so keeping all printer-aware logic in one place avoids splitting state across two codebases.

## 3. IPP operations to implement (minimum viable set — implement exactly these, nothing more)

IPP requests are identified by a 2-byte operation ID in the request header. For a working "Add Printer" + "print one test page" flow, the agent's IPP handler must correctly respond to:

| Operation | ID | What it must return |
|---|---|---|
| `Get-Printer-Attributes` | 0x000B | The printer's name, state (`idle`/`processing`/`stopped`), supported formats (at minimum `application/pdf`), and supported operations. Android calls this immediately after the user enters the URL, to confirm something real is there and show its name/status in the UI. |
| `Validate-Job` | 0x0004 | A success response confirming the job attributes (paper size, format) are acceptable. Android/apps call this before actually sending the file, as a pre-flight check. |
| `Print-Job` | 0x0002 | Accept the attached document bytes, return a `job-id` and `job-state: completed` (or `processing`), then actually submit the file to the real printer via `lp`/PowerShell (reuse the print handler already built in `laptop-agent` per the base tunnel spec). |
| `Get-Jobs` / `Get-Job-Attributes` | 0x000A / 0x0009 | Return the state of a previously submitted job. Needed because some print flows poll this after submitting. A minimal always-return-"completed" implementation is acceptable for this proof-of-concept. |
| `Cancel-Job` | 0x0008 | Accept and acknowledge (a no-op is acceptable for the proof-of-concept — don't need to actually interrupt a real print job). |

Use an existing IPP server library rather than hand-rolling the binary encoding — this cuts implementation risk substantially. For Node.js, use an npm IPP server library if one is actively maintained at build time; if none is suitable, implement only the binary attribute-encoding needed for the five operations above (IPP's encoding is a well-documented, simple TLV-style format — do not attempt to implement the full IPP/2.0 spec, only these five operations).

## 4. Printer selection feature (the part you specifically asked for)

The laptop agent must let the user choose which locally-connected printer is exposed, and under what public name.

1. **Enumerate local printers** on agent startup and on-demand:
   - macOS/Linux: run `lpstat -p` (parse the printer names from CUPS)
   - Windows: run PowerShell `Get-Printer | Select Name` (parse printer names)
2. **Config file** `laptop-agent/printers.json`, created interactively on first run (a simple CLI prompt: "Here are the printers found on this machine: [list]. Which would you like to expose, and what public name should it have?"):
   ```json
   {
     "exposed": [
       { "localName": "HP_LaserJet_M1132", "publicSlug": "home-printer", "displayName": "Abhinav's Home Printer" }
     ]
   }
   ```
3. The IPP endpoint path includes the slug: `ipps://relay-worker.your-subdomain.workers.dev/printers/home-printer`. The agent's `Get-Printer-Attributes` response must use `displayName` for the printer's shown name, and its `Print-Job` handler must resolve `home-printer` back to the real local printer name `HP_LaserJet_M1132` before shelling out to `lp -d`.
4. Support multiple printers in the same config file — each gets its own slug/URL, all sharing the one tunnel connection (they're just different `path` values on the same generic request/response protocol from the base spec).
5. Add a `GET /printers/` listing endpoint on the relay (forwarded to the agent the same way `/devices/:id/status` already works) purely for the user's own reference — not required by Android's flow, just useful for the user to see "what did I expose and at what URL" without digging through `printers.json`.

## 5. TLS requirement

Android's `ipps://` scheme requires a valid, trusted TLS certificate (self-signed certs will typically be rejected without extra device-side trust configuration, which we should not require for this proof-of-concept). Since the endpoint is served through Cloudflare's own `*.workers.dev` domain, this is already satisfied automatically — do not attempt to set up a certificate on the laptop agent itself; the laptop never terminates TLS directly, Cloudflare does.

## 6. Verification steps (do these exactly, in order — this is how "it works" gets proven)

1. Start `laptop-agent`, run through the first-run printer selection prompt, confirm `printers.json` is written correctly.
2. Confirm `wrangler tail` shows the agent registered and the printer slug is known to the Worker.
3. From a desktop browser, `curl -X POST https://relay-worker.your-subdomain.workers.dev/printers/home-printer -H "Content-Type: application/ipp" --data-binary @get-printer-attributes-test.bin` (a pre-built minimal `Get-Printer-Attributes` request byte sequence) and confirm a well-formed IPP response comes back, not an HTTP error.
4. On an Android phone (on any network — mobile data included, to prove this genuinely isn't local-network-only): open any app → Share → Print → tap the printer picker → **Add printer** → enter `ipps://relay-worker.your-subdomain.workers.dev/printers/home-printer` → confirm the phone shows the printer's display name and an "idle"/ready status, not an error.
5. Print an actual one-page test document from the phone through that added printer entry and confirm it physically prints on the laptop's connected printer.
6. Repeat step 4 with the phone on Wi-Fi in a different location entirely (e.g. a friend's house or mobile hotspot) to confirm it isn't accidentally only working because both devices happened to be on the same network.

## 7. Explicit non-goals for this proof-of-concept

- No automatic discovery (mDNS/Bonjour-style "nearby printers" listing) — this PoC is specifically about the **manual "Add by address"** path, which is the only mechanism that can work across the internet rather than just the local network.
- No iOS support in this pass (iOS also supports manual IPP add-by-address in a similar way, but verify Android first since that's what was asked).
- No print queue management UI, no job history, no multi-user access control — a single owner testing against their own printer.
- No attempt to support every IPP attribute/operation — only the five in Section 3, which is the minimum Android's flow actually exercises.

## 8. Deliverable checklist

- [ ] `laptop-agent` can enumerate local printers and write a `printers.json` mapping local names to public slugs/display names.
- [ ] The five IPP operations in Section 3 are implemented and respond correctly to raw test byte sequences (step 6.3).
- [ ] An Android phone, on mobile data, can complete "Add Printer" using the `ipps://` URL and see the printer listed as ready.
- [ ] A real test page physically prints as a result of that Android print flow.
- [ ] The whole path still uses only free-tier infrastructure (Cloudflare Workers Free plan) — no new paid service introduced for this feature.
