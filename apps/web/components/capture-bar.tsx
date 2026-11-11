import { ICON_SIZE, Icon } from "@/lib/icons";

/** The one line every place that takes a photo carries: what to photograph, and what never to. */
export const PHOTO_RULE = "Photograph the work or the board, never a child.";
export const PhotoRule = () => <p data-photo-rule className="b-capture-rule">{PHOTO_RULE}</p>;

/** Voice note · Photo: two buttons on the panel colour with the note colour's icon, and the rule for photos beneath. */
export function CaptureBar({ voice, photo }: { voice: string; photo: string }) {
  return (
    <div data-block="CaptureBar" className="b-capture">
      <a className="b-btn b-btn-capture" href={voice} data-press>
        <Icon name="record" size={ICON_SIZE.row} />
        Voice note
      </a>
      <a className="b-btn b-btn-capture" href={photo} data-press>
        <Icon name="photo" size={ICON_SIZE.row} />
        Photo
      </a>
      <PhotoRule />
    </div>
  );
}
