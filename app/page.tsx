// app/page.tsx (CORRECCIÓN CSS COMPATIBLE)
'use client';

import React, { useState } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';

// --- CONFIGURACIÓN VISUAL DEL MAPA ---
const containerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem'
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

// --- ICONOS SVG ---
const IconCalendar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
);
const IconMap = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7" /></svg>
);
const IconFuel = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
);
const IconWallet = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);

export default function Home() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES
  });

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

  // --- HANDLERS ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: (id === 'precioGasoil' || id === 'consumo') ? parseFloat(value) : value }));
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: parseFloat(e.target.value) }));
  };

  // --- LÓGICA GEOCODING Y CÁLCULO ---
  const getCityName = async (lat: number, lng: number): Promise<string> => {
    const geocoder = new google.maps.Geocoder();
    try {
      const response = await geocoder.geocode({ location: { lat, lng } });
      if (response.results[0]) {
        const addressComp = response.results[0].address_components;
        const city = addressComp.find(c => c.types.includes("locality"))?.long_name 
                  || addressComp.find(c => c.types.includes("administrative_area_level_2"))?.long_name
                  || addressComp.find(c => c.types.includes("sublocality"))?.long_name;
        return city ? city.replace(/\d+/, '').trim() : "Punto en Ruta";
      }
    } catch (e) { console.error("Error geocoding", e); }
    return "Parada en Ruta";
  };

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

      const route = result.routes[0];
      const itinerary: DailyPlan[] = [];
      const newTacticalMarkers: {lat: number, lng: number, title: string}[] = [];
      
      let dayCounter = 1;
      let currentDate = new Date(formData.fechaInicio);
      const maxMeters = formData.kmMaximoDia * 1000;
      const formatDate = (d: Date) => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const addDay = (d: Date) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; };

      let currentLegStartName = formData.origen;

      for (let i = 0; i < route.legs.length; i++) {
        const leg = route.legs[i];
        let legPoints: google.maps.LatLng[] = [];
        leg.steps.forEach(step => { if(step.path) legPoints = legPoints.concat(step.path); });

        let legAccumulator = 0;
        let segmentStartName = currentLegStartName;

        for (let j = 0; j < legPoints.length - 1; j++) {
            const point1 = legPoints[j];
            const point2 = legPoints[j+1];
            const segmentDist = google.maps.geometry.spherical.computeDistanceBetween(point1, point2);

            if (legAccumulator + segmentDist > maxMeters) {
                const lat = point1.lat();
                const lng = point1.lng();
                const cityName = await getCityName(lat, lng);
                const stopTitle = `📍 Parada Táctica: ${cityName}`;

                itinerary.push({
                    day: dayCounter,
                    date: formatDate(currentDate),
                    from: segmentStartName,
                    to: stopTitle,
                    distance: (legAccumulator + segmentDist) / 1000,
                    isDriving: true
                });

                newTacticalMarkers.push({ lat, lng, title: stopTitle });
                dayCounter++;
                currentDate = addDay(currentDate);
                legAccumulator = 0;
                segmentStartName = stopTitle;
            } else {
                legAccumulator += segmentDist;
            }
        }

        let endLegName = "Destino Intermedio";
        if (leg.end_address) endLegName = leg.end_address.split(',')[0];
        if (i === route.legs.length - 1) endLegName = formData.destino;
        else {
             const parts = leg.end_address.split(',');
             endLegName = parts.length > 1 ? parts[parts.length - 2].trim() : parts[0];
             endLegName = endLegName.replace(/\d{5}/, '').trim();
        }

        if (legAccumulator > 0 || segmentStartName !== endLegName) {
            itinerary.push({
                day: dayCounter,
                date: formatDate(currentDate),
                from: segmentStartName,
                to: endLegName,
                distance: legAccumulator / 1000,
                isDriving: true
            });
            currentLegStartName = endLegName;
        }
      }

      const arrivalDate = new Date(currentDate);
      const returnDateObj = new Date(formData.fechaRegreso);
      const diffTime = returnDateObj.getTime() - arrivalDate.getTime();
      const stayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (stayDays > 0) {
        for(let i=0; i < stayDays; i++) {
             dayCounter++;
             currentDate = addDay(currentDate);
             itinerary.push({ day: dayCounter, date: formatDate(currentDate), from: formData.destino, to: formData.destino, distance: 0, isDriving: false });
        }
      }

      let totalDistMeters = 0;
      route.legs.forEach(l => totalDistMeters += l.distance?.value || 0);
      const totalKm = totalDistMeters / 1000;
      const liters = (totalKm / 100) * formData.consumo;
      const cost = liters * formData.precioGasoil;

      setTacticalMarkers(newTacticalMarkers);
      setResults({ totalDays: dayCounter, distanceKm: totalKm, totalCost: cost, dailyItinerary: itinerary, error: null });

    } catch (error: any) {
      console.error("Error:", error);
      setResults(prev => ({...prev, error: "Error al calcular. Verifica las ciudades."}));
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return <div className="flex justify-center items-center h-screen bg-gray-50 text-blue-600 font-bold text-xl animate-pulse">Cargando Mapas...</div>;

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center py-10 px-4 font-sans text-gray-900">
      <div className="w-full max-w-6xl space-y-8">
        
        {/* CABECERA */}
        <div className="text-center space-y-2">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-teal-500 drop-shadow-sm">
                Ruta Camper Pro 🚐
            </h1>
            <p className="text-gray-500 text-lg">Planifica tu aventura kilómetro a kilómetro</p>
        </div>
        
        {/* TARJETA DEL FORMULARIO */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="bg-blue-600 px-6 py-4">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                    ⚙️ Configuración del Viaje
                </h2>
            </div>
            
            <form onSubmit={calculateRoute} className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Fechas */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Inicio</label>
                        <input type="date" id="fechaInicio" onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition" required/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Regreso</label>
                        <input type="date" id="fechaRegreso" onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition" required/>
                    </div>
                    
                    {/* Ruta */}
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Origen</label>
                        <input type="text" id="origen" value={formData.origen} onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition placeholder-gray-400" required/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Destino</label>
                        <input type="text" id="destino" value={formData.destino} onChange={handleChange} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition placeholder-gray-400" required/>
                    </div>
                    
                    {/* Waypoints */}
                    <div className="md:col-span-2 lg:col-span-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <label className="flex items-center gap-3 cursor-pointer text-blue-800 font-bold text-sm mb-2 select-none">
                            <input type="checkbox" className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked={showWaypoints} onChange={() => setShowWaypoints(!showWaypoints)} /> 
                            ➕ Añadir Paradas Intermedias
                        </label>
                        {showWaypoints && (
                            <input type="text" id="etapas" value={formData.etapas} onChange={handleChange} placeholder="Ej: Valencia, Madrid (separadas por comas)" className="w-full p-3 bg-white border border-blue-200 rounded-lg mt-1 text-gray-900 focus:ring-2 focus:ring-blue-500 transition"/>
                        )}
                    </div>

                    {/* Sliders de Control */}
                    <div className="md:col-span-2 space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-gray-700">🛣️ Ritmo de Viaje</label>
                            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">{formData.kmMaximoDia} km/día</span>
                        </div>
                        <input type="range" id="kmMaximoDia" min="100" max="1000" step="50" defaultValue={formData.kmMaximoDia} onChange={handleSliderChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                        <div className="flex justify-between text-xs text-gray-400 font-medium"><span>Relax (100)</span><span>Express (1000)</span></div>
                    </div>

                    <div className="md:col-span-2 space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-gray-700">⛽ Consumo Vehículo</label>
                            <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded">{formData.consumo} L/100</span>
                        </div>
                        <input type="range" id="consumo" min="5" max="25" step="0.5" defaultValue={formData.consumo} onChange={handleSliderChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"/>
                         <div className="flex justify-between text-xs text-gray-400 font-medium"><span>Eficiente (5)</span><span>Pesado (25)</span></div>
                    </div>
                    
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Precio Gasoil (€)</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">€</span>
                            <input type="number" id="precioGasoil" value={formData.precioGasoil} onChange={handleChange} className="w-full pl-8 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-green-500 focus:bg-white transition" step="0.01"/>
                        </div>
                    </div>
                     <div className="md:col-span-3 lg:col-span-3 flex items-end">
                        <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-700 to-blue-600 text-white py-3.5 rounded-xl font-bold text-lg hover:from-blue-800 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                            {loading ? 'Calculando Ruta...' : '🚀 Calcular Itinerario'}
                        </button>
                    </div>
                </div>
            </form>
        </div>

        {/* SECCIÓN DE RESULTADOS */}
        {results.totalCost !== null && (
            <div className="space-y-8">
                
                {/* DASHBOARD DE DATOS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 transition hover:shadow-md">
                        <div className="p-3 bg-blue-50 rounded-full"><IconCalendar /></div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800">{results.totalDays}</p>
                            <p className="text-xs text-gray-500 font-bold uppercase">Días</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 transition hover:shadow-md">
                        <div className="p-3 bg-blue-50 rounded-full"><IconMap /></div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800">{results.distanceKm?.toFixed(0)}</p>
                            <p className="text-xs text-gray-500 font-bold uppercase">Km Total</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 transition hover:shadow-md">
                        <div className="p-3 bg-purple-50 rounded-full"><IconFuel /></div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800">{(results.distanceKm! / 100 * formData.consumo).toFixed(0)}</p>
                            <p className="text-xs text-gray-500 font-bold uppercase">Litros</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 transition hover:shadow-md">
                        <div className="p-3 bg-green-50 rounded-full"><IconWallet /></div>
                        <div>
                            <p className="text-2xl font-extrabold text-green-600">{results.totalCost?.toFixed(0)} €</p>
                            <p className="text-xs text-gray-500 font-bold uppercase">Coste Aprox.</p>
                        </div>
                    </div>
                </div>

                {/* CONTENEDOR MAPA + TABLA (GRID) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* MAPA (Ocupa 2 columnas en pantallas grandes) */}
                    <div className="lg:col-span-2 h-[500px] bg-gray-200 rounded-2xl shadow-lg overflow-hidden border-4 border-white relative">
                        <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={6} onLoad={map => setMap(map)}>
                            {directionsResponse && <DirectionsRenderer directions={directionsResponse} options={{ suppressMarkers: false, polylineOptions: { strokeColor: "#2563EB", strokeWeight: 5 } }} />}
                            {tacticalMarkers.map((marker, i) => (
                                <Marker key={i} position={marker} label={{text: "P", color: "white", fontWeight: "bold"}} title={marker.title} />
                            ))}
                        </GoogleMap>
                    </div>

                    {/* LISTA RESUMEN VERTICAL (TIMELINE) */}
                    <div className="lg:col-span-1 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden flex flex-col h-[500px]">
                        <div className="bg-gray-50 p-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2">📋 Hoja de Ruta Detallada</h3>
                        </div>
                        <div className="overflow-y-auto flex-1 p-0">
                            <table className="min-w-full text-sm text-left">
                                <tbody className="divide-y divide-gray-100">
                                    {results.dailyItinerary?.map((day, i) => (
                                        <tr key={i} className={`group transition duration-150 ${day.isDriving ? 'hover:bg-blue-50' : 'bg-orange-50 hover:bg-orange-100'}`}>
                                            <td className="px-4 py-4 align-top w-12">
                                                <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs shadow-sm ${day.isDriving ? 'bg-blue-600 text-white' : 'bg-orange-400 text-white'}`}>
                                                    {day.day}
                                                </div>
                                            </td>
                                            <td className="px-2 py-4 align-top">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{day.date}</span>
                                                    {day.isDriving ? (
                                                        <>
                                                            <div className="font-semibold text-gray-800">{day.from}</div>
                                                            <div className="text-gray-400 text-xs pl-1 border-l-2 border-gray-200 my-1">⬇ {day.distance.toFixed(0)} km</div>
                                                            <div className="font-bold text-blue-700">{day.to}</div>
                                                        </>
                                                    ) : (
                                                        <div className="font-bold text-orange-700 flex items-center gap-2">
                                                            <span>🏖️</span> Estancia en {day.to}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        )}
        
        {results.error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center justify-center font-bold animate-bounce">
                ⚠️ {results.error}
            </div>
        )}
      </div>
    </main>
  );
}