/**
 * Vista «Hoy»: agenda de dosis del día, con registro rápido.
 */

import {
    esc, splitTime12, formatTime12, relativeDayLabel, relativeTimeLabel,
    todayKey, addDays, daysBetween, formatDateFull
} from '../format.js';
import { dayAgenda, summarize } from '../schedule.js';
import * as store from '../store.js';
import { openSheet, closeSheet, toast, delegate, emptyState, sectionHeading, confirmAction } from '../ui.js';
import { CATEGORIES, ROUTES } from '../seed.js';
import { mountInto as mountGallery } from '../gallery.js';

let viewDateKey = todayKey();

const GROUPS = [
    { key: 'late', title: 'Atrasadas', statuses: ['late'] },
    { key: 'due', title: 'Toca ahora', statuses: ['due'] },
    { key: 'upcoming', title: 'Más tarde', statuses: ['upcoming'] },
    { key: 'done', title: 'Registradas', statuses: ['given', 'skipped'] }
];

export function render(state) {
    const agenda = dayAgenda(state, viewDateKey);
    const stats = summarize(agenda);
    const glucose = store.latestGlucose();

    return `
        <div class="view-enter">
            <div id="gallery-slot"></div>
            ${renderDayBar(stats)}
            ${renderGlucoseCard(glucose, agenda)}
            ${renderAppointmentBanner(state)}
            ${agenda.length === 0 ? renderEmpty() : GROUPS.map(group => renderGroup(group, agenda)).join('')}
            ${renderDisclaimer()}
        </div>
        <button type="button" class="fab" data-action="quick-log" aria-label="Registrar algo fuera de horario">+</button>
    `;
}

function renderDayBar(stats) {
    const offset = daysBetween(todayKey(), viewDateKey);
    const percent = stats.total === 0 ? 0 : Math.round((stats.given / stats.total) * 100);
    const ringColor = stats.late > 0 ? 'var(--red-600)' : 'var(--accent)';

    let summary;
    if (stats.total === 0) {
        summary = 'Sin dosis programadas';
    } else if (stats.late > 0) {
        summary = `${stats.given} de ${stats.total} · ${stats.late} atrasada${stats.late === 1 ? '' : 's'}`;
    } else if (stats.pending === 0) {
        summary = `Todo al día · ${stats.given} de ${stats.total}`;
    } else {
        summary = `${stats.given} de ${stats.total} completadas`;
    }

    return `
        <div class="daybar">
            <div class="daybar__ring" style="background: conic-gradient(${ringColor} ${percent}%, var(--surface-alt) 0);">
                <span class="daybar__ring-inner">
                    <span class="daybar__ring-value">${percent}%</span>
                </span>
            </div>
            <div class="daybar__text">
                <p class="daybar__date">${esc(relativeDayLabel(viewDateKey))}</p>
                <p class="daybar__summary">${esc(summary)}</p>
            </div>
            <div class="daybar__nav">
                <button type="button" class="icon-button" data-action="prev-day" aria-label="Día anterior">‹</button>
                <button type="button" class="icon-button" data-action="next-day" aria-label="Día siguiente" ${offset >= 7 ? 'disabled' : ''}>›</button>
            </div>
        </div>
    `;
}

function renderGlucoseCard(glucose, agenda) {
    const insulinPending = agenda.some(
        item => item.treatment.requiresGlucose &&
            (item.status === 'due' || item.status === 'late')
    );

    if (!glucose) {
        return `
            <div class="glucose-card ${insulinPending ? 'glucose-card--alert' : ''}">
                <div class="glucose-card__body">
                    <p class="glucose-card__label">Glicemia</p>
                    <p class="glucose-card__empty">Sin mediciones registradas</p>
                </div>
                <button type="button" class="btn btn--primary btn--sm" data-action="log-glucose">Medir</button>
            </div>
        `;
    }

    const measuredAt = new Date(glucose.at);
    const isStale = (Date.now() - measuredAt) > 4 * 3600000;
    const belowThreshold = glucose.value < 150;

    let flag = '';
    if (belowThreshold) {
        flag = '<span class="pill pill--late">No aplicar insulina</span>';
    } else if (isStale && insulinPending) {
        flag = '<span class="pill pill--soon">Medición vieja</span>';
    }

    return `
        <div class="glucose-card ${belowThreshold ? 'glucose-card--alert' : ''}">
            <div class="glucose-card__body">
                <p class="glucose-card__label">Última glicemia ${flag}</p>
                <p class="glucose-card__value">
                    ${glucose.value}<span class="glucose-card__unit">mg/dl</span>
                </p>
                <p class="glucose-card__meta">${esc(relativeTimeLabel(measuredAt))}</p>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" data-action="log-glucose">Medir</button>
        </div>
    `;
}

