// Utilidades para manejo de fechas y días hábiles

/**
 * Verifica si una fecha es día hábil (lunes a viernes)
 */
export function esDiaHabil(fecha: Date): boolean {
  const dia = fecha.getDay();
  return dia !== 0 && dia !== 6; // 0 = domingo, 6 = sábado
}

/**
 * Agrega N días hábiles a una fecha.
 * Si la fecha de inicio cae en fin de semana, avanza al lunes.
 */
export function agregarDiasHabiles(fechaInicio: Date, dias: number): Date {
  const resultado = new Date(fechaInicio);

  while (!esDiaHabil(resultado)) {
    resultado.setDate(resultado.getDate() + 1);
  }

  let diasAgregados = 0;
  while (diasAgregados < dias) {
    resultado.setDate(resultado.getDate() + 1);
    if (esDiaHabil(resultado)) {
      diasAgregados++;
    }
  }

  return resultado;
}

/**
 * Convierte un número de día del proyecto (0-based) a una fecha real.
 * Si soloHabiles es true: avanza solo días laborables (lunes a viernes).
 * Si soloHabiles es false: avanza días continuos calendario (lunes a domingo).
 */
export function diaProyectoAFecha(
  fechaInicio: string,
  dia: number,
  soloHabiles: boolean = false
): string {
  const fecha = new Date(fechaInicio + 'T00:00:00');

  if (soloHabiles) {
    while (!esDiaHabil(fecha)) {
      fecha.setDate(fecha.getDate() + 1);
    }
    if (dia === 0) {
      return formatearFecha(fecha);
    }
    return formatearFecha(agregarDiasHabiles(fecha, dia));
  } else {
    // Días continuos (calendario completo de lunes a domingo)
    fecha.setDate(fecha.getDate() + Math.round(dia));
    return formatearFecha(fecha);
  }
}

/**
 * Formatea una fecha como YYYY-MM-DD
 */
export function formatearFecha(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
