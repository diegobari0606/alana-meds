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
    'partners@aditumcr.com'
];

const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/**
 * Se usa ventana emergente y no redirección.
 *
 * Con redirección, al volver de Google el navegador aísla el almacenamiento
 * entre el dominio de la app (github.io) y el de autenticación
 * (firebaseapp.com), la sesión se pierde y se vuelve a la pantalla de entrada.
 * La ventana emergente se comunica por postMessage y no sufre ese problema.
 */

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
        const credential = await signInWithPopup(auth, provider);
        return { ok: true, user: credential.user };
    } catch (error) {
        console.error('Error al iniciar sesión:', error.code, error.message);
        // Si el usuario cerró la ventana, no hay nada que reintentar.
        if (error.code === 'auth/popup-closed-by-user' ||
            error.code === 'auth/cancelled-popup-request') {
            return { ok: false, error: '' };
        }

        // Último recurso cuando el navegador no permite ventanas emergentes.
        const popupUnavailable = [
            'auth/popup-blocked',
            'auth/operation-not-supported-in-this-environment'
        ].includes(error.code);

        if (popupUnavailable) {
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
        case 'auth/popup-blocked':
            return 'El navegador bloqueó la ventana de Google. Permití las ' +
                'ventanas emergentes para este sitio e intentá otra vez.';
        case 'auth/network-request-failed':
            return 'Sin conexión. Intentá de nuevo cuando tengas señal.';
        default:
            return `No se pudo iniciar sesión (${(error && error.code) || 'sin código'}).`;
    }
}
