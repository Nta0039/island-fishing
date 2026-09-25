/*
 * Localization (i18n) — English + Simplified Chinese.
 *
 * UI strings live here in both languages. Item/fish/rod names and
 * descriptions are authored once on the server (English) and translated
 * here by id, so the two can never drift out of sync: a missing translation
 * simply falls back to the server's English.
 *
 * Usage:
 *   t('hint.find')                    // auto-interpolates {vars}
 *   catchName(fish) / cosmeticName()  // content, with server fallback
 *   applyStatic()                     // fill [data-i18n*] elements
 *   setLocale('zh')                   // fires onLocaleChange listeners
 */

const STORE_KEY = 'island-fishing.locale';

export const DICT = {
  en: {
    'app.title': 'Island Fishing — Multiplayer',
    'hud.online': 'online',
    'hud.coins': 'Coins',
    'hud.music': 'Background music',
    'hud.musicOn': 'Background music: on',
    'hud.musicOff': 'Background music: off',
    'hud.encyclopedia': 'Encyclopedia',
    'hud.inventory': 'Inventory',
    'hud.catchFeed': 'Catch Feed',
    'hud.lang': 'Language',

    'controls.title': 'Controls',
    'controls.moveHtml': '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> move · hold <kbd>Shift</kbd> to sprint',
    'controls.captureHtml': '<b>Click</b> the view to capture the mouse, then just move it to look <span class="ch-dim">(<b>Esc</b> releases)</span>',
    'controls.feHtml': '<kbd>F</kbd> cast or reel in · <kbd>E</kbd> interact',
    'controls.spaceHtml': '<b>Space</b> hold to reel in',
    'controls.escHtml': '<b>Esc</b> closes a panel or steps back',
    'controls.touchMoveHtml': '<b>Joystick</b> (bottom-left) to move',
    'controls.touchLookHtml': '<b>Drag</b> the view to look around',
    'controls.touchReelHtml': '<b>Hold</b> bottom-right to reel in',
    'controls.touchActHtml': '<b>Tap</b> the on-screen buttons to act',

    'qr.title': 'Join on your phone',
    'qr.hint': 'Point your camera at the code',
    'qr.hintLocal': 'Local address — phones cannot reach this. Deploy it, or use your machine\'s IP.',

    'start.sub': '3D multiplayer fishing · up to 10 players',
    'start.namePlaceholder': 'Enter your name',
    'start.outfit': 'Outfit colour',
    'start.play': 'Play',
    'start.pcHelpHtml': '<b>PC</b> — WASD or arrows to move · hold <b>Shift</b> to sprint · drag mouse to look · hold <b>Space</b> to reel',
    'start.mobileHelpHtml': '<b>Mobile / Tablet</b> — left joystick to move · drag to look · hold bottom-right to reel',
    'start.nameError': 'Please enter a name before you set sail.',
    'loading.connecting': 'Connecting…',

    'mg.labelTouch': 'Hold bottom-right!',
    'mg.labelPc': 'Hold SPACE!',
    'reel.btnHtml': 'HOLD<br>TO REEL',
    'sg.head': 'A seagull is after your catch!',
    'sg.fightHtml': 'TAP!<br>FIGHT BACK',
    'sg.labelTouch': 'Tap the button to keep it!',
    'sg.labelPc': 'Mash Space to keep it!',

    'cc.caught': 'You caught',
    'cc.newSpecies': 'New species!',
    'cc.found': 'You found',

    'codex.titleHtml': '📖 Fish Encyclopedia',
    'codex.discovered': 'discovered',
    'codex.locked': 'Not yet caught',

    'trade.preview': 'Your angler',
    'trade.sellTab': 'Sell Fish',
    'trade.shopTab': 'Shop',
    'trade.sellAll': 'Sell Everything',
    'trade.sell1': 'Sell 1',
    'trade.all': 'All',
    'trade.equipped': 'Equipped',
    'trade.equip': 'Equip',
    'trade.owned': 'Already owned.',
    'trade.needCoins': 'Need {need} more coins.',
    'trade.each': '{coins} each',
    'trade.empty': 'Your cooler is empty.<br>Catch some fish and come back!',
    'trade.rods': 'Fishing Rods',
    'trade.bobbers': 'Bobbers',

    'inv.titleHtml': '🎒 Inventory',
    'inv.cooler': 'Cooler space',
    'inv.fishFinds': 'Fish & finds',
    'inv.purchases': 'Shop purchases',
    'inv.empty': 'Your cooler is empty — go catch something!',
    'inv.noGear': 'No shop purchases yet.',
    'inv.equipped': ' · equipped',

    'pause.titleHtml': '⏸ Paused',
    'pause.save': 'Save Game Progress',
    'pause.saveSub': 'Push your cooler, purse and gear to your account',
    'pause.saveExit': 'Save Game Progress & Return to Title',
    'pause.saveExitSub': 'Save, then head back to the title screen',
    'pause.resumePcHtml': 'Press <kbd>Esc</kbd> to resume',
    'pause.resumeTouch': 'Tap the logo any time to pause',
    'pause.saving': 'Saving…',
    'pause.saved': 'Saved — {items}, {coins} coins.',
    'pause.savedItems': '{n} item',
    'pause.savedItemsPlural': '{n} items',
    'pause.disabled': 'Saving is switched off on this server.',
    'pause.blocked': 'Save server unreachable — progress kept in memory only.',
    'pause.error': 'Could not save. Please try again.',
    'pause.notConnected': 'Not connected — cannot save right now.',

    'hint.telescopeTouch': 'Telescope — swipe to look around, tap to step back',
    'hint.telescopePc': 'Telescope — move the mouse to look around, Esc to step back',
    'hint.waiting': 'Line cast — waiting for a bite…',
    'hint.bite': 'A bite! Work the line — Space or the reel button',
    'hint.sunbathing': 'Sunbathing — press [Get up] or move to stand',
    'hint.sitting': 'Resting on the bench — press [Stand] or move to get up',
    'hint.telescope': 'Press [Use] to look through the telescope',
    'hint.lounger': 'Press [Sunbathe] to lie back on the lounger',
    'hint.seat': 'Press [Sit] to rest on the bench',
    'hint.find': 'A beach find — press [Collect]',
    'hint.merchant': 'Trade your catch with David',
    'hint.water': 'Press [Fish] to cast your line',
    'hint.full': 'Cooler full — {cap}/{cap}',
    'hint.fullMsg': 'Cooler full ({cap}/{cap}) — sell some fish to David before catching more.',

    'notify.seagullStole': 'A seagull made off with your {fish}!',
    'notify.fishGotAway': 'The fish got away — you were too slow.',
    'notify.welcomeBack': 'Welcome back, {name} — your catch and coins were restored.',
    'notify.persistBlocked': 'Save server unreachable — progress will not be kept this session.',
    'notify.notEnough': 'Not enough coins.',
    'notify.sold': 'Sold {qty}× {fish} for 🪙 {coins}',
    'notify.soldAll': 'Sold {qty} fish for 🪙 {coins}',
    'notify.purchased': 'Purchased {item}!',
    'notify.equipped': 'Equipped {item}.',

    'action.collect': 'Collect',
    'action.use': 'Use',
    'action.sit': 'Sit',
    'action.sunbathe': 'Sunbathe',
    'action.trade': 'Trade',
    'action.fish': 'Fish',
    'action.exitTelescope': 'Exit telescope',
    'action.reelIn': 'Reel in',
    'action.getUp': 'Get up',
    'action.stand': 'Stand',

    'error.serverUnreachable': 'Could not reach the server.',
    'error.serverFull': 'Server is full ({max}/{max}). Try again in a moment.',
    'error.nameTaken': 'This username is currently in use.',

    'toast.caught': 'caught a',
    'toast.found': 'found a',
    'noun.fish': 'fish',

    'rarity.common': 'Common',
    'rarity.medium': 'Medium',
    'rarity.high': 'High',
    'rarity.rare': 'Rare',

    'npc.0': 'Ahoy! Got a catch to sell?',
    'npc.1': 'The tide has been kind today.',
    'npc.2': 'Fine weather for fishing, friend.',
    'npc.3': 'Bring me shells and I pay fair.',
    'npc.4': "Forty years I've sailed these waters.",
    'npc.5': 'Care for a new rod? Best on the isle.',
    'npc.6': 'Reel them in slow — that is the trick.',
    'npc.7': 'Smells like a good haul today!',
    'npc.8': 'The big ones hide deep, lad.',
    'npc.9': 'My old bones say rain is coming.',
    'npc.10': 'Watch the gulls — they know where they bite.',
    'npc.11': 'A steady hand beats a strong arm.',
  },

  zh: {
    'app.title': '海岛钓鱼 — 多人',
    'hud.online': '在线',
    'hud.coins': '金币',
    'hud.music': '背景音乐',
    'hud.musicOn': '背景音乐：开',
    'hud.musicOff': '背景音乐：关',
    'hud.encyclopedia': '图鉴',
    'hud.inventory': '背包',
    'hud.catchFeed': '捕获动态',
    'hud.lang': '语言',

    'controls.title': '操作说明',
    'controls.moveHtml': '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或 <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> 移动 · 按住 <kbd>Shift</kbd> 疾跑',
    'controls.captureHtml': '<b>点击</b>画面锁定鼠标，然后移动鼠标即可环顾 <span class="ch-dim">(按 <b>Esc</b> 释放)</span>',
    'controls.feHtml': '<kbd>F</kbd> 抛竿或收线 · <kbd>E</kbd> 互动',
    'controls.spaceHtml': '按住 <b>空格键</b> 收线',
    'controls.escHtml': '<b>Esc</b> 关闭面板或返回',
    'controls.touchMoveHtml': '左下角<b>摇杆</b>移动',
    'controls.touchLookHtml': '<b>拖动</b>画面环顾四周',
    'controls.touchReelHtml': '按住右下角<b>收线</b>',
    'controls.touchActHtml': '<b>点击</b>屏幕按钮进行操作',

    'qr.title': '用手机加入',
    'qr.hint': '用相机扫描二维码',
    'qr.hintLocal': '本地地址——手机无法访问。请部署，或使用电脑的 IP 地址。',

    'start.sub': '3D 多人钓鱼 · 最多 10 名玩家',
    'start.namePlaceholder': '输入你的名字',
    'start.outfit': '服装颜色',
    'start.play': '开始游戏',
    'start.pcHelpHtml': '<b>PC</b> — WASD 或方向键移动 · 按住 <b>Shift</b> 疾跑 · 拖动鼠标环顾 · 按住 <b>空格键</b> 收线',
    'start.mobileHelpHtml': '<b>手机 / 平板</b> — 左下摇杆移动 · 拖动环顾 · 按住右下角收线',
    'start.nameError': '请先输入名字再出发。',
    'loading.connecting': '连接中…',

    'mg.labelTouch': '按住右下角！',
    'mg.labelPc': '按住空格键！',
    'reel.btnHtml': '按住<br>收线',
    'sg.head': '海鸥来抢你的鱼啦！',
    'sg.fightHtml': '点击！<br>抢回来',
    'sg.labelTouch': '点击按钮抓住它！',
    'sg.labelPc': '连按空格键抓住它！',

    'cc.caught': '你钓到了',
    'cc.newSpecies': '新物种！',
    'cc.found': '你捡到了',

    'codex.titleHtml': '📖 鱼类图鉴',
    'codex.discovered': '已发现',
    'codex.locked': '尚未捕获',

    'trade.preview': '你的角色',
    'trade.sellTab': '卖鱼',
    'trade.shopTab': '商店',
    'trade.sellAll': '全部卖出',
    'trade.sell1': '卖 1 条',
    'trade.all': '全部',
    'trade.equipped': '已装备',
    'trade.equip': '装备',
    'trade.owned': '已经拥有了。',
    'trade.needCoins': '还需要 {need} 金币。',
    'trade.each': '每条 {coins}',
    'trade.empty': '你的冷藏箱是空的。<br>去钓些鱼再来吧！',
    'trade.rods': '鱼竿',
    'trade.bobbers': '浮漂',

    'inv.titleHtml': '🎒 背包',
    'inv.cooler': '冷藏箱容量',
    'inv.fishFinds': '鱼与收集品',
    'inv.purchases': '商店购买',
    'inv.empty': '冷藏箱是空的——去钓点东西吧！',
    'inv.noGear': '还没有购买任何物品。',
    'inv.equipped': ' · 已装备',

    'pause.titleHtml': '⏸ 已暂停',
    'pause.save': '保存游戏进度',
    'pause.saveSub': '将冷藏箱、金币和装备保存到你的账号',
    'pause.saveExit': '保存进度并返回标题',
    'pause.saveExitSub': '保存后返回标题界面',
    'pause.resumePcHtml': '按 <kbd>Esc</kbd> 继续',
    'pause.resumeTouch': '随时点击标志暂停',
    'pause.saving': '保存中…',
    'pause.saved': '已保存——{items}，{coins} 金币。',
    'pause.savedItems': '{n} 件物品',
    'pause.savedItemsPlural': '{n} 件物品',
    'pause.disabled': '此服务器已关闭保存功能。',
    'pause.blocked': '无法连接存档服务器——进度仅保存在内存中。',
    'pause.error': '保存失败，请重试。',
    'pause.notConnected': '未连接——现在无法保存。',

    'hint.telescopeTouch': '望远镜——滑动环顾，点击返回',
    'hint.telescopePc': '望远镜——移动鼠标环顾，按 Esc 返回',
    'hint.waiting': '已抛竿——等待鱼儿上钩…',
    'hint.bite': '有鱼上钩了！收线——空格键或收线按钮',
    'hint.sunbathing': '日光浴中——按 [起身] 或移动以站起',
    'hint.sitting': '在长椅上休息——按 [站起] 或移动以起身',
    'hint.telescope': '按 [使用] 透过望远镜观望',
    'hint.lounger': '按 [晒太阳] 躺到躺椅上',
    'hint.seat': '按 [坐下] 在长椅上休息',
    'hint.find': '沙滩发现——按 [捡起]',
    'hint.merchant': '和大卫交易你的渔获',
    'hint.water': '按 [钓鱼] 抛出鱼线',
    'hint.full': '冷藏箱已满——{cap}/{cap}',
    'hint.fullMsg': '冷藏箱已满（{cap}/{cap}）——先卖些鱼给大卫再继续钓。',

    'notify.seagullStole': '一只海鸥抢走了你的{fish}！',
    'notify.fishGotAway': '鱼跑掉了——你太慢了。',
    'notify.welcomeBack': '欢迎回来，{name}——你的渔获和金币已恢复。',
    'notify.persistBlocked': '无法连接存档服务器——本次游玩进度不会被保存。',
    'notify.notEnough': '金币不足。',
    'notify.sold': '卖出 {qty} 条{fish}，获得 🪙 {coins}',
    'notify.soldAll': '卖出 {qty} 条鱼，获得 🪙 {coins}',
    'notify.purchased': '已购买 {item}！',
    'notify.equipped': '已装备 {item}。',

    'action.collect': '捡起',
    'action.use': '使用',
    'action.sit': '坐下',
    'action.sunbathe': '晒太阳',
    'action.trade': '交易',
    'action.fish': '钓鱼',
    'action.exitTelescope': '离开望远镜',
    'action.reelIn': '收线',
    'action.getUp': '起身',
    'action.stand': '站起',

    'error.serverUnreachable': '无法连接服务器。',
    'error.serverFull': '服务器已满（{max}/{max}）。请稍后再试。',
    'error.nameTaken': '该用户名正在使用中。',

    'toast.caught': '钓到了',
    'toast.found': '捡到了',
    'noun.fish': '鱼',

    'rarity.common': '普通',
    'rarity.medium': '优良',
    'rarity.high': '稀有',
    'rarity.rare': '传说',

    'npc.0': '嘿！有渔获要卖吗？',
    'npc.1': '今天潮水不错。',
    'npc.2': '朋友，钓鱼的好天气。',
    'npc.3': '拿贝壳来，我出公道价。',
    'npc.4': '我在这片海上航行了四十年。',
    'npc.5': '要不要来根新鱼竿？岛上最好的。',
    'npc.6': '慢慢收线——这才是诀窍。',
    'npc.7': '今天闻着像是个丰收日！',
    'npc.8': '大鱼都藏在深处，小子。',
    'npc.9': '我这把老骨头说快要下雨了。',
    'npc.10': '留意海鸥——它们知道哪儿有鱼。',
    'npc.11': '稳的手胜过壮的胳膊。',

    /* ---- Content translations (English comes from the server) ---- */
    'catch.anchovy.name': '鳀鱼',
    'catch.sardine.name': '沙丁鱼',
    'catch.mackerel.name': '鲭鱼',
    'catch.herring.name': '鲱鱼',
    'catch.sprat.name': '小鲱鱼',
    'catch.smelt.name': '胡瓜鱼',
    'catch.perch.name': '河鲈',
    'catch.bleak.name': '白鲦',
    'catch.seabass.name': '海鲈鱼',
    'catch.snapper.name': '红鲷鱼',
    'catch.tuna.name': '蓝鳍金枪鱼',
    'catch.trout.name': '虹鳟鱼',
    'catch.mahimahi.name': '鲯鳅',
    'catch.barracuda.name': '梭鱼',
    'catch.swordfish.name': '剑鱼',
    'catch.marlin.name': '蓝枪鱼',
    'catch.sturgeon.name': '鲟鱼',
    'catch.anglerfish.name': '鮟鱇鱼',
    'catch.leviathan.name': '黄金利维坦',
    'catch.crystalkoi.name': '水晶锦鲤',

    'catch.anchovy.desc': '小小的银色群游鱼。鳀鱼成千上万地聚集，几乎喂养着所有比它们大的生物。',
    'catch.sardine.desc': '一种光滑油亮的小鱼，沿着海岸在庞大的闪光鱼群中巡游。',
    'catch.mackerel.desc': '开阔水域中迅捷的条纹猎手。鲭鱼每次转身都会闪出银光。',
    'catch.herring.desc': '银亮扁身的鲱鱼聚成的鱼群之大，曾养活过整座海岛。',
    'catch.sprat.desc': '鲱鱼的小型斑纹近亲，最喜欢浅浅的近岸海水。',
    'catch.smelt.desc': '一种细长、近乎半透明的鱼，散发着淡淡的黄瓜清香。',
    'catch.perch.desc': '一条身披深色条纹、长着亮橙色鱼鳍的醒目小鱼。',
    'catch.bleak.desc': '一种好动的小鱼，在平静的清晨会不断地在水面留下涟漪。',
    'catch.seabass.desc': '一种强壮、宽肩的鱼，鳞片厚重，喜欢汹涌的浪涛。',
    'catch.snapper.desc': '住在礁石间的红色居民，眼睛大、胃口更大，脾气也与之相称。',
    'catch.tuna.desc': '深海中的鱼雷。蓝鳍金枪鱼能横穿整片海洋而毫不停歇。',
    'catch.trout.desc': '全身布满斑点，一条玫瑰色的条纹从吻部一直延伸到尾柄。',
    'catch.mahimahi.desc': '鲯鳅：闪耀着金绿色，是海中游得最快的鱼之一。',
    'catch.barracuda.desc': '一种长着尖牙的细长伏击者，会一动不动地悬停，然后如闪电般出击。',
    'catch.swordfish.desc': '它扁平的长吻用于在进食前劈开小鱼群。',
    'catch.marlin.desc': '一种重量级旗鱼，以跃出水面、在水面上滑行而闻名。',
    'catch.sturgeon.desc': '一种身披骨板的活化石，用骨质的棱鳞代替普通的鳞片。',
    'catch.anglerfish.desc': '深海猎手，会在自己的下颚前晃动着发光的诱饵。',
    'catch.leviathan.desc': '传说中的金色海蛇。见过它的水手们对所见之物几乎各执一词。',
    'catch.crystalkoi.desc': '一种稀有的玻璃鳞锦鲤，据说只在最清澈平静的水中才会浮出水面。',

    'catch.seashell.name': '贝壳',
    'catch.starfish.name': '海星',
    'catch.coconut.name': '掉落的椰子',
    'catch.crab.name': '沙滩蟹',
    'catch.conch.name': '海螺壳',

    'cosmetic.rod_bamboo.name': '竹制鱼竿',
    'cosmetic.rod_crimson.name': '绯红鱼竿',
    'cosmetic.rod_azure.name': '蔚蓝鱼竿',
    'cosmetic.rod_verdant.name': '翠绿鱼竿',
    'cosmetic.rod_violet.name': '紫罗兰鱼竿',
    'cosmetic.rod_gold.name': '黄金鱼竿',
    'cosmetic.rod_neon.name': '霓虹鱼竿',
    'cosmetic.rod_carbon.name': '碳纤维鱼竿',
    'cosmetic.bobber_classic.name': '经典浮漂',
    'cosmetic.bobber_lime.name': '青柠浮漂',
    'cosmetic.bobber_ocean.name': '海洋浮漂',
    'cosmetic.bobber_violet.name': '紫罗兰浮漂',
    'cosmetic.bobber_gold.name': '黄金浮漂',
    'cosmetic.bobber_prism.name': '棱镜浮漂',

    'cosmetic.rod_bamboo.desc': '经典的入门鱼竿。',
    'cosmetic.rod_crimson.desc': '醒目的红色漆面。',
    'cosmetic.rod_azure.desc': '海蓝色饰面。',
    'cosmetic.rod_verdant.desc': '充满生机的绿色缠绕。',
    'cosmetic.rod_violet.desc': '商人的最爱。',
    'cosmetic.rod_gold.desc': '打磨得锃亮。',
    'cosmetic.rod_neon.desc': '在黑暗中发光。',
    'cosmetic.rod_carbon.desc': '轻盈的碳纤维编织——鱼儿上钩快 30%。',
    'cosmetic.bobber_classic.desc': '红白配色。',
    'cosmetic.bobber_lime.desc': '容易观察。',
    'cosmetic.bobber_ocean.desc': '与海水融为一体。',
    'cosmetic.bobber_violet.desc': '商人的最爱。',
    'cosmetic.bobber_gold.desc': '一枚小小的金色浮标。',
    'cosmetic.bobber_prism.desc': '颜色不断变幻。',
  },
};

