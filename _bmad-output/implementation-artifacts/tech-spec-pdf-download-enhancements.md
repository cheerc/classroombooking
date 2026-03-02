---
title: 'PDF Download Enhancements'
slug: 'pdf-download-enhancements'
created: '2026-03-02T13:34:05+08:00'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['HTML', 'JavaScript', 'jsPDF', 'jsPDF-AutoTable']
files_to_modify: ['JavaScript.html']
code_patterns: ['jsPDF DOM Scraping', 'AutoTable Hooks (didDrawPage, didDrawCell)']
test_patterns: ['Manual PDF Generation Verification']
---

# Tech-Spec: PDF Download Enhancements

**Created:** 2026-03-02T13:34:05+08:00

## Overview

### Problem Statement

The user wants to refine the "Download as PDF" feature. Several issues exist with the current PDF output, including formatting, missing information (classroom name), incorrect information (teacher name instead of classroom), and unwanted status text ("即將上課").

### Solution

Modifications will be made to `JavaScript.html` within the `printScheduleToPdf` function. We will utilize `jsPDF-AutoTable`'s hooks (`didDrawPage`, `didDrawCell`) to customize the PDF drawing, directly access component state to format the correct classroom/teacher information, and cleanly parse DOM elements to exclude temporary badges without breaking global view identifiers.

### Scope

**In Scope:**
1. PDF Title: Center the title and enlarge the font size. If `customTitle` is exceptionally long, allow for basic text truncation or ensure `splitTextToSize` is handled if it overlaps with `tagsText`.
2. Top-Left Cell (Week & Day Views): Draw a diagonal line, with text aligned to bottom-left and top-right (standardizing both views using proper table coordinates and padding).
3. Week View (Group by Teacher): Ensure the bottom text in the schedule cell shows `(教室：xxx)` if sorted by teacher, else retain `(教師姓名)`.
4. Day View (Group by Teacher): Ensure the bottom text in the schedule cell shows `(教室：xxx)` instead of the teacher's name `(教師姓名)`.
5. Day View: Remove the "即將上課" (upcoming class) text from the PDF output without removing the `.schedule-prefix` from the "All Schedules" mode.

**Out of Scope:**
- Changes to the HTML/CSS structural layout outside of PDF specific features.
- Any server-side Apps Script changes.

## Context for Development

### Codebase Patterns

- The `printScheduleToPdf` function extracts HTML from `#schedule-table`.
- AutoTable is used. Page headers are drawn in `didDrawPage`.
- Cell rendering for complex elements (like the diagonal line) should leverage the `didDrawCell` hook from autoTable.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `JavaScript.html` | Specifically `printScheduleToPdf` inside `App` module. Handles document setup, title placement, header parsing, cell styling, and saving. |

### Technical Decisions

- **Diagonal Header**: To achieve the diagonal header in the PDF, the parsed text in `head[0][0]` will be reset to an empty string. The `didDrawCell` hook will intercept the rendering of Header cell (index 0), draw the diagonal using `doc.line()`, and map `星期` top-right and `老師`/`教室` bottom-left via `doc.text()` using specific `data.cell.x` and `data.cell.y` coordinates with padding.
- **Title Centering**: In `didDrawPage`, replace the fixed `margin.left` absolute position of the title with `pageWidth / 2` and `align: 'center'`. Increase font size to `16`.
- **Grouping Dynamic Text**: Retrieve state explicitly via `app.viewSortMode` inside `printScheduleToPdf` (to avoid `this` context loss). If `app.viewSortMode === 'teacher'`, inject `(教室：${classroomName})`. Otherwise, retain the standard behaviour (or explicitly inject the teacher name).
- **Scraping Cleanup**: For the leftmost column identifier, reconstruct the text by querying `.schedule-prefix` (if any) and `.classroom-name-main`, rather than just `textContent`, effectively filtering out the `.upcoming-badge`.

## Implementation Plan

### Tasks

- [ ] Task 1: Update the PDF Title drawing
  - File: `JavaScript.html`
  - Action: Inside `printScheduleToPdf`, update the `didDrawPage` function to set font size to `16`. Retrieve the `pageWidth`, draw `finalTitle` centered at X `pageWidth / 2` and Y `10`, with option `{ align: 'center' }`. If title is too long, consider simple splitting or let jsPDF center it naturally. Adust tags text location to be safely on the right.

