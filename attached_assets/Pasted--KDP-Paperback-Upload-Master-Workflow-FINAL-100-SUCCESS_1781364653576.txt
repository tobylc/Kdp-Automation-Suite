# KDP Paperback Upload Master Workflow — FINAL 100% SUCCESS

Recorded: 2026-06-05
Validated live title: You Can Change Your World By Speaking To It
KDP result observed: `Your paperback has been submitted`
Canonical prerequisite Kindle workflow, context only:
/Users/clawd/workspace/kdp_queue/KDP_EBOOK_UPLOAD_MASTER_WORKFLOW_FINAL_SUCCESS.md

This document is the separate, paperback-only master workflow for all future KDP paperback uploads after a Kindle eBook has been successfully submitted. Do not edit or overwrite the Kindle eBook master workflow when updating this paperback workflow.

## Non-negotiable scope

1. Use this document only for the paperback phase.
2. Run paperback only after the Kindle eBook phase has reached its successful submission confirmation for the same title.
3. Keep one title-specific folder for all source and upload assets.
4. Use live Mac CUA / Chrome screenshots or AX readback for every step: capture -> act -> verify.
5. Do not skip the Print Previewer approval gate.
6. Do not submit/publish until the final paperback pricing gates pass and the `Publish Your Paperback Book` button is enabled.
7. Paperback Cover Creator spine-text error rule: if, and only if, Amazon Cover Creator shows small error symbols/warnings stating the book is not thick enough for spine text, delete the spine text boxes. The book title and author are in two separate spine text boxes; click the spine title text box and delete it, then click the spine author text box and delete it. Do not delete spine text unless Cover Creator explicitly shows the spine-not-thick-enough error/warning.

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
6a. **NEVER open a new Chrome session. EVER.** Use ONLY the existing logged-in Google Chrome session (typically PID 1345). Do NOT launch Chrome with --remote-debugging-port, do NOT create a new Chrome profile, do NOT open a new Chrome window. If cua-driver cannot find the existing Chrome window, use `cua-driver call list_apps` and `cua-driver call list_windows` to locate it — do NOT start a new one.
7. **Vision-verified paste gate (non-negotiable):** After EVERY text paste operation (title, subtitle, author, description, series, back-cover text boxes, price, etc.), take a vision/screenshot capture of the affected KDP form area and confirm the EXACT expected text is visibly rendered in the target field before advancing to the next field or clicking Save/Continue. Do NOT rely on clipboard success, AX `set_value` return code, or tool `ok` alone — only a vision snapshot proving the text is visibly in the correct KDP form field counts as verification. If the snapshot shows the text is missing, went into the wrong field, or landed in the wrong window/app, stop, re-focus the KDP tab, clear the field, re-paste, and re-verify before continuing.
8. **CHROME-ONLY PASTE RULE (CRITICAL - DO NOT VIOLATE):** ALL text paste operations MUST target the Google Chrome KDP window exclusively. The correct paste method is:
   a. Use `cua-driver call click '{"pid": <CHROME_PID>, "window_id": <KDP_WINDOW_ID>, "element_index": <TARGET_FIELD>}'` to focus the target field inside Chrome.
   b. Then activate Chrome explicitly: `osascript -e 'tell application "Google Chrome" to activate'`.
   c. Wait 0.5 seconds for Chrome to gain focus.
   d. Then send the paste: `osascript -e 'tell application "Google Chrome" to keystroke "v" using command down'`.
   e. **DO NOT** use `tell application "System Events" to keystroke "v"` — that sends the paste to whatever app has focus, which may NOT be Chrome. Always qualify with `tell application "Google Chrome"`.
   f. After pasting, verify with a vision/screenshot that the text appeared in the correct Chrome KDP field, not in this terminal or any other app.

Paperback-specific agents called by `KDP_ORCHESTRATOR`:

