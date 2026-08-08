/**
 * Régimen de Alana, transcrito de la receta de Veterinaria Vicovet
 * (Dra. Carolina Espinoza Picado).
 *
 * Cada tratamiento tiene una o más fases. Una fase describe cada cuántos días
 * se repite (`everyDays`), a qué horas (`times`) y cuánto dura (`durationDays`,
 * `null` = indefinido). Las fases corren una tras otra desde `startDate`.
 *
 * Las horas son editables desde la app; las que no venían escritas en la receta
 * se eligieron para acompañar el horario de insulina y comida (11:00 / 23:00).
 */

export const CATEGORIES = {
    metabolico: { label: 'Metabólico', icon: '🩸' },
    alimentacion: { label: 'Alimentación', icon: '🍽️' },
    hepatico: { label: 'Hepático', icon: '🫀' },
    pancreatitis: { label: 'Pancreatitis', icon: '💊' },
    dermatologico: { label: 'Dermatológico', icon: '🧴' }
};

export const ROUTES = {
    subcutanea: 'Subcutánea',
    oral: 'Vía oral',
    topica: 'Tópica',
    otica: 'Ótica',
    bano: 'Baño',
    pipeta: 'Pipeta',
    alimento: 'Alimento'
};

/**
 * Construye la lista de tratamientos con la fecha de inicio indicada.
 * @param {string} startDate clave `YYYY-MM-DD` con la fecha de la receta.
 */
