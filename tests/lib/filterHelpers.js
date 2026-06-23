// Extracted filter pipeline functions for testing.
// Ref: #132 — Filter pipeline end-to-end behaviour tests.
// Source: JavaScript.html L991-1036 (App object methods).
//
// These functions are extracted copies of App._filterScheduleData,
// App.filterDataByTags, and App.filterDataByActiveFilters.
// The originals depend on `this.activeFilters` and `this._filterScheduleData`;
// the extracted versions accept activeFilters as an explicit parameter (DI).

/**
 * Filter scheduleData by a predicate applied to each course.
 *
 * Original: App._filterScheduleData (JavaScript.html L991-1008).
 *
 * scheduleData shape:
 *   { [classroom: string]: { [day: string|number]: Array<course> } }
 *
 * Returns a new object with only classrooms/days that have matching courses.
 * Classrooms with no matching courses are omitted entirely.
 * Days with no matching courses are omitted from a classroom.
 *
 * @param {object} data - The scheduleData object.
 * @param {Function} filterPredicate - Returns true for courses to keep.
 * @returns {object} Filtered scheduleData.
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
 * Filter scheduleData by tag filters extracted from activeFilters.
 *
 * Original: App.filterDataByTags (JavaScript.html L1011-1018).
 * Dependencies: activeFilters passed as parameter (DI).
 *
 * Behaviour:
 *   1. Extract tag-type filters from activeFilters.
 *   2. If no tag filters → return data unchanged (identity).
 *   3. Keep courses where course.tags contains at least one active tag (OR logic).
 *
 * @param {object} data - The scheduleData object.
 * @param {Array<{type: string, value: string}>} activeFilters - Active filters array.
 * @returns {object} Filtered scheduleData.
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
 * Filter scheduleData by all active filters (tag + name + teacher).
 *
 * Original: App.filterDataByActiveFilters (JavaScript.html L1021-1036).
 * Dependencies: activeFilters passed as parameter (DI).
 *
 * Behaviour:
 *   1. Extract name/tag/teacher-type filters from activeFilters.
 *   2. If all filter sets empty → return data unchanged (identity).
 *   3. Filter types combine with AND logic (course must match ALL active types).
 *   4. Within a type, values combine with OR logic (course matches if ANY value hits).
 *   5. A filter type with 0 entries is treated as "match all" for that type.
 *   6. Tag matching: course.tags must contain at least one active tag.
 *   7. Name matching: course.name must be one of the active name filters.
 *   8. Teacher matching: course.teacher must be one of the active teacher filters.
 *
 * @param {object} data - The scheduleData object.
 * @param {Array<{type: string, value: string}>} activeFilters - Active filters array.
 * @returns {object} Filtered scheduleData.
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
