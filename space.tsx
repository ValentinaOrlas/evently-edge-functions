// 🔧 EDGE FUNCTION - SPACES CRUD CON JWT PERSONALIZADO
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-09-06 06:24:17
// Current User's Login: IvaninaCapuchina
// Sistema completo usando nuestra lógica de generación de tokens
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://esm.sh/jose@4.14.4";
// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || "";
const JWT_SECRET = Deno.env.get('JWT_SECRET') || "your_secure_jwt_secret_change_in_production";
// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
// 🔧 HELPER: Verificar y decodificar nuestro JWT personalizado
async function verifyCustomJWT(token, requestId) {
  try {
    logWithContext("INFO", requestId, "🔑 Verifying custom JWT token");
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    // Verificar que el token no sea temporal (MFA)
    if (payload.temp || payload.mfa_required) {
      throw new Error("Token temporal no válido para esta operación");
    }
    // Verificar campos requeridos
    if (!payload.sub || !payload.role) {
      throw new Error("Token inválido: faltan campos requeridos");
    }
    logWithContext("INFO", requestId, "✅ Custom JWT verified successfully", {
      userId: payload.sub.substring(0, 8) + '***',
      role: payload.role,
      iss: payload.iss,
      aud: payload.aud
    });
    return {
      userId: payload.sub,
      userRole: payload.role,
      payload,
      error: null
    };
  } catch (jwtError) {
    logWithContext("ERROR", requestId, "❌ JWT verification failed", {
      error: jwtError.message,
      tokenPrefix: token ? token.substring(0, 20) + '***' : 'no token'
    });
    return {
      userId: null,
      userRole: null,
      payload: null,
      error: jwtError
    };
  }
}
// 🔧 HELPER: Verificar que el usuario existe en auth_tokens (sesión activa)
async function verifyActiveSession(supabase, userId, requestId) {
  try {
    logWithContext("INFO", requestId, "🔍 Verifying active session", {
      userId: userId.substring(0, 8) + '***'
    });
    const { data: tokenData, error: tokenError } = await supabase.from('auth_tokens').select('user_id, mfa_verified, mfa_required, login_step').eq('user_id', userId).eq('login_step', 'completed') // Solo sesiones completadas
    .eq('mfa_verified', true) // Solo sesiones con MFA verificado (si aplica)
    .single();
    if (tokenError) {
      if (tokenError.code === 'PGRST116') {
        throw new Error("Sesión no encontrada o expirada");
      }
      throw tokenError;
    }
    logWithContext("INFO", requestId, "✅ Active session verified", {
      userId: userId.substring(0, 8) + '***',
      mfaVerified: tokenData.mfa_verified,
      loginStep: tokenData.login_step
    });
    return {
      valid: true,
      error: null
    };
  } catch (sessionError) {
    logWithContext("ERROR", requestId, "❌ Session verification failed", {
      userId: userId.substring(0, 8) + '***',
      error: sessionError.message
    });
    return {
      valid: false,
      error: sessionError
    };
  }
}
// 🔧 HELPER: Verificar rol del usuario (mantenemos por compatibilidad)
async function checkUserRole(supabase, userId, requestId) {
  try {
    const { data: roleData, error } = await supabase.from('auth_roles').select('role').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') {
      logWithContext("ERROR", requestId, "Error checking user role", error);
      return {
        role: 'user',
        error
      };
    }
    const role = roleData?.role || 'user';
    logWithContext("INFO", requestId, "✅ User role checked", {
      userId: userId.substring(0, 8) + '***',
      role: role
    });
    return {
      role,
      error: null
    };
  } catch (roleError) {
    logWithContext("ERROR", requestId, "Exception checking user role", roleError);
    return {
      role: 'user',
      error: roleError
    };
  }
}
// 🔧 HELPER: Validar que el usuario sea owner o admin
function validateOwnerOrAdmin(userRole, ownerId, userId, action) {
  const isOwner = ownerId === userId;
  const isAdmin = [
    'admin',
    'superadmin'
  ].includes(userRole);
  if (!isOwner && !isAdmin) {
    throw new Error(`No tienes permisos para ${action} este espacio`);
  }
  return {
    isOwner,
    isAdmin
  };
}
// 🔧 HELPER: Obtener información del owner
async function getOwnerInfo(supabase, ownerId, requestId) {
  if (!ownerId) {
    return {
      name: 'Usuario desconocido',
      email: 'No disponible'
    };
  }
  try {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ownerId);
    if (userError || !userData.user) {
      logWithContext("WARN", requestId, "Could not fetch owner info", {
        ownerId: ownerId.substring(0, 8) + '***',
        error: userError?.message
      });
      return {
        name: 'Usuario no encontrado',
        email: 'No disponible'
      };
    }
    const user = userData.user;
    const firstName = user.user_metadata?.first_name || '';
    const lastName = user.user_metadata?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim() || user.email || 'Usuario';
    return {
      name: fullName,
      email: user.email || 'No disponible',
      firstName,
      lastName
    };
  } catch (ownerError) {
    logWithContext("ERROR", requestId, "Exception getting owner info", ownerError);
    return {
      name: 'Error al cargar',
      email: 'No disponible'
    };
  }
}
// 🔧 HELPER: Obtener espacio completo con amenidades y fotos
async function getCompleteSpace(supabase, spaceId, requestId) {
  try {
    // Obtener datos básicos del espacio
    const { data: space, error: spaceError } = await supabase.from('spaces').select('*').eq('id_space', spaceId).single();
    if (spaceError) {
      throw spaceError;
    }
    // Obtener amenidades usando función SQL
    const { data: amenitiesResult, error: amenitiesError } = await supabase.rpc('get_space_amenities', {
      space_id_param: spaceId
    });
    // Obtener fotos usando función SQL
    const { data: photosResult, error: photosError } = await supabase.rpc('get_space_photos', {
      space_id_param: spaceId
    });
    // Obtener ratings usando funciones SQL
    const { data: averageRating, error: ratingError } = await supabase.rpc('get_space_average_rating', {
      space_id_param: spaceId
    });
    const { data: reviewCount, error: reviewCountError } = await supabase.rpc('get_space_review_count', {
      space_id_param: spaceId
    });
    // Formatear precio
    const { data: formattedPrice, error: priceError } = await supabase.rpc('format_cop_price', {
      amount: space.price_per_hour_cop
    });
    // Obtener información del owner
    const ownerInfo = await getOwnerInfo(supabase, space.owner_id, requestId);
    // Construir objeto completo
    const completeSpace = {
      ...space,
      amenities: amenitiesResult || [],
      photos: photosResult || [],
      average_rating: averageRating || 0,
      review_count: reviewCount || 0,
      formatted_price_cop: formattedPrice || 'Precio no disponible',
      is_published: space.status === 'approved',
      owner_name: ownerInfo.name,
      owner_email: ownerInfo.email,
      owner_first_name: ownerInfo.firstName,
      owner_last_name: ownerInfo.lastName
    };
    logWithContext("INFO", requestId, "✅ Complete space assembled", {
      spaceId,
      spaceName: space.space_name,
      amenitiesCount: (amenitiesResult || []).length,
      photosCount: (photosResult || []).length,
      ownerName: ownerInfo.name
    });
    return completeSpace;
  } catch (error) {
    logWithContext("ERROR", requestId, "Error getting complete space", {
      spaceId,
      error: error.message
    });
    throw error;
  }
}
// 🔧 HELPER: Procesar amenidades
async function processSpaceAmenities(supabase, spaceId, amenities, requestId) {
  if (!amenities || !Array.isArray(amenities)) {
    logWithContext("INFO", requestId, "No amenities provided", {
      spaceId
    });
    return;
  }
  logWithContext("INFO", requestId, "🔧 Processing space amenities", {
    spaceId,
    amenitiesCount: amenities.length
  });
  // Eliminar amenidades existentes
  const { error: deleteError } = await supabase.from('space_amenities').delete().eq('space_id', spaceId);
  if (deleteError) {
    logWithContext("ERROR", requestId, "Error deleting existing amenities", deleteError);
    throw deleteError;
  }
  // Obtener amenidades predefinidas
  const { data: predefinedAmenities, error: predefinedError } = await supabase.from('predefined_amenities').select('name').eq('is_active', true);
  if (predefinedError) {
    logWithContext("ERROR", requestId, "Error fetching predefined amenities", predefinedError);
    throw predefinedError;
  }
  const predefinedNames = new Set(predefinedAmenities.map((a)=>a.name));
  // Procesar amenidades
  const amenityRecords = amenities.map((amenity)=>{
    const amenityName = typeof amenity === 'string' ? amenity : amenity.name || String(amenity);
    const isPredefined = predefinedNames.has(amenityName);
    return {
      space_id: spaceId,
      amenity_name: amenityName,
      is_predefined: isPredefined
    };
  });
  // Filtrar duplicados
  const uniqueAmenities = amenityRecords.filter((amenity, index, self)=>index === self.findIndex((a)=>a.amenity_name === amenity.amenity_name));
  // Insertar amenidades
  if (uniqueAmenities.length > 0) {
    const { error: amenitiesError } = await supabase.from('space_amenities').insert(uniqueAmenities);
    if (amenitiesError) {
      logWithContext("ERROR", requestId, "Error inserting amenities", amenitiesError);
      throw amenitiesError;
    }
  }
  logWithContext("INFO", requestId, "✅ Amenities processed successfully", {
    spaceId,
    processedCount: uniqueAmenities.length
  });
}
// 🔧 HELPER: Procesar fotos
async function processSpacePhotos(supabase, spaceId, photosData, requestId) {
  if (!photosData || !Array.isArray(photosData) || photosData.length === 0) {
    logWithContext("INFO", requestId, "No photos provided", {
      spaceId
    });
    return [];
  }
  logWithContext("INFO", requestId, "📸 Processing space photos", {
    spaceId,
    photosCount: photosData.length
  });
  const photoRecords = [];
  for(let i = 0; i < photosData.length; i++){
    const photo = photosData[i];
    // Si ya es una URL
    if (typeof photo === 'string' && photo.startsWith('http')) {
      photoRecords.push({
        space_id: spaceId,
        photo_url: photo,
        is_primary: i === 0,
        upload_order: i,
        created_at: new Date().toISOString()
      });
      continue;
    }
    // Si es un objeto con datos de archivo
    if (typeof photo === 'object' && photo.data && photo.name) {
      try {
        // Convertir base64 a Uint8Array
        let fileData;
        if (photo.data.startsWith('data:')) {
          const base64Data = photo.data.split(',')[1];
          fileData = Uint8Array.from(atob(base64Data), (c)=>c.charCodeAt(0));
        } else {
          fileData = new Uint8Array(photo.data);
        }
        // Subir al storage
        const fileExt = photo.name.split('.').pop() || 'jpg';
        const uniqueFileName = `space-${spaceId}/${Date.now()}-${i}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('spaces').upload(uniqueFileName, fileData, {
          contentType: photo.type || `image/${fileExt}`,
          cacheControl: '3600',
          upsert: false
        });
        if (uploadError) {
          logWithContext("ERROR", requestId, `Error uploading photo ${i}`, uploadError);
          continue;
        }
        // Obtener URL pública
        const { data: publicUrlData } = supabase.storage.from('spaces').getPublicUrl(uploadData.path);
        photoRecords.push({
          space_id: spaceId,
          photo_url: publicUrlData.publicUrl,
          is_primary: i === 0,
          upload_order: i,
          file_size: fileData.length,
          mime_type: photo.type || `image/${fileExt}`,
          created_at: new Date().toISOString()
        });
        logWithContext("INFO", requestId, `✅ Photo ${i} uploaded successfully`, {
          fileName: uniqueFileName
        });
      } catch (photoError) {
        logWithContext("ERROR", requestId, `Error processing photo ${i}`, {
          error: photoError.message,
          photoName: photo.name
        });
        continue;
      }
    }
  }
  // Insertar registros de fotos
  if (photoRecords.length > 0) {
    const { error: photosError } = await supabase.from('space_photos').insert(photoRecords);
    if (photosError) {
      logWithContext("ERROR", requestId, "Error inserting photo records", photosError);
      throw photosError;
    }
  }
  logWithContext("INFO", requestId, "✅ Photos processed successfully", {
    spaceId,
    processedCount: photoRecords.length
  });
  return photoRecords;
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
    logWithContext("INFO", requestId, "⭐️ Starting spaces CRUD function with custom JWT - Current Time: 2025-09-06 06:24:17 - User: IvaninaCapuchina");
    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // 🔧 VALIDACIÓN DE TOKEN PERSONALIZADO
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Token de autorización requerido");
    }
    const token = authHeader.replace('Bearer ', '');
    // Verificar nuestro JWT personalizado
    const { userId, userRole, payload, error: jwtError } = await verifyCustomJWT(token, requestId);
    if (jwtError || !userId || !userRole) {
      throw new Error("Token inválido o expirado. Por favor inicia sesión nuevamente.");
    }
    // Verificar sesión activa en auth_tokens
    const { valid: sessionValid, error: sessionError } = await verifyActiveSession(supabase, userId, requestId);
    if (!sessionValid) {
      throw new Error(sessionError?.message || "Sesión inválida o expirada. Por favor inicia sesión nuevamente.");
    }
    // 🔧 OPCIONAL: Verificar rol desde base de datos (doble validación)
    const { role: dbRole } = await checkUserRole(supabase, userId, requestId);
    // Usar el rol del JWT (más confiable) pero logar si hay diferencia
    if (dbRole !== userRole) {
      logWithContext("WARN", requestId, "Role mismatch between JWT and database", {
        jwtRole: userRole,
        dbRole: dbRole,
        userId: userId.substring(0, 8) + '***'
      });
    }
    logWithContext("INFO", requestId, "🔑 Custom JWT authentication successful", {
      userId: userId.substring(0, 8) + '***',
      userRole: userRole,
      tokenIssuer: payload.iss,
      tokenAudience: payload.aud
    });
    // Parse URL to get action and space ID
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = pathParts[pathParts.length - 1] || req.method.toLowerCase();
    const spaceId = pathParts[pathParts.length - 2];
    logWithContext("INFO", requestId, "🔄 Processing request", {
      method: req.method,
      action: action,
      spaceId: spaceId || 'none',
      path: url.pathname
    });
    // Parse request body for POST/PUT requests
    let requestBody = null;
    if ([
      'POST',
      'PUT',
      'PATCH'
    ].includes(req.method)) {
      try {
        const rawBody = await req.text();
        if (rawBody) {
          requestBody = JSON.parse(rawBody);
          logWithContext("INFO", requestId, "Request body parsed", {
            hasSpaceName: !!requestBody.spaceName,
            hasAmenities: !!requestBody.amenities,
            amenitiesCount: requestBody.amenities?.length || 0,
            hasPhotos: !!requestBody.photos,
            photosCount: requestBody.photos?.length || 0
          });
        }
      } catch (parseError) {
        logWithContext("ERROR", requestId, "Failed to parse request body", parseError);
        throw new Error("Invalid JSON in request body");
      }
    }
    // Route handling
    switch(req.method){
      case 'GET':
        return await handleGetSpaces(supabase, url, userId, userRole, requestId);
      case 'POST':
        return await handleCreateSpace(supabase, requestBody, userId, userRole, requestId);
      case 'PUT':
      case 'PATCH':
        return await handleUpdateSpace(supabase, spaceId, requestBody, userId, userRole, requestId);
      case 'DELETE':
        return await handleDeleteSpace(supabase, spaceId, userId, userRole, requestId);
      default:
        throw new Error(`Método ${req.method} no soportado`);
    }
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Final error handler", {
      message: error.message,
      stack: error.stack,
      user: "IvaninaCapuchina",
      timestamp: "2025-09-06 06:24:17"
    });
    // Determinar el código de estado basado en el tipo de error
    let statusCode = 400;
    if (error.message.includes('Token inválido') || error.message.includes('Sesión inválida') || error.message.includes('autorización requerido') || error.message.includes('inicia sesión')) {
      statusCode = 401; // Unauthorized
    } else if (error.message.includes('No tienes permisos')) {
      statusCode = 403; // Forbidden
    } else if (error.message.includes('no encontrado') || error.message.includes('not found')) {
      statusCode = 404; // Not Found
    }
    return new Response(JSON.stringify({
      error: error.message || "Server error",
      timestamp: new Date().toISOString(),
      requestId,
      requiresAuth: statusCode === 401
    }), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
async function handleGetSpaces(supabase, url, userId, userRole, requestId) {
  const searchParams = url.searchParams;
  const spaceId = searchParams.get('id');
  const status = searchParams.get('status');
  const ownerId = searchParams.get('owner_id');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const offset = (page - 1) * limit;
  logWithContext("INFO", requestId, "🔍 Getting spaces with FIXED owner permissions", {
    spaceId: spaceId || 'all',
    status: status || 'any',
    ownerId: ownerId || 'any',
    requestingUserId: userId.substring(0, 8) + '***',
    userRole: userRole,
    page,
    limit,
    timestamp: "2025-09-06 06:46:01"
  });
  try {
    // Si es un espacio específico
    if (spaceId) {
      const completeSpace = await getCompleteSpace(supabase, parseInt(spaceId), requestId);
      // Verificar permisos para espacio individual
      const isOwner = completeSpace.owner_id === userId;
      const isAdmin = [
        'admin',
        'superadmin'
      ].includes(userRole);
      const isApproved = completeSpace.status === 'approved';
      if (!isApproved && !isOwner && !isAdmin) {
        throw new Error("No tienes permisos para ver este espacio");
      }
      return new Response(JSON.stringify({
        success: true,
        data: completeSpace
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // 🔧 PROBLEMA IDENTIFICADO: Lista de espacios con lógica incorrecta
    let query = supabase.from('spaces').select('*', {
      count: 'exact'
    });
    const isAdmin = [
      'admin',
      'superadmin'
    ].includes(userRole);
    logWithContext("DEBUG", requestId, "📊 Query building logic", {
      isAdmin,
      userRole,
      userId: userId.substring(0, 8) + '***',
      statusFilter: status || 'none',
      ownerIdFilter: ownerId || 'none',
      queryParams: {
        status,
        ownerId,
        noFilters: !status && !ownerId
      }
    });
    if (isAdmin) {
      // 🔧 ADMIN: Ve todo, aplicar filtros si se proporcionan
      logWithContext("INFO", requestId, "👑 Admin access - applying optional filters", {
        statusFilter: status || 'none',
        ownerIdFilter: ownerId || 'none'
      });
      if (status) {
        query = query.eq('status', status);
      }
      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      }
    } else {
      // 🔧 USUARIO NO ADMIN: Aplicar lógica de permisos
      if (ownerId && ownerId === userId) {
        // 🔧 CASO 1: Owner viendo explícitamente sus espacios (owner_id=userId)
        logWithContext("INFO", requestId, "🏠 Owner explicitly viewing their spaces", {
          userId: userId.substring(0, 8) + '***',
          statusFilter: status || 'all statuses allowed'
        });
        query = query.eq('owner_id', userId);
        // Aplicar filtro de status si se proporciona
        if (status) {
          query = query.eq('status', status);
          logWithContext("INFO", requestId, "📋 Applied status filter to owner's spaces", {
            status
          });
        }
      } else if (ownerId && ownerId !== userId) {
        // 🔧 CASO 2: Usuario viendo espacios de otro owner (solo aprobados)
        logWithContext("INFO", requestId, "👀 User viewing another owner's approved spaces", {
          requestedOwnerId: ownerId.substring(0, 8) + '***',
          userId: userId.substring(0, 8) + '***'
        });
        query = query.eq('owner_id', ownerId);
        query = query.eq('status', 'approved'); // Forzar solo aprobados
      } else if (!ownerId && !status) {
        // 🔧 CASO 3: Sin filtros - COMPORTAMIENTO DEFAULT
        // Para owners: mostrar SUS espacios en todos los estados
        // Para otros: mostrar espacios aprobados
        logWithContext("INFO", requestId, "🌟 Default behavior - no filters provided", {
          userId: userId.substring(0, 8) + '***',
          userRole: userRole,
          decision: userRole === 'owner' ? 'show_own_spaces_all_status' : 'show_approved_only'
        });
        if (userRole === 'owner') {
          // Owner sin filtros = sus espacios en todos los estados
          query = query.eq('owner_id', userId);
        } else {
          // Usuario normal sin filtros = espacios aprobados de todos
          query = query.eq('status', 'approved');
        }
      } else if (!ownerId && status) {
        // 🔧 CASO 4: Solo filtro de status sin owner específico
        logWithContext("INFO", requestId, "📊 Status filter only", {
          status,
          userRole,
          userId: userId.substring(0, 8) + '***'
        });
        if (userRole === 'owner') {
          // Owner con filtro de status = sus espacios con ese status
          query = query.eq('owner_id', userId);
          query = query.eq('status', status);
        } else {
          // Usuario normal con filtro = espacios con ese status (solo aprobados para otros)
          query = query.eq('status', status);
          // Si no es 'approved', también filtrar por aprobados para seguridad
          if (status !== 'approved') {
            query = query.eq('status', 'approved');
          }
        }
      }
    }
    // Paginación y ordenamiento
    query = query.range(offset, offset + limit - 1);
    query = query.order('created_at', {
      ascending: false
    });
    logWithContext("DEBUG", requestId, "🔍 Executing final query", {
      timestamp: "2025-09-06 06:46:01"
    });
    const { data: spaces, error, count } = await query;
    if (error) {
      logWithContext("ERROR", requestId, "Error fetching spaces", error);
      throw error;
    }
    logWithContext("INFO", requestId, "📊 Raw query results", {
      spacesFound: spaces?.length || 0,
      totalCount: count,
      spaceIds: spaces?.map((s)=>s.id_space) || [],
      spaceStatuses: spaces?.map((s)=>`${s.id_space}:${s.status}`) || []
    });
    // 🔧 VERIFICAR QUE LOS ESPACIOS PERTENECEN AL USUARIO
    if (spaces && spaces.length > 0 && !isAdmin) {
      const userSpaces = spaces.filter((space)=>space.owner_id === userId);
      const otherSpaces = spaces.filter((space)=>space.owner_id !== userId);
      logWithContext("DEBUG", requestId, "🔍 Space ownership analysis", {
        totalSpaces: spaces.length,
        userSpaces: userSpaces.length,
        otherSpaces: otherSpaces.length,
        userSpaceIds: userSpaces.map((s)=>s.id_space),
        otherSpaceIds: otherSpaces.map((s)=>s.id_space)
      });
    }
    // Enriquecer cada espacio con datos completos
    const enrichedSpaces = [];
    for (const space of spaces || []){
      try {
        const completeSpace = await getCompleteSpace(supabase, space.id_space, requestId);
        enrichedSpaces.push(completeSpace);
      } catch (spaceError) {
        logWithContext("WARN", requestId, "Error enriching space, using basic data", {
          spaceId: space.id_space,
          error: spaceError.message
        });
        // Agregar información básica del owner aunque falle el enriquecimiento
        const basicOwnerInfo = await getOwnerInfo(supabase, space.owner_id, requestId);
        enrichedSpaces.push({
          ...space,
          owner_name: basicOwnerInfo.name,
          owner_email: basicOwnerInfo.email,
          formatted_price_cop: space.price_per_hour_cop ? `$${space.price_per_hour_cop.toLocaleString('es-CO')} COP` : 'Precio no disponible',
          amenities: [],
          photos: [],
          average_rating: 0,
          review_count: 0,
          is_published: space.status === 'approved'
        });
      }
    }
    logWithContext("INFO", requestId, "✅ Spaces retrieved successfully with CORRECTED permissions", {
      count: enrichedSpaces.length,
      page,
      limit,
      statusBreakdown: {
        pending: enrichedSpaces.filter((s)=>s.status === 'pending').length,
        approved: enrichedSpaces.filter((s)=>s.status === 'approved').length,
        rejected: enrichedSpaces.filter((s)=>s.status === 'rejected').length
      },
      ownerBreakdown: {
        ownSpaces: enrichedSpaces.filter((s)=>s.owner_id === userId).length,
        otherSpaces: enrichedSpaces.filter((s)=>s.owner_id !== userId).length
      },
      queryContext: {
        isAdmin,
        userRole,
        appliedFilters: {
          status: status || null,
          ownerId: ownerId || null
        },
        defaultBehavior: !ownerId && !status ? userRole === 'owner' ? 'own_spaces_all_status' : 'approved_only' : 'filters_applied'
      }
    });
    return new Response(JSON.stringify({
      success: true,
      data: enrichedSpaces,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || enrichedSpaces.length) / limit)
      },
      metadata: {
        userRole: userRole,
        isAdmin: isAdmin,
        query_context: {
          applied_filters: {
            status: status || null,
            owner_id: ownerId || null
          },
          permission_logic: !isAdmin ? ownerId === userId ? 'owner_viewing_own' : ownerId && ownerId !== userId ? 'viewing_other_approved' : !ownerId && !status && userRole === 'owner' ? 'owner_default_all_own' : !ownerId && !status ? 'user_default_approved' : 'filtered_query' : 'admin_all_access'
        }
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (getError) {
    logWithContext("ERROR", requestId, "Exception getting spaces", getError);
    throw getError;
  }
} // 🔧 HANDLER: Crear espacio (sin cambios en lógica)
async function handleCreateSpace(supabase, requestBody, userId, userRole, requestId) {
  logWithContext("INFO", requestId, "➕ Creating new space");
  if (![
    'owner',
    'admin',
    'superadmin'
  ].includes(userRole)) {
    throw new Error("Solo los propietarios pueden crear espacios");
  }
  if (!requestBody) {
    throw new Error("Datos del espacio requeridos");
  }
  const { spaceName, spaceType, maxCapacity, pricePerHour, location, description, amenities, photos } = requestBody;
  // Validaciones
  if (!spaceName || !spaceType || !maxCapacity || !pricePerHour || !location || !description) {
    throw new Error("Todos los campos básicos son requeridos");
  }
  const priceInCOP = parseFloat(pricePerHour);
  if (isNaN(priceInCOP) || priceInCOP < 10000 || priceInCOP > 10000000) {
    throw new Error("El precio debe estar entre $10.000 y $10.000.000 COP");
  }
  try {
    // Crear espacio
    const { data: newSpace, error: spaceError } = await supabase.from('spaces').insert({
      space_name: spaceName,
      space_type: spaceType,
      max_capacity: parseInt(maxCapacity),
      price_per_hour_cop: priceInCOP,
      location: location,
      description: description,
      owner_id: userId,
      status: 'pending'
    }).select().single();
    if (spaceError) {
      logWithContext("ERROR", requestId, "Error creating space", spaceError);
      throw spaceError;
    }
    const spaceId = newSpace.id_space;
    // Procesar amenidades y fotos
    if (amenities && amenities.length > 0) {
      await processSpaceAmenities(supabase, spaceId, amenities, requestId);
    }
    if (photos && photos.length > 0) {
      await processSpacePhotos(supabase, spaceId, photos, requestId);
    }
    // Obtener espacio completo
    const completeSpace = await getCompleteSpace(supabase, spaceId, requestId);
    logWithContext("INFO", requestId, "🎉 Space creation completed", {
      spaceId,
      spaceName: completeSpace.space_name
    });
    return new Response(JSON.stringify({
      success: true,
      message: `Espacio "${spaceName}" creado exitosamente. Está pendiente de aprobación.`,
      data: completeSpace
    }), {
      status: 201,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (createError) {
    logWithContext("ERROR", requestId, "Exception creating space", createError);
    throw createError;
  }
}
// 🔧 HANDLER: Actualizar espacio (sin cambios en lógica)
async function handleUpdateSpace(supabase, spaceId, requestBody, userId, userRole, requestId) {
  logWithContext("INFO", requestId, "✏️ Updating space", {
    spaceId
  });
  if (!spaceId || !requestBody) {
    throw new Error("ID del espacio y datos de actualización requeridos");
  }
  try {
    // Verificar espacio existe y permisos
    const { data: existingSpace, error: fetchError } = await supabase.from('spaces').select('*').eq('id_space', spaceId).single();
    if (fetchError) {
      throw new Error("Espacio no encontrado");
    }
    validateOwnerOrAdmin(userRole, existingSpace.owner_id, userId, "actualizar");
    const { spaceName, spaceType, maxCapacity, pricePerHour, location, description, amenities, photos, status } = requestBody;
    // Preparar datos de actualización
    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (spaceName !== undefined) updateData.space_name = spaceName;
    if (spaceType !== undefined) updateData.space_type = spaceType;
    if (maxCapacity !== undefined) updateData.max_capacity = parseInt(maxCapacity);
    if (location !== undefined) updateData.location = location;
    if (description !== undefined) updateData.description = description;
    if (pricePerHour !== undefined) {
      const priceInCOP = parseFloat(pricePerHour);
      if (isNaN(priceInCOP) || priceInCOP < 10000 || priceInCOP > 10000000) {
        throw new Error("El precio debe estar entre $10.000 y $10.000.000 COP");
      }
      updateData.price_per_hour_cop = priceInCOP;
    }
    // Solo admin/superadmin pueden cambiar status
    if (status !== undefined && [
      'admin',
      'superadmin'
    ].includes(userRole)) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approved_by = userId;
        updateData.approved_at = new Date().toISOString();
        updateData.rejection_reason = null;
      } else if (status === 'rejected' && requestBody.rejectionReason) {
        updateData.rejection_reason = requestBody.rejectionReason;
        updateData.approved_by = null;
        updateData.approved_at = null;
      }
    }
    // Actualizar espacio
    const { error: updateError } = await supabase.from('spaces').update(updateData).eq('id_space', spaceId);
    if (updateError) {
      throw updateError;
    }
    // Actualizar amenidades y fotos si se proporcionaron
    if (amenities !== undefined) {
      await processSpaceAmenities(supabase, parseInt(spaceId), amenities, requestId);
    }
    if (photos !== undefined) {
      if (requestBody.replacePhotos) {
        await supabase.from('space_photos').delete().eq('space_id', spaceId);
      }
      await processSpacePhotos(supabase, parseInt(spaceId), photos, requestId);
    }
    // Obtener espacio actualizado
    const completeSpace = await getCompleteSpace(supabase, parseInt(spaceId), requestId);
    return new Response(JSON.stringify({
      success: true,
      message: `Espacio "${completeSpace.space_name}" actualizado exitosamente.`,
      data: completeSpace
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (updateError) {
    logWithContext("ERROR", requestId, "Exception updating space", updateError);
    throw updateError;
  }
}
// 🔧 HANDLER: Eliminar espacio (sin cambios en lógica)
async function handleDeleteSpace(supabase, spaceId, userId, userRole, requestId) {
  logWithContext("INFO", requestId, "🗑️ Deleting space", {
    spaceId
  });
  if (!spaceId) {
    throw new Error("ID del espacio requerido");
  }
  try {
    // Verificar espacio existe y permisos
    const { data: existingSpace, error: fetchError } = await supabase.from('spaces').select('*').eq('id_space', spaceId).single();
    if (fetchError) {
      throw new Error("Espacio no encontrado");
    }
    validateOwnerOrAdmin(userRole, existingSpace.owner_id, userId, "eliminar");
    const spaceName = existingSpace.space_name;
    // Eliminar fotos del storage
    const { data: photos } = await supabase.from('space_photos').select('photo_url').eq('space_id', spaceId);
    if (photos && photos.length > 0) {
      for (const photo of photos){
        try {
          const urlParts = photo.photo_url.split('/');
          const pathIndex = urlParts.findIndex((part)=>part === 'spaces');
          if (pathIndex !== -1 && pathIndex < urlParts.length - 1) {
            const filePath = urlParts.slice(pathIndex + 1).join('/');
            await supabase.storage.from('spaces').remove([
              filePath
            ]);
          }
        } catch (fileDeleteError) {
          logWithContext("WARN", requestId, "Error deleting photo file", fileDeleteError);
        }
      }
    }
    // Eliminar espacio (cascada elimina relaciones)
    const { error: deleteError } = await supabase.from('spaces').delete().eq('id_space', spaceId);
    if (deleteError) {
      throw deleteError;
    }
    logWithContext("INFO", requestId, "✅ Space deleted successfully", {
      spaceId,
      spaceName
    });
    return new Response(JSON.stringify({
      success: true,
      message: `Espacio "${spaceName}" eliminado exitosamente.`
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (deleteError) {
    logWithContext("ERROR", requestId, "Exception deleting space", deleteError);
    throw deleteError;
  }
}
