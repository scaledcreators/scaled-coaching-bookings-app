export type AvailabilityWindow = {
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  coach_id?: string | null;
  offer_id?: string | null;
};

type CalendarDate = { year: number; month: number; day: number };
type ZonedParts = CalendarDate & { hour: number; minute: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  const existing = formatterCache.get(timezone);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timezone, created);
  return created;
}

export function zonedParts(date: Date, timezone: string): ZonedParts {
  const values = Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function sameWallTime(left: ZonedParts, right: ZonedParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute;
}

export function zonedDateTimeToUtc(parts: ZonedParts, timezone: string) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let instant = desired;

  // Intl exposes the local wall clock but not its offset. Iterating the
  // difference resolves the correct UTC instant and naturally follows DST.
  for (let pass = 0; pass < 3; pass += 1) {
    const observed = zonedParts(new Date(instant), timezone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
    const correction = desired - observedAsUtc;
    if (correction === 0) break;
    instant += correction;
  }

  const result = new Date(instant);
  return sameWallTime(zonedParts(result, timezone), parts) ? result : null;
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function weekday(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function chooseApplicableRules(rules: AvailabilityWindow[], coachId: string | null, offerId: string) {
  let applicable = rules;
  if (coachId && applicable.some((rule) => rule.coach_id === coachId)) {
    applicable = applicable.filter((rule) => rule.coach_id === coachId);
  } else {
    applicable = applicable.filter((rule) => rule.coach_id == null);
  }
  if (applicable.some((rule) => rule.offer_id === offerId)) {
    applicable = applicable.filter((rule) => rule.offer_id === offerId);
  } else {
    applicable = applicable.filter((rule) => rule.offer_id == null);
  }
  return applicable;
}

export function buildAvailabilityCandidates({
  rules,
  now,
  earliest,
  latest,
  durationMinutes,
  maxAdvanceDays,
  limit = 160,
}: {
  rules: AvailabilityWindow[];
  now: Date;
  earliest: Date;
  latest: Date;
  durationMinutes: number;
  maxAdvanceDays: number;
  limit?: number;
}) {
  const candidates = new Map<string, Date>();

  for (const rule of rules) {
    const localToday = zonedParts(now, rule.timezone);
    const ruleStart = minutes(rule.start_time);
    const ruleEnd = minutes(rule.end_time);
    for (let offset = 0; offset <= maxAdvanceDays; offset += 1) {
      const date = addCalendarDays(localToday, offset);
      if (weekday(date) !== rule.weekday) continue;
      for (let minute = ruleStart; minute + durationMinutes <= ruleEnd; minute += 30) {
        const candidate = zonedDateTimeToUtc(
          { ...date, hour: Math.floor(minute / 60), minute: minute % 60 },
          rule.timezone,
        );
        if (!candidate || candidate <= earliest || candidate > latest) continue;
        candidates.set(candidate.toISOString(), candidate);
      }
    }
  }

  return [...candidates.values()].sort((left, right) => left.getTime() - right.getTime()).slice(0, limit);
}

export function slotFitsAvailability(start: Date, end: Date, rules: AvailabilityWindow[]) {
  return rules.some((rule) => {
    const localStart = zonedParts(start, rule.timezone);
    const localEnd = zonedParts(end, rule.timezone);
    if (localStart.year !== localEnd.year || localStart.month !== localEnd.month || localStart.day !== localEnd.day) return false;
    if (weekday(localStart) !== rule.weekday) return false;
    const startMinute = localStart.hour * 60 + localStart.minute;
    const endMinute = localEnd.hour * 60 + localEnd.minute;
    const ruleStart = minutes(rule.start_time);
    const ruleEnd = minutes(rule.end_time);
    return startMinute >= ruleStart && endMinute <= ruleEnd && (startMinute - ruleStart) % 30 === 0;
  });
}
