/* eslint-disable @next/next/no-img-element */
/** The child's page as photographed, QR corner: the one picture of a child allowed on any screen. */
export function PageImage({ src, caption = "The child's page as photographed", box }: { src?: string; caption?: string; box?: number[] | null }) {
  // the region the engine read an answer from, as fractions of the page: outlined, so a person sees which answer is being asked about
  const [l, t, r, b] = box?.length === 4 ? box.map(Number) : [0, 0, 0, 0];
  return (
    <figure data-block="PageImage" className="b-pimg">
      {src ? (
        // the page at its own size, to read and scroll about in: the picture is a link to it
        <a href={src} target="_blank" rel="noreferrer" aria-label="Open the page at full size" data-page-full="">
          <img src={src} alt={caption} />
        </a>
      ) : null}
      {src && r > l && b > t ? (
        <span data-testid="crop-outline" className="b-box" style={{ left: `${l * 100}%`, top: `${t * 100}%`, width: `${(r - l) * 100}%`, height: `${(b - t) * 100}%` }} />
      ) : null}
      <span className="b-qr" aria-hidden="true" />
      <figcaption className={src ? "b-vh" : undefined}>{caption}</figcaption>
    </figure>
  );
}
