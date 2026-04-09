import { addDays, format, parseISO } from "date-fns";

export const buildWeekDates = (weekStartDate: string): string[] => {
  const startDate = parseISO(weekStartDate);
  const weekDates: string[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    weekDates.push(format(addDays(startDate, dayOffset), "yyyy-MM-dd"));
  }

  return weekDates;
};
