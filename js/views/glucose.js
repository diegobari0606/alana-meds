/**
 * Vista «Glicemia»: mediciones registradas, con gráfico y resumen.
 */

import {
    esc, toDateKey, formatTime12, toTimeString, relativeDayLabel,
    todayKey, daysBetween
} from '../format.js';
import * as store from '../store.js';
import { delegate, emptyState, sectionHeading, confirmAction, toast } from '../ui.js';

const THRESHOLD = 150;
const CHART_DAYS = 14;

const CONTEXT_LABELS = {
    'antes-insulina': 'Antes de la insulina',
    control: 'Control de rutina',
    sintoma: 'Por un síntoma'
};

export function render(state) {
    const readings = [...state.glucose].sort((a, b) => new Date(b.at) - new Date(a.at));

    if (readings.length === 0) {
        return `
            <div class="view-enter">
                ${emptyState({
                    icon: '🩸',
                    title: 'Sin mediciones',
                    text: 'Registrá la glicemia antes de cada aplicación de insulina para llevar el control.'
                })}
            </div>
            <button type="button" class="fab" data-action="log-glucose" aria-label="Registrar glicemia">+</button>
        `;
    }

    return `
        <div class="view-enter">
            ${renderStats(readings)}
            ${renderChart(readings)}
            ${sectionHeading('Mediciones', `${readings.length}`)}
            ${renderList(readings)}
        </div>
        <button type="button" class="fab" data-action="log-glucose" aria-label="Registrar glicemia">+</button>
    `;
}

function renderStats(readings) {
    const today = todayKey();
    const lastWeek = readings.filter(entry => daysBetween(toDateKey(new Date(entry.at)), today) < 7);
    const source = lastWeek.length > 0 ? lastWeek : readings;

    const values = source.map(entry => entry.value);
    const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const below = source.filter(entry => entry.value < THRESHOLD).length;

    return `
        ${sectionHeading(lastWeek.length > 0 ? 'Últimos 7 días' : 'Resumen', `${source.length} mediciones`)}
        <div class="stat-grid">
            <div class="stat">
                <p class="stat__value">${average}</p>
                <p class="stat__label">Promedio</p>
            </div>
            <div class="stat">
                <p class="stat__value">${min}</p>
                <p class="stat__label">Mínima</p>
            </div>
            <div class="stat">
                <p class="stat__value">${max}</p>
                <p class="stat__label">Máxima</p>
            </div>
            <div class="stat ${below > 0 ? 'stat--alert' : ''}">
                <p class="stat__value">${below}</p>
                <p class="stat__label">Bajo 150</p>
            </div>
        </div>
    `;
}

function renderChart(readings) {
    const today = todayKey();
    const points = readings
        .filter(entry => daysBetween(toDateKey(new Date(entry.at)), today) < CHART_DAYS)
        .sort((a, b) => new Date(a.at) - new Date(b.at));

    if (points.length < 2) return '';

    const width = 320;
    const height = 120;
    const padding = { top: 12, right: 8, bottom: 18, left: 30 };

    const values = points.map(point => point.value);
    const minValue = Math.min(...values, THRESHOLD) - 20;
    const maxValue = Math.max(...values, THRESHOLD) + 20;
    const range = maxValue - minValue || 1;

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const firstTime = new Date(points[0].at).getTime();
    const lastTime = new Date(points[points.length - 1].at).getTime();
    const timeSpan = lastTime - firstTime || 1;

    const toX = time => padding.left + ((time - firstTime) / timeSpan) * plotWidth;
    const toY = value => padding.top + (1 - (value - minValue) / range) * plotHeight;

    const path = points
        .map((point, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${command}${toX(new Date(point.at).getTime()).toFixed(1)},${toY(point.value).toFixed(1)}`;
        })
        .join(' ');

    const thresholdY = toY(THRESHOLD).toFixed(1);

    const dots = points
        .map(point => `
            <circle cx="${toX(new Date(point.at).getTime()).toFixed(1)}"
                    cy="${toY(point.value).toFixed(1)}"
                    r="3"
                    class="${point.value < THRESHOLD ? 'chart__dot chart__dot--low' : 'chart__dot'}" />
        `)
        .join('');

    return `
        ${sectionHeading('Tendencia', `${points.length} mediciones`)}
        <div class="chart-card">
            <svg viewBox="0 0 ${width} ${height}" class="chart" role="img"
                 aria-label="Gráfico de glicemia de los últimos ${CHART_DAYS} días">
                <line x1="${padding.left}" y1="${thresholdY}" x2="${width - padding.right}" y2="${thresholdY}"
                      class="chart__threshold" />
                <text x="4" y="${Number(thresholdY) + 3}" class="chart__axis-label">150</text>
                <path d="${path}" class="chart__line" fill="none" />
                ${dots}
            </svg>
            <p class="chart__caption">La línea punteada marca el límite de 150 mg/dl.</p>
        </div>
    `;
}

function renderList(readings) {
    const byDay = new Map();

    readings.forEach(entry => {
        const key = toDateKey(new Date(entry.at));
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(entry);
    });

    return [...byDay.entries()]
        .map(([dateKey, entries]) => `
            <div class="log-day">
                <p class="log-day__label">${esc(relativeDayLabel(dateKey))}</p>
                ${entries.map(renderReading).join('')}
            </div>
        `)
        .join('');
}

function renderReading(entry) {
    const at = new Date(entry.at);
    const isLow = entry.value < THRESHOLD;

    return `
        <div class="log-entry">
            <span class="log-entry__time">${esc(formatTime12(toTimeString(at)))}</span>
            <div class="log-entry__body">
                <p class="log-entry__title">
                    <span class="${isLow ? 'glucose-value glucose-value--low' : 'glucose-value'}">
                        ${entry.value} mg/dl
                    </span>
                    ${isLow ? '<span class="pill pill--late">Bajo 150</span>' : ''}
                </p>
                <p class="log-entry__detail">${esc(CONTEXT_LABELS[entry.context] || entry.context)}</p>
                ${entry.note ? `<p class="log-entry__note">${esc(entry.note)}</p>` : ''}
            </div>
            <button type="button" class="log-entry__delete" data-action="delete-glucose"
                    data-id="${esc(entry.id)}" aria-label="Eliminar medición">✕</button>
        </div>
    `;
}

/* --------------------------------------------------------------------------
   Interacción
   -------------------------------------------------------------------------- */

export function mount(root, refresh, helpers) {
    delegate(root, '[data-action="log-glucose"]', 'click', () => helpers.openGlucoseSheet(refresh));

    delegate(root, '[data-action="delete-glucose"]', 'click', (event, button) => {
        confirmAction({
            title: 'Eliminar medición',
            message: 'Se quitará este registro de glicemia del historial.',
            confirmLabel: 'Eliminar',
            danger: true
        }, () => {
            store.removeGlucose(button.dataset.id);
            toast('Medición eliminada');
            refresh();
        });
    });
}
