// The "About" dialog: what the generator is, where to get help and how to support it.
// A component, not a controller — it is opened over the map but knows nothing about it

import { ensureEl, link } from "@/utils";

const COMMUNITY = {
  discord: link("https://discordapp.com/invite/X7E84HU", "Discord"),
  reddit: link("https://www.reddit.com/r/FantasyMapGenerator", "Reddit"),
  patreon: link("https://www.patreon.com/azgaar", "Patreon")
};

const PROJECTS = {
  armoria: link("https://azgaar.github.io/Armoria", "Armoria"),
  deorum: link("https://deorum.vercel.app", "Deorum")
};

const WIKI = "https://github.com/Azgaar/Fantasy-Map-Generator/wiki";
const GUIDES = {
  quickStart: link(`${WIKI}/Quick-Start-Tutorial`, "快速入门教程"),
  qaa: link(`${WIKI}/Q&A`, "常见问题"),
  video: link("https://youtube.com/playlist?list=PLtgiuDC8iVR2gIG8zMTRn7T_L0arl9h1C", "视频教程")
};

const LINKS = [
  link("https://github.com/Azgaar/Fantasy-Map-Generator", "GitHub 仓库"),
  link("https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE", "许可证"),
  link(`${WIKI}/Changelog`, "更新日志"),
  link(`${WIKI}/Hotkeys`, "快捷键"),
  link("https://trello.com/b/7x832DG4/fantasy-map-generator", "开发看板"),
  `<a href="mailto:azgaar.fmg@yandex.by" target="_blank">联系 Azgaar</a>`
];

function render(): string {
  return /* html */ `<b>Fantasy Map Generator</b>（FMG）是一款免费开源应用。
    你拥有使用本应用创建的所有地图，并可按自己的意愿使用。

    <p>
      本项目的开发由社区支持，你可以通过 ${COMMUNITY.patreon} 捐助。
      你也可以帮助编写介绍、制作教程，或向更多人推荐本生成器。
    </p>

    <p>
      如需帮助，建议联系 ${COMMUNITY.discord} 和 ${COMMUNITY.reddit} 社区。
      提问前，请先查阅${GUIDES.quickStart}、${GUIDES.qaa}和${GUIDES.video}。
    </p>

    <ul style="columns:2">${LINKS.map(item => `<li>${item}</li>`).join("")}</ul>

    <p>查看我们的其他项目：
      <ul>
        <li>${PROJECTS.armoria}：用于制作纹章的工具</li>
        <li>${PROJECTS.deorum}：可自定义奇幻角色的大型图库</li>
      </ul>
    </p>
`;
}

/** Show info about the generator in a popup */
export function showInfo(): void {
  ensureEl("alertMessage").innerHTML = render();

  $("#alert").dialog({
    resizable: false,
    title: document.title,
    width: "28em",
    buttons: {
      确定: function (this: HTMLElement) {
        $(this).dialog("close");
      }
    },
    position: { my: "center", at: "center", of: "svg" }
  });
}

export const AppInfo = { open: showInfo };
