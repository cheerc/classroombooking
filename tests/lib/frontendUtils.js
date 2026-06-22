/**
 * Pure frontend utility functions extracted from GAS HTML scriptlets.
 * These are standalone functions that can be imported directly by tests.
 * Ref: #72, #73 — Wave A P0 pure logic extraction
 */

/**
 * Converts a time string "HH:MM" to minutes since midnight.
 * Ref: JavaScript.html L960-968
 * @param {string} timeStr - Time in "HH:MM" format.
 * @returns {number} Minutes since midnight, or 0 on parse error.
 */
export function timeToMinutes(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  } catch (e) {
    return 0;
  }
}

/**
 * Checks if a new class conflicts with existing classes in a time slot.
 * Ref: JavaScript.html L948-957
 * @param {object} newClass - { id, timeStart, timeEnd }
 * @param {Array<object>} existingClasses - Array of { id, timeStart, timeEnd }
 * @returns {boolean} True if there is a time conflict.
 */
export function checkTimeConflict(newClass, existingClasses) {
  if (!existingClasses || existingClasses.length === 0) return false;
  const newStart = timeToMinutes(newClass.timeStart);
  const newEnd = timeToMinutes(newClass.timeEnd);
  return existingClasses.some((existingClass) => {
    if (existingClass.id === newClass.id) return false;
    const existingStart = timeToMinutes(existingClass.timeStart);
    const existingEnd = timeToMinutes(existingClass.timeEnd);
    return newStart < existingEnd && newEnd > existingStart;
  });
}

/**
 * Generic filter function that filters schedule data by a predicate.
 * Ref: JavaScript.html L991-1008
 * @param {object} data - Schedule data { classroom: { day: [courses] } }
 * @param {function} filterPredicate - Predicate to test each course.
 * @returns {object} Filtered data with empty classrooms/days removed.
 */
export function filterScheduleData(data, filterPredicate) {
  const filteredData = {};
  for (const classroom in data) {
    const dayData = data[classroom];
    const newDayData = {};
    let classroomHasCourses = false;
    for (const day in dayData) {
      const filteredCourses = dayData[day].filter(filterPredicate);
      if (filteredCourses.length > 0) {
        newDayData[day] = filteredCourses;
        classroomHasCourses = true;
      }
    }
    if (classroomHasCourses) {
      filteredData[classroom] = newDayData;
    }
  }
  return filteredData;
}

/**
 * Filters schedule data by tag filters.
 * Ref: JavaScript.html L1011-1018
 * @param {object} data - Schedule data
 * @param {Array<{type: string, value: string}>} activeFilters - Active filter list
 * @returns {object} Filtered data
 */
export function filterDataByTags(data, activeFilters) {
  const tagFilters = new Set(activeFilters.filter(f => f.type === 'tag').map(f => f.value));
  if (tagFilters.size === 0) {
    return data;
  }
  return filterScheduleData(data, course =>
    course.tags && course.tags.some(d => tagFilters.has(d))
  );
}

/**
 * Filters schedule data by all active filter types (name, tag, teacher).
 * Ref: JavaScript.html L1021-1035
 * @param {object} data - Schedule data
 * @param {Array<{type: string, value: string}>} activeFilters - Active filter list
 * @returns {object} Filtered data
 */
