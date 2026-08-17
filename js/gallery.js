/**
 * Galería de Alana: fotos que se deslizan, con una frase encima.
 *
 * El elemento se crea una sola vez y se reutiliza entre repintados de la vista,
 * para que el desplazamiento y el temporizador no se reinicien cada minuto.
 *
 * Para agregar fotos: dejarlas en la carpeta `photos/` y sumarlas a la lista
 * de abajo. Un sitio estático no puede listar carpetas, así que el índice
 * tiene que estar acá.
 */

import { esc } from './format.js';

export const PHOTOS = [
    { src: 'photos/alana-07.jpg', alt: 'Alana con su arnés rojo, sentada en un bloque de concreto' },
    { src: 'photos/alana-06.jpg', alt: 'Alana con suéter navideño, junto al árbol' },
    { src: 'photos/alana-05.jpg', alt: 'Alana en la bañera, lista para su baño' },
    { src: 'photos/alana-04.jpg', alt: 'Alana con pañoleta rosada, en la sala' },
    { src: 'photos/alana-03.jpg', alt: 'Alana vista desde arriba, con lazos rosados en las orejas' },
    { src: 'photos/alana-02.jpg', alt: 'Alana de pie en el césped, junto a la piscina' },
    { src: 'photos/alana-01.jpg', alt: 'Alana en el parque, con su pañoleta rosada' }
];

const PHRASES = [
    '¡Decile a Alana cuánto la querés!',
    'Cada día Alana está mejor.',
    'Un abrazo vale más que cualquier medicina.',
    'Alana es más fuerte de lo que parece.',
    'Hoy también se lo estás haciendo más fácil.',
    'Cada dosis a tiempo suma.',
    'Alana no sabe de glicemias: sabe que la cuidan.',
    'Su cola mueve más que cualquier gráfico.',
    'Los cuidados de hoy son sus paseos de mañana.',
    'Alana tiene suerte de tenerlos.',
    'Un día a la vez, y todos juntos.',
    'Gracias por no fallarle ni un día.'
];

const INTERVAL_MS = 6000;

let element = null;
let timer = null;
let index = 0;

function randomPhrase(exclude) {
    const options = PHRASES.filter(phrase => phrase !== exclude);
    return options[Math.floor(Math.random() * options.length)];
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Devuelve el elemento de la galería, creándolo la primera vez.
 * @returns {HTMLElement|null} `null` si todavía no hay fotos cargadas.
 */
export function galleryElement() {
    if (PHOTOS.length === 0) return null;
    if (element) return element;

    element = document.createElement('section');
    element.className = 'gallery';
    element.setAttribute('aria-label', 'Fotos de Alana');

    element.innerHTML = `
        <div class="gallery__track" id="gallery-track">
            ${PHOTOS.map((photo, position) => `
                <figure class="gallery__slide">
                    <img class="gallery__image" src="${esc(photo.src)}" alt="${esc(photo.alt || '')}"
                         loading="${position === 0 ? 'eager' : 'lazy'}" decoding="async">
                </figure>
            `).join('')}
        </div>
        <p class="gallery__phrase" id="gallery-phrase"></p>
        ${PHOTOS.length > 1 ? `
            <div class="gallery__dots" id="gallery-dots" role="tablist" aria-label="Foto actual">
                ${PHOTOS.map((_, position) => `
                    <button type="button" class="gallery__dot${position === 0 ? ' gallery__dot--active' : ''}"
                            data-index="${position}" aria-label="Foto ${position + 1}"></button>
                `).join('')}
            </div>
        ` : ''}
    `;

    setPhrase();
    bindEvents();
    startTimer();

    return element;
}

function setPhrase() {
    const node = element.querySelector('#gallery-phrase');
    node.textContent = randomPhrase(node.textContent);
}

function track() {
    return element.querySelector('#gallery-track');
}

function goTo(position, smooth = true) {
    const rail = track();
    if (!rail) return;

    index = (position + PHOTOS.length) % PHOTOS.length;
    rail.scrollTo({ left: rail.clientWidth * index, behavior: smooth ? 'smooth' : 'auto' });
    updateDots();
    setPhrase();
}

function updateDots() {
    const dots = element.querySelectorAll('.gallery__dot');
    dots.forEach((dot, position) => {
        dot.classList.toggle('gallery__dot--active', position === index);
    });
}

function startTimer() {
    if (PHOTOS.length < 2 || prefersReducedMotion()) return;
    stopTimer();
    timer = setInterval(() => {
        if (document.hidden) return;
        goTo(index + 1);
    }, INTERVAL_MS);
}

function stopTimer() {
    clearInterval(timer);
    timer = null;
}

function bindEvents() {
    const rail = track();

    // Al deslizar con el dedo se pausa, y se retoma un rato después.
    let resumeTimer = null;
    const pauseThenResume = () => {
        stopTimer();
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(startTimer, INTERVAL_MS * 2);
    };

    rail.addEventListener('pointerdown', pauseThenResume);

    let scrollSettle = null;
    rail.addEventListener('scroll', () => {
        clearTimeout(scrollSettle);
        scrollSettle = setTimeout(() => {
            const position = Math.round(rail.scrollLeft / rail.clientWidth);
            if (position !== index) {
                index = position;
                updateDots();
                setPhrase();
            }
        }, 120);
    }, { passive: true });

    const dots = element.querySelector('#gallery-dots');
    if (dots) {
        dots.addEventListener('click', event => {
            const dot = event.target.closest('.gallery__dot');
            if (!dot) return;
            pauseThenResume();
            goTo(Number(dot.dataset.index));
        });
    }

    // La frase también cambia al tocarla.
    element.querySelector('#gallery-phrase').addEventListener('click', setPhrase);
}

/**
 * Coloca la galería dentro del hueco reservado por la vista.
 * Al mover siempre el mismo nodo, no se pierde el estado.
 */
export function mountInto(slot) {
    const gallery = galleryElement();
    if (!gallery || !slot) return;

    slot.appendChild(gallery);

    // Tras un repintado el carril vuelve al inicio: se restaura la posición.
    const rail = track();
    if (rail) {
        requestAnimationFrame(() => {
            rail.scrollLeft = rail.clientWidth * index;
        });
    }
}
