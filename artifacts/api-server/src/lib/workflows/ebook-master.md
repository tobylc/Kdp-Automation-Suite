# KDP eBook Upload Master Automation Workflow — FINAL 100% SUCCESS

Recorded: 2026-06-05 13:04:45 PDT
Validated live title: You Can Change Your World By Speaking To It
Source queue page: https://scripturemadesimple.replit.app/my-studies
KDP result observed: "Congratulations! Your Kindle eBook has been submitted"
Observed final eBook price: $2.99 USD

This is the final successful Kindle eBook upload workflow for all new KDP cron/job triggers when a new book title is detected on the Scripture Made Simple / My Studies queue.

## Non-negotiable trigger gate for cron jobs

Every cron check must:
1. Open/refresh https://scripturemadesimple.replit.app/my-studies.
2. Inspect only the top/newest title candidate unless the state log proves it was already completed.
3. Treat the title as ready only when the 6x9 book section has visible cover-art thumbnail/cover asset under or near it.
4. If the top title has no visible cover art, stop quietly and wait for the next cron tick.
5. If KDP is logged out or shows a password/2FA/permission prompt, stop and notify the user. Do not attempt login or secrets.
6. Record idempotency by title slug and KDP status so the same Kindle upload is not submitted twice.

## Non-negotiable artifact hydration gate for Draft / Continue setup

Before performing any Kindle eBook upload/resume for a title showing `Draft` or `Continue setup` on KDP:
1. Verify the exact local title folder exists under `/Users/clawd/workspace/kdp_queue/<title-slug>/`.
2. Verify the folder contains the current title artifacts:
   - `metadata.json`
   - `kdp_content.docx`
   - `manuscript_6x9.docx`
   - `cover.png`
   - `cover.jpg`
   - any required Kindle-specific assets under `02_upload_assets/kindle/` if present/used by the current artifact system.
3. If any artifact is missing, stale, null in the manifest, or invalid, go to `https://scripturemadesimple.replit.app/my-studies`, scroll/find the exact book title, and populate/refresh the local title folder with all current artifacts from that My Study Guides entry before touching KDP upload controls.
4. Do not use Desktop/Downloads/global search as a substitute for the title folder. Duplicate filenames are expected across titles; the active folder must be authoritative.
5. Only after this artifact hydration/preflight gate passes may this Kindle master workflow begin.

## Yellow-outlined and red-lined KDP instruction/error boxes

Whenever KDP shows a yellow-outlined instruction/warning box during the workflow:
1. Read the text inside the yellow-lined box before continuing.
2. Do exactly what the yellow-lined box instructs, unless it conflicts with an explicit user instruction or safety rule.
3. If the yellow-lined box contains a checkbox, always click/check that checkbox.
4. If a yellow-lined box says the book must be previewed/reviewed/approved before continuing, launch the relevant previewer, visually inspect the preview for correct formatting, and approve it only after the visual check passes.
5. Do not ignore yellow-lined boxes and do not click Save/Continue/Publish past them until their instruction is satisfied.

Whenever KDP shows a red-lined box with text inside:
1. Treat it as a critical error/problem that must be corrected before continuing.
2. Read and record the exact red-box text.
3. Go back to the affected section named by the red box and retry/fix that upload/entry area.
4. Do not proceed to preview, Save and Continue, pricing, or publish while any red-lined error box remains visible.
5. If KDP displays a modal such as `There was an error processing your files`, click its `Continue` button, then scroll and inspect all red-lined boxes to determine which sections must be redone.

## Execution order

For every new ready title, run in strict order:
1. Kindle eBook first.
2. Paperback second.
3. Hardcover third.

This document records the final 100% successful Kindle eBook upload phase. Paperback/hardcover may start only after the Kindle success confirmation.

## Kindle eBook cron swarm operating pattern

## Dedicated KDP cron swarm boundary