export function filterDataByActiveFilters(data, activeFilters) {
  const nameFilters = new Set(activeFilters.filter(f => f.type === 'name').map(f => f.value));
  const tagFilters = new Set(activeFilters.filter(f => f.type === 'tag').map(f => f.value));
  const teacherFilters = new Set(activeFilters.filter(f => f.type === 'teacher').map(f => f.value));

  if (nameFilters.size === 0 && tagFilters.size === 0 && teacherFilters.size === 0) {
    return data;
  }

  return filterScheduleData(data, course => {
    const nameMatch = nameFilters.size === 0 || nameFilters.has(course.name);
    const tagMatch = tagFilters.size === 0 || (course.tags && course.tags.some(d => tagFilters.has(d)));
    const teacherMatch = teacherFilters.size === 0 || teacherFilters.has(course.teacher);
    return nameMatch && tagMatch && teacherMatch;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave B: Server-dependent pure logic extractions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extracts per-schedule timestamps from getData result and cleans them from schedule data.
 * Ref: JavaScript.html L616-624 — loadDataFromServer timestamp extraction
 * @param {object} schedules - Raw schedules from server { id: { name, data, lastModified, ... } }
 * @returns {{ cleanedSchedules: object, timestamps: object }}
 */
export function extractTimestamps(schedules) {
  const timestamps = {};
  const cleanedSchedules = { ...schedules };
  for (const id in cleanedSchedules) {
    if (cleanedSchedules[id].lastModified) {
      timestamps[id] = cleanedSchedules[id].lastModified;
      // Clone to avoid mutating input
      cleanedSchedules[id] = { ...cleanedSchedules[id] };
      delete cleanedSchedules[id].lastModified;
    }
  }
  return { cleanedSchedules, timestamps };
}

/**
 * Aggregates schedule data from all non-draft schedules into a merged view.
 * Ref: JavaScript.html L370-383 — handleScheduleSelectChange global view
 * @param {object} schedules - { id: { name, isDraft, data: { scheduleData } } }
 * @returns {object} Merged schedule data { classroom: { day: [courses] } }
 */
export function aggregateScheduleData(schedules) {
  const allSchedulesData = {};
  Object.values(schedules)
    .filter(schedule => !schedule.isDraft)
    .forEach(schedule => {
      if (schedule.data && schedule.data.scheduleData) {
        Object.entries(schedule.data.scheduleData).forEach(([classroom, days]) => {
          if (!allSchedulesData[classroom]) allSchedulesData[classroom] = {};
          Object.entries(days).forEach(([day, courses]) => {
            if (!allSchedulesData[classroom][day]) allSchedulesData[classroom][day] = [];
            allSchedulesData[classroom][day].push(...courses);
          });
        });
      }
    });
  return allSchedulesData;
}

/**
 * Validates course form data and returns error messages.
 * Ref: Interaction.js.html L216-224 — handleCourseFormSave validation
 * @param {object} formData - { name, teacher, tags, selectedDays, timeStart, timeEnd }
 * @param {function} timeToMinutesFn - Function to convert "HH:MM" to minutes
 * @returns {string|null} Error message string, or null if valid.
 */
export function validateCourseForm(formData, timeToMinutesFn) {
  const { name, teacher, tags, selectedDays, timeStart, timeEnd } = formData;
  if (!name) return '課程名稱不能為空！';
  if (!teacher) return '使用人不能為空！';
  if (!tags || tags.length === 0) return '請至少設定一個標籤！';
  if (!selectedDays || selectedDays.length === 0) return '請至少選擇一個星期！';
  if (!timeStart || !timeEnd) return '請輸入完整的開始與結束時間！';
  if (timeToMinutesFn(timeStart) >= timeToMinutesFn(timeEnd)) return '開始時間不能晚於或等於結束時間！';
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave C: Modals Promise flow extractions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parses showConfirm's backward-compatible isAlertOrOpts parameter.
 * Ref: Modals.js.html L115-126
 * @param {boolean|object} isAlertOrOpts - Boolean for backward compat, or { isAlert, allowHtml }
 * @returns {{ isAlert: boolean, allowHtml: boolean }}
 */
export function parseConfirmOptions(isAlertOrOpts = false) {
  const opts = typeof isAlertOrOpts === 'object' ? isAlertOrOpts : { isAlert: isAlertOrOpts };
  return {
    isAlert: opts.isAlert || false,
    allowHtml: opts.allowHtml || false,
  };
}

/**
 * Determines how to set modal text content based on allowHtml flag.
 * Ref: Modals.js.html L27-33
 * Returns 'innerHTML' or 'textContent' as the property to use.
 * @param {boolean} allowHtml
 * @returns {'innerHTML' | 'textContent'}
 */
export function getModalContentMethod(allowHtml) {
  return allowHtml ? 'innerHTML' : 'textContent';
}

/**
 * Determines the resolve value for a modal action.
 * Ref: Modals.js.html L53-61
 * @param {'ok' | 'cancel'} action - The user's action
 * @param {boolean} hasInput - Whether the modal has an input element
 * @param {string} [inputValue] - The input value if hasInput is true
 * @returns {boolean | string | null}
 */
export function resolveModalAction(action, hasInput, inputValue = '') {
  if (action === 'ok') {
    return hasInput ? inputValue : true;
  }
  // cancel
  return hasInput ? null : false;
}
