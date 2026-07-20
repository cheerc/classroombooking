# 週檢視「依時間」時間軸模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為週檢視新增「依時間」排序模式——最左欄為資料驅動的時間軸、橫向對應週一～日、教室與老師顯示在課程卡內，且日檢視行為完全不變。

**Architecture:** 新增 `renderWeekViewByTime` 與現有三 render 函式並列；抽一份「攤平教室×日 → course[]」共用 helper 收斂四處重複；`createClassElement` 的欄位決策由單旗標擴為雙旗標（showTeacher/showClassroom）；`viewSortMode` 改為獨立 `lastViewSortMode` 持久化但 day restore 強制 `time`。coverage 排除所有 `.html`，故純邏輯在 `tests/lib/`（TDD、coverage-gated），production HTML 由 §手動 TestCases（provenance-bound 證據）gate。

**Tech Stack:** Google Apps Script V8 前端（`.js.html` include，`Index.html` 以 `HtmlService.createHtmlOutputFromFile` 組裝）+ 原生 JS + Tailwind；測試 = Vitest（`tests/lib/` 純函式 + `tests/unit/` spec）。

## Source of Truth

- **設計文件（VERIFIED @ f3ec3cb）**：`docs/plans/2026-07-20-week-view-time-axis-design.md`
- 本 plan 是該設計的 ordered 實作序列；行為/決策以設計文件為準，衝突時回報 lead。

## Global Constraints

- **不改**：`DataCollection.js.html` 的 upcoming producer guard、`JavaScript.html` 的每分鐘 timer（徽章維持 day-only，設計 §5.3 / §9）。
- **日檢視行為完全不變**（設計驗收 #9）：`renderDayViewByTime` 維持一課一列、教室左欄、notes；day restore 一律 `time`。
- **coverage gate**：`npm test` 需維持 lines 95 / functions 95 / branches 90 / statements 95（`vitest.config.js`）。純邏輯放 `tests/lib/`。
- **新增跨檔全域** → 必須同步 `.eslintrc.json` 的 `globals`（否則 `no-undef` error）。
- **送 review 前必跑** `./workflow.sh`（或等價 t1–t9），貼證據。
- **手動 TestCase 證據** 須帶 provenance：tested head SHA + `clasp push` dev 版/preview 識別 + 執行時間 + 執行者；驗收方以當前 PR head 核對，SHA 對不上 = 未驗收（設計 §7.2）。
- Commit 訊息尾附 `Closes t-XXX-N`（task board ID）供 TaskSweep 自動歸檔（PROJECT.md §9）。

## Required Reads（實作前全讀）

- `docs/plans/2026-07-20-week-view-time-axis-design.md`（設計，source of truth）
- `UI.js.html` — `renderScheduleTable`(489-525) / `setViewMode`(402-421) / `setViewSortMode`(423-428) / `updateViewControls`(436-487) / `renderDayViewByTime`(633-656) / `renderByTeacher`(658-707) / `renderByClassroom`(709-749) / `renderAllSchedulesView`(527-614) / `createClassElement`(338-377) / `addUpcomingClassIndicators`(616-631) / `setupDragAndDrop`(751-)
- `JavaScript.html:26-35`（constructor state 推導）、`:67-78`（timer，不改、僅確認）
- `PDFExport.js.html:252-280`（week branch 逐欄位抽取）
- `DataCollection.js.html:180-188`（upcoming producer，不改、僅確認 stale-clear）
- `Interaction.js.html:613-619`（`handleEmptyCellDoubleClick` — 空 cell 依 dataset 開新增）
- `Index.html:12-16, 468-482`（GAS 組裝順序；消費者 `UI.js.html`@473 / `JavaScript`@475）
- `.eslintrc.json`（globals）
- `tests/lib/uiHelpers.js`（`resolveRenderTarget` / `computeClassElementProps`）、`tests/unit/uiHelpers.test.js`、`tests/lib/integrationHelpers.js`、`tests/unit/integrationHelpers.test.js`
- `TestCases.md`（手動案例格式，B-1-1 週/日切換）

## 決策點：共用決策邏輯的落點（Task 1 前先定，設計 §7.2 第 2 道）

GAS `.html`（GAS runtime）與 vitest（Node ESM）**無法執行同一份 source 檔**，故「單一 authored source」為 best-effort。impl 二選一，**先做可行性判斷再進 Task 1**：

