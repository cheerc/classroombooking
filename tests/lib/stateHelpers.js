// Extracted state-dependent helper functions for testing.
// Ref: #151 — ping-pong TDD trial V2 (state-dependent functions).
// Source: JavaScript.html L1038-1065 (App object methods).
//
// These functions are extracted copies of App._forEachCourse,
// App.countOccurrences, and App.updateAllOccurrences.
// The originals depend on `this.scheduleData` and `this._forEachCourse`;
// the extracted versions accept scheduleData as an explicit parameter (DI).

/**
 * Iterate over every course in a scheduleData structure.
 *
 * scheduleData shape:
 *   { [classroom: string]: { [day: string]: Array<course> } }
 *
 * callback receives (course, classroom, day).
 *
 * @param {object|null|undefined} dataSource - The scheduleData object.
 * @param {Function} callback - Called for each course entry.
 */
export function forEachCourse(dataSource, callback) {
  if (!dataSource) return;
  for (const classroom in dataSource) {
    for (const day in dataSource[classroom]) {
      dataSource[classroom][day].forEach(course => {
        callback(course, classroom, day);
      });
    }
  }
}

/**
 * Count courses matching a predicate within scheduleData.
 *
 * Original: App.countOccurrences (depends on this._forEachCourse + this.scheduleData).
 * Extracted: accepts scheduleData as parameter, calls forEachCourse internally.
 *
 * @param {object} scheduleData - The scheduleData object.
 * @param {Function} predicate - Returns true for courses to count.
 * @returns {number} Count of matching courses.
 */
export function countOccurrences(scheduleData, predicate) {
  let count = 0;
  forEachCourse(scheduleData, course => {
    if (predicate(course)) {
      count++;
    }
  });
  return count;
}

/**
 * Update all courses matching a predicate within scheduleData (in-place mutation).
 *
 * Original: App.updateAllOccurrences (depends on this._forEachCourse + this.scheduleData).
 * Extracted: accepts scheduleData as parameter, calls forEachCourse internally.
 *
 * @param {object} scheduleData - The scheduleData object (mutated in place).
 * @param {Function} predicate - Returns true for courses to update.
 * @param {Function} updateFn - Called with each matching course to mutate it.
 */
export function updateAllOccurrences(scheduleData, predicate, updateFn) {
  forEachCourse(scheduleData, course => {
    if (predicate(course)) {
      updateFn(course);
    }
  });
}
