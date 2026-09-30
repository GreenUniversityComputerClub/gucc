import { cn } from "@/lib/utils";

/**
 * A cover or banner of any size and shape, shown whole inside a fixed frame: very wide, very tall
 * or very large pictures never spill out of the box or push the page around, and posters are never
 * cropped. The space around a picture that doesn't match the frame is a soft blur of the picture
 * itself, so it still fills the box.
 */
export function FramedImage({ src, alt, className, eager = false, ratio = "aspect-video" }: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  /** The frame's shape, as a Tailwind aspect class. */
  ratio?: string;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", ratio, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" loading={eager ? "eager" : "lazy"} decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="relative h-full w-full object-contain" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" />
    </div>
  );
}
