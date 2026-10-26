// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { IconPictures } from "./pictures";

const svgFile = (markup: string, name = "icon.svg") => new File([markup], name, { type: "image/svg+xml" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("an svg becomes a picture that keeps the root's paint and frame", () => {
  const svg = new DOMParser().parseFromString(
    '<svg viewBox="0,0 1e3 1E3" fill="red" width="10"><path d="M0 0"/></svg>',
    "image/svg+xml"
  ).documentElement;
  expect(IconPictures.fromSvg(svg)).toEqual({
    kind: "svg",
    content: '<g fill="red"><path d="M0 0"/></g>',
    viewBox: "0 0 1000 1000"
  });
});

test("an uploaded svg keeps its root paint, is scoped to the icon and loses its scripts", async () => {
  const picture = await IconPictures.fromFile(
    svgFile(
      '<svg viewBox="0 0 20 20" fill="navy" stroke="#000"><style>.a{fill:red}</style><script>x()</script><path id="leaf" class="a" onclick="y()"/></svg>'
    ),
    "custom-1a2b3c4d"
  );
  expect(picture.kind).toBe("svg");
  expect(picture.viewBox).toBe("0 0 20 20"); // nothing to measure in jsdom: the file's own frame
  expect(picture.content).toMatch(/^<g fill="navy" stroke="#000" class="custom-1a2b3c4d">/); // the stylesheet's scope
  expect(picture.content).toContain('id="custom-1a2b3c4d-leaf"');
  expect(picture.content).toContain(":is(.custom-1a2b3c4d, .custom-1a2b3c4d *):is(.custom-1a2b3c4d-a) { fill: red; }");
  expect(picture.content).not.toContain("script");
  expect(picture.content).not.toContain("onclick");
});

test.each(["#root", "svg"])("an uploaded svg keeps paint applied by its %s root selector", async selector => {
  const picture = await IconPictures.fromFile(
    svgFile(`<svg id="root" viewBox="0 0 20 20"><style>${selector} {fill:red}</style><path d="M0 0h20v20z"/></svg>`),
    "custom-1a2b3c4d"
  );
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.innerHTML = picture.content;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(host.querySelector("style")!.textContent!);
  const rule = sheet.cssRules[0] as CSSStyleRule;

  expect(rule.style.fill).toBe("red");
  expect(host.firstElementChild!.matches(rule.selectorText)).toBe(true);
  expect(host.matches(rule.selectorText)).toBe(false);
});

test("the fitted frame is a padded square around the visible content", async () => {
  const getBBox = vi.fn(() => ({ x: 10, y: 20, width: 40, height: 20 }));
  Object.defineProperty(SVGElement.prototype, "getBBox", { value: getBBox, configurable: true });
  try {
    const picture = await IconPictures.fromFile(svgFile('<svg viewBox="0 0 100 100"><path/></svg>'), "custom-a");
    expect(picture.viewBox).toBe("8 8 44 44");
    expect(await IconPictures.fit(picture)).toBe("8 8 44 44");
  } finally {
    delete (SVGElement.prototype as { getBBox?: unknown }).getBBox;
  }
});

test("oversize files and files that are not images are refused with Chinese guidance", async () => {
  await expect(IconPictures.fromFile(svgFile(`<svg>${" ".repeat(200_001)}</svg>`), "custom-a")).rejects.toThrow(
    "SVG 文件大小为 200 kB，上限为 200 kB。请简化文件，或改用图片链接。"
  );
  await expect(IconPictures.fromFile(svgFile("not markup"), "custom-a")).rejects.toThrow("文件不是有效的 SVG 图片。");
  const text = new File(["hello"], "notes.txt", { type: "text/plain" });
  await expect(IconPictures.fromFile(text, "custom-a")).rejects.toThrow(
    "文件不是图片，请上传 SVG、PNG、JPEG 或 WebP 文件。"
  );
  const huge = new File([new Uint8Array(2_000_001)], "photo.png", { type: "image/png" });
  await expect(IconPictures.fromFile(huge, "custom-a")).rejects.toThrow(
    "图片大小为 2 MB，上限为 2 MB。请缩小图片，或改用图片链接。"
  );
});

test("the emblem profile accepts larger SVGs and applies its own input limit", async () => {
  const large = svgFile(`<svg viewBox="0 0 100 100"><path d="M0 0"/>${" ".repeat(210_000)}</svg>`);
  await expect(IconPictures.fromFile(large, "custom-a", "icon")).rejects.toThrow(
    "SVG 文件大小为 210 kB，上限为 200 kB。请简化文件，或改用图片链接。"
  );
  await expect(IconPictures.fromFile(large, "custom-a", "emblem")).resolves.toMatchObject({ kind: "svg" });
  const hugeSvg = svgFile(`<svg>${" ".repeat(1_000_001)}</svg>`);
  await expect(IconPictures.fromFile(hugeSvg, "custom-a", "emblem")).rejects.toThrow(
    "SVG 文件大小为 1 MB，上限为 1 MB。请简化文件，或改用图片链接。"
  );
  const huge = new File([new Uint8Array(10_000_001)], "photo.png", { type: "image/png" });
  await expect(IconPictures.fromFile(huge, "custom-a", "emblem")).rejects.toThrow(
    "图片大小为 10 MB，上限为 10 MB。请缩小图片，或改用图片链接。"
  );
});

test.each([
  ["icon", 200_000],
  ["emblem", 1_000_000]
] as const)("an SVG exactly at the %s profile's byte limit is still accepted", async (profile, limit) => {
  const wrapper = '<svg viewBox="0 0 20 20"></svg>';
  const file = svgFile(wrapper.replace("</svg>", `${" ".repeat(limit - wrapper.length)}</svg>`));
  expect(file.size).toBe(limit);
  await expect(IconPictures.fromFile(file, "custom-boundary", profile)).resolves.toMatchObject({
    kind: "svg",
    viewBox: "0 0 20 20"
  });
});

test("an unreadable raster upload reports Chinese guidance and releases its temporary URL", async () => {
  class FailingImage {
    onerror: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onerror?.());
    }
  }
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("Image", FailingImage);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:unreadable", revokeObjectURL });
  const file = new File(["not image bytes"], "Captain Morgan.png", { type: "image/png" });
  await expect(IconPictures.fromFile(file, "custom-old-id")).rejects.toThrow("无法将此文件读取为图片。");
  expect(file.name).toBe("Captain Morgan.png");
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:unreadable");
});

