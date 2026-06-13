# KDP Hardback/Hardcover Upload Master Workflow — FINAL SUCCESS

Status: finalized after successful live hardcover submission on 2026-06-05
Scope: hardcover / hardback upload only, after Kindle eBook and paperback are already submitted successfully.

Canonical companion workflows:
- Kindle eBook: /Users/clawd/workspace/kdp_queue/KDP_EBOOK_UPLOAD_MASTER_WORKFLOW_FINAL_SUCCESS.md
- Paperback: /Users/clawd/workspace/kdp_queue/KDP_PAPERBACK_UPLOAD_MASTER_WORKFLOW_FINAL_SUCCESS.md
- Hardback/Hardcover: this file

Per-title artifact system:
- /Users/clawd/workspace/kdp_queue/_SYSTEM/TITLE_ARTIFACT_MANAGER.md
- Each title folder contains title_manifest.json
- Use per-title artifacts only. Do not global-search duplicate filenames.

Golden training title:
- You Can Change Your World By Speaking To It
- Author: Noah Peterson
- Result: Kindle eBook, paperback, and hardcover all submitted successfully.

---

## 0. Non-negotiable operating rules

1. Hardcover is third in the KDP sequence:
   - Kindle eBook first
   - Paperback second
   - Hardcover / hardback third

1a. Artifact hydration is mandatory before any Hardcover/Hardback `Draft` or `Continue setup` work:
   - Verify the exact local title folder exists under `/Users/clawd/workspace/kdp_queue/<title-slug>/`.
   - Verify the folder contains the current title artifacts: `metadata.json`, `kdp_content.docx`, `manuscript_6x9.docx`, `cover.png`, `cover.jpg`, and any required hardcover-specific assets under `02_upload_assets/hardcover/`.
   - If any artifact is missing, stale, null in the manifest, or invalid, go to `https://scripturemadesimple.replit.app/my-studies`, scroll/find the exact book title, and populate/refresh the local title folder with all current artifacts from that My Study Guides entry before touching KDP upload controls.
   - Do not use Desktop/Downloads/global search as a substitute for the title folder. Duplicate filenames are expected across titles; the active folder must be authoritative.
   - Only after this artifact hydration/preflight gate passes may this Hardcover/Hardback master workflow begin or resume.

2. Stay on the active KDP upload tab.
   - Do not open new Chrome tabs unless the user explicitly instructs it or it is absolutely necessary.
   - Do not switch to the `My Study Guides` tab during live KDP upload work.
   - If tab focus drifts, stop and re-verify the active KDP upload tab before clicking anything.

3. **NEVER open a new Chrome session. EVER.** Use ONLY the existing logged-in Google Chrome session (typically PID 1345). Do NOT launch Chrome with --remote-debugging-port, do NOT create a new Chrome profile, do NOT open a new Chrome window. If cua-driver cannot find the existing Chrome window, use `cua-driver call list_apps` and `cua-driver call list_windows` to locate it — do NOT start a new one.

3a. **Vision-verified paste gate (non-negotiable):** After EVERY text paste operation (title, subtitle, author, description, series, back-cover text boxes, Cover Creator text, price, etc.), take a vision/screenshot capture of the affected KDP form area and confirm the EXACT expected text is visibly rendered in the target field before advancing to the next field or clicking Save/Continue. Do NOT rely on clipboard success, AX `set_value` return code, or tool `ok` alone — only a vision snapshot proving the text is visibly in the correct KDP form field counts as verification. If the snapshot shows the text is missing, went into the wrong field, or landed in the wrong window/app, stop, re-focus the KDP tab, clear the field, re-paste, and re-verify before continuing.
3b. **CHROME-ONLY PASTE RULE (CRITICAL - DO NOT VIOLATE):** ALL text paste operations MUST target the Google Chrome KDP window exclusively. The correct paste method is:
   a. Use `cua-driver call click '{"pid": <CHROME_PID>, "window_id": <KDP_WINDOW_ID>, "element_index": <TARGET_FIELD>}'` to focus the target field inside Chrome.
   b. Then activate Chrome explicitly: `osascript -e 'tell application "Google Chrome" to activate'`.
   c. Wait 0.5 seconds for Chrome to gain focus.
   d. Then send the paste: `osascript -e 'tell application "Google Chrome" to keystroke "v" using command down'`.
   e. **DO NOT** use `tell application "System Events" to keystroke "v"` — that sends the paste to whatever app has focus, which may NOT be Chrome. Always qualify with `tell application "Google Chrome"`.
   f. After pasting, verify with a vision/screenshot that the text appeared in the correct Chrome KDP field, not in this terminal or any other app.

