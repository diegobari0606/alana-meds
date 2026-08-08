/**
 * Cálculo del horario: expande los tratamientos en dosis concretas para un día.
 *
 * Un tratamiento corre por fases consecutivas desde `startDate`. Cada fase se
 * repite cada `everyDays` días, a las horas de `times`, durante `durationDays`
 * (o indefinidamente si es `null`).
 */

import { atTime, daysBetween, addDays, toTimeString, toDateKey } from './format.js';

/**
 * Determina en qué fase está un tratamiento en una fecha dada.
 * @returns {{phase: object, index: number, phaseStartKey: string, dayOffset: number}|null}
 */
export function phaseForDate(treatment, dateKey) {
    let cursor = treatment.startDate;

    for (let index = 0; index < treatment.phases.length; index += 1) {
        const phase = treatment.phases[index];
        const dayOffset = daysBetween(cursor, dateKey);

        if (dayOffset < 0) return null; // el tratamiento todavía no empieza

        if (phase.durationDays === null || phase.durationDays === undefined) {
            return { phase, index, phaseStartKey: cursor, dayOffset };
        }

        if (dayOffset < phase.durationDays) {
            return { phase, index, phaseStartKey: cursor, dayOffset };
        }

        cursor = addDays(cursor, phase.durationDays);
    }

    return null; // ya terminó el esquema completo
}

/** Fecha en que termina el tratamiento, o `null` si es indefinido. */
export function treatmentEndDate(treatment) {
    let cursor = treatment.startDate;

    for (const phase of treatment.phases) {
        if (phase.durationDays === null || phase.durationDays === undefined) return null;
        cursor = addDays(cursor, phase.durationDays);
    }

    return addDays(cursor, -1);
}

/** `true` si a la fecha indicada al tratamiento le corresponde al menos una dosis. */
function fallsOnDate(current, dateKey) {
    const everyDays = current.phase.everyDays || 1;
    return current.dayOffset % everyDays === 0;
}

/**
 * Genera las dosis previstas de un día para todos los tratamientos activos.
 * No consulta el registro: solo dice qué tocaba.
 */
export function scheduledDosesForDate(treatments, dateKey) {
    const doses = [];

    treatments.forEach(treatment => {
        if (!treatment.active) return;

        const current = phaseForDate(treatment, dateKey);
        if (!current || !fallsOnDate(current, dateKey)) return;

        (current.phase.times || []).forEach(time => {
            doses.push({
                treatmentId: treatment.id,
                treatment,
                phase: current.phase,
                phaseIndex: current.index,
                dose: current.phase.dose,
                time,
                scheduledFor: `${dateKey}T${time}`,
                scheduledAt: atTime(dateKey, time)
            });
        });
    });

    return doses.sort((a, b) => a.scheduledAt - b.scheduledAt);
}

/**
 * Combina las dosis previstas con lo registrado y calcula el estado de cada una.
 * Estados: `given`, `skipped`, `late`, `due`, `upcoming`.
 */
export function dayAgenda(state, dateKey, now = new Date()) {
    const lateAfterMs = (state.settings.lateAfterMinutes || 60) * 60000;
    const scheduled = scheduledDosesForDate(state.treatments, dateKey);

    const items = scheduled.map(dose => {
        const log = state.doseLogs.find(
            entry => entry.treatmentId === dose.treatmentId && entry.scheduledFor === dose.scheduledFor
        );

        let status;
        if (log && log.status === 'given') {
            status = 'given';
        } else if (log && log.status === 'skipped') {
            status = 'skipped';
        } else if (now - dose.scheduledAt > lateAfterMs) {
            status = 'late';
        } else if (now >= dose.scheduledAt) {
            status = 'due';
        } else {
            status = 'upcoming';
        }

        return { ...dose, log: log || null, status };
    });

    // Dosis extra registradas ese día fuera de horario.
    const extras = state.doseLogs
        .filter(log => !log.scheduledFor && toDateKey(new Date(log.at)) === dateKey)
        .map(log => {
            const treatment = state.treatments.find(item => item.id === log.treatmentId);
            if (!treatment) return null;
            const at = new Date(log.at);
            return {
                treatmentId: log.treatmentId,
                treatment,
                phase: null,
                dose: null,
                time: toTimeString(at),
                scheduledFor: null,
                scheduledAt: at,
                log,
                status: log.status === 'skipped' ? 'skipped' : 'given',
                isExtra: true
            };
        })
        .filter(Boolean);

    return [...items, ...extras].sort((a, b) => a.scheduledAt - b.scheduledAt);
}

/** Conteo rápido del día para el encabezado. */
export function summarize(agenda) {
    const total = agenda.filter(item => !item.isExtra).length;
    const given = agenda.filter(item => item.status === 'given').length;
    const late = agenda.filter(item => item.status === 'late').length;
    const pending = agenda.filter(
        item => item.status === 'due' || item.status === 'upcoming' || item.status === 'late'
    ).length;

    return { total, given, late, pending };
}

/**
 * Próxima dosis pendiente a partir de ahora, mirando hasta `daysAhead` días.
 */
export function nextDose(state, now = new Date(), daysAhead = 3) {
    let dateKey = toDateKey(now);

    for (let offset = 0; offset <= daysAhead; offset += 1) {
        const agenda = dayAgenda(state, dateKey, now);
        const upcoming = agenda.find(
            item => !item.isExtra && item.scheduledAt >= now &&
                item.status !== 'given' && item.status !== 'skipped'
        );
        if (upcoming) return upcoming;
        dateKey = addDays(dateKey, 1);
    }

    return null;
}

/**
 * Descripción legible de la frecuencia de una fase.
 */
export function describePhase(phase) {
    const everyDays = phase.everyDays || 1;
    const timesPerDay = (phase.times || []).length;

    let frequency;
    if (everyDays === 1) {
        if (timesPerDay === 1) frequency = 'una vez al día';
        else if (timesPerDay === 2) frequency = 'cada 12 horas';
        else if (timesPerDay === 3) frequency = 'cada 8 horas';
        else frequency = `${timesPerDay} veces al día`;
    } else if (everyDays === 2) {
        frequency = 'cada 48 horas';
    } else if (everyDays === 3) {
        frequency = 'cada 72 horas';
    } else if (everyDays === 7) {
        frequency = 'una vez por semana';
    } else if (everyDays === 30) {
        frequency = 'una vez al mes';
    } else {
        frequency = `cada ${everyDays} días`;
    }

    let duration;
    if (phase.durationDays === null || phase.durationDays === undefined) {
        duration = 'indefinido';
    } else if (phase.durationDays % 7 === 0 && phase.durationDays >= 7) {
        const weeks = phase.durationDays / 7;
        duration = weeks === 1 ? '1 semana' : `${weeks} semanas`;
    } else {
        duration = phase.durationDays === 1 ? '1 día' : `${phase.durationDays} días`;
    }

    return { frequency, duration };
}
