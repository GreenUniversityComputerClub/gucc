/**
 * How long an announcement email takes to reach everyone, within the free email allowance. Pure,
 * so the compose page and the API agree.
 *
 * Announcement emails never use the reserves kept for account and security mail, go out at most
 * `hourlyMax` an hour (SMTP2GO takes about 25 an hour from a sender without a verified domain),
 * and stop for the month when the month's share is used.
 */
export interface CampaignAllowance {
  dailyLimit: number;
  monthlyLimit: number;
  dailyReserve: number;
  monthlyReserve: number;
  hourlyMax: number;
  /** Emails already sent today and this month (all kinds). */
  today: number;
  month: number;
}

export interface DeliveryEstimate {
  /** Announcement emails a full day can carry. */
  perDay: number;
  /** Left for announcements today and this month. */
  todayLeft: number;
  monthLeft: number;
  /** Days until the last one goes (1 = today), or null when they can't all go this month. */
  days: number | null;
  /** How many have to wait for next month's allowance. */
  nextMonth: number;
}

export function estimateDelivery(total: number, a: CampaignAllowance): DeliveryEstimate {
  const perDay = Math.max(0, Math.min(a.dailyLimit - a.dailyReserve, 24 * a.hourlyMax));
  const todayLeft = Math.max(0, Math.min(perDay, a.dailyLimit - a.dailyReserve - a.today));
  const monthLeft = Math.max(0, a.monthlyLimit - a.monthlyReserve - a.month);
  const thisMonth = Math.min(total, monthLeft);
  const nextMonth = total - thisMonth;
  let days: number | null = null;
  if (nextMonth === 0 && (thisMonth === 0 || perDay > 0)) {
    days = thisMonth <= todayLeft ? 1 : 1 + Math.ceil((thisMonth - todayLeft) / perDay);
  }
  return { perDay, todayLeft, monthLeft, days, nextMonth };
}

/** "today", "within 3 days", or why not. */
export function describeEstimate(total: number, e: DeliveryEstimate): string {
  if (total === 0) return "Nobody to send to.";
  if (e.perDay === 0) return "Email allowance for announcements is zero: raise the daily limit or lower the reserve in Settings.";
  const when = e.days === null ? null : e.days === 1 ? "today" : `over about ${e.days} days`;
  if (e.nextMonth > 0) return `${(total - e.nextMonth).toLocaleString("en-US")} go this month; ${e.nextMonth.toLocaleString("en-US")} wait for next month's allowance (the 1st, UTC).`;
  return `All ${total.toLocaleString("en-US")} go out ${when}, at most ${e.perDay.toLocaleString("en-US")} a day.`;
}