- **分支 A（優先，抽新 extracted-module）**：新增一個 `.js.html`（依 `DataCollection.js.html` IIFE 慣例）定義決策全域；production 在 `Index.html` 組裝區以 `HtmlService.createHtmlOutputFromFile('<現地 stem>').getContent()` 內嵌、**先於** `UI.js.html`(@473) 與 `JavaScript`(@475)；四個 call-site 實際呼叫該全域；`.eslintrc.json` globals 加該全域；`tests/lib/` import 其等價抽出。
- **分支 B（fallback，mirror + 交叉註解）**：production 各 call-site 保留 inline 邏輯，但每處加註解 `// mirror of tests/lib/uiHelpers.js:<fn>`，`tests/lib/` 為 coverage-gated 權威。**選 B 不放寬** production 正確性驗收——完全依賴手動 TestCases（WT-1~WT-8）。

> ⚠️ 檔名 stem 慣例在 `Index.html:468-482` 不一致（`:473` 用 `'UI.js.html'` 帶副檔名、`:476` 用 `'UtilityFunctions.js'` 去 `.html`）→ 選 A 時 impl 依 GAS 檔名解析對齊實際，不假設單一形式。

以下任務的 production 「wiring」步驟同時適用 A/B：A = 呼叫共享全域，B = inline 並加 mirror 交叉註解。

---

### Task 1: 持久化 — 獨立 `lastViewSortMode` + view-scoped restore

**Files:**
- Test: `tests/lib/uiHelpers.js`（新增 `resolveRestoredSort` 純函式）、`tests/unit/uiHelpers.test.js`
- Modify: `UI.js.html:423-428`（`setViewSortMode`）、`UI.js.html:413-418`（`setViewMode` 移除強制轉換）、`JavaScript.html:26-35`（constructor restore）
- （分支 A）Create: 新 `.js.html`；Modify: `Index.html`、`.eslintrc.json`

**Interfaces:**
- Produces: `resolveRestoredSort({ currentViewMode, storedSort, dayMode, weekMode }) → 'classroom'|'teacher'|'time'`
  - `currentViewMode === dayMode` → `'time'`（強制，忽略 storedSort）
  - `currentViewMode === weekMode` → storedSort ∈ {classroom,teacher,time} ? storedSort : `'classroom'`

- [ ] **Step 1: 寫失敗測試（restore 決策）**

在 `tests/unit/uiHelpers.test.js` 新增（import 補 `resolveRestoredSort`）：

```javascript
describe('resolveRestoredSort', () => {
  const base = { dayMode: 'day', weekMode: 'week' };
  it('week + stored time restores time (week+time persists)', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'week', storedSort: 'time' })).toBe('time');
  });
  it('day forces time regardless of stored teacher (day behavior unchanged)', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'day', storedSort: 'teacher' })).toBe('time');
  });
  it('week + illegal stored falls back to classroom', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'week', storedSort: 'bogus' })).toBe('classroom');
  });
  it('week + missing key (null) falls back to classroom (back-compat)', () => {
    expect(resolveRestoredSort({ ...base, currentViewMode: 'week', storedSort: null })).toBe('classroom');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- uiHelpers`
Expected: FAIL — `resolveRestoredSort is not a function`

- [ ] **Step 3: 實作 `resolveRestoredSort`（`tests/lib/uiHelpers.js`）**

```javascript
/**
 * View-scoped sort restore. Day always forces 'time' (day behavior unchanged);
 * only week reads the persisted sort with legal-value fallback.
 * Mirror of production restore in JavaScript.html:26-35.
 */
export function resolveRestoredSort({ currentViewMode, storedSort, dayMode, weekMode }) {
  if (currentViewMode === dayMode) return 'time';
  const legal = ['classroom', 'teacher', 'time'];
  return legal.includes(storedSort) ? storedSort : 'classroom';
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- uiHelpers`
Expected: PASS

- [ ] **Step 5: production wiring — 寫入持久化**

`UI.js.html` `setViewSortMode`（現 423-428）改為：

```javascript
    setViewSortMode: function(mode) {
        if (app.viewSortMode === mode) return;
        app.viewSortMode = mode;
        localStorage.setItem('lastViewSortMode', mode);
        // The actual button state is updated in updateViewControls
        this.renderScheduleTable();
    },
```

