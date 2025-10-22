// 🔧 EDGE FUNCTION - SPACES PÚBLICOS CON CORS CORREGIDO, FOTOS Y AMENITIES MEJORADAS
// Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2025-10-18 20:31:42
// Current User's Login: IvaninaCapuchina
// FIX: CORS + Photos + Amenities + More complete space information
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || "";
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || "";
// 🔧 CORS HEADERS CORREGIDOS - INCLUIR AUTHORIZATION
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-requested-with",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "false"
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
// 🔧 NUEVA FUNCIÓN: Obtener amenities desde la tabla space_amenities
async function getSpaceAmenities(supabase, spaceId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "🏷️ Getting amenities from space_amenities table", {
      spaceId: spaceId
    });
    // Consulta directa a la tabla space_amenities
    const { data: amenities, error: amenitiesError } = await supabase.from('space_amenities').select('*').eq('space_id', spaceId).order('created_at', {
      ascending: true
    });
    if (amenitiesError) {
      logWithContext("WARN", requestId, "⚠️ Error getting amenities", {
        spaceId: spaceId,
        error: amenitiesError.message
      });
      // Fallback: Intentar con RPC si existe
      try {
        const { data: rpcAmenities } = await supabase.rpc('get_space_amenities', {
          space_id_param: spaceId
        });
        logWithContext("INFO", requestId, "✅ Amenities from RPC fallback", {
          spaceId: spaceId,
          amenitiesCount: rpcAmenities?.length || 0
        });
        return (rpcAmenities || []).map((amenity)=>({
            id: amenity.id || null,
            name: amenity.name || amenity.amenity_name,
            display_name: amenity.display_name || amenity.amenity_name,
            icon: amenity.icon || null,
            category: amenity.category || 'general',
            is_predefined: amenity.is_predefined !== false,
            is_custom: amenity.is_predefined === false,
            created_at: amenity.created_at
          }));
      } catch (rpcError) {
        logWithContext("ERROR", requestId, "❌ RPC amenities fallback failed", {
          spaceId: spaceId,
          error: rpcError.message
        });
        return [];
      }
    }
    const formattedAmenities = (amenities || []).map((amenity)=>({
        id: amenity.id,
        name: amenity.amenity_name,
        display_name: amenity.amenity_name,
        is_predefined: amenity.is_predefined,
        is_custom: !amenity.is_predefined,
        created_at: amenity.created_at,
        // Agregar categoría basada en el nombre (puedes personalizar esto)
        category: getCategoryFromAmenityName(amenity.amenity_name),
        // Agregar icono basado en el nombre (puedes personalizar esto)
        icon: getIconFromAmenityName(amenity.amenity_name)
      }));
    logWithContext("INFO", requestId, "✅ Amenities retrieved successfully", {
      spaceId: spaceId,
      amenitiesCount: formattedAmenities.length,
      predefinedCount: formattedAmenities.filter((a)=>a.is_predefined).length,
      customCount: formattedAmenities.filter((a)=>!a.is_predefined).length,
      amenitiesList: formattedAmenities.map((a)=>a.name)
    });
    return formattedAmenities;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting space amenities", {
      spaceId: spaceId,
      error: error.message
    });
    return [];
  }
}
// 🔧 HELPER: Categorizar amenities basado en el nombre
function getCategoryFromAmenityName(name) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('wifi') || lowerName.includes('internet')) return 'technology';
  if (lowerName.includes('parking') || lowerName.includes('estacionamiento')) return 'parking';
  if (lowerName.includes('cocina') || lowerName.includes('kitchen') || lowerName.includes('catering')) return 'catering';
  if (lowerName.includes('aire') || lowerName.includes('air') || lowerName.includes('climate')) return 'climate';
  if (lowerName.includes('audio') || lowerName.includes('sonido') || lowerName.includes('music')) return 'audio';
  if (lowerName.includes('proyector') || lowerName.includes('pantalla') || lowerName.includes('screen')) return 'av_equipment';
  if (lowerName.includes('seguridad') || lowerName.includes('security') || lowerName.includes('guardia')) return 'security';
  if (lowerName.includes('baño') || lowerName.includes('bathroom') || lowerName.includes('toilet')) return 'facilities';
  if (lowerName.includes('acceso') || lowerName.includes('access') || lowerName.includes('wheelchair')) return 'accessibility';
  return 'general';
}
// 🔧 HELPER: Obtener icono basado en el nombre de la amenity
function getIconFromAmenityName(name) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('wifi')) return 'wifi';
  if (lowerName.includes('parking')) return 'local_parking';
  if (lowerName.includes('cocina')) return 'restaurant';
  if (lowerName.includes('aire')) return 'ac_unit';
  if (lowerName.includes('audio')) return 'volume_up';
  if (lowerName.includes('proyector')) return 'videocam';
  if (lowerName.includes('seguridad')) return 'security';
  if (lowerName.includes('baño')) return 'wc';
  if (lowerName.includes('acceso')) return 'accessible';
  return 'check_circle';
}
// 🔧 FUNCIÓN: Obtener fotos del bucket público
async function getSpacePhotosFromBucket(supabase, spaceId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "📸 Getting photos from public bucket", {
      spaceId: spaceId,
      bucketName: "spaces",
      folderPath: `space-${spaceId}`
    });
    // Intentar obtener fotos del bucket público
    const { data: files, error: storageError } = await supabase.storage.from('spaces').list(`space-${spaceId}`, {
      limit: 20,
      offset: 0,
      sortBy: {
        column: 'name',
        order: 'asc'
      }
    });
    if (storageError) {
      logWithContext("WARN", requestId, "⚠️ Storage list error", {
        spaceId: spaceId,
        error: storageError.message
      });
      return await getSpacePhotosFromDatabase(supabase, spaceId, requestId);
    }
    if (!files || files.length === 0) {
      logWithContext("INFO", requestId, "📭 No photos found in bucket", {
        spaceId: spaceId,
        folderPath: `space-${spaceId}`
      });
      return await getSpacePhotosFromDatabase(supabase, spaceId, requestId);
    }
    // Filtrar solo archivos de imagen
    const imageFiles = files.filter((file)=>{
      const extension = file.name.toLowerCase().split('.').pop();
      return [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'gif'
      ].includes(extension);
    });
    logWithContext("DEBUG", requestId, "🖼️ Image files found", {
      spaceId: spaceId,
      totalFiles: files.length,
      imageFiles: imageFiles.length,
      fileNames: imageFiles.map((f)=>f.name)
    });
    // Construir URLs públicas
    const photos = imageFiles.map((file, index)=>{
      const publicUrl = supabase.storage.from('spaces').getPublicUrl(`space-${spaceId}/${file.name}`);
      return {
        id: `bucket_${spaceId}_${index}`,
        url: publicUrl.data.publicUrl,
        is_primary: index === 0,
        order: index,
        filename: file.name,
        file_size: file.metadata?.size || 0,
        mime_type: file.metadata?.mimetype || 'image/jpeg',
        last_modified: file.updated_at || file.created_at,
        source: 'bucket'
      };
    });
    logWithContext("INFO", requestId, "✅ Photos retrieved from bucket", {
      spaceId: spaceId,
      photosCount: photos.length,
      primaryPhoto: photos[0]?.filename || 'none'
    });
    return photos;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting photos from bucket", {
      spaceId: spaceId,
      error: error.message
    });
    return await getSpacePhotosFromDatabase(supabase, spaceId, requestId);
  }
}
// 🔧 FUNCIÓN FALLBACK: Obtener fotos desde la base de datos
async function getSpacePhotosFromDatabase(supabase, spaceId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "🗄️ Fallback: Getting photos from database", {
      spaceId: spaceId
    });
    // Consulta directa a la tabla space_photos
    const { data: photos, error: photosError } = await supabase.from('space_photos').select('*').eq('space_id', spaceId).order('upload_order', {
      ascending: true
    });
    if (photosError) {
      logWithContext("WARN", requestId, "⚠️ Database photos error", {
        spaceId: spaceId,
        error: photosError.message
      });
      // Fallback con RPC
      try {
        const { data: rpcPhotos } = await supabase.rpc('get_space_photos', {
          space_id_param: spaceId
        });
        return (rpcPhotos || []).map((photo)=>({
            id: photo.id,
            url: photo.photo_url,
            is_primary: photo.is_primary,
            order: photo.upload_order || 0,
            source: 'rpc'
          }));
      } catch (rpcError) {
        logWithContext("ERROR", requestId, "❌ RPC photos fallback failed", {
          spaceId: spaceId,
          error: rpcError.message
        });
        return [];
      }
    }
    const formattedPhotos = (photos || []).map((photo)=>({
        id: photo.id,
        url: photo.photo_url,
        is_primary: photo.is_primary,
        order: photo.upload_order || 0,
        file_size: photo.file_size,
        mime_type: photo.mime_type,
        created_at: photo.created_at,
        source: 'database'
      }));
    logWithContext("DEBUG", requestId, "✅ Photos from database", {
      spaceId: spaceId,
      photosCount: formattedPhotos.length
    });
    return formattedPhotos;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Database photos fallback error", {
      spaceId: spaceId,
      error: error.message
    });
    return [];
  }
}
// 🔧 FUNCIÓN MEJORADA: Obtener ratings y reviews
async function getSpaceRatings(supabase, spaceId, requestId) {
  try {
    logWithContext("DEBUG", requestId, "⭐ Getting space ratings", {
      spaceId: spaceId
    });
    // Intentar con RPC primero
    let averageRating = 0;
    let reviewCount = 0;
    try {
      const { data: avgRating } = await supabase.rpc('get_space_average_rating', {
        space_id_param: spaceId
      });
      const { data: revCount } = await supabase.rpc('get_space_review_count', {
        space_id_param: spaceId
      });
      averageRating = avgRating || 0;
      reviewCount = revCount || 0;
    } catch (rpcError) {
      logWithContext("WARN", requestId, "⚠️ RPC ratings failed, using direct query", {
        spaceId: spaceId,
        error: rpcError.message
      });
      // Fallback: consulta directa
      const { data: reviews } = await supabase.from('space_reviews').select('rating').eq('space_id', spaceId);
      if (reviews && reviews.length > 0) {
        averageRating = reviews.reduce((sum, r)=>sum + r.rating, 0) / reviews.length;
        reviewCount = reviews.length;
      }
    }
    const ratingInfo = {
      average: Math.round(averageRating * 100) / 100,
      count: reviewCount,
      stars: Math.round(averageRating * 2) / 2,
      distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      }
    };
    // Obtener distribución de ratings si hay reviews
    if (reviewCount > 0) {
      const { data: ratingDist } = await supabase.from('space_reviews').select('rating').eq('space_id', spaceId);
      if (ratingDist) {
        ratingDist.forEach((review)=>{
          const rating = Math.floor(review.rating);
          if (rating >= 1 && rating <= 5) {
            ratingInfo.distribution[rating]++;
          }
        });
      }
    }
    logWithContext("INFO", requestId, "✅ Ratings retrieved", {
      spaceId: spaceId,
      average: ratingInfo.average,
      count: ratingInfo.count,
      distribution: ratingInfo.distribution
    });
    return ratingInfo;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting ratings", {
      spaceId: spaceId,
      error: error.message
    });
    return {
      average: 0,
      count: 0,
      stars: 0,
      distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0
      }
    };
  }
}
// 🔧 HELPER MEJORADO: Obtener información completa del espacio
async function getPublicSpaceInfo(supabase, space, requestId) {
  try {
    logWithContext("DEBUG", requestId, "🔍 Getting complete public space info", {
      spaceId: space.id_space,
      spaceName: space.space_name
    });
    const perfTracker = createPerformanceTracker(`${requestId}_space_${space.id_space}`);
    // 🔧 MEJORADO: Obtener amenities desde la tabla
    perfTracker.step("amenities_fetch");
    const amenities = await getSpaceAmenities(supabase, space.id_space, requestId);
    // 🔧 MEJORADO: Obtener fotos desde bucket público
    perfTracker.step("photos_fetch");
    const photos = await getSpacePhotosFromBucket(supabase, space.id_space, requestId);
    // 🔧 MEJORADO: Obtener ratings completos
    perfTracker.step("ratings_fetch");
    const rating = await getSpaceRatings(supabase, space.id_space, requestId);
    // Formatear precio
    perfTracker.step("price_format");
    let formattedPrice = 'Precio no disponible';
    try {
      const { data: priceFormatted } = await supabase.rpc('format_cop_price', {
        amount: space.price_per_hour_cop
      });
      formattedPrice = priceFormatted || `$${space.price_per_hour_cop?.toLocaleString('es-CO')} COP`;
    } catch (priceError) {
      formattedPrice = space.price_per_hour_cop ? `$${space.price_per_hour_cop.toLocaleString('es-CO')} COP` : 'Precio no disponible';
    }
    perfTracker.step("object_construction");
    const publicSpace = {
      // Información básica
      id: space.id_space,
      name: space.space_name,
      description: space.description,
      type: space.space_type,
      capacity: space.max_capacity,
      location: space.location,
      // Información de precios
      price_per_hour: space.price_per_hour_cop,
      price_formatted: formattedPrice,
      // Información de ratings mejorada
      rating: rating,
      // Amenities completas
      amenities: amenities,
      amenities_summary: {
        total: amenities.length,
        predefined: amenities.filter((a)=>a.is_predefined).length,
        custom: amenities.filter((a)=>!a.is_predefined).length,
        categories: [
          ...new Set(amenities.map((a)=>a.category))
        ]
      },
      // Fotos mejoradas
      photos: photos.sort((a, b)=>a.order - b.order),
      photos_summary: {
        total: photos.length,
        primary_photo: photos.find((p)=>p.is_primary)?.url || photos[0]?.url || null,
        sources: [
          ...new Set(photos.map((p)=>p.source))
        ]
      },
      // Información de disponibilidad
      availability: {
        status: 'available',
        published_at: space.approved_at || space.created_at,
        approved_at: space.approved_at
      },
      // Timestamps
      created_at: space.created_at,
      updated_at: space.updated_at,
      approved_at: space.approved_at,
      // Metadata adicional
      metadata: {
        owner_id: space.owner_id || null,
        approved_by: space.approved_by || null,
        has_photos: photos.length > 0,
        has_amenities: amenities.length > 0,
        has_ratings: rating.count > 0
      }
    };
    perfTracker.total();
    logWithContext("DEBUG", requestId, "✅ Complete public space info created", {
      spaceId: space.id_space,
      amenitiesCount: publicSpace.amenities.length,
      photosCount: publicSpace.photos.length,
      ratingsCount: rating.count,
      primaryPhoto: publicSpace.photos_summary.primary_photo ? 'yes' : 'no',
      categories: publicSpace.amenities_summary.categories
    });
    return publicSpace;
  } catch (error) {
    logWithContext("ERROR", requestId, "❌ Error getting complete space info", {
      spaceId: space.id_space,
      error: error.message,
      stack: error.stack?.substring(0, 300)
    });
    // Fallback simple mejorado
    return {
      id: space.id_space,
      name: space.space_name,
      description: space.description,
      type: space.space_type,
      capacity: space.max_capacity,
      location: space.location,
      price_per_hour: space.price_per_hour_cop,
      price_formatted: space.price_per_hour_cop ? `$${space.price_per_hour_cop.toLocaleString('es-CO')} COP` : 'Precio no disponible',
      rating: {
        average: 0,
        count: 0,
        stars: 0,
        distribution: {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0
        }
      },
      amenities: [],
      amenities_summary: {
        total: 0,
        predefined: 0,
        custom: 0,
        categories: []
      },
      photos: [],
      photos_summary: {
        total: 0,
        primary_photo: null,
        sources: []
      },
      availability: {
        status: 'available',
        published_at: space.created_at
      },
      created_at: space.created_at,
      updated_at: space.updated_at,
      metadata: {
        has_photos: false,
        has_amenities: false,
        has_ratings: false,
        error: 'Información parcial disponible'
      }
    };
  }
}
serve(async (req)=>{
  const requestId = `pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const mainPerf = createPerformanceTracker(requestId);
  // 🔧 CORS PREFLIGHT
  if (req.method === "OPTIONS") {
    logWithContext("INFO", requestId, "🌐 CORS preflight request", {
      origin: req.headers.get('Origin'),
      requestedMethod: req.headers.get('Access-Control-Request-Method'),
      requestedHeaders: req.headers.get('Access-Control-Request-Headers'),
      userAgent: req.headers.get('User-Agent')
    });
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    logWithContext("INFO", requestId, "⭐️ Starting complete public spaces function - Current Time: 2025-10-18 20:31:42", {
      method: req.method,
      origin: req.headers.get('Origin'),
      referer: req.headers.get('Referer'),
      userAgent: req.headers.get('User-Agent')?.substring(0, 100)
    });
    mainPerf.step("initialization");
    if (req.method !== "GET") {
      throw new Error("Solo se permiten peticiones GET en la API pública");
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Configuración de Supabase incompleta");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    mainPerf.step("url_parsing");
    // Parse URL parameters
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const spaceId = searchParams.get('id');
    const spaceType = searchParams.get('type');
    const minCapacity = searchParams.get('min_capacity');
    const maxCapacity = searchParams.get('max_capacity');
    const minPrice = searchParams.get('min_price');
    const maxPrice = searchParams.get('max_price');
    const location = searchParams.get('location');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '12'), 50);
    const includeReviews = searchParams.get('include_reviews') === 'true';
    const offset = (page - 1) * limit;
    logWithContext("INFO", requestId, "🌍 Query parameters", {
      spaceId: spaceId || 'all',
      filters: {
        type: spaceType || 'any',
        capacity: minCapacity || maxCapacity ? `${minCapacity || 'any'}-${maxCapacity || 'any'}` : 'any',
        price: minPrice || maxPrice ? `${minPrice || 'any'}-${maxPrice || 'any'}` : 'any',
        location: location || 'any',
        search: search || 'none'
      },
      pagination: {
        page,
        limit
      },
      sorting: {
        sortBy,
        sortOrder
      },
      includeReviews
    });
    mainPerf.step("database_query");
    // Si es un espacio específico
    if (spaceId) {
      logWithContext("DEBUG", requestId, "🎯 Fetching single space with complete info", {
        spaceId
      });
      const { data: space, error: spaceError } = await supabase.from('spaces').select(`
          id_space,
          space_name,
          description,
          space_type,
          max_capacity,
          location,
          price_per_hour_cop,
          owner_id,
          created_at,
          updated_at,
          approved_at,
          approved_by,
          status
        `).eq('id_space', spaceId).eq('status', 'approved').single();
      if (spaceError || !space) {
        throw new Error("Espacio no encontrado o no disponible");
      }
      const publicSpace = await getPublicSpaceInfo(supabase, space, requestId);
      if (includeReviews) {
        const { data: reviews } = await supabase.from('space_reviews').select('id, rating, review_text, event_date, created_at').eq('space_id', space.id_space).order('created_at', {
          ascending: false
        }).limit(10);
        publicSpace.reviews = (reviews || []).map((review)=>({
            id: review.id,
            rating: review.rating,
            text: review.review_text,
            event_date: review.event_date,
            created_at: review.created_at,
            reviewer: "Usuario verificado"
          }));
      }
      mainPerf.total();
      return new Response(JSON.stringify({
        success: true,
        data: publicSpace
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Lista de espacios con información completa
    logWithContext("DEBUG", requestId, "📋 Building complete spaces list query");
    let query = supabase.from('spaces').select(`
        id_space,
        space_name,
        description,
        space_type,
        max_capacity,
        location,
        price_per_hour_cop,
        owner_id,
        created_at,
        updated_at,
        approved_at,
        approved_by
      `, {
      count: 'exact'
    }).eq('status', 'approved');
    // Aplicar filtros
    if (spaceType) query = query.eq('space_type', spaceType);
    if (minCapacity) query = query.gte('max_capacity', parseInt(minCapacity));
    if (maxCapacity) query = query.lte('max_capacity', parseInt(maxCapacity));
    if (minPrice) query = query.gte('price_per_hour_cop', parseFloat(minPrice));
    if (maxPrice) query = query.lte('price_per_hour_cop', parseFloat(maxPrice));
    if (location) query = query.ilike('location', `%${location}%`);
    if (search) {
      query = query.or(`space_name.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`);
    }
    // Ordenamiento y paginación
    const allowedSortFields = [
      'created_at',
      'updated_at',
      'space_name',
      'max_capacity',
      'price_per_hour_cop'
    ];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = [
      'asc',
      'desc'
    ].includes(sortOrder) ? sortOrder : 'desc';
    query = query.order(finalSortBy, {
      ascending: finalSortOrder === 'asc'
    }).range(offset, offset + limit - 1);
    const { data: spaces, error, count } = await query;
    if (error) {
      throw error;
    }
    logWithContext("INFO", requestId, "📊 Spaces query results", {
      found: spaces?.length || 0,
      total: count
    });
    mainPerf.step("spaces_enrichment");
    // Enriquecer espacios con información completa
    const publicSpaces = [];
    let spacesWithPhotos = 0;
    let spacesWithAmenities = 0;
    let spacesWithRatings = 0;
    for (const space of spaces || []){
      try {
        const publicSpace = await getPublicSpaceInfo(supabase, space, requestId);
        if (includeReviews) {
          const { data: reviews } = await supabase.from('space_reviews').select('id, rating, review_text, event_date, created_at').eq('space_id', space.id_space).order('created_at', {
            ascending: false
          }).limit(3);
          publicSpace.reviews = (reviews || []).map((review)=>({
              id: review.id,
              rating: review.rating,
              text: review.review_text,
              event_date: review.event_date,
              created_at: review.created_at,
              reviewer: "Usuario verificado"
            }));
        }
        // Contar estadísticas
        if (publicSpace.metadata.has_photos) spacesWithPhotos++;
        if (publicSpace.metadata.has_amenities) spacesWithAmenities++;
        if (publicSpace.metadata.has_ratings) spacesWithRatings++;
        publicSpaces.push(publicSpace);
      } catch (enrichError) {
        logWithContext("WARN", requestId, "⚠️ Error enriching space", {
          spaceId: space.id_space,
          error: enrichError.message
        });
      }
    }
    mainPerf.total();
    logWithContext("INFO", requestId, "✅ Complete public spaces retrieved successfully", {
      processed: publicSpaces.length,
      total: count,
      spacesWithPhotos: spacesWithPhotos,
      spacesWithAmenities: spacesWithAmenities,
      spacesWithRatings: spacesWithRatings,
      executionTime: mainPerf.total()
    });
    return new Response(JSON.stringify({
      success: true,
      data: publicSpaces,
      pagination: {
        page: page,
        limit: limit,
        total: count || publicSpaces.length,
        total_pages: Math.ceil((count || publicSpaces.length) / limit),
        has_next: page < Math.ceil((count || publicSpaces.length) / limit),
        has_prev: page > 1
      },
      statistics: {
        spaces_with_photos: spacesWithPhotos,
        spaces_with_amenities: spacesWithAmenities,
        spaces_with_ratings: spacesWithRatings,
        completion_rate: {
          photos: Math.round(spacesWithPhotos / publicSpaces.length * 100),
          amenities: Math.round(spacesWithAmenities / publicSpaces.length * 100),
          ratings: Math.round(spacesWithRatings / publicSpaces.length * 100)
        }
      },
      metadata: {
        query_time: new Date().toISOString(),
        api_version: "public-v2-complete",
        request_id: requestId,
        execution_time_ms: Math.round(mainPerf.total() * 100) / 100
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
    logWithContext("ERROR", requestId, "❌ API Error", {
      message: error.message,
      stack: error.stack?.substring(0, 500)
    });
    let statusCode = 400;
    if (error.message.includes('no encontrado') || error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('Configuración')) {
      statusCode = 500;
    }
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Error en la API pública de espacios",
      timestamp: new Date().toISOString(),
      request_id: requestId
    }), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
