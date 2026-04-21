import { DAY_MS } from "./orbits.ts";

export type SimulationTimeline = {
  anchorDateMs: number;
  anchorSystemMs: number;
  daysPerSecond: number;
  isPlaying: boolean;
};

export const REALTIME_DAYS_PER_SECOND = 1 / 86_400;

function padDateField(value: number) {
  return value.toString().padStart(2, "0");
}

function timeZoneOffsetLabel(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `UTC${sign}${padDateField(hours)}:${padDateField(minutes)}`;
}

export function timelineSystemMs() {
  return globalThis.performance?.now() ?? Date.now();
}

export function createSimulationTimeline(
  anchorDateMs = Date.now(),
): SimulationTimeline {
  return {
    anchorDateMs,
    anchorSystemMs: timelineSystemMs(),
    daysPerSecond: REALTIME_DAYS_PER_SECOND,
    isPlaying: true,
  };
}

export function currentSimulationDateMs(
  timeline: SimulationTimeline,
  systemMs: number,
) {
  if (!timeline.isPlaying) return timeline.anchorDateMs;

  return (
    timeline.anchorDateMs +
    ((systemMs - timeline.anchorSystemMs) / 1000) * timeline.daysPerSecond * DAY_MS
  );
}

export function rebaseSimulationTimeline(
  timeline: SimulationTimeline,
  updates: Partial<Omit<SimulationTimeline, "anchorSystemMs">>,
  systemMs: number,
): SimulationTimeline {
  const currentDateMs = currentSimulationDateMs(timeline, systemMs);

  return {
    anchorDateMs: updates.anchorDateMs ?? currentDateMs,
    anchorSystemMs: systemMs,
    daysPerSecond: updates.daysPerSecond ?? timeline.daysPerSecond,
    isPlaying: updates.isPlaying ?? timeline.isPlaying,
  };
}

export function formatUtcTimestamp(dateMs: number) {
  return new Date(dateMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function localTimeZoneName(dateMs = Date.now()) {
  const date = new Date(dateMs);

  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).formatToParts(date);
    const timeZoneName = parts.find(
      (part) => part.type === "timeZoneName",
    )?.value;

    return timeZoneName ?? timeZoneOffsetLabel(date);
  } catch {
    return timeZoneOffsetLabel(date);
  }
}

export function formatLocalTimestamp(dateMs: number) {
  const date = new Date(dateMs);

  return [
    `${date.getFullYear()}-${padDateField(date.getMonth() + 1)}-${padDateField(date.getDate())}`,
    `${padDateField(date.getHours())}:${padDateField(date.getMinutes())}:${padDateField(date.getSeconds())}`,
    localTimeZoneName(dateMs),
  ].join(" ");
}

export function formatLocalDateTimeInputValue(dateMs: number) {
  const date = new Date(dateMs);

  return [
    `${date.getFullYear()}-${padDateField(date.getMonth() + 1)}-${padDateField(date.getDate())}`,
    `${padDateField(date.getHours())}:${padDateField(date.getMinutes())}:${padDateField(date.getSeconds())}`,
  ].join("T");
}

export function parseLocalDateTimeInputValue(value: string) {
  const match = value
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );

  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const parsed = new Date(year, monthIndex, day, hour, minute, second);

  if (!Number.isFinite(parsed.getTime())) return null;

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    return null;
  }

  return parsed.getTime();
}

export function parseUtcTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