4. Use Mac UI automation for KDP browser steps.
   - Preferred: CUA / computer_use / direct cua-driver against the visible Chrome/KDP window.
   - Capture -> act -> verify after every material action.
   - Browser-tool automation is not the primary method for KDP UI upload steps.

4. Never claim a click/action succeeded unless verified by screenshot or page state.

5. Hardcover assets must come from the active title folder / manifest.
   - Do not use same-named files from another title.
   - If the file picker opens in a prior title folder, navigate back to the active title folder before selecting a file.

6. Preserve KDP carried-over details unless a visible KDP validation error or the user says otherwise.

7. For all Scripture Made Simple / Reflective Reader study-guide titles:
   - Author is Noah Peterson.
   - Standard subtitle uses ampersand:
     `An Independent Companion Study Guide & Spiritual Formation Workbook`

8. Yellow-outlined and red-lined KDP instruction/error boxes are mandatory:
   - Whenever KDP shows a yellow-outlined instruction/warning box, read the text inside the yellow-lined box before continuing.
   - Do exactly what the yellow-lined box instructs, unless it conflicts with an explicit user instruction or safety rule.
   - If the yellow-lined box contains a checkbox, always click/check that checkbox.
   - If a yellow-lined box says the book must be previewed/reviewed/approved before continuing, click `Launch Previewer`, visually inspect the hardcover preview for correct formatting, and click `Approve` only after the visual check passes.
   - Do not ignore yellow-lined boxes and do not click Save/Continue/Publish past them until their instruction is satisfied.
   - Whenever KDP shows a red-lined box with text inside, treat it as a critical error/problem that must be corrected before continuing.
   - Read and record the exact red-box text, then go back to the affected section named by the red box and retry/fix that upload/entry area, such as manuscript/interior upload or Cover Creator/cover processing.
   - Do not proceed to preview, Save and Continue, pricing, or publish while any red-lined error box remains visible.
   - If KDP displays a modal such as `There was an error processing your files`, click its `Continue` button, then scroll and inspect all red-lined boxes to determine which sections must be redone.

## Dedicated KDP cron swarm boundary

This master workflow is executed by the dedicated KDP cron swarm only. Normal user conversation, planning, and SOP editing are handled by Cleo in the main chat; Cleo does not perform the recurring cron upload work. The cron upload work is owned by `KDP_ORCHESTRATOR`, which wakes inside the KDP executor job and calls specialist agents only when needed.

All swarm agents must follow `/Users/clawd/workspace/kdp_queue/_SYSTEM/KDP_SWARM_AGENT_ARCHITECTURE.md` plus this format-specific master file. The architecture file defines the idle specialist roles, model/cost routing, handoff packets, and verification contract. If that architecture file and this master file appear to conflict, fail closed and ask Cleo/user to update the SOP before acting.

Swarm invariants for this file:
1. Agents in this swarm are KDP-cron-only and must not handle unrelated discussion.
2. Specialist agents sit idle until `KDP_ORCHESTRATOR` gives them a bounded task.
3. Specialists perform only the assigned task; they do not advance into another phase or format.
4. Cheap/local/free agents may handle deterministic parsing, checklist comparison, and readback verification, but they may not make ambiguous UI judgments or publish decisions.
5. The premium/default orchestrator remains responsible for final live KDP judgment, ambiguous recovery, and publish/submit authorization.
6. Every browser action requires capture -> act -> verify; no success is claimed from tool success alone.

