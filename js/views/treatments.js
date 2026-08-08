/**
 * Vista «Tratamientos»: el régimen completo, con edición de horarios y dosis.
 */

import { esc, formatTime12, formatDateShort, todayKey, daysBetween } from '../format.js';
import { phaseForDate, treatmentEndDate, describePhase } from '../schedule.js';
import * as store from '../store.js';
import { openSheet, closeSheet, toast, delegate, sectionHeading, confirmAction } from '../ui.js';
import { CATEGORIES, ROUTES } from '../seed.js';

export function render(state) {
    const today = todayKey();
    const byCategory = new Map();

    state.treatments.forEach(treatment => {
        const key = treatment.category || 'otros';
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(treatment);
    });

    const sections = Object.keys(CATEGORIES)
        .filter(key => byCategory.has(key))
        .map(key => {
            const category = CATEGORIES[key];
            const items = byCategory.get(key);
            return `
                ${sectionHeading(category.label, `${items.length}`)}
                <div class="dose-list">
                    ${items.map(treatment => renderCard(treatment, today)).join('')}
                </div>
            `;
        })
        .join('');

    return `
        <div class="view-enter">
            ${sections}
            ${renderPrescriptionCard(state)}
        </div>
        <button type="button" class="fab" data-action="add-treatment" aria-label="Agregar tratamiento">+</button>
    `;
}

function renderCard(treatment, today) {
    const current = phaseForDate(treatment, today);
    const endDate = treatmentEndDate(treatment);

    let statusText;
    if (!treatment.active) {
        statusText = 'Pausado';
    } else if (!current) {
        statusText = daysBetween(today, treatment.startDate) > 0 ? 'Aún no empieza' : 'Finalizado';
    } else {
        const described = describePhase(current.phase);
        const label = current.phase.label ? `${current.phase.label} · ` : '';
        statusText = `${label}${current.phase.dose} · ${described.frequency}`;
    }

    const times = current
        ? (current.phase.times || []).map(formatTime12).join(' · ')
        : '';

    const remaining = endDate && treatment.active
        ? daysBetween(today, endDate)
        : null;

    let tail = '';
    if (remaining !== null && remaining >= 0) {
        tail = ` · termina ${formatDateShort(endDate)}`;
    } else if (endDate === null && treatment.active && current) {
        tail = ' · indefinido';
    }

    const inactive = !treatment.active || !current ? 'med-card--inactive' : '';

    return `
        <button type="button" class="med-card ${inactive}" data-treatment="${esc(treatment.id)}" data-action="open-treatment">
            <span class="med-card__icon">${esc(treatment.icon || '💊')}</span>
            <span class="med-card__body">
                <span class="med-card__name">${esc(treatment.name)}</span>
                <span class="med-card__meta">${esc(statusText)}${esc(tail)}</span>
                ${times ? `<span class="med-card__times">${esc(times)}</span>` : ''}
            </span>
            <span class="med-card__chevron" aria-hidden="true">›</span>
        </button>
    `;
}

function renderPrescriptionCard(state) {
    return `
        ${sectionHeading('Receta')}
        <div class="info-card">
            <p class="info-card__text">
                Régimen indicado por la Dra. Carolina Espinoza Picado — Veterinaria Vicovet.
                Fecha de inicio configurada: <strong>${esc(state.settings.prescriptionDate)}</strong>.
            </p>
            <button type="button" class="btn btn--ghost btn--block" data-action="edit-start">
                Cambiar fecha de inicio del tratamiento
            </button>
        </div>
    `;
}

/* --------------------------------------------------------------------------
   Interacción
   -------------------------------------------------------------------------- */

export function mount(root, refresh) {
    delegate(root, '[data-action="open-treatment"]', 'click', (event, button) => {
        openTreatmentSheet(button.dataset.treatment, refresh);
    });

    delegate(root, '[data-action="add-treatment"]', 'click', () => {
        openTreatmentForm(null, refresh);
    });

    delegate(root, '[data-action="edit-start"]', 'click', () => {
        openStartDateSheet(refresh);
    });
}

