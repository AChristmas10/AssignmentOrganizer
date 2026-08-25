/**
 * Do2Date — all date logic, in one place, all of it timezone-explicit.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Do2Date stores a due date as a wall-clock pair: { due: "2026-09-04",
 * time: "23:59" }. That is a good representation — "the essay is due Friday
 * 11:59pm" means the same thing in Raleigh and in Rome, and storing an absolute
 * instant would force a conversion nobody asked for. The bug was never the
 * storage. It was the arithmetic.
 *
 * The old recurring-assignment code did this:
 *
 *     const base = new Date("2026-03-05");        // UTC midnight
 *     base.setDate(base.getDate() + 7);           // LOCAL time arithmetic
 *     base.toISOString().split("T")[0];           // read back as UTC
 *
 * Parse in UTC, add in local, read back in UTC. Those three cancel out neatly
 * until a DST boundary falls inside the span, and then they don't. A weekly
 * assignment starting March 5 2026 in America/New_York produced March 11 for
 * its second occurrence instead of March 12 — spring forward ate a day, and
 * every later occurrence inherited the error.
 *
 * The fix is not a cleverer Date call. It is to stop mixing calendars: do
 * calendar arithmetic in UTC (where no DST exists), and do "is this late?"
 * comparisons against an explicit IANA zone. Never the browser's implicit one,
 * because a student who flies home for break should not have deadlines shift
 * under them.
 *
 * Loaded as a plain <script> — attaches to window.Do2DateDates. Also importable
 * by the vitest suite in dates.test.js, which is the reason for the wrapper.
 */