Hardcover-specific agents called by `KDP_ORCHESTRATOR`:

### KDP_HARDCOVER_SOURCE_PARSER_AGENT
- Preferred model tier: local Qwen / deterministic Python first; OpenRouter free model for second-pass consistency review if needed.
- Tool scope: file + terminal only.
- Reads same-title artifacts and extracts hardcover details, back-cover Series Summary, back-cover center description, manuscript path, PNG/JPG cover paths, AI answers, and hardcover price `19.999`.
- Cannot operate KDP UI.

### KDP_HARDCOVER_DETAILS_AGENT
- Performs Hardcover Details only.
- Verifies carried-over title/subtitle/author/description/categories/keywords, repairs only if visible KDP validation requires it, and preserves author `Noah Peterson`.
- Stops after Details Save-and-Continue is verified to reach Hardcover Content.

### KDP_HARDCOVER_CONTENT_COVER_AGENT
- Performs Hardcover Content and Cover Creator only.
- Uploads/scopes manuscript, launches Cover Creator, selects the true keyboard-view top-left design, corrects back-cover JPG/image slot and exact text boxes, checks front-cover red-boundary centering, verifies spine title/author fit, handles yellow/red boxes, and completes AI-generated-content fields exactly.
- Stops after Cover Creator `Save & Submit` and Content-page cover/manuscript/AI state are verified.

### KDP_HARDCOVER_PREVIEW_AGENT
- Performs Hardcover Print Previewer review only.
- Uses Thumbnail View, inspects KDP-flagged pages and issue pages, applies the TOC-warning rule, refreshes/retries if preview generation spins about 5 minutes, and clicks `Approve` only after visual review passes.
- Stops after KDP returns from previewer to Hardcover Content with proof approved.

### KDP_HARDCOVER_PRICING_AGENT
- Performs Hardcover Rights & Pricing only.
- Verifies All territories, Amazon.com marketplace, exact `19.999` primary price committed in the KDP tab, marketplace validation warnings cleared, Expanded Distribution/Amazon marketplace options, and the Amazon checkbox gate.
- Cannot click `Publish Your Hardcover Book` until KDP_VERIFIER_AGENT passes every pricing gate and KDP_ORCHESTRATOR explicitly authorizes the final click.

### KDP_HARDCOVER_VERIFIER_AGENT
- Readback-only. Uses cheap/free/local models for simple comparisons, escalates to premium on ambiguity.
- Verifies screenshots/AX/text for Details, Content/Cover Creator, Previewer, Pricing, final submission/Done state, title, author, and evidence files.
- Cannot perform Save/Continue/Publish/Done clicks.

---

## 1. Start condition

Begin hardcover only after confirming the same title has:
- Kindle eBook submitted successfully
- Paperback submitted successfully

Start from the Bookshelf row for the same title.

If an in-progress hardcover exists:
- Use the same-title Bookshelf row.
- Click the hardcover `Continue setup` / manage option for that same title.

If hardcover has not been created:
- On the same-title Bookshelf row, use the hardcover column/action.
- Click `+ Create hardcover` for that exact title.

Verify after entry:
- URL/page is KDP Hardcover Details or Hardcover Content.
- Title matches the active title.
- Author is Noah Peterson.
- Progress tracker shows Hardcover Details -> Hardcover Content -> Hardcover Rights & Pricing.

---

## 2. Hardcover Details page

Hardcover Details are usually copied from the already-completed paperback/eBook.

