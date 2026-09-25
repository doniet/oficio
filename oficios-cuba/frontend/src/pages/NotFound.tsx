import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Página no encontrada · Oficios Cuba';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="container-page flex min-h-[65vh] flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-[7rem] font-extrabold leading-none text-sand-300 sm:text-[9rem]" aria-hidden="true">
        4<span className="text-brand-500">0</span>4
      </p>
      <h1 className="mt-2 text-balance text-3xl font-bold sm:text-4xl">Esta página no existe</h1>
      <p className="mt-3 max-w-md text-ink-500">
        Puede que el enlace esté mal escrito o que el servicio ya no esté publicado.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="btn-secondary btn-lg">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <Link to="/buscar" className="btn-primary btn-lg">
          <Search className="h-4 w-4" /> Buscar servicios
        </Link>
      </div>
    </div>
  );
}