- [ ] **Step 6: production wiring — 移除 week 強制轉換**

`UI.js.html` `setViewMode` 的 else 分支（現 413-418）改為（week 不再把 time 打回 classroom）：

```javascript
        } else { // mode === AppConfig.MODES.WEEK
            // Week view now supports the 'time' sort; no forced downgrade.
        }
```

- [ ] **Step 7: production wiring — constructor restore（view-scoped）**

`JavaScript.html:26-35` 的 state 推導改為讀 `lastViewSortMode` 並經 view-scoped fallback（day 強制 time、week 讀 key）。等價於 `resolveRestoredSort`（選 A 則呼叫共享全域，選 B 則 inline 並註解 `// mirror of tests/lib/uiHelpers.js:resolveRestoredSort`）：

```javascript
            currentViewMode: localStorage.getItem('lastViewMode') || AppConfig.MODES.WEEK,
            viewSortMode: (function() {
                const vm = localStorage.getItem('lastViewMode') || AppConfig.MODES.WEEK;
                if (vm === AppConfig.MODES.DAY) return 'time';
                const stored = localStorage.getItem('lastViewSortMode');
                return ['classroom', 'teacher', 'time'].includes(stored) ? stored : 'classroom';
            })(),
```

`currentDayIndex` 的既有 IIFE（28-35）不變。

- [ ] **Step 8: （分支 A only）新 extracted-module + Index.html + eslintrc**

若走分支 A：建立新 `.js.html`（IIFE 定義決策全域含 `resolveRestoredSort` 等），`Index.html` 於 `:473`（UI.js.html）**之前**加一行 `<?!= HtmlService.createHtmlOutputFromFile('<現地 stem>').getContent(); ?>`，`.eslintrc.json` `globals` 加 `"<全域名>": "readonly"`。分支 B 跳過本步。

- [ ] **Step 9: 跑 full workflow + commit**

Run: `./workflow.sh`（t1–t9）
Expected: 全綠

```bash
git add tests/lib/uiHelpers.js tests/unit/uiHelpers.test.js UI.js.html JavaScript.html
# 分支 A 另加：git add <新.js.html> Index.html .eslintrc.json
git commit -m "feat: view-scoped lastViewSortMode persistence (week+time survives refresh) (refs #162)"
```

---

### Task 2: Render dispatch — week+time 導向新 renderer

**Files:**
- Test: `tests/lib/uiHelpers.js`（`resolveRenderTarget`）、`tests/unit/uiHelpers.test.js:50-57`
- Modify: `UI.js.html:507-516`（`renderScheduleTable` 分派段）

**Interfaces:**
- Produces: `resolveRenderTarget` 對 `week+time` 回 `{ renderer: 'weekTime', ... }`；`day+time` 維持 `{ renderer: 'time', ... }`。

- [ ] **Step 1: 改期待（現有測試 uiHelpers.test.js:50-57）**

把「week + time falls back to classroom」測試改為期待新 renderer：

```javascript
  it('routes week + time to the week-time renderer', () => {
    const result = resolveRenderTarget({
      ...base,
      viewSortMode: 'time',
      currentViewMode: 'week',
    });
    expect(result).toEqual({ renderer: 'weekTime', shouldFilter: false });
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- uiHelpers`
Expected: FAIL — 回傳仍為 `renderer: 'classroom'`

- [ ] **Step 3: 改 `resolveRenderTarget`（`tests/lib/uiHelpers.js`）**

在 `currentViewMode === dayMode && viewSortMode === 'time'` 分支**之前**加 week+time 分支：

```javascript
  if (viewSortMode === 'classroom') {
    return { renderer: 'classroom', shouldFilter };
  } else if (viewSortMode === 'teacher') {
    return { renderer: 'teacher', shouldFilter };
  } else if (currentViewMode === dayMode && viewSortMode === 'time') {
    return { renderer: 'time', shouldFilter };
  } else if (viewSortMode === 'time') { // week + time
    return { renderer: 'weekTime', shouldFilter };
  }
  return { renderer: 'classroom', shouldFilter };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- uiHelpers`
Expected: PASS

- [ ] **Step 5: production wiring — renderScheduleTable 分派**

