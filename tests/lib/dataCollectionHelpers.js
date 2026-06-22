/**
 * Data collection helpers — extracted from JavaScript.html App object.
 * Ref: #95 — Wave 2B test coverage
 *
 * These are pure-function extractions of App methods that iterate
 * over scheduleData structures to collect unique values.
 *
 * Original methods depend on `this.scheduleData`, `this.schedules`,
 * and `this._forEachCourse`; extracted versions accept these as params.
 */

import { forEachCourse } from './stateHelpers.js';

/**
 * Collects unique values from a single schedule's data using a collector function.
 * Original: App._collectFromScheduleData (JavaScript.html L797-803)
 *
 * @param {Object} dataSource - scheduleData: { classroom: { day: [courses] } }
 * @param {function(course, Set): void} collectorFn - receives (course, resultSet)
 * @returns {string[]} Sorted array of unique collected values
 */
export function collectFromScheduleData(dataSource, collectorFn) {
  const resultSet = new Set();
  forEachCourse(dataSource, (course) => {
    collectorFn(course, resultSet);
  });
  return Array.from(resultSet).sort();
}

/**
 * Gets all unique tags from a single schedule's data.
 * Original: App.getAllTags (JavaScript.html L805-811)
 *
 * @param {Object} scheduleData - { classroom: { day: [courses] } }
 * @returns {string[]} Sorted array of unique tags
 */
export function getAllTags(scheduleData) {
  return collectFromScheduleData(scheduleData, (classItem, resultSet) => {
    if (classItem.tags && Array.isArray(classItem.tags)) {
      classItem.tags.forEach(tag => resultSet.add(tag));
    }
  });
}

/**
 * Collects unique values across ALL schedules' data.
 * Original: App._collectFromAllCourses (JavaScript.html L813-832)
 *
 * @param {Object} schedules - { scheduleId: { data: { scheduleData: {...} } } }
 * @param {function(course, Set): void} collectorFn - receives (classItem, resultSet)
 * @returns {string[]} Sorted array of unique collected values
 */
export function collectFromAllCourses(schedules, collectorFn) {
  const resultSet = new Set();
  if (!schedules) return [];

  Object.values(schedules).forEach(schedule => {
    if (schedule.data && schedule.data.scheduleData) {
      Object.values(schedule.data.scheduleData).forEach(classroom => {
        if (!classroom) return;
        Object.values(classroom).forEach(daySchedule => {
          if (Array.isArray(daySchedule)) {
            daySchedule.forEach(classItem => {
              collectorFn(classItem, resultSet);
            });
          }
        });
      });
    }
  });
  return Array.from(resultSet).sort();
}

/**
 * Gets all unique tags across ALL schedules.
 * Original: App.getGlobalAllTags (JavaScript.html L834-840)
 *
 * @param {Object} schedules
 * @returns {string[]}
 */
export function getGlobalAllTags(schedules) {
  return collectFromAllCourses(schedules, (classItem, resultSet) => {
    if (classItem.tags && Array.isArray(classItem.tags)) {
      classItem.tags.forEach(tag => resultSet.add(tag));
    }
  });
}

/**
 * Gets all unique course names across ALL schedules.
 * Original: App.getGlobalAllCourseNames (JavaScript.html L842-848)
 *
 * @param {Object} schedules
 * @returns {string[]}
 */
export function getGlobalAllCourseNames(schedules) {
  return collectFromAllCourses(schedules, (classItem, resultSet) => {
    if (classItem.name) {
      resultSet.add(classItem.name);
    }
  });
}

/**
 * Gets all unique teachers across ALL schedules.
 * Original: App.getGlobalAllTeachers (JavaScript.html L850-856)
 *
 * @param {Object} schedules
 * @returns {string[]}
 */
export function getGlobalAllTeachers(schedules) {
  return collectFromAllCourses(schedules, (classItem, resultSet) => {
    if (classItem.teacher) {
      resultSet.add(classItem.teacher);
    }
  });
}

/**
 * Loads persisted tag filters from localStorage and returns validated state.
 * Original: App.loadAndApplyPersistedFilters (JavaScript.html L402-431)
 *
 * Extracted pure logic: reads from storage, validates against current tags,
 * and returns the resulting filter state + any storage updates needed.
 * The original method also calls UI update methods (side effects) which
 * are not included here.
 *
 * @param {Object} storage - localStorage-like object with getItem/setItem/removeItem
 * @param {string[]} allCurrentTags - all valid tags from current schedule data
 * @returns {{ activeFilters: Array<{type: string, value: string}>, storageAction: 'none'|'update'|'remove', updatedValue?: string }}
 */
export function loadPersistedFilters(storage, allCurrentTags) {
  const persistedTagsJSON = storage.getItem('activeTagFilters');

  if (!persistedTagsJSON) {
    return { activeFilters: [], storageAction: 'none' };
  }

  try {
    const persistedTags = JSON.parse(persistedTagsJSON);
    const tagSet = new Set(allCurrentTags);
    const validPersistedTags = persistedTags.filter(tag => tagSet.has(tag));
    const activeFilters = validPersistedTags.map(tag => ({ type: 'tag', value: tag }));

    const needsUpdate = persistedTags.length !== validPersistedTags.length;

    return {
      activeFilters,
      storageAction: needsUpdate ? 'update' : 'none',
      updatedValue: needsUpdate ? JSON.stringify(validPersistedTags) : undefined,
    };
  } catch (e) {
    return { activeFilters: [], storageAction: 'remove' };
  }
}