### KDP_PAPERBACK_SOURCE_PARSER_AGENT
- Preferred model tier: local Qwen / deterministic Python first; OpenRouter free model for second-pass consistency review if needed.
- Tool scope: file + terminal only.
- Reads same-title artifacts and extracts paperback details, exact categories/keywords if KDP requires repair, back-cover Series Summary, back-cover center description, manuscript path, PNG/JPG cover paths, AI answers, and paperback price `9.99`.
- Cannot operate KDP UI.

### KDP_PAPERBACK_DETAILS_AGENT
- Performs Paperback Details only.
- Preserves carried-over fields unless KDP shows a validation error or user/master workflow requires correction.
- Handles paperback category repair only from source intent and live KDP tree while preserving Christian/spiritual context.
- Stops after Details Save-and-Continue is verified to reach Paperback Content.

### KDP_PAPERBACK_CONTENT_COVER_AGENT
- Performs Paperback Content and Cover Creator only.
- Assigns ISBN, preserves print options unless instructed, uploads/scopes manuscript, launches Cover Creator, uses top-left design, corrects back-cover image/text, applies Auto Fit, handles spine-text deletion only on explicit spine-not-thick-enough warning, and completes AI-generated-content fields exactly.
- Stops after Cover Creator `Save & Submit` and Content-page cover/manuscript/AI state are verified.

### KDP_PAPERBACK_PREVIEW_AGENT
- Performs Print Previewer review only.
- Uses Thumbnail View, inspects KDP-flagged pages and issue pages, applies the TOC-warning rule, refreshes/retries if preview generation spins about 5 minutes, and clicks `Approve` only after visual review passes.
- Stops after KDP returns from previewer to Paperback Content with proof approved.

### KDP_PAPERBACK_PRICING_AGENT
- Performs Paperback Rights & Pricing only.
- Verifies All territories, Amazon.com marketplace, `9.99` USD price, Expanded Distribution if available, and the Amazon checkbox gate.
- Cannot click `Publish Your Paperback Book` until KDP_VERIFIER_AGENT passes every pricing gate and KDP_ORCHESTRATOR explicitly authorizes the final click.

### KDP_PAPERBACK_VERIFIER_AGENT
- Readback-only. Uses cheap/free/local models for simple comparisons, escalates to premium on ambiguity.
- Verifies screenshots/AX/text for Details, Content/Cover Creator, Previewer, Pricing, final submission confirmation, title, author, and evidence files.
- Cannot perform Save/Continue/Publish clicks.

## Non-negotiable artifact hydration gate for Draft / Continue setup

Before performing any Paperback upload/resume for a title showing `Draft` or `Continue setup` on KDP:
1. Verify the exact local title folder exists under `/Users/clawd/workspace/kdp_queue/<title-slug>/`.
2. Verify the folder contains the current title artifacts:
   - `metadata.json`
   - `kdp_content.docx`
   - `manuscript_6x9.docx`
   - `cover.png`
   - `cover.jpg`
   - any required Paperback-specific assets under `02_upload_assets/paperback/` if present/used by the current artifact system.
3. If any artifact is missing, stale, null in the manifest, or invalid, go to `https://scripturemadesimple.replit.app/my-studies`, scroll/find the exact book title, and populate/refresh the local title folder with all current artifacts from that My Study Guides entry before touching KDP upload controls.
4. Do not use Desktop/Downloads/global search as a substitute for the title folder. Duplicate filenames are expected across titles; the active folder must be authoritative.
5. Only after this artifact hydration/preflight gate passes may this Paperback master workflow begin or resume.

## Yellow-outlined and red-lined KDP instruction/error boxes

Whenever KDP shows a yellow-outlined instruction/warning box during the paperback workflow:
1. Read the text inside the yellow-lined box before continuing.
2. Do exactly what the yellow-lined box instructs, unless it conflicts with an explicit user instruction or safety rule.
3. If the yellow-lined box contains a checkbox, always click/check that checkbox.
4. If a yellow-lined box says the book must be previewed/reviewed/approved before continuing, click `Launch Previewer`, visually inspect the paperback preview for correct formatting, and click `Approve` only after the visual check passes.
5. Do not ignore yellow-lined boxes and do not click Save/Continue/Publish past them until their instruction is satisfied.