`UI.js.html` `renderScheduleTable`（507-516）的分派鏈加 week+time：

```javascript
            if (app.viewSortMode === 'classroom') {
                this.renderByClassroom(dataToRender);
            } else if (app.viewSortMode === 'teacher') {
                this.renderByTeacher(dataToRender);
            } else if (app.currentViewMode === AppConfig.MODES.DAY && app.viewSortMode === 'time') {
                this.renderDayViewByTime(dataToRender);
            } else if (app.viewSortMode === 'time') { // week + time
                this.renderWeekViewByTime(dataToRender);
            } else {
                this.renderByClassroom(dataToRender);
            }
```

- [ ] **Step 6: commit**

```bash
git add tests/lib/uiHelpers.js tests/unit/uiHelpers.test.js UI.js.html
git commit -m "feat: dispatch week+time to renderWeekViewByTime (refs #162)"
```

---

### Task 3: 課程卡欄位 — timeSort 雙旗標（老師＋教室）

**Files:**
- Test: `tests/lib/uiHelpers.js`（`computeClassElementProps`）、`tests/unit/uiHelpers.test.js`
- Modify: `UI.js.html:348-353`（`createClassElement` 的 contextSpecificHtml）

**Interfaces:**
- Produces: `computeClassElementProps(...).showTeacher` / `.showClassroom`（取代單一 `showClassroomInContent`）。
  - `default` → showTeacher:true, showClassroom:false
  - `teacherSort` → showTeacher:false, showClassroom:true
  - `timeSort` → showTeacher:true, showClassroom:true

- [ ] **Step 1: 寫失敗測試**

`tests/unit/uiHelpers.test.js` 新增：

```javascript
describe('computeClassElementProps field flags', () => {
  const appState = { currentViewMode: 'week', dayMode: 'day' };
  const item = { id: '1', name: 'A', tags: [] };
  it('default shows teacher only', () => {
    const p = computeClassElementProps(item, 'R1', 0, { viewContext: 'default' }, appState);
    expect([p.showTeacher, p.showClassroom]).toEqual([true, false]);
  });
  it('teacherSort shows classroom only', () => {
    const p = computeClassElementProps(item, 'R1', 0, { viewContext: 'teacherSort' }, appState);
    expect([p.showTeacher, p.showClassroom]).toEqual([false, true]);
  });
  it('timeSort shows both teacher and classroom', () => {
    const p = computeClassElementProps(item, 'R1', 0, { viewContext: 'timeSort' }, appState);
    expect([p.showTeacher, p.showClassroom]).toEqual([true, true]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- uiHelpers`
Expected: FAIL — `showTeacher`/`showClassroom` undefined

- [ ] **Step 3: 改 `computeClassElementProps`（`tests/lib/uiHelpers.js`）**

把 `const showClassroomInContent = viewContext === 'teacherSort';` 換為：

```javascript
  const showTeacher = viewContext === 'default' || viewContext === 'timeSort';
  const showClassroom = viewContext === 'teacherSort' || viewContext === 'timeSort';
```

並在 return 物件把 `showClassroomInContent` 換成 `showTeacher, showClassroom`（若有其他 consumer 也一併更新——grep `showClassroomInContent`）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- uiHelpers`
Expected: PASS

- [ ] **Step 5: production wiring — createClassElement**

`UI.js.html:348-353` 的 contextSpecificHtml 改為支援 timeSort 雙欄位：

```javascript
        let contextSpecificHtml = '';
        if (viewContext === 'teacherSort') {
            contextSpecificHtml = `<div>教室：${escapeHtml(classroom)}</div>`;
        } else if (viewContext === 'timeSort') {
            contextSpecificHtml = `<div class="editable" data-field="teacher">${escapeHtml(classItem.teacher)}</div><div>教室：${escapeHtml(classroom)}</div>`;
        } else {
            contextSpecificHtml = `<div class="editable" data-field="teacher">${escapeHtml(classItem.teacher)}</div>`;
        }
