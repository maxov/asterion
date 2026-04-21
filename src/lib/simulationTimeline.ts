import { DAY_MS } from "./orbits.ts";

export type SimulationTimeline = {
  anchorDateMs: number;
  anchorSystemMs: number;
  daysPerSecond: number;
  isPlaying: boolean;
};

export const REALTIME_DAYS_PER_SECOND = 1 / 86_400;

function padUtcField(value: number) {
  return value.toString().padStart(2, "0");
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

export function formatUtcDateTimeInputValue(dateMs: number) {
  const date = new Date(dateMs);

  return [
    `${date.getUTCFullYear()}-${padUtcField(date.getUTCMonth() + 1)}-${padUtcField(date.getUTCDate())}`,
    `${padUtcField(date.getUTCHours())}:${padUtcField(date.getUTCMinutes())}:${padUtcField(date.getUTCSeconds())}`,
  ].join("T");
}

export function parseUtcDateTimeInputValue(value: string) {
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
  const parsed = Date.UTC(year, monthIndex, day, hour, minute, second);

  if (!Number.isFinite(parsed)) return null;

  const date = new Date(parsed);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return parsed;
}

export function parseUtcTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