Whenever KDP shows a red-lined box with text inside:
1. Treat it as a critical error/problem that must be corrected before continuing.
2. Read and record the exact red-box text.
3. Go back to the affected section named by the red box and retry/fix that upload/entry area, such as manuscript/interior upload or Cover Creator/cover processing.
4. Do not proceed to preview, Save and Continue, pricing, or publish while any red-lined error box remains visible.
5. If KDP displays a modal such as `There was an error processing your files`, click its `Continue` button, then scroll and inspect all red-lined boxes to determine which sections must be redone.

## Start condition

Preferred start point:
1. KDP shows Kindle success confirmation for the same title.
2. Confirm text similar to:
   - `Your Kindle eBook has been submitted`
   - `Congratulations!`
   - exact same target title
   - author is `Noah Peterson`
3. Click `Start your paperback now`.

Fallback start point:
1. Open KDP Bookshelf.
2. Locate the exact same title row/card.
3. Resume/start the Paperback setup for that title only.
4. If title matching is ambiguous, stop rather than starting a wrong or duplicate draft.

Validated training title:
`You Can Change Your World By Speaking To It: An Independent Companion Study Guide & Spiritual Formation Workbook`

## Paperback Details

Rule: after `Start your paperback now`, do not rework already-carried-over Details fields unless KDP shows a validation error or the user explicitly instructs it.

1. Verify the Details page belongs to the correct title.
2. Preserve carried-over title, subtitle, author, description, and keywords unless KDP requires correction.
3. Author must be `Noah Peterson` for all study-guide titles.
4. Subtitle should retain the standard ampersand phrase:
   `An Independent Companion Study Guide & Spiritual Formation Workbook`
5. Skip down to `Categories`.
6. Choose the same intended category placements used for the eBook version of the same title, adjusted to the live paperback KDP tree.
7. Preserve Christian/spiritual context for all Scripture Made Simple / Reflective Reader study-guide titles.

Validated category mapping for the training title:
1. `Books > Education & Teaching > Studying & Workbooks > Study Guides`
2. `Books > Self-Help > Personal Transformation > Spiritual`
3. `Books > Religion & Spirituality > Christian Books & Bibles > Christian Living > Spiritual Growth`

Permanent category rule:
- Source category intent comes from the title-specific `kdp_content.docx` and/or the completed eBook category choices.
- If live paperback KDP tree wording differs, choose the closest live KDP tree match that preserves the source intent.
- For Christian/spiritual study-guide titles, prefer Christian/spiritual-context leaves over generic/secular options when judgment is required.

After Details gates pass:
1. Click bottom `Save and Continue`.
2. Verify navigation to Paperback Content.

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 1 GATE: VERIFY ALL PAPERBACK DETAILS BEFORE TRANSITION
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PAGE 1 COMPLETE VERIFICATION (MANDATORY):** Before clicking Save and Continue to leave Paperback Details, the agent MUST:

1. Take a full-page screenshot of the Paperback Details form.
2. Visually verify ALL carried-over fields are correct:
   - [ ] Title, Subtitle, Author, Description match source
   - [ ] Series is completed (NOT skipped)
   - [ ] Categories = exactly 3, correct labels
   - [ ] No red error boxes visible
3. ONLY if ALL items pass, click Save and Continue to proceed to Page 2 (Paperback Content).

---

## Paperback Content

### ISBN

1. Use the free KDP ISBN path.
2. Click/submit `Assign ISBN` if KDP has not already assigned one.
3. Verify KDP shows a free ISBN assigned and imprint `Independently published`.

Training ISBN observed:
`9798180294241`