```

- [ ] **Step 6: commit**

```bash
git add tests/lib/uiHelpers.js tests/unit/uiHelpers.test.js UI.js.html
git commit -m "feat: timeSort card shows both teacher and classroom (refs #162)"
```

---

### Task 4: 共用攤平 helper + `renderWeekViewByTime`

**Files:**
- Test: `tests/lib/uiHelpers.js`（新增 `groupCoursesByStartTime`）、`tests/unit/uiHelpers.test.js`
- Modify: `UI.js.html` — 新增 `renderWeekViewByTime`；`renderDayViewByTime`/`renderByTeacher`/`renderAllSchedulesView` 改用共用攤平 helper

**Interfaces:**
- Produces:
  - `flattenCoursesForDays(dataToRender, days) → [{...course, classroom, day}]`（純資料攤平，供四處共用）
  - `groupCoursesByStartTime(flatCourses) → [{ timeStart, courses }]`（依 `timeToMinutes` 升冪；`timeToMinutes` 由呼叫端注入以利測試）

- [ ] **Step 1: 寫失敗測試（分組排序 + 7-day）**

```javascript
describe('groupCoursesByStartTime', () => {
  const t2m = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  it('groups by timeStart and sorts ascending', () => {
    const flat = [
      { timeStart: '13:30', classroom: 'R2', day: 1 },
      { timeStart: '09:10', classroom: 'R1', day: 0 },
      { timeStart: '09:10', classroom: 'R3', day: 2 },
    ];
    const g = groupCoursesByStartTime(flat, t2m);
    expect(g.map(x => x.timeStart)).toEqual(['09:10', '13:30']);
    expect(g[0].courses.length).toBe(2); // two rooms share 09:10
  });
  it('empty input yields empty groups', () => {
    expect(groupCoursesByStartTime([], t2m)).toEqual([]);
  });
  it('same start different end stay in one group', () => {
    const flat = [
      { timeStart: '09:10', timeEnd: '11:00', classroom: 'R1', day: 0 },
      { timeStart: '09:10', timeEnd: '10:00', classroom: 'R2', day: 0 },
    ];
    expect(groupCoursesByStartTime(flat, t2m).length).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- uiHelpers`
Expected: FAIL — 函式未定義

- [ ] **Step 3: 實作 helper（`tests/lib/uiHelpers.js`）**

```javascript
/** Flatten { classroom → day → course[] } into [{...course, classroom, day}] for given days. */
export function flattenCoursesForDays(dataToRender, days) {
  const out = [];
  for (const classroom in dataToRender) {
    for (const day of days) {
      const list = dataToRender[classroom] && dataToRender[classroom][day];
      if (list) list.forEach((course) => out.push({ ...course, classroom, day }));
    }
  }
  return out;
}

/** Group flat courses by timeStart, ascending by timeToMinutes (injected). */
export function groupCoursesByStartTime(flatCourses, timeToMinutes) {
  const map = new Map();
  for (const c of flatCourses) {
    if (!map.has(c.timeStart)) map.set(c.timeStart, []);
    map.get(c.timeStart).push(c);
  }
  return [...map.entries()]
    .sort((a, b) => timeToMinutes(a[0]) - timeToMinutes(b[0]))
    .map(([timeStart, courses]) => ({ timeStart, courses }));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- uiHelpers`
Expected: PASS

- [ ] **Step 5: production — 新增 `renderWeekViewByTime`（`UI.js.html`）**

在 `renderDayViewByTime` 之後新增。列 = 時間標籤；欄 = 週一～日（0–6）；同格多課垂直堆疊；卡片用 `timeSort` context；**空 cell 不設 `data-classroom`**（見 Task 6 完整 guard，此處已遵守）：

```javascript
    renderWeekViewByTime: function(dataToRender) {
        const days = [0, 1, 2, 3, 4, 5, 6];
        const flat = [];
        for (const classroom in dataToRender) {
            for (const day of days) {
                (dataToRender[classroom]?.[day] || []).forEach(course => {
                    flat.push({ ...course, classroom, day });
                });
            }
        }
        const groups = new Map();
        flat.forEach(c => {
            if (!groups.has(c.timeStart)) groups.set(c.timeStart, []);
            groups.get(c.timeStart).push(c);
        });
        const sorted = [...groups.entries()]
            .sort((a, b) => app.timeToMinutes(a[0]) - app.timeToMinutes(b[0]));

        sorted.forEach(([timeStart, courses]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="border border-gray-300 p-2 font-medium bg-gray-100 classroom-cell-stacked"><span class="classroom-name-main">${escapeHtml(timeStart)}</span></td>`;
            for (const day of days) {
                const td = document.createElement('td');
                td.setAttribute('class', 'border border-gray-300 p-2 schedule-cell align-top');
                td.dataset.day = day; // NOTE: no data-classroom (time×day has no natural room)
                courses.filter(c => c.day === day).forEach(course => {
                    const classDiv = this.createClassElement(course, course.classroom, day, { viewContext: 'timeSort' });
                    td.appendChild(classDiv);
                });
                tr.appendChild(td);
            }
            AppElements.scheduleBody.appendChild(tr);
        });
    },
```

- [ ] **Step 6: production 重構 — 三處攤平改用共用邏輯（順手，設計 §4.3）**

把 `renderDayViewByTime`(636-642) 的攤平迴圈抽為 production 端共用 helper（選 A：共享全域方法；選 B：`App` 上一個 private helper `App._flattenCoursesForDays`），並讓 `renderDayViewByTime` / `renderByTeacher` / `renderAllSchedulesView` 的等效迴圈改用它。**逐一保留原輸出行為**——重構後跑既有測試確認無回歸。

- [ ] **Step 7: 跑 full workflow 確認無回歸 + commit**

Run: `./workflow.sh`
Expected: 全綠（既有 render 測試不變）

```bash
git add tests/lib/uiHelpers.js tests/unit/uiHelpers.test.js UI.js.html
git commit -m "feat: add renderWeekViewByTime time-axis grid + shared flatten helper (refs #162)"
```

---

### Task 5: `updateViewControls` — 按鈕可見 + 週檢視 time 表頭

**Files:**
- Modify: `UI.js.html:436-487`（`updateViewControls`）

- [ ] **Step 1: 「依時間」按鈕兩種檢視皆顯示**

`UI.js.html:442` 現為 `AppElements.daySortTimeBtn.style.display = isDayView ? 'block' : 'none';` → 改為恆顯示：

```javascript
        AppElements.daySortTimeBtn.style.display = 'block';
```

- [ ] **Step 2: 週檢視 time 模式表頭左上角標籤**

`updateViewControls` 的 Week View 表頭段（476-484）：現 `weekViewHeaderLabel = app.viewSortMode === 'teacher' ? '老師' : '教室'`。time 模式左欄是時間 → 標籤改「時間」：

```javascript
            const weekViewHeaderLabel = app.viewSortMode === 'teacher' ? '老師'
                : app.viewSortMode === 'time' ? '時間' : '教室';
```

- [ ] **Step 3: 手動驗證 + commit**

手動：週檢視下「依時間」鈕出現、按下後表頭左上角顯示「星期／時間」（WT-1 證據）。

```bash
git add UI.js.html
git commit -m "feat: show 依時間 button in week view + 時間 header label (refs #162)"
```

---

### Task 6: 空 cell 無 classroom dataset（§5.5）+ 卡片 dataset 保留（§5.4）

**Files:**
- Modify: `UI.js.html`（`renderWeekViewByTime` 已在 Task 4 遵守；本 task 加防護性驗證）、確認 `Interaction.js.html:613-619` 路徑

- [ ] **Step 1: 確認 time-grid 空 cell 不觸發新增**

檢視 `Interaction.js.html:613-619` `handleEmptyCellDoubleClick` 依 `cell.dataset.classroom`/`cell.dataset.day` 開新增。`renderWeekViewByTime` 的 td **只設 `data-day`、不設 `data-classroom`** → double-click 時 handler 取不到 classroom。確認 handler 在缺 `classroom` 時 early-return 或不開表單；若否，在 handler 加 guard：

```javascript
// handleEmptyCellDoubleClick 起始加：
if (!cell.dataset.classroom) return; // time-grid cells have no natural classroom
```

- [ ] **Step 2: 確認課程卡仍帶 dataset（inline edit/delete 依賴）**

`createClassElement` 產生的 `.class-item` 已含 `dataset.classroom`/`dataset.day`（`UI.js.html:361-362`）→ timeSort 卡片沿用、不受影響。確認 inline edit/delete 在 time-grid 卡片可用（WT-3 順帶驗）。

- [ ] **Step 3: 手動驗證 + commit**

手動：time-grid 空白格 double-click 不開新增表單（WT-6）；time-grid 課程卡可 inline 編輯/刪除。

```bash
git add UI.js.html Interaction.js.html
git commit -m "fix: time-grid empty cells reject add, course cards keep edit dataset (refs #162)"
```

---

### Task 7: 全部課表 week-time 唯讀分支（§5.4 / WT-7）

**Files:**
- Modify: `UI.js.html:527-614`（`renderAllSchedulesView`）

- [ ] **Step 1: 加 week+time 分支（唯讀變體）**

`renderAllSchedulesView` 現有 `currentViewMode === DAY && viewSortMode === 'time'` 分支（562-587）。加對應的 **week + time** 分支：以 `renderWeekViewByTime` 相同的時間軸網格渲染，但每張卡 `classDiv.classList.add('readonly')`、`classDiv.querySelector('.delete-btn')?.remove()`（比照現有 all-schedules 唯讀處理 582-583），且 editable 欄位不繞過 `activeScheduleId === ALL_SCHEDULES_ID` guard。

```javascript
        } else if (app.currentViewMode === AppConfig.MODES.WEEK && app.viewSortMode === 'time') {
            const days = [0, 1, 2, 3, 4, 5, 6];
            const flat = [];
            for (const uniqueClassroomName in dataToRender) {
                for (const day of days) {
                    (dataToRender[uniqueClassroomName]?.[day] || []).forEach(course => {
                        flat.push({ ...course, classroom: uniqueClassroomName, day });
                    });
                }
            }
            const groups = new Map();
            flat.forEach(c => { if (!groups.has(c.timeStart)) groups.set(c.timeStart, []); groups.get(c.timeStart).push(c); });
            [...groups.entries()].sort((a, b) => app.timeToMinutes(a[0]) - app.timeToMinutes(b[0]))
              .forEach(([timeStart, courses]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td class="border border-gray-300 p-2 font-medium bg-gray-100 classroom-cell-stacked"><span class="classroom-name-main">${escapeHtml(timeStart)}</span></td>`;
                for (const day of days) {
                    const td = document.createElement('td');
                    td.setAttribute('class', 'border border-gray-300 p-2 schedule-cell align-top readonly-cell');
                    td.dataset.day = day;
                    courses.filter(c => c.day === day).forEach(course => {
                        const classDiv = this.createClassElement(course, course.classroom, day, { viewContext: 'timeSort' });
                        classDiv.classList.add('readonly');
                        classDiv.querySelector('.delete-btn')?.remove();
                        td.appendChild(classDiv);
                    });
                    tr.appendChild(td);
                }
                AppElements.scheduleBody.appendChild(tr);
              });
        }
```

（依 Task 4/選 A-B 決定是否改用共享攤平 helper；輸出行為以上為準。）

- [ ] **Step 2: 手動驗證 + commit**

手動：全部課表 + 週檢視 + 依時間 → 走時間軸網格（非 classroom fallback）、卡片唯讀無刪除鈕（WT-7）。

```bash
git add UI.js.html
git commit -m "feat: all-schedules week-time readonly time-axis branch (refs #162)"
```

---

### Task 8: PDF week-time 分支（老師＋教室，§5.2 / WT-5）

**Files:**
- Modify: `PDFExport.js.html:252-266`（week branch `bottomObj`）；左上角標籤段

- [ ] **Step 1: `bottomObj` 三分支**

`PDFExport.js.html:262-266` 現只有 teacher 分支改讀 classroom。加 time 分支使 time mode 同列老師與教室：

```javascript
                  let bottomObj = `(${refTeacher})`;
                  if (App.viewSortMode === 'teacher') {
                    const cRoom = item.dataset.classroom || '';
                    bottomObj = `(教室：${cRoom})`;
                  } else if (App.viewSortMode === 'time') {
                    const cRoom = item.dataset.classroom || '';
                    bottomObj = `${refTeacher} · ${cRoom}`;
                  }
```

- [ ] **Step 2: 對角標籤（week-time → 時間，且不動 day-time）**

`didDrawCellHooks`（`PDFExport.js.html:70-93`）畫左上角對角標籤，**day 與 week PDF 共用**（week autoTable `:312` 亦掛它）。`:91` 現為：

```javascript
          const bottomText = App.viewSortMode === 'teacher' ? '老師' : '教室';
```

⚠️ **不可只加 `time → 時間`**：day-time PDF 左欄是教室（`renderDayViewByTime` 一課一列、左欄教室），標籤「教室」正確；只有 week-time 左欄才是時間。故必須用 `currentViewMode` scope 到 week，否則改到 day-time、違反驗收 #9。改為：

```javascript
          let bottomText = App.viewSortMode === 'teacher' ? '老師' : '教室';
          if (App.currentViewMode === AppConfig.MODES.WEEK && App.viewSortMode === 'time') {
            bottomText = '時間';
          }
```

（Step 1 的 `bottomObj` body 分支位於 week branch `:252-266`、僅影響 week PDF；day-time body 在獨立 day branch `:160`、不受影響——故只有本 Step 的共用 hook 需 currentViewMode guard。）

- [ ] **Step 3: 手動驗證（PDF 匯出）+ commit**

手動：週檢視 time 匯出 PDF → 每張卡含老師且教室、左上角「星期／時間」（WT-5，附 PDF 檔）。

```bash
git add PDFExport.js.html
git commit -m "feat: week-time PDF outputs both teacher and classroom (refs #162)"
```

---

### Task 9: 契約測試 + mirror-only 標註 + 手動 TestCases

**Files:**
- Modify: `tests/lib/integrationHelpers.js`、`tests/unit/integrationHelpers.test.js`、`tests/lib/uiHelpers.js`（檔頭註解）、`TestCases.md`

- [ ] **Step 1: 契約加入新 render 函式**

`tests/lib/integrationHelpers.js` 的 ui factory 清單（70-85 段）加 `'renderWeekViewByTime'`；對應 `tests/unit/integrationHelpers.test.js` 若有 method-name assertion 一併更新。

- [ ] **Step 2: mirror-only 標註**

`tests/lib/uiHelpers.js` 檔頭 doc comment 加：

```javascript
/**
 * ⚠️ mirror-only: 本檔為 UI 決策邏輯的平行實作。本檔綠不代表 production
 * (.html) 正確——.html 被 coverage 排除。production HTML 正確性由
 * TestCases.md 的 WT-1~WT-8 手動案例（provenance-bound 證據）gate。
 */
```

- [ ] **Step 3: 寫入手動 TestCases（`TestCases.md`）**

加入 WT-1~WT-8（設計 §7.2 表），每案含通過判準與**證據 provenance 欄位**：tested head SHA / clasp dev 版或 preview 識別 / 執行時間 / 執行者。

- [ ] **Step 4: 跑 full workflow + commit**

Run: `./workflow.sh`
Expected: 全綠、coverage 維持 95/95/90/95

```bash
git add tests/lib/integrationHelpers.js tests/unit/integrationHelpers.test.js tests/lib/uiHelpers.js TestCases.md
git commit -m "test: week-time contract + mirror-only note + WT-1~WT-8 manual cases (refs #162)"
```

---

## 收尾：PR + 手動證據

- [ ] 開 PR（`writing-prs` skill），body 含 `Closes #162`、`Closes <task-id>`、workflow.sh t6 5/5 證據。
- [ ] 附 WT-1~WT-8 手動證據，每案標 provenance（tested head SHA + clasp dev 版/preview + 時間 + 執行者）。
- [ ] 回報 lead：PR URL + diff stat + 四個 production call-site 已驗真呼叫共享決策物件（分支 A）或已加 mirror 交叉註解（分支 B）。

## Self-Review 對照（plan ↔ 設計驗收）

| 設計驗收 | 對應 Task |
|---|---|
| #1 週檢視「依時間」鈕可見 | Task 5 |
| #2 左欄時間軸、橫向週一～日 | Task 4 |
| #3 卡片老師＋教室 | Task 3 |
| #4 可編輯/刪除/不可拖拉/無新增 | Task 6（dataset）+ 既有 setupDragAndDrop（time≠classroom 不可拖，無需改） |
| #5 refresh 仍 week+time | Task 1 |
| #6 全部課表唯讀時間軸 | Task 7 |
| #7 PDF 老師＋教室、標「星期／時間」 | Task 8 |
| #8 空 cell 不開新增 | Task 6 |
| #9 日檢視完全不變 | Task 1（day 強制 time）+ Task 4（不動 renderDayViewByTime 輸出）+ WT-8 |