function renderAppointmentBanner(state) {
    const today = todayKey();
    const upcoming = (state.appointments || [])
        .filter(appointment => daysBetween(today, appointment.date) >= 0)
        .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (!upcoming) return '';

    const days = daysBetween(today, upcoming.date);
    if (days > 14) return '';

    const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;

    return `
        <div class="banner">
            <span class="banner__icon" aria-hidden="true">🩺</span>
            <div class="banner__body">
                <p class="banner__title">${esc(upcoming.title)}</p>
                <p class="banner__meta">${esc(formatDateFull(upcoming.date))} · ${esc(when)}</p>
            </div>
        </div>
    `;
}

function renderGroup(group, agenda) {
    const items = agenda.filter(item => group.statuses.includes(item.status));
    if (items.length === 0) return '';

    return `
        ${sectionHeading(group.title, `${items.length}`)}
        <div class="dose-list">
            ${items.map(renderDose).join('')}
        </div>
    `;
}

function renderDose(item) {
    const time = splitTime12(item.time);
    const isDone = item.status === 'given' || item.status === 'skipped';
    const category = CATEGORIES[item.treatment.category];

    const classes = ['dose'];
    if (isDone) classes.push('dose--done');
    if (item.status === 'late') classes.push('dose--late');

    const meta = [];
    if (item.dose) meta.push(item.dose);
    if (category) meta.push(category.label);
    if (item.isExtra) meta.push('fuera de horario');

    let badge = '';
    if (item.status === 'late') badge = '<span class="pill pill--late">Atrasada</span>';
    else if (item.status === 'skipped') badge = '<span class="pill pill--skip">Omitida</span>';
    else if (item.isExtra) badge = '<span class="pill pill--extra">Extra</span>';
    else if (item.treatment.requiresGlucose && !isDone) badge = '<span class="pill pill--soon">Medir antes</span>';

    return `
        <article class="${classes.join(' ')}" data-scheduled="${esc(item.scheduledFor || '')}" data-treatment="${esc(item.treatmentId)}">
            <div class="dose__time">
                <span class="dose__time-value">${esc(time.value)}</span>
                <span class="dose__time-suffix">${esc(time.suffix)}</span>
            </div>
            <button type="button" class="dose__body" data-action="dose-detail">
                <span class="dose__name">${esc(item.treatment.icon || '💊')} ${esc(item.treatment.name)}</span>
                <span class="dose__meta">${esc(meta.join(' · '))}</span>
                ${badge}
            </button>
            <div class="dose__actions">
                ${isDone
                    ? `<button type="button" class="dose-btn dose-btn--undo" data-action="undo" aria-label="Deshacer">↺</button>`
                    : `<button type="button" class="dose-btn" data-action="skip" aria-label="Omitir">✕</button>
                       <button type="button" class="dose-btn dose-btn--give" data-action="give" aria-label="Marcar como dada">✓</button>`
                }
            </div>
        </article>
    `;
}

function renderEmpty() {
    return emptyState({
        icon: '🐾',
        title: 'Sin dosis este día',
        text: 'No hay nada programado. Podés registrar algo fuera de horario con el botón +.'
    });
}

function renderDisclaimer() {
    return `
        <p class="disclaimer">
            Registro personal de lo indicado por la veterinaria. No sustituye su criterio:
            ante cualquier duda o reacción, consultá con la clínica.
        </p>
    `;
}

/* --------------------------------------------------------------------------
   Interacción
   -------------------------------------------------------------------------- */

