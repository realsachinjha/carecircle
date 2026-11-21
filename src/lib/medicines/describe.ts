import { strings } from "@/strings/en";

export function describeSchedule(schedule: {
  slot: string;
  target_time: string;
  frequency_type: string;
  weekdays: number[];
  interval_days: number;
  start_date: string;
  end_date: string;
}): string {
  const time = schedule.target_time.substring(0, 5);

  if (schedule.frequency_type === "DAILY") {
    const fromPart = schedule.start_date && schedule.end_date ? `, ${strings.medicines.describe.from} ${schedule.start_date}` : "";
    const untilPart = schedule.end_date ? ` ${strings.medicines.describe.until} ${schedule.end_date}` : "";
    return `${strings.medicines.describe.at} ${time}, ${strings.medicines.describe.everyDay}${fromPart}${untilPart}`;
  }

  if (schedule.frequency_type === "SPECIFIC_DAYS") {
    const dayNames = schedule.weekdays.map((d) => strings.medicines.weekdayNames[d as keyof typeof strings.medicines.weekdayNames]);
    return `${strings.medicines.describe.at} ${time}, ${strings.medicines.describe.on} ${dayNames.join(", ")}`;
  }

  const interval = schedule.interval_days;
  return `${strings.medicines.describe.at} ${time}, ${strings.medicines.describe.every} ${interval} ${interval === 1 ? "day" : strings.medicines.describe.days}`;
}