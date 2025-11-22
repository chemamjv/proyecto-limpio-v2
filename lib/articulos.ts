 // lib/articulos.ts (Lógica de Búsqueda de Datos)

import articulosData from '../data/articulos.json';

interface Articulo {
    id: number;
    titulo: string;
    fecha: string;
    extracto: string;
    autor: string;
    contenido: string; 
}

// 1. Obtener la lista completa de artículos
export function getArticulos(): Articulo[] {
    // La importación estática ya maneja la lectura del JSON
    return articulosData as Articulo[];
}

// 2. Buscar un artículo por su ID (slug)
export function getArticuloById(slug: string): Articulo | undefined {
    // ⬅️ CRÍTICO: Convertimos el SLUG (string) a número para buscar en el JSON
    const idNumero = parseInt(slug); 
    const articulos = getArticulos();
    
    // Devolvemos el artículo cuyo ID numérico coincide
    return articulos.find(a => a.id === idNumero); 
}

// 3. Obtener todos los IDs para la generación estática de rutas (generateStaticParams)
export function getAllArticuloIds() {
    const articulos = getArticulos();
    return articulos.map(a => ({
        // El campo debe llamarse 'id' aquí para la función de búsqueda
        id: a.id.toString() 
    }));
}
