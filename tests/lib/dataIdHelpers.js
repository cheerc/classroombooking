// Extracted ensureDataIds + generateUniqueId for testing.
// Ref: #137 — ensureDataIds idempotency tests.
// Source: JavaScript.html L881-900 (App.ensureDataIds, App.generateUniqueId).
//
// The original `ensureDataIds` uses `this.generateUniqueId()` for ID generation.
// This extraction accepts an optional `idGenerator` parameter (DI) so tests
// can inject a deterministic generator for reproducible assertions.
//
// Key behavioral contracts preserved:
// - Traverses scheduleData → classroom → day → classItem
// - Only adds ID when classItem exists AND has no `.id`
// - Returns scheduleData (mutates in place)
// - Null/falsy scheduleData → returns {}
// - Null/falsy classroom/daySchedule → skipped gracefully

/**
 * Generate a unique ID (mirrors App.generateUniqueId).
 * Original: JavaScript.html L898-900.
 *
 * @returns {string} A time-based + random ID string.
 */
export function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Ensure every class item in scheduleData has an `id` property.
 *
 * Original: App.ensureDataIds (JavaScript.html L881-896).
 * Mutates in place — items without `.id` get one assigned.
 * Items already having `.id` are left unchanged (idempotent).
 *
 * @param {object|null|undefined} scheduleData - The schedule data object.
 *   Shape: { [classroom: string]: { [day: string]: Array<{ id?: string, ... }> } }
 * @param {function} [idGenerator=generateUniqueId] - DI for ID generation.
 * @returns {object} The (possibly mutated) scheduleData, or {} if falsy input.
 */
export function ensureDataIds(scheduleData, idGenerator = generateUniqueId) {
  if (!scheduleData) return {};
  Object.values(scheduleData).forEach(classroom => {
    if (!classroom) return;
    Object.values(classroom).forEach(daySchedule => {
      if (Array.isArray(daySchedule)) {
        daySchedule.forEach(classItem => {
          if (classItem && !classItem.id) {
            classItem.id = idGenerator();
          }
        });
      }
    });
  });
  return scheduleData;
}
