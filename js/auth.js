/**
 * Inicio de sesión con Google, restringido a las cuentas de la familia.
 *
 * La app es un sitio público, así que la puerta está en dos lugares:
 * - Acá, para que la interfaz no se muestre a quien no corresponde.
 * - En las reglas de Firestore, que son las que realmente protegen los datos.
 *
 * La lista de abajo y las reglas del servidor tienen que decir lo mismo.
 */

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

import { app } from './firebase.js';

/**
 * Cuentas de Google autorizadas. Se comparan en minúsculas.
 * Debe coincidir con la lista de las reglas de Firestore.
 */
export const ALLOWED_EMAILS = [
    // Pendiente: correos de Diego y sus papás.
];

const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/** En iOS instalado como app, la ventana emergente no funciona bien. */
function prefersRedirect() {
    const standalone = window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return standalone || iOS;
}

/**
 * Mientras la lista esté vacía, la app funciona sin inicio de sesión: así no
 * queda inutilizable entre que se agrega el código y se cargan los correos.
 * Al completar `ALLOWED_EMAILS` —y las reglas de Firestore— la puerta se activa.
 */
export function isConfigured() {
    return ALLOWED_EMAILS.length > 0;
}

export function isAllowed(user) {
    if (!user || !user.email) return false;
    if (ALLOWED_EMAILS.length === 0) return false;
    return ALLOWED_EMAILS.includes(user.email.toLowerCase());
}

export function currentUser() {
    return auth.currentUser;
}

/**
 * Resuelve con el usuario cuando Firebase termina de restaurar la sesión,
 * o con `null` si no hay ninguna. Se llama una sola vez, al arrancar.
 */
export function waitForSession() {
    return getRedirectResult(auth)
        .catch(error => {
            console.warn('No se pudo completar el inicio de sesión:', error);
            return null;
        })
        .then(() => new Promise(resolve => {
            const unsubscribe = onAuthStateChanged(auth, user => {
                unsubscribe();
                resolve(user || null);
            });
        }));
}

/** Avisa de cada cambio de sesión (entrar, salir, expirar). */
export function watchSession(onChange) {
    return onAuthStateChanged(auth, user => onChange(user || null));
}

/**
 * Abre el inicio de sesión de Google.
 * @returns {Promise<{ok: boolean, user?: object, error?: string}>}
 */
export async function signIn() {
    try {
        if (prefersRedirect()) {
            await signInWithRedirect(auth, provider);
            return { ok: true };   // la página se recarga sola
        }

        const credential = await signInWithPopup(auth, provider);
        return { ok: true, user: credential.user };
    } catch (error) {
        // Si la ventana emergente falla, se reintenta redirigiendo.
        const popupFailed = [
            'auth/popup-blocked',
            'auth/popup-closed-by-user',
            'auth/cancelled-popup-request',
            'auth/operation-not-supported-in-this-environment'
        ].includes(error.code);

        if (popupFailed) {
            try {
                await signInWithRedirect(auth, provider);
                return { ok: true };
            } catch (redirectError) {
                return { ok: false, error: describeAuthError(redirectError) };
            }
        }

        return { ok: false, error: describeAuthError(error) };
    }
}

export function signOutUser() {
    return signOut(auth);
}

function describeAuthError(error) {
    switch (error && error.code) {
        case 'auth/unauthorized-domain':
            return 'Este dominio no está autorizado en Firebase. Agregalo en ' +
                'Authentication → Settings → Authorized domains.';
        case 'auth/operation-not-allowed':
            return 'El proveedor de Google no está habilitado en Firebase.';
        case 'auth/network-request-failed':
            return 'Sin conexión. Intentá de nuevo cuando tengas señal.';
        default:
            return 'No se pudo iniciar sesión. Intentá de nuevo.';
    }
}