This master workflow is executed by the dedicated KDP cron swarm only. Normal user conversation, planning, and SOP editing are handled by Cleo in the main chat; Cleo does not perform the recurring cron upload work. The cron upload work is owned by `KDP_ORCHESTRATOR`, which wakes inside the KDP executor job and calls specialist agents only when needed.

All swarm agents must follow `/Users/clawd/workspace/kdp_queue/_SYSTEM/KDP_SWARM_AGENT_ARCHITECTURE.md` plus this format-specific master file. The architecture file defines the idle specialist roles, model/cost routing, handoff packets, and verification contract. If that architecture file and this master file appear to conflict, fail closed and ask Cleo/user to update the SOP before acting.

Swarm invariants for this file:
1. Agents in this swarm are KDP-cron-only and must not handle unrelated discussion.
2. Specialist agents sit idle until `KDP_ORCHESTRATOR` gives them a bounded task.
3. Specialists perform only the assigned task; they do not advance into another phase or format.
4. Cheap/local/free agents may handle deterministic parsing, checklist comparison, and readback verification, but they may not make ambiguous UI judgments or publish decisions.
5. The premium/default orchestrator remains responsible for final live KDP judgment, ambiguous recovery, and publish/submit authorization.
7. Every browser action requires capture -> act -> verify; no success is claimed from tool success alone.
7a. **NEVER open a new Chrome session. EVER.** Use ONLY the existing logged-in Google Chrome session (typically PID 1345). Do NOT launch Chrome with --remote-debugging-port, do NOT create a new Chrome profile, do NOT open a new Chrome window. If cua-driver cannot find the existing Chrome window, use `cua-driver call list_apps` and `cua-driver call list_windows` to locate it — do NOT start a new one.
8. **Vision-verified paste gate (non-negotiable):** After EVERY text paste operation (title, subtitle, author, description, series, categories, keywords, AI tool field, price, etc.), take a vision/screenshot capture of the affected KDP form area and confirm the EXACT expected text is visibly rendered in the target field before advancing to the next field or clicking Save/Continue. Do NOT rely on clipboard success, AX `set_value` return code, or tool `ok` alone — only a vision snapshot proving the text is visibly in the correct KDP form field counts as verification. If the snapshot shows the text is missing, went into the wrong field, or landed in the wrong window/app, stop, re-focus the KDP tab, clear the field, re-paste, and re-verify before continuing.
9. **CHROME-ONLY PASTE RULE (CRITICAL - DO NOT VIOLATE):** ALL text paste operations MUST target the Google Chrome KDP window exclusively. The correct paste method is:
   a. Use `cua-driver call click '{"pid": <CHROME_PID>, "window_id": <KDP_WINDOW_ID>, "element_index": <TARGET_FIELD>}'` to focus the target field inside Chrome.
   b. Then activate Chrome explicitly: `osascript -e 'tell application "Google Chrome" to activate'`.
   c. Wait 0.5 seconds for Chrome to gain focus.
   d. Then send the paste: `osascript -e 'tell application "Google Chrome" to keystroke "v" using command down'`.
   e. **DO NOT** use `tell application "System Events" to keystroke "v"` — that sends the paste to whatever app has focus, which may NOT be Chrome. Always qualify with `tell application "Google Chrome"`.
   f. After pasting, verify with a vision/screenshot that the text appeared in the correct Chrome KDP field, not in this terminal or any other app.

Kindle-specific agents called by `KDP_ORCHESTRATOR`:

### KDP_KINDLE_SOURCE_PARSER_AGENT
- Preferred model tier: local Qwen / deterministic Python first; OpenRouter free model for second-pass consistency review if needed.
- Tool scope: file + terminal only.
- Reads only same-title artifacts (`metadata.json`, `title_manifest.json`, `kdp_content.docx`, manuscript/cover paths).
- Produces exact Kindle Details/Content/Pricing source packet: title, fixed subtitle phrase, author `Noah Peterson`, exact description, categories(3), keywords(7), AI-generated-content answers, Kindle list price `2.99`, and asset paths.
- Cannot operate KDP UI or choose substitute categories.

