import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { serviceApi, categoryApi, providerApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { Service, Category } from '../../types';
import { Loader2, Save, ArrowLeft, Building2, Tag, DollarSign, Image, Eye, X } from 'lucide-react';

const priceTypes = [
  { value: 'fixed', label: 'Precio fijo' },
  { value: 'hourly', label: 'Por hora' },
  { value: 'daily', label: 'Por día' },
  { value: 'negotiable', label: 'Negociable' },
];

export default function ServiceForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = !!id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    category_id: '',
    title: '',
    description: '',
    price_min: '',
    price_max: '',
    price_type: 'negotiable' as 'fixed' | 'hourly' | 'daily' | 'negotiable',
    images: [] as string[],
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await categoryApi.getFlat();
        setCategories(res.data.categories.filter(c => c.parent_id));
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (isEditing) {
      const fetchService = async () => {
        try {
          const res = await serviceApi.getById(id!);
          const service = res.data.service;
          setFormData({
            category_id: service.category_id,
            title: service.title,
            description: service.description || '',
            price_min: service.price_min?.toString() || '',
            price_max: service.price_max?.toString() || '',
            price_type: service.price_type,
            images: service.images || [],
          });
          setImagePreviews(service.images || []);
        } catch (error) {
          console.error('Error fetching service:', error);
          setError('Error al cargar el servicio');
        } finally {
          setLoading(false);
        }
      };
      fetchService();
    } else {
      setLoading(false);
    }
  }, [id, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // In a real app, you would upload to a storage service (S3, Cloudinary, etc.)
    // For now, we'll create object URLs for preview
    const previews = files.map(file => URL.createObjectURL(file));
    setImagePreviews(prev => [...prev, ...previews].slice(0, 5));
    
    // Convert to base64 or upload - for demo we'll use data URLs
    for (const file of files) {
      const base64 = await fileToBase64(file);
      setFormData(prev => ({ ...prev, images: [...prev.images, base64].slice(0, 5) }));
    }
  };

  const removeImage = (index: number) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const submitData = {
        category_id: formData.category_id,
        title: formData.title,
        description: formData.description,
        price_min: formData.price_min ? Number(formData.price_min) : undefined,
        price_max: formData.price_max ? Number(formData.price_max) : undefined,
        price_type: formData.price_type,
        images: formData.images,
      };

      if (isEditing) {
        await serviceApi.update(id!, submitData);
      } else {
        await serviceApi.create(submitData);
      }

      navigate('/dashboard/servicios');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar el servicio');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard/servicios')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{isEditing ? 'Editar Servicio' : 'Nuevo Servicio'}</h1>
          <p className="text-gray-600 mt-1">Completa la información para que los clientes te encuentren</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card overflow-hidden">
          <div className="p-6 space-y-6">
            <div>
              <label htmlFor="category_id" className="label">Categoría <span className="text-red-500">*</span></label>
              <select
                id="category_id"
                name="category_id"
                value={formData.category_id}
                onChange={handleChange}
                required
                className="input"
              >
                <option value="">Selecciona una categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="title" className="label">Título del servicio <span className="text-red-500">*</span></label>
              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                required
                maxLength={100}
                className="input"
                placeholder="Ej: Instalación eléctrica residencial, Reparación de fugas, Pintura interior/exterior..."
              />
              <p className="text-sm text-gray-500 mt-1">Sé específico y usa palabras clave que los clientes buscarían</p>
            </div>

            <div>
              <label htmlFor="description" className="label">Descripción detallada <span className="text-red-500">*</span></label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                className="input min-h-[150px] resize-y"
                placeholder="Describe qué incluye el servicio, materiales que usas, tiempo estimado, garantías, zona de cobertura..."
                rows={6}
              />
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary-600" />
                Precio
              </h3>
              <div>
                <label htmlFor="price_type" className="label">Tipo de precio</label>
                <select
                  id="price_type"
                  name="price_type"
                  value={formData.price_type}
                  onChange={handleChange}
                  className="input"
                >
                  {priceTypes.map((pt) => (
                    <option key={pt.value} value={pt.value}>{pt.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label htmlFor="price_min" className="label">Precio mínimo (USD)</label>
                  <input
                    id="price_min"
                    name="price_min"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price_min}
                    onChange={handleChange}
                    className="input"
                    placeholder="0.00"
                    disabled={formData.price_type === 'negotiable'}
                  />
                </div>
                <div>
                  <label htmlFor="price_max" className="label">Precio máximo (USD)</label>
                  <input
                    id="price_max"
                    name="price_max"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price_max}
                    onChange={handleChange}
                    className="input"
                    placeholder="0.00"
                    disabled={formData.price_type === 'negotiable'}
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {formData.price_type === 'negotiable'
                  ? 'El precio se acordará directamente con el cliente'
                  : formData.price_type === 'fixed'
                  ? 'Precio único por el servicio completo'
                  : formData.price_type === 'hourly'
                  ? 'Precio por hora de trabajo'
                  : 'Precio por día de trabajo'}
              </p>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Image className="w-5 h-5 text-primary-600" />
                Imágenes (máximo 5)
              </h3>
              <div className="flex flex-wrap gap-3 mb-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative w-24 h-24 rounded-lg overflow-hidden">
                    <img src={preview} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {imagePreviews.length < 5 && (
                  <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      multiple
                      className="hidden"
                      id={`images-${Date.now()}`}
                    />
                    <span className="text-gray-400">+</span>
                    <span className="text-xs text-gray-500">Agregar</span>
                  </label>
                )}
              </div>
              <p className="text-sm text-gray-500">Formatos: JPG, PNG, WebP. Máx 5MB cada una.</p>
            </div>
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard/servicios')}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {isEditing ? 'Actualizar' : 'Publicar'} servicio
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}