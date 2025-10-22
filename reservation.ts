// 🔧 EDGE FUNCTION - RESERVAS CON NOTIFICACIONES POR EMAIL
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-20 05:12:20
// Current User's Login: IvaninaCapuchina
// COMPLETE: Con envío de emails a usuario y dueño del espacio
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://esm.sh/jose@4.14.4";
// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
const JWT_SECRET = Deno.env.get('JWT_SECRET') || "";
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || "";
// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
// 🔧 FUNCIÓN: DEBUG DETALLADO DE FECHAS
function debugDateProcessing(startDate, endDate, requestId) {
  logWithContext("DEBUG", requestId, "🔍 TIMEZONE DEBUG - Fechas recibidas del frontend", {
    startDate_raw: startDate,
    endDate_raw: endDate,
    startDate_type: typeof startDate,
    endDate_type: typeof endDate
  });
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  logWithContext("DEBUG", requestId, "🔍 TIMEZONE DEBUG - Objetos Date creados", {
    startDate_obj_iso: startDateObj.toISOString(),
    endDate_obj_iso: endDateObj.toISOString(),
    startDate_obj_utc: startDateObj.toUTCString(),
    endDate_obj_utc: endDateObj.toUTCString(),
    startDate_obj_local: startDateObj.toString(),
    endDate_obj_local: endDateObj.toString(),
    timezone_offset_minutes: startDateObj.getTimezoneOffset()
  });
  const hasTimezoneInfo = startDate.includes('T') && (startDate.includes('+') || startDate.includes('-') || startDate.endsWith('Z'));
  logWithContext("DEBUG", requestId, "🔍 TIMEZONE DEBUG - Análisis de formato", {
    startDate_has_timezone_info: hasTimezoneInfo,
    startDate_has_T: startDate.includes('T'),
    startDate_has_Z: startDate.endsWith('Z'),
    startDate_has_plus: startDate.includes('+'),
    startDate_has_minus_in_timezone: startDate.lastIndexOf('-') > 10,
    startDate_length: startDate.length,
    endDate_has_timezone_info: endDate.includes('T') && (endDate.includes('+') || endDate.includes('-') || endDate.endsWith('Z'))
  });
  return {
    startDateObj,
    endDateObj,
    hasTimezoneInfo
  };
}
// 🔧 FUNCIÓN: Procesar fechas manteniendo timezone original
function processDatesSafely(startDate, endDate, requestId) {
  const debugInfo = debugDateProcessing(startDate, endDate, requestId);
  let processedStartDate, processedEndDate;
  if (!debugInfo.hasTimezoneInfo) {
    logWithContext("WARN", requestId, "⚠️ TIMEZONE WARNING - Fechas sin timezone info, asumiendo locales", {
      startDate_original: startDate,
      endDate_original: endDate,
      note: "Esto puede causar conversiones no deseadas"
    });
    processedStartDate = startDate.includes('T') ? startDate : startDate + 'T00:00:00';
    processedEndDate = endDate.includes('T') ? endDate : endDate + 'T00:00:00';
    if (!processedStartDate.endsWith('Z') && !processedStartDate.includes('+') && !processedStartDate.includes('-', 10)) {
      processedStartDate += '-05:00';
    }
    if (!processedEndDate.endsWith('Z') && !processedEndDate.includes('+') && !processedEndDate.includes('-', 10)) {
      processedEndDate += '-05:00';
    }
  } else {
    processedStartDate = startDate;
    processedEndDate = endDate;
  }
  logWithContext("INFO", requestId, "✅ TIMEZONE PROCESSING - Fechas procesadas", {
    original_start: startDate,
    original_end: endDate,
    processed_start: processedStartDate,
    processed_end: processedEndDate,
    final_start_iso: new Date(processedStartDate).toISOString(),
    final_end_iso: new Date(processedEndDate).toISOString()
  });
  return {
    startDate: processedStartDate,
    endDate: processedEndDate,
    startDateForDB: processedStartDate,
    endDateForDB: processedEndDate
  };
}
// 🔧 FUNCIÓN: Verificar y decodificar JWT token
async function verifyAuthToken(authToken, requestId) {
  try {
    if (!authToken) {
      throw new Error("Token de autorización requerido");
    }
    const token = authToken.replace('Bearer ', '');
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    logWithContext("DEBUG", requestId, "🔑 Token verified successfully", {
      userId: payload.sub?.substring(0, 8) + '***',
      role: payload.role,
      aal: payload.aal,
      iss: payload.iss
    });
    return {
      userId: payload.sub,
      role: payload.role,
      email: payload.email,
      aal: payload.aal
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Token verification failed", {
      error: error.message
    });
    throw new Error("Token inválido o expirado");
  }
}
// 🔧 FUNCIÓN: Validar disponibilidad del espacio
async function validateSpaceAvailability(supabase, spaceId, startDate, endDate, requestId) {
  try {
    logWithContext("DEBUG", requestId, "🔍 Validating space availability WITH DATE DEBUG", {
      spaceId,
      startDate,
      endDate,
      startDate_type: typeof startDate,
      endDate_type: typeof endDate
    });
    const { data: space, error: spaceError } = await supabase.from('spaces').select('id_space, space_name, status, price_per_hour_cop, max_capacity, owner_id').eq('id_space', spaceId).single();
    if (spaceError || !space) {
      throw new Error("Espacio no encontrado");
    }
    if (space.status !== 'approved') {
      throw new Error("El espacio no está disponible para reservas");
    }
    const { data: conflictingReservations, error: reservationError } = await supabase.from('reservations').select('id_reservation, start_date, end_date, status').eq('space_id', spaceId).in('status', [
      'confirmed',
      'pending'
    ]).or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);
    if (reservationError) {
      logWithContext("ERROR", requestId, "Error checking reservation conflicts", reservationError);
      throw new Error("Error verificando disponibilidad");
    }
    if (conflictingReservations && conflictingReservations.length > 0) {
      logWithContext("WARN", requestId, "CONFLICT FOUND - Reservas en conflicto encontradas", {
        spaceId,
        newReservation: {
          startDate,
          endDate
        },
        conflicts: conflictingReservations.length
      });
      throw new Error("El espacio no está disponible en las fechas seleccionadas");
    }
    logWithContext("INFO", requestId, "✅ Space is available", {
      spaceId: space.id_space,
      spaceName: space.space_name,
      ownerId: space.owner_id?.substring(0, 8) + '***'
    });
    return space;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Space availability validation failed", {
      spaceId,
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Calcular costo total de la reserva
function calculateReservationCost(space, startDate, endDate, requestId) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end.getTime() - start.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    if (durationHours <= 0) {
      throw new Error("La fecha de fin debe ser posterior a la fecha de inicio");
    }
    const totalCost = durationHours * space.price_per_hour_cop;
    logWithContext("DEBUG", requestId, "💰 COST CALCULATION - Resultado", {
      spaceId: space.id_space,
      pricePerHour: space.price_per_hour_cop,
      durationHours: Math.round(durationHours * 100) / 100,
      totalCost: Math.round(totalCost)
    });
    return {
      durationHours: Math.round(durationHours * 100) / 100,
      pricePerHour: space.price_per_hour_cop,
      totalCost: Math.round(totalCost),
      formattedCost: `$${Math.round(totalCost).toLocaleString('es-CO')} COP`
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Cost calculation failed", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Crear reserva en la base de datos
async function createReservation(supabase, reservationData, requestId) {
  try {
    logWithContext("INFO", requestId, "📝 RESERVATION CREATION - Creando reserva", {
      spaceId: reservationData.space_id,
      userId: reservationData.user_id?.substring(0, 8) + '***',
      startDate_input: reservationData.start_date,
      endDate_input: reservationData.end_date
    });
    const { data: reservation, error: reservationError } = await supabase.from('reservations').insert({
      user_id: reservationData.user_id,
      space_id: reservationData.space_id,
      reservation_date: new Date().toISOString(),
      start_date: reservationData.start_date,
      end_date: reservationData.end_date,
      estimated_capacity: reservationData.estimated_capacity,
      status: 'pending'
    }).select().single();
    if (reservationError) {
      logWithContext("ERROR", requestId, "❌ Failed to create reservation", {
        error: reservationError.message,
        code: reservationError.code
      });
      throw new Error("Error creando la reserva");
    }
    logWithContext("INFO", requestId, "✅ RESERVATION CREATION - Reserva creada", {
      reservationId: reservation.id_reservation,
      status: reservation.status
    });
    return reservation;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Reservation creation failed", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Crear registro de pago pendiente
async function createPendingPayment(supabase, reservation, costInfo, requestId) {
  try {
    logWithContext("INFO", requestId, "💳 Creating pending payment record", {
      reservationId: reservation.id_reservation,
      amount: costInfo.totalCost
    });
    const { data: payment, error: paymentError } = await supabase.from('payments').insert({
      reservation_id: reservation.id_reservation,
      amount: costInfo.totalCost,
      payment_method: 'card',
      payment_date: new Date().toISOString(),
      payment_status: 'pending'
    }).select().single();
    if (paymentError) {
      logWithContext("ERROR", requestId, "❌ Failed to create payment record", {
        error: paymentError.message,
        code: paymentError.code
      });
      throw new Error("Error creando registro de pago");
    }
    logWithContext("INFO", requestId, "✅ Payment record created successfully", {
      paymentId: payment.id_payment,
      status: payment.payment_status
    });
    return payment;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Payment creation failed", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Obtener información del owner del espacio
async function getSpaceOwnerInfo(supabase, ownerId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "👤 Getting space owner information", {
      ownerId: ownerId?.substring(0, 8) + '***'
    });
    const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(ownerId);
    if (ownerError || !ownerData.user) {
      logWithContext("WARN", requestId, "⚠️ Owner not found in auth", {
        ownerId: ownerId?.substring(0, 8) + '***',
        error: ownerError?.message
      });
      return null;
    }
    const owner = ownerData.user;
    const firstName = owner.user_metadata?.first_name || '';
    const lastName = owner.user_metadata?.last_name || '';
    logWithContext("INFO", requestId, "✅ Owner information retrieved", {
      ownerId: owner.id?.substring(0, 8) + '***',
      email: owner.email?.substring(0, 10) + '***',
      hasName: !!(firstName && lastName)
    });
    return {
      id: owner.id,
      email: owner.email,
      name: `${firstName} ${lastName}`.trim() || owner.email,
      firstName,
      lastName
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting owner info", {
      error: error.message
    });
    return null;
  }
}
// 🔧 FUNCIÓN: Enviar email al dueño del espacio
async function sendOwnerNotification(ownerInfo, space, reservation, user, costInfo, requestId) {
  if (!RESEND_API_KEY) {
    logWithContext("WARN", requestId, "⚠️ RESEND_API_KEY not configured - skipping owner email");
    return {
      sent: false,
      reason: "Email not configured"
    };
  }
  if (!ownerInfo || !ownerInfo.email) {
    logWithContext("WARN", requestId, "⚠️ Owner email not available - skipping notification");
    return {
      sent: false,
      reason: "Owner email not available"
    };
  }
  try {
    logWithContext("INFO", requestId, "📧 Sending owner notification email", {
      to: ownerInfo.email?.substring(0, 10) + '***',
      spaceName: space.space_name,
      reservationId: reservation.id_reservation
    });
    const startDate = new Date(reservation.start_date);
    const endDate = new Date(reservation.end_date);
    const formatDate = (date)=>{
      return date.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nueva Reserva - ${space.space_name}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f97316;
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        .header {
          background-color: #ea580c;
          color: white;
          padding: 30px;
          text-align: center;
        }
        .content {
          padding: 40px;
          line-height: 1.6;
        }
        .reservation-box {
          background-color: #fed7aa;
          padding: 25px;
          border-radius: 10px;
          margin: 20px 0;
          border-left: 4px solid #f97316;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .amount-box {
          background-color: #f97316;
          color: white;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          margin: 20px 0;
          font-size: 1.3em;
          font-weight: bold;
        }
        .action-button {
          display: inline-block;
          background-color: #ea580c;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 25px;
          font-weight: bold;
          margin: 10px 5px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        .footer {
          background-color: #fb923c;
          padding: 25px;
          text-align: center;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Nueva Reserva Recibida</h1>
          <p>Tu espacio "${space.space_name}" ha sido reservado</p>
        </div>
        
        <div class="content">
          <h2>¡Hola ${ownerInfo.firstName || ownerInfo.name}! 👋</h2>
          <p>Has recibido una nueva solicitud de reserva para tu espacio.</p>

          <div class="reservation-box">
            <h3 style="color: #ea580c; margin-top: 0;">📋 Detalles de la Reserva</h3>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">🏢 Espacio:</span>
              <span>${space.space_name}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">👤 Cliente:</span>
              <span>${user.name}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">📧 Email:</span>
              <span>${user.email}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">📅 Fecha de Inicio:</span>
              <span>${formatDate(startDate)}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">📅 Fecha de Fin:</span>
              <span>${formatDate(endDate)}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">⏱️ Duración:</span>
              <span>${costInfo.durationHours} horas</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">👥 Capacidad Estimada:</span>
              <span>${reservation.estimated_capacity} personas</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">🆔 ID Reserva:</span>
              <span>#${reservation.id_reservation}</span>
            </div>
          </div>

          <div class="amount-box">
            💰 Valor Total: ${costInfo.formattedCost}
            <div style="font-size: 0.8em; margin-top: 5px; opacity: 0.9;">
              (${costInfo.durationHours} horas × $${costInfo.pricePerHour.toLocaleString('es-CO')} COP/hora)
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p><strong>⚠️ Esta reserva está pendiente de confirmación y pago.</strong></p>
            <p>El cliente recibirá instrucciones para completar el proceso de pago.</p>
          </div>

          <div style="text-align: center;">
            <a href="https://app.evently.blog/dashboard/reservations" class="action-button">
              📊 Ver en Dashboard
            </a>
          </div>
        </div>

        <div class="footer">
          <p>📧 ¿Preguntas? Escríbenos a <strong>soporte@evently.blog</strong></p>
          <p>© 2025 Evently - Conectando espacios y eventos</p>
        </div>
      </div>
    </body>
    </html>`;
    const emailData = {
      from: 'Evently Reservas <reservas@evently.blog>',
      to: [
        ownerInfo.email
      ],
      subject: `🎉 Nueva Reserva: ${space.space_name} - ${costInfo.formattedCost}`,
      html: htmlContent,
      text: `Nueva Reserva Recibida\n\nEspacio: ${space.space_name}\nCliente: ${user.name} (${user.email})\nFecha: ${formatDate(startDate)} - ${formatDate(endDate)}\nDuración: ${costInfo.durationHours} horas\nValor: ${costInfo.formattedCost}\nID: #${reservation.id_reservation}`
    };
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    const result = await resendResponse.json();
    if (!resendResponse.ok) {
      logWithContext("ERROR", requestId, "❌ Resend API error for owner", {
        status: resendResponse.status,
        error: result
      });
      return {
        sent: false,
        error: result.message || 'Error desconocido'
      };
    }
    logWithContext("INFO", requestId, "✅ Owner notification sent successfully", {
      emailId: result.id,
      to: ownerInfo.email?.substring(0, 10) + '***'
    });
    return {
      sent: true,
      emailId: result.id
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error sending owner notification", {
      error: error.message
    });
    return {
      sent: false,
      error: error.message
    };
  }
}
// 🔧 FUNCIÓN: Enviar email de confirmación al usuario
async function sendUserConfirmation(user, space, reservation, costInfo, payment, requestId) {
  if (!RESEND_API_KEY) {
    logWithContext("WARN", requestId, "⚠️ RESEND_API_KEY not configured - skipping user email");
    return {
      sent: false,
      reason: "Email not configured"
    };
  }
  try {
    logWithContext("INFO", requestId, "📧 Sending user confirmation email", {
      to: user.email?.substring(0, 10) + '***',
      reservationId: reservation.id_reservation
    });
    const startDate = new Date(reservation.start_date);
    const endDate = new Date(reservation.end_date);
    const formatDate = (date)=>{
      return date.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reserva Creada - ${space.space_name}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f97316;
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        .header {
          background-color: #ea580c;
          color: white;
          padding: 30px;
          text-align: center;
        }
        .content {
          padding: 40px;
          line-height: 1.6;
        }
        .reservation-box {
          background-color: #fed7aa;
          padding: 25px;
          border-radius: 10px;
          margin: 20px 0;
          border-left: 4px solid #f97316;
        }
        .payment-box {
          background-color: #fbbf24;
          color: #92400e;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          text-align: center;
          border: 2px solid #f59e0b;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .action-button {
          display: inline-block;
          background-color: #ea580c;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 25px;
          font-weight: bold;
          margin: 10px 5px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        .footer {
          background-color: #fb923c;
          padding: 25px;
          text-align: center;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Reserva Creada Exitosamente</h1>
          <p>Tu solicitud para "${space.space_name}" está siendo procesada</p>
        </div>
        
        <div class="content">
          <h2>¡Hola ${user.name}! 👋</h2>
          <p>Tu reserva ha sido creada exitosamente. Te notificaremos cuando el propietario confirme tu solicitud.</p>

          <div class="reservation-box">
            <h3 style="color: #ea580c; margin-top: 0;">📋 Detalles de tu Reserva</h3>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">🏢 Espacio:</span>
              <span>${space.space_name}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">📅 Inicio:</span>
              <span>${formatDate(startDate)}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">📅 Fin:</span>
              <span>${formatDate(endDate)}</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">⏱️ Duración:</span>
              <span>${costInfo.durationHours} horas</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">👥 Capacidad:</span>
              <span>${reservation.estimated_capacity} personas</span>
            </div>
            
            <div class="info-row">
              <span style="font-weight: bold; color: #ea580c;">🆔 ID Reserva:</span>
              <span>#${reservation.id_reservation}</span>
            </div>
          </div>

          <div class="payment-box">
            <h3 style="margin-top: 0;">⏳ Pago Pendiente</h3>
            <p style="font-size: 1.5em; font-weight: bold; margin: 10px 0;">${costInfo.formattedCost}</p>
            <p>El pago se procesará una vez que el propietario confirme tu reserva.</p>
            <p><strong>ID Pago:</strong> #${payment.id_payment}</p>
          </div>

          <div style="background-color: #e5f3ff; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h4 style="color: #1e40af; margin-top: 0;">📋 Próximos Pasos:</h4>
            <ol style="color: #374151;">
              <li>El propietario revisará tu solicitud</li>
              <li>Recibirás una notificación de confirmación</li>
              <li>Procederás con el pago</li>
              <li>¡Disfruta tu evento!</li>
            </ol>
          </div>

          <div style="text-align: center;">
            <a href="https://app.evently.blog/reservations/${reservation.id_reservation}" class="action-button">
              📋 Ver Reserva
            </a>
            <a href="https://app.evently.blog/dashboard" class="action-button">
              🏠 Ir al Dashboard
            </a>
          </div>
        </div>

        <div class="footer">
          <p>📧 ¿Preguntas? Escríbenos a <strong>soporte@evently.blog</strong></p>
          <p>© 2025 Evently - Tu plataforma de eventos favorita</p>
        </div>
      </div>
    </body>
    </html>`;
    const emailData = {
      from: 'Evently <reservas@evently.blog>',
      to: [
        user.email
      ],
      subject: `✅ Reserva Creada: ${space.space_name} - ${costInfo.formattedCost}`,
      html: htmlContent,
      text: `Reserva Creada Exitosamente\n\nEspacio: ${space.space_name}\nFecha: ${formatDate(startDate)} - ${formatDate(endDate)}\nDuración: ${costInfo.durationHours} horas\nCapacidad: ${reservation.estimated_capacity} personas\nValor: ${costInfo.formattedCost}\nID Reserva: #${reservation.id_reservation}\n\nVe los detalles en: https://app.evently.blog/reservations/${reservation.id_reservation}`
    };
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    const result = await resendResponse.json();
    if (!resendResponse.ok) {
      logWithContext("ERROR", requestId, "❌ User confirmation email failed", {
        status: resendResponse.status,
        error: result
      });
      return {
        sent: false,
        error: result.message || 'Error desconocido'
      };
    }
    logWithContext("INFO", requestId, "✅ User confirmation sent successfully", {
      emailId: result.id,
      to: user.email?.substring(0, 10) + '***'
    });
    return {
      sent: true,
      emailId: result.id
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error sending user confirmation", {
      error: error.message
    });
    return {
      sent: false,
      error: error.message
    };
  }
}
// 🔧 FUNCIÓN PRINCIPAL: Crear reserva completa CON NOTIFICACIONES
async function createFullReservation(supabase, authUser, reservationRequest, requestId) {
  const perfTracker = createPerformanceTracker(`${requestId}_create_reservation`);
  try {
    perfTracker.step("validate_input");
    const { spaceId, startDate, endDate, estimatedCapacity } = reservationRequest;
    if (!spaceId || !startDate || !endDate || !estimatedCapacity) {
      throw new Error("spaceId, startDate, endDate y estimatedCapacity son requeridos");
    }
    if (estimatedCapacity <= 0) {
      throw new Error("La capacidad estimada debe ser mayor a 0");
    }
    const processedDates = processDatesSafely(startDate, endDate, requestId);
    const start = new Date(processedDates.startDate);
    const end = new Date(processedDates.endDate);
    const now = new Date();
    if (start <= now) {
      throw new Error("La fecha de inicio debe ser futura");
    }
    if (end <= start) {
      throw new Error("La fecha de fin debe ser posterior a la fecha de inicio");
    }
    perfTracker.step("validate_availability");
    const space = await validateSpaceAvailability(supabase, spaceId, processedDates.startDate, processedDates.endDate, requestId);
    if (space.owner_id === authUser.userId) {
      throw new Error("No puedes reservar tu propio espacio");
    }
    if (estimatedCapacity > space.max_capacity) {
      throw new Error(`La capacidad estimada (${estimatedCapacity}) excede la capacidad máxima del espacio (${space.max_capacity})`);
    }
    perfTracker.step("calculate_cost");
    const costInfo = calculateReservationCost(space, processedDates.startDate, processedDates.endDate, requestId);
    perfTracker.step("create_reservation");
    const reservation = await createReservation(supabase, {
      user_id: authUser.userId,
      space_id: spaceId,
      start_date: processedDates.startDateForDB,
      end_date: processedDates.endDateForDB,
      estimated_capacity: estimatedCapacity
    }, requestId);
    perfTracker.step("create_payment");
    const payment = await createPendingPayment(supabase, reservation, costInfo, requestId);
    // 🔧 OBTENER INFO DEL OWNER Y USUARIO PARA ENVIAR EMAILS
    perfTracker.step("get_owner_and_user_info");
    const ownerInfo = await getSpaceOwnerInfo(supabase, space.owner_id, requestId);
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(authUser.userId);
    const user = userData?.user ? {
      id: userData.user.id,
      email: userData.user.email,
      name: `${userData.user.user_metadata?.first_name || ''} ${userData.user.user_metadata?.last_name || ''}`.trim() || userData.user.email
    } : {
      id: authUser.userId,
      email: authUser.email || 'unknown',
      name: authUser.email || 'Usuario'
    };
    // 🔧 ENVIAR NOTIFICACIONES POR EMAIL
    perfTracker.step("send_notifications");
    const notificationPromises = [];
    if (ownerInfo) {
      notificationPromises.push(sendOwnerNotification(ownerInfo, space, reservation, user, costInfo, requestId));
    }
    notificationPromises.push(sendUserConfirmation(user, space, reservation, costInfo, payment, requestId));
    const notificationResults = await Promise.allSettled(notificationPromises);
    perfTracker.total();
    logWithContext("INFO", requestId, "🎉 RESERVATION COMPLETED - Reserva creada y notificaciones enviadas", {
      reservationId: reservation.id_reservation,
      paymentId: payment.id_payment,
      spaceId: space.id_space,
      userId: authUser.userId?.substring(0, 8) + '***',
      totalCost: costInfo.totalCost,
      duration: costInfo.durationHours,
      ownerNotified: ownerInfo ? notificationResults[0]?.value?.sent : false,
      userNotified: notificationResults[ownerInfo ? 1 : 0]?.value?.sent,
      executionTime: perfTracker.total()
    });
    return {
      success: true,
      reservation: {
        id: reservation.id_reservation,
        spaceId: space.id_space,
        spaceName: space.space_name,
        startDate: reservation.start_date,
        endDate: reservation.end_date,
        estimatedCapacity: reservation.estimated_capacity,
        status: reservation.status,
        createdAt: reservation.reservation_date
      },
      payment: {
        id: payment.id_payment,
        amount: payment.amount,
        status: payment.payment_status,
        method: payment.payment_method,
        date: payment.payment_date
      },
      cost: costInfo,
      space: {
        id: space.id_space,
        name: space.space_name,
        maxCapacity: space.max_capacity
      },
      notifications: {
        ownerNotified: ownerInfo ? notificationResults[0]?.value?.sent || false : false,
        userNotified: notificationResults[ownerInfo ? 1 : 0]?.value?.sent || false,
        ownerEmail: ownerInfo?.email?.substring(0, 10) + '***' || null,
        userEmail: user.email?.substring(0, 10) + '***'
      }
    };
  } catch (error) {
    perfTracker.total();
    logWithContext("ERROR", requestId, "❌ Full reservation creation failed", {
      error: error.message,
      stack: error.stack?.substring(0, 300),
      executionTime: perfTracker.total()
    });
    throw error;
  }
}
// 🔧 MAIN SERVE FUNCTION
serve(async (req)=>{
  const requestId = `rsv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const mainPerf = createPerformanceTracker(requestId);
  if (req.method === "OPTIONS") {
    logWithContext("INFO", requestId, "🌐 CORS preflight request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    logWithContext("INFO", requestId, "⭐️ Starting reservations function WITH EMAIL NOTIFICATIONS - Current Time: 2025-10-20 05:12:20 - User: IvaninaCapuchina", {
      method: req.method,
      origin: req.headers.get('Origin')
    });
    mainPerf.step("initialization");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
      throw new Error("Configuración del servidor incompleta");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    mainPerf.step("auth_verification");
    const authToken = req.headers.get('Authorization');
    const authUser = await verifyAuthToken(authToken, requestId);
    mainPerf.step("request_parsing");
    if (req.method !== "POST") {
      throw new Error("Solo se permiten peticiones POST");
    }
    let requestBody;
    try {
      const rawBody = await req.text();
      requestBody = JSON.parse(rawBody);
    } catch (parseError) {
      logWithContext("ERROR", requestId, "Failed to parse request body", parseError);
      throw new Error("Cuerpo de solicitud JSON inválido");
    }
    const { action } = requestBody;
    mainPerf.step("action_processing");
    switch(action){
      case "create":
        {
          logWithContext("INFO", requestId, "📝 Processing reservation creation WITH EMAIL NOTIFICATIONS");
          const { spaceId, startDate, endDate, estimatedCapacity } = requestBody;
          const result = await createFullReservation(supabase, authUser, {
            spaceId,
            startDate,
            endDate,
            estimatedCapacity
          }, requestId);
          mainPerf.total();
          return new Response(JSON.stringify({
            success: true,
            message: "🎉 Reserva creada exitosamente. Se han enviado notificaciones por email.",
            data: result,
            metadata: {
              requestId,
              timestamp: new Date().toISOString(),
              executionTime: mainPerf.total(),
              emailsEnabled: !!RESEND_API_KEY
            }
          }), {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
      default:
        throw new Error(`Acción no válida: ${action}`);
    }
  } catch (error) {
    mainPerf.total();
    logWithContext("ERROR", requestId, "❌ Final error handler", {
      message: error.message,
      stack: error.stack?.substring(0, 500),
      executionTime: mainPerf.total()
    });
    let statusCode = 400;
    if (error.message.includes('Token inválido') || error.message.includes('requerido')) {
      statusCode = 401;
    } else if (error.message.includes('no encontrado')) {
      statusCode = 404;
    } else if (error.message.includes('Configuración')) {
      statusCode = 500;
    }
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Error procesando solicitud",
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
