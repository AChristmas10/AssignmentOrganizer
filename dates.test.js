/**
 * Tests for dates.js.
 *
 * These import the real module. That matters: the habit this replaces is a
 * scratch script that pastes a copy of the implementation in to "check the
 * logic", which can pass while the file the app actually loads is broken.
 *
 * When you change date behaviour, add a row to the tables below rather than
 * bolting on a one-off assertion — the tables are the point.
 */
import { describe, expect, it } from "vitest";

// Imported for its side effect, then read off the global. dates.js is a plain
// <script> in the browser and attaches itself to globalThis; reading it back
// the same way the browser does means these tests exercise the exact code path
// the app uses, under any module loader.
import "./dates.js";
const D = globalThis.Do2DateDates;

/**
 * Zones chosen to break things, not to be representative:
 *  - negative offsets, where the classic UTC-midnight bug shows up
 *  - a half-hour offset (Kolkata) and a three-quarter-hour one (Chatham)
 *  - a southern-hemisphere zone, where DST runs the other way round
 *  - a zone with no DST at all, as the control
 */
const ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Chatham",
];

/** Every 2026 DST transition the zones above go through, in both hemispheres. */
const DST_DATES = [
  "2026-03-08", // US spring forward
  "2026-03-29", // EU spring forward
  "2026-04-05", // Sydney + Chatham DST ends
  "2026-09-27", // Chatham DST starts
  "2026-10-04", // Sydney DST starts
  "2026-10-25", // EU falls back
  "2026-11-01", // US falls back
];

