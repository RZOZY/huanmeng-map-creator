// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppInfo } from "./app-info";

interface DialogOptions {
  title: string;
  buttons: Record<string, (this: HTMLElement) => void>;
}

const dialog = vi.fn<(options: DialogOptions | "close") => void>();
const jquery = vi.fn<(element: string | HTMLElement) => { dialog: typeof dialog }>(() => ({ dialog }));
const guides = [
  ["https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Quick-Start-Tutorial", "快速入门教程"],
  ["https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Q&A", "常见问题"],
  ["https://youtube.com/playlist?list=PLtgiuDC8iVR2gIG8zMTRn7T_L0arl9h1C", "视频教程"]
] as const;
const remainingLinks = [
  ["https://discordapp.com/invite/X7E84HU", "Discord", "noopener"],
  ["https://www.reddit.com/r/FantasyMapGenerator", "Reddit", "noopener"],
  ["https://www.patreon.com/azgaar", "Patreon", "noopener"],
  ["https://github.com/Azgaar/Fantasy-Map-Generator", "GitHub 仓库", "noopener"],
  ["https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE", "许可证", "noopener"],
  ["https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog", "更新日志", "noopener"],
  ["https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Hotkeys", "快捷键", "noopener"],
  ["https://trello.com/b/7x832DG4/fantasy-map-generator", "开发看板", "noopener"],
  ["mailto:azgaar.fmg@yandex.by", "联系 Azgaar", null],
  ["https://azgaar.github.io/Armoria", "Armoria", "noopener"],
  ["https://deorum.vercel.app", "Deorum", "noopener"]
] as const;
const text = (node: Node): string => node.textContent?.replace(/\s+/g, " ").trim() ?? "";
const helpParagraph = (): HTMLParagraphElement =>
  document.querySelectorAll<HTMLParagraphElement>("#alertMessage > p")[1];

beforeEach(() => {
  document.body.innerHTML = `
    <div id="alert"><div id="alertMessage"></div></div>
    <div id="userNote" contenteditable="true">Quick start tutorial / Q&amp;A page / Video tutorial</div>
    <svg id="map"><text>Download / Quick start tutorial</text></svg>
    <div id="userMetadata" data-action="Changelog">
      <input id="userTitle" name="License" value="GitHub repository" />
      <a href="https://example.test/Changelog?License=Hotkeys#Devboard">Contact Azgaar</a>
    </div>
  `;
  document.title = "My map: Quick start tutorial";
  dialog.mockClear();
  jquery.mockClear();
  vi.stubGlobal("$", jquery);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.title = "";
});

describe("About source copy", () => {
  it("renders Chinese help guidance without the runtime translator", () => {
    AppInfo.open();

    expect(text(helpParagraph())).toBe(
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
      expect.objectContaining({ title, buttons: { 确定: expect.any(Function) } })
    );
  });

  it("renders Chinese ownership guidance while retaining the product name and acronym", () => {
    AppInfo.open();

    const brand = document.querySelector("#alertMessage > b")!;
    expect(brand.textContent).toBe("Fantasy Map Generator");
    expect(text(brand.nextSibling!)).toBe(
      "（FMG）是一款免费开源应用。 你拥有使用本应用创建的所有地图，并可按自己的意愿使用。"
    );
  });

  it("renders Chinese community support guidance around the Patreon link", () => {
    AppInfo.open();

    const paragraph = document.querySelector("#alertMessage > p")!;
    expect(text(paragraph)).toBe(
      "本项目的开发由社区支持，你可以通过 Patreon 捐助。 " + "你也可以帮助编写介绍、制作教程，或向更多人推荐本生成器。"
    );
  });

  it.each(remainingLinks)("renders the remaining link without changing its destination: %s", (url, label, rel) => {
    AppInfo.open();

    const anchor = [...document.querySelectorAll("#alertMessage a")].find(
      anchor => anchor.getAttribute("href") === url
    )!;
    expect(anchor).toBeDefined();
    expect(anchor.textContent).toBe(label);
    expect(anchor.getAttribute("href")).toBe(url);
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe(rel);
  });

  it("keeps exactly the existing fourteen link destinations", () => {
    AppInfo.open();

    const destinations = [...document.querySelectorAll("#alertMessage a")].map(anchor => anchor.getAttribute("href"));
    const expected = [...guides.map(([url]) => url), ...remainingLinks.map(([url]) => url)];
    expect(destinations).toHaveLength(14);
    expect(destinations.sort()).toEqual(expected.sort());
  });

  it("renders Chinese project descriptions without renaming the projects", () => {
    AppInfo.open();

    const paragraphs = [...document.querySelectorAll("#alertMessage > p")];
    expect(paragraphs.map(text)).toContain("查看我们的其他项目：");
    const projects = [...document.querySelectorAll("#alertMessage > ul")][1];
    expect([...projects.querySelectorAll("li")].map(text)).toEqual([
      "Armoria：用于制作纹章的工具",
      "Deorum：可自定义奇幻角色的大型图库"
    ]);
  });

  it("preserves user-authored resource labels, URLs, live values and machine attributes", () => {
    const metadata = document.getElementById("userMetadata")!;
    const input = document.querySelector<HTMLInputElement>("#userTitle")!;
    input.value = "Armoria / License / Download";
    const markup = metadata.outerHTML;

    AppInfo.open();

    expect(metadata.outerHTML).toBe(markup);
    expect(input.value).toBe("Armoria / License / Download");
    expect(input.defaultValue).toBe("GitHub repository");
    expect(input.name).toBe("License");
    expect(metadata.dataset.action).toBe("Changelog");
  });

  it("closes the same dialog from the Chinese confirmation button", () => {
    AppInfo.open();

    const options = dialog.mock.calls[0]?.[0];
    if (!options || typeof options === "string") throw new Error("Expected About dialog options");
    expect(Object.keys(options.buttons)).toEqual(["确定"]);
    const alert = document.getElementById("alert")!;

    options.buttons.确定.call(alert);

    expect(jquery).toHaveBeenLastCalledWith(alert);
    expect(dialog).toHaveBeenNthCalledWith(2, "close");
    expect(dialog).toHaveBeenCalledTimes(2);
  });
});