### KDP_KINDLE_DETAILS_AGENT
- Performs Kindle Details page only, using parser output and this file's Details gates.
- Must complete language, title, fixed subtitle, series requirement if shown, author, exact description, publishing rights, primary audience, categories(3), and keywords(7).
- Must not touch reading-age min/max unless transcript/video explicitly instructs values.
- Stops after Details Save-and-Continue is verified to reach Kindle Content.

### KDP_KINDLE_CONTENT_AGENT
- Performs Kindle Content page only.
- Uploads/verifies manuscript and cover from the active title folder; completes AI-generated-content fields exactly; handles preview/quality checks only as instructed here.
- Stops after Content Save-and-Continue is verified to reach Kindle Pricing.

### KDP_KINDLE_PRICING_AGENT
- Performs Kindle Pricing page only.
- Verifies territories, primary marketplace, `2.99` price, KDP Select/royalty fields as required, and the Amazon checkbox gate.
- Cannot click `Publish Your Kindle eBook` until KDP_VERIFIER_AGENT passes every pricing gate and KDP_ORCHESTRATOR explicitly authorizes the final click.

### KDP_KINDLE_VERIFIER_AGENT
- Readback-only. Uses cheap/free/local models for simple comparisons, escalates to premium on ambiguity.
- Verifies screenshots/AX/text for Details, Content, Pricing, final submission confirmation, title, author, and evidence files.
- Cannot perform Save/Continue/Publish clicks.

## Required local/source artifacts

For each title job folder, confirm the presence of the title-specific artifacts before opening KDP:
- manuscript_6x9.docx or equivalent 6x9 manuscript file.
- cover image for the Kindle cover upload.
- kdp_content.docx generated for that exact title.
- title metadata/source page data.

Never reuse another book's categories, keywords, description, cover, or manuscript.

## Kindle Details page — STRICT SEQUENTIAL SECTION ORDER

ALL sections below must be completed in the EXACT order listed. Do NOT skip any section. Do NOT jump ahead. Do NOT move to the next section until the current section is verified through VISION that the correct text/value is visibly rendered inside the correct KDP form field.

**Vision verification rule after each section:** After completing EACH section below (Language, Book Title, Subtitle, Series, Author, Description, Publishing Rights, Primary Audience, Categories, Keywords), take a VISION SCREENSHOT of the KDP form area and verify the EXACT expected value is visibly displayed in the target field. Do NOT rely on clipboard success, AX return codes, or tool status alone. Only a vision snapshot confirming the text is visibly in the correct KDP form field counts as verification. If the snapshot shows the text is missing, went into the wrong field, or landed in the wrong window, stop, re-focus the KDP tab, clear the field, re-paste, and re-verify before continuing.

### Section 1: Language
- Use English unless title-specific source says otherwise.
- **VISION VERIFY:** After selecting, take a screenshot and confirm the language field shows the expected value.

### Section 2: Book Title
- Use exact title from the ready source title / kdp_content.
- Paste the title text into the Book Title field.
- **VISION VERIFY:** Take a screenshot of the Book Title field. Confirm the EXACT title text is visibly displayed inside the field. If it shows the wrong text or is empty, re-paste and re-verify.

### Section 3: Subtitle
- Use transcript/source-of-truth standard phrase, not an inconsistent kdp_content subtitle if they differ.
- Standard subtitle format uses ampersand:
  An Independent Companion Study Guide & Spiritual Formation Workbook
- **VISION VERIFY:** Take a screenshot of the Subtitle field. Confirm the EXACT subtitle including the ampersand is visibly displayed inside the field. Do not proceed until confirmed.