(function (root, factory) {
  var api = factory();
  root.Do2DateDates = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY_MS = 86400000;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var TIME_RE = /^(\d{2}):(\d{2})$/;

  /**
   * Whether Intl recognises this as a time zone.
   *
   * Worth guarding because Intl.DateTimeFormat throws a RangeError on an
   * unknown zone, and every function below routes through it. A junk value in
   * the stored profile would not degrade the app — it would throw on every
   * assignment row at once and render a blank page.
   */
  function isValidTimeZone(timeZone) {
    if (!timeZone || !String(timeZone).trim()) return false;
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timeZone });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Best-effort zone from the browser, for defaulting a new profile only. */
  function detectTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      return "UTC";
    }
  }

  /** Y-M-D in a specific zone, as a lexicographically comparable string. */
  function ymdInZone(date, timeZone) {
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    var get = function (t) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === t) return parts[i].value;
      }
      return "";
    };
    return get("year") + "-" + get("month") + "-" + get("day");
  }

  /** Today's calendar date in the student's zone. */
  function todayInZone(timeZone, now) {
    return ymdInZone(now || new Date(), timeZone);
  }

  /**
   * Add whole calendar days to a YYYY-MM-DD string.
   *
   * THIS IS THE FUNCTION THAT FIXES RECURRING ASSIGNMENTS. It works entirely in
   * UTC, where every day is exactly 24 hours and DST does not exist, so
   * "September 4 plus 7 days" is September 11 in every timezone on earth —
   * which is what a student means when they say an assignment repeats weekly.
   *
   * Returns null on a malformed input rather than an Invalid Date that
   * propagates silently into stored data.
   */
  function addCalendarDays(dateStr, days) {
    var m = DATE_RE.exec(String(dateStr).trim());
    if (!m) return null;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);

    var base = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC rolls over out-of-range parts instead of rejecting them — month
    // 13 day 45 becomes February of the next year rather than NaN. Comparing
    // the components back is the only way to catch a bogus input.
    if (
      base.getUTCFullYear() !== year ||
      base.getUTCMonth() !== month - 1 ||
      base.getUTCDate() !== day
    ) {
      return null;
    }

    var moved = new Date(base.getTime() + days * DAY_MS);
    return moved.toISOString().slice(0, 10);
  }

  /** Whole days between two instants, measured by calendar day in `timeZone`. */
  function calendarDaysBetween(from, to, timeZone) {
    var a = Date.parse(ymdInZone(from, timeZone) + "T00:00:00Z");
    var b = Date.parse(ymdInZone(to, timeZone) + "T00:00:00Z");
    return Math.round((b - a) / DAY_MS);
  }

  /** Whole days between two YYYY-MM-DD strings. No zone needed — both float. */
  function calendarDaysBetweenDateStrings(fromStr, toStr) {
    var a = Date.parse(fromStr + "T00:00:00Z");
    var b = Date.parse(toStr + "T00:00:00Z");
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / DAY_MS);
  }

  /** How far `timeZone` sits from UTC at a given instant, in milliseconds. */
  function tzOffsetMs(date, timeZone) {
    var dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    var p = {};
    var parts = dtf.formatToParts(date);
    for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
    // Some ICU builds emit "24" for midnight under hour12:false.
    var hour = p.hour === "24" ? "00" : p.hour;
    var asUtc = Date.parse(
      p.year + "-" + p.month + "-" + p.day + "T" + hour + ":" + p.minute + ":" + p.second + "Z"
    );
    return asUtc - date.getTime();
  }

  /**
   * A wall-clock date + time in the student's zone → the actual instant.
   *
   * DST edges are handled by resolving the offset twice: once against a naive
   * guess, then again against the corrected instant. A time that does not exist
   * (02:30 on spring-forward morning) resolves to a real instant on the SAME
   * calendar date rather than throwing or sliding into the next day — a student
   * who picks 2:30am on March 8 should not find their deadline on March 9.
   */
  function zonedWallClockToInstant(dateStr, timeStr, timeZone) {
    var time = TIME_RE.test(String(timeStr || "")) ? timeStr : "23:59";
    var naive = Date.parse(dateStr + "T" + time + ":00Z");
    if (isNaN(naive)) return null;
    var instant = new Date(naive - tzOffsetMs(new Date(naive), timeZone));
    instant = new Date(naive - tzOffsetMs(instant, timeZone));
    return instant;
  }

  /**
   * The instant an item is actually due.
   *
   * Assignments carry `due`; tests carry `date`. Accepting both keeps every
   * caller from having to remember which is which — a papercut that has already
   * produced one silent `undefined` in the calendar view.
   */
  function dueInstant(item, timeZone) {
    if (!item) return null;
    var dateStr = item.due || item.date;
    if (!dateStr || !DATE_RE.test(String(dateStr).trim())) return null;
    return zonedWallClockToInstant(String(dateStr).trim(), item.time, timeZone);
  }

  /**
   * Urgency bucket. Every caller pairs this with a TEXT label, never colour
   * alone — colour-blind students exist, and phones get used in sunlight.
   */
  function dueBucket(item, timeZone, now) {
    var reference = now || new Date();
    if (!item) return "no_date";

    var isDone =
      item.progress === 10 || item.prepared === 10 || item.done === true;
    if (isDone) return "done";

    var dateStr = item.due || item.date;
    if (!dateStr || !DATE_RE.test(String(dateStr).trim())) return "no_date";

    var due = dueInstant(item, timeZone);
    if (!due) return "no_date";

    var days = calendarDaysBetweenDateStrings(
      todayInZone(timeZone, reference),
      String(dateStr).trim()
    );
    if (days === null) return "no_date";

    if (days < 0) return "overdue";
    if (days === 0) {
      // An item due today at 23:59 is not late at 9am. One due at 09:00 is late
      // at 10am. The old code called everything due today "Due today" until
      // midnight, which is why students reported items that were already late
      // still looking fine.
      return due.getTime() < reference.getTime() ? "overdue" : "today";
    }
    if (days === 1) return "tomorrow";
    if (days <= 7) return "this_week";
    return "later";
  }

  var BUCKET_LABELS = {
    overdue: "Past due",
    today: "Due today",
    tomorrow: "Due tomorrow",
    this_week: "Due this week",
    later: "Later",
    no_date: "No due date",
    done: "Done",
  };

  var BUCKET_COLORS = {
    overdue: "var(--danger)",
    today: "var(--warning)",
    tomorrow: "var(--warning)",
    this_week: "var(--primary)",
    later: "var(--text-secondary)",
    no_date: "var(--text-secondary)",
    done: "var(--success)",
  };

  /**
   * Human "due in" text, timezone-explicit.
   *
   * Drop-in replacement for the old dueInText(), which called `new Date()` and
   * compared against the browser's zone. Same phrasing, so nothing on screen
   * changes for a student sitting still — it only stops being wrong for one
   * who has travelled.
   */
  function dueInText(item, timeZone, now) {
    var reference = now || new Date();
    var normalized =
      typeof item === "string" ? { due: item } : item || {};
    var dateStr = normalized.due || normalized.date;
    if (!dateStr || !DATE_RE.test(String(dateStr).trim())) return "No due date";

    var days = calendarDaysBetweenDateStrings(
      todayInZone(timeZone, reference),
      String(dateStr).trim()
    );
    if (days === null) return "No due date";

    if (days < 0) return "Past due";
    if (days === 0) {
      var bucket = dueBucket(normalized, timeZone, reference);
      return bucket === "overdue" ? "Past due" : "Due today";
    }
    if (days === 1) return "Due tomorrow";
    if (days < 7) return "Due in " + days + " day" + (days > 1 ? "s" : "");

    var weeks = Math.floor(days / 7);
    var rest = days % 7;
    var text = "Due in " + weeks + " week" + (weeks > 1 ? "s" : "");
    if (rest > 0) text += " and " + rest + " day" + (rest > 1 ? "s" : "");
    return text;
  }

  /**
   * Format a bare YYYY-MM-DD as MM/DD. Floating date, so format in UTC.
   *
   * Passing the student's zone here would be the original bug in reverse: it
   * would shift a date that has no timezone to begin with.
   */
  function formatDateShort(dateStr) {
    var m = DATE_RE.exec(String(dateStr || "").trim());
    if (!m) return "";
    return m[2] + "/" + m[3];
  }

  /**
   * Format a syllabus key date — "Oct 12, 2026".
   *
   * Key dates out of a syllabus are floating calendar dates: "the midterm is on
   * October 12" is true in every timezone. Returns the input unchanged when it
   * is not a plain date, because Claude is instructed to put un-datable
   * references like "Week 4" into notes rather than guessing.
   */
  function formatCalendarDate(value) {
    var m = DATE_RE.exec(String(value || "").trim());
    if (!m) return value;

    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);
    var instant = new Date(Date.UTC(year, month - 1, day));

    if (
      instant.getUTCFullYear() !== year ||
      instant.getUTCMonth() !== month - 1 ||
      instant.getUTCDate() !== day
    ) {
      return value;
    }

    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(instant);
  }

  /** 24h "HH:MM" → "H:MM AM/PM". Pure string work, no zone involved. */
  function formatTime(timeStr) {
    var m = TIME_RE.exec(String(timeStr || "").trim());
    if (!m) return "";
    var hours = Number(m[1]);
    var minutes = m[2];
    var period = hours >= 12 ? "PM" : "AM";
    var display = hours % 12 || 12;
    return display + ":" + minutes + " " + period;
  }

  /** Is this a well-formed YYYY-MM-DD that names a real day? */
  function isValidDateString(value) {
    return addCalendarDays(value, 0) === String(value).trim();
  }

  return {
    DAY_MS: DAY_MS,
    isValidTimeZone: isValidTimeZone,
    detectTimeZone: detectTimeZone,
    ymdInZone: ymdInZone,
    todayInZone: todayInZone,
    addCalendarDays: addCalendarDays,
    calendarDaysBetween: calendarDaysBetween,
    calendarDaysBetweenDateStrings: calendarDaysBetweenDateStrings,
    zonedWallClockToInstant: zonedWallClockToInstant,
    dueInstant: dueInstant,
    dueBucket: dueBucket,
    dueInText: dueInText,
    formatDateShort: formatDateShort,
    formatCalendarDate: formatCalendarDate,
    formatTime: formatTime,
    isValidDateString: isValidDateString,
    BUCKET_LABELS: BUCKET_LABELS,
    BUCKET_COLORS: BUCKET_COLORS,
  };
});
