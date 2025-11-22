 // app/blog/[slug]/page.tsx (Página de Detalle del Artículo - Solución Final)

import { getArticuloById, getAllArticuloIds } from '@/lib/articulos'; 
import Link from 'next/link';

// Definición de la estructura del dato (necesaria para TypeScript)
interface Articulo {
    id: number;
    titulo: string;
    fecha: string;
    extracto: string;
    autor: string;
    contenido: string; 
}

// 🛑 1. FUNCIÓN CRUCIAL: GENERAR PARÁMETROS ESTÁTICOS (generateStaticParams)
// Esto le dice a Vercel que cree las rutas /blog/101 y /blog/102.
export async function generateStaticParams() {
  // Obtenemos todos los IDs (ahora llamados slugs) para generar las rutas.
  return getAllArticuloIds().map(articulo => ({
    slug: articulo.id, // El nombre de la propiedad 'slug' debe coincidir con el nombre de la carpeta '[slug]'
  }));
}

// 2. FUNCIÓN PRINCIPAL DE LA PÁGINA DE DETALLE (Async es necesario)
export default async function ArticuloDetallePage({ params }: { params: { slug: string } }) { 
  
  // Obtener el valor de la URL (ej: '101')
  const { slug } = params; 
  
  // Buscar el artículo usando el slug (la función lo convertirá a número para buscar)
  const articulo: Articulo | undefined = getArticuloById(slug);

  // Manejo de error si no encuentra el artículo
  if (!articulo) {
    return (
      <main style={{ maxWidth: '900px', margin: '2rem auto' }}>
        <h1>Artículo no encontrado</h1>
        <p>Lo sentimos, el artículo con ID {slug} no existe.</p>
        <Link href="/blog" style={{ color: '#3498db' }}>Volver a la lista de artículos</Link>
      </main>
    );
  }

  // Muestra el contenido detallado
  return (
    <main style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <Link href="/blog" style={{ textDecoration: 'none', color: '#3498db' }}>
        &lt; Volver a la Lista
      </Link>
      
      <h1 style={{ marginTop: '10px' }}>{articulo.titulo}</h1>
      <p>
        <strong>Autor:</strong> {articulo.autor} | **Fecha:** {articulo.fecha}
      </p>
      
      <div style={{ borderTop: '1px solid #eee', marginTop: '20px', paddingTop: '20px' }}>
        <p>{articulo.extracto}</p>
        <p>{articulo.contenido}</p>
      </div>
      
    </main>
  );
}
