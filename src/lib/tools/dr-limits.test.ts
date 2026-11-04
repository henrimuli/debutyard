import { describe, expect, it } from "vitest";
import { DAY, drVerdict, HOUR, limitMessage, waitText, type Usage } from "./dr-limits";

const now = new Date("2026-10-30T12:00:00Z");
const usage = (hour: number, day: number, oldestHourAgoMin = 30, oldestDayAgoH = 10): Usage => ({
  hour,
  day,
  oldestInHour: hour ? new Date(now.getTime() - oldestHourAgoMin * 60_000) : null,
  oldestInDay: day ? new Date(now.getTime() - oldestDayAgoH * HOUR) : null,
});

describe("Domain Rating checker limits", () => {
  it("gives signed-out visitors 5 an hour and 15 a day", () => {
    expect(drVerdict([usage(0, 0)], false, now)).toEqual({ ok: true, remaining: { hour: 4, day: 14 } });
    expect(drVerdict([usage(4, 10)], false, now)).toEqual({ ok: true, remaining: { hour: 0, day: 4 } });
    expect(drVerdict([usage(5, 5)], false, now)).toMatchObject({ ok: false, window: "hour" });
    expect(drVerdict([usage(1, 15)], false, now)).toMatchObject({ ok: false, window: "day" });
  });

  it("gives signed-in accounts 15 an hour and 40 a day, with every bucket needing room", () => {
    expect(drVerdict([usage(5, 5), usage(5, 5)], true, now)).toEqual({ ok: true, remaining: { hour: 9, day: 34 } });
    // The IP is full even though the account isn't.
    expect(drVerdict([usage(15, 20), usage(2, 2)], true, now)).toMatchObject({ ok: false, window: "hour" });
    expect(drVerdict([usage(0, 3), usage(0, 40)], true, now)).toMatchObject({ ok: false, window: "day" });
  });

  it("says when the oldest check in the full window drops out", () => {
    const v = drVerdict([usage(5, 5, 20)], false, now);
    expect(v).toEqual({ ok: false, window: "hour", retryAt: new Date(now.getTime() + 40 * 60_000) });
    const day = drVerdict([usage(0, 15, 0, 20)], false, now);
    expect(day).toMatchObject({ retryAt: new Date(now.getTime() - 20 * HOUR + DAY) });
    if (v.ok || day.ok) throw new Error("expected limits");
    expect(limitMessage(v, false, now)).toBe(
      "That's all your Domain Rating checks for this hour. Try again in 40 minutes. Signed-in accounts get more checks.",
    );
    expect(limitMessage(day, true, now)).toBe("That's all your Domain Rating checks for today. Try again in 4 hours.");
    expect(waitText(new Date(now.getTime() + 1000), now)).toBe("1 minute");
    expect(waitText(new Date(now.getTime() + 61 * 60_000), now)).toBe("2 hours");
  });
});