### Print Options

Permanent rule: after the free KDP ISBN is assigned, leave the entire `Print Options` section exactly as KDP currently has it unless the user explicitly instructs otherwise.

Do not change:
- ink and paper type
- trim size
- bleed
- cover finish
- any other print option defaults

Validated training summary:
- Ink and paper: black & white interior with white paper
- Bleed: no bleed
- Trim size: 6 x 9 in
- Cover finish: matte
- Page count: 85

### Manuscript upload

1. Skip to `Manuscript`.
2. Upload the active title folder’s `manuscript_6x9.docx`.
3. Verify success text, e.g. `Manuscript "manuscript_6x9.docx" uploaded successfully!`.
4. Wait for processing to finish before continuing.

### Book Cover / Cover Creator

Use Cover Creator for paperback cover setup.

1. In `Book Cover`, choose Cover Creator / `Launch Cover Creator`.
2. If the help overlay appears:
   - check `Got it. Don't show me this again` if present
   - click `Continue`
3. Choose `From My Computer`.
4. Upload the active title folder’s `cover.png` first.
5. After the cover image is applied to the design gallery, choose/open the top-left design layout first.
6. If the Quick Tutorial overlay appears in the editable workspace, click `Dismiss`.
7. Verify `Save` and `Preview` are visible before editing.

### Cover Creator back-cover image correction

Permanent rule: the small top-left image slot on the back cover must use the same artwork as the front cover, specifically the `.jpg` version for the same title.

Correct sequence:
1. In Cover Creator `Style & Edit`, click the top-left image on the back cover.
2. If an image-edit pop-up appears, click `Choose a new cover image` / `Choose new image`.
3. On the `Get images for your cover` pop-up, click `From My Computer`.
4. In the macOS file picker, choose the correct same-title front-cover `.jpg` file.
5. Do not choose a `.png`, PDF, full-wrap cover, or file from another title folder.
6. Click the `.jpg` image itself, then click `Open` if double-click does not upload it.
7. Verify the file picker closes and Cover Creator returns with the `.jpg` selected/uploading for that image slot.

Training file confirmed by user:
`AAA_you_can_change_world_CORRECT_cover.jpg`

### Back-cover top-right text

Permanent rule: the top-right text box on the back cover must use the exact `Series Summary (Back Cover - Top Right)` section from the same title’s `kdp_content.docx`.

Do not use placeholder/gibberish text.
Do not paraphrase.
Do not use the center back-cover description in this top-right region.

Correct sequence:
1. Extract/copy the exact text immediately after the `Series Summary (Back Cover - Top Right):` heading in `kdp_content.docx`.
2. In Cover Creator `Style & Edit`, click the top-right text block on the back cover.
3. Select all existing placeholder text inside that specific text box only.
4. Paste the exact Series Summary text.
5. Verify the top-right block no longer shows placeholder/lorem/gibberish text.
6. Click `Save` after the replacement is visually correct.

### Back-cover center text

Permanent rule: the middle/center text box on the back cover must use the exact `Back Cover Description (Center - 2-3 paragraphs):` section from the same title’s `kdp_content.docx`.

Do not use placeholder/gibberish text.
Do not paraphrase.
Do not use the Series Summary in this center region.

Correct sequence:
1. Extract/copy the exact text immediately after the `Back Cover Description (Center - 2-3 paragraphs):` heading in `kdp_content.docx`.
2. In Cover Creator `Style & Edit`, click the middle/center text block on the back cover.
3. Select all existing placeholder text inside that center text box only.
4. Paste the exact Back Cover Description text.
5. Verify the center block no longer shows placeholder/lorem/gibberish text.
6. Preview the cover and confirm:
   - top-left back-cover thumbnail is the correct same-title front-cover JPG
   - top-right text is Series Summary
   - center text is Back Cover Description
7. Only after visual verification, click `Save & Submit`.
8. Verify KDP returns to Paperback Content and shows `Cover uploaded successfully!`.

