// Controle de presença: mínimo de 75% (limite de faltas = 25% da carga horária).
import { range, weekday } from './dates.js';

// schedule: [{ weekday: 1, hours: 2 }]  -> datas de aula entre início e fim
export function classDates({ start, end, schedule = [] }) {
  if (!start || !end || !schedule.length) return [];
  const byDay = new Map(schedule.map((s) => [Number(s.weekday), Number(s.hours) || 1]));
  return range(start, end)
    .filter((d) => byDay.has(weekday(d)))
    .map((d) => ({ date: d, hours: byDay.get(weekday(d)) }));
}

export function attendanceSummary(att, today) {
  const minPct = Number(att.minPct ?? 75);
  const dates = classDates(att);
  const records = att.records || {};
  const scheduled = dates.filter((d) => records[d.date] !== 'X');
  const totalHours = Number(att.totalHours) || scheduled.reduce((s, d) => s + d.hours, 0);
  const limit = Math.floor(totalHours * (1 - minPct / 100) * 10) / 10;
  let absent = 0;
  let present = 0;
  let pendingPast = 0;
  for (const d of scheduled) {
    const r = records[d.date];
    if (r === 'F') absent += d.hours;
    else if (r === 'P') present += d.hours;
    else if (d.date <= today) pendingPast++;
  }
  const avgHours = scheduled.length ? scheduled.reduce((s, d) => s + d.hours, 0) / scheduled.length : 2;
  const remaining = Math.round((limit - absent) * 10) / 10;
  const canMiss = Math.max(0, Math.floor(remaining / avgHours + 1e-9));
  const pct = totalHours ? ((totalHours - absent) / totalHours) * 100 : 100;
  let status = 'ok';
  if (remaining < 0) status = 'reprovada';
  else if (canMiss <= 1) status = 'limite';
  else if (absent >= limit / 2) status = 'atencao';
  return { totalHours, limit, absent, present, remaining, canMiss, pct, status, pendingPast, dates, minPct };
}
