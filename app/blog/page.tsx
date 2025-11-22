 // app/blog/page.tsx (Página que muestra la lista de artículos)

// ⬅️ Importamos la función de la nueva librería
import { getArticulos } from '@/lib/articulos'; 
import Link from 'next/link';

// Interfaz para asegurar la estructura de datos
interface Articulo {
    id: number;
    titulo: string;
    fecha: string;
    extracto: string;
    autor: string;
    contenido: string; 
}

export default function BlogPage() {
    // ⬅️ Leemos los datos usando la función que lee el JSON
    const articulos: Articulo[] = getArticulos(); 

    return (
        <main style={{ maxWidth: '900px', margin: '2rem auto' }}>
            <h1>Artículos Recientes de Chema's Blog</h1>
            
            {/* Bucle .map() para mostrar cada artículo */}
            {articulos.map((articulo) => (
                <div key={articulo.id} style={{ 
                    border: '1px solid #ccc', 
                    padding: '20px', 
                    marginBottom: '15px',
                    borderRadius: '8px'
                }}>
                    
                    {/* Título como ENLACE DINÁMICO a /blog/101 o /blog/102 */}
                    <Link 
                        href={`/blog/${articulo.id}`} 
                        style={{ textDecoration: 'none', color: '#2c3e50' }}
                    >
                        <h2>{articulo.titulo}</h2>
                    </Link>
                    
                    <p><strong>Autor:</strong> {articulo.autor} | <strong>Fecha:</strong> {articulo.fecha}</p>
                    <p>{articulo.extracto}</p>
                    
                    {/* Botón de "Leer Más" */}
                    <Link href={`/blog/${articulo.id}`}>
                        <button style={{ backgroundColor: '#2c3e50', color: 'white', padding: '10px', border: 'none', cursor: 'pointer' }}>
                            Leer Más
                        </button>
                    </Link>
                </div>
            ))}
        </main>
    );
}
