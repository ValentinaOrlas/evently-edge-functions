// 🔧 EDGE FUNCTION - AUTH CON MFA COMPLETO Y RESEND INTEGRADO
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-18 05:22:07
// Current User's Login: IvaninaCapuchina
// NEW: Resend integration using RESEND_API_KEY secret from Supabase
// REMOVED: reCAPTCHA integration
// FIXED: Supabase email sending conflict - disabled auto confirmation emails
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://esm.sh/jose@4.14.4";
// JWT Secret for signing tokens
const JWT_SECRET = Deno.env.get('JWT_SECRET') || "your_secure_jwt_secret_change_in_production";
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
// 🔧 NEW: Resend API Key from Supabase secrets
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || "";
// Token duration
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;
// 🔧 ROLES PERMITIDOS
const ALLOWED_ROLES = {
  MEMBER: 'member',
  OWNER: 'owner',
  SUPERADMIN: 'superadmin',
  USER: 'user'
};
// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
// 🔧 NEW: Resend Email Function with confirmation link
async function sendWelcomeEmailWithLink(email, firstName, lastName, confirmationUrl, requestId) {
  if (!RESEND_API_KEY) {
    logWithContext("ERROR", requestId, "❌ RESEND_API_KEY not configured in Supabase secrets");
    throw new Error("Configuración de email no encontrada");
  }
  try {
    logWithContext("INFO", requestId, "📧 Sending welcome email with confirmation link via Resend", {
      to: email.substring(0, 10) + '***',
      hasApiKey: !!RESEND_API_KEY,
      hasConfirmationUrl: !!confirmationUrl,
      timestamp: "2025-10-18 05:22:07"
    });
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bienvenido a Evently</title>
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
        .header h1 {
          margin: 0;
          font-size: 2.5em;
          font-weight: bold;
        }
        .content {
          padding: 40px;
          line-height: 1.6;
        }
        .welcome-text {
          font-size: 1.2em;
          color: #333;
          margin-bottom: 30px;
        }
        .confirmation-box {
          background-color: #f97316;
          color: white;
          padding: 25px;
          border-radius: 10px;
          text-align: center;
          margin: 30px 0;
          border: 3px solid #ea580c;
        }
        .confirmation-button {
          display: inline-block;
          background-color: #ea580c;
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 25px;
          font-weight: bold;
          margin: 20px 0;
          box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          font-size: 1.2em;
        }
        .confirmation-button:hover {
          background-color: #c2410c;
        }
        .features {
          background-color: #fed7aa;
          padding: 25px;
          border-radius: 10px;
          margin: 30px 0;
          border-left: 4px solid #f97316;
        }
        .features h3 {
          color: #ea580c;
          margin-top: 0;
        }
        .features ul {
          color: #555;
          padding-left: 20px;
        }
        .features li {
          margin: 10px 0;
        }
        .footer {
          background-color: #fb923c;
          padding: 25px;
          text-align: center;
          color: white;
        }
        .accent {
          color: #f97316;
          font-weight: bold;
        }
        .highlight-box {
          background-color: #ffedd5;
          border: 2px solid #f97316;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .url-box {
          background-color: #f3f4f6;
          padding: 10px;
          border-radius: 5px;
          font-family: monospace;
          font-size: 0.9em;
          word-break: break-all;
          margin: 10px 0;
          border: 1px solid #d1d5db;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 ¡Bienvenido a Evently!</h1>
        </div>
        
        <div class="content">
          <div class="welcome-text">
            <h2>¡Hola <span class="accent">${firstName} ${lastName}</span>! 👋</h2>
            <p>Nos emociona tenerte como parte de la familia Evently. Estás a solo un clic de comenzar a crear eventos increíbles.</p>
          </div>

          <div class="confirmation-box">
            <h3>🔐 Confirma tu cuenta</h3>
            <p>Haz clic en el botón de abajo para verificar tu email y activar tu cuenta:</p>
            <a href="${confirmationUrl}" class="confirmation-button">
              ✅ Confirmar mi cuenta
            </a>
            <p style="font-size: 0.9em; margin-top: 20px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:
            </p>
            <div class="url-box">${confirmationUrl}</div>
          </div>

          <div class="features">
            <h3>🚀 Lo que puedes hacer en Evently:</h3>
            <ul>
              <li>📅 Crear y gestionar eventos únicos</li>
              <li>👥 Invitar participantes fácilmente</li>
              <li>🎨 Personalizar tus eventos con temas</li>
              <li>📊 Obtener estadísticas en tiempo real</li>
              <li>💬 Comunicarte con los asistentes</li>
              <li>🔒 Seguridad MFA opcional</li>
            </ul>
          </div>

          <div class="highlight-box">
            <p style="text-align: center; margin: 0;">
              <strong>⏰ Este enlace expira en 24 horas</strong>
            </p>
          </div>
        </div>

        <div class="footer">
          <p>¿Necesitas ayuda? Contáctanos en <strong>soporte@evently.blog</strong></p>
          <p>© 2025 Evently - Creando experiencias memorables</p>
        </div>
      </div>
    </body>
    </html>`;
    const emailData = {
      from: 'Evently <transactions@evently.blog>',
      to: [
        email
      ],
      subject: `🎉 Bienvenido a Evently, ${firstName}! Confirma tu cuenta`,
      html: htmlContent,
      text: `¡Hola ${firstName} ${lastName}!\n\nBienvenido a Evently. Para completar tu registro, confirma tu cuenta haciendo clic en el siguiente enlace:\n\n${confirmationUrl}\n\nEste enlace expira en 24 horas.\n\n¿Necesitas ayuda? Contáctanos en soporte@evently.blog\n\n© 2025 Evently`
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
        error: result,
        timestamp: "2025-10-18 05:22:07"
      });
      throw new Error(`Error enviando email: ${result.message || 'Error desconocido'}`);
    }
    logWithContext("INFO", requestId, "✅ Email sent successfully via Resend", {
      emailId: result.id,
      to: email.substring(0, 10) + '***',
      timestamp: "2025-10-18 05:22:07"
    });
    return result;
  } catch (emailError) {
    logWithContext("ERROR", requestId, "💥 Exception sending email via Resend", {
      error: emailError.message,
      timestamp: "2025-10-18 05:22:07"
    });
    throw emailError;
  }
}
// 🔧 HELPER: Verificar si el usuario tiene MFA habilitado
async function checkUserMFAStatus(supabase, userId, requestId) {
  logWithContext("INFO", requestId, "🔍 Checking user MFA status", {
    userId: userId.substring(0, 8) + '***'
  });
  try {
    const { data, error } = await supabase.from('user_mfa_settings').select('enabled, totp_secret').eq('user_id', userId).single();
    if (error) {
      if (error.code === 'PGRST116') {
        return {
          hasMFA: false,
          error: null
        };
      } else {
        logWithContext("ERROR", requestId, "Error checking MFA status", error);
        return {
          hasMFA: false,
          error: error
        };
      }
    }
    const hasMFA = Boolean(data && data.enabled === true && data.totp_secret && data.totp_secret.length > 0);
    logWithContext("INFO", requestId, "✅ MFA status checked successfully", {
      userId: userId.substring(0, 8) + '***',
      hasMFA: hasMFA,
      timestamp: "2025-10-18 05:22:07"
    });
    return {
      hasMFA,
      error: null
    };
  } catch (mfaError) {
    logWithContext("ERROR", requestId, "Exception in checkUserMFAStatus", mfaError);
    return {
      hasMFA: false,
      error: mfaError
    };
  }
}
// 🔧 HELPER: Crear registro de autenticación con flags MFA
async function createAuthTokenRecord(supabase, userId, userRole, hasMFA, requestId) {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const refreshToken = Array.from(tokenBytes).map((b)=>b.toString(16).padStart(2, '0')).join('');
  const tempTokenId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
  // Limpiar tokens anteriores del usuario
  await supabase.from('auth_tokens').delete().eq('user_id', userId);
  const authRecord = {
    user_id: userId,
    refresh_token: refreshToken,
    refresh_token_expires_at: expiresAt.toISOString(),
    mfa_verified: !hasMFA,
    mfa_required: hasMFA,
    temp_token_id: tempTokenId,
    login_step: hasMFA ? 'mfa_pending' : 'completed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  logWithContext("INFO", requestId, "🔧 Creating auth token record", {
    userId: userId.substring(0, 8) + '***',
    mfaRequired: hasMFA,
    mfaVerified: !hasMFA,
    loginStep: authRecord.login_step,
    tempTokenId: tempTokenId,
    timestamp: "2025-10-18 05:22:07"
  });
  const { data, error } = await supabase.from('auth_tokens').insert(authRecord).select().single();
  if (error) {
    logWithContext("ERROR", requestId, "Error creating auth token record", error);
    throw new Error(`Error saving auth token: ${error.message}`);
  }
  return {
    authRecord: data,
    refreshToken,
    tempTokenId,
    needsMFA: hasMFA
  };
}
// 🔧 HELPER: Generar token temporal ligado a auth_tokens
async function generateTempMFAToken(userId, email, role, tempTokenId, requestId) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const tempToken = await new jose.SignJWT({
    sub: userId,
    email: email,
    role: role,
    temp: true,
    mfa_required: true,
    temp_token_id: tempTokenId,
    iat: Math.floor(Date.now() / 1000),
    iss: 'evently-auth-mfa',
    aud: 'evently-mfa'
  }).setProtectedHeader({
    alg: 'HS256'
  }).setIssuedAt().setExpirationTime('10m').sign(secret);
  logWithContext("INFO", requestId, "🔑 Temporary MFA token generated with DB link", {
    userId: userId.substring(0, 8) + '***',
    tempTokenId: tempTokenId,
    expiresIn: '10m',
    timestamp: "2025-10-18 05:22:07"
  });
  return tempToken;
}
// 🔧 HELPER: Marcar MFA como verificado en auth_tokens
async function markMFAAsVerified(supabase, tempTokenId, requestId) {
  logWithContext("INFO", requestId, "✅ Marking MFA as verified in auth_tokens", {
    tempTokenId: tempTokenId,
    timestamp: "2025-10-18 05:22:07"
  });
  const { data, error } = await supabase.from('auth_tokens').update({
    mfa_verified: true,
    login_step: 'completed',
    updated_at: new Date().toISOString()
  }).eq('temp_token_id', tempTokenId).select().single();
  if (error) {
    logWithContext("ERROR", requestId, "Error marking MFA as verified", error);
    throw new Error("Error updating MFA verification status");
  }
  logWithContext("INFO", requestId, "✅ MFA verification status updated in database", {
    userId: data.user_id.substring(0, 8) + '***',
    mfaVerified: data.mfa_verified,
    loginStep: data.login_step,
    timestamp: "2025-10-18 05:22:07"
  });
  return data;
}
// 🔧 HELPER: Buscar usuario por email usando listUsers
async function findUserByEmail(supabase, email, requestId) {
  logWithContext("INFO", requestId, "🔍 Searching for user by email", {
    email: email.substring(0, 10) + '***'
  });
  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    if (error) {
      logWithContext("ERROR", requestId, "Error listing users", error);
      throw error;
    }
    const user = data.users.find((u)=>u.email === email);
    if (user) {
      logWithContext("INFO", requestId, "✅ User found by email", {
        userId: user.id,
        email: user.email,
        confirmed: !!user.email_confirmed_at
      });
      return {
        user,
        error: null
      };
    } else {
      logWithContext("INFO", requestId, "User not found by email", {
        email: email.substring(0, 10) + '***'
      });
      return {
        user: null,
        error: null
      };
    }
  } catch (searchError) {
    logWithContext("ERROR", requestId, "Error in findUserByEmail", searchError);
    return {
      user: null,
      error: searchError
    };
  }
}
// 🔧 VALIDAR Y NORMALIZAR ROL
function validateAndNormalizeRole(requestedRole) {
  if (!requestedRole) return ALLOWED_ROLES.USER;
  const normalizedRole = requestedRole.toLowerCase().trim();
  const roleMapping = {
    'member': ALLOWED_ROLES.MEMBER,
    'owner': ALLOWED_ROLES.OWNER,
    'superadmin': ALLOWED_ROLES.SUPERADMIN,
    'user': ALLOWED_ROLES.USER
  };
  return roleMapping[normalizedRole] || ALLOWED_ROLES.USER;
}
serve(async (req)=>{
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    logWithContext("INFO", requestId, "CORS preflight request handled");
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    logWithContext("INFO", requestId, "⭐️ Starting auth function with MFA + Resend - Current Time: 2025-10-18 05:22:07 - User: IvaninaCapuchina");
    // 🔧 DEBUG: Verificar variables de entorno al inicio - FIXED
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    logWithContext("DEBUG", requestId, "🔧 Environment variables check", {
      hasSupabaseURL: !!SUPABASE_URL,
      supabaseURLPrefix: SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '***' : 'MISSING',
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      serviceRoleKeyPrefix: SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '***' : 'MISSING',
      hasAnonKey: !!anonKey,
      anonKeyPrefix: anonKey ? anonKey.substring(0, 20) + '***' : 'MISSING',
      hasJWTSecret: !!JWT_SECRET,
      // 🔧 NEW: Resend config check
      hasResendKey: !!RESEND_API_KEY,
      resendKeyPrefix: RESEND_API_KEY ? RESEND_API_KEY.substring(0, 15) + '***' : 'MISSING',
      timestamp: "2025-10-18 05:22:07"
    });
    // Only accept POST
    if (req.method !== "POST") {
      logWithContext("ERROR", requestId, `Method not allowed: ${req.method}`);
      return new Response(JSON.stringify({
        error: "Method not allowed"
      }), {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseClient = createClient(SUPABASE_URL, anonKey || "");
    // Parse request body
    let requestBody;
    try {
      const rawBody = await req.text();
      requestBody = JSON.parse(rawBody);
      logWithContext("INFO", requestId, "Request body parsed", {
        action: requestBody.action,
        hasRole: !!requestBody.role,
        email: requestBody.email ? requestBody.email.substring(0, 10) + '***' : 'not provided',
        hasTempToken: !!requestBody.tempToken,
        hasTotpCode: !!requestBody.totpCode
      });
    } catch (parseError) {
      logWithContext("ERROR", requestId, "Failed to parse request body", parseError);
      throw new Error("Invalid JSON in request body");
    }
    const { action, email, password, firstName, lastName, token, refresh_token, role: requestedRole, // 🔧 MFA fields
    tempToken, totpCode, backupCode } = requestBody;
    logWithContext("INFO", requestId, `🔄 Processing action: ${action}`, {
      requestedRole: requestedRole || 'not specified',
      timestamp: "2025-10-18 05:22:07"
    });
    switch(action){
      case "register":
        {
          logWithContext("INFO", requestId, "🔄 Processing user registration with admin.createUser + Resend email");
          if (!email || !password || !firstName || !lastName) {
            throw new Error("Email, password, firstName, and lastName are required");
          }
          const assignedRole = validateAndNormalizeRole(requestedRole);
          logWithContext("INFO", requestId, "🎯 Role assignment", {
            requestedRole: requestedRole || 'none',
            assignedRole: assignedRole,
            user: "IvaninaCapuchina",
            timestamp: "2025-10-18 05:22:07"
          });
          try {
            const { user: existingUser, error: searchError } = await findUserByEmail(supabase, email, requestId);
            if (searchError) {
              logWithContext("ERROR", requestId, "Error searching for existing user", searchError);
              throw new Error("Error verificando usuario existente");
            }
            if (existingUser) {
              if (existingUser.email_confirmed_at) {
                logWithContext("ERROR", requestId, "User already exists and is verified", {
                  userId: existingUser.id,
                  email: existingUser.email,
                  confirmedAt: existingUser.email_confirmed_at
                });
                throw new Error("El usuario ya existe y está verificado. Intenta iniciar sesión.");
              }
              logWithContext("INFO", requestId, "🔄 User exists but not verified - deleting and recreating", {
                userId: existingUser.id,
                email: existingUser.email
              });
              // Eliminar el usuario existente no verificado
              const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
              if (deleteError) {
                logWithContext("ERROR", requestId, "Error deleting existing unverified user", deleteError);
              // Continuar de todos modos
              } else {
                logWithContext("INFO", requestId, "✅ Existing unverified user deleted", {
                  userId: existingUser.id
                });
              }
            }
            // 🔧 USAR ADMIN.CREATEUSER PARA EVITAR ENVÍO AUTOMÁTICO DE EMAILS
            logWithContext("INFO", requestId, "🔄 Creating user with admin.createUser (no auto email)");
            const { data: createUserData, error: createUserError } = await supabase.auth.admin.createUser({
              email: email,
              password: password,
              user_metadata: {
                first_name: firstName,
                last_name: lastName,
                role: assignedRole
              },
              email_confirm: false // Usuario no confirmado inicialmente
            });
            if (createUserError) {
              logWithContext("ERROR", requestId, "Error with admin.createUser", createUserError);
              if (createUserError.code === 'email_exists' || createUserError.message?.includes('User already registered')) {
                throw new Error("El email ya está registrado. Si no has verificado tu cuenta, usa la opción de reenviar enlace.");
              }
              throw new Error(`Error creando cuenta: ${createUserError.message}`);
            }
            const user = createUserData.user;
            if (!user) {
              throw new Error("No se pudo crear el usuario");
            }
            // 🔧 GENERAR LINK DE CONFIRMACIÓN MANUAL USANDO ADMIN
            logWithContext("INFO", requestId, "🔧 Generating confirmation token using admin.generateLink");
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'signup',
              email: email,
              options: {
                redirectTo: 'https://app.evently.blog/auth/callback'
              }
            });
            if (linkError) {
              logWithContext("ERROR", requestId, "Error generating confirmation link", linkError);
              // Fallback a URL manual
              var confirmationUrl = `${SUPABASE_URL}/auth/v1/verify?token=${user.id}&type=signup&redirect_to=${encodeURIComponent('https://app.evently.blog/auth/callback')}`;
            } else {
              var confirmationUrl = linkData.properties.action_link;
              logWithContext("INFO", requestId, "✅ Confirmation link generated successfully", {
                hasActionLink: !!linkData.properties.action_link
              });
            }
            // 🔧 ENVIAR EMAIL DE BIENVENIDA CON LINK DE CONFIRMACIÓN VIA RESEND
            try {
              await sendWelcomeEmailWithLink(email, firstName, lastName, confirmationUrl, requestId);
              logWithContext("INFO", requestId, "✅ Welcome email with confirmation link sent successfully via Resend", {
                userId: user.id,
                email: user.email,
                confirmationUrl: confirmationUrl.substring(0, 50) + '***'
              });
            } catch (emailError) {
              logWithContext("ERROR", requestId, "❌ Failed to send welcome email", {
                error: emailError.message,
                userId: user.id
              });
              // Eliminar usuario si no se pudo enviar el email
              await supabase.auth.admin.deleteUser(user.id);
              throw new Error("Error enviando email de confirmación. Intenta nuevamente.");
            }
            // 🔧 ASIGNAR ROL EN TABLA AUTH_ROLES usando admin client
            try {
              const { error: roleError } = await supabase.from('auth_roles').insert({
                user_id: user.id,
                role: assignedRole,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              if (roleError && roleError.code !== '23505') {
                // Fallback a users_roles si auth_roles falla
                const { error: fallbackRoleError } = await supabase.from('users_roles').insert({
                  user_id: user.id,
                  rol: assignedRole,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
                if (fallbackRoleError && fallbackRoleError.code !== '23505') {
                  logWithContext("ERROR", requestId, "Error assigning role in both tables", {
                    authRolesError: roleError,
                    usersRolesError: fallbackRoleError
                  });
                } else {
                  logWithContext("INFO", requestId, "✅ Role assigned via users_roles fallback", {
                    userId: user.id,
                    role: assignedRole
                  });
                }
              } else {
                logWithContext("INFO", requestId, "✅ Role assigned via auth_roles", {
                  userId: user.id,
                  role: assignedRole
                });
              }
            } catch (roleAssignError) {
              logWithContext("ERROR", requestId, "Failed to assign role", {
                error: roleAssignError.message,
                userId: user.id,
                role: assignedRole
              });
            // No fallar el registro por esto
            }
            logWithContext("INFO", requestId, "✅ User registration completed with Resend confirmation email", {
              userId: user.id,
              email: user.email,
              role: assignedRole,
              emailSent: true,
              emailProvider: "resend",
              emailTemplate: "custom_confirmation_link",
              user: "IvaninaCapuchina",
              timestamp: "2025-10-18 05:22:07"
            });
            return new Response(JSON.stringify({
              success: true,
              message: `Usuario registrado exitosamente como ${assignedRole.toUpperCase()}. Se ha enviado un email de confirmación a tu correo. Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.`,
              userId: user.id,
              role: assignedRole,
              emailSent: true,
              emailMethod: "resend",
              emailTemplate: "custom_confirmation_link"
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (createError) {
            logWithContext("ERROR", requestId, "Registration process error", {
              message: createError.message,
              stack: createError.stack,
              name: createError.name,
              user: "IvaninaCapuchina"
            });
            throw createError;
          }
        }
      case "signin":
        {
          logWithContext("INFO", requestId, "🔄 Processing signin with enhanced debugging and MFA token flag strategy");
          if (!email || !password) {
            throw new Error("Email and password are required");
          }
          // 🔧 DEBUG: Log de credenciales (sin exponer password)
          logWithContext("DEBUG", requestId, "🔍 Login attempt details", {
            email: email.substring(0, 10) + '***',
            passwordProvided: !!password,
            passwordLength: password.length,
            emailTrimmed: email.trim() === email,
            timestamp: "2025-10-18 05:22:07"
          });
          // 🔧 DEBUG: Verificar usuario en base de datos ANTES del login
          try {
            const { user: dbUser, error: searchError } = await findUserByEmail(supabase, email, requestId);
            if (searchError) {
              logWithContext("WARN", requestId, "Error searching user in database before login", searchError);
            } else if (!dbUser) {
              logWithContext("ERROR", requestId, "❌ User not found in database - signin will fail", {
                email: email.substring(0, 10) + '***',
                suggestion: "User needs to register first"
              });
              throw new Error("Usuario no encontrado. Debes registrarte primero.");
            } else if (!dbUser.email_confirmed_at) {
              logWithContext("ERROR", requestId, "❌ User exists but email not confirmed", {
                userId: dbUser.id,
                email: dbUser.email,
                createdAt: dbUser.created_at,
                emailConfirmedAt: dbUser.email_confirmed_at
              });
              throw new Error("Debes confirmar tu email antes de poder iniciar sesión. Revisa tu bandeja de entrada y haz clic en el enlace de confirmación.");
            } else {
              logWithContext("INFO", requestId, "✅ Pre-login verification: User exists and is confirmed", {
                userId: dbUser.id,
                email: dbUser.email,
                confirmedAt: dbUser.email_confirmed_at
              });
            }
          } catch (preLoginError) {
            // Si es un error de usuario no encontrado o no confirmado, lanzarlo
            if (preLoginError.message.includes('Usuario no encontrado') || preLoginError.message.includes('confirmar tu email')) {
              throw preLoginError;
            }
            // Para otros errores, solo logar y continuar
            logWithContext("WARN", requestId, "Pre-login check failed but continuing", {
              error: preLoginError.message
            });
          }
          // 🔧 DEBUG: Intentar signin con múltiples enfoques
          logWithContext("INFO", requestId, "🔑 Attempting signin with Supabase (Method 1: Anon Key)", {
            email: email.substring(0, 10) + '***',
            clientType: "anon_key",
            timestamp: "2025-10-18 05:22:07"
          });
          let signInData, signInError;
          // 🔧 MÉTODO 1: Cliente con anon key
          try {
            const result = await supabaseClient.auth.signInWithPassword({
              email: email.trim(),
              password: password
            });
            signInData = result.data;
            signInError = result.error;
            logWithContext("DEBUG", requestId, "🔍 Raw signin result (Method 1)", {
              hasData: !!signInData,
              hasUser: !!signInData?.user,
              hasSession: !!signInData?.session,
              hasError: !!signInError,
              errorCode: signInError?.code || null,
              errorMessage: signInError?.message || null,
              method: "anon_key"
            });
          } catch (authException) {
            logWithContext("ERROR", requestId, "Exception during signin (Method 1)", {
              error: authException.message,
              stack: authException.stack?.substring(0, 200) + '...'
            });
            signInError = {
              code: 'exception',
              message: authException.message
            };
          }
          // 🔧 MÉTODO 2: Si falla con anon key, intentar con service role
          if (signInError && (signInError.code === 'invalid_credentials' || signInError.code === 'exception')) {
            logWithContext("WARN", requestId, "🔄 Method 1 failed, trying Method 2: Service Role Key", {
              originalError: signInError.message,
              originalCode: signInError.code,
              timestamp: "2025-10-18 05:22:07"
            });
            try {
              const serviceAuthClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false
                }
              });
              const result2 = await serviceAuthClient.auth.signInWithPassword({
                email: email.trim(),
                password: password
              });
              logWithContext("DEBUG", requestId, "🔍 Service role signin attempt result", {
                hasData: !!result2.data,
                hasUser: !!result2.data?.user,
                hasError: !!result2.error,
                errorCode: result2.error?.code || null,
                method: "service_role"
              });
              if (!result2.error) {
                signInData = result2.data;
                signInError = null;
                logWithContext("INFO", requestId, "✅ Service role signin successful", {
                  method: "service_role_fallback",
                  userId: result2.data?.user?.id?.substring(0, 8) + '***'
                });
              } else {
                logWithContext("ERROR", requestId, "Service role signin also failed", {
                  error: result2.error.message,
                  code: result2.error.code
                });
              }
            } catch (serviceAuthException) {
              logWithContext("ERROR", requestId, "Exception during service role signin", {
                error: serviceAuthException.message
              });
            }
          }
          // 🔧 PROCESAR RESULTADO FINAL DEL SIGNIN
          if (signInError) {
            logWithContext("ERROR", requestId, "🚨 Final signin error after all attempts", {
              error: signInError.message,
              code: signInError.code,
              timestamp: "2025-10-18 05:22:07",
              attempts: [
                'anon_key',
                'service_role'
              ]
            });
            if (signInError.message?.includes('Invalid login credentials') || signInError.code === 'invalid_credentials') {
              throw new Error("Credenciales inválidas. Verifica tu email y contraseña.");
            }
            if (signInError.message?.includes('Email not confirmed')) {
              throw new Error("Debes confirmar tu email antes de iniciar sesión");
            }
            if (signInError.message?.includes('too_many_requests')) {
              throw new Error("Demasiados intentos de login. Espera unos minutos e intenta de nuevo.");
            }
            throw new Error("Error de autenticación: " + signInError.message);
          }
          const user = signInData.user;
          if (!user) {
            logWithContext("ERROR", requestId, "No user in signin response", {
              hasData: !!signInData,
              dataKeys: signInData ? Object.keys(signInData) : []
            });
            throw new Error("Error de autenticación - no user returned");
          }
          if (!user.email_confirmed_at) {
            logWithContext("ERROR", requestId, "User email not confirmed in response", {
              userId: user.id,
              emailConfirmed: user.email_confirmed_at,
              userCreated: user.created_at
            });
            throw new Error("Debes confirmar tu email antes de iniciar sesión");
          }
          logWithContext("INFO", requestId, "✅ Signin successful - proceeding with user processing", {
            userId: user.id.substring(0, 8) + '***',
            email: user.email.substring(0, 10) + '***',
            confirmedAt: user.email_confirmed_at,
            timestamp: "2025-10-18 05:22:07"
          });
          // Obtener rol del usuario
          let userRole = 'user';
          const { data: authRoleData } = await supabase.from('auth_roles').select('role').eq('user_id', user.id).single();
          if (authRoleData) {
            userRole = authRoleData.role;
            logWithContext("INFO", requestId, "Role found in auth_roles", {
              role: userRole
            });
          } else {
            const { data: usersRoleData } = await supabase.from('users_roles').select('rol').eq('user_id', user.id).single();
            if (usersRoleData) {
              userRole = usersRoleData.rol;
              logWithContext("INFO", requestId, "Role found in users_roles", {
                rol: userRole
              });
            } else {
              userRole = user.user_metadata?.role || 'user';
              logWithContext("INFO", requestId, "Role from metadata or default", {
                role: userRole
              });
            }
          }
          // 🔧 VERIFICAR MFA DEL USUARIO
          const { hasMFA } = await checkUserMFAStatus(supabase, user.id, requestId);
          // 🔧 CREAR REGISTRO AUTH_TOKENS CON FLAGS MFA
          const { authRecord, refreshToken, tempTokenId, needsMFA } = await createAuthTokenRecord(supabase, user.id, userRole, hasMFA, requestId);
          if (needsMFA) {
            // 🚨 MFA REQUERIDO - DEVOLVER TOKEN TEMPORAL
            logWithContext("INFO", requestId, "🚨 MFA REQUIRED - Creating temporary session", {
              userId: user.id.substring(0, 8) + '***',
              tempTokenId: tempTokenId,
              loginStep: 'mfa_pending',
              timestamp: "2025-10-18 05:22:07"
            });
            const tempMFAToken = await generateTempMFAToken(user.id, user.email, userRole, tempTokenId, requestId);
            return new Response(JSON.stringify({
              success: false,
              requiresMFA: true,
              message: "🔐 Se requiere autenticación de dos factores",
              tempToken: tempMFAToken,
              user: {
                id: user.id,
                email: user.email,
                role: userRole
              },
              mfaRequired: true,
              sessionStatus: {
                loginStep: 'mfa_pending',
                mfaVerified: false,
                tempTokenId: tempTokenId
              },
              nextStep: "Proporciona tu código TOTP de 6 dígitos"
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } else {
            // ✅ LOGIN EXITOSO SIN MFA
            logWithContext("INFO", requestId, "✅ Login successful without MFA", {
              userId: user.id.substring(0, 8) + '***',
              mfaRequired: false,
              loginStep: 'completed',
              timestamp: "2025-10-18 05:22:07"
            });
            const accessToken = await generateAccessToken(user.id, userRole);
            const firstName = user.user_metadata?.first_name || '';
            const lastName = user.user_metadata?.last_name || '';
            return new Response(JSON.stringify({
              success: true,
              user: {
                id: user.id,
                email: user.email,
                role: userRole,
                name: `${firstName} ${lastName}`.trim() || user.email,
                mfaEnabled: false
              },
              accessToken,
              refreshToken: refreshToken,
              sessionStatus: {
                loginStep: 'completed',
                mfaVerified: true,
                mfaRequired: false
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          }
        }
      case "verify-mfa-login":
        {
          logWithContext("INFO", requestId, "🔐 Processing MFA verification with token flag update");
          if (!tempToken || !totpCode && !backupCode) {
            throw new Error("Token temporal y código TOTP son requeridos");
          }
          try {
            // Verificar el token temporal
            const secret = new TextEncoder().encode(JWT_SECRET);
            const { payload } = await jose.jwtVerify(tempToken, secret);
            if (!payload.temp || !payload.mfa_required || !payload.temp_token_id) {
              throw new Error("Token temporal inválido");
            }
            const userId = payload.sub;
            const email = payload.email;
            const role = payload.role;
            const tempTokenId = payload.temp_token_id;
            logWithContext("INFO", requestId, "🔑 Temp token verified, checking MFA", {
              userId: userId.substring(0, 8) + '***',
              tempTokenId: tempTokenId,
              timestamp: "2025-10-18 05:22:07"
            });
            // Verificar que el registro en auth_tokens existe y está pendiente de MFA
            const { data: authTokenData, error: authTokenError } = await supabase.from('auth_tokens').select('*').eq('temp_token_id', tempTokenId).eq('user_id', userId).single();
            if (authTokenError || !authTokenData) {
              logWithContext("ERROR", requestId, "Auth token record not found", authTokenError);
              throw new Error("Sesión temporal no válida o expirada");
            }
            if (authTokenData.mfa_verified) {
              logWithContext("WARN", requestId, "MFA already verified for this session", {
                tempTokenId: tempTokenId
              });
              throw new Error("Esta sesión ya fue verificada con MFA");
            }
            // Verificar MFA usando función mfa-totp
            const mfaVerificationResponse = await fetch(`${SUPABASE_URL}/functions/v1/mfa-totp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              },
              body: JSON.stringify({
                action: 'verify-login',
                userId: userId,
                ...totpCode && {
                  totpCode
                },
                ...backupCode && {
                  backupCode
                }
              })
            });
            const mfaResult = await mfaVerificationResponse.json();
            if (!mfaResult.success) {
              logWithContext("ERROR", requestId, "MFA verification failed", {
                error: mfaResult.error,
                tempTokenId: tempTokenId
              });
              throw new Error(mfaResult.error || "Código de verificación MFA inválido");
            }
            logWithContext("INFO", requestId, "✅ MFA verification successful", {
              userId: userId.substring(0, 8) + '***',
              method: mfaResult.data?.method || 'unknown'
            });
            // 🔧 MARCAR MFA COMO VERIFICADO EN AUTH_TOKENS
            const updatedAuthRecord = await markMFAAsVerified(supabase, tempTokenId, requestId);
            // Generar token de acceso final
            const accessToken = await generateAccessToken(userId, role);
            // Obtener datos del usuario
            const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
            if (userError || !userData.user) {
              throw new Error("Error obteniendo datos del usuario");
            }
            const firstName = userData.user.user_metadata?.first_name || '';
            const lastName = userData.user.user_metadata?.last_name || '';
            logWithContext("INFO", requestId, "🎉 MFA login completed successfully", {
              userId: userId.substring(0, 8) + '***',
              tempTokenId: tempTokenId,
              mfaMethod: mfaResult.data?.method,
              sessionCompleted: true,
              timestamp: "2025-10-18 05:22:07"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "🎉 Inicio de sesión con MFA completado exitosamente",
              user: {
                id: userId,
                email: email,
                role: role,
                name: `${firstName} ${lastName}`.trim() || email,
                mfaEnabled: true,
                mfaVerified: true
              },
              accessToken,
              refreshToken: updatedAuthRecord.refresh_token,
              sessionStatus: {
                loginStep: 'completed',
                mfaVerified: true,
                mfaRequired: true,
                verifiedAt: new Date().toISOString()
              },
              mfaData: {
                method: mfaResult.data?.method,
                verifiedAt: mfaResult.data?.verifiedAt,
                ...mfaResult.data?.warning && {
                  warning: mfaResult.data.warning
                }
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (mfaVerifyError) {
            logWithContext("ERROR", requestId, "MFA verification process error", {
              message: mfaVerifyError.message,
              timestamp: "2025-10-18 05:22:07"
            });
            if (mfaVerifyError.name === 'JWTExpired') {
              throw new Error("Token temporal expirado. Inicia sesión nuevamente.");
            }
            throw mfaVerifyError;
          }
        }
      case "refresh":
        {
          logWithContext("INFO", requestId, "🔄 Processing token refresh with MFA flag validation");
          if (!refresh_token) {
            throw new Error("Refresh token is required");
          }
          const { data: tokenData, error: tokenError } = await supabase.from('auth_tokens').select('user_id, refresh_token_expires_at, mfa_verified, mfa_required, login_step').eq('refresh_token', refresh_token).single();
          if (tokenError) {
            logWithContext("ERROR", requestId, "Invalid refresh token", tokenError);
            throw new Error("Invalid refresh token");
          }
          // Verificar que el token no haya expirado
          const now = new Date();
          const expiresAt = new Date(tokenData.refresh_token_expires_at);
          if (now > expiresAt) {
            throw new Error("Refresh token expired");
          }
          // 🔧 VERIFICAR FLAGS MFA EN EL TOKEN
          if (tokenData.mfa_required && !tokenData.mfa_verified) {
            logWithContext("WARN", requestId, "Refresh token requires MFA completion", {
              userId: tokenData.user_id.substring(0, 8) + '***',
              mfaRequired: tokenData.mfa_required,
              mfaVerified: tokenData.mfa_verified,
              loginStep: tokenData.login_step
            });
            throw new Error("Sesión incompleta: se requiere completar la verificación MFA");
          }
          if (tokenData.login_step !== 'completed') {
            throw new Error("Sesión incompleta: login no finalizado");
          }
          // Continuar con el refresh normal
          const { data: authUser, error: authUserError } = await supabase.auth.admin.getUserById(tokenData.user_id);
          if (authUserError || !authUser.user) {
            throw new Error("User not found");
          }
          const user = authUser.user;
          let userRole = 'user';
          // Obtener rol
          const { data: authRoleData } = await supabase.from('auth_roles').select('role').eq('user_id', user.id).single();
          if (authRoleData) {
            userRole = authRoleData.role;
          } else {
            const { data: usersRoleData } = await supabase.from('users_roles').select('rol').eq('user_id', user.id).single();
            userRole = usersRoleData?.rol || user.user_metadata?.role || 'user';
          }
          const accessToken = await generateAccessToken(user.id, userRole);
          const refreshTokenCustom = await generateRefreshToken(user.id);
          logWithContext("INFO", requestId, "✅ Token refreshed successfully", {
            userId: user.id.substring(0, 8) + '***',
            mfaVerified: tokenData.mfa_verified,
            timestamp: "2025-10-18 05:22:07"
          });
          const firstName = user.user_metadata?.first_name || '';
          const lastName = user.user_metadata?.last_name || '';
          return new Response(JSON.stringify({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              role: userRole,
              name: `${firstName} ${lastName}`.trim() || user.email,
              mfaEnabled: tokenData.mfa_required
            },
            accessToken,
            refreshToken: refreshTokenCustom,
            sessionStatus: {
              loginStep: tokenData.login_step,
              mfaVerified: tokenData.mfa_verified,
              mfaRequired: tokenData.mfa_required
            }
          }), {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
      case "resend-verification":
        {
          logWithContext("INFO", requestId, "🔄 Resending verification email using Resend");
          if (!email) {
            throw new Error("Email is required");
          }
          try {
            const { user, error: searchError } = await findUserByEmail(supabase, email, requestId);
            if (searchError || !user) {
              logWithContext("ERROR", requestId, "User not found for resend", searchError);
              throw new Error("Usuario no encontrado");
            }
            if (user.email_confirmed_at) {
              throw new Error("Email ya verificado");
            }
            const userMetadata = user.user_metadata || {};
            const firstName = userMetadata.first_name || '';
            const lastName = userMetadata.last_name || '';
            // 🔧 GENERAR NUEVO LINK DE CONFIRMACIÓN USANDO ADMIN
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'signup',
              email: email,
              options: {
                redirectTo: 'https://app.evently.blog/auth/callback'
              }
            });
            let newConfirmationUrl;
            if (linkError) {
              logWithContext("ERROR", requestId, "Error generating new confirmation link", linkError);
              // Fallback a URL manual
              newConfirmationUrl = `${SUPABASE_URL}/auth/v1/verify?token=${user.id}&type=signup&redirect_to=${encodeURIComponent('https://app.evently.blog/auth/callback')}`;
            } else {
              newConfirmationUrl = linkData.properties.action_link;
            }
            // Enviar nuevo email con Resend
            await sendWelcomeEmailWithLink(email, firstName, lastName, newConfirmationUrl, requestId);
            logWithContext("INFO", requestId, "✅ Verification email resent successfully using Resend", {
              to: email,
              method: "resend_api",
              template: "custom_confirmation_link",
              timestamp: "2025-10-18 05:22:07"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "Nuevo enlace de confirmación enviado a tu email"
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (resendError) {
            logWithContext("ERROR", requestId, "Resend failed", resendError);
            throw new Error("Error reenviando email de confirmación");
          }
        }
      default:
        logWithContext("ERROR", requestId, `Invalid action: ${action}`);
        throw new Error(`Invalid action: ${action}`);
    }
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Final error handler", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      user: "IvaninaCapuchina",
      timestamp: "2025-10-18 05:22:07"
    });
    return new Response(JSON.stringify({
      error: error.message || "Server error",
      timestamp: new Date().toISOString(),
      requestId
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
// Helper functions
async function generateAccessToken(userId, role, aal = 'aal1') {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const jwt = await new jose.SignJWT({
    sub: userId,
    role: role,
    aal: aal,
    iat: Math.floor(Date.now() / 1000),
    iss: 'evently-auth',
    aud: 'evently-app'
  }).setProtectedHeader({
    alg: 'HS256'
  }).setIssuedAt().setExpirationTime(ACCESS_TOKEN_EXPIRES_IN).sign(secret);
  return jwt;
}
async function generateRefreshToken(userId) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const refreshToken = Array.from(tokenBytes).map((b)=>b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
  await supabase.from('auth_tokens').delete().eq('user_id', userId);
  const { error } = await supabase.from('auth_tokens').insert({
    user_id: userId,
    refresh_token: refreshToken,
    refresh_token_expires_at: expiresAt.toISOString(),
    mfa_verified: true,
    mfa_required: false,
    login_step: 'completed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (error) {
    throw new Error(`Error saving refresh token: ${error.message}`);
  }
  return refreshToken;
}
