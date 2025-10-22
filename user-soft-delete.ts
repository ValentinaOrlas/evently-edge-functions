// supabase/functions/user-soft-delete/index.ts
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-20 05:23:07
// Current User's Login: IvaninaCapuchina
// Borrado permanente de usuario con notificación por email
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400'
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
function logWithContext(level, requestId, message, data) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [${requestId}] ${message}`;
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}
// 🔧 FUNCIÓN: Enviar email de confirmación de eliminación de cuenta
async function sendAccountDeletionEmail(userEmail, userName, deletedItems, requestId) {
  if (!RESEND_API_KEY) {
    logWithContext('WARN', requestId, '⚠️ RESEND_API_KEY not configured - skipping email');
    return {
      sent: false,
      reason: 'Email not configured'
    };
  }
  if (!userEmail) {
    logWithContext('WARN', requestId, '⚠️ User email not available - skipping notification');
    return {
      sent: false,
      reason: 'User email not available'
    };
  }
  try {
    logWithContext('INFO', requestId, '📧 Sending account deletion confirmation email', {
      to: userEmail.substring(0, 10) + '***'
    });
    const currentDate = new Date().toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const totalItemsDeleted = Object.values(deletedItems).reduce((a, b)=>a + b, 0);
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cuenta Eliminada - Evently</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f3f4f6;
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 15px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
          color: white;
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 2em;
          font-weight: bold;
        }
        .content {
          padding: 40px;
          line-height: 1.6;
          color: #374151;
        }
        .deletion-box {
          background-color: #fee2e2;
          border-left: 4px solid #dc2626;
          padding: 25px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .deletion-box h3 {
          color: #dc2626;
          margin-top: 0;
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
          color: #6b7280;
        }
        .info-value {
          color: #374151;
        }
        .warning-box {
          background-color: #fef3c7;
          border: 2px solid #f59e0b;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          text-align: center;
        }
        .warning-box h4 {
          color: #92400e;
          margin-top: 0;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin: 20px 0;
        }
        .stat-card {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid #e5e7eb;
        }
        .stat-number {
          font-size: 2em;
          font-weight: bold;
          color: #dc2626;
          margin: 0;
        }
        .stat-label {
          font-size: 0.9em;
          color: #6b7280;
          margin-top: 5px;
        }
        .footer {
          background-color: #f9fafb;
          padding: 30px;
          text-align: center;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
        }
        .footer a {
          color: #dc2626;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🗑️ Cuenta Eliminada</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Tu cuenta de Evently ha sido eliminada permanentemente</p>
        </div>
        
        <div class="content">
          <h2>Hola ${userName} 👋</h2>
          <p>Te confirmamos que tu cuenta y toda tu información personal han sido eliminadas permanentemente de nuestro sistema el <strong>${currentDate}</strong>.</p>

          <div class="deletion-box">
            <h3>✅ Información Eliminada</h3>
            <p>Los siguientes datos han sido eliminados de forma permanente e irreversible:</p>
            
            <div class="info-row">
              <span class="info-label">📅 Reservaciones:</span>
              <span class="info-value">${deletedItems.reservations || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">💳 Pagos:</span>
              <span class="info-value">${deletedItems.payments || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">🏢 Espacios:</span>
              <span class="info-value">${deletedItems.spaces || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">📸 Fotos de espacios:</span>
              <span class="info-value">${deletedItems.spacePhotos || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">⭐ Reseñas:</span>
              <span class="info-value">${deletedItems.spaceReviews || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">❤️ Favoritos:</span>
              <span class="info-value">${deletedItems.favorites || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">🔐 Configuración MFA:</span>
              <span class="info-value">${deletedItems.mfaSettings || 0}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">🔑 Tokens de sesión:</span>
              <span class="info-value">${deletedItems.authTokens || 0}</span>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <p class="stat-number">${totalItemsDeleted}</p>
              <p class="stat-label">Total de registros eliminados</p>
            </div>
            <div class="stat-card">
              <p class="stat-number">100%</p>
              <p class="stat-label">Datos eliminados</p>
            </div>
          </div>

          <div class="warning-box">
            <h4>⚠️ Acción Irreversible</h4>
            <p style="margin: 10px 0;">Esta acción es permanente y no puede ser revertida. Todos tus datos han sido eliminados de nuestros sistemas de manera definitiva.</p>
          </div>

          <div style="background-color: #dbeafe; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h4 style="color: #1e40af; margin-top: 0;">¿Cambiaste de opinión?</h4>
            <p style="margin-bottom: 0;">Si deseas volver a usar Evently en el futuro, deberás crear una nueva cuenta desde cero. Todos tus datos anteriores se han eliminado permanentemente.</p>
          </div>

          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
            <h4 style="color: #374151; margin-top: 0;">¡Gracias por haber sido parte de Evently!</h4>
            <p style="color: #6b7280;">Esperamos que hayas tenido una buena experiencia con nosotros. Si tienes algún comentario o sugerencia, nos encantaría escucharte.</p>
          </div>
        </div>

        <div class="footer">
          <p>Si crees que esto fue un error o no solicitaste eliminar tu cuenta, por favor contáctanos inmediatamente:</p>
          <p><strong>📧 <a href="mailto:soporte@evently.blog">soporte@evently.blog</a></strong></p>
          <p style="margin-top: 20px; font-size: 0.9em;">
            Este es un email automático de confirmación. Por favor no respondas a este mensaje.
          </p>
          <p style="margin-top: 10px;">© 2025 Evently - Plataforma de gestión de eventos</p>
        </div>
      </div>
    </body>
    </html>`;
    const textContent = `
Cuenta Eliminada - Evently

Hola ${userName},

Te confirmamos que tu cuenta y toda tu información personal han sido eliminadas permanentemente de nuestro sistema el ${currentDate}.

INFORMACIÓN ELIMINADA:
- Reservaciones: ${deletedItems.reservations || 0}
- Pagos: ${deletedItems.payments || 0}
- Espacios: ${deletedItems.spaces || 0}
- Fotos de espacios: ${deletedItems.spacePhotos || 0}
- Reseñas: ${deletedItems.spaceReviews || 0}
- Favoritos: ${deletedItems.favorites || 0}
- Configuración MFA: ${deletedItems.mfaSettings || 0}
- Tokens de sesión: ${deletedItems.authTokens || 0}

Total de registros eliminados: ${totalItemsDeleted}

⚠️ ACCIÓN IRREVERSIBLE
Esta acción es permanente y no puede ser revertida. Todos tus datos han sido eliminados de nuestros sistemas de manera definitiva.

¿CAMBIASTE DE OPINIÓN?
Si deseas volver a usar Evently en el futuro, deberás crear una nueva cuenta desde cero. Todos tus datos anteriores se han eliminado permanentemente.

¡GRACIAS POR HABER SIDO PARTE DE EVENTLY!
Esperamos que hayas tenido una buena experiencia con nosotros.

Si crees que esto fue un error o no solicitaste eliminar tu cuenta, por favor contáctanos inmediatamente:
📧 soporte@evently.blog

© 2025 Evently
    `;
    const emailData = {
      from: 'Evently <cuentas@evently.blog>',
      to: [
        userEmail
      ],
      subject: '🗑️ Confirmación: Tu cuenta de Evently ha sido eliminada',
      html: htmlContent,
      text: textContent
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
      logWithContext('ERROR', requestId, '❌ Resend API error', {
        status: resendResponse.status,
        error: result
      });
      return {
        sent: false,
        error: result.message || 'Error desconocido'
      };
    }
    logWithContext('INFO', requestId, '✅ Account deletion email sent successfully', {
      emailId: result.id,
      to: userEmail.substring(0, 10) + '***'
    });
    return {
      sent: true,
      emailId: result.id
    };
  } catch (error) {
    logWithContext('ERROR', requestId, '❌ Error sending account deletion email', {
      error: error.message
    });
    return {
      sent: false,
      error: error.message
    };
  }
}
serve(async (req)=>{
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    logWithContext('INFO', requestId, '🗑️ Starting user account deletion process WITH EMAIL NOTIFICATION');
    // Verificar que sea método POST
    if (req.method !== 'POST') {
      throw new Error('Método no permitido. Usa POST.');
    }
    // Obtener el userId del body
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      throw new Error('userId es requerido en el body de la petición');
    }
    logWithContext('INFO', requestId, '🔍 Processing deletion for user', {
      userId: userId.substring(0, 8) + '***'
    });
    // Crear cliente de Supabase con service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Verificar que el usuario existe en la base de datos
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData.user) {
      logWithContext('ERROR', requestId, 'User not found in database', {
        userId,
        error: userError
      });
      throw new Error('Usuario no encontrado en la base de datos');
    }
    // Guardar información del usuario para el email
    const userEmail = userData.user.email;
    const userName = `${userData.user.user_metadata?.first_name || ''} ${userData.user.user_metadata?.last_name || ''}`.trim() || userData.user.email || 'Usuario';
    logWithContext('INFO', requestId, '🔍 User verified in database, starting deletion cascade', {
      userId: userId.substring(0, 8) + '***',
      email: userEmail?.substring(0, 10) + '***',
      userName
    });
    // Inicializar resultado
    const result = {
      success: false,
      message: '',
      deletedItems: {
        reservations: 0,
        payments: 0,
        reservationServices: 0,
        spaces: 0,
        additionalServices: 0,
        spacePhotos: 0,
        spaceAmenities: 0,
        spaceReviews: 0,
        favorites: 0,
        authTokens: 0,
        mfaSettings: 0,
        authRoles: 0,
        usersRoles: 0
      },
      emailSent: false
    };
    // 1. ELIMINAR RESERVACIONES Y DATOS RELACIONADOS
    logWithContext('INFO', requestId, '📅 Step 1: Deleting user reservations');
    const { data: reservations, error: resError } = await supabase.from('reservations').select('id_reservation').eq('user_id', userId);
    if (resError) {
      logWithContext('ERROR', requestId, 'Error fetching reservations', resError);
      throw resError;
    }
    if (reservations && reservations.length > 0) {
      const reservationIds = reservations.map((r)=>r.id_reservation);
      logWithContext('INFO', requestId, `Found ${reservationIds.length} reservations to delete`);
      // 1.1 Eliminar servicios de reservaciones
      const { error: servError, count: servCount } = await supabase.from('reservation_services').delete().in('reservation_id', reservationIds);
      if (servError) throw servError;
      result.deletedItems.reservationServices = servCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${servCount} reservation services`);
      // 1.2 Eliminar pagos
      const { error: payError, count: payCount } = await supabase.from('payments').delete().in('reservation_id', reservationIds);
      if (payError) throw payError;
      result.deletedItems.payments = payCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${payCount} payments`);
      // 1.3 Eliminar reservaciones
      const { error: delResError, count: resCount } = await supabase.from('reservations').delete().eq('user_id', userId);
      if (delResError) throw delResError;
      result.deletedItems.reservations = resCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${resCount} reservations`);
    }
    // 2. ELIMINAR ESPACIOS Y DATOS RELACIONADOS
    logWithContext('INFO', requestId, '🏢 Step 2: Deleting user spaces');
    const { data: spaces, error: spacesError } = await supabase.from('spaces').select('id_space').eq('owner_id', userId);
    if (spacesError) throw spacesError;
    if (spaces && spaces.length > 0) {
      const spaceIds = spaces.map((s)=>s.id_space);
      logWithContext('INFO', requestId, `Found ${spaceIds.length} spaces to delete`);
      // 2.1 Eliminar servicios adicionales
      const { error: addServError, count: addServCount } = await supabase.from('additional_services').delete().in('space_id', spaceIds);
      if (addServError) throw addServError;
      result.deletedItems.additionalServices = addServCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${addServCount} additional services`);
      // 2.2 Eliminar fotos de espacios
      const { error: photosError, count: photosCount } = await supabase.from('space_photos').delete().in('space_id', spaceIds);
      if (photosError) throw photosError;
      result.deletedItems.spacePhotos = photosCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${photosCount} space photos`);
      // 2.3 Eliminar amenidades de espacios
      const { error: amenError, count: amenCount } = await supabase.from('space_amenities').delete().in('space_id', spaceIds);
      if (amenError) throw amenError;
      result.deletedItems.spaceAmenities = amenCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${amenCount} space amenities`);
      // 2.4 Eliminar reseñas de los espacios (como owner)
      const { error: spaceReviewsError, count: spaceReviewsCount } = await supabase.from('space_reviews').delete().in('space_id', spaceIds);
      if (spaceReviewsError) throw spaceReviewsError;
      result.deletedItems.spaceReviews = (result.deletedItems.spaceReviews || 0) + (spaceReviewsCount || 0);
      logWithContext('INFO', requestId, `✅ Deleted ${spaceReviewsCount} space reviews (as owner)`);
      // 2.5 Eliminar espacios
      const { error: delSpacesError, count: spacesCount } = await supabase.from('spaces').delete().eq('owner_id', userId);
      if (delSpacesError) throw delSpacesError;
      result.deletedItems.spaces = spacesCount || 0;
      logWithContext('INFO', requestId, `✅ Deleted ${spacesCount} spaces`);
    }
    // 3. ELIMINAR RESEÑAS DEL USUARIO (como reviewer)
    logWithContext('INFO', requestId, '⭐ Step 3: Deleting user reviews');
    const { error: reviewsError, count: reviewsCount } = await supabase.from('space_reviews').delete().eq('user_id', userId);
    if (reviewsError) throw reviewsError;
    result.deletedItems.spaceReviews = (result.deletedItems.spaceReviews || 0) + (reviewsCount || 0);
    logWithContext('INFO', requestId, `✅ Deleted ${reviewsCount} user reviews`);
    // 4. ELIMINAR FAVORITOS
    logWithContext('INFO', requestId, '❤️ Step 4: Deleting user favorites');
    const { error: favError, count: favCount } = await supabase.from('user_space_favorites').delete().eq('user_id', userId);
    if (favError) throw favError;
    result.deletedItems.favorites = favCount || 0;
    logWithContext('INFO', requestId, `✅ Deleted ${favCount} favorites`);
    // 5. ELIMINAR TOKENS DE AUTENTICACIÓN
    logWithContext('INFO', requestId, '🔑 Step 5: Deleting auth tokens');
    const { error: tokensError, count: tokensCount } = await supabase.from('auth_tokens').delete().eq('user_id', userId);
    if (tokensError) throw tokensError;
    result.deletedItems.authTokens = tokensCount || 0;
    logWithContext('INFO', requestId, `✅ Deleted ${tokensCount} auth tokens`);
    // 6. ELIMINAR CONFIGURACIÓN MFA
    logWithContext('INFO', requestId, '🔐 Step 6: Deleting MFA settings');
    const { error: mfaError, count: mfaCount } = await supabase.from('user_mfa_settings').delete().eq('user_id', userId);
    if (mfaError) throw mfaError;
    result.deletedItems.mfaSettings = mfaCount || 0;
    logWithContext('INFO', requestId, `✅ Deleted ${mfaCount} MFA settings`);
    // 7. ELIMINAR ROLES
    logWithContext('INFO', requestId, '👤 Step 7: Deleting user roles');
    // 7.1 auth_roles
    const { error: authRolesError, count: authRolesCount } = await supabase.from('auth_roles').delete().eq('user_id', userId);
    if (authRolesError) {
      logWithContext('WARN', requestId, 'Error deleting from auth_roles', authRolesError);
    }
    result.deletedItems.authRoles = authRolesCount || 0;
    // 7.2 users_roles
    const { error: usersRolesError, count: usersRolesCount } = await supabase.from('users_roles').delete().eq('user_id', userId);
    if (usersRolesError) {
      logWithContext('WARN', requestId, 'Error deleting from users_roles', usersRolesError);
    }
    result.deletedItems.usersRoles = usersRolesCount || 0;
    logWithContext('INFO', requestId, `✅ Deleted roles: ${authRolesCount} from auth_roles, ${usersRolesCount} from users_roles`);
    // 8. ENVIAR EMAIL DE CONFIRMACIÓN ANTES DE ELIMINAR LA CUENTA
    logWithContext('INFO', requestId, '📧 Step 8: Sending account deletion confirmation email');
    const emailResult = await sendAccountDeletionEmail(userEmail, userName, result.deletedItems, requestId);
    result.emailSent = emailResult.sent;
    if (emailResult.sent) {
      logWithContext('INFO', requestId, '✅ Deletion confirmation email sent successfully', {
        emailId: emailResult.emailId
      });
    } else {
      logWithContext('WARN', requestId, '⚠️ Could not send deletion confirmation email', {
        reason: emailResult.reason || emailResult.error
      });
    }
    // 9. FINALMENTE, ELIMINAR EL USUARIO DE AUTH.USERS
    logWithContext('INFO', requestId, '🗑️ Step 9: Deleting user from auth.users');
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      logWithContext('ERROR', requestId, 'Error deleting user from auth', deleteUserError);
      throw deleteUserError;
    }
    result.success = true;
    result.message = 'Usuario y toda su información eliminada exitosamente';
    logWithContext('INFO', requestId, '🎉 User deletion completed successfully WITH EMAIL NOTIFICATION', {
      userId: userId.substring(0, 8) + '***',
      email: userEmail?.substring(0, 10) + '***',
      totalItemsDeleted: Object.values(result.deletedItems).reduce((a, b)=>a + b, 0),
      emailSent: result.emailSent
    });
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    logWithContext('ERROR', requestId, '❌ Error in user deletion process', {
      error: error.message,
      stack: error.stack
    });
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al eliminar la información del usuario',
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
