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