export function mount(root, refresh) {
    delegate(root, '[data-action="prev-day"]', 'click', () => {
        viewDateKey = addDays(viewDateKey, -1);
        refresh();
    });

    delegate(root, '[data-action="next-day"]', 'click', () => {
        if (daysBetween(todayKey(), viewDateKey) >= 7) return;
        viewDateKey = addDays(viewDateKey, 1);
        refresh();
    });

    delegate(root, '[data-action="give"]', 'click', (event, button) => {
        const article = button.closest('.dose');
        handleGive(article, refresh);
    });

    delegate(root, '[data-action="skip"]', 'click', (event, button) => {
        const article = button.closest('.dose');
        store.logDose({
            treatmentId: article.dataset.treatment,
            scheduledFor: article.dataset.scheduled || null,
            status: 'skipped'
        });
        toast('Dosis marcada como omitida');
        refresh();
    });

    delegate(root, '[data-action="undo"]', 'click', (event, button) => {
        const article = button.closest('.dose');
        const log = store.findDoseLog(article.dataset.treatment, article.dataset.scheduled || null);
        if (log) store.removeDoseLog(log.id);
        refresh();
    });

    delegate(root, '[data-action="dose-detail"]', 'click', (event, button) => {
        const article = button.closest('.dose');
        openDoseDetail(article.dataset.treatment, article.dataset.scheduled, refresh);
    });

    delegate(root, '[data-action="log-glucose"]', 'click', () => openGlucoseSheet(refresh));
    delegate(root, '[data-action="quick-log"]', 'click', () => openQuickLog(refresh));
}

function handleGive(article, refresh) {
    const treatment = store.getTreatment(article.dataset.treatment);
    const scheduledFor = article.dataset.scheduled || null;

    if (treatment && treatment.requiresGlucose) {
        const glucose = store.latestGlucose();
        const threshold = treatment.glucoseMin || 150;
        const isStale = !glucose || (Date.now() - new Date(glucose.at)) > 4 * 3600000;

        if (isStale) {
            confirmAction({
                title: 'Falta medir la glicemia',
                message: `La receta indica revisar la glicemia antes de aplicar ${treatment.name}. ` +
                    'No hay una medición reciente. ¿Querés registrarla ahora?',
                confirmLabel: 'Registrar glicemia'
            }, () => openGlucoseSheet(refresh));
            return;
        }

        if (glucose.value < threshold) {
            confirmAction({
                title: 'Glicemia por debajo del límite',
                message: `La última medición es de ${glucose.value} mg/dl y la receta indica no aplicar ` +
                    `insulina por debajo de ${threshold} mg/dl. ¿Registrar de todas formas?`,
                confirmLabel: 'Registrar igual',
                danger: true
            }, () => {
                store.logDose({ treatmentId: treatment.id, scheduledFor, status: 'given' });
                toast('Dosis registrada');
                refresh();
            });
            return;
        }
    }

    store.logDose({ treatmentId: article.dataset.treatment, scheduledFor, status: 'given' });
    toast('Dosis registrada');
    refresh();
}

function openDoseDetail(treatmentId, scheduledFor, refresh) {
    const treatment = store.getTreatment(treatmentId);
    if (!treatment) return;

    const log = store.findDoseLog(treatmentId, scheduledFor || null);
    const category = CATEGORIES[treatment.category];

    openSheet(treatment.name, `
        <div class="detail">
            <p class="detail__tagline">
                ${esc(category ? category.label : '')} · ${esc(ROUTES[treatment.route] || '')}
            </p>
            ${treatment.instructions ? `<p class="detail__text">${esc(treatment.instructions)}</p>` : ''}
            ${treatment.warnings.length > 0 ? `
                <ul class="detail__warnings">
                    ${treatment.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}
                </ul>
            ` : ''}
            ${scheduledFor ? `<p class="detail__meta">Programada para las ${esc(formatTime12(scheduledFor.split('T')[1]))}</p>` : ''}
            ${log ? `<p class="detail__meta">Registrada ${esc(relativeTimeLabel(new Date(log.at)))}</p>` : ''}

            <div class="field" style="margin-top:18px">
                <label class="field__label" for="dose-note">Nota de esta dosis</label>
                <textarea class="textarea" id="dose-note" placeholder="Vomitó, la escupió, costó darla…">${esc(log ? log.note : '')}</textarea>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn--primary btn--block" data-action="save-note">Guardar nota</button>
            </div>
        </div>
    `, {
        onMount(body) {
            body.querySelector('[data-action="save-note"]').addEventListener('click', () => {
                const note = body.querySelector('#dose-note').value;
                store.logDose({
                    treatmentId,
                    scheduledFor: scheduledFor || null,
                    status: log ? log.status : 'given',
                    at: log ? log.at : null,
                    note
                });
                closeSheet();
                toast('Nota guardada');
                refresh();
            });
        }
    });
}