function openTreatmentSheet(treatmentId, refresh) {
    const treatment = store.getTreatment(treatmentId);
    if (!treatment) return;

    const category = CATEGORIES[treatment.category];
    const phases = treatment.phases.map((phase, index) => {
        const described = describePhase(phase);
        const label = phase.label || (treatment.phases.length > 1 ? `Fase ${index + 1}` : 'Pauta');
        const times = (phase.times || []).map(formatTime12).join(' · ');
        return `
            <li class="phase">
                <p class="phase__label">${esc(label)}</p>
                <p class="phase__dose">${esc(phase.dose)} · ${esc(described.frequency)}</p>
                <p class="phase__meta">${esc(times)} · ${esc(described.duration)}</p>
            </li>
        `;
    }).join('');

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

            <ul class="phase-list">${phases}</ul>

            <div class="switch-row">
                <div>
                    <p class="switch-row__label">Activo</p>
                    <p class="switch-row__hint">Al pausarlo deja de aparecer en la agenda</p>
                </div>
                <input type="checkbox" id="treatment-active" ${treatment.active ? 'checked' : ''}>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn--primary btn--block" data-action="edit">Editar horarios y dosis</button>
                <button type="button" class="btn btn--danger btn--block" data-action="delete">Eliminar tratamiento</button>
            </div>
        </div>
    `, {
        onMount(body) {
            body.querySelector('#treatment-active').addEventListener('change', event => {
                store.setTreatmentActive(treatmentId, event.target.checked);
                toast(event.target.checked ? 'Tratamiento activado' : 'Tratamiento pausado');
                refresh();
            });

            body.querySelector('[data-action="edit"]').addEventListener('click', () => {
                openTreatmentForm(treatmentId, refresh);
            });

            body.querySelector('[data-action="delete"]').addEventListener('click', () => {
                confirmAction({
                    title: 'Eliminar tratamiento',
                    message: `Se borrará «${treatment.name}» y todo su historial de dosis. No se puede deshacer.`,
                    confirmLabel: 'Eliminar',
                    danger: true
                }, () => {
                    store.deleteTreatment(treatmentId);
                    toast('Tratamiento eliminado');
                    refresh();
                });
            });
        }
    });
}

function openTreatmentForm(treatmentId, refresh) {
    const existing = treatmentId ? store.getTreatment(treatmentId) : null;
    const treatment = existing || {
        id: null,
        name: '',
        category: 'dermatologico',
        route: 'oral',
        icon: '💊',
        instructions: '',
        warnings: [],
        requiresGlucose: false,
        glucoseMin: null,
        startDate: todayKey(),
        active: true,
        phases: [{ label: null, dose: '', everyDays: 1, times: ['09:00'], durationDays: null }]
    };

    // Por simplicidad el formulario edita la primera fase; los esquemas de
    // varias fases se muestran completos en el detalle pero se ajustan aquí
    // fase por fase mediante el selector.
    const phaseOptions = treatment.phases.map((phase, index) => {
        const label = phase.label || (treatment.phases.length > 1 ? `Fase ${index + 1}` : 'Pauta única');
        return `<option value="${index}">${esc(label)}</option>`;
    }).join('');

    openSheet(existing ? 'Editar tratamiento' : 'Nuevo tratamiento', `
        <div class="field">
            <label class="field__label" for="t-name">Nombre</label>
            <input class="input" id="t-name" type="text" value="${esc(treatment.name)}" placeholder="Ej. Proteliv">
            <p class="field__error" id="t-name-error" hidden></p>
        </div>

        <div class="field-row">
            <div class="field">
                <label class="field__label" for="t-category">Categoría</label>
                <select class="select" id="t-category">
                    ${Object.entries(CATEGORIES).map(([key, value]) =>
                        `<option value="${key}" ${treatment.category === key ? 'selected' : ''}>${esc(value.label)}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="field">
                <label class="field__label" for="t-route">Vía</label>
                <select class="select" id="t-route">
                    ${Object.entries(ROUTES).map(([key, label]) =>
                        `<option value="${key}" ${treatment.route === key ? 'selected' : ''}>${esc(label)}</option>`
                    ).join('')}
                </select>
            </div>
        </div>

        <div class="field">
            <label class="field__label" for="t-start">Fecha de inicio</label>
            <input class="input" id="t-start" type="date" value="${esc(treatment.startDate)}">
        </div>

        ${treatment.phases.length > 1 ? `
            <div class="field">
                <label class="field__label" for="t-phase">Fase a editar</label>
                <select class="select" id="t-phase">${phaseOptions}</select>
            </div>
        ` : `<input type="hidden" id="t-phase" value="0">`}

        <div class="field">
            <label class="field__label" for="t-dose">Dosis</label>
            <input class="input" id="t-dose" type="text" value="${esc(treatment.phases[0].dose)}" placeholder="Ej. 1/2 tableta">
        </div>

        <div class="field-row">
            <div class="field">
                <label class="field__label" for="t-every">Se repite cada</label>
                <select class="select" id="t-every">
                    ${[1, 2, 3, 7, 14, 30].map(days => {
                        const labels = { 1: 'Todos los días', 2: '2 días (48 h)', 3: '3 días (72 h)', 7: 'Semana', 14: '2 semanas', 30: 'Mes' };
                        return `<option value="${days}" ${treatment.phases[0].everyDays === days ? 'selected' : ''}>${labels[days]}</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="field">
                <label class="field__label" for="t-duration">Duración (días)</label>
                <input class="input" id="t-duration" type="number" min="1" max="3650"
                       value="${treatment.phases[0].durationDays === null ? '' : treatment.phases[0].durationDays}"
                       placeholder="Indefinido">
            </div>
        </div>

        <div class="field">
            <span class="field__label">Horas del día</span>
            <div class="time-chips" id="t-times"></div>
            <div class="field-row">
                <input class="input" id="t-new-time" type="time" value="09:00">
                <button type="button" class="btn btn--ghost" data-action="add-time">Agregar hora</button>
            </div>
            <p class="field__error" id="t-times-error" hidden></p>
        </div>

        <div class="field">
            <label class="field__label" for="t-instructions">Indicaciones</label>
            <textarea class="textarea" id="t-instructions" placeholder="Tal como lo indicó la veterinaria">${esc(treatment.instructions)}</textarea>
        </div>

        <div class="form-actions">
            <button type="button" class="btn btn--primary btn--block" data-action="save">Guardar</button>
            <button type="button" class="btn btn--ghost btn--block" data-action="cancel">Cancelar</button>
        </div>
    `, {
        onMount(body) {
            let phaseIndex = 0;
            let times = [...(treatment.phases[0].times || [])];

            const chips = body.querySelector('#t-times');

            function paintTimes() {
                if (times.length === 0) {
                    chips.innerHTML = '<p class="field__hint">Sin horas definidas todavía.</p>';
                    return;
                }
                chips.innerHTML = times
                    .slice()
                    .sort()
                    .map(time => `
                        <span class="time-chip">
                            ${esc(formatTime12(time))}
                            <button type="button" class="time-chip__remove" data-time="${esc(time)}" aria-label="Quitar ${esc(formatTime12(time))}">✕</button>
                        </span>
                    `).join('');
            }

            function loadPhase(index) {
                phaseIndex = index;
                const phase = treatment.phases[index];
                body.querySelector('#t-dose').value = phase.dose || '';
                body.querySelector('#t-every').value = String(phase.everyDays || 1);
                body.querySelector('#t-duration').value =
                    phase.durationDays === null || phase.durationDays === undefined ? '' : phase.durationDays;
                times = [...(phase.times || [])];
                paintTimes();
            }

            paintTimes();

            const phaseSelect = body.querySelector('#t-phase');
            if (phaseSelect && phaseSelect.tagName === 'SELECT') {
                phaseSelect.addEventListener('change', event => loadPhase(Number(event.target.value)));
            }

            chips.addEventListener('click', event => {
                const button = event.target.closest('.time-chip__remove');
                if (!button) return;
                times = times.filter(time => time !== button.dataset.time);
                paintTimes();
            });

            body.querySelector('[data-action="add-time"]').addEventListener('click', () => {
                const input = body.querySelector('#t-new-time');
                if (!input.value) return;
                if (!times.includes(input.value)) times.push(input.value);
                paintTimes();
            });

            body.querySelector('[data-action="cancel"]').addEventListener('click', closeSheet);

            body.querySelector('[data-action="save"]').addEventListener('click', () => {
                const name = body.querySelector('#t-name').value.trim();
                const nameError = body.querySelector('#t-name-error');
                const timesError = body.querySelector('#t-times-error');

                nameError.hidden = true;
                timesError.hidden = true;

                if (!name) {
                    nameError.textContent = 'Poné un nombre al tratamiento.';
                    nameError.hidden = false;
                    return;
                }

                if (times.length === 0) {
                    timesError.textContent = 'Agregá al menos una hora del día.';
                    timesError.hidden = false;
                    return;
                }

                const durationRaw = body.querySelector('#t-duration').value;
                const phases = treatment.phases.map((phase, index) => {
                    if (index !== phaseIndex) return phase;
                    return {
                        ...phase,
                        dose: body.querySelector('#t-dose').value.trim(),
                        everyDays: Number(body.querySelector('#t-every').value),
                        durationDays: durationRaw === '' ? null : Number(durationRaw),
                        times: times.slice().sort()
                    };
                });

                store.saveTreatment({
                    ...treatment,
                    id: treatment.id || undefined,
                    name,
                    category: body.querySelector('#t-category').value,
                    route: body.querySelector('#t-route').value,
                    startDate: body.querySelector('#t-start').value || todayKey(),
                    instructions: body.querySelector('#t-instructions').value.trim(),
                    phases
                });

                closeSheet();
                toast('Tratamiento guardado');
                refresh();
            });
        }
    });
}

function openStartDateSheet(refresh) {
    const state = store.getState();

    openSheet('Fecha de inicio del tratamiento', `
        <p class="detail__text">
            Es la fecha de la receta. Los tratamientos con duración limitada
            («por 2 días más», «por 20 días») se cuentan a partir de acá.
        </p>
        <div class="field">
            <label class="field__label" for="start-date">Fecha</label>
            <input class="input" id="start-date" type="date" value="${esc(state.settings.prescriptionDate)}">
        </div>
        <div class="switch-row">
            <div>
                <p class="switch-row__label">Aplicar a todos los tratamientos</p>
                <p class="switch-row__hint">Reemplaza la fecha de inicio de cada uno</p>
            </div>
            <input type="checkbox" id="apply-all" checked>
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn--primary btn--block" data-action="save">Guardar</button>
        </div>
    `, {
        onMount(body) {
            body.querySelector('[data-action="save"]').addEventListener('click', () => {
                const date = body.querySelector('#start-date').value;
                if (!date) return;

                store.updateSettings({ prescriptionDate: date });

                if (body.querySelector('#apply-all').checked) {
                    store.getState().treatments.forEach(treatment => {
                        store.saveTreatment({ ...treatment, startDate: date });
                    });
                }

                closeSheet();
                toast('Fecha actualizada');
                refresh();
            });
        }
    });
}
