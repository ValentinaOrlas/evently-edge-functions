// 🔧 EDGE FUNCTION - MFA TOTP (Google Authenticator)
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-09-05 06:33:48
// Current User's Login: IvaninaCapuchina
// MFA con Google Authenticator usando TOTP
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base32Encode } from "https://deno.land/std@0.177.0/encoding/base32.ts";
// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
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
// 🔧 TOTP Implementation
class TOTPGenerator {
  static async generateSecret(length = 20) {
    const buffer = new Uint8Array(length);
    crypto.getRandomValues(buffer);
    return base32Encode(buffer).replace(/=/g, '');
  }
  static async generateTOTP(secret, time = Date.now(), window = 30000) {
    const timeStep = Math.floor(time / window);
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, timeStep, false);
    const secretBuffer = this.base32Decode(secret);
    const key = await crypto.subtle.importKey('raw', secretBuffer, {
      name: 'HMAC',
      hash: 'SHA-1'
    }, false, [
      'sign'
    ]);
    const signature = await crypto.subtle.sign('HMAC', key, timeBuffer);
    const signatureArray = new Uint8Array(signature);
    const offset = signatureArray[signatureArray.length - 1] & 0x0f;
    const code = ((signatureArray[offset] & 0x7f) << 24 | (signatureArray[offset + 1] & 0xff) << 16 | (signatureArray[offset + 2] & 0xff) << 8 | signatureArray[offset + 3] & 0xff) % 1000000;
    return code.toString().padStart(6, '0');
  }
  static async verifyTOTP(secret, token, window = 1) {
    const currentTime = Date.now();
    const timeWindow = 30000; // 30 seconds
    for(let i = -window; i <= window; i++){
      const timeToCheck = currentTime + i * timeWindow;
      const expectedToken = await this.generateTOTP(secret, timeToCheck, timeWindow);
      if (expectedToken === token) {
        return true;
      }
    }
    return false;
  }
  static base32Decode(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for(let i = 0; i < base32.length; i++){
      const char = base32[i].toUpperCase();
      const value = alphabet.indexOf(char);
      if (value === -1) continue;
      bits += value.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for(let i = 0; i < bits.length; i += 8){
      const byte = bits.slice(i, i + 8);
      if (byte.length === 8) {
        bytes.push(parseInt(byte, 2));
      }
    }
    return new Uint8Array(bytes);
  }
  static generateQRCodeURL(secret, email, issuer = 'Evently') {
    const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
  }
}
// 🔧 Database functions
async function getUserMFASettings(supabase, userId, requestId) {
  logWithContext("INFO", requestId, "🔍 Getting user MFA settings", {
    userId
  });
  const { data, error } = await supabase.from('user_mfa_settings').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') {
    logWithContext("ERROR", requestId, "Error getting MFA settings", error);
    throw error;
  }
  return data;
}
async function saveMFASettings(supabase, userId, secret, backupCodes, requestId) {
  logWithContext("INFO", requestId, "💾 Saving MFA settings", {
    userId
  });
  const { data, error } = await supabase.from('user_mfa_settings').upsert({
    user_id: userId,
    totp_secret: secret,
    backup_codes: backupCodes,
    enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id'
  }).select().single();
  if (error) {
    logWithContext("ERROR", requestId, "Error saving MFA settings", error);
    throw error;
  }
  return data;
}
async function enableMFA(supabase, userId, requestId) {
  logWithContext("INFO", requestId, "✅ Enabling MFA for user", {
    userId
  });
  const { data, error } = await supabase.from('user_mfa_settings').update({
    enabled: true,
    updated_at: new Date().toISOString()
  }).eq('user_id', userId).select().single();
  if (error) {
    logWithContext("ERROR", requestId, "Error enabling MFA", error);
    throw error;
  }
  return data;
}
async function disableMFA(supabase, userId, requestId) {
  logWithContext("INFO", requestId, "❌ Disabling MFA for user", {
    userId
  });
  const { data, error } = await supabase.from('user_mfa_settings').update({
    enabled: false,
    updated_at: new Date().toISOString()
  }).eq('user_id', userId).select().single();
  if (error) {
    logWithContext("ERROR", requestId, "Error disabling MFA", error);
    throw error;
  }
  return data;
}
// 🔧 Generate backup codes
function generateBackupCodes(count = 10) {
  const codes = [];
  for(let i = 0; i < count; i++){
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    codes.push(code);
  }
  return codes;
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
    logWithContext("INFO", requestId, "⭐️ Starting MFA TOTP function - Current Time: 2025-09-05 06:33:48 - User: IvaninaCapuchina");
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
    // Parse request body
    let requestBody;
    try {
      const rawBody = await req.text();
      requestBody = JSON.parse(rawBody);
      logWithContext("INFO", requestId, "Request body parsed", {
        action: requestBody.action,
        hasUserId: !!requestBody.userId,
        hasEmail: !!requestBody.email
      });
    } catch (parseError) {
      logWithContext("ERROR", requestId, "Failed to parse request body", parseError);
      throw new Error("Invalid JSON in request body");
    }
    const { action, userId, email, totpCode, backupCode } = requestBody;
    logWithContext("INFO", requestId, `🔄 Processing MFA action: ${action}`, {
      userId: userId?.substring(0, 8) + '***' || 'not provided',
      timestamp: "2025-09-05 06:33:48"
    });
    switch(action){
      case "setup-mfa":
        {
          logWithContext("INFO", requestId, "🔄 Setting up MFA for user");
          if (!userId || !email) {
            throw new Error("User ID and email are required");
          }
          try {
            // Generate secret and backup codes
            const secret = await TOTPGenerator.generateSecret();
            const backupCodes = generateBackupCodes();
            // Save to database
            const mfaSettings = await saveMFASettings(supabase, userId, secret, backupCodes, requestId);
            // Generate QR code URL
            const qrCodeURL = TOTPGenerator.generateQRCodeURL(secret, email, 'Evently');
            logWithContext("INFO", requestId, "✅ MFA setup completed", {
              userId: userId.substring(0, 8) + '***',
              email: email.substring(0, 10) + '***',
              qrGenerated: true,
              backupCodesCount: backupCodes.length,
              timestamp: "2025-09-05 06:33:48"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "MFA configurado exitosamente. Escanea el código QR con Google Authenticator.",
              data: {
                secret: secret,
                qrCodeURL: qrCodeURL,
                backupCodes: backupCodes,
                setupComplete: true,
                enabled: false // Still needs verification to enable
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (setupError) {
            logWithContext("ERROR", requestId, "MFA setup error", setupError);
            throw new Error("Error configurando MFA");
          }
        }
      case "verify-setup":
        {
          logWithContext("INFO", requestId, "🔄 Verifying MFA setup");
          if (!userId || !totpCode) {
            throw new Error("User ID and TOTP code are required");
          }
          try {
            // Get user's MFA settings
            const mfaSettings = await getUserMFASettings(supabase, userId, requestId);
            if (!mfaSettings || !mfaSettings.totp_secret) {
              throw new Error("MFA no está configurado para este usuario");
            }
            // Verify TOTP code
            const isValidCode = await TOTPGenerator.verifyTOTP(mfaSettings.totp_secret, totpCode);
            if (!isValidCode) {
              logWithContext("ERROR", requestId, "Invalid TOTP code provided", {
                userId: userId.substring(0, 8) + '***',
                providedCode: totpCode
              });
              throw new Error("Código TOTP inválido");
            }
            // Enable MFA
            await enableMFA(supabase, userId, requestId);
            logWithContext("INFO", requestId, "✅ MFA verification and enablement completed", {
              userId: userId.substring(0, 8) + '***',
              enabled: true,
              timestamp: "2025-09-05 06:33:48"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "MFA verificado y habilitado exitosamente. Tu cuenta ahora está protegida con autenticación de dos factores.",
              data: {
                enabled: true,
                verifiedAt: new Date().toISOString()
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (verifyError) {
            logWithContext("ERROR", requestId, "MFA verification error", verifyError);
            throw verifyError;
          }
        }
      case "verify-login":
        {
          logWithContext("INFO", requestId, "🔄 Verifying MFA for login");
          if (!userId || !totpCode && !backupCode) {
            throw new Error("User ID and TOTP code or backup code are required");
          }
          try {
            // Get user's MFA settings
            const mfaSettings = await getUserMFASettings(supabase, userId, requestId);
            if (!mfaSettings || !mfaSettings.enabled) {
              throw new Error("MFA no está habilitado para este usuario");
            }
            let isValid = false;
            let usedBackupCode = false;
            if (totpCode) {
              // Verify TOTP code
              isValid = await TOTPGenerator.verifyTOTP(mfaSettings.totp_secret, totpCode);
              logWithContext("INFO", requestId, "TOTP verification result", {
                userId: userId.substring(0, 8) + '***',
                isValid,
                method: "totp"
              });
            } else if (backupCode) {
              // Verify backup code
              const backupCodes = mfaSettings.backup_codes || [];
              isValid = backupCodes.includes(backupCode.toUpperCase());
              if (isValid) {
                // Remove used backup code
                const updatedCodes = backupCodes.filter((code)=>code !== backupCode.toUpperCase());
                await supabase.from('user_mfa_settings').update({
                  backup_codes: updatedCodes,
                  updated_at: new Date().toISOString()
                }).eq('user_id', userId);
                usedBackupCode = true;
                logWithContext("INFO", requestId, "Backup code used and removed", {
                  userId: userId.substring(0, 8) + '***',
                  remainingCodes: updatedCodes.length
                });
              }
            }
            if (!isValid) {
              logWithContext("ERROR", requestId, "Invalid MFA code provided", {
                userId: userId.substring(0, 8) + '***',
                method: totpCode ? "totp" : "backup"
              });
              throw new Error("Código de verificación inválido");
            }
            logWithContext("INFO", requestId, "✅ MFA login verification successful", {
              userId: userId.substring(0, 8) + '***',
              method: usedBackupCode ? "backup_code" : "totp",
              timestamp: "2025-09-05 06:33:48"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "Verificación MFA exitosa. Acceso autorizado.",
              data: {
                verified: true,
                method: usedBackupCode ? "backup_code" : "totp",
                verifiedAt: new Date().toISOString(),
                ...usedBackupCode && {
                  warning: "Has usado un código de respaldo. Considera generar nuevos códigos."
                }
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (loginVerifyError) {
            logWithContext("ERROR", requestId, "MFA login verification error", loginVerifyError);
            throw loginVerifyError;
          }
        }
      case "disable-mfa":
        {
          logWithContext("INFO", requestId, "🔄 Disabling MFA for user");
          if (!userId || !totpCode) {
            throw new Error("User ID and current TOTP code are required to disable MFA");
          }
          try {
            // Get user's MFA settings
            const mfaSettings = await getUserMFASettings(supabase, userId, requestId);
            if (!mfaSettings || !mfaSettings.enabled) {
              throw new Error("MFA no está habilitado para este usuario");
            }
            // Verify current TOTP code before disabling
            const isValidCode = await TOTPGenerator.verifyTOTP(mfaSettings.totp_secret, totpCode);
            if (!isValidCode) {
              logWithContext("ERROR", requestId, "Invalid TOTP code for MFA disable", {
                userId: userId.substring(0, 8) + '***'
              });
              throw new Error("Código TOTP inválido. Se requiere verificación para desactivar MFA.");
            }
            // Disable MFA
            await disableMFA(supabase, userId, requestId);
            logWithContext("INFO", requestId, "✅ MFA disabled successfully", {
              userId: userId.substring(0, 8) + '***',
              timestamp: "2025-09-05 06:33:48"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "MFA deshabilitado exitosamente. Tu cuenta ya no requiere autenticación de dos factores.",
              data: {
                enabled: false,
                disabledAt: new Date().toISOString()
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (disableError) {
            logWithContext("ERROR", requestId, "MFA disable error", disableError);
            throw disableError;
          }
        }
      case "get-status":
        {
          logWithContext("INFO", requestId, "🔄 Getting MFA status for user");
          if (!userId) {
            throw new Error("User ID is required");
          }
          try {
            const mfaSettings = await getUserMFASettings(supabase, userId, requestId);
            const status = {
              configured: !!mfaSettings,
              enabled: mfaSettings?.enabled || false,
              backupCodesCount: mfaSettings?.backup_codes?.length || 0,
              lastUpdated: mfaSettings?.updated_at
            };
            logWithContext("INFO", requestId, "✅ MFA status retrieved", {
              userId: userId.substring(0, 8) + '***',
              configured: status.configured,
              enabled: status.enabled,
              timestamp: "2025-09-05 06:33:48"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "Estado MFA obtenido exitosamente",
              data: status
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (statusError) {
            logWithContext("ERROR", requestId, "Error getting MFA status", statusError);
            throw statusError;
          }
        }
      case "generate-backup-codes":
        {
          logWithContext("INFO", requestId, "🔄 Generating new backup codes");
          if (!userId || !totpCode) {
            throw new Error("User ID and current TOTP code are required");
          }
          try {
            // Get user's MFA settings
            const mfaSettings = await getUserMFASettings(supabase, userId, requestId);
            if (!mfaSettings || !mfaSettings.enabled) {
              throw new Error("MFA no está habilitado para este usuario");
            }
            // Verify current TOTP code
            const isValidCode = await TOTPGenerator.verifyTOTP(mfaSettings.totp_secret, totpCode);
            if (!isValidCode) {
              throw new Error("Código TOTP inválido");
            }
            // Generate new backup codes
            const newBackupCodes = generateBackupCodes();
            // Update database
            await supabase.from('user_mfa_settings').update({
              backup_codes: newBackupCodes,
              updated_at: new Date().toISOString()
            }).eq('user_id', userId);
            logWithContext("INFO", requestId, "✅ New backup codes generated", {
              userId: userId.substring(0, 8) + '***',
              codesCount: newBackupCodes.length,
              timestamp: "2025-09-05 06:33:48"
            });
            return new Response(JSON.stringify({
              success: true,
              message: "Nuevos códigos de respaldo generados exitosamente. Guárdalos en un lugar seguro.",
              data: {
                backupCodes: newBackupCodes,
                generatedAt: new Date().toISOString(),
                warning: "Los códigos anteriores han sido invalidados. Usa estos nuevos códigos."
              }
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
              }
            });
          } catch (backupError) {
            logWithContext("ERROR", requestId, "Error generating backup codes", backupError);
            throw backupError;
          }
        }
      default:
        logWithContext("ERROR", requestId, `Invalid MFA action: ${action}`);
        throw new Error(`Acción MFA inválida: ${action}`);
    }
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Final MFA error handler", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      user: "IvaninaCapuchina",
      timestamp: "2025-09-05 06:33:48"
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