export function buildSeedTreatments(startDate) {
    const definitions = [
        {
            id: 'insulina-nph',
            name: 'Insulina NPH',
            category: 'metabolico',
            route: 'subcutanea',
            icon: '💉',
            requiresGlucose: true,
            glucoseMin: 150,
            instructions:
                'Aplicar 2 UI por vía subcutánea cada 12 horas por tiempo indefinido. ' +
                'Se debe administrar su alimentación al momento de aplicar la insulina.',
            warnings: [
                'Revisar la glicemia siempre antes de aplicar.',
                'No aplicar si la glicemia está por debajo de 150 mg/dl.',
                'La insulina no debe batirse ni utilizarse por más de un mes.'
            ],
            phases: [
                { dose: '2 UI', everyDays: 1, times: ['11:00', '23:00'], durationDays: null }
            ]
        },
        {
            id: 'alimento',
            name: 'Alimento',
            category: 'alimentacion',
            route: 'alimento',
            icon: '🍽️',
            instructions:
                'Brindar 45 g cada 12 horas, en el momento de aplicar la insulina.',
            warnings: [
                'No dar más tiempos de comida de los recomendados ni snacks adicionales.'
            ],
            phases: [
                { dose: '45 g', everyDays: 1, times: ['11:00', '23:00'], durationDays: null }
            ]
        },
        {
            id: 'proteliv',
            name: 'Proteliv',
            category: 'hepatico',
            route: 'oral',
            icon: '💊',
            instructions: 'Dar vía oral 1/2 tableta cada 24 horas por tiempo indefinido.',
            phases: [
                { dose: '1/2 tableta', everyDays: 1, times: ['11:00'], durationDays: null }
            ]
        },
        {
            id: 'samylin',
            name: 'Samylin razas pequeñas',
            category: 'hepatico',
            route: 'oral',
            icon: '💊',
            instructions: 'Dar 1 comprimido cada 24 horas por tiempo indefinido.',
            phases: [
                { dose: '1 comprimido', everyDays: 1, times: ['11:00'], durationDays: null }
            ]
        },
        {
            id: 'famotidina',
            name: 'Famotidina 40 mg',
            category: 'pancreatitis',
            route: 'oral',
            icon: '💊',
            instructions: 'Dar vía oral 1/8 cada 12 horas por 2 días más.',
            warnings: ['Dar en ayuno, al menos 30 minutos antes de comer.'],
            phases: [
                { dose: '1/8 de tableta', everyDays: 1, times: ['10:30', '22:30'], durationDays: 2 }
            ]
        },
        {
            id: 'amoxicilina-clavulanico',
            name: 'Amoxicilina + ác. clavulánico 250 mg',
            category: 'pancreatitis',
            route: 'oral',
            icon: '💊',
            instructions: 'Dar vía oral 1/2 tableta cada 12 horas por 2 días más.',
            warnings: ['Dar con comida y siempre a las mismas horas.'],
            phases: [
                { dose: '1/2 tableta', everyDays: 1, times: ['11:00', '23:00'], durationDays: 2 }
            ]
        },
        {
            id: 'enzy-biotic',
            name: 'Enzy Biotic',
            category: 'pancreatitis',
            route: 'oral',
            icon: '💊',
            instructions: 'Dar vía oral 1/2 tableta cada 24 horas por 20 días.',
            phases: [
                { dose: '1/2 tableta', everyDays: 1, times: ['11:00'], durationDays: 20 }
            ]
        },
        {
            id: 'prednisolona',
            name: 'Prednisolona',
            category: 'dermatologico',
            route: 'oral',
            icon: '💧',
            instructions:
                'Esquema descendente en tres fases; al terminar la tercera se suspende.',
            warnings: [
                'No volver a las dosis usadas los últimos 3 años: son el desencadenante ' +
                'de la pancreatitis, el hígado graso, la enfermedad biliar y la diabetes.'
            ],
            phases: [
                { label: 'Fase 1', dose: '0,4 ml', everyDays: 2, times: ['11:00'], durationDays: 14 },
                { label: 'Fase 2', dose: '0,3 ml', everyDays: 2, times: ['11:00'], durationDays: 7 },
                { label: 'Fase 3', dose: '0,3 ml', everyDays: 3, times: ['11:00'], durationDays: 7 }
            ]
        },
        {
            id: 'limpieza-vinagre',
            name: 'Limpieza con vinagre + Crema Neowell',
            category: 'dermatologico',
            route: 'topica',
            icon: '🧴',
            instructions:
                'Diluir 5 ml de vinagre en 95 ml de agua y limpiar la lesión del lomo. ' +
                'Después aplicar una pequeña capa de Crema Neowell.',
            phases: [
                { dose: '2 veces al día', everyDays: 1, times: ['08:00', '20:00'], durationDays: 15 }
            ]
        },
        {
            id: 'mometasona',
            name: 'Mometasona crema 0.1%',
            category: 'dermatologico',
            route: 'topica',
            icon: '🧴',
            instructions:
                'Aplicar en zona interdigital o en zonas de mucha picazón, 2 veces por día.',
            phases: [
                { dose: 'Capa fina', everyDays: 1, times: ['08:00', '20:00'], durationDays: 15 }
            ]
        },
        {
            id: 'cort-otic',
            name: 'Cort Otic',
            category: 'dermatologico',
            route: 'otica',
            icon: '👂',
            instructions: 'Aplicar 1 atomización en cada oído.',
            phases: [
                { label: 'Diario', dose: '1 atomización por oído', everyDays: 1, times: ['09:00'], durationDays: 3 },
                { label: 'Semanal', dose: '1 atomización por oído', everyDays: 7, times: ['09:00'], durationDays: 28 }
            ]
        },
        {
            id: 'champu-dermacalm',
            name: 'Baño con Champú Dermacalm',
            category: 'dermatologico',
            route: 'bano',
            icon: '🛁',
            instructions:
                'Realizar 1 baño por semana, dejando actuar 10 minutos, enjuagar y secar bien.',
            phases: [
                { dose: '1 baño', everyDays: 7, times: ['09:00'], durationDays: null }
            ]
        },
        {
            id: 'pipeta-labyderm',
            name: 'Pipeta Labyderm Premium Cover',
            category: 'dermatologico',
            route: 'pipeta',
            icon: '💧',
            instructions:
                'Distribuir en 3 puntos del lomo, siempre directamente sobre la piel.',
            phases: [
                { label: 'Semanal', dose: '1 pipeta', everyDays: 7, times: ['09:00'], durationDays: 28 },
                { label: 'Mensual', dose: '1 pipeta', everyDays: 30, times: ['09:00'], durationDays: null }
            ]
        }
    ];

    return definitions.map(definition => ({
        ...definition,
        startDate,
        active: true,
        warnings: definition.warnings || [],
        requiresGlucose: definition.requiresGlucose || false,
        glucoseMin: definition.glucoseMin || null,
        phases: definition.phases.map(phase => ({ label: null, ...phase }))
    }));
}

/** Notas de la receta que no son dosis programables. */
export function buildSeedNotes(startDate) {
    return [
        {
            id: 'nota-cytopoint',
            at: `${startDate}T09:00`,
            text:
                'Una vez estabilizada la dosis de insulina se coordinará la aplicación de ' +
                'Cytopoint como medicamento sistémico para el manejo del prurito.'
        }
    ];
}

/** Cita de control anotada en la receta. */
export function buildSeedAppointments() {
    return [
        {
            id: 'cita-control',
            date: '2026-08-06',
            title: 'Revisión con Dra. Carolina Espinoza Picado',
            notes:
                'Hemograma y monitoreo de glicemias. En caso de estabilidad se aplicaría Cytopoint.'
        }
    ];
}
