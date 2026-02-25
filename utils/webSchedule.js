const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseTimeToMinutes = (raw) => {
  const value = String(raw || "").trim();
  const match = value.match(TIME_RE);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return hh * 60 + mm;
};

const minutesToTime = (minutes) => {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const normalizeWebSchedule = (raw) => {
  if (!Array.isArray(raw)) return [];

  const byDay = new Map();

  raw.forEach((entry) => {
    const dia = Number(entry?.dia);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) return;

    const tramosRaw = Array.isArray(entry?.tramos) ? entry.tramos : [];
    const normalized = tramosRaw
      .map((tramo) => {
        const ini = parseTimeToMinutes(tramo?.inicio);
        const fin = parseTimeToMinutes(tramo?.fin);
        if (ini === null || fin === null || fin <= ini) return null;
        return { ini, fin };
      })
      .filter(Boolean)
      .sort((a, b) => a.ini - b.ini);

    const merged = [];
    normalized.forEach((slot) => {
      const prev = merged[merged.length - 1];
      if (!prev) {
        merged.push({ ...slot });
        return;
      }
      if (slot.ini <= prev.fin) {
        prev.fin = Math.max(prev.fin, slot.fin);
        return;
      }
      merged.push({ ...slot });
    });

    byDay.set(
      dia,
      merged.map((slot) => ({
        inicio: minutesToTime(slot.ini),
        fin: minutesToTime(slot.fin),
      }))
    );
  });

  return Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dia, tramos]) => ({ dia, tramos }));
};

const scheduleHasAnySlots = (schedule = []) =>
  Array.isArray(schedule) &&
  schedule.some((entry) => Array.isArray(entry?.tramos) && entry.tramos.length > 0);

const getDaySlots = (schedule = [], day) => {
  const entry = (Array.isArray(schedule) ? schedule : []).find((item) => Number(item?.dia) === Number(day));
  return Array.isArray(entry?.tramos) ? entry.tramos : [];
};

const isMinuteInsideSlots = (minute, slots = []) =>
  slots.some((slot) => {
    const ini = parseTimeToMinutes(slot?.inicio);
    const fin = parseTimeToMinutes(slot?.fin);
    if (ini === null || fin === null) return false;
    return minute >= ini && minute < fin;
  });

const evaluateWebSchedule = (schedule = [], now = new Date()) => {
  const normalized = normalizeWebSchedule(schedule);
  if (!scheduleHasAnySlots(normalized)) {
    return {
      active: false,
      open: true,
      reason: "sin_horario",
      schedule: normalized,
    };
  }

  const day = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  const slots = getDaySlots(normalized, day);
  const open = isMinuteInsideSlots(minute, slots);

  return {
    active: true,
    open,
    reason: open ? "abierto" : "cerrado",
    day,
    slots,
    schedule: normalized,
  };
};

const validatePickupTime = (schedule = [], day, time) => {
  const minute = parseTimeToMinutes(time);
  if (minute === null) {
    return { valid: false, error: "Hora de retiro invalida" };
  }

  const normalized = normalizeWebSchedule(schedule);
  if (!scheduleHasAnySlots(normalized)) {
    return { valid: true, active: false, schedule: normalized };
  }

  const slots = getDaySlots(normalized, day);
  const valid = isMinuteInsideSlots(minute, slots);
  return {
    valid,
    active: true,
    slots,
    schedule: normalized,
    error: valid ? "" : "La hora de retiro esta fuera del horario de atencion",
  };
};

module.exports = {
  parseTimeToMinutes,
  normalizeWebSchedule,
  evaluateWebSchedule,
  validatePickupTime,
  scheduleHasAnySlots,
};
