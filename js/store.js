/**
 * Estado de la aplicación, sincronizado con Cloud Firestore.
 *
 * Cómo funciona:
 * - Se mantiene una copia en memoria (`state`) que las vistas leen de forma
 *   síncrona con `getState()`.
 * - Firestore avisa de cualquier cambio —propio o de otra persona— y ahí se
 *   actualiza la copia y se notifica a los suscriptores.
 * - Las escrituras no se esperan: el SDK las aplica primero en la caché local
 *   (así la pantalla responde al instante, incluso sin señal) y las envía al
 *   servidor cuando puede.
 *
 * Este es el único archivo que habla con la base de datos.
 */

import {
    collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDocs
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

import { db } from './firebase.js';
import { todayKey } from './format.js';
import { buildSeedTreatments, buildSeedNotes, buildSeedAppointments } from './seed.js';

/** Clave del almacenamiento local de la versión anterior, para migrar una vez. */
const LEGACY_KEY = 'alana-meds/v1';
const LEGACY_DONE_KEY = 'alana-meds/migrado-a-firestore';

const SETTINGS_DOC = 'app';

/** Colecciones de Firestore. Coinciden con las reglas de seguridad publicadas. */
const COLLECTIONS = ['treatments', 'doseLogs', 'glucose', 'notes', 'appointments'];

const listeners = new Set();
const unsubscribers = [];

let state = createEmptyState();
let ready = false;
let seedChecked = false;

/** Estado de sincronización, para el indicador del encabezado. */
let sync = { online: true, pending: false };

let errorHandler = () => {};

function createEmptyState() {
    return {
        settings: {
            petName: 'Alana',
            prescriptionDate: todayKey(),
            lateAfterMinutes: 60
        },
        treatments: [],
        doseLogs: [],
        glucose: [],
        notes: [],
        appointments: []
    };
}

function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 9);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function notify() {
    listeners.forEach(listener => listener(state));
}

/** Quita claves con `undefined`, que Firestore rechaza. */
function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (value === null || typeof value !== 'object') return value;

    const result = {};
    Object.entries(value).forEach(([key, item]) => {
        if (item !== undefined) result[key] = clean(item);
    });
    return result;
}

/* --------------------------------------------------------------------------
   Arranque y escucha en tiempo real
   -------------------------------------------------------------------------- */

/**
 * Conecta con Firestore y resuelve cuando llega la primera carga de datos.
 * @returns {Promise<void>}
 */
export function init() {
    return new Promise(resolve => {
        const pendingFirstLoad = new Set([...COLLECTIONS, 'settings']);

        const settleOne = key => {
            if (!pendingFirstLoad.delete(key)) return;
            if (pendingFirstLoad.size === 0) {
                ready = true;
                resolve();
            }
        };

        COLLECTIONS.forEach(name => {
            const unsubscribe = onSnapshot(
                collection(db, name),
                snapshot => {
                    state[name] = snapshot.docs.map(document => ({
                        ...document.data(),
                        id: document.id
                    }));

                    sync.online = !snapshot.metadata.fromCache;
                    sync.pending = snapshot.metadata.hasPendingWrites;

                    settleOne(name);
                    maybeSeed(snapshot);
                    notify();
                },
                error => {
                    console.error(`Error escuchando «${name}»:`, error);
                    errorHandler(describeError(error));
                    settleOne(name);
                }
            );
            unsubscribers.push(unsubscribe);
        });

        const unsubscribeSettings = onSnapshot(
            doc(db, 'settings', SETTINGS_DOC),
            snapshot => {
                if (snapshot.exists()) {
                    state.settings = { ...createEmptyState().settings, ...snapshot.data() };
                }
                settleOne('settings');
                notify();
            },
            error => {
                console.error('Error escuchando los ajustes:', error);
                errorHandler(describeError(error));
                settleOne('settings');
            }
        );
        unsubscribers.push(unsubscribeSettings);
    });
}

function describeError(error) {
    if (error && error.code === 'permission-denied') {
        return 'Firestore rechazó la operación: revisá las reglas de seguridad.';
    }
    if (error && error.code === 'unavailable') {
        return 'Sin conexión. Los cambios se guardan y se sincronizan luego.';
    }
    return 'No se pudo sincronizar con la nube.';
}

export function getState() {
    return state;
}

export function isReady() {
    return ready;
}

