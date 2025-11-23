// app/page.tsx (VERSIÓN CLIENT-SIDE CON GOOGLE MAPS JAVASCRIPT API)
'use client';

import React, { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';

// --- CONFIGURACIÓN DEL MAPA ---
const containerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '0.5rem'
};

const center = {
  lat: 40.416775, // Madrid (centro por defecto)
  lng: -3.703790
};

const LIBRARIES: ("places" | "geometry" | "drawing" | "visualization")[] = ["places", "geometry"];

// --- INTERFACES ---
interface DailyPlan {
  day: number;
  date: string;
  from: string;
  to: string;
  distance: number;
  isDriving: boolean;
  warning?: string;
}

interface TripResult {
  totalDays: number | null;
  distanceKm: number | null;
  totalCost: number | null;
  dailyItinerary: DailyPlan[] | null;
  error: string | null;
}

export default function Home() {
  // 1. CARGA DEL SCRIPT DE GOOGLE MAPS
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
    totalDays: null,
    distanceKm: null,
    totalCost: null,
    dailyItinerary: null,
    error: null
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
    const { id, value } = e.target;
    const val = parseFloat(value);
    setFormData(prev => ({ ...prev, [id]: val }));
    const display = document.getElementById(`${id}-value`);
    if(display) display.textContent = id === 'consumo' ? val.toFixed(1) : val.toFixed(0);
  };

  // --- LÓGICA PRINCIPAL DE CÁLCULO (CLIENT SIDE) ---
  const calculateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setResults(prev => ({...prev, error: null, dailyItinerary: null}));
    setTacticalMarkers([]); // Limpiar marcadores anteriores

    // Servicio de Direcciones de Google (Client Side)
    const directionsService = new google.maps.DirectionsService();

    const waypoints = formData.etapas.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(location => ({ location, stopover: true }));

    try {
      const result = await directionsService.route({
        origin: formData.origen,
        destination: formData.destino,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      });

      setDirectionsResponse(result); // Esto dibuja la línea azul automáticamente

      // --- PROCESAMIENTO DE DATOS ---
      const route = result.routes[0];
      let totalDistMeters = 0;
      const itinerary: DailyPlan[] = [];
      const newTacticalMarkers: {lat: number, lng: number, title: string}[] = [];
      
      let currentDate = new Date(formData.fechaInicio);
      let dayCounter = 1;
      const maxMeters = formData.kmMaximoDia * 1000;

      // Helper para formatear fecha
      const formatDate = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const addDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };

      // Recorremos los LEGS (Tramos entre waypoints de usuario)
      // Ejemplo: Salamanca -> Valencia (Leg 0), Valencia -> Punta Umbria (Leg 1)
      
      // Lista completa de paradas (Usuario + Tácticas)
      // Empezamos en el origen
      let currentStopName = formData.origen; 

      for (const leg of route.legs) {
        totalDistMeters += leg.distance?.value || 0;
        
        // Algoritmo de división por pasos (steps)
        let legAccumulator = 0;
        let segmentStartName = currentStopName;

        for (const step of leg.steps) {
            const stepDist = step.distance?.value || 0;
            
            // Si sumando este paso nos pasamos del límite...
            if (legAccumulator + stepDist > maxMeters) {
                // ... Marcamos una PARADA TÁCTICA aquí.
                
                // 1. Obtener nombre limpio
                // Google suele dar "Calle Falsa 123, Ciudad, País". Queremos "Ciudad".
                let addressParts = (step.end_address || "").split(',');
                // Intentamos coger la penúltima parte (suele ser ciudad) o la primera si es corta
                let cleanName = addressParts.length > 1 
                    ? addressParts[addressParts.length - 2].trim() // Penúltimo elemento
                    : addressParts[0].trim();
                
                // Quitamos códigos postales si se cuelan (ej: "46000 Valencia")
                cleanName = cleanName.replace(/^[0-9]{4,5}\s*/, '');

                const tacticalStopName = `📍 Parada Táctica: ${cleanName}`;

                // 2. Guardar Marcador para el Mapa
                const stepLat = step.end_location.lat();
                const stepLng = step.end_location.lng();
                newTacticalMarkers.push({
                    lat: stepLat, 
                    lng: stepLng, 
                    title: tacticalStopName
                });

                // 3. Añadir al Itinerario
                const distKm = (legAccumulator + stepDist) / 1000;
                itinerary.push({
                    day: dayCounter,
                    date: formatDate(currentDate),
                    from: segmentStartName,
                    to: tacticalStopName,
                    distance: distKm,
                    isDriving: true
                });

                // 4. Resetear contadores para el día siguiente
                dayCounter++;
                currentDate = addDay(currentDate);
                legAccumulator = 0; 
                segmentStartName = tacticalStopName;

            } else {
                legAccumulator += stepDist;
            }
        }

        // Al terminar el Leg, añadimos el tramo restante hasta el destino del Leg (ej: Valencia)
        const endLegName = leg.end_address ? leg.end_address.split(',')[0] : "Destino Intermedio";
        currentStopName = endLegName; // Actualizamos para el siguiente leg

        if (legAccumulator > 0) {
             itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate),
                from: segmentStartName,
                to: endLegName,
                distance: legAccumulator / 1000,
                isDriving: true
            });
            dayCounter++;
            currentDate = addDay(currentDate);
        }
      }

      // --- CÁLCULO DE ESTANCIA ---
      const arrivalDate = addDay(currentDate); // Día siguiente a la llegada
      const returnDateObj = new Date(formData.fechaRegreso);
      const diffTime = returnDateObj.getTime() - arrivalDate.getTime();
      const stayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (stayDays > 0) {
        const finalDest = formData.destino;
        for(let i=0; i < stayDays; i++) {
             itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate),
                from: finalDest,
                to: finalDest,
                distance: 0,
                isDriving: false
            });
            dayCounter++;
            currentDate = addDay(currentDate);
        }
      }

      // --- RESULTADOS FINALES ---
      const totalKm = totalDistMeters / 1000;
      const liters = (totalKm / 100) * formData.consumo;
      const cost = liters * formData.precioGasoil;

      // Actualizamos estado de marcadores y resultados
      setTacticalMarkers(newTacticalMarkers);
      setResults({
        totalDays: dayCounter - 1,
        distanceKm: totalKm,
        totalCost: cost,
        dailyItinerary: itinerary,
        error: null
      });

    } catch (error: any) {
      console.error(error);
      setResults(prev => ({...prev, error: "No se pudo calcular la ruta. Verifica las ciudades."}));
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERIZADO ---
  if (!isLoaded) return <div className="flex justify-center items-center h-screen">Cargando Mapa...</div>;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-8">
      <div className="w-full max-w-4xl bg-white shadow-xl rounded-lg p-8">
        <h1 className="text-4xl font-extrabold text-blue-800 mb-6 border-b pb-2">🚐 Planificador de Ruta Camper 🗺️</h1>
        
        <form onSubmit={calculateRoute}>
            <section className="bg-blue-50 p-6 rounded-md border border-blue-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-6">
                    {/* Inputs de Fecha */}
                    <div className="md:col-span-2"><label>📅 Inicio</label><input type="date" id="fechaInicio" onChange={handleChange} className="w-full p-2 border rounded" required/></div>
                    <div className="md:col-span-2"><label>🗓️ Regreso</label><input type="date" id="fechaRegreso" onChange={handleChange} className="w-full p-2 border rounded" required/></div>
                    
                    {/* Inputs de Ruta */}
                    <div className="md:col-span-2"><label>📍 Origen</label><input type="text" id="origen" value={formData.origen} onChange={handleChange} className="w-full p-2 border rounded" required/></div>
                    <div className="md:col-span-2"><label>🏁 Destino</label><input type="text" id="destino" value={formData.destino} onChange={handleChange} className="w-full p-2 border rounded" required/></div>
                    
                    {/* Waypoints */}
                    <div className="md:col-span-4">
                        <label className="flex items-center gap-2 cursor-pointer text-blue-700 font-bold">
                            <input type="checkbox" checked={showWaypoints} onChange={() => setShowWaypoints(!showWaypoints)} /> ➕ Paradas Intermedias
                        </label>
                        {showWaypoints && <input type="text" id="etapas" value={formData.etapas} onChange={handleChange} placeholder="Ej: Valencia" className="w-full p-2 border rounded mt-2"/>}
                    </div>

                    {/* Sliders */}
                    <div className="md:col-span-2">
                        <label>🛣️ Max KM/Día: <span id="kmMaximoDia-value" className="font-bold text-blue-600">{formData.kmMaximoDia}</span></label>
                        <input type="range" id="kmMaximoDia" min="100" max="800" step="50" defaultValue={formData.kmMaximoDia} onChange={handleSliderChange} className="w-full"/>
                    </div>
                    <div className="md:col-span-2">
                        <label>⛽ Consumo: <span id="consumo-value" className="font-bold text-blue-600">{formData.consumo}</span></label>
                        <input type="range" id="consumo" min="5" max="20" step="0.5" defaultValue={formData.consumo} onChange={handleSliderChange} className="w-full"/>
                    </div>
                    <div className="md:col-span-2"><label>💶 Precio Gasoil</label><input type="number" id="precioGasoil" value={formData.precioGasoil} onChange={handleChange} className="w-full p-2 border rounded"/></div>
                </div>
                <button type="submit" disabled={loading} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400">
                    {loading ? 'Calculando...' : 'Generar Plan de Viaje'}
                </button>
            </section>
        </form>

        {/* RESULTADOS Y MAPA */}
        {results.totalCost !== null && (
            <section className="mt-8 space-y-6">
                {/* Resumen */}
                <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="bg-gray-100 p-3 rounded"><strong>{results.totalDays}</strong> días</div>
                    <div className="bg-gray-100 p-3 rounded"><strong>{results.distanceKm?.toFixed(0)}</strong> km</div>
                    <div className="bg-gray-100 p-3 rounded"><strong>{results.totalCost?.toFixed(2)}</strong> €</div>
                </div>

                {/* EL MAPA INTERACTIVO */}
                <div className="border-2 border-blue-200 rounded-lg overflow-hidden">
                    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={6} onLoad={map => setMap(map)}>
                        {/* Dibuja la ruta azul */}
                        {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
                        
                        {/* Dibuja los marcadores de las paradas tácticas */}
                        {tacticalMarkers.map((marker, i) => (
                            <Marker key={i} position={marker} label={{text: "P", color: "white"}} title={marker.title} />
                        ))}
                    </GoogleMap>
                </div>

                {/* Tabla de Itinerario */}
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left text-gray-600">
                        <thead className="bg-gray-200 text-gray-700 uppercase">
                            <tr><th>Día</th><th>Fecha</th><th>Etapa</th><th>Distancia</th></tr>
                        </thead>
                        <tbody>
                            {results.dailyItinerary?.map((day, i) => (
                                <tr key={i} className={`border-b ${day.isDriving ? 'bg-white' : 'bg-yellow-50'}`}>
                                    <td className="px-4 py-2 font-medium">{day.day}</td>
                                    <td className="px-4 py-2">{day.date}</td>
                                    <td className="px-4 py-2">
                                        {day.isDriving ? 
                                            <span>🚗 {day.from} ➝ <strong>{day.to}</strong></span> : 
                                            <span>🏖️ Estancia en {day.to}</span>}
                                    </td>
                                    <td className="px-4 py-2">{day.isDriving ? `${day.distance.toFixed(0)} km` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        )}
        {results.error && <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">{results.error}</div>}
      </div>
    </main>
  );
}