### Section 4: Series (DO NOT SKIP)
- Complete the series requirement on the KDP form. This is a required section.
- Click the Series field/dropdown and add the title to the appropriate series (e.g., "The Reflective Reader" or as specified in the title metadata).
- If KDP shows a Series popup/dialog requiring a series name or relationship, complete it fully before closing.
- **VISION VERIFY:** Take a screenshot showing the Series field is populated with the correct series name and the series section shows no remaining required/unanswered prompts. Do NOT move to Author until the Series section is fully completed and verified.

### Section 5: Author
- For all Reflective Reader / study-guide titles, author is: Noah Peterson
- Do not use the original book author as the KDP author.
- Enter first name "Noah" and last name "Peterson" in the respective fields.
- **VISION VERIFY:** Take a screenshot of the Author fields. Confirm "Noah" and "Peterson" are visibly displayed in the correct first/last name fields.

### Section 6: Description
- Copy exactly from generated kdp_content.docx for the same title.
- No paraphrase. No hallucinated rewrite. No shortening unless KDP field limits force it, and then stop/notify if unsure.
- **VISION VERIFY:** Take a screenshot of the Description editor/field. Scroll if needed to show the text content. Confirm the EXACT expected description text is visibly rendered inside the field. If the rich-text editor is involved, verify the text is visible in the editor body, not just in hidden inputs.

### Section 7: Publishing Rights
- Complete the publishing-rights field before moving on.
- **VISION VERIFY:** Take a screenshot confirming the publishing rights field shows the expected value.

### Section 8: Primary Audience / Adult Content
- Select No for Sexually Explicit Images or Title / adult-content unless the title-specific transcript/source explicitly says otherwise.
- Do NOT touch reading-age minimum/maximum dropdowns unless transcript/source explicitly instructs values.
- If KDP displays an adult-content reading-age warning, treat that as evidence the wrong answer is selected; switch to No and verify the warning/noise clears.
- **VISION VERIFY:** Take a screenshot confirming "No" is selected and no reading-age warnings remain visible.

### Section 9: Categories
- Exactly 3 categories required.
- Use the title-specific kdp_content.docx as category source of truth.
- Navigate KDP tree one level at a time to the closest live match.
- Do not stop on broad intermediate labels when a deeper terminal leaf is available.
- If Add another category appears muted/disabled before 3 categories are selected, click Save categories, return to main Details page, click Edit categories, then Add another category and continue.
- Verify the page/modal shows exactly 3 out of 3 category placements selected before proceeding.
- **VISION VERIFY:** After saving categories, take a screenshot of the Categories summary block on the Details page. Confirm exactly 3 category placements are shown with the expected labels.

### Section 10: Keywords
- Populate all 7 keyword fields from the title-specific kdp_content.docx.
- Do not skip any keyword boxes.
- **VISION VERIFY:** Take a screenshot showing all 7 keyword fields are populated with the expected text. Confirm none are empty.

### Section 11: Save and Continue
- Click Save and Continue at the bottom only after every single section above (1-10) has been individually vision-verified.
- After clicking Save and Continue, verify the page transitions to the Kindle Content page (URL changes to /content).
- **VISION VERIFY:** Take a screenshot confirming the URL/path is now on the Kindle Content page, not still on Details.

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 1 GATE: VERIFY ALL DETAILS SECTIONS BEFORE TRANSITION
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PAGE 1 COMPLETE VERIFICATION (MANDATORY):** Before clicking "Save and Continue" to leave the Kindle Details page, the agent MUST perform a full verification pass:

1. Review the checklist below. EVERY item must be confirmed via VISION SCREENSHOT.
2. Take a full-page screenshot of the Kindle Details form.
3. Visually verify ALL of these are complete and correct:
   - [ ] Language = English (or correct source language)
   - [ ] Book Title = exact title from kdp_content
   - [ ] Subtitle = standard phrase with ampersand
   - [ ] Series = completed and populated (NOT skipped)
   - [ ] Author = Noah Peterson (first: Noah, last: Peterson)
   - [ ] Description = exact text from kdp_content (vision-check the editor)
   - [ ] Publishing Rights = completed
   - [ ] Primary Audience = "No" for adult content, Reading Ages untouched
   - [ ] Categories = exactly 3, correct labels
   - [ ] Keywords = all 7 fields populated
