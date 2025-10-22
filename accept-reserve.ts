// 🔧 EDGE FUNCTION - ACEPTAR RESERVAS (OWNER ROLE)
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-19 00:18:16
// Current User's Login: IvaninaCapuchina
// FEATURES: Owners pueden aceptar reservas, notificar usuarios, mantener pago pendiente
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
// 🔧 FUNCIÓN: Verificar que el usuario es owner de la reserva
async function validateOwnerPermissions(supabase, authUser, reservationId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "🔍 Validating owner permissions", {
      userId: authUser.userId?.substring(0, 8) + '***',
      role: authUser.role,
      reservationId
    });
    // Verificar que el usuario tiene rol de owner
    if (![
      'owner',
      'superadmin'
    ].includes(authUser.role)) {
      throw new Error("Solo los propietarios pueden gestionar reservas");
    }
    // Obtener la reserva con información del espacio
    const { data: reservation, error: reservationError } = await supabase.from('reservations').select(`
        id_reservation,
        user_id,
        space_id,
        reservation_date,
        start_date,
        end_date,
        estimated_capacity,
        status,
        spaces (
          id_space,
          space_name,
          owner_id,
          price_per_hour_cop,
          location,
          max_capacity
        )
      `).eq('id_reservation', reservationId).single();
    if (reservationError || !reservation) {
      logWithContext("ERROR", requestId, "Reservation not found", {
        reservationId,
        error: reservationError?.message
      });
      throw new Error("Reserva no encontrada");
    }
    // Verificar que el usuario es owner del espacio (excepto superadmin)
    if (authUser.role !== 'superadmin' && reservation.spaces.owner_id !== authUser.userId) {
      logWithContext("ERROR", requestId, "Access denied - not space owner", {
        userId: authUser.userId?.substring(0, 8) + '***',
        spaceOwnerId: reservation.spaces.owner_id?.substring(0, 8) + '***',
        spaceId: reservation.spaces.id_space
      });
      throw new Error("No tienes permisos para gestionar esta reserva");
    }
    // Verificar que la reserva está en estado 'pending'
    if (reservation.status !== 'pending') {
      throw new Error(`La reserva ya está en estado '${reservation.status}' y no puede ser modificada`);
    }
    logWithContext("INFO", requestId, "✅ Owner permissions validated", {
      reservationId: reservation.id_reservation,
      spaceId: reservation.spaces.id_space,
      spaceName: reservation.spaces.space_name,
      ownerId: authUser.userId?.substring(0, 8) + '***',
      currentStatus: reservation.status
    });
    return reservation;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Owner validation failed", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Aceptar reserva (cambiar status a confirmed)