Verify, but normally do not edit:
- Language: English
- Book Title: active title
- Subtitle: `An Independent Companion Study Guide & Spiritual Formation Workbook`
- Series Title: usually `The Reflective Reader` when applicable
- Author: Noah Peterson
- Publishing Rights: `I own the copyright and I hold necessary publishing rights`
- Primary Audience sexually explicit prompt: No
- Categories: carried over from paperback/eBook
- Keywords: all 7 keyword boxes populated

Important:
- Do not touch Primary Audience reading-age fields unless the user or source video explicitly instructs it.
- If KDP shows no validation errors and carried-over details are correct, click bottom `Save and Continue`.

Verify navigation to Hardcover Content.

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 1 GATE: VERIFY ALL HARDCOVER DETAILS BEFORE TRANSITION
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PAGE 1 COMPLETE VERIFICATION (MANDATORY):** Before clicking Save and Continue to leave Hardcover Details, the agent MUST:

1. Take a full-page screenshot of the Hardcover Details form.
2. Visually verify ALL carried-over fields are correct:
   - [ ] Title, Subtitle, Author, Description match source
   - [ ] Series is completed (NOT skipped)
   - [ ] Categories = exactly 3, correct labels
   - [ ] No red error boxes visible
3. ONLY if ALL items pass, click Save and Continue to proceed to Page 2 (Hardcover Content).

---

## 3. Hardcover Content — ISBN and print options

### ISBN

1. In the ISBN section, choose the free KDP ISBN option.
2. Click `Assign ISBN`.
3. If KDP opens a confirmation modal, click its `Assign ISBN` button.
4. Verify KDP displays an assigned ISBN.

### Print Options

Leave defaults unchanged unless user instructs otherwise:
- Interior & paper type: Black & white interior with white paper
- Trim size: 6 x 9 in
- Bleed settings: No Bleed
- Cover finish: Matte

Training rule:
- After free KDP ISBN is assigned, leave print options unchanged unless explicitly instructed.

---

## 4. Hardcover manuscript upload

Use the active title’s hardcover manuscript:

`<title-folder>/02_upload_assets/hardcover/manuscript_6x9.docx`

Steps:
1. Click `Upload manuscript`.
2. If the file picker opens in the wrong folder, do not select anything there.
3. Navigate to the active title folder.
4. Open `02_upload_assets/hardcover`.
5. Select `manuscript_6x9.docx`.
6. Verify KDP says:
   `Manuscript "manuscript_6x9.docx" uploaded successfully!`

If the file picker remains open after KDP shows success:
- Cancel/close the picker without selecting a second file.
- Verify the KDP upload success message remains visible.

---

## 5. Hardcover Cover Creator — asset selection

Use the active title’s hardcover cover files:
- PNG for initial Cover Creator upload:
  `<title-folder>/02_upload_assets/hardcover/cover.png`
- JPG for the small back-cover image slot:
  `<title-folder>/02_upload_assets/hardcover/cover.jpg`

Steps:
1. In Book Cover, choose Cover Creator / launch Cover Creator.
2. Upload the active-title hardcover `cover.png` if prompted.
3. Proceed to the Cover Creator design gallery.

---

## 6. Cover Creator design selection — CRITICAL

Always choose the true TOP-LEFT design thumbnail.

Definition:
- `Top-left` means the first thumbnail at the upper-left of the Cover Creator design grid as viewed by a human sitting at the keyboard looking at the monitor.
- Do not choose the currently highlighted/hovered thumbnail if it is not the true first top-left design.
- Do not choose the top-right or top-middle design.

CUA coordinate pitfall learned in training:
- Direct cua-driver coordinates can be window-relative, not full-screen absolute.
- In the observed Chrome window, the true top-left thumbnail was around window-relative x≈137, y≈300-330.
- Using full-screen-looking coordinates like x≈610,y≈330 clicked the visually top-right thumbnail and was wrong.

Correct selected workspace must show:
- Full wrap layout
- Back cover on left
- Spine in middle
- Front cover on right