4. ONLY if ALL 10 items pass vision verification, click "Save and Continue" to proceed to Page 2 (Kindle Content).
5. If ANY item is missing, wrong, or unverified, fix it BEFORE clicking Save and Continue.
6. After clicking, **VISION VERIFY** the URL changed to `/content` confirming Page 2 loaded successfully.

---

## PAGE 2: KINDLE CONTENT — final required gates (VISION VERIFY EACH)

1. Upload manuscript
   - Upload the title-specific 6x9 manuscript file from the active title folder.
   - Wait for successful upload/processing indication.
   - **VISION VERIFY:** Take a screenshot showing the manuscript file is uploaded and the success/processing message is visible. Do not proceed until verified.

2. Upload Kindle cover
   - Upload the title-specific cover file from the active title folder.
   - If KDP presents a cover creator/layout where title/author text is auto-overlaid on top of the finished cover, delete/remove the auto-overlaid title/author text so the finished cover art is not duplicated or corrupted.
   - Verify cover thumbnail/preview is visible.
   - **VISION VERIFY:** Take a screenshot showing the cover thumbnail/preview is visibly present and correct. If cover creator was used, verify no unwanted overlaid text remains.

3. AI-generated content block
   - Select Yes for AI-generated content.
   - Texts: Entire work, with extensive editing.
   - Images: None.
   - Translations: None.
   - If KDP asks which AI model/tool was used, enter exactly: custom AI
   - **VISION VERIFY:** Take a screenshot of the AI content section. Visually confirm ALL of: Yes is selected, "Entire work, with extensive editing" is shown, Images = None, Translations = None, and "custom AI" is entered in the tool textbox.

4. Preview / quality gates
   - Complete required KDP previewer/quality checks if KDP blocks continuation.
   - Do not bypass visible hard errors.
   - **VISION VERIFY:** If a previewer was launched, take a screenshot of the preview state and confirm it shows the book content correctly before approving.

5. Save and Continue
   - Click Save and Continue only after manuscript, cover, and AI-content gates all pass vision verification.
   - **VISION VERIFY:** After clicking, verify the page transitions to the Kindle Pricing page (URL changes to /pricing).

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 2 GATE: VERIFY ALL CONTENT SECTIONS BEFORE TRANSITION
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PAGE 2 COMPLETE VERIFICATION (MANDATORY):** Before clicking "Save and Continue" to leave the Kindle Content page, the agent MUST:

1. Take a full-page screenshot of the Kindle Content page.
2. Visually verify ALL of these are complete and correct:
   - [ ] Manuscript = 6x9 uploaded successfully (success message visible)
   - [ ] Kindle Cover = uploaded and thumbnail/preview visible
   - [ ] AI-Generated Content = Yes selected
   - [ ] AI Texts = "Entire work, with extensive editing"
   - [ ] AI Images = "None"
   - [ ] AI Translations = "None"
   - [ ] AI Tool = "custom AI" entered in the textbox
   - [ ] No red error boxes visible on the page
   - [ ] No yellow warning boxes blocking progression
3. ONLY if ALL items pass, click "Save and Continue" to proceed to Page 3 (Kindle Pricing).
4. If ANY item is incomplete or wrong, fix it BEFORE clicking Save and Continue.
5. After clicking, **VISION VERIFY** the URL changed to `/pricing` confirming Page 3 loaded successfully.

---

## PAGE 3: KINDLE PRICING & SUBMISSION — final required gates (VISION VERIFY EACH)

1. KDP Select
   - Enroll the Kindle eBook in KDP Select when presented.
   - **VISION VERIFY:** Take a screenshot confirming KDP Select enrollment checkbox is checked/selected.

