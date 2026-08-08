/**
 * Utilidades de formato de fechas, horas y texto.
 * Todo se maneja en la zona horaria local del dispositivo.
 */

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export const MS_PER_DAY = 86400000;

function pad2(value) {
    return String(value).padStart(2, '0');
}

/** Convierte un Date a clave de día `YYYY-MM-DD` en hora local. */
export function toDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Convierte una clave `YYYY-MM-DD` a un Date local a medianoche. */
export function fromDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function todayKey() {
    return toDateKey(new Date());
}

/** Suma días a una clave de día y devuelve la nueva clave. */
export function addDays(dateKey, days) {
    const date = fromDateKey(dateKey);
    date.setDate(date.getDate() + days);
    return toDateKey(date);
}

/** Diferencia en días completos entre dos claves de día (b - a). */
export function daysBetween(fromKey, toKey) {
    const from = fromDateKey(fromKey);
    const to = fromDateKey(toKey);
    return Math.round((to - from) / MS_PER_DAY);
}

/** Combina una clave de día con una hora `HH:MM` en un Date local. */
export function atTime(dateKey, timeString) {
    const date = fromDateKey(dateKey);
    const [hours, minutes] = timeString.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return date;
}

/** `23:00` → `11:00 pm` */
export function formatTime12(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const suffix = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${pad2(minutes)} ${suffix}`;
}

/** Parte la hora en valor y sufijo, para mostrarla en dos líneas. */
export function splitTime12(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const suffix = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return { value: `${hour12}:${pad2(minutes)}`, suffix };
}

/** Extrae `HH:MM` de un Date. */
export function toTimeString(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** `2026-07-31` → `viernes 31 de julio` */
export function formatDateLong(dateKey) {
    const date = fromDateKey(dateKey);
    return `${DAY_NAMES[date.getDay()]} ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

/** `2026-07-31` → `31 de julio de 2026` */
export function formatDateFull(dateKey) {
    const date = fromDateKey(dateKey);
    return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

/** `2026-07-31` → `31 jul` */
export function formatDateShort(dateKey) {
    const date = fromDateKey(dateKey);
    return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

/** Devuelve `Hoy`, `Ayer`, `Mañana` o la fecha larga. */
export function relativeDayLabel(dateKey) {
    const diff = daysBetween(todayKey(), dateKey);
    if (diff === 0) return 'Hoy';
    if (diff === -1) return 'Ayer';
    if (diff === 1) return 'Mañana';
    return formatDateLong(dateKey);
}

/** Texto compacto de cuánto falta o hace cuánto pasó. */
export function relativeTimeLabel(date, reference = new Date()) {
    const minutes = Math.round((date - reference) / 60000);
    const absolute = Math.abs(minutes);

    if (absolute < 2) return 'ahora';

    let amount;
    if (absolute < 60) {
        amount = `${absolute} min`;
    } else if (absolute < 60 * 24) {
        const hours = Math.floor(absolute / 60);
        const rest = absolute % 60;
        amount = rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
    } else {
        amount = `${Math.floor(absolute / (60 * 24))} d`;
    }

    return minutes > 0 ? `en ${amount}` : `hace ${amount}`;
}

/** Pluraliza una unidad simple: `día`/`días`. */
export function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}

/** Escapa texto antes de insertarlo como HTML. */
export function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