describe("addCalendarDays", () => {
  it("is the fix for the recurring-assignment DST bug", () => {
    // The regression that started this. The old code did
    //   new Date("2026-03-05")  ->  setDate(getDate() + 7)  ->  toISOString()
    // which mixed UTC parsing with local-time arithmetic and returned
    // 2026-03-11 in US zones, because spring forward is March 8.
    expect(D.addCalendarDays("2026-03-05", 7)).toBe("2026-03-12");
    expect(D.addCalendarDays("2026-03-05", 14)).toBe("2026-03-19");
    expect(D.addCalendarDays("2026-03-05", 21)).toBe("2026-03-26");
  });

  it("generates a full weekly series across spring forward", () => {
    const start = "2026-02-26";
    const series = [0, 1, 2, 3, 4, 5].map((i) =>
      D.addCalendarDays(start, i * 7),
    );
    expect(series).toEqual([
      "2026-02-26",
      "2026-03-05",
      "2026-03-12",
      "2026-03-19",
      "2026-03-26",
      "2026-04-02",
    ]);
  });

  it("generates a biweekly series across fall back", () => {
    const start = "2026-10-08";
    const series = [0, 1, 2, 3].map((i) => D.addCalendarDays(start, i * 14));
    expect(series).toEqual([
      "2026-10-08",
      "2026-10-22",
      "2026-11-05",
      "2026-11-19",
    ]);
  });

  it.each(DST_DATES)("adds 1 day cleanly across %s", (date) => {
    const next = D.addCalendarDays(date, 1);
    expect(D.calendarDaysBetweenDateStrings(date, next)).toBe(1);
  });

  it("crosses month, year, and leap-day boundaries", () => {
    expect(D.addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(D.addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(D.addCalendarDays("2028-02-28", 1)).toBe("2028-02-29"); // leap
    expect(D.addCalendarDays("2026-02-28", 1)).toBe("2026-03-01"); // not leap
    expect(D.addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rejects malformed input instead of rolling it over", () => {
    // Date.UTC(2026, 12, 45) silently becomes February 2027. Storing that as a
    // due date would be worse than refusing it.
    expect(D.addCalendarDays("2026-13-01", 0)).toBeNull();
    expect(D.addCalendarDays("2026-02-30", 0)).toBeNull();
    expect(D.addCalendarDays("not a date", 0)).toBeNull();
    expect(D.addCalendarDays("", 1)).toBeNull();
  });
});

describe("zonedWallClockToInstant", () => {
  it.each(ZONES)("keeps an 11:59pm item on its own date in %s", (zone) => {
    for (const date of DST_DATES) {
      const instant = D.zonedWallClockToInstant(date, "23:59", zone);
      expect(D.ymdInZone(instant, zone)).toBe(date);
    }
  });

  it.each(ZONES)("round-trips a timed item at every hour in %s", (zone) => {
    for (let hour = 0; hour < 24; hour++) {
      const time = `${String(hour).padStart(2, "0")}:30`;
      const instant = D.zonedWallClockToInstant("2026-09-04", time, zone);
      expect(D.ymdInZone(instant, zone)).toBe("2026-09-04");
    }
  });

  it("resolves a nonexistent wall-clock time to the same calendar date", () => {
    // 02:30 on US spring-forward morning does not exist — the clock jumps from
    // 01:59:59 to 03:00:00. A student who picks it should land on a real
    // instant still on March 8, not silently on March 9.
    const instant = D.zonedWallClockToInstant(
      "2026-03-08",
      "02:30",
      "America/New_York",
    );
    expect(instant).not.toBeNull();
    expect(Number.isNaN(instant.getTime())).toBe(false);
    expect(D.ymdInZone(instant, "America/New_York")).toBe("2026-03-08");
  });

  it("handles the repeated hour on fall-back day", () => {
    // 01:30 happens twice on November 1. Either instant is defensible; landing
    // on November 1 is not optional.
    const instant = D.zonedWallClockToInstant(
      "2026-11-01",
      "01:30",
      "America/New_York",
    );
    expect(D.ymdInZone(instant, "America/New_York")).toBe("2026-11-01");
  });
});

describe("dueBucket", () => {
  it.each(ZONES)(
    "never reports an all-day item as overdue on its due date in %s",
    (zone) => {
      // The property that matters most to a student: an assignment due today
      // reads "Due today" all day, not "Past due" from some arbitrary hour.
      const due = "2026-09-04";
      for (let hour = 0; hour < 24; hour++) {
        const now = D.zonedWallClockToInstant(
          due,
          `${String(hour).padStart(2, "0")}:00`,
          zone,
        );
        const bucket = D.dueBucket({ due, time: "23:59", progress: 0 }, zone, now);
        expect(bucket).toBe("today");
      }
    },
  );

  it("does mark a timed item overdue once its time has passed", () => {
    const zone = "America/New_York";
    const due = "2026-09-04";
    const before = D.zonedWallClockToInstant(due, "08:00", zone);
    const after = D.zonedWallClockToInstant(due, "10:00", zone);
    const item = { due, time: "09:00", progress: 0 };

    expect(D.dueBucket(item, zone, before)).toBe("today");
    expect(D.dueBucket(item, zone, after)).toBe("overdue");
  });

  it("walks the buckets in order as the due date recedes", () => {
    const zone = "America/Los_Angeles";
    const now = D.zonedWallClockToInstant("2026-09-04", "12:00", zone);
    const bucketOn = (due) =>
      D.dueBucket({ due, time: "23:59", progress: 0 }, zone, now);

    expect(bucketOn("2026-09-03")).toBe("overdue");
    expect(bucketOn("2026-09-04")).toBe("today");
    expect(bucketOn("2026-09-05")).toBe("tomorrow");
    expect(bucketOn("2026-09-09")).toBe("this_week");
    expect(bucketOn("2026-09-11")).toBe("this_week"); // exactly 7 days out
    expect(bucketOn("2026-09-12")).toBe("later");
  });

  it("treats a finished item as done regardless of date", () => {
    const zone = "America/New_York";
    const now = new Date("2026-12-01T12:00:00Z");
    expect(
      D.dueBucket({ due: "2026-01-01", time: "23:59", progress: 10 }, zone, now),
    ).toBe("done");
    // Tests use `prepared` and `date` rather than `progress` and `due`.
    expect(
      D.dueBucket({ date: "2026-01-01", prepared: 10 }, zone, now),
    ).toBe("done");
  });

  it("reads tests, which store their date under `date` not `due`", () => {
    const zone = "America/New_York";
    const now = D.zonedWallClockToInstant("2026-09-04", "12:00", zone);
    expect(D.dueBucket({ date: "2026-09-05", prepared: 0 }, zone, now)).toBe(
      "tomorrow",
    );
  });

  it("returns no_date rather than throwing on missing or junk dates", () => {
    const zone = "America/New_York";
    expect(D.dueBucket({ progress: 0 }, zone)).toBe("no_date");
    expect(D.dueBucket({ due: "", progress: 0 }, zone)).toBe("no_date");
    expect(D.dueBucket({ due: "Week 4", progress: 0 }, zone)).toBe("no_date");
    expect(D.dueBucket(null, zone)).toBe("no_date");
  });

  it("disagrees with the browser zone when the student is travelling", () => {
    // The whole reason the zone is a parameter. At this instant it is still
    // Sep 4 in Los Angeles but already Sep 5 in Sydney, so the same assignment
    // is "due today" for one student and "past due" for the other.
    const item = { due: "2026-09-04", time: "23:59", progress: 0 };
    const now = new Date("2026-09-05T05:00:00Z");
    expect(D.dueBucket(item, "America/Los_Angeles", now)).toBe("today");
    expect(D.dueBucket(item, "Australia/Sydney", now)).toBe("overdue");
  });
});

describe("dueInText", () => {
  const zone = "America/New_York";
  const now = () => D.zonedWallClockToInstant("2026-09-04", "12:00", zone);

  it("keeps the wording students already see", () => {
    const say = (due) => D.dueInText({ due, time: "23:59" }, zone, now());
    expect(say("2026-09-03")).toBe("Past due");
    expect(say("2026-09-04")).toBe("Due today");
    expect(say("2026-09-05")).toBe("Due tomorrow");
    expect(say("2026-09-07")).toBe("Due in 3 days");
    expect(say("2026-09-11")).toBe("Due in 1 week");
    expect(say("2026-09-13")).toBe("Due in 1 week and 2 days");
    expect(say("2026-09-18")).toBe("Due in 2 weeks");
  });

  it("accepts a bare date string, as the old helper did", () => {
    expect(D.dueInText("2026-09-05", zone, now())).toBe("Due tomorrow");
  });

  it("says 'Past due' for a timed item whose hour has passed today", () => {
    expect(
      D.dueInText({ due: "2026-09-04", time: "09:00" }, zone, now()),
    ).toBe("Past due");
  });
});

describe("formatCalendarDate", () => {
  it.each(ZONES)("does not shift a floating syllabus date in %s", () => {
    // A key date out of a syllabus has no timezone: "the midterm is October 12"
    // is true everywhere. Converting it would be the original bug in reverse.
    expect(D.formatCalendarDate("2026-10-12")).toBe("Oct 12, 2026");
    expect(D.formatCalendarDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(D.formatCalendarDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("passes through text Claude could not resolve to a date", () => {
    // The prompt tells the model to put un-datable references in notes and set
    // date to null, but a passthrough beats rendering "Invalid Date".
    expect(D.formatCalendarDate("Week 4")).toBe("Week 4");
    expect(D.formatCalendarDate("2026-13-45")).toBe("2026-13-45");
    expect(D.formatCalendarDate("")).toBe("");
  });
});

describe("formatDateShort and formatTime", () => {
  it("formats MM/DD without a timezone round-trip", () => {
    expect(D.formatDateShort("2026-09-04")).toBe("09/04");
    expect(D.formatDateShort("2026-12-31")).toBe("12/31");
    expect(D.formatDateShort("nope")).toBe("");
  });

  it("formats 12-hour times, including both noon and midnight", () => {
    expect(D.formatTime("23:59")).toBe("11:59 PM");
    expect(D.formatTime("00:00")).toBe("12:00 AM");
    expect(D.formatTime("12:00")).toBe("12:00 PM");
    expect(D.formatTime("09:05")).toBe("9:05 AM");
    expect(D.formatTime("")).toBe("");
  });
});

describe("isValidTimeZone", () => {
  it("accepts every zone this app is tested against", () => {
    for (const zone of ZONES) expect(D.isValidTimeZone(zone)).toBe(true);
  });

  it("rejects junk, so one bad profile value cannot blank the page", () => {
    expect(D.isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(D.isValidTimeZone("EST5EDT_typo")).toBe(false);
    expect(D.isValidTimeZone("")).toBe(false);
    expect(D.isValidTimeZone(null)).toBe(false);
    expect(D.isValidTimeZone(undefined)).toBe(false);
  });
});

describe("isValidDateString", () => {
  it("accepts real days and rejects impossible ones", () => {
    expect(D.isValidDateString("2026-09-04")).toBe(true);
    expect(D.isValidDateString("2028-02-29")).toBe(true);
    expect(D.isValidDateString("2026-02-29")).toBe(false);
    expect(D.isValidDateString("2026-9-4")).toBe(false);
  });
});
