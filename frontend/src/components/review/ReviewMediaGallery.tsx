import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import type { ReviewImage } from '../../services/reviewService';
import styles from './ReviewMediaGallery.module.css';

type Props = { images?: readonly ReviewImage[]; username: string };

// Keep image rendering separate so future media types can supply their own renderer.
function ReviewPhoto({ image, alt, thumbnail = false }: {
  image: ReviewImage; alt: string; thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={styles.fallback} role="img" aria-label={`${alt}: không tải được ảnh`}>
      <ImageOff size={24} aria-hidden="true" />
      {!thumbnail && <span>Không tải được ảnh. Vui lòng chọn ảnh khác.</span>}
    </span>
  ) : (
    <img src={image.imageUrl} alt={alt} loading={thumbnail ? 'lazy' : 'eager'}
      onError={() => setFailed(true)} />
  );
}

export default function ReviewMediaGallery({ images = [], username }: Props) {
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const thumbnails = useRef<(HTMLButtonElement | null)[]>([]);
  const viewerId = useId();
  const media = [...images].sort((a, b) => a.imagePosition - b.imagePosition);
  const selected = selectedMediaIndex === null ? undefined : media[selectedMediaIndex];

  function close() {
    if (selectedMediaIndex !== null) thumbnails.current[selectedMediaIndex]?.focus({ preventScroll: true });
    setSelectedMediaIndex(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!selected || selectedMediaIndex === null) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setSelectedMediaIndex(Math.max(0, Math.min(media.length - 1,
        selectedMediaIndex + (event.key === 'ArrowRight' ? 1 : -1))));
    }
  }

  if (!media.length) return null;

  return (
    <section className={styles.gallery} aria-label={`Ảnh đánh giá của ${username}`} onKeyDown={onKeyDown}>
      <div className={styles.thumbnails}>
        {media.map((image, index) => (
          <button key={`${image.imagePosition}:${image.imageUrl}`} type="button"
            ref={node => { thumbnails.current[index] = node; }}
            className={styles.thumbnail} aria-label={`Xem ảnh đánh giá ${index + 1} của ${username}`}
            aria-expanded={selectedMediaIndex === index} aria-controls={selected ? viewerId : undefined}
            aria-pressed={selectedMediaIndex === index}
            onClick={() => setSelectedMediaIndex(selectedMediaIndex === index ? null : index)}>
            <ReviewPhoto image={image} alt={`Ảnh đánh giá ${index + 1} của ${username}`} thumbnail />
          </button>
        ))}
      </div>
      {selected && selectedMediaIndex !== null && (
        <div id={viewerId} className={styles.viewer} role="group" aria-label="Trình xem ảnh đánh giá">
          <ReviewPhoto key={selected.imageUrl} image={selected}
            alt={`Ảnh đánh giá ${selectedMediaIndex + 1} của ${username}`} />
          <button type="button" className={`${styles.control} ${styles.close}`} aria-label="Đóng trình xem ảnh" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
          {media.length > 1 && <>
            <button type="button" className={`${styles.control} ${styles.previous}`} aria-label="Ảnh trước"
              disabled={selectedMediaIndex === 0} onClick={() => setSelectedMediaIndex(selectedMediaIndex - 1)}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className={`${styles.control} ${styles.next}`} aria-label="Ảnh tiếp theo"
              disabled={selectedMediaIndex === media.length - 1} onClick={() => setSelectedMediaIndex(selectedMediaIndex + 1)}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </>}
          <span className={styles.counter} role="status" aria-live="polite" aria-atomic="true">
            {selectedMediaIndex + 1}/{media.length}
          </span>
        </div>
      )}
    </section>
  );
}
