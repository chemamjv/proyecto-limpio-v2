// app/page.tsx (CORRECCIÓN VISUAL Y LÓGICA DE NOMBRES)
'use client';

import React, { useState } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';

// --- CONFIGURACIÓN DEL MAPA ---
const containerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '0.5rem'
};

const center = {
  lat: 40.416775, 
  lng: -3.703790
};

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
  // 1. CARGA DEL SCRIPT
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
    setFormData(prev => ({ ...prev, [id]: parseFloat(value) }));
  };

  // --- LÓGICA DE CÁLCULO ---
  const calculateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setResults(prev => ({...prev, error: null, dailyItinerary: null}));
    setTacticalMarkers([]); 

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

      setDirectionsResponse(result); 

      // PROCESAMIENTO
      const route = result.routes[0];
      let totalDistMeters = 0;
      const itinerary: DailyPlan[] = [];
      const newTacticalMarkers: {lat: number, lng: number, title: string}[] = [];
      
      let currentDate = new Date(formData.fechaInicio);
      let dayCounter = 1;
      const maxMeters = formData.kmMaximoDia * 1000;

      const formatDate = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const addDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };

      let currentStopName = formData.origen; 

      for (const leg of route.legs) {
        // Corrección: Acumular la distancia total correctamente
        totalDistMeters += leg.distance?.value || 0;
        
        let legAccumulator = 0;
        let segmentStartName = currentStopName;

        for (const step of leg.steps) {
            const stepDist = step.distance?.value || 0;
            
            // Lógica de División
            if (legAccumulator + stepDist > maxMeters) {
                // EXTRACCIÓN DE NOMBRE ROBUSTA (Para que no salga vacío)
                let addressStr = step.end_address || "Punto en Ruta";
                // Quitamos el país si aparece al final
                addressStr = addressStr.replace(", España", "");
                let parts = addressStr.split(",");
                
                // Intentamos coger el elemento más representativo
                let cleanName = parts.length > 1 ? parts[parts.length - 1].trim() : parts[0].trim();
                // Limpieza de códigos postales
                cleanName = cleanName.replace(/^\d{5}\s*/, '').replace(/\s*\d{5}$/, '');

                const tacticalStopName = `📍 Parada Táctica: ${cleanName}`;

                const stepLat = step.end_location.lat();
                const stepLng = step.end_location.lng();
                newTacticalMarkers.push({ lat: stepLat, lng: stepLng, title: tacticalStopName });

                // Añadir etapa
                itinerary.push({
                    day: dayCounter,
                    date: formatDate(currentDate),
                    from: segmentStartName,
                    to: tacticalStopName,
                    distance: (legAccumulator + stepDist) / 1000,
                    isDriving: true
                });

                dayCounter++;
                currentDate = addDay(currentDate);
                legAccumulator = 0; 
                segmentStartName = tacticalStopName;

            } else {
                legAccumulator += stepDist;
            }
        }

        // Final del Leg
        const endLegName = leg.end_address ? leg.end_address.split(',')[0] : "Destino Intermedio";
        currentStopName = endLegName; 

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

      // Estancia
      const arrivalDate = new Date(currentDate); 
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

      // Totales
      const totalKm = totalDistMeters / 1000;
      const liters = (totalKm / 100) * formData.consumo;
      const cost = liters * formData.precioGasoil;

      setTacticalMarkers(newTacticalMarkers);
      setResults({
        totalDays: dayCounter - 1,
        distanceKm: totalKm,
        totalCost: cost,
        dailyItinerary: itinerary,
        error: null
      });

    } catch (error: any) {
      console.error("Error ruta:", error);
      setResults(prev => ({...prev, error: "Error al calcular. Revisa las ciudades."}));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return <div className="flex justify-center items-center h-screen text-black">Cargando Mapa...</div>;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-8 text-gray-900">
      <div className="w-full max-w-4xl bg-white shadow-xl rounded-lg p-8">
        <h1 className="text-4xl font-extrabold text-blue-800 mb-6 border-b pb-2">🚐 Planificador de Ruta Camper 🗺️</h1>
        
        <form onSubmit={calculateRoute}>
            <section className="bg-blue-50 p-6 rounded-md border border-blue-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-6">
                    {/* Inputs con TEXT-BLACK forzado */}
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">📅 Inicio</label>
                        <input type="date" id="fechaInicio" onChange={handleChange} className="w-full p-2 border rounded text-black" required/>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">🗓️ Regreso</label>
                        <input type="date" id="fechaRegreso" onChange={handleChange} className="w-full p-2 border rounded text-black" required/>
                    </div>
                    
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">📍 Origen</label>
                        <input type="text" id="origen" value={formData.origen} onChange={handleChange} className="w-full p-2 border rounded text-black" required/>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">🏁 Destino</label>
                        <input type="text" id="destino" value={formData.destino} onChange={handleChange} className="w-full p-2 border rounded text-black" required/>
                    </div>
                    
                    <div className="md:col-span-4">
                        <label className="flex items-center gap-2 cursor-pointer text-blue-700 font-bold">
                            <input type="checkbox" checked={showWaypoints} onChange={() => setShowWaypoints(!showWaypoints)} /> ➕ Paradas Intermedias
                        </label>
                        {showWaypoints && (
                            <input type="text" id="etapas" value={formData.etapas} onChange={handleChange} placeholder="Ej: Valencia" className="w-full p-2 border rounded mt-2 text-black"/>
                        )}
                    </div>

                    {/* Sliders con valores visibles */}
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">🛣️ Max KM/Día: <span className="font-bold text-blue-600">{formData.kmMaximoDia}</span></label>
                        <input type="range" id="kmMaximoDia" min="100" max="800" step="50" defaultValue={formData.kmMaximoDia} onChange={handleSliderChange} className="w-full"/>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">⛽ Consumo: <span id="consumo-value" className="font-bold text-blue-600">{formData.consumo}</span></label>
                        <input type="range" id="consumo" min="5" max="20" step="0.5" defaultValue={formData.consumo} onChange={handleSliderChange} className="w-full"/>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-gray-700 font-semibold">💶 Precio Gasoil</label>
                        <input type="number" id="precioGasoil" value={formData.precioGasoil} onChange={handleChange} className="w-full p-2 border rounded text-black"/>
                    </div>
                </div>
                <button type="submit" disabled={loading} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400 transition">
                    {loading ? 'Calculando...' : 'Generar Plan de Viaje 🚀'}
                </button>
            </section>
        </form>

        {/* RESULTADOS Y MAPA */}
        {results.totalCost !== null && (
            <section className="mt-8 space-y-6">
                {/* Resumen - Texto Forzado a NEGRO */}
                <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="bg-gray-100 p-3 rounded shadow-sm">
                        <p className="text-2xl font-bold text-gray-800">{results.totalDays}</p>
                        <p className="text-sm text-gray-600">Días</p>
                    </div>
                    <div className="bg-gray-100 p-3 rounded shadow-sm">
                        <p className="text-2xl font-bold text-gray-800">{results.distanceKm?.toFixed(0)}</p>
                        <p className="text-sm text-gray-600">Km Total</p>
                    </div>
                    <div className="bg-gray-100 p-3 rounded shadow-sm">
                        <p className="text-2xl font-bold text-gray-800">{(results.distanceKm! / 100 * formData.consumo).toFixed(0)}</p>
                        <p className="text-sm text-gray-600">Litros</p>
                    </div>
                    <div className="bg-gray-100 p-3 rounded shadow-sm">
                        <p className="text-2xl font-bold text-red-600">{results.totalCost?.toFixed(0)} €</p>
                        <p className="text-sm text-gray-600">Coste</p>
                    </div>
                </div>

                <div className="border-4 border-blue-100 rounded-lg overflow-hidden shadow-lg">
                    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={6} onLoad={map => setMap(map)}>
                        {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
                        {tacticalMarkers.map((marker, i) => (
                            <Marker key={i} position={marker} label={{text: "P", color: "white", fontWeight: "bold"}} title={marker.title} />
                        ))}
                    </GoogleMap>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm text-left text-gray-700">
                        <thead className="bg-blue-100 text-blue-800 uppercase font-bold">
                            <tr>
                                <th className="px-4 py-3">Día</th>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Ruta / Estancia</th>
                                <th className="px-4 py-3">Distancia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {results.dailyItinerary?.map((day, i) => (
                                <tr key={i} className={`hover:bg-gray-50 ${day.isDriving ? 'bg-white' : 'bg-yellow-50'}`}>
                                    <td className="px-4 py-3 font-bold text-gray-900">{day.day}</td>
                                    <td className="px-4 py-3 text-gray-600">{day.date}</td>
                                    <td className="px-4 py-3">
                                        {day.isDriving ? 
                                            <span className="text-gray-800">🚗 {day.from} <span className="text-gray-400">➝</span> <strong>{day.to}</strong></span> : 
                                            <span className="text-orange-600 italic">🏖️ Estancia en {day.to}</span>}
                                    </td>
                                    <td className="px-4 py-3 font-mono">{day.isDriving ? `${day.distance.toFixed(0)} km` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        )}
        {results.error && <div className="mt-4 p-4 bg-red-100 text-red-700 rounded font-bold">{results.error}</div>}
      </div>
    </main>
  );
}