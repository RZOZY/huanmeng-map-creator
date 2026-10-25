interface StateMergeOption {
  i: number;
  fullName?: string;
  color?: string;
}

interface ProvinceMergeOption {
  i: number;
  name: string;
  fullName: string;
  color: string;
}

export function burgRemovalCopy(count: number): { title: string; message: string } {
  return {
    title: `删除 ${count} 个城镇`,
    message: /* html */ `
        确定要删除除首都和市场中心之外的所有<i>未锁定</i>城镇吗？
        <br><i>如需删除首都，必须先删除其所属国家</i>`
  };
}

export function renderStateMergeForm(states: readonly StateMergeOption[], emblem: (id: number) => string): string {
  const statesSelector = states
    .map(
      s => /* html */ `
      <div data-id="${s.i}" data-tip="${s.fullName}" style="cursor:default">
        <input type="radio" name="rulingState" value="${s.i}" />
        <input id="selectState${s.i}" class="checkbox" type="checkbox" name="statesToMerge" value="${s.i}" />
        <label for="selectState${s.i}" class="checkbox-label"><fill-box fill="${s.color}" disabled></fill-box>${emblem(s.i)}${s.fullName}</label>
      </div>
    `
    )
    .join("");

  return /* html */ `
    <form id='mergeStatesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
      <p style="margin:0">
        勾选要合并的各国旁的<b>复选框</b>。
        使用<b>单选按钮</b>选择将吞并其他国家的<em>主导国家</em>（保留其名称、颜色和首都）。
        将鼠标悬停在某一行上，可在地图上高亮该国家。
      </p>
      <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
        ${statesSelector}
      </main>
    </form>
  `;
}

export function renderProvinceMergeForm(
  provinces: readonly ProvinceMergeOption[],
  emblem: (id: number) => string
): string {
  const provincesSelector = provinces
    .map(
      p => /* html */ `
    <div data-id="${p.i}" data-tip="${p.fullName || p.name}" style="cursor:default">
      <input type="radio" name="rulingProvince" value="${p.i}" />
      <input id="selectProvince${p.i}" class="checkbox" type="checkbox" name="provincesToMerge" value="${p.i}" />
      <label for="selectProvince${p.i}" class="checkbox-label"><fill-box fill="${p.color}" disabled></fill-box>${emblem(p.i)}${p.name}</label>
    </div>
  `
    )
    .join("");

  return /* html */ `
    <form id='mergeProvincesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
      <p style="margin:0">
        勾选要合并的各省份旁的<b>复选框</b>。
        使用<b>单选按钮</b>选择将合并其他省份的<em>主导省份</em>。
        将鼠标悬停在某一行上，可在地图上高亮该省份。
      </p>
      <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
        ${provincesSelector}
      </main>
    </form>
  `;
}
