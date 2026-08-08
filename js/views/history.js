/**
 * Vista «Historial»: línea de tiempo con dosis, mediciones y notas.
 */

import {
    esc, toDateKey, formatTime12, toTimeString, relativeDayLabel, todayKey, daysBetween
} from '../format.js';
import * as store from '../store.js';
import {
    openSheet, closeSheet, toast, delegate, emptyState, sectionHeading, confirmAction
} from '../ui.js';

const RANGE_DAYS = 30;

let filter = 'all';

const FILTERS = [
    { key: 'all', label: 'Todo' },
    { key: 'dose', label: 'Dosis' },
    { key: 'glucose', label: 'Glicemia' },
    { key: 'note', label: 'Notas' }
];

export function render(state) {
    const entries = collectEntries(state).filter(
        entry => filter === 'all' || entry.kind === filter
    );

    return `
        <div class="view-enter">
            <div class="filter-row">
                ${FILTERS.map(item => `
                    <button type="button" class="chip ${filter === item.key ? 'chip--active' : ''}"
                            data-action="filter" data-filter="${item.key}">${esc(item.label)}</button>
                `).join('')}
            </div>
            ${entries.length === 0 ? renderEmpty() : renderTimeline(entries)}
        </div>
        <button type="button" class="fab" data-action="add-note" aria-label="Agregar nota">+</button>
    `;
}

function collectEntries(state) {
    const today = todayKey();
    const withinRange = dateKey => {
        const diff = daysBetween(dateKey, today);
        return diff >= 0 && diff < RANGE_DAYS;
    };

    const entries = [];

    state.doseLogs.forEach(log => {
        const dateKey = toDateKey(new Date(log.at));
        if (!withinRange(dateKey)) return;

        const treatment = state.treatments.find(item => item.id === log.treatmentId);
        entries.push({
            kind: 'dose',
            id: log.id,
            at: new Date(log.at),
            dateKey,
            title: treatment ? treatment.name : 'Tratamiento eliminado',
            icon: treatment ? (treatment.icon || '💊') : '💊',
            status: log.status,
            isExtra: !log.scheduledFor,
            note: log.note
        });
    });

    state.glucose.forEach(reading => {
        const dateKey = toDateKey(new Date(reading.at));
        if (!withinRange(dateKey)) return;

        entries.push({
            kind: 'glucose',
            id: reading.id,
            at: new Date(reading.at),
            dateKey,
            title: `${reading.value} mg/dl`,
            icon: '🩸',
            isLow: reading.value < 150,
            note: reading.note
        });
    });

    state.notes.forEach(note => {
        const dateKey = toDateKey(new Date(note.at));
        if (!withinRange(dateKey)) return;

        entries.push({
            kind: 'note',
            id: note.id,
            at: new Date(note.at),
            dateKey,
            title: 'Nota',
            icon: '📝',
            note: note.text
        });
    });

    return entries.sort((a, b) => b.at - a.at);
}

function renderTimeline(entries) {
    const byDay = new Map();

    entries.forEach(entry => {
        if (!byDay.has(entry.dateKey)) byDay.set(entry.dateKey, []);
        byDay.get(entry.dateKey).push(entry);
    });

    return [...byDay.entries()]
        .map(([dateKey, items]) => `
            <div class="log-day">
                <p class="log-day__label">${esc(relativeDayLabel(dateKey))}</p>
                ${items.map(renderEntry).join('')}
            </div>
        `)
        .join('');
}

function renderEntry(entry) {
    let badge = '';
    if (entry.kind === 'dose' && entry.status === 'skipped') {
        badge = '<span class="pill pill--skip">Omitida</span>';
    } else if (entry.kind === 'dose' && entry.isExtra) {
        badge = '<span class="pill pill--extra">Fuera de horario</span>';
    } else if (entry.kind === 'dose') {
        badge = '<span class="pill pill--given">Dada</span>';
    } else if (entry.kind === 'glucose' && entry.isLow) {
        badge = '<span class="pill pill--late">Bajo 150</span>';
    }

    const deletable = entry.kind === 'note' || entry.kind === 'glucose';

    return `
        <div class="log-entry">
            <span class="log-entry__time">${esc(formatTime12(toTimeString(entry.at)))}</span>
            <div class="log-entry__body">
                <p class="log-entry__title">
                    <span aria-hidden="true">${esc(entry.icon)}</span>
                    ${esc(entry.title)}
                    ${badge}
                </p>
                ${entry.note ? `<p class="log-entry__note">${esc(entry.note)}</p>` : ''}
            </div>
            ${deletable ? `
                <button type="button" class="log-entry__delete" data-action="delete-entry"
                        data-kind="${esc(entry.kind)}" data-id="${esc(entry.id)}"
                        aria-label="Eliminar">✕</button>
            ` : ''}
        </div>
    `;
}

function renderEmpty() {
    const messages = {
        all: 'Todavía no hay nada registrado en los últimos 30 días.',
        dose: 'No hay dosis registradas en los últimos 30 días.',
        glucose: 'No hay mediciones de glicemia en los últimos 30 días.',
        note: 'No hay notas en los últimos 30 días.'
    };

    return emptyState({
        icon: '🕐',
        title: 'Sin registros',
        text: messages[filter]
    });
}

/* --------------------------------------------------------------------------
   Interacción
   -------------------------------------------------------------------------- */

export function mount(root, refresh) {
    delegate(root, '[data-action="filter"]', 'click', (event, button) => {
        filter = button.dataset.filter;
        refresh();
    });

    delegate(root, '[data-action="add-note"]', 'click', () => openNoteSheet(refresh));

    delegate(root, '[data-action="delete-entry"]', 'click', (event, button) => {
        const { kind, id } = button.dataset;
        confirmAction({
            title: 'Eliminar registro',
            message: 'Se quitará este registro del historial. No se puede deshacer.',
            confirmLabel: 'Eliminar',
            danger: true
        }, () => {
            if (kind === 'note') store.removeNote(id);
            if (kind === 'glucose') store.removeGlucose(id);
            toast('Registro eliminado');
            refresh();
        });
    });
}

function openNoteSheet(refresh) {
    openSheet('Nueva nota', `
        <div class="field">
            <label class="field__label" for="note-text">¿Qué querés anotar?</label>
            <textarea class="textarea" id="note-text"
                      placeholder="Síntomas, cómo la viste, reacciones, consultas para la vet…"></textarea>
            <p class="field__error" id="note-error" hidden></p>
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn--primary btn--block" data-action="save">Guardar nota</button>
        </div>
    `, {
        onMount(body) {
            body.querySelector('[data-action="save"]').addEventListener('click', () => {
                const textarea = body.querySelector('#note-text');
                const error = body.querySelector('#note-error');
                const text = textarea.value.trim();

                if (!text) {
                    error.textContent = 'Escribí algo antes de guardar.';
                    error.hidden = false;
                    textarea.focus();
                    return;
                }

                store.addNote({ text });
                closeSheet();
                toast('Nota guardada');
                refresh();
            });
        }
    });
}
