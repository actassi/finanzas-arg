function isoToUTCDate(iso: string) {
  // Mediodía UTC para evitar problemas de TZ
  return new Date(`${iso}T12:00:00Z`);
}

function addDaysISO(iso: string, days: number) {
  const d = isoToUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampDay(y: number, m0: number, day: number) {
  const last = new Date(Date.UTC(y, m0 + 1, 0, 12, 0, 0)).getUTCDate();
  return Math.min(day, last);
}

function makeISO(y: number, m0: number, day: number) {
  const d = new Date(Date.UTC(y, m0, day, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

function prevMonthCutoffISO(cutOffISO: string, cutOffDay: number) {
  const y = Number(cutOffISO.slice(0, 4));
  const m0 = Number(cutOffISO.slice(5, 7)) - 1;

  let py = y;
  let pm0 = m0 - 1;
  if (pm0 < 0) {
    pm0 = 11;
    py = y - 1;
  }

  const d = clampDay(py, pm0, cutOffDay);
  return makeISO(py, pm0, d);
}

function inferStatementDateRange(
  batch: {
    statement_period_start: string | null;
    statement_period_end: string | null;
    cut_off_date: string | null;
    due_date: string | null;
  },
  cutOffDay?: number
): { from: string; to: string } | null {
  // Prioridad 1: período explícito
  const end = batch.statement_period_end ?? batch.cut_off_date ?? null;
  const start = batch.statement_period_start ?? null;

  if (start && end) return { from: start, to: end };

  // Prioridad 2: inferir por corte + cut_off_day
  if (batch.cut_off_date && cutOffDay) {
    const prevCut = prevMonthCutoffISO(batch.cut_off_date, cutOffDay);
    const from = addDaysISO(prevCut, 1);
    const to = batch.cut_off_date;
    return { from, to };
  }

  // Prioridad 3: fallback: ventana de ~35 días terminando en corte (o vencimiento si es lo único)
  const fallbackEnd = batch.cut_off_date ?? batch.due_date ?? null;
  if (!fallbackEnd) return null;

  return { from: addDaysISO(fallbackEnd, -35), to: fallbackEnd };
}
