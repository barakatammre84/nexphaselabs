import Image from 'next/image';

type Props = {
  code: string;
  name: string;
  image?: string | null;
  sizes: string;
  /** Extra classes on the <Image>, e.g. hover transforms. */
  imageClassName?: string;
  priority?: boolean;
};

/**
 * Product photograph, or an honest placeholder.
 *
 * CLAUDE.md rule 5: where no photograph of a material exists the page says so.
 * We never show another compound's vial in its place — a sighted visitor
 * would read it as a photo of this material.
 */
/** A repository asset path renders directly; an R2 key renders through the public image route. */
export function productImageSrc(code: string, image: string): string {
  return image.startsWith('/') ? image : `/api/products/${code}/image`;
}

export function ProductImage({
  code,
  name,
  image,
  sizes,
  imageClassName = '',
  priority = false,
}: Props) {
  if (image) {
    const uploaded = !image.startsWith('/');
    return (
      <Image
        src={productImageSrc(code, image)}
        alt={`${name} reference vial`}
        fill
        priority={priority}
        unoptimized={uploaded}
        className={`${imageClassName.includes('object-contain') ? 'object-contain' : 'object-cover'} mix-blend-multiply ${imageClassName}`}
        sizes={sizes}
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {code}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        No photograph on file
      </span>
    </div>
  );
}
