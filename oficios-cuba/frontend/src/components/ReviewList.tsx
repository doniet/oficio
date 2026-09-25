import { useState } from 'react';
import { Star } from 'lucide-react';
import { reviewApi, apiError } from '../services/api';
import { relativeTime } from '../lib/format';
import type { Review } from '../types';
import { Alert, Avatar, Spinner, Stars, cn } from './ui';

export function ReviewItem({ review, showService = false }: { review: Review; showService?: boolean }) {
  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Avatar src={review.client_avatar} name={review.client_name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="font-semibold text-ink-900">{review.client_name}</p>
            <span className="text-xs text-ink-400">{relativeTime(review.created_at)}</span>
          </div>
          <Stars value={review.rating} size="h-3.5 w-3.5" className="mt-1" />
          {showService && review.service_title && (
            <p className="mt-1.5 text-xs font-medium text-ink-500">Servicio: {review.service_title}</p>
          )}
          {review.comment && <p className="mt-2 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink-700">{review.comment}</p>}
        </div>
      </div>
    </li>
  );
}

/** Barras 5→1 con el porcentaje de cada puntuación. */
export function RatingBreakdown({ rating, count, distribution }: { rating: number; count: number; distribution: { rating: number; count: number }[] }) {
  const byRating = new Map(distribution.map((d) => [d.rating, d.count]));
  return (
    <div className="flex items-center gap-6">
      <div className="text-center">
        <p className="font-display text-5xl font-bold leading-none text-ink-900">{rating.toFixed(1)}</p>
        <Stars value={rating} className="mt-2" />
        <p className="mt-1 text-xs text-ink-400">{count} {count === 1 ? 'reseña' : 'reseñas'}</p>
      </div>
      <ul className="flex-1 space-y-1.5" aria-label="Distribución de puntuaciones">
        {[5, 4, 3, 2, 1].map((r) => {
          const n = byRating.get(r) ?? 0;
          const pct = count ? Math.round((n / count) * 100) : 0;
          return (
            <li key={r} className="flex items-center gap-2 text-xs text-ink-500">
              <span className="w-3 text-right font-semibold">{r}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums" aria-label={`${n} reseñas de ${r} estrellas`}>{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const LABELS = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

export function ReviewForm({ serviceId, onCreated }: { serviceId: string; onCreated: (r: Review) => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const shown = hover || rating;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError('Elige de 1 a 5 estrellas.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await reviewApi.create({ service_id: serviceId, rating, comment: comment.trim() || undefined });
      onCreated(res.data.review);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-sand-50 p-4 sm:p-5">
      <h3 className="font-sans text-base font-bold">Cuenta cómo te fue</h3>
      <fieldset className="mt-3">
        <legend className="sr-only">Puntuación</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <label key={i} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(i)}>
              <input type="radio" name="rating" value={i} checked={rating === i} onChange={() => setRating(i)} className="peer sr-only" />
              <Star
                className={cn('h-8 w-8 transition peer-focus-visible:rounded peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500', i <= shown ? 'fill-amber-400 text-amber-400' : 'fill-sand-200 text-sand-200')}
                aria-hidden="true"
              />
              <span className="sr-only">{i} {i === 1 ? 'estrella' : 'estrellas'}</span>
            </label>
          ))}
          <span className="ml-2 text-sm font-semibold text-ink-600" aria-live="polite">{LABELS[shown]}</span>
        </div>
      </fieldset>
      <label htmlFor="review-comment" className="label mt-4">Comentario <span className="font-normal text-ink-400">(opcional)</span></label>
      <textarea
        id="review-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={1000}
        className="input resize-none"
        placeholder="¿Fue puntual? ¿Quedaste satisfecho con el trabajo?"
      />
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <button type="submit" disabled={sending} className="btn-primary mt-4 w-full sm:w-auto">
        {sending && <Spinner className="h-4 w-4" />} Publicar reseña
      </button>
    </form>
  );
}
