// app/page.tsx (VERSIÓN DEFINITIVA: RESPETA WAYPOINTS Y CORTA POR GEOMETRÍA)
'use client';

import React, { useState } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';

// --- CONFIGURACIÓN VISUAL ---
const containerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '0.5rem'
};

const center = { lat: 40.416775, lng: -3.703790 };
const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

// --- INTERFACES ---
interface DailyPlan {
  day: number;
  date: string;
  from: string;
  to: string;
  distance: number;
  isDriving: boolean;
}

interface TripResult {
  totalDays: number | null;
  distanceKm: number | null;
  totalCost: number | null;
  dailyItinerary: DailyPlan[] | null;
  error: string | null;
}

export default function Home() {
  // 1. CARGA DE LIBRERÍAS
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES
  });

  // 2. ESTADOS
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  
  const [formData, setFormData] = useState({
    fechaInicio: '',
    origen: 'Salamanca',
    fechaRegreso: '',
    destino: 'Punta Umbria',
    etapas: 'Valencia',
    consumo: 9.0,
    precioGasoil: 1.75,
    kmMaximoDia: 400,
  });

  const [results, setResults] = useState<TripResult>({
    totalDays: null, distanceKm: null, totalCost: null, dailyItinerary: null, error: null
  });

  const [loading, setLoading] = useState(false);
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [tacticalMarkers, setTacticalMarkers] = useState<{lat: number, lng: number, title: string}[]>([]);

  // 3. HANDLERS
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: (id === 'precioGasoil' || id === 'consumo') ? parseFloat(value) : value }));
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: parseFloat(e.target.value) }));
  };

  // --- FUNCIÓN AUXILIAR: OBTENER NOMBRE DE CIUDAD (GEOCODING) ---
  const getCityName = async (lat: number, lng: number): Promise<string> => {
    const geocoder = new google.maps.Geocoder();
    try {
      const response = await geocoder.geocode({ location: { lat, lng } });
      if (response.results[0]) {
        const addressComp = response.results[0].address_components;
        // Prioridad: Localidad > Área Administrativa 2 (Provincia) > Área Administrativa 1
        const city = addressComp.find(c => c.types.includes("locality"))?.long_name 
                  || addressComp.find(c => c.types.includes("administrative_area_level_2"))?.long_name
                  || addressComp.find(c => c.types.includes("sublocality"))?.long_name;
        
        // Limpiar códigos postales si se cuelan
        return city ? city.replace(/\d+/, '').trim() : "Punto en Ruta";
      }
    } catch (e) {
      console.error("Error geocoding", e);
    }
    return "Parada en Ruta";
  };

  // --- LÓGICA CORE: CÁLCULO TRAMO A TRAMO ---
  const calculateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setResults(prev => ({...prev, error: null, dailyItinerary: null}));
    setTacticalMarkers([]); 

    const directionsService = new google.maps.DirectionsService();
    const waypoints = formData.etapas.split(',').map(s => s.trim()).filter(s => s.length > 0)
      .map(location => ({ location, stopover: true }));

    try {
      const result = await directionsService.route({
        origin: formData.origen,
        destination: formData.destino,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      });

      setDirectionsResponse(result);

      // --- INICIALIZACIÓN DE VARIABLES GLOBALES DEL VIAJE ---
      const route = result.routes[0];
      const itinerary: DailyPlan[] = [];
      const newTacticalMarkers: {lat: number, lng: number, title: string}[] = [];
      
      let dayCounter = 1;
      let currentDate = new Date(formData.fechaInicio);
      const maxMeters = formData.kmMaximoDia * 1000;
      const formatDate = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const addDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };

      // RECORREMOS "LEGS" (Tramos definidos por el usuario)
      // Leg 0: Salamanca -> Valencia
      // Leg 1: Valencia -> Punta Umbria
      
      let currentLegStartName = formData.origen;

      for (let i = 0; i < route.legs.length; i++) {
        const leg = route.legs[i];
        
        // Reconstruimos la geometría de ESTE leg específico
        // (Google a veces da pasos toscos, aplanamos todos los lat_lngs del leg)
        let legPoints: google.maps.LatLng[] = [];
        leg.steps.forEach(step => {
            if(step.path) legPoints = legPoints.concat(step.path);
        });

        // Variables para procesar ESTE leg
        let legAccumulator = 0;
        let segmentStartName = currentLegStartName;

        // Recorremos punto a punto DENTRO del leg
        for (let j = 0; j < legPoints.length - 1; j++) {
            const point1 = legPoints[j];
            const point2 = legPoints[j+1];
            const segmentDist = google.maps.geometry.spherical.computeDistanceBetween(point1, point2);

            if (legAccumulator + segmentDist > maxMeters) {
                // --- HEMOS LLEGADO AL LÍMITE DIARIO DENTRO DEL TRAMO ---
                
                // 1. Identificar dónde estamos
                const lat = point1.lat();
                const lng = point1.lng();
                const cityName = await getCityName(lat, lng);
                const stopTitle = `📍 Parada Táctica: ${cityName}`;

                // 2. Guardar Itinerario del día
                itinerary.push({
                    day: dayCounter,
                    date: formatDate(currentDate),
                    from: segmentStartName,
                    to: stopTitle,
                    distance: (legAccumulator + segmentDist) / 1000,
                    isDriving: true
                });

                // 3. Crear marcador visual
                newTacticalMarkers.push({ lat, lng, title: stopTitle });

                // 4. Preparar siguiente día
                dayCounter++;
                currentDate = addDay(currentDate);
                legAccumulator = 0; // Reiniciamos contador del día
                segmentStartName = stopTitle; // El origen de mañana es esta parada
            } else {
                legAccumulator += segmentDist;
            }
        }

        // --- FIN DEL LEG (Ej: Llegamos a Valencia) ---
        // Nombre del destino de este leg (puede ser un waypoint o el destino final)
        // Usamos logic defensiva para obtener un nombre limpio
        let endLegName = "Destino Intermedio";
        if (leg.end_address) {
             endLegName = leg.end_address.split(',')[0]; // Coger solo la ciudad
        }
        // Si es el ultimo leg, usamos el destino del form para asegurar el nombre exacto
        if (i === route.legs.length - 1) endLegName = formData.destino;
        // Si es un waypoint intermedio, usamos el nombre limpio
        else {
             // A veces Google devuelve dirección completa, intentamos limpiar
             const parts = leg.end_address.split(',');
             endLegName = parts.length > 1 ? parts[parts.length - 2].trim() : parts[0];
             endLegName = endLegName.replace(/\d{5}/, '').trim(); // Quitar CP
        }

        // Añadimos el trozo que falta hasta completar el Leg (Ej: Cuenca -> Valencia)
        if (legAccumulator > 0 || segmentStartName !== endLegName) {
            itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate),
                from: segmentStartName,
                to: endLegName,
                distance: legAccumulator / 1000,
                isDriving: true
            });
            
            // LÓGICA IMPORTANTE: 
            // Al llegar a un Waypoint de usuario (Valencia), ¿Reseteamos el día?
            // Si quieres que el viaje continue el mismo dia si sobran km, no incrementes.
            // PERO tu ejemplo "Dia 2: Cuenca -> Valencia" sugiere que al llegar al hito, se cierra la linea.
            // Para seguridad y claridad, asumimos que llegar a un Waypoint consume el tramo del itinerario.
            // Si el tramo fue muy corto, el siguiente empezará el mismo día o el siguiente?
            // Vamos a dejar que el contador de días siga natural. Si llegamos a Valencia y quedan km,
            // el usuario podría seguir, pero para visualizar "TRAMOS", es mejor cerrar la línea.
            
            // Simplemente actualizamos el origen para el SIGUIENTE leg
            currentLegStartName = endLegName;
            
            // Opcional: Si quieres forzar que se duerma en Valencia, descomenta esto:
            // dayCounter++; 
            // currentDate = addDay(currentDate);
            // legAccumulator = 0;
        }
      }

      // --- CÁLCULO DE ESTANCIA (Solo al final del todo) ---
      // Si la fecha actual es menor a la fecha de regreso, rellenamos con estancia
      const arrivalDate = new Date(currentDate);
      const returnDateObj = new Date(formData.fechaRegreso);
      const diffTime = returnDateObj.getTime() - arrivalDate.getTime();
      const stayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (stayDays > 0) {
        for(let i=0; i < stayDays; i++) {
             // Evitamos duplicar día si ya se condujo ese día, pasamos al siguiente
             // (Lógica simple: añadimos días de estancia a partir de la llegada)
             dayCounter++; // Avanzamos al día siguiente de la llegada
             currentDate = addDay(currentDate);
             
             itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate), // Ya sumado
                from: formData.destino,
                to: formData.destino,
                distance: 0,
                isDriving: false
            });
        }
      }

      // --- TOTALES ---
      let totalDistMeters = 0;
      route.legs.forEach(l => totalDistMeters += l.distance?.value || 0);
      const totalKm = totalDistMeters / 1000;
      const liters = (totalKm / 100) * formData.consumo;
      const cost = liters * formData.precioGasoil;

      setTacticalMarkers(newTacticalMarkers);
      setResults({
        totalDays: dayCounter, // Total real
        distanceKm: totalKm,
        totalCost: cost,
        dailyItinerary: itinerary,
        error: null
      });

    } catch (error: any) {
      console.error("Error:", error);
      setResults(prev => ({...prev, error: "Error al calcular. Verifica las ciudades."}));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return <div className="flex justify-center items-center h-screen text-black font-bold text-xl">Cargando Mapas...</div>;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-8 text-gray-900 font-sans">
      <div className="w-full max-w-5xl bg-white shadow-2xl rounded-xl p-8 border border-gray-100">
        <h1 className="text-4xl font-extrabold text-blue-900 mb-8 border-b-2 border-blue-100 pb-4 text-center">
           🚐 Planificador de Ruta Camper 🗺️
        </h1>
        
        <form onSubmit={calculateRoute}>
            <section className="bg-blue-50 p-8 rounded-xl border border-blue-200 shadow-inner">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Inputs corregidos para verse en negro */}
                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700">📅 Fecha Inicio</label>
                        <input type="date" id="fechaInicio" onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500" required/>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700">🗓️ Fecha Regreso</label>
                        <input type="date" id="fechaRegreso" onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500" required/>
                    </div>
                    
                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700">📍 Origen</label>
                        <input type="text" id="origen" value={formData.origen} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500 font-medium" required/>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700">🏁 Destino</label>
                        <input type="text" id="destino" value={formData.destino} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500 font-medium" required/>
                    </div>
                    
                    <div className="md:col-span-4 bg-white p-4 rounded-lg border border-gray-200">
                        <label className="flex items-center gap-3 cursor-pointer text-blue-800 font-bold text-lg mb-2">
                            <input type="checkbox" className="w-5 h-5 text-blue-600" checked={showWaypoints} onChange={() => setShowWaypoints(!showWaypoints)} /> 
                            ➕ Paradas Intermedias (Waypoints)
                        </label>
                        {showWaypoints && (
                            <input type="text" id="etapas" value={formData.etapas} onChange={handleChange} placeholder="Ej: Valencia, Madrid (separadas por comas)" className="w-full p-3 border border-gray-300 rounded-lg mt-2 text-black"/>
                        )}
                    </div>

                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700 flex justify-between">
                            🛣️ Max KM/Día: <span className="text-blue-600 text-lg">{formData.kmMaximoDia} km</span>
                        </label>
                        <input type="range" id="kmMaximoDia" min="100" max="1000" step="50" defaultValue={formData.kmMaximoDia} onChange={handleSliderChange} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700 flex justify-between">
                            ⛽ Consumo: <span className="text-blue-600 text-lg">{formData.consumo} L/100</span>
                        </label>
                        <input type="range" id="consumo" min="5" max="25" step="0.5" defaultValue={formData.consumo} onChange={handleSliderChange} className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                    </div>
                    <div className="md:col-span-2 space-y-2">
                        <label className="font-bold text-gray-700">💶 Precio Gasoil (€/L)</label>
                        <input type="number" id="precioGasoil" value={formData.precioGasoil} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg text-black" step="0.01"/>
                    </div>
                </div>
                <button type="submit" disabled={loading} className="mt-8 w-full bg-blue-700 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-800 disabled:bg-gray-400 transition shadow-lg transform hover:-translate-y-1">
                    {loading ? 'Calculando Ruta Óptima...' : '🚀 Generar Plan de Viaje'}
                </button>
            </section>
        </form>

        {results.totalCost !== null && (
            <section className="mt-10 space-y-8 animate-fade-in-up">
                {/* Dashboard de Resultados */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-xl shadow border border-blue-100">
                        <p className="text-3xl font-extrabold text-blue-900">{results.totalDays}</p>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mt-1">Días Totales</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-xl shadow border border-blue-100">
                        <p className="text-3xl font-extrabold text-blue-900">{results.distanceKm?.toFixed(0)}</p>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mt-1">Km Totales</p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-xl shadow border border-blue-100">
                        <p className="text-3xl font-extrabold text-blue-900">{(results.distanceKm! / 100 * formData.consumo).toFixed(0)}</p>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mt-1">Litros</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-white p-4 rounded-xl shadow border border-red-100">
                        <p className="text-3xl font-extrabold text-red-600">{results.totalCost?.toFixed(0)} €</p>
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mt-1">Coste Estimado</p>
                    </div>
                </div>

                {/* Mapa */}
                <div className="border-4 border-white rounded-xl overflow-hidden shadow-2xl h-[500px] ring-1 ring-gray-200">
                    <GoogleMap mapContainerStyle={{width: '100%', height: '100%'}} center={center} zoom={6} onLoad={map => setMap(map)}>
                        {directionsResponse && <DirectionsRenderer directions={directionsResponse} options={{ suppressMarkers: false }} />}
                        {tacticalMarkers.map((marker, i) => (
                            <Marker key={i} position={marker} label={{text: "P", color: "white", fontWeight: "bold"}} title={marker.title} />
                        ))}
                    </GoogleMap>
                </div>

                {/* Tabla de Ruta */}
                <div className="overflow-hidden rounded-xl border border-gray-200 shadow-lg">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-blue-800 text-white uppercase font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Día</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Itinerario del Día</th>
                                <th className="px-6 py-4 text-right">Distancia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {results.dailyItinerary?.map((day, i) => (
                                <tr key={i} className={`transition duration-150 ${day.isDriving ? 'hover:bg-blue-50' : 'bg-yellow-50 hover:bg-yellow-100'}`}>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${day.isDriving ? 'bg-blue-100 text-blue-800' : 'bg-yellow-200 text-yellow-800'}`}>
                                            {day.day}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 font-medium">{day.date}</td>
                                    <td className="px-6 py-4">
                                        {day.isDriving ? 
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <span className="font-semibold text-gray-700">{day.from}</span>
                                                <span className="text-gray-400 hidden sm:inline">➝</span>
                                                <span className="font-bold text-blue-700 text-lg">{day.to}</span>
                                            </div> : 
                                            <div className="flex items-center gap-2 text-orange-700 font-bold text-lg">
                                                <span>🏖️</span> Disfrutando en {day.to}
                                            </div>}
                                    </td>
                                    <td className="px-6 py-4 font-mono font-bold text-gray-700 text-right text-base">
                                        {day.isDriving ? `${day.distance.toFixed(0)} km` : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        )}
        {results.error && <div className="mt-6 p-6 bg-red-50 text-red-800 rounded-xl font-bold border border-red-200 shadow-sm flex items-center gap-3">⚠️ {results.error}</div>}
      </div>
    </main>
  );
}