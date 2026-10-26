// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppInfo } from "./app-info";

const dialog = vi.fn();
const guides = [
  ["https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Quick-Start-Tutorial", "快速入门教程"],
  ["https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Q&A", "常见问题"],
  ["https://youtube.com/playlist?list=PLtgiuDC8iVR2gIG8zMTRn7T_L0arl9h1C", "视频教程"]
];
const helpParagraph = (): HTMLParagraphElement =>
  document.querySelectorAll<HTMLParagraphElement>("#alertMessage > p")[1];

beforeEach(() => {
  document.body.innerHTML = `
    <div id="alert"><div id="alertMessage"></div></div>
    <div id="userNote" contenteditable="true">Quick start tutorial / Q&amp;A page / Video tutorial</div>
    <svg id="map"><text>Download / Quick start tutorial</text></svg>
  `;
  document.title = "My map: Quick start tutorial";
  dialog.mockClear();
  vi.stubGlobal("$", () => ({ dialog }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.title = "";
});

describe("About help source copy", () => {
  it("renders Chinese help guidance without the runtime translator", () => {
    AppInfo.open();

    expect(helpParagraph().textContent?.replace(/\s+/g, " ").trim()).toBe(
      "如需帮助，建议联系 Discord 和 Reddit 社区。 提问前，请先查阅快速入门教程、常见问题和视频教程。"
    );
  });

  it.each(guides)("localizes the guide label without changing its URL: %s", (url, label) => {
    AppInfo.open();

    const anchor = [...helpParagraph().querySelectorAll("a")].find(anchor => anchor.getAttribute("href") === url)!;
    expect(anchor).toBeDefined();
    expect(anchor.textContent).toBe(label);
    expect(anchor.getAttribute("href")).toBe(url);
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener");
  });

  it("keeps community names and destinations intact", () => {
    AppInfo.open();

    const anchors = [...helpParagraph().querySelectorAll("a")].slice(0, 2);
    expect(anchors.map(anchor => [anchor.textContent, anchor.getAttribute("href")])).toEqual([
      ["Discord", "https://discordapp.com/invite/X7E84HU"],
      ["Reddit", "https://www.reddit.com/r/FantasyMapGenerator"]
    ]);
  });

  it("leaves the document title, user note and map text outside the About body unchanged", () => {
    const title = document.title;
    const note = document.getElementById("userNote")!;
    const map = document.getElementById("map")!;
    const noteMarkup = note.outerHTML;
    const mapMarkup = map.outerHTML;

    AppInfo.open();

    expect(document.title).toBe(title);
    expect(note.outerHTML).toBe(noteMarkup);
    expect(map.outerHTML).toBe(mapMarkup);
    expect(dialog).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title, buttons: { OK: expect.any(Function) } })
    );
  });
});
