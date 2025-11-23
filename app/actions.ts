// app/actions.ts (CÓDIGO FINAL DE RENDIMIENTO Y ESTABILIDAD)
'use server';

// Definiciones de interfaces
interface DailyPlan {
  date: string;       
  day: number;        
  from: string;       
  to: string;         
  distance: number;   
  isDriving: boolean; 
  warning?: string;   
}

interface DirectionsRequest {
    origin: string;
    destination: string;
    waypoints: string[];
    travel_mode: 'driving';
    kmMaximoDia: number;
    fechaInicio: string; 
    fechaRegreso: string; 
}

interface DirectionsResult {
    distanceKm?: number;
    mapUrl?: string;
    error?: string;
    dailyItinerary?: DailyPlan[];
}

// Función para sumar días a una fecha
function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Función para obtener la fecha formateada (DD/MM/YYYY)
function formatDate(date: Date): string {
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}


// 🛑 FUNCIÓN PRINCIPAL DEL SERVIDOR: Obtener Ruta, Coste e Itinerario (Final)
export async function getDirectionsAndCost(data: DirectionsRequest): Promise<DirectionsResult> {
    
    const apiKey = process.env.GOOGLE_MAPS_API_KEY_FIXED;

    if (!apiKey) {
        return { error: "Clave de API de Google Maps no configurada. Edita el archivo next.config.ts." };
    }

    // 1. CONSTRUIR LA URL DE GOOGLE MAPS DIRECTIONS API
    const allStops = [data.origin, ...data.waypoints.filter(w => w), data.destination];
    const waypointsParam = data.waypoints.length > 0 ? `&waypoints=${data.waypoints.join('|')}` : '';

    const params = {
        origin: data.origin,
        destination: data.destination,
        mode: data.travel_mode,
        key: apiKey,
    };
    
    const queryString = Object.keys(params)
        .filter(key => params[key as keyof typeof params])
        .map(key => `${key}=${encodeURIComponent(params[key as keyof typeof params]!)}`)
        .join('&');
        
    const url = `https://maps.googleapis.com/maps/api/directions/json?${queryString}${waypointsParam}`;

    try {
        // 2. HACER LA LLAMADA A LA API DE GOOGLE MAPS
        const response = await fetch(url);
        const directionsResult = await response.json();

        if (directionsResult.status !== 'OK') {
            return { error: `Error de la API: ${directionsResult.error_message || directionsResult.status}. Verifica que todas las ciudades sean correctas.` };
        }
        
        const route = directionsResult.routes[0];
        
        // 3. EXTRAER DISTANCIA TOTAL
        let totalDistanceMeters = 0;
        route.legs.forEach((leg: any) => { totalDistanceMeters += leg.distance.value; });
        const distanceKm = totalDistanceMeters / 1000;
        
        // 4. GENERAR LISTA DE PARADAS REALES (INCLUIDAS LAS FORZADAS POR KM MÁXIMO)
        
        const allDrivingStops: { from: string, to: string, distance: number, warning?: string }[] = [];
        const finalWaypointsForMap: string[] = []; 
        
        const maxKm = data.kmMaximoDia;
        const targetDistanceMeters = maxKm * 1000;
        
        let currentStageDistanceMeters = 0; 
        
        // --- Algoritmo de División por Pasos (steps) ---
        for (let i = 0; i < route.legs.length; i++) {
            const leg = route.legs[i];
            const endCity = allStops[i + 1];

            let currentStageStart = allStops[i];
            
            for (const step of leg.steps) {
                const stepDistance = step.distance.value;
                
                if (currentStageDistanceMeters + stepDistance >= targetDistanceMeters) {
                    
                    // Límite alcanzado
                    const distanceToStop = targetDistanceMeters - currentStageDistanceMeters;
                    
                    // 🛑 CORRECCIÓN DE NOMENCLATURA: Usar la población más grande
                    let rawAddress = step.end_address || "Parada Táctica";
                    let parts = rawAddress.split(',').map(p => p.trim()).filter(p => p.length > 2);
                    
                    // Tomamos la última parte legible de la dirección (que es el nombre más grande)
                    let cityName = parts[parts.length - 1]; 
                    
                    const stopName = `Parada Táctica: ${cityName}`; 

                    // Añadimos el tramo de conducción forzada
                    allDrivingStops.push({
                        from: currentStageStart,
                        to: stopName,
                        distance: targetDistanceMeters / 1000, 
                        warning: undefined,
                    });
                    
                    // 🛑 AÑADIR AL MAPA: Si es una parada táctica, la añadimos a los waypoints del mapa
                    finalWaypointsForMap.push(stopName);


                    // Reseteamos el acumulador y el punto de inicio para el día siguiente
                    const overflowDistance = (currentStageDistanceMeters + stepDistance) - targetDistanceMeters;
                    currentStageDistanceMeters = overflowDistance; 
                    currentStageStart = stopName; 
                } else {
                    currentStageDistanceMeters += stepDistance;
                }
            }
            
            // 4. Asegurarse de añadir el tramo final del leg (hacia el waypoint de usuario)
            if (currentStageDistanceMeters > 0 || currentStageStart !== endCity) {
                
                // Si el destino es un waypoint de usuario (no Origen/Destino final), lo añadimos al mapa
                if (data.waypoints.includes(endCity)) {
                    finalWaypointsForMap.push(endCity);
                }

                allDrivingStops.push({
                    from: currentStageStart,
                    to: endCity,
                    distance: currentStageDistanceMeters / 1000,
                    warning: undefined,
                });
            }
            currentStageDistanceMeters = 0; 
        }

        // --- Generación del Itinerario Diario (Asignación de Fechas) ---
        
        const dailyItinerary: DailyPlan[] = [];
        let currentDate = new Date(data.fechaInicio);
        let dayCounter = 1;
        
        // 1. Asignamos fechas
        for (const stop of allDrivingStops) {
             dailyItinerary.push({
                date: formatDate(currentDate),
                day: dayCounter,
                from: stop.from,
                to: stop.to,
                distance: stop.distance,
                isDriving: true,
                warning: undefined,
            });
            
            currentDate = addDays(currentDate, 1);
            dayCounter++;
        }
        
        // 5. CÁLCULO DE DÍAS DE ESTANCIA
        const dateArrival = addDays(currentDate, -1); 
        const dateEnd = new Date(data.fechaRegreso);

        const daysStay = Math.floor((dateEnd.getTime() - dateArrival.getTime() + 1) / (1000 * 3600 * 24)); 

        if (daysStay > 0) {
            let stayLocation = allStops[allStops.length - 1]; // El destino final

            for (let i = 0; i < daysStay; i++) {
                 dailyItinerary.push({
                    date: formatDate(currentDate),
                    day: dayCounter,
                    from: stayLocation,
                    to: stayLocation,
                    distance: 0,
                    isDriving: false 
                });
                currentDate = addDays(currentDate, 1);
                dayCounter++;
            }
        }
        
        // 6. CREAR EL ENLACE DEL MAPA (FINAL)
        
        const embedParams = {
            key: apiKey,
            origin: data.origin,
            destination: data.destination,
            // 🛑 CORRECCIÓN CRÍTICA: Usamos el array de waypoints construido.
            waypoints: finalWaypointsForMap.join('|'), 
            mode: data.travel_mode,
        };
        
        const embedQueryString = Object.keys(embedParams)
            .filter(key => embedParams[key as keyof typeof embedParams])
            .map(key => `${key}=${encodeURIComponent(embedParams[key as keyof typeof embedParams]!)}`)
            .join('&');
            
        // Usamos la URL oficial de embed/v1/directions que es la más robusta.
        const mapUrl = `https://www.google.com/maps/embed/v1/directions?${embedQueryString}`; 
        
        return { distanceKm, mapUrl, dailyItinerary };

    } catch (e: any) {
        return { error: e.message || "Error de red. Verifica tu conexión o el formato de las ciudades." };
    }
}