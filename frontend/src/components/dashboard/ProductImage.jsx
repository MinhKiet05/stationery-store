import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { productImage } from '../../services/adminProductApi';

export default function ProductImage({ src, alt = '', expanded = false }) {
  const [failed, setFailed] = useState(null);
  const safe = productImage(src);
  return safe && failed !== src ? <img className={expanded ? 'product-expanded-image' : 'product-image'} src={safe} alt={alt} loading="lazy" onError={() => setFailed(src)} /> :
    <span className="product-image product-image-fallback" role="img" aria-label="Chưa có ảnh sản phẩm"><ImageOff size={24} /></span>;
}
