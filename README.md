# Alana — Control de medicamentos

App web para llevar el registro de los medicamentos, la glicemia y los tratamientos
de Alana, según la receta de la Dra. Carolina Espinoza Picado (Veterinaria Vicovet).

Está pensada para usarse desde el celular, instalada en la pantalla de inicio.
Funciona sin señal.

## Qué registra

| Sección | Para qué sirve |
|---|---|
| **Hoy** | La agenda del día. Marcar cada dosis como dada u omitida, con una nota opcional. |
| **Tratamientos** | El régimen completo, agrupado por categoría. Permite editar horarios, dosis y duración. |
| **Glicemia** | Mediciones en mg/dl, con promedio, mínima, máxima y gráfico de tendencia. |
| **Historial** | Línea de tiempo de los últimos 30 días: dosis, glicemias y notas de síntomas. |

### La regla de la insulina

La receta indica revisar la glicemia antes de cada aplicación y **no aplicar
insulina por debajo de 150 mg/dl**. La app lo refleja así:

- Si no hay una medición de las últimas 4 horas, al marcar la insulina propone
  registrar la glicemia primero.
- Si la última medición está por debajo de 150 mg/dl, avisa antes de dejar
  registrar la dosis.

En ningún caso la app impide registrar algo: solo advierte. La decisión clínica
es de ustedes y de la veterinaria.

## Cómo correrla en la computadora

No hace falta instalar nada — no tiene dependencias ni paso de compilación.
Solo necesita servirse por HTTP (los módulos de JavaScript no cargan desde `file://`):

```bash
cd "/Users/diegobarillasvalverde/Documents/Alanas progress/alana-meds" && python3 -m http.server 4173
```

Después abrí <http://127.0.0.1:4173>.

En `localhost` el service worker no se registra a propósito, para que los cambios
se vean sin tener que limpiar la caché.

## Cómo ponerla en el celular

Hace falta publicarla en una dirección HTTPS. Dos opciones, ninguna requiere Node:

**Netlify Drop** — la más rápida. Entrá a <https://app.netlify.com/drop> y arrastrá
la carpeta `alana-meds`. Te devuelve una URL al instante.

**GitHub Pages** — si preferís tenerlo versionado:

```bash
cd "/Users/diegobarillasvalverde/Documents/Alanas progress/alana-meds" && git init && git add -A && git commit -m "feat: app de control de medicamentos de Alana"
```

Después creás el repositorio en GitHub, hacés push, y en *Settings → Pages*
elegís la rama `main` y la carpeta raíz.

### Instalarla en el iPhone

1. Abrí la URL en **Safari** (no funciona desde Chrome en iOS).
2. Botón de compartir → **Agregar a pantalla de inicio**.
3. Se instala con su ícono y arranca a pantalla completa, sin barra del navegador.

En Android es igual desde Chrome: menú → *Instalar aplicación*.

## Dónde se guardan los datos

En **Cloud Firestore**, proyecto `alanas-meds`. Todos los dispositivos que abran
la app ven y escriben la misma información, en tiempo real: si alguien marca una
dosis, a los demás se les actualiza la pantalla sin recargar.

Funciona sin señal. El SDK guarda los cambios en una caché local del dispositivo
y los sincroniza solo al recuperar la conexión. Mientras tanto, el encabezado
muestra «Sin conexión» o «Sincronizando».

Se usan seis colecciones: `treatments`, `doseLogs`, `glucose`, `notes`,
`appointments` y `settings`. La primera vez que se abre la app contra una base
vacía, se cargan solos los tratamientos de la receta.

El plan es **Spark** (gratis): 50.000 lecturas y 20.000 escrituras por día, muy
por encima de lo que consume el uso diario de tres personas.

### Sobre la seguridad

Las reglas de Firestore están **abiertas**: no hay login, y cualquiera que
consiga el `projectId` puede leer y escribir. El `projectId` viaja dentro del
JavaScript de la app, así que en la práctica la protección es que la URL no se
publique en ningún lado.

Fue una decisión consciente para evitar la fricción de iniciar sesión. Si más
adelante se quiere cerrar, el camino es agregar Google Sign-In restringido a
correos concretos y cambiar las reglas a `if request.auth.token.email in [...]`.
Es un cambio contenido: no toca las vistas.

Las claves de `js/firebase.js` son públicas por diseño — son identificadores de
cliente, no secretos. Lo que **nunca** debe entrar al repositorio es una clave
de *service account* (Configuración del proyecto → Cuentas de servicio), que se
salta todas las reglas.

Conviene igual usar **Ajustes → Descargar respaldo** cada tanto.

## Estructura

```
index.html               Estructura de la página y barra de pestañas
manifest.webmanifest     Metadatos de instalación (PWA)
sw.js                    Service worker: caché para funcionar sin señal
css/styles.css           Estilos, con modo claro y oscuro
icons/                   Íconos de la app
js/
  app.js                 Enrutador de pestañas, ajustes y respaldo
  firebase.js            Configuración del proyecto y caché offline de Firestore
  store.js               Estado y persistencia — el único archivo que habla con la base
  seed.js                El régimen de Alana transcrito de la receta
  schedule.js            Cálculo de qué dosis tocan cada día
  format.js              Fechas, horas y texto en español
  ui.js                  Hoja modal, avisos y ayudas de DOM
  views/
    today.js             Agenda del día
    treatments.js        Régimen y edición
    glucose.js           Mediciones y gráfico
    history.js           Línea de tiempo
```

## Cómo funcionan los horarios

Cada tratamiento tiene una o más **fases** que corren una tras otra desde su fecha
de inicio. Una fase define:

- `dose` — cuánto se da (`"1/2 tableta"`, `"2 UI"`, `"0,4 ml"`).
- `everyDays` — cada cuántos días se repite (`1` diario, `2` cada 48 h, `7` semanal…).
- `times` — a qué horas del día (`["11:00", "23:00"]`).
- `durationDays` — cuántos días dura, o `null` si es indefinido.

Esto cubre los esquemas escalonados de la receta. Por ejemplo, la prednisolona:

| Fase | Dosis | Frecuencia | Duración |
|---|---|---|---|
| 1 | 0,4 ml | cada 48 h | 14 días |
| 2 | 0,3 ml | cada 48 h | 7 días |
| 3 | 0,3 ml | cada 72 h | 7 días |

Al terminar la fase 3 el tratamiento deja de aparecer en la agenda.

### La fecha de inicio importa

Los tratamientos con duración limitada («por 2 días más», «por 20 días») se cuentan
desde la fecha configurada en **Tratamientos → Cambiar fecha de inicio**. Por defecto
es el día en que se abrió la app por primera vez; hay que ajustarla a la fecha real
de la receta para que las duraciones cuadren.

## Aviso

Esta app es un registro personal de lo indicado por la veterinaria. No calcula
dosis, no da recomendaciones médicas y no sustituye el criterio profesional.
Ante cualquier duda o reacción, consultar con la clínica.
