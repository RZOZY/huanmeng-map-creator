import { pointer } from "d3";
import { closeDialogs } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { stopMapPlacement, toggleMapPlacement } from "@/components/map-placement";
import { Controllers } from "@/controllers";
import { createLabelArc } from "@/renderers/labels/label-arc";
import { getMapModelEpoch, isMapModelStable } from "@/services/io/model-status";

function toggle(): void {
  if (document.getElementById("addLabel")?.classList.contains("pressed")) {
    stopMapPlacement();
    return;
  }

  closeDialogs(".stable");
  let active = true;
  toggleMapPlacement(
    "addLabel",
    event => addOnClick(event, () => active),
    "Click on map to place label. Hold Shift to add multiple",
    undefined,
    () => {
      active = false;
    }
  );
  Layers.show("labels");
}

async function addOnClick(event: MouseEvent, isActive: () => boolean): Promise<void> {
  if (!isActive() || !isMapModelStable()) return;
  const epoch = getMapModelEpoch();
  const source = pack;
  const point = pointer(event, event.currentTarget as SVGGElement);
  const cell = Pack.findCell(point[0], point[1]);
  if (cell === undefined) return;

  const text = Names.getCulture(source.cells.culture[cell]);
  const lastSelected = await Controllers.LabelsEditor.getLastSelectedGroup();
  if (!isActive() || !isMapModelStable() || epoch !== getMapModelEpoch() || source !== pack) return;
  const group = Labels.findGroup(lastSelected, "added").name;
  const [x, y] = point;
  const pathPoints = createLabelArc({ text, type: "added", group, anchor: [x, y] });
  AddedLabels.add({ x, y, label: { text, group, pathPoints } });
  Layers.draw("labels");

  if (!event.shiftKey) stopMapPlacement();
}

export const LabelCreator = { toggle };