### AI-Generated Content

Complete the paperback AI section exactly like the successful Kindle eBook workflow.

1. Select `Yes` for `Did you use AI tools in creating texts, images, and/or translations in your book?`
2. Texts dropdown: select `Entire work, with extensive editing`.
3. Tool textbox: enter exactly `custom AI`.
4. Images dropdown: select `None`.
5. Translations dropdown: select `None`.
6. Verify readback before continuing:
   - Yes selected
   - Texts = Entire work, with extensive editing
   - tool = custom AI
   - Images = None
   - Translations = None

Pitfall: do not leave the AI section on `No`. If `No` is selected, correct it immediately to `Yes` and wait for the Texts/Images/Translations fields to expand.

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 2 GATE: VERIFY ALL PAPERBACK CONTENT BEFORE TRANSITION
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PAGE 2 COMPLETE VERIFICATION (MANDATORY):** Before moving to Print Previewer, the agent MUST:

1. Take a full-page screenshot of the Paperback Content page.
2. Visually verify ALL of these are complete:
   - [ ] ISBN assigned (if free KDP ISBN path)
   - [ ] Print Options left as default
   - [ ] Manuscript 6x9 uploaded successfully
   - [ ] Cover Creator = Save & Submit completed successfully
   - [ ] Back-cover image (JPG) in top-left slot
   - [ ] Back-cover top-right text = exact Series Summary
   - [ ] Back-cover center text = exact description
   - [ ] AI-Generated Content = Yes, Entire work, Images=None, Translations=None
   - [ ] AI Tool = "custom AI"
   - [ ] No red error boxes visible
3. ONLY if ALL items pass, click Save and Continue or proceed to Print Previewer.
4. **VISION VERIFY** the Previewer page loaded correctly.

---

## Paperback Print Previewer

The Print Previewer approval gate is mandatory.

1. In the `Book Preview` section, click `Launch Previewer`.
2. Wait for the separate `Print Previewer` tab/window to finish loading.
3. Review any warnings/issues in the left `Review` panel.
4. The warning `We've removed non-printable markup from your document. Check these pages to confirm that your book still appears as intended.` does not block approval by itself; inspect the referenced page(s).
5. Use `Next Issue` to inspect the issue group if shown.
6. Confirm the page count in the page range area.
7. Spot-check the requested/relevant pages.

Training spot-checks performed:
- page `7`: confirmed book still appeared acceptable after KDP removed non-printable markup
- final spread `84-85`: confirmed disclaimer/AI disclosure/connect text appeared inside guides without obvious clipping
- `Cover`: returned to the cover page before approval and verified cover preview/guides were visible

Page range control fallback:
- If click/type does not work, use AX `set_value` on the Page Range text field and press Enter.
- Valid observed values: `7`, `84-85`, `Cover`.

Approval:
1. Only after review is complete and the visual result is acceptable, click the bottom-right yellow `Approve` button.
2. Verify KDP returns to `[KDP] Edit Title Content` with URL containing `acceptProof=CONVERTED`.
3. Verify the progress tracker shows `Paperback Content` as `Complete`.

Permanent rule: do not treat `Cover uploaded successfully!` alone as sufficient. Require Print Previewer review + yellow `Approve` return to the Content page.

## Paperback Rights & Pricing

After Print Previewer approval returns to Paperback Content:
1. Click bottom `Save and Continue`.
2. Verify navigation to `[KDP] Edit Title Pricing` / `Paperback Rights & Pricing`.
3. Territories: select/confirm `All territories (worldwide rights)`.
4. Primary marketplace: verify `Amazon.com`.
5. Amazon.com list price: enter `9.99` USD.
6. Verify pricing recalculates.
7. Verify Amazon.com royalty shows 60% with royalty amount around `$3.69` for the 85-page training book.
8. Enable/check Expanded Distribution.
9. REQUIRED: if the live page shows an enabled checkbox next to `Amazon` in the pricing/royalty/distribution area, click/check it. This Amazon checkbox allows Amazon marketplace distribution/sales coverage; do not skip it. If it is disabled, capture/verify that disabled state before proceeding.
10. Verify Expanded Distribution royalty shows 40% with royalty amount around `$1.70` for Amazon.com when enabled.
11. Verify no enabled Amazon checkbox remains unchecked.
12. Verify the final button is enabled and reads `Publish Your Paperback Book`.