If the wrong design is selected:
1. Click `Start Over`.
2. Confirm OK if prompted.
3. Return to the design grid.
4. Deliberately target the true top-left design’s `Choose this design` overlay/button.
5. Verify the workspace matches the correct full-wrap layout before continuing.

---

## 7. Cover Creator back-cover image slot

After selecting the true top-left design:
1. On the back cover, locate the small top-left image slot.
2. Upload/place the active-title hardcover `cover.jpg` into that small image slot.
3. Verify the JPG thumbnail appears in the top-left back-cover image slot.
4. Do not repeatedly re-upload/replace it once verified.

---

## 8. Cover Creator back-cover text sources

Use exact text from the active title’s `kdp_content.docx`.

Required sections:
- `Series Summary (Back Cover - Top Right)`
- `Back Cover Description (Center - 2-3 paragraphs)`

Do not include:
- Section headings
- Character-count lines
- Placeholder/lorem text
- Text from any other section
- Combined Series Summary + Description in one box

### Placement rules

1. Top-right back-cover text box:
   - Contains ONLY the `Series Summary (Back Cover - Top Right)` body text.
   - This is the text box to the right of the small JPG image.
   - It is higher and farther right than the large center/body text box.

2. Middle/center back-cover text box:
   - Contains ONLY the `Back Cover Description (Center - 2-3 paragraphs)` body text.
   - It must not contain Series Summary text.
   - It must not contain headings, character counts, placeholders, or duplicated text.

### If a text box becomes polluted

Do not keep appending.

Recovery:
1. Click inside the specific polluted text box.
2. Enter text edit mode.
3. Select all text within that text box only.
4. Delete it.
5. Visually verify the box is empty.
6. Paste only the correct body text for that box.

If keyboard paste fails:
- Right-click inside the target text box and use the context menu `Paste` while the mouse is inside that exact box.
- If needed, use direct CUA typing only after the target box is empty and focused.

If the Cover Creator state becomes unreliable:
- Start Over is permitted.
- Redo from the true top-left design and re-place/re-paste all required cover content.

---

## 9. Cover Creator front cover and spine checks

Before preview/save:
1. Verify the front cover title, subtitle, and bottom tagline are visually centered.
2. Verify back-cover text blocks are centered/aligned within their boxes.
3. Verify spine title/author are centered within the red dotted spine guide and not cut off.
4. Use micro-movements only when adjusting text against red guides.
5. If spine text is too large or clipped, reduce font size / use Auto Fit as needed, then verify again.
6. Do not proceed until the cover looks centered and no text appears clipped.

Training-specific reminder:
- Do not interact with another Chrome tab while adjusting Cover Creator text or previewing.

---

## 10. Cover Creator preview, approve, save/submit

After all cover content is verified:
1. Click the `Preview` button at the bottom of the Cover Creator page.
2. Wait for preview to load.
3. Re-check visual centering/formatting in preview.
4. Click `Save & Submit` in Cover Creator if the preview looks correct.
5. Return to KDP Hardcover Content.
6. In Book Preview, click `Launch Previewer`.
7. In Print Previewer, review formatting/quality issues.
8. If formatting is acceptable, click `Approve`.
9. Verify return to the Hardcover Content page.

Known Print Previewer note from successful training:
- KDP may show a quality note such as non-printable markup removed from document, often on the Table of Contents page.
- If KDP flags the Table of Contents but the Table of Contents is visible, readable, and inside the safe margins, ignore that flag after visual review.
- Review the preview visually; if the book looks correct and no blocking issue is present, approve.

---

## 11. AI-Generated Content section on Hardcover Content

Complete this section before saving Hardcover Content.

Use these values:
1. AI-Generated Content: `Yes`
2. Texts dropdown: `Entire work, with extensive editing`
3. Tool textbox under the question about which tools were used for AI-generated texts:
   `custom ai`
