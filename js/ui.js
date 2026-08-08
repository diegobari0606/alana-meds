/**
 * Utilidades de interfaz: hoja modal, avisos y ayudas de DOM.
 */

import { esc } from './format.js';

const sheet = document.getElementById('sheet');
const sheetBackdrop = document.getElementById('sheet-backdrop');
const sheetTitle = document.getElementById('sheet-title');
const sheetBody = document.getElementById('sheet-body');
const sheetClose = document.getElementById('sheet-close');
const toastElement = document.getElementById('toast');

let toastTimer = null;
let onSheetClose = null;

/* --------------------------------------------------------------------------
   Hoja modal
   -------------------------------------------------------------------------- */

export function openSheet(title, html, { onClose = null, onMount = null } = {}) {
    sheetTitle.textContent = title;
    sheetBody.innerHTML = html;
    sheet.hidden = false;
    sheetBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    onSheetClose = onClose;

    if (typeof onMount === 'function') onMount(sheetBody);

    const firstField = sheetBody.querySelector('input, select, textarea');
    if (firstField && !firstField.readOnly) firstField.focus({ preventScroll: true });
}

export function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheetBackdrop.hidden = true;
    sheetBody.innerHTML = '';
    document.body.style.overflow = '';

    const callback = onSheetClose;
    onSheetClose = null;
    if (typeof callback === 'function') callback();
}

export function isSheetOpen() {
    return !sheet.hidden;
}

sheetClose.addEventListener('click', closeSheet);
sheetBackdrop.addEventListener('click', closeSheet);

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSheet();
});

/** Acceso al cuerpo de la hoja, para que las vistas enlacen sus eventos. */
export function sheetContent() {
    return sheetBody;
}

/* --------------------------------------------------------------------------
   Avisos
   -------------------------------------------------------------------------- */

export function toast(message, duration = 2600) {
    toastElement.textContent = message;
    toastElement.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastElement.hidden = true;
    }, duration);
}

/** Confirmación simple dentro de la hoja modal. */
export function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = false }, onConfirm) {
    openSheet(title, `
        <p class="confirm-text">${esc(message)}</p>
        <div class="form-actions">
            <button type="button" class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'} btn--block" data-action="confirm">
                ${esc(confirmLabel)}
            </button>
            <button type="button" class="btn btn--ghost btn--block" data-action="cancel">Cancelar</button>
        </div>
    `, {
        onMount(body) {
            body.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                closeSheet();
                onConfirm();
            });
            body.querySelector('[data-action="cancel"]').addEventListener('click', closeSheet);
        }
    });
}

/* --------------------------------------------------------------------------
   Ayudas de DOM
   -------------------------------------------------------------------------- */

/** Delegación de eventos: ejecuta el handler cuando el clic viene de `selector`. */
export function delegate(root, selector, eventName, handler) {
    root.addEventListener(eventName, event => {
        const target = event.target.closest(selector);
        if (target && root.contains(target)) handler(event, target);
    });
}

/** Bloque de estado vacío reutilizable. */
export function emptyState({ icon, title, text, actionLabel = null, action = null }) {
    return `
        <div class="empty">
            <div class="empty__icon" aria-hidden="true">${icon}</div>
            <p class="empty__title">${esc(title)}</p>
            <p class="empty__text">${esc(text)}</p>
            ${actionLabel ? `<button type="button" class="btn btn--primary" data-action="${esc(action)}">${esc(actionLabel)}</button>` : ''}
        </div>
    `;
}

/** Encabezado de sección con título y contador opcional. */
export function sectionHeading(title, meta = '') {
    return `
        <div class="section-heading">
            <h2 class="section-heading__title">${esc(title)}</h2>
            ${meta ? `<span class="section-heading__meta">${esc(meta)}</span>` : ''}
        </div>
    `;
}

/** Descarga un archivo generado en el navegador. */
export function downloadFile(filename, content, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lee un archivo elegido por el usuario y devuelve su texto. */
export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsText(file);
    });
}