Pricing pitfall and fix:
- KDP may show red `Please enter a price` warnings for derived marketplaces even when converted prices are visibly populated.
- This means KDP’s JavaScript has not committed the field values.
- Fix by focusing the Amazon.com price field, selecting/clearing/retyping the price using real keypresses rather than AX `set_value` alone, then tabbing out.
- During training, this cleared all `Please enter a price` warnings and enabled `Publish Your Paperback Book`.

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 3 GATE: FINAL VERIFICATION BEFORE PAPERBACK PUBLISH
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**FINAL VERIFICATION BEFORE PAPERBACK PUBLISH (MANDATORY):** Before clicking "Publish Your Paperback Book", the agent MUST:

1. Take a full-page screenshot of the Paperback Rights & Pricing page.
2. Visually verify ALL of these:
   - [ ] All territories = selected
   - [ ] Amazon.com = primary marketplace
   - [ ] Price = $9.99 USD
   - [ ] Expanded Distribution = enabled if available
   - [ ] Amazon checkbox = checked (or disabled)
   - [ ] No red price warnings visible
   - [ ] "Publish Your Paperback Book" button visible and enabled
3. ONLY if ALL items pass, click "Publish Your Paperback Book".
4. **VISION VERIFY** the confirmation page shows:
   - "Your paperback has been submitted"
   - Correct title
   - "By Noah Peterson"

---

## Final paperback submit/publish

Only click final publish after all gates above pass.

1. Confirm page is still KDP pricing for the correct paperback title.
2. Confirm title is correct.
3. Confirm author remains `Noah Peterson` when shown.
4. Confirm price gate passed and `Publish Your Paperback Book` is enabled.
5. Click `Publish Your Paperback Book`.
6. Verify final confirmation.

Validated final confirmation:
- URL returned to Bookshelf with `publishedId=0V9VRP5QQRF`
- Heading: `Your paperback has been submitted`
- Correct title: `You Can Change Your World By Speaking To It: An Independent Companion Study Guide & Spiritual Formation Workbook`
- Author: `By Noah Peterson`

## Future-title checklist

For every future title, follow this exact order:
1. Kindle success confirmation / Bookshelf same-title paperback entry
2. Paperback Details category verification/correction
3. Details `Save and Continue`
4. Free KDP ISBN
5. Leave Print Options unchanged
6. Upload same-title `manuscript_6x9.docx`
7. Cover Creator with same-title `cover.png`
8. Back-cover top-left image corrected to same-title `.jpg`
9. Top-right text = exact `Series Summary` from same-title `kdp_content.docx`
10. Center text = exact `Back Cover Description` from same-title `kdp_content.docx`
11. Cover Creator `Preview` -> `Save & Submit`
12. Paperback AI fields: Yes / Entire work with extensive editing / custom AI / Images None / Translations None
13. Launch Print Previewer
14. Review issues and required spot-checks
15. Return to cover page if reviewing cover before approval
16. Click yellow `Approve`
17. Content page bottom `Save and Continue`
18. Rights & Pricing: all territories, Amazon.com, `9.99`, Expanded Distribution
19. Clear derived-marketplace price warnings if present by real-keypress retype of Amazon.com price
20. Click enabled `Publish Your Paperback Book`
21. Verify `Your paperback has been submitted`

## Completion status

This paperback workflow is 100% complete and should be followed step by step for all future paperback uploads.