2. Territories
   - Select/verify All territories (worldwide rights), unless title-specific source says otherwise.
   - **VISION VERIFY:** Take a screenshot confirming All territories is selected.

3. Primary marketplace
   - Amazon.com.
   - **VISION VERIFY:** Take a screenshot confirming Amazon.com is visible as the primary marketplace.

4. Royalty
   - Use 70% when available/appropriate with the chosen price.
   - **VISION VERIFY:** Take a screenshot confirming the royalty rate is correctly set.

5. eBook price
   - PRICE ALL EBOOKS AT $2.99.
   - Amazon.com Kindle eBook list price must be exactly: 2.99 USD
   - Any older SOP/artifact saying 5.99 is outdated for eBooks.
   - After entering 2.99, verify converted marketplace rows update and the Amazon.com row visibly shows 2.99 USD.
   - **VISION VERIFY:** Take a screenshot of the price fields. Confirm the Amazon.com list price visibly shows "2.99" or "2.99 USD".

6. Amazon marketplace/distribution checkbox gate
   - REQUIRED: if the Kindle Pricing page shows an enabled checkbox next to `Amazon` or an Amazon marketplace/distribution option, click/check it before final publish.
   - If the Amazon checkbox is disabled, capture/verify that disabled state before proceeding.
   - Verify no enabled Amazon checkbox remains unchecked.
   - **VISION VERIFY:** Take a screenshot confirming the Amazon checkbox state (enabled and checked, or confirmed disabled).

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### PAGE 3 GATE: FINAL VERIFICATION BEFORE PUBLISH
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**FINAL VERIFICATION BEFORE PUBLISH (MANDATORY):** Before clicking "Publish Your Kindle eBook", the agent MUST:

1. Take a full-page screenshot of the Kindle Pricing page.
2. Visually verify ALL of these are complete and correct:
   - [ ] KDP Select = enrolled
   - [ ] Territories = All territories
   - [ ] Primary Marketplace = Amazon.com
   - [ ] Royalty = 70%
   - [ ] Price = $2.99 USD (Amazon.com row shows 2.99)
   - [ ] Amazon checkbox = checked (or confirmed disabled)
   - [ ] Terms & Conditions visible
   - [ ] "Publish Your Kindle eBook" button visible and enabled
   - [ ] No red error boxes visible
3. ONLY if ALL items pass, click "Publish Your Kindle eBook".
4. If ANY item is wrong, fix it BEFORE publishing.
5. After clicking, **VISION VERIFY** the submission confirmation page shows:
   - "Congratulations!"
   - "Your Kindle eBook has been submitted"
   - Correct title
   - "By Noah Peterson"
   - "$2.99 USD"

---

## Final success verification

After clicking Publish Your Kindle eBook, wait for KDP to return to Bookshelf / confirmation modal and verify:
- Modal/body says Congratulations.
- Text says Your Kindle eBook has been submitted.
- The submitted title is the correct current title.
- Price shown is $2.99 USD.
- Bookshelf row/status shows Kindle eBook in review (or equivalent submitted/review status).

For the validated live run, the success modal showed:
- Congratulations!
- Your Kindle eBook has been submitted
- You Can Change Your World By Speaking To It: An Independent Companion Study Guide & Spiritual Formation Workbook
- By Noah Peterson
- $2.99 USD

## Stop / pause rules

Stop and notify the user instead of guessing when:
- KDP requires login, password, 2FA, account verification, payment/tax/banking changes, or permission prompts.
- The source page has no ready cover art for the top title.
- Required artifacts are missing or mismatched to the title.
- KDP shows a hard validation error that cannot be resolved from the SOP.
- A field source conflicts and transcript/source-of-truth rules do not resolve it.

## Cron-job implementation note

All new cron-triggered KDP eBook runs must load or follow this document before acting. Treat it as the final successful Kindle eBook upload master workflow. The older dry-run/canary/no-publish plan is superseded for ready new-title eBook submissions, provided all gates pass and the user has already authorized live publishing for the automation.
