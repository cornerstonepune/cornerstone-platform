/* eslint-disable @next/next/no-img-element */
/** The child's page as photographed, QR corner: the one picture of a child allowed on any screen. */
export function PageImage({ src, caption = "The child's page as photographed" }: { src?: string; caption?: string }) {
  return (
    <figure data-block="PageImage" className="b-pimg">
      {src ? <img src={src} alt={caption} /> : null}
      <span className="b-qr" aria-hidden="true" />
      <figcaption className={src ? "b-vh" : undefined}>{caption}</figcaption>
    </figure>
  );
}
