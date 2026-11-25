import { Star } from 'lucide-react';

export default function ReviewStars({ rating }) {
  return <span className="reviews-stars" aria-label={`${rating} trên 5 sao`}>{[1, 2, 3, 4, 5].map(value =>
    <Star key={value} size={16} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" className={value <= rating ? '' : 'reviews-star-empty'} />)}<strong>{rating}/5</strong></span>;
}