- [ ] Task 2: Standardize the Top-Left cell to use a drawn Diagonal format 
  - File: `JavaScript.html`
  - Action: Inside `printScheduleToPdf`, before calling `doc.autoTable`, set `head[0][0] = '';` (or equivalent identifier array mapping) for both Day View and Week View branches. 
  - Notes: Inside the `doc.autoTable` options, define/update the `didDrawCell` hook. If `data.section === 'head'` and `data.column.index === 0`, pull coordinates `data.cell.x`, `y`, `width`, `height`. Draw a line from `(x, y)` to `(x+width, y+height)`. Draw '星期' text aligned right near top (`y + 5`). Draw '老師' or '教室' (based on `app.viewSortMode`) text aligned left near the bottom corner (`y + height - 2`). Apply padding explicitly.

- [ ] Task 3: Fix Day View "Group by Teacher" content parsing
  - File: `JavaScript.html`
  - Action: Inside the Day View PDF mapping loop (around `const mainContent = ...`), check `if (app.viewSortMode === 'teacher')`. Set the bottom text to `(教室：${classroomName})` instead of `(${course.teacher})`.

- [ ] Task 4: Fix Week View "Group by Teacher" content parsing
  - File: `JavaScript.html`
  - Action: Inside the Week View PDF mapping loop, check `if (app.viewSortMode === 'teacher')`. Retrieve the classroom code using `item.dataset.classroom` and set bottom text to `(教室：${classRoomAttr})`. Add an `else` condition to default back to `(${teacher})` parsing so that other views do not break.

- [ ] Task 5: Remove "即將上課" text from Day View table scraping without hurting Global prefixes
  - File: `JavaScript.html`
  - Action: Inside Day View's DOM scraping loop (`tbody.querySelectorAll('tr')`), change `const identifier = identifierCell.textContent.trim()` to a safe extraction: `const prefix = identifierCell.querySelector('.schedule-prefix')?.textContent.trim() || '';  const mainName = identifierCell.querySelector('.classroom-name-main')?.textContent.trim() || identifierCell.textContent.trim();  const finalIdentifier = prefix ? \`[\${prefix}] \${mainName}\` : mainName;`. Use this `finalIdentifier` for the PDF rendering.

### Acceptance Criteria

- [ ] AC 1: Given a schedule is exported to PDF, when the resulting file is opened, then its main title should be horizontally centered and use font size 16.
- [ ] AC 2: Given the user exports a PDF in Day View or Week View, when reviewing the top-left corner of the schedule table, then a diagonal line is present spanning precisely the cell bounds, and labels ("星期" and "教室/老師") reside in opposite corners with visual padding.
- [ ] AC 3: Given the user switches to Day View and groups the view completely by 'Teacher', when exported to PDF, then the course block bottom line indicates "(教室: [Room ID])".
- [ ] AC 4: Given the user switches to Week View and groups by 'Teacher', when exported to PDF, then the course block bottom line indicates "(教室: [Room ID])". If grouped by Classroom, it indicates the Teacher.
- [ ] AC 5: Given there's an upcoming class flagged with "即將上課" in the UI (simulated by injecting test elements), when the day's schedule is exported, then "即將上課" does NOT appear. Furthermore, when in "All Schedules" mode, the prefix (e.g. `[國中] 教室 101`) still correctly appears.

## Additional Context

### Dependencies

- `jsPDF`
- `jsPDF-AutoTable`

### Testing Strategy

- **Manual Testing**:
  1. Open App. Use browser DevTools to manually inject a `<span class="upcoming-badge">即將上課</span>` into a left-column 教室/老師 tag.
  2. Select Day View > Group by Classroom. Download PDF. Check Title centering, top-left cell, and left column names (no "即將上課", but ensure "All Schedules" view still shows the bracketed group title if tested there).
  3. Select Day View > Group by Teacher. Download PDF. Check course block bottom line is `(教室: ...)`.
  4. Select Week View > Group by Teacher. Download PDF. Check course block bottom line is `(教室: ...)`.
  5. Select Week View > Group by Classroom. Download PDF. Check course block bottom line correctly shows Teacher Name.
  6. Check top-left diagonal cell design bounds.

### Notes

- Because JS strings output vertically differently in normal text vs canvas-like context, the manual PDF `.text()` adjustments inside the cell must employ the coordinates available reliably in `data.cell` during `didDrawCell`.
