/**
 * Punto de entrada: enrutador de pestañas, refresco de vistas y ajustes.
 *
 * Cada pestaña tiene su propio contenedor, montado una sola vez al arrancar.
 * Los eventos se enlazan por delegación sobre ese contenedor, así que volver a
 * pintar el HTML no obliga a reenlazar nada.
 */

import { esc, relativeTimeLabel, todayKey } from './format.js';
import { nextDose } from './schedule.js';
import * as store from './store.js';
import {
    openSheet, closeSheet, toast, confirmAction, downloadFile, readFileAsText
} from './ui.js';

import * as todayView from './views/today.js';
import * as treatmentsView from './views/treatments.js';
import * as glucoseView from './views/glucose.js';
import * as historyView from './views/history.js';

const main = document.getElementById('app-main');
const subtitle = document.getElementById('header-subtitle');
const syncChip = document.getElementById('sync-chip');
const boot = document.getElementById('boot');
const tabs = document.querySelectorAll('.tabbar__item');

const VIEWS = {
    today: todayView,
    meds: treatmentsView,
    glucose: glucoseView,
    history: historyView
};

const helpers = { openGlucoseSheet: todayView.openGlucoseSheet };
const containers = {};

let currentRoute = 'today';

function setupContainers() {
    Object.entries(VIEWS).forEach(([route, view]) => {
        const section = document.createElement('section');
        section.dataset.route = route;
        section.hidden = true;
        main.appendChild(section);
        view.mount(section, refresh, helpers);
        containers[route] = section;
    });
}

function refresh() {
    const state = store.getState();

    Object.entries(containers).forEach(([route, section]) => {
        if (route === currentRoute) {
            section.innerHTML = VIEWS[route].render(state);
            section.hidden = false;
        } else {
            section.hidden = true;
            section.innerHTML = '';
        }
    });

    updateSubtitle(state);
    updateTabs();
    updateSyncChip();
}

/** Muestra el estado de sincronización solo cuando hay algo que avisar. */
function updateSyncChip() {
    const status = store.getSyncStatus();

    if (!status.online) {
        syncChip.textContent = 'Sin conexión';
        syncChip.className = 'sync-chip sync-chip--offline';
        syncChip.hidden = false;
    } else if (status.pending) {
        syncChip.textContent = 'Sincronizando';
        syncChip.className = 'sync-chip sync-chip--pending';
        syncChip.hidden = false;
    } else {
        syncChip.hidden = true;
    }
}

function updateTabs() {
    tabs.forEach(tab => {
        if (tab.dataset.route === currentRoute) {
            tab.setAttribute('aria-current', 'page');
        } else {
            tab.removeAttribute('aria-current');
        }
    });
}

function updateSubtitle(state) {
    const upcoming = nextDose(state);

    if (!upcoming) {
        subtitle.textContent = 'Sin dosis pendientes';
        return;
    }

    subtitle.textContent = `${upcoming.treatment.name} · ${relativeTimeLabel(upcoming.scheduledAt)}`;
}

function navigate(route) {
    if (!VIEWS[route]) return;
    if (route === 'today') todayView.reset();
    currentRoute = route;
    refresh();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => navigate(tab.dataset.route));
});

/* --------------------------------------------------------------------------
   Ajustes y respaldo
   -------------------------------------------------------------------------- */

document.getElementById('btn-settings').addEventListener('click', openSettings);

