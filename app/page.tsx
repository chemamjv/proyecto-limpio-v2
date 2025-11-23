// app/page.tsx (VERSIÓN PRO: GEOMETRÍA EXACTA Y NOMBRES REALES)
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
        // Buscamos la localidad, pueblo o área administrativa
        const addressComp = response.results[0].address_components;
        const city = addressComp.find(c => c.types.includes("locality"))?.long_name 
                  || addressComp.find(c => c.types.includes("administrative_area_level_2"))?.long_name
                  || addressComp.find(c => c.types.includes("political"))?.long_name;
        return city || "Punto en Ruta";
      }
    } catch (e) {
      console.error("Error geocoding", e);
    }
    return "Parada en Ruta";
  };

  // --- LÓGICA CORE: CÁLCULO EXACTO ---
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

      // --- ALGORITMO DE PRECISIÓN (METRO A METRO) ---
      const route = result.routes[0];
      const overviewPath = route.overview_path; // Array de miles de puntos exactos
      
      const itinerary: DailyPlan[] = [];
      const newTacticalMarkers: {lat: number, lng: number, title: string}[] = [];
      
      let dayAccumulator = 0;
      let dayStartName = formData.origen; // Empezamos en Origen
      let dayCounter = 1;
      let currentDate = new Date(formData.fechaInicio);
      const maxMeters = formData.kmMaximoDia * 1000;

      const formatDate = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const addDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };

      // Recorremos la línea azul punto por punto
      for (let i = 0; i < overviewPath.length - 1; i++) {
        const point1 = overviewPath[i];
        const point2 = overviewPath[i+1];
        
        // Calculamos distancia exacta entre estos dos puntitos
        const segmentDist = google.maps.geometry.spherical.computeDistanceBetween(point1, point2);
        
        if (dayAccumulator + segmentDist > maxMeters) {
            // ¡STOP! Hemos superado el límite justo aquí
            
            // 1. Obtener nombre real
            const lat = point1.lat();
            const lng = point1.lng();
            const cityName = await getCityName(lat, lng);
            const stopTitle = `📍 Parada Táctica: ${cityName}`;

            // 2. Guardar Itinerario
            itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate),
                from: dayStartName,
                to: stopTitle,
                distance: (dayAccumulator + segmentDist) / 1000,
                isDriving: true
            });

            // 3. Crear marcador
            newTacticalMarkers.push({ lat, lng, title: stopTitle });

            // 4. Resetear para mañana
            dayCounter++;
            currentDate = addDay(currentDate);
            dayAccumulator = 0;
            dayStartName = stopTitle; // Mañana salimos de aquí
        } else {
            dayAccumulator += segmentDist;
        }
      }

      // Añadir el último tramo hasta el destino final
      if (dayAccumulator > 0) {
        itinerary.push({
            day: dayCounter,
            date: formatDate(currentDate),
            from: dayStartName,
            to: formData.destino, // Destino final exacto
            distance: dayAccumulator / 1000,
            isDriving: true
        });
        dayCounter++;
        currentDate = addDay(currentDate);
      }

      // --- CÁLCULO DE ESTANCIA ---
      const arrivalDate = new Date(currentDate);
      const returnDateObj = new Date(formData.fechaRegreso);
      const diffTime = returnDateObj.getTime() - arrivalDate.getTime();
      const stayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (stayDays > 0) {
        for(let i=0; i < stayDays; i++) {
             itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate),
                from: formData.destino,
                to: formData.destino,
                distance: 0,
                isDriving: false
            });
            dayCounter++;
            currentDate = addDay(currentDate);
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
        totalDays: dayCounter - 1,
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

  if (!isLoaded) return <div className="flex justify-center items-center h-screen text-black font-bold">Cargando Mapa...</div>;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-8 text-gray-900">
      <div className="w-full max-w-4xl bg-white shadow-xl rounded-lg p-8">
        <h1 className="text-4xl font-extrabold text-blue-800 mb-6 border-b pb-2">🚐 Planificador de Ruta Camper 🗺️</h1>
        
        <form onSubmit={calculateRoute}>
            <section className="bg-blue-50 p-6 rounded-md border border-blue-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-6">
                    {/* Inputs corregidos para verse en negro */}
                    <div className="md:col-span-2"><label className="font-bold">📅 Inicio</label><input type="date" id="fechaInicio" onChange={handleChange} className="w-full p-2 border rounded text-black" required/></div>
                    <div className="md:col-span-2"><label className="font-bold">🗓️ Regreso</label><input type="date" id="fechaRegreso" onChange={handleChange} className="w-full p-2 border rounded text-black" required/></div>
                    <div className="md:col-span-2"><label className="font-bold">📍 Origen</label><input type="text" id="origen" value={formData.origen} onChange={handleChange} className="w-full p-2 border rounded text-black" required/></div>
                    <div className="md:col-span-2"><label className="font-bold">🏁 Destino</label><input type="text" id="destino" value={formData.destino} onChange={handleChange} className="w-full p-2 border rounded text-black" required/></div>
                    
                    <div className="md:col-span-4">
                        <label className="flex items-center gap-2 cursor-pointer text-blue-700 font-bold">
                            <input type="checkbox" checked={showWaypoints} onChange={() => setShowWaypoints(!showWaypoints)} /> ➕ Paradas Intermedias (Waypoints)
                        </label>
                        {showWaypoints && <input type="text" id="etapas" value={formData.etapas} onChange={handleChange} placeholder="Ej: Valencia, Madrid" className="w-full p-2 border rounded mt-2 text-black"/>}
                    </div>

                    <div className="md:col-span-2"><label className="font-bold">🛣️ Max KM/Día: <span className="text-blue-600">{formData.kmMaximoDia}</span></label><input type="range" id="kmMaximoDia" min="100" max="800" step="50" defaultValue={formData.kmMaximoDia} onChange={handleSliderChange} className="w-full"/></div>
                    <div className="md:col-span-2"><label className="font-bold">⛽ Consumo: <span className="text-blue-600">{formData.consumo}</span></label><input type="range" id="consumo" min="5" max="20" step="0.5" defaultValue={formData.consumo} onChange={handleSliderChange} className="w-full"/></div>
                    <div className="md:col-span-2"><label className="font-bold">💶 Precio Gasoil</label><input type="number" id="precioGasoil" value={formData.precioGasoil} onChange={handleChange} className="w-full p-2 border rounded text-black"/></div>
                </div>
                <button type="submit" disabled={loading} className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-400">
                    {loading ? 'Calculando Ruta Exacta...' : 'Generar Plan de Viaje 🚀'}
                </button>
            </section>
        </form>

        {results.totalCost !== null && (
            <section className="mt-8 space-y-6">
                <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="bg-blue-50 p-4 rounded shadow">
                        <p className="text-3xl font-bold text-gray-800">{results.totalDays}</p>
                        <p className="text-xs text-gray-600 uppercase font-bold">Días</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded shadow">
                        <p className="text-3xl font-bold text-gray-800">{results.distanceKm?.toFixed(0)}</p>
                        <p className="text-xs text-gray-600 uppercase font-bold">Km Total</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded shadow">
                        <p className="text-3xl font-bold text-gray-800">{(results.distanceKm! / 100 * formData.consumo).toFixed(0)}</p>
                        <p className="text-xs text-gray-600 uppercase font-bold">Litros</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded shadow">
                        <p className="text-3xl font-bold text-red-600">{results.totalCost?.toFixed(0)} €</p>
                        <p className="text-xs text-gray-600 uppercase font-bold">Coste</p>
                    </div>
                </div>

                <div className="border-4 border-blue-200 rounded-lg overflow-hidden shadow-lg h-[500px]">
                    <GoogleMap mapContainerStyle={{width: '100%', height: '100%'}} center={center} zoom={6} onLoad={map => setMap(map)}>
                        {directionsResponse && <DirectionsRenderer directions={directionsResponse} />}
                        {tacticalMarkers.map((marker, i) => (
                            <Marker key={i} position={marker} label={{text: "P", color: "white", fontWeight: "bold"}} title={marker.title} />
                        ))}
                    </GoogleMap>
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200 shadow">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-blue-600 text-white uppercase font-bold">
                            <tr>
                                <th className="px-6 py-3">Día</th>
                                <th className="px-6 py-3">Fecha</th>
                                <th className="px-6 py-3">Ruta / Estancia</th>
                                <th className="px-6 py-3">Distancia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {results.dailyItinerary?.map((day, i) => (
                                <tr key={i} className={`hover:bg-gray-50 ${day.isDriving ? '' : 'bg-yellow-50'}`}>
                                    <td className="px-6 py-4 font-bold text-gray-900">{day.day}</td>
                                    <td className="px-6 py-4 text-gray-600">{day.date}</td>
                                    <td className="px-6 py-4">
                                        {day.isDriving ? 
                                            <span className="text-gray-800 font-medium">🚗 {day.from} <span className="text-gray-400 mx-1">➝</span> <span className="text-blue-700">{day.to}</span></span> : 
                                            <span className="text-orange-600 font-bold italic">🏖️ Estancia en {day.to}</span>}
                                    </td>
                                    <td className="px-6 py-4 font-mono font-bold text-gray-700">{day.isDriving ? `${day.distance.toFixed(0)} km` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        )}
        {results.error && <div className="mt-4 p-4 bg-red-100 text-red-700 rounded font-bold border border-red-300">{results.error}</div>}
      </div>
    </main>
  );
}