4. Images dropdown: `None`
5. Translations dropdown: `None`

Important:
- Put `custom ai` inside the KDP upload page textbox under the AI tools question.
- Do not type it into the terminal or another application.
- Verify it is visibly inside the KDP page textbox.

---

## 12. Hardcover Content final save

After manuscript, cover, previewer approval, and AI-generated content are complete:
1. Scroll to the bottom of Hardcover Content.
2. Click bottom `Save and Continue`.
3. Verify navigation to Hardcover Rights & Pricing.

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 2 GATE: VERIFY ALL HARDCOVER CONTENT BEFORE TRANSITION
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PAGE 2 COMPLETE VERIFICATION (MANDATORY):** Before clicking Save and Continue to leave Hardcover Content, the agent MUST:

1. Take a full-page screenshot of the Hardcover Content page.
2. Visually verify ALL of these are complete:
   - [ ] ISBN assigned (if free KDP ISBN path)
   - [ ] Print Options left as default
   - [ ] Manuscript 6x9 uploaded successfully
   - [ ] Cover Creator = Save & Submit completed
   - [ ] Front cover text centered within red boundary lines
   - [ ] Spine text fits and is not clipped
   - [ ] Back-cover text correct (Series Summary + Description)
   - [ ] AI-Generated Content = Yes, Entire work, Images=None, Translations=None
   - [ ] AI Tool = "custom AI"
   - [ ] No red error boxes visible
3. ONLY if ALL items pass, click Save and Continue to proceed to Page 3 (Hardcover Pricing).

---

## 13. Hardcover Rights & Pricing

### Territories

Use all territories/worldwide rights unless the user instructs otherwise.

### Primary marketplace

Usually Amazon.com is the primary marketplace.

### Pricing

Training price target:
- Price hardback at `19.999` on Amazon.com.
- Use `19.999` by default instead of `19.99` to avoid other-country marketplace validation errors.

Observed KDP behavior:
- Entering `19.99` on Amazon.com auto-converts other marketplace prices.
- Some converted non-primary marketplace boxes may show red validation errors.
- If visible converted marketplace prices show red error boxes / `Please enter a price`, use the correction below.

Correction used successfully:
1. Set the active Amazon.com price field to `19.999`.
2. KDP may display this rounded as `$20.00 USD`.
3. Verify visible red pricing errors clear and royalties populate.

After pricing clears:
- REQUIRED: click/check the checkbox next to `Amazon` in the pricing/royalty/distribution column if the live page shows an enabled Amazon checkbox. This box allows Amazon marketplace distribution/sales coverage; do not skip it.
- If the Amazon checkbox is disabled, capture/verify that disabled state before proceeding.
- Verify the Amazon checkbox is checked or verified-disabled, no visible red pricing validation errors remain, and royalties populate before publishing.

Do not publish while red validation errors are visible or while an enabled Amazon checkbox remains unchecked.

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 3 GATE: FINAL VERIFICATION BEFORE HARDCOVER PUBLISH
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**FINAL VERIFICATION BEFORE HARDCOVER PUBLISH (MANDATORY):** Before clicking "Publish Your Hardcover Book", the agent MUST:

1. Take a full-page screenshot of the Hardcover Rights & Pricing page.
2. Visually verify ALL of these:
   - [ ] All territories = selected
   - [ ] Amazon.com = primary marketplace
   - [ ] Price = $19.999 USD (Amazon.com row shows 19.999)
   - [ ] Expanded Distribution = enabled if available
   - [ ] Amazon checkbox = checked (or disabled)
   - [ ] No red price warnings visible
   - [ ] "Publish Your Hardcover Book" button visible and enabled
3. ONLY if ALL items pass, click "Publish Your Hardcover Book".
4. **VISION VERIFY** the confirmation page shows:
   - "Your hardcover has been submitted"
   - Correct title
   - "By Noah Peterson"

---

## 14. Publish hardcover