function openSettings() {
    const state = store.getState();

    openSheet('Ajustes y respaldo', `
        <div class="stat-grid">
            <div class="stat"><p class="stat__value">${state.treatments.length}</p><p class="stat__label">Tratamientos</p></div>
            <div class="stat"><p class="stat__value">${state.doseLogs.length}</p><p class="stat__label">Dosis</p></div>
            <div class="stat"><p class="stat__value">${state.glucose.length}</p><p class="stat__label">Glicemias</p></div>
            <div class="stat"><p class="stat__value">${state.notes.length}</p><p class="stat__label">Notas</p></div>
        </div>

        <div class="field" style="margin-top:22px">
            <label class="field__label" for="pet-name">Nombre de la mascota</label>
            <input class="input" id="pet-name" type="text" value="${esc(state.settings.petName)}">
        </div>

        <div class="field">
            <label class="field__label" for="late-minutes">Marcar como atrasada después de</label>
            <select class="select" id="late-minutes">
                ${[30, 60, 90, 120].map(minutes =>
                    `<option value="${minutes}" ${state.settings.lateAfterMinutes === minutes ? 'selected' : ''}>${minutes} minutos</option>`
                ).join('')}
            </select>
        </div>

        <div class="form-actions">
            <button type="button" class="btn btn--primary btn--block" data-action="save-settings">Guardar ajustes</button>
            <button type="button" class="btn btn--ghost btn--block" data-action="export">Descargar respaldo</button>
            <button type="button" class="btn btn--ghost btn--block" data-action="import">Restaurar respaldo</button>
            <input type="file" id="import-file" accept="application/json,.json" hidden>
            <button type="button" class="btn btn--danger btn--block" data-action="reset">Restablecer receta original</button>
        </div>

        <p class="disclaimer" style="margin-top:20px">
            Los datos se guardan en la nube y se comparten entre todos los dispositivos
            que abran esta app. Aun así, conviene descargar un respaldo cada tanto.
        </p>
    `, {
        onMount(body) {
            body.querySelector('[data-action="save-settings"]').addEventListener('click', () => {
                store.updateSettings({
                    petName: body.querySelector('#pet-name').value.trim() || 'Alana',
                    lateAfterMinutes: Number(body.querySelector('#late-minutes').value)
                });
                closeSheet();
                toast('Ajustes guardados');
                refresh();
            });

            body.querySelector('[data-action="export"]').addEventListener('click', () => {
                downloadFile(`alana-respaldo-${todayKey()}.json`, store.exportState());
                toast('Respaldo descargado');
            });

            const fileInput = body.querySelector('#import-file');
            body.querySelector('[data-action="import"]').addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async event => {
                const file = event.target.files[0];
                if (!file) return;

                try {
                    toast('Restaurando respaldo…');
                    const result = await store.importState(await readFileAsText(file));
                    if (!result.ok) {
                        toast(result.error);
                        return;
                    }
                    closeSheet();
                    toast('Respaldo restaurado');
                    refresh();
                } catch (error) {
                    console.error('Fallo al restaurar el respaldo:', error);
                    toast('No se pudo leer el archivo');
                }
            });

            body.querySelector('[data-action="reset"]').addEventListener('click', () => {
                confirmAction({
                    title: 'Restablecer receta original',
                    message: 'Se borrarán todas las dosis registradas, glicemias y notas, y se ' +
                        'volverá al régimen tal como está en la receta. No se puede deshacer.',
                    confirmLabel: 'Restablecer',
                    danger: true
                }, async () => {
                    toast('Restableciendo…');
                    const result = await store.resetToSeed();
                    toast(result.ok ? 'Régimen restablecido' : result.error);
                    refresh();
                });
            });
        }
    });
}

/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */

store.setErrorHandler(message => toast(message));
setupContainers();

// Cualquier cambio —propio o hecho por otra persona— repinta la vista actual.
store.subscribe(() => {
    if (store.isReady()) refresh();
});

try {
    await store.init();
} catch (error) {
    console.error('No se pudo conectar con Firestore:', error);
    toast('No se pudo conectar con la nube.');
}

boot.hidden = true;
navigate('today');

// Repinta cada minuto para que los estados «atrasada» avancen solos.
setInterval(() => {
    if (currentRoute === 'today') refresh();
    else updateSubtitle(store.getState());
}, 60000);

// Y al volver a la app desde segundo plano.
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
});

// En localhost no se registra: el service worker sirve desde caché y taparía
// los cambios mientras se desarrolla.
const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

if ('serviceWorker' in navigator && !IS_LOCALHOST) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => {
            console.warn('No se pudo registrar el service worker:', error);
        });
    });
}
