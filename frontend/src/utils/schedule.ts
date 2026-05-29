// frontend/src/utils/schedule.ts
import { addDays, addMonths, addYears, startOfDay, endOfMonth } from 'date-fns'
import type { RecurringTransaction, Frequency } from '@/types'

export interface ScheduleEntry {
  date: Date
  recurring: RecurringTransaction
}

/**
 * Expands recurring transaction templates into individual occurrences
 * within a window of [today, today + months].
 */
export function expandOccurrences(
  items: RecurringTransaction[],
  months: number
): ScheduleEntry[] {
  const today = startOfDay(new Date())
  const windowEnd = endOfMonth(addMonths(today, months - 1))

  const entries: ScheduleEntry[] = []

  for (const item of items) {
    if (!item.is_active) continue

    let current = startOfDay(new Date(item.next_occurrence))

    // If next_occurrence is before today, advance until we're in range
    while (current < today) {
      current = advance(current, item.frequency)
    }

    while (current <= windowEnd) {
      entries.push({ date: current, recurring: item })
      current = advance(current, item.frequency)
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime())
  return entries
}

function advance(date: Date, frequency: Frequency): Date {
  if (frequency === 'weekly') return addDays(date, 7)
  if (frequency === 'yearly') return addYears(date, 1)
  return addMonths(date, 1)
}