export function getSyncStatus() {
    return { ...sync };
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setErrorHandler(handler) {
    errorHandler = typeof handler === 'function' ? handler : () => {};
}

/** Corta la escucha. Solo se usa en pruebas. */
export function teardown() {
    unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
}

/* --------------------------------------------------------------------------
   Siembra inicial y migración desde el dispositivo
   -------------------------------------------------------------------------- */

/**
 * Si la base está vacía, la puebla una sola vez: con lo que hubiera guardado
 * localmente en la versión anterior, o con el régimen de la receta.
 *
 * Solo actúa con datos confirmados por el servidor (`fromCache === false`), para
 * no sembrar desde un dispositivo que arrancó sin señal.
 */
function maybeSeed(snapshot) {
    if (seedChecked) return;
    if (snapshot.metadata.fromCache) return;
    if (state.treatments.length > 0) {
        seedChecked = true;
        return;
    }

    seedChecked = true;

    const legacy = readLegacyState();
    if (legacy) {
        uploadSnapshot(legacy)
            .then(() => {
                localStorage.setItem(LEGACY_DONE_KEY, new Date().toISOString());
                console.info('Datos locales migrados a Firestore.');
            })
            .catch(error => {
                seedChecked = false;
                console.error('Falló la migración de los datos locales:', error);
                errorHandler('No se pudieron migrar los datos del dispositivo.');
            });
        return;
    }

    const start = todayKey();
    uploadSnapshot({
        settings: { ...createEmptyState().settings, prescriptionDate: start },
        treatments: buildSeedTreatments(start),
        notes: buildSeedNotes(start),
        appointments: buildSeedAppointments(),
        doseLogs: [],
        glucose: []
    }).catch(error => {
        seedChecked = false;
        console.error('Falló la carga del régimen inicial:', error);
        errorHandler('No se pudo cargar el régimen inicial.');
    });
}

function readLegacyState() {
    if (localStorage.getItem(LEGACY_DONE_KEY)) return null;

    let parsed;
    try {
        parsed = JSON.parse(localStorage.getItem(LEGACY_KEY));
    } catch (error) {
        console.warn('No se pudo leer el respaldo local anterior:', error);
        return null;
    }

    if (!parsed || !Array.isArray(parsed.treatments) || parsed.treatments.length === 0) {
        return null;
    }

    return parsed;
}

/** Escribe un estado completo en Firestore, en lotes. */
async function uploadSnapshot(source) {
    const operations = [];

    COLLECTIONS.forEach(name => {
        (source[name] || []).forEach(item => {
            if (!item || !item.id) return;
            const { id, ...rest } = item;
            operations.push({ ref: doc(db, name, id), data: clean(rest) });
        });
    });

    if (source.settings) {
        operations.push({
            ref: doc(db, 'settings', SETTINGS_DOC),
            data: clean(source.settings)
        });
    }

    // Firestore admite 500 operaciones por lote.
    for (let index = 0; index < operations.length; index += 400) {
        const batch = writeBatch(db);
        operations.slice(index, index + 400).forEach(op => batch.set(op.ref, op.data));
        await batch.commit();
    }
}

/* --------------------------------------------------------------------------
   Escrituras
   -------------------------------------------------------------------------- */

/**
 * Guarda un documento. No se espera a propósito: el SDK aplica el cambio en la
 * caché local de inmediato y la pantalla se actualiza sola por el listener.
 */
function save(collectionName, id, data) {
    setDoc(doc(db, collectionName, id), clean(data), { merge: false })
        .catch(error => {
            console.error(`No se pudo guardar en «${collectionName}»:`, error);
            errorHandler(describeError(error));
        });
}

function remove(collectionName, id) {
    deleteDoc(doc(db, collectionName, id))
        .catch(error => {
            console.error(`No se pudo eliminar de «${collectionName}»:`, error);
            errorHandler(describeError(error));
        });
}

/* --------------------------------------------------------------------------
   Ajustes
   -------------------------------------------------------------------------- */

export function updateSettings(patch) {
    const next = { ...state.settings, ...patch };
    state.settings = next;
    notify();
    save('settings', SETTINGS_DOC, next);
}

/* --------------------------------------------------------------------------
   Tratamientos
   -------------------------------------------------------------------------- */

export function getTreatment(treatmentId) {
    return state.treatments.find(treatment => treatment.id === treatmentId) || null;
}

export function saveTreatment(treatment) {
    const id = treatment.id || createId('trt');
    const existing = getTreatment(id);
    const { id: _ignored, ...rest } = { ...existing, ...treatment };
    save('treatments', id, rest);
}

export function setTreatmentActive(treatmentId, active) {
    const treatment = getTreatment(treatmentId);
    if (!treatment) return;
    const { id, ...rest } = treatment;
    save('treatments', treatmentId, { ...rest, active });
}

export function deleteTreatment(treatmentId) {
    remove('treatments', treatmentId);
    state.doseLogs
        .filter(log => log.treatmentId === treatmentId)
        .forEach(log => remove('doseLogs', log.id));
}

/* --------------------------------------------------------------------------
   Registro de dosis
   -------------------------------------------------------------------------- */

export function occurrenceKey(treatmentId, scheduledFor) {
    return `${treatmentId}|${scheduledFor}`;
}

export function findDoseLog(treatmentId, scheduledFor) {
    return state.doseLogs.find(
        log => log.treatmentId === treatmentId && log.scheduledFor === scheduledFor
    ) || null;
}

export function logDose({ treatmentId, scheduledFor = null, status = 'given', at = null, note = '' }) {
    const existing = scheduledFor ? findDoseLog(treatmentId, scheduledFor) : null;
    const id = existing ? existing.id : createId('dose');

    const entry = {
        treatmentId,
        scheduledFor,
        status,
        at: at || new Date().toISOString(),
        note
    };

    save('doseLogs', id, entry);
    return { id, ...entry };
}

export function removeDoseLog(logId) {
    remove('doseLogs', logId);
}

export function getDoseLogs() {
    return state.doseLogs;
}

/* --------------------------------------------------------------------------
   Glicemia
   -------------------------------------------------------------------------- */

export function logGlucose({ value, at = null, context = 'antes-insulina', note = '' }) {
    const id = createId('glu');
    const entry = {
        value: Number(value),
        at: at || new Date().toISOString(),
        context,
        note
    };
    save('glucose', id, entry);
    return { id, ...entry };
}

export function removeGlucose(entryId) {
    remove('glucose', entryId);
}

export function latestGlucose() {
    if (state.glucose.length === 0) return null;
    return state.glucose.reduce((latest, entry) =>
        new Date(entry.at) > new Date(latest.at) ? entry : latest
    );
}

/* --------------------------------------------------------------------------
   Notas
   -------------------------------------------------------------------------- */

export function addNote({ text, at = null }) {
    const id = createId('note');
    const entry = { text: text.trim(), at: at || new Date().toISOString() };
    save('notes', id, entry);
    return { id, ...entry };
}

export function removeNote(noteId) {
    remove('notes', noteId);
}

/* --------------------------------------------------------------------------
   Citas
   -------------------------------------------------------------------------- */

export function saveAppointment(appointment) {
    const id = appointment.id || createId('apt');
    const { id: _ignored, ...rest } = appointment;
    save('appointments', id, rest);
}

export function removeAppointment(appointmentId) {
    remove('appointments', appointmentId);
}

/* --------------------------------------------------------------------------
   Respaldo
   -------------------------------------------------------------------------- */

export function exportState() {
    return JSON.stringify(state, null, 2);
}

/**
 * Reemplaza el contenido de la nube con el de un respaldo.
 * Devuelve `{ ok, error }` en vez de lanzar, para que la vista muestre el aviso.
 */
export async function importState(json) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        return { ok: false, error: 'El archivo no es un respaldo válido.' };
    }

    if (!parsed || !Array.isArray(parsed.treatments)) {
        return { ok: false, error: 'El respaldo no contiene tratamientos.' };
    }

    try {
        await clearAll();
        await uploadSnapshot(parsed);
        return { ok: true };
    } catch (error) {
        console.error('No se pudo restaurar el respaldo:', error);
        return { ok: false, error: 'No se pudo restaurar el respaldo en la nube.' };
    }
}

/** Borra todos los documentos de todas las colecciones. */
async function clearAll() {
    for (const name of COLLECTIONS) {
        const snapshot = await getDocs(collection(db, name));
        const documents = snapshot.docs;

        for (let index = 0; index < documents.length; index += 400) {
            const batch = writeBatch(db);
            documents.slice(index, index + 400).forEach(document => batch.delete(document.ref));
            await batch.commit();
        }
    }
}

/** Vuelve al régimen de la receta, borrando todo lo registrado. */
export async function resetToSeed() {
    const start = todayKey();
    try {
        await clearAll();
        await uploadSnapshot({
            settings: { ...createEmptyState().settings, prescriptionDate: start },
            treatments: buildSeedTreatments(start),
            notes: buildSeedNotes(start),
            appointments: buildSeedAppointments(),
            doseLogs: [],
            glucose: []
        });
        return { ok: true };
    } catch (error) {
        console.error('No se pudo restablecer el régimen:', error);
        return { ok: false, error: 'No se pudo restablecer el régimen.' };
    }
}
