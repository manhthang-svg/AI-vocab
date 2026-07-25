(function exposeLearningTree(root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.MilimTree = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLearningTree() {
  const STAGES = [
    { min: 0, key: 'seed', label: 'Hạt giống' },
    { min: 1, key: 'sprout', label: 'Mầm non' },
    { min: 3, key: 'sapling', label: 'Chồi xanh' },
    { min: 7, key: 'young-tree', label: 'Cây nhỏ' },
    { min: 14, key: 'budding', label: 'Chớm hoa' },
    { min: 30, key: 'blooming', label: 'Cây hoa' },
    { min: 60, key: 'grand', label: 'Cây hoa lớn' },
    { min: 100, key: 'heirloom', label: 'Tán hoa rực rỡ' }
  ];

  const BRANCHES = [
    'M120 137 C104 128 94 116 84 105',
    'M120 124 C136 115 146 104 154 91',
    'M119 111 C105 101 98 90 93 78',
    'M120 98 C134 90 143 78 148 66',
    'M119 84 C108 76 103 66 100 55',
    'M120 72 C130 65 137 55 140 44',
    'M119 58 C112 51 110 43 109 35',
    'M120 48 C125 42 128 34 128 27'
  ];

  const LEAVES = [
    [83, 104, -34], [94, 116, 22], [154, 91, 32], [143, 104, -18],
    [93, 78, -32], [101, 91, 22], [148, 66, 32], [137, 79, -18],
    [100, 55, -34], [108, 67, 24], [140, 44, 31], [132, 57, -20],
    [109, 35, -30], [115, 47, 20], [128, 27, 24], [123, 39, -20],
    [76, 100, -52], [161, 86, 48], [88, 70, -50], [155, 60, 45],
    [96, 46, -42], [144, 38, 42], [113, 25, -18], [133, 20, 17],
    [72, 111, -45], [166, 98, 45], [82, 83, -38], [158, 73, 38]
  ];

  const FLOWERS = [
    [82, 99], [158, 85], [89, 71], [153, 58], [98, 45], [143, 36],
    [111, 27], [132, 19], [70, 107], [169, 94], [80, 80], [162, 69],
    [103, 61], [138, 53], [91, 92], [149, 78], [118, 39], [126, 32],
    [75, 91], [164, 79], [87, 57], [151, 47], [106, 21], [139, 23]
  ];

  function safeDays(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function stageFor(value) {
    const days = safeDays(value);
    return [...STAGES].reverse().find((stage) => days >= stage.min) || STAGES[0];
  }

  function growthFor(value) {
    const days = safeDays(value);
    if (!days) return 0;
    return Math.min(1, Math.log2(days + 1) / Math.log2(101));
  }

  function nextGrowth(value) {
    const days = safeDays(value);
    const next = STAGES.find((stage) => stage.min > days);
    const current = stageFor(days);
    if (!next) return { target: null, remaining: 0, progress: 100, current };
    const span = Math.max(1, next.min - current.min);
    return {
      target: next,
      remaining: next.min - days,
      progress: Math.max(0, Math.min(100, Math.round((days - current.min) / span * 100))),
      current
    };
  }

  function flowerMarkup(x, y, index) {
    return `<g class="tree-flower" style="--flower-index:${index}" transform="translate(${x} ${y})"><circle cx="-3.2" cy="0" r="3.2"/><circle cx="3.2" cy="0" r="3.2"/><circle cx="0" cy="-3.2" r="3.2"/><circle cx="0" cy="3.2" r="3.2"/><circle class="tree-flower-center" r="2.1"/></g>`;
  }

  function renderTree(value, options = {}) {
    const days = safeDays(value);
    const compact = Boolean(options.compact);
    const stage = stageFor(days);
    const growth = growthFor(days);
    const scaleY = days ? 0.28 + growth * 0.72 : 0.34;
    const scaleX = days ? 0.45 + growth * 0.55 : 0.55;
    const branchCount = !days ? 0 : days < 3 ? 1 : days < 7 ? 2 : Math.min(BRANCHES.length, 2 + Math.floor(Math.log2(days)));
    const leafCount = days ? Math.min(LEAVES.length, 2 + Math.floor(days / 2)) : 0;
    const flowerCount = days >= 7 ? Math.min(FLOWERS.length, 1 + Math.floor((days - 7) / 4)) : 0;
    const branches = BRANCHES.slice(0, branchCount).map((path) => `<path class="tree-branch" d="${path}"/>`).join('');
    const leaves = LEAVES.slice(0, leafCount).map(([x, y, rotate], index) => `<ellipse class="tree-leaf tree-leaf-${index % 3}" style="--leaf-index:${index}" cx="${x}" cy="${y}" rx="8" ry="4.2" transform="rotate(${rotate} ${x} ${y})"/>`).join('');
    const flowers = FLOWERS.slice(0, flowerCount).map(([x, y], index) => flowerMarkup(x, y, index)).join('');
    const plant = days
      ? `<g class="tree-plant" transform="translate(120 158) scale(${scaleX.toFixed(3)} ${scaleY.toFixed(3)}) translate(-120 -158)"><path class="tree-trunk" d="M113 158 C116 139 116 119 118 98 C119 75 116 50 120 24 C124 53 121 75 123 98 C125 121 123 140 128 158 Z"/>${branches}${leaves}${flowers}</g>`
      : '<g class="tree-seed"><ellipse cx="120" cy="151" rx="7" ry="4.5"/><path d="M120 147 C120 140 124 137 129 137 C128 143 125 146 120 147 Z"/></g>';
    const title = days ? `${days} ngày liên tục · ${stage.label}` : 'Hạt giống đang chờ ngày học đầu tiên';
    return `<svg class="learning-tree-svg${compact ? ' compact' : ''}" data-streak="${days}" data-stage="${stage.key}" data-growth="${growth.toFixed(3)}" viewBox="18 4 204 168" role="img" aria-label="${title}"><ellipse class="tree-shadow" cx="120" cy="161" rx="${days ? 48 : 25}" ry="6"/><path class="tree-ground" d="M62 158 C91 151 149 151 178 158 C153 166 87 166 62 158 Z"/>${plant}</svg>`;
  }

  function longestStreak(dateKeys) {
    const days = [...new Set(Array.from(dateKeys || []).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)))]
      .map((key) => {
        const [year, month, day] = key.split('-').map(Number);
        return Date.UTC(year, month - 1, day) / 86400000;
      })
      .sort((a, b) => a - b);
    let longest = 0;
    let running = 0;
    let previous = null;
    days.forEach((day) => {
      running = previous !== null && day === previous + 1 ? running + 1 : 1;
      longest = Math.max(longest, running);
      previous = day;
    });
    return longest;
  }

  return { STAGES, stageFor, growthFor, nextGrowth, renderTree, longestStreak };
});