const listeners = new Set();

function detect() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch (_) { /* ignore */ }
  const nav = String((navigator && (navigator.language || navigator.userLanguage)) || 'en').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

let locale = 'en';

function lookup(key) {
  const table = DICT[locale];
  if (table && Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  return DICT.en[key];
}

function interpolate(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** Translate a UI key, interpolating {vars}. Falls back to English. */
export function t(key, vars) {
  const s = lookup(key);
  if (s === undefined) return key;
  return interpolate(s, vars);
}

/** Translate a content key, falling back to the server's own English. */
function content(key, fallback) {
  const s = lookup(key);
  return s === undefined ? (fallback || '') : s;
}

export function catchName(c) { return c ? content(`catch.${c.id}.name`, c.name) : ''; }
export function catchDesc(c) {
  if (!c) return '';
  const key = `catch.${c.id}.desc`;
  const s = lookup(key);
  return s === undefined ? (c.desc || '') : s;
}
export function cosmeticName(c) { return c ? content(`cosmetic.${c.id}.name`, c.name) : ''; }
export function cosmeticDesc(c) { return c ? content(`cosmetic.${c.id}.desc`, c.desc) : ''; }
export function rarityName(r) { return t(`rarity.${r}`); }
export function npcLine(i) { return t(`npc.${i}`); }
export const NPC_COUNT = 12;

export function getLocale() { return locale; }

export function setLocale(next) {
  const l = next === 'zh' ? 'zh' : 'en';
  if (l === locale) { applyStatic(); return; }
  locale = l;
  try { localStorage.setItem(STORE_KEY, locale); } catch (_) { /* ignore */ }
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
  applyStatic();
  for (const fn of listeners) fn(locale);
}

export function toggleLocale() { setLocale(locale === 'en' ? 'zh' : 'en'); }

export function onLocaleChange(fn) { listeners.add(fn); }

/** Refreshes every element carrying a data-i18n* annotation. */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

/** Call once at startup, before the first applyStatic(). */
export function initI18n() {
  locale = detect();
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.title');
  applyStatic();
}

/* Self-initialize on import so the very first render is already localized. */
initI18n();