async function acceptReservation(supabase, reservationId, requestId) {
  try {
    logWithContext("INFO", requestId, "✅ Accepting reservation", {
      reservationId
    });
    const { data: updatedReservation, error: updateError } = await supabase.from('reservations').update({
      status: 'confirmed'
    }).eq('id_reservation', reservationId).select(`
        id_reservation,
        user_id,
        space_id,
        reservation_date,
        start_date,
        end_date,
        estimated_capacity,
        status,
        spaces (
          id_space,
          space_name,
          owner_id,
          price_per_hour_cop,
          location,
          max_capacity
        )
      `).single();
    if (updateError) {
      logWithContext("ERROR", requestId, "❌ Failed to update reservation status", {
        error: updateError.message,
        code: updateError.code
      });
      throw new Error("Error actualizando el estado de la reserva");
    }
    logWithContext("INFO", requestId, "✅ Reservation status updated successfully", {
      reservationId: updatedReservation.id_reservation,
      newStatus: updatedReservation.status,
      spaceId: updatedReservation.spaces.id_space
    });
    return updatedReservation;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Reservation acceptance failed", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Obtener información del usuario (cliente)
async function getUserInfo(supabase, userId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "👤 Getting user information", {
      userId: userId?.substring(0, 8) + '***'
    });
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData.user) {
      logWithContext("WARN", requestId, "⚠️ User not found in auth", {
        userId: userId?.substring(0, 8) + '***',
        error: userError?.message
      });
      return {
        id: userId,
        email: 'unknown',
        name: 'Usuario'
      };
    }
    const user = userData.user;
    const firstName = user.user_metadata?.first_name || '';
    const lastName = user.user_metadata?.last_name || '';
    logWithContext("INFO", requestId, "✅ User information retrieved", {
      userId: user.id?.substring(0, 8) + '***',
      email: user.email?.substring(0, 10) + '***',
      hasName: !!(firstName && lastName)
    });
    return {
      id: user.id,
      email: user.email,
      name: `${firstName} ${lastName}`.trim() || user.email,
      firstName,
      lastName
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting user info", {
      error: error.message
    });
    return {
      id: userId,
      email: 'unknown',
      name: 'Usuario'
    };
  }
}
// 🔧 FUNCIÓN: Obtener información del pago
async function getPaymentInfo(supabase, reservationId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "💳 Getting payment information", {
      reservationId
    });
    const { data: payment, error: paymentError } = await supabase.from('payments').select('*').eq('reservation_id', reservationId).single();
    if (paymentError || !payment) {
      logWithContext("WARN", requestId, "⚠️ Payment not found", {
        reservationId,
        error: paymentError?.message
      });
      return null;
    }
    logWithContext("INFO", requestId, "✅ Payment information retrieved", {
      paymentId: payment.id_payment,
      amount: payment.amount,
      status: payment.payment_status,
      method: payment.payment_method
    });
    return payment;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting payment info", {
      error: error.message
    });
    return null;
  }
}
// 🔧 FUNCIÓN: Enviar notificación de aceptación al usuario
async function sendAcceptanceNotificationToUser(user, reservation, payment, ownerInfo, requestId) {
  if (!RESEND_API_KEY) {
    logWithContext("WARN", requestId, "⚠️ RESEND_API_KEY not configured - skipping email");
    return {
      sent: false,
      reason: "Email not configured"
    };
  }
  if (!user || !user.email) {
    logWithContext("WARN", requestId, "⚠️ User email not available - skipping notification");
    return {
      sent: false,
      reason: "User email not available"
    };
  }
  try {
    logWithContext("INFO", requestId, "📧 Sending acceptance notification to user", {
      to: user.email?.substring(0, 10) + '***',
      reservationId: reservation.id_reservation,
      spaceName: reservation.spaces.space_name
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
    const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    const formattedAmount = payment ? `$${payment.amount.toLocaleString('es-CO')} COP` : 'Monto no disponible';
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>¡Reserva Aceptada! - ${reservation.spaces.space_name}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #10b981;
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
          background-color: #059669;
          color: white;
          padding: 30px;
          text-align: center;
        }
        .content {
          padding: 40px;
          line-height: 1.6;
        }
        .success-box {
          background-color: #d1fae5;
          padding: 25px;
          border-radius: 10px;
          margin: 20px 0;
          border-left: 4px solid #10b981;
        }
        .reservation-details {
          background-color: #f3f4f6;
          padding: 25px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 10px 0;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .info-label {
          font-weight: bold;
          color: #059669;
        }
        .info-value {
          color: #374151;
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
        .action-button {
          display: inline-block;
          background-color: #059669;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 25px;
          font-weight: bold;
          margin: 10px 5px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        .status-confirmed {
          background-color: #10b981;
          color: white;
          padding: 5px 15px;
          border-radius: 15px;
          font-size: 0.9em;
          font-weight: bold;
        }
        .footer {
          background-color: #34d399;
          padding: 25px;
          text-align: center;
          color: white;
        }
        .highlight-box {
          background-color: #ecfdf5;
          border: 2px solid #10b981;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 ¡Reserva Aceptada!</h1>
          <p>Tu reserva para "${reservation.spaces.space_name}" ha sido confirmada</p>
        </div>
        
        <div class="content">
          <div class="success-box">
            <h2 style="color: #059669; margin-top: 0;">✅ ¡Excelentes noticias, ${user.firstName || user.name}!</h2>
            <p style="font-size: 1.1em; margin-bottom: 0;">El propietario del espacio ha aceptado tu solicitud de reserva. ¡Ya puedes proceder con el pago para asegurar tu evento!</p>
          </div>

          <div class="reservation-details">
            <h3 style="color: #059669; margin-top: 0;">📋 Detalles de tu Reserva Confirmada</h3>
            
            <div class="info-row">
              <span class="info-label">🏢 Espacio:</span>
              <span class="info-value">${reservation.spaces.space_name}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">📍 Ubicación:</span>
              <span class="info-value">${reservation.spaces.location || 'Por confirmar'}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">📅 Fecha de Inicio:</span>
              <span class="info-value">${formatDate(startDate)}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">📅 Fecha de Fin:</span>
              <span class="info-value">${formatDate(endDate)}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">⏱️ Duración:</span>
              <span class="info-value">${Math.round(durationHours * 100) / 100} horas</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">👥 Capacidad:</span>
              <span class="info-value">${reservation.estimated_capacity} personas</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">📋 Estado:</span>
              <span class="info-value"><span class="status-confirmed">✅ CONFIRMADA</span></span>
            </div>
            
            <div class="info-row">
              <span class="info-label">🆔 ID Reserva:</span>
              <span class="info-value">#${reservation.id_reservation}</span>
            </div>
          </div>

          <div class="payment-box">
            <h3 style="margin-top: 0;">💳 Proceder con el Pago</h3>
            <p style="font-size: 1.5em; font-weight: bold; margin: 10px 0;">${formattedAmount}</p>
            <p><strong>¡Importante!</strong> Debes completar el pago para garantizar tu reserva.</p>
            ${payment ? `<p><strong>ID Pago:</strong> #${payment.id_payment}</p>` : ''}
            <p><strong>Estado del Pago:</strong> Pendiente</p>
          </div>

          <div class="highlight-box">
            <h4 style="color: #059669; margin-top: 0;">🚀 Próximos Pasos</h4>
            <ol style="text-align: left; color: #374151;">
              <li><strong>Completa el pago</strong> usando el botón de abajo</li>
              <li><strong>Recibe la confirmación</strong> de pago por email</li>
              <li><strong>Prepara tu evento</strong> - ¡Ya está todo listo!</li>
              <li><strong>Disfruta</strong> tu experiencia en ${reservation.spaces.space_name}</li>
            </ol>
          </div>

          ${ownerInfo ? `
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h4 style="color: #6b7280; margin-top: 0;">👤 Información del Propietario</h4>
            <p style="color: #374151; margin-bottom: 0;">
              <strong>Contacto:</strong> ${ownerInfo.name}<br>
              <strong>Email:</strong> ${ownerInfo.email}
            </p>
          </div>
          ` : ''}

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://app.evently.blog/reservations/${reservation.id_reservation}/payment" class="action-button">
              💳 Completar Pago
            </a>
            <a href="https://app.evently.blog/reservations/${reservation.id_reservation}" class="action-button">
              📋 Ver Detalles
            </a>
          </div>
        </div>

        <div class="footer">
          <p>📧 ¿Tienes preguntas? Escríbenos a <strong>soporte@evently.blog</strong></p>
          <p>© 2025 Evently - Haciendo realidad tus eventos</p>
        </div>
      </div>
    </body>
    </html>`;
    const emailData = {
      from: 'Evently Reservas <reservas@evently.blog>',
      to: [
        user.email
      ],
      subject: `🎉 ¡Reserva Aceptada! ${reservation.spaces.space_name} - ${formattedAmount}`,
      html: htmlContent,
      text: `¡Reserva Aceptada!\n\n¡Excelentes noticias! Tu reserva para "${reservation.spaces.space_name}" ha sido confirmada por el propietario.\n\nDetalles:\n- Espacio: ${reservation.spaces.space_name}\n- Fecha: ${formatDate(startDate)} - ${formatDate(endDate)}\n- Duración: ${Math.round(durationHours * 100) / 100} horas\n- Capacidad: ${reservation.estimated_capacity} personas\n- Valor: ${formattedAmount}\n- Estado: CONFIRMADA\n- ID: #${reservation.id_reservation}\n\nPróximo paso: Completa el pago para asegurar tu reserva.\n\nCompleta el pago en: https://app.evently.blog/reservations/${reservation.id_reservation}/payment\n\n¿Preguntas? Escríbenos a soporte@evently.blog`
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
      logWithContext("ERROR", requestId, "❌ Resend API error", {
        status: resendResponse.status,
        error: result
      });
      return {
        sent: false,
        error: result.message || 'Error desconocido'
      };
    }
    logWithContext("INFO", requestId, "✅ Acceptance notification sent successfully", {
      emailId: result.id,
      to: user.email?.substring(0, 10) + '***'
    });
    return {
      sent: true,
      emailId: result.id
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error sending acceptance notification", {
      error: error.message
    });
    return {
      sent: false,
      error: error.message
    };
  }
}
// 🔧 FUNCIÓN PRINCIPAL: Procesar aceptación de reserva
async function processReservationAcceptance(supabase, authUser, reservationId, requestId) {
  const perfTracker = createPerformanceTracker(`${requestId}_accept_reservation`);
  try {
    // Validar permisos del owner
    perfTracker.step("validate_permissions");
    const reservation = await validateOwnerPermissions(supabase, authUser, reservationId, requestId);
    // Aceptar la reserva (cambiar status a confirmed)
    perfTracker.step("accept_reservation");
    const updatedReservation = await acceptReservation(supabase, reservationId, requestId);
    // Obtener información del usuario
    perfTracker.step("get_user_info");
    const userInfo = await getUserInfo(supabase, updatedReservation.user_id, requestId);
    // Obtener información del pago
    perfTracker.step("get_payment_info");
    const paymentInfo = await getPaymentInfo(supabase, reservationId, requestId);
    // Obtener información del owner
    perfTracker.step("get_owner_info");
    const ownerInfo = await getUserInfo(supabase, authUser.userId, requestId);
    // Enviar notificación al usuario
    perfTracker.step("send_notification");
    const notificationResult = await sendAcceptanceNotificationToUser(userInfo, updatedReservation, paymentInfo, ownerInfo, requestId);
    perfTracker.total();
    logWithContext("INFO", requestId, "🎉 Reservation acceptance completed successfully", {
      reservationId: updatedReservation.id_reservation,
      spaceId: updatedReservation.spaces.id_space,
      spaceName: updatedReservation.spaces.space_name,
      userId: userInfo.id?.substring(0, 8) + '***',
      userEmail: userInfo.email?.substring(0, 10) + '***',
      ownerId: authUser.userId?.substring(0, 8) + '***',
      newStatus: updatedReservation.status,
      paymentStatus: paymentInfo?.payment_status || 'no_payment',
      notificationSent: notificationResult.sent,
      executionTime: perfTracker.total()
    });
    return {
      success: true,
      reservation: {
        id: updatedReservation.id_reservation,
        spaceId: updatedReservation.spaces.id_space,
        spaceName: updatedReservation.spaces.space_name,
        status: updatedReservation.status,
        startDate: updatedReservation.start_date,
        endDate: updatedReservation.end_date,
        estimatedCapacity: updatedReservation.estimated_capacity,
        userId: updatedReservation.user_id
      },
      space: {
        id: updatedReservation.spaces.id_space,
        name: updatedReservation.spaces.space_name,
        location: updatedReservation.spaces.location,
        maxCapacity: updatedReservation.spaces.max_capacity
      },
      user: {
        id: userInfo.id,
        email: userInfo.email?.substring(0, 10) + '***',
        name: userInfo.name
      },
      payment: paymentInfo ? {
        id: paymentInfo.id_payment,
        amount: paymentInfo.amount,
        status: paymentInfo.payment_status,
        method: paymentInfo.payment_method
      } : null,
      notification: {
        sent: notificationResult.sent,
        emailId: notificationResult.emailId || null,
        error: notificationResult.error || null
      }
    };
  } catch (error) {
    perfTracker.total();
    logWithContext("ERROR", requestId, "❌ Reservation acceptance failed", {
      error: error.message,
      stack: error.stack?.substring(0, 300),
      executionTime: perfTracker.total()
    });
    throw error;
  }
}
// 🔧 FUNCIÓN: Obtener reservas del owner
async function getOwnerReservations(supabase, authUser, requestId) {
  try {
    logWithContext("INFO", requestId, "📋 Getting owner reservations", {
      ownerId: authUser.userId?.substring(0, 8) + '***',
      role: authUser.role
    });
    let query = supabase.from('reservations').select(`
        id_reservation,
        user_id,
        space_id,
        reservation_date,
        start_date,
        end_date,
        estimated_capacity,
        status,
        spaces (
          id_space,
          space_name,
          location,
          price_per_hour_cop,
          max_capacity,
          owner_id
        ),
        payments (
          id_payment,
          amount,
          payment_status,
          payment_method,
          payment_date
        )
      `);
    // Si no es superadmin, filtrar solo las reservas de espacios propios
    if (authUser.role !== 'superadmin') {
      // Primero obtener los IDs de espacios del owner
      const { data: ownerSpaces, error: spacesError } = await supabase.from('spaces').select('id_space').eq('owner_id', authUser.userId);
      if (spacesError) {
        throw new Error("Error obteniendo espacios del propietario");
      }
      const spaceIds = ownerSpaces.map((space)=>space.id_space);
      if (spaceIds.length === 0) {
        return {
          reservations: [],
          count: 0
        };
      }
      query = query.in('space_id', spaceIds);
    }
    const { data: reservations, error: reservationsError } = await query.order('reservation_date', {
      ascending: false
    });
    if (reservationsError) {
      logWithContext("ERROR", requestId, "Error fetching owner reservations", reservationsError);
      throw new Error("Error obteniendo reservas");
    }
    const formattedReservations = (reservations || []).map((reservation)=>({
        id: reservation.id_reservation,
        userId: reservation.user_id,
        space: {
          id: reservation.spaces?.id_space,
          name: reservation.spaces?.space_name,
          location: reservation.spaces?.location,
          pricePerHour: reservation.spaces?.price_per_hour_cop,
          maxCapacity: reservation.spaces?.max_capacity
        },
        reservationDate: reservation.reservation_date,
        startDate: reservation.start_date,
        endDate: reservation.end_date,
        estimatedCapacity: reservation.estimated_capacity,
        status: reservation.status,
        payment: reservation.payments ? {
          id: reservation.payments.id_payment,
          amount: reservation.payments.amount,
          status: reservation.payments.payment_status,
          method: reservation.payments.payment_method,
          date: reservation.payments.payment_date
        } : null
      }));
    logWithContext("INFO", requestId, "✅ Owner reservations retrieved successfully", {
      count: formattedReservations.length,
      ownerId: authUser.userId?.substring(0, 8) + '***',
      statusBreakdown: {
        pending: formattedReservations.filter((r)=>r.status === 'pending').length,
        confirmed: formattedReservations.filter((r)=>r.status === 'confirmed').length,
        cancelled: formattedReservations.filter((r)=>r.status === 'cancelled').length
      }
    });
    return {
      reservations: formattedReservations,
      count: formattedReservations.length
    };
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting owner reservations", {
      error: error.message
    });
    throw error;
  }
}
// 🔧 MAIN SERVE FUNCTION
serve(async (req)=>{
  const requestId = `own_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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
    logWithContext("INFO", requestId, "⭐️ Starting owner reservations function - Current Time: 2025-10-19 00:18:16 - User: IvaninaCapuchina", {
      method: req.method,
      origin: req.headers.get('Origin'),
      userAgent: req.headers.get('User-Agent')?.substring(0, 100)
    });
    mainPerf.step("initialization");
    // Environment validation
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
      logWithContext("ERROR", requestId, "❌ Missing critical environment variables", {
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
        hasJwtSecret: !!JWT_SECRET,
        hasResendKey: !!RESEND_API_KEY
      });
      throw new Error("Configuración del servidor incompleta");
    }
    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    mainPerf.step("auth_verification");
    // Verify authentication
    const authToken = req.headers.get('Authorization');
    const authUser = await verifyAuthToken(authToken, requestId);
    logWithContext("INFO", requestId, "✅ User authenticated", {
      userId: authUser.userId?.substring(0, 8) + '***',
      role: authUser.role,
      aal: authUser.aal
    });
    mainPerf.step("request_parsing");
    // Parse request
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
    logWithContext("INFO", requestId, `🔄 Processing action: ${action}`, {
      hasAction: !!action,
      bodyKeys: Object.keys(requestBody)
    });
    mainPerf.step("action_processing");
    switch(action){
      case "accept":
        {
          logWithContext("INFO", requestId, "✅ Processing reservation acceptance");
          const { reservationId } = requestBody;
          if (!reservationId) {
            throw new Error("reservationId es requerido");
          }
          logWithContext("DEBUG", requestId, "🔍 Acceptance request details", {
            reservationId,
            ownerId: authUser.userId?.substring(0, 8) + '***',
            role: authUser.role
          });
          const result = await processReservationAcceptance(supabase, authUser, reservationId, requestId);
          mainPerf.total();
          return new Response(JSON.stringify({
            success: true,
            message: "🎉 Reserva aceptada exitosamente",
            data: result,
            metadata: {
              requestId,
              timestamp: new Date().toISOString(),
              executionTime: mainPerf.total(),
              action: 'accept'
            }
          }), {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
      case "list":
        {
          logWithContext("INFO", requestId, "📋 Getting owner reservations list");
          const result = await getOwnerReservations(supabase, authUser, requestId);
          mainPerf.total();
          return new Response(JSON.stringify({
            success: true,
            data: result.reservations,
            count: result.count,
            metadata: {
              requestId,
              timestamp: new Date().toISOString(),
              executionTime: mainPerf.total(),
              action: 'list'
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
        throw new Error(`Acción no válida: ${action}. Acciones disponibles: accept, list`);
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
    } else if (error.message.includes('permisos') || error.message.includes('Solo los propietarios')) {
      statusCode = 403;
    } else if (error.message.includes('no encontrado') || error.message.includes('not found')) {
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