At the bottom of Hardcover Rights & Pricing:
1. Review Terms & Conditions section.
2. Do not request a book proof unless the user instructs it.
3. Click `Publish Your Hardcover Book`.
4. Wait for the confirmation modal.
5. Verify modal says the hardcover has been submitted.
6. Click `Done` at the bottom of the modal.
7. Verify the Bookshelf page is visible again.

Successful confirmation text observed:
- `Your hardcover has been submitted`
- KDP explains the book will be checked against KDP guidelines and can take up to 72 hours before appearing on Amazon.

---

## 15. Final success criteria

Hardcover upload is complete only when all are true:
- Hardcover Details completed.
- Hardcover Content completed.
- Free KDP ISBN assigned.
- Hardcover manuscript uploaded successfully.
- Cover Creator completed with correct top-left design.
- Back-cover JPG, Series Summary, and Back Cover Description placed correctly.
- Cover preview/save/submit completed.
- Print Previewer launched, reviewed, and approved.
- AI-Generated Content section completed:
  - Yes
  - Texts: Entire work, with extensive editing
  - Tool: custom ai
  - Images: None
  - Translations: None
- Hardcover Rights & Pricing completed.
- Hardcover price set/validated.
- `Publish Your Hardcover Book` clicked.
- KDP confirmation modal says hardcover submitted.
- `Done` clicked and Bookshelf visible.

---

## 16. Common failures and fixes

### Wrong Chrome tab

Failure:
- Assistant opens/switches to a new KDP tab or `My Study Guides` tab.

Fix:
- Stop immediately.
- Return to the active KDP upload tab only after the user restores it.
- Do not proceed until the correct tab/page is verified.

### Wrong Cover Creator design

Failure:
- Top-right/top-middle thumbnail selected instead of the true top-left thumbnail.

Fix:
- Start Over -> confirm -> design grid -> choose true top-left thumbnail -> verify full wrap layout.

### Text pasted into wrong back-cover box

Failure:
- Series Summary is pasted into the center/body box.
- Back Cover Description is combined with Series Summary.

Fix:
- Clear the specific polluted text box fully.
- Visually verify empty.
- Paste only the correct body text into the correct box.

### Paste does not work in Cover Creator

Fix order:
1. Ensure target text box is focused and empty.
2. Try clipboard paste.
3. If it fails, right-click inside the target box and choose Paste.
4. If still failing, use direct CUA typing into the focused empty box.

### Pricing red errors

Failure:
- Converted marketplace prices show red outlines / `Please enter a price`.

Fix:
- Set Amazon.com price to `19.99999`.
- Verify red errors clear.
- KDP may display rounded price as `$20.00 USD`.

---

## 17. Future-title checklist

For each future hardcover title:
1. Confirm Kindle submitted.
2. Confirm paperback submitted.
3. Locate same-title Bookshelf row.
4. Create/resume hardcover.
5. Verify Details; Save and Continue.
6. Assign free KDP ISBN.
7. Leave print options unchanged.
8. Upload active-title hardcover manuscript.
9. Launch Cover Creator.
10. Upload active-title cover PNG.
11. Choose true top-left design.
12. Place active-title cover JPG in top-left back-cover image slot.
13. Paste Series Summary only into top-right back-cover text box.
14. Paste Back Cover Description only into middle/center back-cover text box.
15. Center front/back/spine text; fix clipping.
16. Preview and Save & Submit cover.
17. Launch Print Previewer; review and Approve.
18. Complete AI-Generated Content:
    - Yes
    - Texts: Entire work, with extensive editing
    - Tool: custom ai
    - Images: None
    - Translations: None
19. Save and Continue to Rights & Pricing.
20. Set hardback price to 19.999 and verify validation clears.
21. Click Amazon checkbox if required/visible.
22. Publish hardcover.
23. Click Done on submitted modal.
24. Verify Bookshelf visible and hardcover submitted/in review.