test("a link must be a web address that opens an image; unreadable pixels keep the whole box", async () => {
  for (const link of ["", "javascript:alert(1)", "ftp://a.b/c.png", "https://a.b/my picture.png"])
    await expect(IconPictures.fromLink(link)).rejects.toThrow("请粘贴以 http:// 或 https:// 开头的图片链接。");

  // an image that loads, from a site that does not share its pixels
  class LoadingImage {
    naturalWidth = 64;
    naturalHeight = 32;
    crossOrigin = "";
    onload: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", LoadingImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    throw new Error("tainted canvas");
  });
  const link = "https://a.b/My%20Picture.png?name=CaptainMorgan&label=wood#Original";
  expect(await IconPictures.fromLink(` ${link} `)).toEqual({
    kind: "image",
    content: link,
    viewBox: "0 0 100 100"
  });

  class FailingImage {
    onerror: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onerror?.());
    }
  }
  vi.stubGlobal("Image", FailingImage);
  await expect(IconPictures.fromLink("https://a.b/page.html")).rejects.toThrow(
    "链接无法打开图片，或来源网站不允许访问。"
  );
});

test("a raster upload is redrawn at 256 px as WebP, framed around its opaque pixels", async () => {
  // a 1024×512 image with content only in its right half's middle: pixels 192–255 × 32–95 once redrawn
  class DecodedImage {
    naturalWidth = 1024;
    naturalHeight = 512;
    onload: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  const drawn: number[][] = [];
  const context = {
    drawImage: (_image: unknown, _x: number, _y: number, width: number, height: number) => drawn.push([width, height]),
    getImageData: (_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 32; y < 96; y++) for (let x = 192; x < 256; x++) data[(y * width + x) * 4 + 3] = 255;
      return { data };
    }
  };
  vi.stubGlobal("Image", DecodedImage);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:upload", revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,AA");

  const picture = await IconPictures.fromFile(new File([new Uint8Array(10)], "photo.png", { type: "image/png" }), "c");
  expect(drawn).toEqual([[256, 128]]);
  expect(toDataURL).toHaveBeenCalledWith("image/webp", 0.85);
  // 256×128 letterboxed in 0 0 100 100: 64 px of content is 25 units, from 75 across and 37.5 down
  expect(picture).toEqual({ kind: "image", content: "data:image/webp;base64,AA", viewBox: "73.75 36.25 27.5 27.5" });
});