export function openGlucoseSheet(refresh) {
    openSheet('Registrar glicemia', `
        <div class="field">
            <label class="field__label" for="glucose-value">Valor en mg/dl</label>
            <input class="input" id="glucose-value" type="number" inputmode="numeric"
                   min="10" max="900" step="1" placeholder="Ej. 180">
            <p class="field__hint">La receta indica no aplicar insulina por debajo de 150 mg/dl.</p>
            <p class="field__error" id="glucose-error" hidden></p>
        </div>
        <div class="field">
            <label class="field__label" for="glucose-context">Momento</label>
            <select class="select" id="glucose-context">
                <option value="antes-insulina">Antes de la insulina</option>
                <option value="control">Control de rutina</option>
                <option value="sintoma">Por algún síntoma</option>
            </select>
        </div>
        <div class="field">
            <label class="field__label" for="glucose-note">Nota (opcional)</label>
            <textarea class="textarea" id="glucose-note" placeholder="Cómo la vio, si comió antes…"></textarea>
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn--primary btn--block" data-action="save">Guardar medición</button>
        </div>
    `, {
        onMount(body) {
            body.querySelector('[data-action="save"]').addEventListener('click', () => {
                const input = body.querySelector('#glucose-value');
                const error = body.querySelector('#glucose-error');
                const value = Number(input.value);

                if (!input.value || Number.isNaN(value) || value < 10 || value > 900) {
                    error.textContent = 'Ingresá un valor entre 10 y 900 mg/dl.';
                    error.hidden = false;
                    input.focus();
                    return;
                }

                store.logGlucose({
                    value,
                    context: body.querySelector('#glucose-context').value,
                    note: body.querySelector('#glucose-note').value.trim()
                });

                closeSheet();
                toast(value < 150 ? 'Registrada · por debajo de 150 mg/dl' : 'Glicemia registrada');
                refresh();
            });
        }
    });
}

function openQuickLog(refresh) {
    const state = store.getState();
    const options = state.treatments
        .filter(treatment => treatment.active)
        .map(treatment => `<option value="${esc(treatment.id)}">${esc(treatment.name)}</option>`)
        .join('');

    openSheet('Registrar fuera de horario', `
        <div class="field">
            <label class="field__label" for="quick-treatment">Tratamiento</label>
            <select class="select" id="quick-treatment">${options}</select>
        </div>
        <div class="field">
            <label class="field__label" for="quick-note">Nota (opcional)</label>
            <textarea class="textarea" id="quick-note" placeholder="Por qué se dio fuera de horario"></textarea>
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn--primary btn--block" data-action="save">Registrar</button>
        </div>
    `, {
        onMount(body) {
            body.querySelector('[data-action="save"]').addEventListener('click', () => {
                store.logDose({
                    treatmentId: body.querySelector('#quick-treatment').value,
                    scheduledFor: null,
                    status: 'given',
                    note: body.querySelector('#quick-note').value.trim()
                });
                closeSheet();
                toast('Registrado');
                refresh();
            });
        }
    });
}

/**
 * Se ejecuta después de cada repintado: devuelve la galería a su hueco.
 * Es el mismo nodo siempre, así que conserva la foto y el temporizador.
 */
export function afterRender(root) {
    mountGallery(root.querySelector('#gallery-slot'));
}

/** Vuelve la vista al día de hoy (al cambiar de pestaña). */
export function reset() {
    viewDateKey = todayKey();
}
