// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { rescan, translate } from "./translator";

const COPY_CASES = [
  ["Provide URL to map file:", "请输入地图文件的 URL："],
  ["Load map from URL", "从 URL 加载地图"],
  ["Please provide a valid URL", "请输入有效的 URL"],
  ["Download tiles", "下载分块图"],
  ["Download", "下载"],
  ["Link is copied to the clipboard", "链接已复制到剪贴板"]
] as const;

afterEach(() => {
  document.body.replaceChildren();
});

describe("translate", () => {
  it.each(COPY_CASES)("translates the exact UI copy %s", (source, expected) => {
    expect(translate(source)).toBe(expected);
  });
});

describe("DOM translation protection", () => {
  it("translates visible copy but preserves URLs, input values and machine attributes", async () => {
    const url = "https://example.test/maps/Download?label=Download#Download";
    document.body.innerHTML = /* html */ `
      <label for="mapURL">Provide URL to map file:</label>
      <input id="mapURL" name="mapURL" type="url" value="${url}" placeholder="Provide URL to map file:">
      <input id="userText" name="userText" value="Download">
      <button id="Download" name="Download" value="Download" data-action="Download">Download</button>
      <a href="${url}" download="Download.map" title="Download tiles">Download tiles</a>
      <p id="urlText">${url}</p>
    `;
    const mapURL = document.querySelector<HTMLInputElement>("#mapURL")!;
    const userText = document.querySelector<HTMLInputElement>("#userText")!;
    const button = document.querySelector<HTMLButtonElement>("#Download")!;
    const link = document.querySelector<HTMLAnchorElement>("a")!;
    userText.value = "Download tiles";

    rescan();
    await new Promise(requestAnimationFrame);

    expect(translate(url)).toBeNull();
    expect(document.querySelector("#urlText")!.textContent).toBe(url);
    expect(mapURL.value).toBe(url);
    expect(mapURL.getAttribute("value")).toBe(url);
    expect(mapURL.id).toBe("mapURL");
    expect(mapURL.name).toBe("mapURL");
    expect(mapURL.type).toBe("url");
    expect(userText.value).toBe("Download tiles");
    expect(userText.defaultValue).toBe("Download");
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("download")).toBe("Download.map");
    expect(button.id).toBe("Download");
    expect(button.name).toBe("Download");
    expect(button.value).toBe("Download");
    expect(button.dataset.action).toBe("Download");
    expect(document.querySelector("label")!.htmlFor).toBe("mapURL");
    expect(document.querySelector("label")!.textContent).toBe("请输入地图文件的 URL：");
    expect(mapURL.placeholder).toBe("请输入地图文件的 URL：");
    expect(button.textContent).toBe("下载");
    expect(link.textContent).toBe("下载分块图");
    expect(link.title).toBe("下载分块图");
  });

  it("preserves user SVG outside the map while translating adjacent interface copy", async () => {
    const artwork = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    artwork.id = "defElements";
    artwork.setAttribute("aria-label", "Download");
    artwork.innerHTML = /* html */ `<defs><symbol id="userArtwork" viewBox="3 4 110 120">
      <title>Download</title><desc>Synthetic English note, not original map artwork</desc>
      <text title="Download tiles">Load map from URL</text>
      <image href="https://example.test/Download.svg#Original" />
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml" title="Download">Download</div></foreignObject>
    </symbol></defs>`;
    const standalone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    standalone.innerHTML =
      '<symbol title="Download"><desc>Synthetic English note, not original map artwork</desc></symbol><defs><text>Download tiles</text></defs>';
    const preview = document.createElement("div");
    preview.id = "iconPositioner";
    preview.innerHTML =
      '<div class="stage"><svg><g class="art" title="Download"><text>Download tiles</text></g><text>Color Picker</text></svg></div>';
    document.body.append(artwork, standalone, preview);
    const protectedElements = [artwork, standalone, preview.querySelector(".art")!];
    const before = protectedElements.map(element => element.outerHTML);
    const control = document.createElement("button");
    control.textContent = "Download";
    control.title = "Download tiles";
    document.body.append(control);

    rescan();
    await new Promise(requestAnimationFrame);

    expect(control.textContent).toBe("下载");
    expect(control.title).toBe("下载分块图");
    expect(protectedElements.map(element => element.outerHTML)).toEqual(before);
    expect(preview.querySelector(".stage svg > text")!.textContent).toBe("取色器");
  });

  it("still translates interface SVG attributes, text and foreignObject controls", async () => {
    const control = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    control.setAttribute("data-tip", "Good icon");
    control.setAttribute("aria-label", "Map minimap");
    control.innerHTML = /* html */ `<text>Color Picker</text>
      <foreignObject><button xmlns="http://www.w3.org/1999/xhtml" title="Download tiles">Download</button></foreignObject>`;
    document.body.append(control);

    rescan();
    await new Promise(requestAnimationFrame);

    expect(control.getAttribute("data-tip")).toBe("商品图标");
    expect(control.getAttribute("aria-label")).toBe("地图小地图");
    expect(control.querySelector("text")!.textContent).toBe("取色器");
    expect(control.querySelector("button")!.textContent).toBe("下载");
    expect(control.querySelector("button")!.title).toBe("下载分块图");
  });

  it("preserves editable and explicitly owned user sources but still translates interface controls", async () => {
    document.body.innerHTML = /* html */ `
      <div contenteditable="true" title="Download"><p>Download</p></div>
      <div contenteditable="plaintext-only">Download tiles</div>
      <div class="ql-editor" contenteditable="false"><p>Download</p></div>
      <div data-i18n-skip><span title="Download">Download</span></div>
      <div id="notesBody"><p title="Download">Download</p></div>
      <div id="notesHeader">Download</div><div id="notesName">Download</div>
      <select id="notesSelect"><option value="Download">Download</option></select>
      <button id="interfaceButton" title="Download tiles">Download</button>
      <div id="interfaceReadOnly" contenteditable="false">Download</div>
    `;
    const sources = [...document.body.children].slice(0, -2);
    const before = sources.map(element => element.outerHTML);

    rescan();
    await new Promise(requestAnimationFrame);

    expect(sources.map(element => element.outerHTML)).toEqual(before);
    expect(document.querySelector("#interfaceButton")!.textContent).toBe("下载");
    expect(document.querySelector("#interfaceButton")!.getAttribute("title")).toBe("下载分块图");
    expect(document.querySelector("#interfaceReadOnly")!.textContent).toBe("下载");
  });

  it("preserves user content in map labels and every skipped tag", async () => {
    const protectedElements: Element[] = ["script", "style", "code", "pre", "textarea", "noscript"].map(tag => {
      const element = document.createElement(tag);
      if (element instanceof HTMLScriptElement || element instanceof HTMLStyleElement) element.type = "text/plain";
      element.title = "Download";
      element.textContent = "Download";
      document.body.append(element);
      return element;
    });
    const map = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    map.id = "map";
    map.innerHTML = '<g title="Download"><text>Download tiles</text></g>';
    document.body.append(map);
    protectedElements.push(map);
    const before = protectedElements.map(element => element.outerHTML);
    const control = document.createElement("button");
    control.textContent = "Load";
    document.body.append(control);

    rescan();
    await new Promise(requestAnimationFrame);

    expect(control.textContent).toBe("加载");
    expect(protectedElements.map(element => element.outerHTML)).toEqual(before);
  });
});
