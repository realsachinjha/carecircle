import { z } from "zod";
import { SLOTS } from "@/lib/gemini/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const baseSchedule = z.object({
  slot: z.enum(SLOTS),
  target_time: time,
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
});

export const scheduleSchema = z
  .discriminatedUnion("frequency_type", [
    baseSchedule.extend({ frequency_type: z.literal("DAILY") }),
    baseSchedule.extend({
      frequency_type: z.literal("SPECIFIC_DAYS"),
      weekdays: z
        .array(z.number().int().min(1).max(7))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length),
    }),
    baseSchedule.extend({ frequency_type: z.literal("EVERY_N_DAYS"), interval_days: z.number().int().min(2).max(30) }),
  ])
  .refine((schedule) => !schedule.end_date || schedule.end_date >= schedule.start_date, {
    path: ["end_date"],
  });

export const medicineSchema = z.object({
  name: z.string().trim().min(1).max(255),
  dosage: z.string().trim().min(1).max(64),
  instructions: z.string().trim().max(1000).nullable().optional(),
  schedules: z.array(scheduleSchema).min(1).max(6),
});

export const approvalSchema = z.object({ medicines: z.array(medicineSchema).min(1).max(30) });

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type MedicineInput = z.infer<typeof medicineSchema>;