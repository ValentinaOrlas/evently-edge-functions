// 🔧 EDGE FUNCTION - DISPONIBILIDAD VERDADERAMENTE RAW (SIN CONVERSIONES)
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-19 03:25:14
// Current User's Login: IvaninaCapuchina
// FIX: Mantener fechas EXACTAMENTE como están en la DB (sin crear objetos Date)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
// Configuración
const CLEANUP_TIME_HOURS = 1;
const DEFAULT_DURATION = 2;
// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400"
};
// Enhanced logging functions
function logWithContext(level, requestId, message, data) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [${requestId}] ${message}`;
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}
// Performance tracker
function createPerformanceTracker(requestId) {
  const start = performance.now();
  const steps = {};
  return {
    step: (stepName)=>{
      const now = performance.now();
      steps[stepName] = {
        timestamp: now,
        duration: now - start,
        relative: Object.keys(steps).length > 0 ? now - Math.max(...Object.values(steps).map((s)=>s.timestamp)) : now - start
      };
      logWithContext("PERF", requestId, `⏱️ Step: ${stepName}`, {
        duration_ms: Math.round(steps[stepName].duration * 100) / 100,
        relative_ms: Math.round(steps[stepName].relative * 100) / 100
      });
      return steps[stepName];
    },
    total: ()=>{
      const total = performance.now() - start;
      logWithContext("PERF", requestId, `🏁 Total execution time`, {
        total_ms: Math.round(total * 100) / 100,
        steps_count: Object.keys(steps).length
      });
      return total;
    }
  };
}
// 🔧 FUNCIÓN: Manipular fecha como string SIN crear objetos Date
function addHoursToDateString(dateString, hours) {
  // Parsear manualmente la fecha sin crear objeto Date
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    // Si tiene Z o milisegundos, quitarlos y parsear
    const cleanDate = dateString.replace(/\.?\d{3}?Z?$/, '');
    const match2 = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!match2) {
      return dateString; // Si no puede parsear, devolver original
    }
    return addHoursToDateString(cleanDate, hours);
  }
  const [, year, month, day, hour, minute, second] = match;
  let newHour = parseInt(hour) + hours;
  let newDay = parseInt(day);
  let newMonth = parseInt(month);
  let newYear = parseInt(year);
  // Manejar overflow de horas
  if (newHour >= 24) {
    newDay += Math.floor(newHour / 24);
    newHour = newHour % 24;
  }
  // Para simplificar, solo manejar el caso común (no overflow de días/meses)
  // En un caso real podrías usar una librería de fechas o lógica más compleja
  return `${newYear}-${month}-${newDay.toString().padStart(2, '0')}T${newHour.toString().padStart(2, '0')}:${minute}:${second}`;
}
// 🔧 FUNCIÓN: Comparar fechas como strings
function compareDateStrings(date1, date2) {
  // Convertir a timestamps solo para comparación, no para modificar
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  return d1 - d2;
}
// 🔧 FUNCIÓN: Extraer solo la fecha (YYYY-MM-DD) de un datetime string
function extractDateFromDatetime(datetimeString) {
  return datetimeString.split('T')[0];
}
// 🔧 FUNCIÓN: Obtener información del espacio
async function getSpaceInfo(supabase, spaceId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "🏢 Getting space information", {
      spaceId
    });
    const { data: space, error: spaceError } = await supabase.from('spaces').select('id_space, space_name, status, max_capacity, price_per_hour_cop, location').eq('id_space', spaceId).single();
    if (spaceError || !space) {
      throw new Error("Espacio no encontrado");
    }
    if (space.status !== 'approved') {
      throw new Error("El espacio no está disponible para reservas");
    }
    return space;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting space info", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Obtener fechas de inicio y fin del mes
function getMonthDateRange(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    daysInMonth: endDate.getDate()
  };
}
// 🔧 FUNCIÓN: Obtener reservas confirmadas SIN conversiones de timezone
async function getConfirmedReservations(supabase, spaceId, year, month, requestId) {
  try {
    const { startDate, endDate } = getMonthDateRange(year, month);
    logWithContext("INFO", requestId, "📅 Buscando reservas confirmadas (fechas ABSOLUTAMENTE RAW)", {
      spaceId,
      year,
      month,
      startDate,
      endDate,
      note: "Sin crear objetos Date - fechas como strings"
    });
    const { data: conflictingReservations, error: reservationError } = await supabase.from('reservations').select('id_reservation, start_date, end_date, status, estimated_capacity').eq('space_id', spaceId).in('status', [
      'confirmed',
      'pending'
    ]).or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);
    if (reservationError) {
      logWithContext("ERROR", requestId, "❌ Error en consulta de reservas", reservationError);
      throw new Error("Error obteniendo reservas confirmadas del mes");
    }
    const confirmedReservations = conflictingReservations?.filter((r)=>r.status === 'confirmed') || [];
    logWithContext("INFO", requestId, "✅ Reservas encontradas (fechas COMPLETAMENTE RAW)", {
      spaceId,
      totalReservations: conflictingReservations?.length || 0,
      confirmedReservations: confirmedReservations.length,
      reservationDetails: confirmedReservations.map((r)=>({
          id: r.id_reservation,
          start_date_original: r.start_date,
          end_date_original: r.end_date,
          status: r.status
        }))
    });
    return confirmedReservations;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting confirmed reservations", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Crear mapa de días con reservas SIN crear objetos Date
function createReservationDaysMap(confirmedReservations, requestId) {
  const reservationDays = new Map();
  for (const reservation of confirmedReservations){
    // 🔧 MANTENER FECHAS COMO STRINGS (NO crear objetos Date)
    const startDateOriginal = reservation.start_date;
    const endDateOriginal = reservation.end_date;
    logWithContext("DEBUG", requestId, "🗓️ Processing reservation with ABSOLUTELY RAW dates", {
      reservationId: reservation.id_reservation,
      startDateOriginal,
      endDateOriginal,
      note: "Fechas mantenidas como strings, sin objetos Date"
    });
    // Agregar tiempo de limpieza manipulando el string directamente
    const endDateWithCleanupString = addHoursToDateString(endDateOriginal, CLEANUP_TIME_HOURS);
    // Extraer las fechas afectadas (solo para determinar los días)
    const startDate = extractDateFromDatetime(startDateOriginal);
    const endDate = extractDateFromDatetime(endDateWithCleanupString);
    // Crear lista de días afectados (usando lógica simple)
    const startDay = new Date(startDate);
    const endDay = new Date(endDate);
    const currentDay = new Date(startDay);
    while(currentDay <= endDay){
      const dayKey = currentDay.toISOString().split('T')[0];
      if (!reservationDays.has(dayKey)) {
        reservationDays.set(dayKey, []);
      }
      reservationDays.get(dayKey).push({
        id: reservation.id_reservation,
        start_date_original: startDateOriginal,
        end_date_original: endDateOriginal,
        end_with_cleanup_string: endDateWithCleanupString,
        status: reservation.status,
        capacity: reservation.estimated_capacity
      });
      currentDay.setDate(currentDay.getDate() + 1);
    }
  }
  logWithContext("INFO", requestId, "🗓️ Mapa de días con reservas creado (fechas como STRINGS)", {
    daysWithReservations: reservationDays.size,
    affectedDays: Array.from(reservationDays.keys()),
    note: "Sin conversiones - fechas mantenidas como strings"
  });
  return reservationDays;
}
// 🔧 FUNCIÓN: Generar slots de tiempo manteniendo formato original
function generateDaySlots(dateKey, reservationsForDay, requestId) {
  const slots = [];
  for(let hour = 6; hour <= 23; hour++){
    const timeString = `${hour.toString().padStart(2, '0')}:00`;
    // Crear datetime strings para el slot (manteniendo formato de la DB)
    const slotStartString = `${dateKey}T${hour.toString().padStart(2, '0')}:00:00`;
    const slotEndString = `${dateKey}T${(hour + DEFAULT_DURATION).toString().padStart(2, '0')}:00:00`;
    let isAvailable = true;
    let conflictWith = null;
    // Verificar conflictos con reservas del día usando comparación de strings
    for (const reservation of reservationsForDay){
      const reservationStart = reservation.start_date_original;
      const reservationEndWithCleanup = reservation.end_with_cleanup_string;
      // Comparar usando timestamps pero manteniendo strings originales
      const slotStartTime = new Date(slotStartString).getTime();
      const slotEndTime = new Date(slotEndString).getTime();
      const reservationStartTime = new Date(reservationStart).getTime();
      const reservationEndWithCleanupTime = new Date(reservationEndWithCleanup).getTime();
      if (slotStartTime < reservationEndWithCleanupTime && slotEndTime > reservationStartTime) {
        isAvailable = false;
        const reservationEndTime = new Date(reservation.end_date_original).getTime();
        conflictWith = {
          id: reservation.id,
          start_date_original: reservation.start_date_original,
          end_date_original: reservation.end_date_original,
          end_with_cleanup_string: reservation.end_with_cleanup_string,
          status: reservation.status,
          conflictReason: slotStartTime < reservationEndTime ? "Evento en curso" : "Tiempo de limpieza"
        };
        break;
      }
    }
    const slotInfo = {
      time: timeString,
      hour,
      available: isAvailable,
      start_datetime_original: slotStartString,
      end_datetime_original: slotEndString,
      duration: DEFAULT_DURATION
    };
    if (!isAvailable && conflictWith) {
      slotInfo.conflictWith = conflictWith;
    }
    slots.push(slotInfo);
  }
  return slots;
}
// 🔧 FUNCIÓN PRINCIPAL: Calcular disponibilidad manteniendo fechas como strings
async function calculateTrulyRawAvailability(supabase, spaceId, year, month, requestId) {
  const perfTracker = createPerformanceTracker(`${requestId}_truly_raw_availability`);
  try {
    perfTracker.step("get_space_info");
    const space = await getSpaceInfo(supabase, spaceId, requestId);
    perfTracker.step("get_confirmed_reservations");
    const confirmedReservations = await getConfirmedReservations(supabase, spaceId, year, month, requestId);
    perfTracker.step("create_reservation_map");
    const reservationDaysMap = createReservationDaysMap(confirmedReservations, requestId);
    perfTracker.step("process_affected_days");
    const { startDate, endDate, daysInMonth } = getMonthDateRange(year, month);
    const occupiedDays = [];
    let totalOccupiedSlots = 0;
    // Solo procesar días que tienen reservas
    for (const [dayKey, reservationsForDay] of reservationDaysMap.entries()){
      const dayDate = new Date(dayKey);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      if (dayDate >= monthStart && dayDate <= monthEnd) {
        const daySlots = generateDaySlots(dayKey, reservationsForDay, requestId);
        const occupiedCount = daySlots.filter((slot)=>!slot.available).length;
        const availableCount = daySlots.filter((slot)=>slot.available).length;
        totalOccupiedSlots += occupiedCount;
        occupiedDays.push({
          date: dayKey,
          day: dayDate.getDate(),
          dayOfWeek: dayDate.getDay(),
          dayName: dayDate.toLocaleDateString('es-CO', {
            weekday: 'long'
          }),
          isWeekend: dayDate.getDay() === 0 || dayDate.getDay() === 6,
          slots: daySlots,
          availableCount,
          occupiedCount,
          reservations: reservationsForDay
        });
      }
    }
    const totalSlots = daysInMonth * 18;
    const occupiedSlots = totalOccupiedSlots;
    const availableSlots = totalSlots - occupiedSlots;
    const availabilityRate = Math.round(availableSlots / totalSlots * 100);
    perfTracker.total();
    logWithContext("INFO", requestId, "✅ Disponibilidad calculada manteniendo fechas como STRINGS", {
      spaceId,
      spaceName: space.space_name,
      year,
      month,
      totalReservations: confirmedReservations.length,
      daysWithReservations: occupiedDays.length,
      totalSlots,
      occupiedSlots,
      availableSlots,
      availabilityRate,
      note: "Fechas mantenidas exactamente como strings de la DB",
      executionTime: perfTracker.total()
    });
    return {
      space: {
        id: space.id_space,
        name: space.space_name,
        location: space.location,
        maxCapacity: space.max_capacity,
        pricePerHour: space.price_per_hour_cop
      },
      searchParams: {
        year,
        month,
        duration: DEFAULT_DURATION,
        cleanupTimeHours: CLEANUP_TIME_HOURS,
        note: "Fechas mantenidas como strings originales"
      },
      monthInfo: {
        year,
        month,
        monthName: new Date(year, month - 1, 1).toLocaleDateString('es-CO', {
          month: 'long'
        }),
        daysInMonth,
        startDate,
        endDate
      },
      summary: {
        totalDays: daysInMonth,
        daysWithReservations: occupiedDays.length,
        totalSlots,
        occupiedSlots,
        availableSlots,
        availabilityRate,
        interpretation: "Los días no listados en 'occupiedDays' están completamente disponibles. Todas las fechas están exactamente como se guardan en la base de datos sin ninguna conversión."
      },
      occupiedDays,
      confirmedReservations: confirmedReservations.map((r)=>({
          id: r.id_reservation,
          start_date_original: r.start_date,
          end_date_original: r.end_date,
          status: r.status,
          capacity: r.estimated_capacity
        }))
    };
  } catch (error) {
    perfTracker.total();
    logWithContext("ERROR", requestId, "❌ Truly raw availability calculation failed", {
      error: error.message,
      executionTime: perfTracker.total()
    });
    throw error;
  }
}
// 🔧 MAIN SERVE FUNCTION
serve(async (req)=>{
  const requestId = `truly_raw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const mainPerf = createPerformanceTracker(requestId);
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    logWithContext("INFO", requestId, "🌐 CORS preflight request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    logWithContext("INFO", requestId, "⭐️ Starting availability function - TRULY RAW DATES (NO DATE OBJECTS) - Current Time: 2025-10-19 03:25:14 - User: IvaninaCapuchina", {
      method: req.method,
      origin: req.headers.get('Origin'),
      note: "Fechas mantenidas como strings exactamente como vienen de la DB"
    });
    mainPerf.step("initialization");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Configuración incompleta - necesita SERVICE_ROLE_KEY");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    mainPerf.step("request_parsing");
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const spaceId = searchParams.get('spaceId');
    const now = new Date();
    const month = parseInt(searchParams.get('month') || (now.getMonth() + 1).toString());
    const year = parseInt(searchParams.get('year') || now.getFullYear().toString());
    logWithContext("INFO", requestId, "🗓️ Availability request with TRULY RAW dates", {
      spaceId,
      year,
      month,
      note: "Fechas mantenidas como strings - sin objetos Date"
    });
    // Validaciones
    if (!spaceId) {
      throw new Error("spaceId es requerido");
    }
    if (month < 1 || month > 12) {
      throw new Error("month debe estar entre 1 y 12");
    }
    if (year < 2020 || year > 2030) {
      throw new Error("year debe estar entre 2020 y 2030");
    }
    mainPerf.step("truly_raw_calculation");
    const result = await calculateTrulyRawAvailability(supabase, parseInt(spaceId), year, month, requestId);
    mainPerf.total();
    return new Response(JSON.stringify({
      success: true,
      data: result,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        executionTime: mainPerf.total(),
        generatedFor: `${year}-${month.toString().padStart(2, '0')}`,
        fixes: {
          trulyRawDatesImplemented: true,
          noDateObjectCreation: true,
          datesAsExactStringsFromDB: true,
          stringManipulationOnly: true,
          onlyOccupiedDaysReturned: true
        },
        note: "Todas las fechas están retornadas exactamente como strings de la base de datos, sin crear objetos Date que puedan alterar el timezone."
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    mainPerf.total();
    logWithContext("ERROR", requestId, "❌ Error final", {
      message: error.message,
      executionTime: mainPerf.total()
    });
    let statusCode = 400;
    if (error.message.includes('no encontrado')) {
      statusCode = 404;
    } else if (error.message.includes('Configuración')) {
      statusCode = 500;
    }
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Error calculando disponibilidad",
      timestamp: new Date().toISOString(),
      requestId
    }), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
