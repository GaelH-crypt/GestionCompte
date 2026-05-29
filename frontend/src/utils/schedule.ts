// frontend/src/utils/schedule.ts
import { addDays, addMonths, addYears, startOfDay, endOfMonth, getDaysInMonth } from 'date-fns'
import type { RecurringTransaction, Frequency, Credit } from '@/types'

export interface ScheduleEntry {
  kind: 'recurring'
  date: Date
  recurring: RecurringTransaction
}

export interface CreditEntry {
  kind: 'credit'
  date: Date
  credit: Credit
}

export type AnyEntry = ScheduleEntry | CreditEntry

/**
 * Expands recurring transaction templates into individual occurrences.
 */
export function expandOccurrences(
  items: RecurringTransaction[],
  months: number
): ScheduleEntry[] {
  const today = startOfDay(new Date())
  const windowEnd = endOfMonth(addMonths(today, months - 1))

  if (months <= 0) return []

  const entries: ScheduleEntry[] = []

  for (const item of items) {
    if (!item.is_active) continue

    let current = startOfDay(new Date(item.next_occurrence))
    if (isNaN(current.getTime())) continue

    while (current < today) {
      current = advance(current, item.frequency)
    }

    while (current <= windowEnd) {
      entries.push({ kind: 'recurring', date: current, recurring: item })
      current = advance(current, item.frequency)
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime())
  return entries
}

/**
 * Expands active credits into monthly payment occurrences within the window.
 * Uses the credit's start_date day-of-month as the recurring payment day.
 */
export function expandCreditOccurrences(credits: Credit[], months: number): CreditEntry[] {
  const today = startOfDay(new Date())
  const windowEnd = endOfMonth(addMonths(today, months - 1))

  if (months <= 0) return []

  const entries: CreditEntry[] = []

  for (const credit of credits) {
    if (!credit.is_active) continue
    if (!credit.start_date) continue

    const parts = credit.start_date.split('-')
    const preferredDay = parseInt(parts[2], 10)
    if (isNaN(preferredDay)) continue

    const creditEndStr = credit.end_date || credit.estimated_end_date
    const creditEnd = creditEndStr ? startOfDay(new Date(creditEndStr)) : null

    // Find first payment on or after today using the credit's day-of-month
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() // 0-indexed

    // Try this month first
    let current = paymentDate(year, month, preferredDay)
    if (current < today) {
      // Move to next month
      if (month === 11) { year += 1; month = 0 } else { month += 1 }
      current = paymentDate(year, month, preferredDay)
    }

    while (current <= windowEnd) {
      if (!creditEnd || current <= creditEnd) {
        entries.push({ kind: 'credit', date: current, credit })
      }
      if (month === 11) { year += 1; month = 0 } else { month += 1 }
      current = paymentDate(year, month, preferredDay)
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime())
  return entries
}

/** Returns a Date for the given year/month and preferred day, capped to the last day of the month. */
function paymentDate(year: number, month: number, preferredDay: number): Date {
  const lastDay = getDaysInMonth(new Date(year, month, 1))
  return startOfDay(new Date(year, month, Math.min(preferredDay, lastDay)))
}

function advance(date: Date, frequency: Frequency): Date {
  if (frequency === 'weekly') return addDays(date, 7)
  if (frequency === 'yearly') return addYears(date, 1)
  return addMonths(date, 1)
}
