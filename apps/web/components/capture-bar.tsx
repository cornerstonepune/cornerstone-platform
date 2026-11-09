import { ICON_SIZE, Icon } from "@/lib/icons";

/** Voice note · Photo: two buttons on the panel colour with the note colour's icon. */
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
    </div>
  );
}
