// Extracted utility functions for testing.
// Ref: JavaScript.html L902-908 — stringToHashCode (djb2 hash, pure, no deps)
// Ref: JavaScript.html L1108-1114 — hexToRgb (hex color → [r,g,b], pure)

/**
 * Converts a string to a numeric hash code using the djb2 algorithm.
 * @param {string} str - The input string to hash.
 * @returns {number} The computed hash code.
 */
export function stringToHashCode(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash;
}

/**
 * Converts a hex color string to an RGB array.
 * @param {string} hex - The hex color string (e.g., '#FF0000').
 * @returns {number[]} An array of [r, g, b] values (0-255). Defaults to [255, 255, 255] if input is falsy.
 */
export function hexToRgb(hex) {
  if (!hex) return [255, 255, 255]; // Default to white if color is undefined
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

// Ref: JavaScript.html L858-861 — getShortUserName (email → username, pure)

/**
 * Extracts the username portion from an email address.
 * @param {string} email - The email address (e.g., 'user@example.com').
 * @returns {string} The part before '@', or the original input if falsy or missing '@'.
 */
export function getShortUserName(email) {
  if (!email || email.indexOf('@') === -1) return email;
  return email.split('@')[0];
}

// Ref: JavaScript.html L970-978 — formatTime (time string normalization)
// Production depends on AppConfig.TIME_REGEX; extracted version accepts regex as parameter.

/**
 * Normalizes a time string to HH:MM format.
 * @param {string} timeStr - The time string (e.g., '9:5').
 * @param {RegExp} timeRegex - Regex to validate time format (production: AppConfig.TIME_REGEX).
 * @returns {string} Normalized time string (e.g., '09:05'), or '00:00' if invalid/falsy.
 */
export function formatTime(timeStr, timeRegex) {
  if (!timeStr) return '00:00';
  timeStr = timeStr.trim();
  if (timeRegex.test(timeStr)) {
    const [hours, minutes] = timeStr.split(':');
    return hours.padStart(2, '0') + ':' + minutes.padStart(2, '0');
  }
  return '00:00';
}

// Ref: JavaScript.html L980-988 — formatTimestampForFilename (timestamp → YYYYMMDD_HHmm, pure)

/**
 * Formats a timestamp into a filename-safe string.
 * @param {string|number} timestamp - A value parseable by new Date() (e.g., ISO string or epoch ms).
 * @returns {string} Formatted string like '20260622_1830', or '' if timestamp is falsy.
 */
export function formatTimestampForFilename(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${HH}${mm}`;
}

// Ref: JavaScript.html L932-946 — sortClassrooms (classroom list sorting, pure)
// Sort order: hundreds digit descending (3xx > 2xx > 1xx), then remainder ascending (01, 02, ...)

/**
 * Sorts a list of classroom names by floor (hundreds digit) descending,
 * then by room number (remainder) ascending.
 * Uses regex to extract the first numeric sequence from each name.
 * @param {string[]} classroomList - Array of classroom name strings.
 * @returns {string[]} A new sorted array. Returns original or [] on error.
 */
export function sortClassrooms(classroomList) {
  try {
    return [...classroomList].sort((a, b) => {
      const numA = parseInt((a.match(/\d+/) || ['0'])[0]);
      const numB = parseInt((b.match(/\d+/) || ['0'])[0]);
      const hundredsA = Math.floor(numA / 100);
      const hundredsB = Math.floor(numB / 100);
      if (hundredsA !== hundredsB) return hundredsB - hundredsA;
      return (numA % 100) - (numB % 100);
    });
  } catch (e) {
    console.error('排序教室失敗:', e);
    return classroomList || [];
  }
}

// Ref: JavaScript.html L881-896 — ensureDataIds (data ID補全)
// Production depends on this.generateUniqueId(); extracted version accepts it as parameter (DI).

/**
 * Ensures every class item in scheduleData has an `id` property.
 * Items without an `id` get one assigned via the provided generator.
 *
 * @param {object|null|undefined} scheduleData - { [classroom]: { [day]: classItem[] } }
 * @param {Function} generateId - ID generator function (production: Date.now().toString(36) + random)
 * @returns {object} The same scheduleData object (mutated in place), or {} if input is falsy.
 */
export function ensureDataIds(scheduleData, generateId) {
  if (!scheduleData) return {};
  Object.values(scheduleData).forEach(classroom => {
    if (!classroom) return;
    Object.values(classroom).forEach(daySchedule => {
      if (Array.isArray(daySchedule)) {
        daySchedule.forEach(classItem => {
          if (classItem && !classItem.id) {
            classItem.id = generateId();
          }
        });
      }
    });
  });
  return scheduleData;
}

// Ref: JavaScript.html L910-930 — buildCourseColorMap (課程色彩映射建構)
// Production depends on this.stringToHashCode + this.courseColorMap + AppConfig.COURSE_COLORS.
// Extracted version is pure: accepts dataSource + hashFn + colors, returns the map.

/**
 * Builds a mapping from course names to colors based on hash values.
 * Collects all unique course names, sorts them, and assigns colors
 * from the palette using djb2 hash modulo.
 *
 * @param {object|null|undefined} dataSource - { [classroom]: { [day]: { name }[] } }
 * @param {Function} hashFn - Hash function (production: stringToHashCode)
 * @param {string[]} courseColors - Color palette array (production: AppConfig.COURSE_COLORS)
 * @returns {object} Map of { [courseName]: colorString }
 */
export function buildCourseColorMap(dataSource, hashFn, courseColors) {
  const colorMap = {};
  if (!dataSource) return colorMap;

  const allNames = new Set();
  Object.values(dataSource).forEach(classroom => {
    if (!classroom) return;
    Object.values(classroom).forEach(daySchedule => {
      if (Array.isArray(daySchedule)) {
        daySchedule.forEach(item => allNames.add(item.name));
      }
    });
  });

  const sortedNames = Array.from(allNames).sort();
  sortedNames.forEach(name => {
    const hash = hashFn(name);
    const colorIndex = Math.abs(hash) % courseColors.length;
    colorMap[name] = courseColors[colorIndex];
  });

  return colorMap;
}
