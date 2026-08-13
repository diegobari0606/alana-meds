/**
 * Inicialización de Firebase.
 *
 * El SDK se carga como módulo ES desde el CDN de Google: sin npm ni compilación.
 *
 * Estas claves son públicas por diseño — viajan dentro del JavaScript que corre
 * en el navegador. Lo que protege los datos son las reglas de Firestore, no esto.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyDTZV1diiOBybnJdTDaQJrObaxVkjgeba8',
    authDomain: 'alanas-meds.firebaseapp.com',
    projectId: 'alanas-meds',
    storageBucket: 'alanas-meds.firebasestorage.app',
    messagingSenderId: '696708349461',
    appId: '1:696708349461:web:6945d2653cd3cc8ba2181c'
};

export const app = initializeApp(firebaseConfig);

/**
 * Caché persistente: la app funciona sin señal y sincroniza sola al volver.
 * `persistentMultipleTabManager` evita conflictos si se abre en varias pestañas.
 */
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const PROJECT_ID = firebaseConfig.projectId;
