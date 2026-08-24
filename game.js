/* ============================================================
   末日突围 - 游戏逻辑（ES Module）
   ------------------------------------------------------------
   入口：index.html 通过 <script type="module" src="game.js"> 加载
   样式：style.css（由 index.html 的 <link> 引入）
   页面结构：index.html
   依赖：three.js（index.html 内联 importmap 提供模块映射）
   ============================================================ */
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ============================================================
   全局工具
============================================================ */
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp  = (a,b,t) => a+(b-a)*t;
const rand  = (a,b) => a+Math.random()*(b-a);
const randInt = (a,b) => Math.floor(rand(a,b+1));
// ★ 隐藏司登冲锋枪（不删除代码，仅屏蔽显示）
const HIDE_STEN = true;
// ★ 第一人称手臂动作系统（2026-08-12，Mixamo 动作包驱动程序化手臂）
// 说明：基础射手包/ 内 GLB 为【仅骨骼动画】（无网格、无皮肤），每个文件是累积导出，
//      末尾动画即该文件自身动作。系统只应用旋转轨道（位移轨道是异常根运动，忽略防骨架飞走）。
const ANIM_DIR='基础射手包/';                                // 动作 GLB 目录（相对 index.html）
const ANIM_FADE=0.15;                                        // 状态切换交叉淡入淡出（秒）
const ANIM_ARM_SCALE=1;                                      // 手臂骨架缩放（1=真人尺寸）
const ANIM_ARM_POS=new THREE.Vector3(0.37,-1.70,-0.137); // 手臂骨架相对相机的位置（独立动画；枪跟随手，可调；x=右移=枪械整体往右）
const ANIM_ARM_ROT=new THREE.Euler(0,Math.PI,0);             // 绕 Y 翻转 180°：模型正面(+Z)朝向屏幕内(-Z)
// 枪跟随右手：武器组位置 = 右手相机局部 + 此偏移（使右手恰好落在握把、左手在护木；待机时等效原 hip 位）
const ANIM_GRIP_OFFSET=new THREE.Vector3(-0.05,0.09,-0.10);
const ANIM_TURN_SPEED=3.5;                                   // 快速左转触发阈值（yaw 角速度 rad/s ≈200°/s）
const ANIM_TURN_CD=1.2;                                      // 左转身动画冷却（秒）
const ANIM_RUN_RATE=4.5;                                     // 跑步动画 timeScale 参考速度（防脚滑）
const ANIM_BOB_MUL=0.6;                                      // 移动时手/枪摆动幅度系数（叠加玩家 bob，2026-08-12；1.0 太快太大，用户要求“再稍慢、再小点”回调）
const ANIM_BOB_RATE=0.5;                                     // 移动时手/枪摆动频率倍率（<1=更慢，2026-08-12 用户要求“再稍慢”）
// 每个文件取【最后一个】动画剪辑（累积导出，末尾为自身动作；时长自动读取）
const ANIM_DEFS=[
  {file:'rifle aiming idle.glb', state:'idle',        loop:true },
  {file:'rifle run.glb',         state:'run',         loop:true },
  {file:'rifle jump.glb',        state:'jump',        loop:false},
  {file:'firing rifle.glb',      state:'fire',        loop:false},
  {file:'reloading.glb',         state:'reload',      loop:false},
  {file:'hit reaction.glb',      state:'hit',         loop:false},
  {file:'run backwards.glb',     state:'runBackward', loop:true },
  {file:'walking backwards.glb', state:'walkBackward',loop:true },
  {file:'strafe left.glb',       state:'strafeLeft',  loop:true },
  {file:'strafe right.glb',      state:'strafeRight', loop:true },
  {file:'turn left.glb',         state:'turnLeft',    loop:false},
];
// ★ 手枪动作（2026-08-12，手枪动作GLB格式/，仅骨骼、mixamorig 骨架与基准一致，最后一个剪辑=自身动作）
const PISTOL_ANIM_DIR='手枪动作GLB格式/';
const PISTOL_ANIM_DEFS=[
  {file:'pistol idle.glb',             state:'pistolIdle',          loop:true },
  {file:'pistol run.glb',              state:'pistolRun',           loop:true },
  {file:'pistol run backward.glb',     state:'pistolRunBackward',   loop:true },
  {file:'pistol run arc (2).glb',      state:'pistolRunArc',        loop:true },
  {file:'pistol run backward arc.glb', state:'pistolRunBackwardArc',loop:true },
  {file:'pistol walk arc.glb',         state:'pistolWalkArc',       loop:true },
  {file:'pistol walk backward arc.glb',state:'pistolWalkBackwardArc',loop:true },
  {file:'pistol strafe.glb',           state:'pistolStrafe',        loop:true },
  {file:'pistol jump.glb',             state:'pistolJump',          loop:false},
  {file:'pistol kneeling idle.glb',    state:'pistolKneelingIdle',  loop:true },
  {file:'pistol stand to kneel.glb',   state:'pistolStandToKneel',  loop:false},
  {file:'pistol kneel to stand.glb',   state:'pistolKneelToStand',  loop:false},
];
// ★ 外挂 3D 地图配置（2026-08-11 替代程序化地图；2026-08-11 宽度 100→500 等比放大）
const MAP_MODEL='models/Fps+Map+1.glb';   // 外挂地图模型路径
const MAP_TARGET_WIDTH=450;                // 地图目标宽度（X 轴 units，2026-08-11 500→450）
const MAP_SCALE=MAP_TARGET_WIDTH/100;      // 相对原 100 宽地图的缩放倍率（长度/高度按比例自动适配）
const MAP_BOUNDARY_MARGIN=0.5;             // 边界预留间隙（绝对 units，防止卡模）
const MAP_COLLIDER_CELL=0.5*MAP_SCALE;     // 碰撞体采样网格（随地图等比缩放，保持光栅化工作量恒定）
const MAP_COLLIDER_SEG=4;                  // 碰撞体单段最大长度（绝对 units，保证空间索引按中心可靠命中）
const MAP_SKY_R=Math.round(MAP_TARGET_WIDTH*0.8);     // 天空穹顶半径（须大于地图半对角线，防穹顶穿模）
const MAP_SHOOT_FAR=Math.round(MAP_TARGET_WIDTH*1.2); // 子弹射线最大距离（覆盖全图对角线）
/* ============================================================
   Boss 战配置（第六波触发；单只巨型僵尸 + 小兵刷新，2026-08-11 新增）
============================================================ */
const BOSS_WAVE=6;            // 触发 Boss 战的波次（玩家清完第5波后）
const BOSS_HP=10000;          // Boss 血量
const BOSS_SCALE=5;           // Boss 体型（普通僵尸模型高约 2 单位，5 个叠起≈10 单位 → scale=5）
const BOSS_DAMAGE=25;         // Boss 单次攻击伤害（普通 10）
const BOSS_ATTACK_CD=1.0;     // Boss 攻击冷却（秒）
const BOSS_ATTACK_RANGE=2.5;  // Boss 攻击距离
const BOSS_SPEED_MULT=0.6;    // Boss 移速倍率（普通 1.3 ×0.6 = 慢 40%）
const BOSS_ANNOUNCE_MS=3000;  // Boss 登场提示持续（毫秒），结束后正式生成
const MINION_INTERVAL=20;     // 小兵刷新间隔（秒）
const MINION_BATCH=5;         // 每批小兵数量
const MINION_MAX=20;          // 场上小兵上限（达到则暂停刷新，低于再继续）
const MINION_R_MIN=15, MINION_R_MAX=25; // 小兵在 Boss 周围的刷新半径
// 开局选枪 loadout → 初始主武器 key（sg2=雷明顿1100）
const loadoutWeapon = loadout =>
  loadout==='ar'?'rifle':
  loadout==='sk'||loadout==='sks'?'sks':
  loadout==='sr'?'sniper':
  loadout==='sg2'?'remington':
  loadout==='th'?'thompson':
  loadout==='st'?(HIDE_STEN?'knife':'sten'):
  loadout==='sg'?'shotgun':'knife';

/* ============================================================
   武器配置系统（静态数据 + 配件 + 瞄准镜开镜效果）
   ------------------------------------------------------------
   配件 mods 语义：
     damage    平值伤害加减（如 -3）
     damagePct 百分比伤害（如 +5）
     fireRate  射速百分比（+3 = 加快 3%）
     mag       弹匣容量平值（+15）
     reload    换弹时间百分比（负=更快：快速弹匣 -30 → 0.7x）
     range     有效射程百分比
     accuracy  精准度百分点（+8 = +8%）
     mobility  机动性百分点
     recoil    后坐力百分比（负=更稳：-20 → 0.8x）
     ads       开镜速度百分比（+10 = 更快）
     stealth   隐蔽性（+50 → AI 听觉半径减半）
     spread    弹丸散布百分比（散弹枪用，负=更集中）
   瞄准镜 scopeType 对应 SCOPE_DEFS 的开镜视觉参数
============================================================ */
const WEAPON_DEFS = {
  pistol: {
    key:'pistol', name:'G18', cat:'手枪', icon:'?', mainLoadout:'pistol',
    base:{ damage:14, fireRate:1100, magSize:17, reloadTime:1.8, range:25, accuracy:80, mobility:93 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:8, ads:10}, scopeType:'reddot' },
        { id:'micro', name:'微型全息镜', mods:{accuracy:12}, scopeType:'micro' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准枪管（默认）', mods:{} },
        { id:'suppressor', name:'小型消音器', mods:{damage:-2, range:-15, stealth:50} },
        { id:'brake', name:'枪口制退器', mods:{recoil:-20, accuracy:5} }
      ]},
      { id:'mag', label:'弹匣', options:[
        { id:'std', name:'标准弹匣（默认）', mods:{} },
        { id:'quick', name:'快速弹匣', mods:{reload:-25} },
        { id:'ext', name:'扩容弹匣', mods:{mag:5, reload:20} }
      ]}
    ]
  },
  rifle: {
    key:'rifle', name:'AK-12', cat:'突击步枪', icon:'?', mainLoadout:'ar',
    base:{ damage:20, fireRate:600, magSize:30, reloadTime:2.2, range:50, accuracy:70, mobility:70 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:8, ads:12}, scopeType:'reddot' },
        { id:'holo', name:'全息瞄准镜', mods:{accuracy:15, ads:-5}, scopeType:'holo' },
        { id:'scope2x', name:'2倍瞄准镜', mods:{accuracy:20, range:15, ads:-15}, scopeType:'scope2x' },
        { id:'scope4x', name:'4倍瞄准镜', mods:{accuracy:28, range:25, ads:-25}, scopeType:'scope4x' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准枪管（默认）', mods:{} },
        { id:'suppressor', name:'消音器', mods:{damage:-3, range:-12, stealth:50, accuracy:5} },
        { id:'compensator', name:'补偿器', mods:{recoil:-25, accuracy:8, range:5} },
        { id:'brake', name:'制退器', mods:{recoil:-18, accuracy:5, fireRate:3} }
      ]},
      { id:'mag', label:'弹匣', options:[
        { id:'std', name:'标准弹匣（默认）', mods:{} },
        { id:'quick', name:'快速弹匣', mods:{reload:-30} },
        { id:'ext', name:'扩容弹匣', mods:{mag:15, reload:20, mobility:-5} }
      ]},
      { id:'grip', label:'握把', options:[
        { id:'std', name:'标准握把（默认）', mods:{} },
        { id:'vertical', name:'垂直握把', mods:{recoil:-20, accuracy:10, ads:-5} },
        { id:'angled', name:'直角握把', mods:{recoil:-10, ads:15, mobility:8} },
        { id:'light', name:'轻量握把', mods:{mobility:15, ads:10, recoil:8} }
      ]},
      { id:'stock', label:'枪托', options:[
        { id:'std', name:'标准枪托（默认）', mods:{} },
        { id:'light', name:'轻量枪托', mods:{mobility:15, ads:10, recoil:12} },
        { id:'stable', name:'稳定枪托', mods:{recoil:-15, accuracy:10, mobility:-8} }
      ]}
    ]
  },
  sks: {
    key:'sks', name:'SKS', cat:'半自动步枪', icon:'?', mainLoadout:'sks',
    base:{ damage:18, fireRate:400, magSize:10, reloadTime:2.0, range:60, accuracy:80, mobility:88 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:8, ads:12}, scopeType:'reddot' },
        { id:'holo', name:'全息瞄准镜', mods:{accuracy:15, ads:-5}, scopeType:'holo' },
        { id:'scope2x', name:'2倍瞄准镜', mods:{accuracy:20, range:15, ads:-15}, scopeType:'scope2x' },
        { id:'scope4x', name:'4倍瞄准镜', mods:{accuracy:28, range:25, ads:-25}, scopeType:'scope4x' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准（默认）', mods:{} },
        { id:'suppressor', name:'消音器', mods:{damage:-3, range:-12, stealth:50, accuracy:5} },
        { id:'compensator', name:'补偿器', mods:{recoil:-25, accuracy:8, range:5} },
        { id:'brake', name:'制退器', mods:{recoil:-18, accuracy:5, fireRate:3} }
      ]},
      { id:'mag', label:'弹匣', options:[
        { id:'std', name:'标准弹匣（默认，10发）', mods:{} },
        { id:'quick', name:'快速弹匣', mods:{reload:-25} },
        { id:'ext', name:'扩容弹匣', mods:{mag:10, reload:20} }
      ]},
      { id:'stock', label:'枪托', options:[
        { id:'std', name:'标准枪托（默认）', mods:{} },
        { id:'light', name:'轻量枪托', mods:{mobility:15, ads:10, recoil:12} },
        { id:'stable', name:'稳定枪托', mods:{recoil:-15, accuracy:10, mobility:-8} }
      ]}
    ]
  },
  sniper: {
    key:'sniper', name:'M24', cat:'狙击步枪', icon:'?', mainLoadout:'sr',
    base:{ damage:300, fireRate:75, magSize:5, reloadTime:3.2, range:120, accuracy:95, mobility:40 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'scope4x', name:'4倍瞄准镜', mods:{accuracy:15, range:20, ads:-15}, scopeType:'scope4x' },
        { id:'scope6x', name:'6倍瞄准镜', mods:{accuracy:25, range:35, ads:-25}, scopeType:'scope6x' },
        { id:'scope8x', name:'8倍瞄准镜', mods:{accuracy:35, range:50, ads:-35}, scopeType:'scope8x' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准枪管（默认）', mods:{} },
        { id:'suppressor', name:'消音器', mods:{damage:-8, range:-10, stealth:50, accuracy:8} },
        { id:'brake', name:'枪口制退器', mods:{recoil:-30, accuracy:10} }
      ]},
      { id:'mag', label:'弹匣', options:[
        { id:'std', name:'标准弹匣（默认）', mods:{} },
        { id:'quick', name:'快速弹匣', mods:{reload:-25} },
        { id:'ext', name:'扩容弹匣', mods:{mag:5, reload:25, mobility:-10} }
      ]},
      { id:'stock', label:'枪托', options:[
        { id:'std', name:'标准枪托（默认）', mods:{} },
        { id:'light', name:'轻量枪托', mods:{mobility:12, ads:8, recoil:15} },
        { id:'stable', name:'稳定枪托', mods:{recoil:-20, accuracy:12, mobility:-10} }
      ]}
    ]
  },
  shotgun: {
    key:'shotgun', name:'贝内利M3', cat:'散弹枪', icon:'?', mainLoadout:'sg',
    base:{ damage:15, fireRate:75, magSize:6, reloadTime:0.4, range:15, accuracy:45, mobility:75 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:10, ads:10}, scopeType:'reddot' },
        { id:'holo', name:'全息瞄准镜', mods:{accuracy:15, ads:-5}, scopeType:'holo' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准枪管（默认）', mods:{} },
        { id:'choke', name:'收束器', mods:{spread:-30, range:20, damagePct:5} },
        { id:'suppressor', name:'消音器', mods:{damage:-5, range:-10, stealth:50, spread:15} },
        { id:'brake', name:'枪口制退器', mods:{recoil:-25, accuracy:8} }
      ]},
      { id:'mag', label:'弹仓', options:[
        { id:'std', name:'标准弹仓（默认）', mods:{} },
        { id:'quick', name:'快速装弹器', mods:{reload:-35} },
        { id:'ext', name:'扩容弹仓', mods:{mag:4, reload:25, mobility:-5} }
      ]}
    ]
  },
  remington: {
    key:'remington', name:'雷明顿1100', cat:'半自动霰弹枪', icon:'?', mainLoadout:'sg2',
    base:{ damage:12, fireRate:150, magSize:4, reloadTime:0.35, range:12, accuracy:40, mobility:80 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:10, ads:10}, scopeType:'reddot' },
        { id:'holo', name:'全息瞄准镜', mods:{accuracy:15, ads:-5}, scopeType:'holo' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准枪管（默认）', mods:{} },
        { id:'choke', name:'收束器', mods:{spread:-30, range:20, damagePct:5} },
        { id:'suppressor', name:'消音器', mods:{damage:-3, range:-10, stealth:50, spread:15} },
        { id:'brake', name:'枪口制退器', mods:{recoil:-25, accuracy:8} }
      ]},
      { id:'mag', label:'弹仓', options:[
        { id:'std', name:'标准弹仓（默认）', mods:{} },
        { id:'quick', name:'快速装弹器', mods:{reload:-20} },
        { id:'ext', name:'扩容弹仓', mods:{mag:2, reload:15, mobility:-3} }
      ]}
    ]
  },
  thompson: {
    key:'thompson', name:'汤普森', cat:'冲锋枪', icon:'?', mainLoadout:'th',
    base:{ damage:14, fireRate:700, magSize:30, reloadTime:1.6, range:35, accuracy:55, mobility:88 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:10, ads:10}, scopeType:'reddot' },
        { id:'holo', name:'全息瞄准镜', mods:{accuracy:15, ads:-5}, scopeType:'holo' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准枪管（默认）', mods:{} },
        { id:'suppressor', name:'消音器', mods:{damage:-2, range:-10, stealth:50} },
        { id:'compensator', name:'补偿器', mods:{recoil:-20, accuracy:5} }
      ]},
      { id:'mag', label:'弹匣', options:[
        { id:'std', name:'标准弹匣（默认）', mods:{} },
        { id:'quick', name:'快速弹匣', mods:{reload:-25} },
        { id:'ext', name:'扩容弹匣', mods:{mag:20, reload:15, mobility:-5} }
      ]},
      { id:'grip', label:'握把', options:[
        { id:'std', name:'标准握把（默认）', mods:{} },
        { id:'vertical', name:'垂直握把', mods:{recoil:-18, accuracy:8, ads:-5} },
        { id:'angled', name:'直角握把', mods:{recoil:-8, ads:12, mobility:6} }
      ]},
      { id:'stock', label:'枪托', options:[
        { id:'std', name:'标准枪托（默认）', mods:{} },
        { id:'light', name:'轻量枪托', mods:{mobility:12, ads:8, recoil:10} },
        { id:'stable', name:'稳定枪托', mods:{recoil:-15, accuracy:10, mobility:-6} }
      ]}
    ]
  },
  sten: {
    key:'sten', name:'司登冲锋枪', cat:'冲锋枪', icon:'?', mainLoadout:'st',
    base:{ damage:13, fireRate:850, magSize:32, reloadTime:2.4, range:30, accuracy:70, mobility:90 },
    slots:[
      { id:'scope', label:'瞄准镜', options:[
        { id:'irons', name:'机械瞄具（默认）', mods:{}, scopeType:'irons' },
        { id:'reddot', name:'红点瞄准镜', mods:{accuracy:8, ads:10}, scopeType:'reddot' },
        { id:'holo', name:'全息瞄准镜', mods:{accuracy:12, ads:-5}, scopeType:'holo' }
      ]},
      { id:'muzzle', label:'枪口', options:[
        { id:'std', name:'标准（默认）', mods:{} },
        { id:'suppressor', name:'消音器', mods:{damage:-2, range:-10, stealth:50} }
      ]},
      { id:'mag', label:'弹匣', options:[
        { id:'std', name:'标准弹匣（默认，32发）', mods:{} },
        { id:'quick', name:'快速弹匣', mods:{reload:-25} },
        { id:'ext', name:'扩容弹匣', mods:{mag:10, reload:20} }
      ]},
      { id:'stock', label:'枪托', options:[
        { id:'std', name:'标准枪托（默认）', mods:{} },
        { id:'light', name:'轻量枪托', mods:{mobility:5, ads:8, recoil:10} }
      ]}
    ]
  }
};
// 武器库列表顺序（含战术刀，无配件）
const WEAPON_LIST_ALL = [
  { key:'rifle', def:'rifle' },
  { key:'sks', def:'sks' },
  { key:'sniper', def:'sniper' },
  { key:'remington', def:'remington' },
  { key:'shotgun', def:'shotgun' },
  { key:'thompson', def:'thompson' },
  { key:'sten', def:'sten' },
  { key:'pistol', def:'pistol' },
  { key:'knife', def:null, name:'战术刀', icon:'?', cat:'近战', mainLoadout:'knife' }
];
const WEAPON_LIST = HIDE_STEN ? WEAPON_LIST_ALL.filter(w=>w.key!=='sten') : WEAPON_LIST_ALL;
// 开镜效果参数（FOV / 开镜速度 / 呼吸晃动 / 屏息 / 镜框 / 分划 / 镜片镀膜 / 模糊）
const SCOPE_DEFS = {
  irons:  { name:'机械瞄具', fov:65, adsRate:20, sway:0, breath:0, window:null, reticle:'irons', lens:'#555555', blur:0, vignette:0.35 },
  reddot: { name:'红点瞄准镜', fov:75, adsRate:18, sway:0.001, breath:0, window:{type:'rect', w:0.06, h:0.05}, reticle:'reddot', lens:'#88ccff', blur:0, vignette:0.22 },
  micro:  { name:'微型全息镜', fov:75, adsRate:17, sway:0.001, breath:0, window:{type:'rect', w:0.05, h:0.04}, reticle:'micro', lens:'#aa88ff', blur:0, vignette:0.22 },
  holo:   { name:'全息瞄准镜', fov:70, adsRate:16, sway:0.0015, breath:0, window:{type:'rect', w:0.08, h:0.06}, reticle:'holo', lens:'#aa88ff', blur:0, vignette:0.25 },
  scope2x:{ name:'2倍瞄准镜', fov:40, adsRate:10, sway:0.005, breath:0.5, window:{type:'circle', r:0.30}, reticle:'scope2x', lens:'#88ccff', blur:1.4, vignette:0.62 },
  scope4x:{ name:'4倍瞄准镜', fov:20, adsRate:7.5, sway:0.010, breath:0.8, window:{type:'circle', r:0.35}, reticle:'scope4x', lens:'#9966ff', blur:2.0, vignette:0.72 },
  scope6x:{ name:'6倍瞄准镜', fov:13, adsRate:6, sway:0.015, breath:1.0, window:{type:'circle', r:0.40}, reticle:'scope6x', lens:'#7755dd', blur:2.6, vignette:0.8 },
  scope8x:{ name:'8倍瞄准镜', fov:8, adsRate:5, sway:0.020, breath:1.2, window:{type:'circle', r:0.45}, reticle:'scope8x', lens:'#6644cc', blur:3.0, vignette:0.85 }
};
// 配件配置持久化（localStorage 键 weapon_loadouts）
function loadWeaponLoadouts(){
  try{
    const s=JSON.parse(localStorage.getItem('weapon_loadouts')||'{}');
    const out={};
    const keys=['pistol','rifle','sks','sniper','shotgun','remington','thompson'];
    if(!HIDE_STEN) keys.push('sten');
    for(const key of keys){
      const def=WEAPON_DEFS[key];
      const sel={};
      for(const slot of def.slots) sel[slot.id]=(s[key]&&s[key][slot.id])||slot.options[0].id;
      out[key]=sel;
    }
    return out;
  }catch(e){
    const out={};
    for(const key of Object.keys(WEAPON_DEFS)){ const sel={}; for(const slot of WEAPON_DEFS[key].slots) sel[slot.id]=slot.options[0].id; out[key]=sel; }
    return out;
  }
}
function saveWeaponLoadouts(loadouts){
  try{ localStorage.setItem('weapon_loadouts',JSON.stringify(loadouts)); }catch(e){}
}
// 计算某把武器的综合属性（基础值 + 配件加成）
function computeWeaponStats(key,loadout){
  const def=WEAPON_DEFS[key]; if(!def) return null;
  const sel=loadout[key]||{};
  const s={ damage:def.base.damage, fireRate:def.base.fireRate, magSize:def.base.magSize,
    reloadTime:def.base.reloadTime, range:def.base.range, accuracy:def.base.accuracy, mobility:def.base.mobility,
    recoilMod:0, adsMod:0, stealth:0, spread:0, damagePct:0, scopeType:'irons', scopeName:'机械瞄具（默认）' };
  for(const slot of def.slots){
    const opt=slot.options.find(o=>o.id===sel[slot.id])||slot.options[0];
    const m=opt.mods||{};
    if(m.damage) s.damage+=m.damage;
    if(m.damagePct) s.damagePct+=m.damagePct;
    if(m.fireRate) s.fireRate*=1+m.fireRate/100;
    if(m.mag) s.magSize+=m.mag;
    if(m.reload) s.reloadTime*=1+m.reload/100;
    if(m.range) s.range*=1+m.range/100;
    if(m.accuracy) s.accuracy+=m.accuracy;
    if(m.mobility) s.mobility+=m.mobility;
    if(m.recoil) s.recoilMod+=m.recoil;
    if(m.ads) s.adsMod+=m.ads;
    if(m.stealth) s.stealth+=m.stealth;
    if(m.spread) s.spread+=m.spread;
    if(opt.scopeType){ s.scopeType=opt.scopeType; s.scopeName=opt.name; }
  }
  s.accuracy=clamp(s.accuracy,5,100);
  s.mobility=clamp(s.mobility,5,100);
  s.fireRate=Math.max(30,Math.round(s.fireRate));
  s.magSize=Math.max(1,Math.round(s.magSize));
  s.reloadTime=Math.max(0.15,Math.round(s.reloadTime*100)/100);
  s.damage=Math.max(1,Math.round(s.damage));
  s.range=Math.max(5,Math.round(s.range));
  s.recoilMult=clamp(1+s.recoilMod/100,0.4,1.8);
  s.adsMult=clamp(1+s.adsMod/100,0.5,2.0);
  return s;
}
// 依据配件 mods 计算属性条颜色（高绿/中黄/低红）
function statColor(ratio){ return ratio>=0.7?'#3ddc58':(ratio>=0.4?'#f2c94c':'#e5484d'); }
// hex 颜色转 rgba 字符串（用于镜片镀膜反光等半透明绘制）
function hexA(hex,a){
  const n=parseInt(hex.replace('#',''),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

/* ============================================================
   程序化纹理生成器（全部 Canvas 绘制，不引用外部图片）
============================================================ */
function makeCanvas(w,h){
  // 纹理分辨率限制 512 避免爆显存
  const S=512;
  const c=document.createElement('canvas');
  c.width=S; c.height=S;
  c._dw=w; c._dh=h;
  const _ctx=c.getContext('2d',{willReadFrequently:true});
  _ctx.scale(S/w, S/h);
  const _gid=_ctx.getImageData.bind(_ctx);
  _ctx.getImageData=function(){ return _gid(0,0,c.width,c.height); };
  return c;
}
// 带 willReadFrequently 的 canvas（消除 getImageData 性能警告）
function makeCanvasFast(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

// 柏油路 / 混凝土：多重噪点 + 随机裂纹 + 深色污渍斑块
function makeConcreteTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#3a3c3d'; ctx.fillRect(0,0,256,256);
  // 多重噪点层
  for(let l=0;l<3;l++){
    const img=ctx.getImageData(0,0,256,256), d=img.data;
    for(let i=0;i<d.length;i+=4){
      const n=(Math.random()-0.5)*(16+l*4);
      d[i]+=n; d[i+1]+=n; d[i+2]+=n;
    }
    ctx.putImageData(img,0,0);
  }
  // 随机裂纹（细黑线）
  ctx.lineCap='round';
  for(let i=0;i<16;i++){
    let x=Math.random()*256, y=Math.random()*256;
    ctx.strokeStyle=`rgba(0,0,0,${rand(0.3,0.6)})`;
    ctx.lineWidth=rand(0.8,2.2);
    ctx.beginPath(); ctx.moveTo(x,y);
    const segs=randInt(4,9);
    for(let s=0;s<segs;s++){
      x+=(Math.random()-0.5)*42; y+=(Math.random()-0.5)*42;
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  // 深色污渍斑块（半径 10~50px）
  for(let i=0;i<26;i++){
    const x=Math.random()*256,y=Math.random()*256,r=rand(10,50);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(10,8,6,${rand(0.10,0.24)})`);
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  // 细碎颗粒
  for(let i=0;i<400;i++){
    ctx.fillStyle=`rgba(0,0,0,${rand(0.05,0.25)})`;
    ctx.fillRect(Math.random()*256,Math.random()*256,rand(1,3),rand(1,3));
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 粗糙度贴图：粗糙度约 0.9
function makeRoughnessTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='rgb(232,232,232)'; ctx.fillRect(0,0,128,128);
  const img=ctx.getImageData(0,0,128,128), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*34;
    d[i]=d[i+1]=d[i+2]=clamp(232+n,150,255);
  }
  ctx.putImageData(img,0,0);
  for(let i=0;i<40;i++){
    const x=Math.random()*128,y=Math.random()*128,r=rand(4,20);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${rand(90,160)},${rand(90,160)},${rand(90,160)},0.5)`);
    g.addColorStop(1,'rgba(232,232,232,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// ==================== CS 1.6 风格：沙漠沙地面（de_dust/de_dust2 经典配色） ====================
// 明亮沙黄色 + 细腻沙粒噪点 + 明暗沙地斑块 + 少量风化浅痕（干净、高辨识度）
function makeCSGroundTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  // 基底：CS dust 经典沙黄色
  ctx.fillStyle='#cdb175'; ctx.fillRect(0,0,256,256);
  // 多重沙粒噪点（暖色偏黄）
  for(let l=0;l<3;l++){
    const img=ctx.getImageData(0,0,256,256), d=img.data;
    for(let i=0;i<d.length;i+=4){
      const n=(Math.random()-0.5)*(22+l*6);
      d[i]+=n*0.9; d[i+1]+=n; d[i+2]+=n*0.6; // 偏黄调
    }
    ctx.putImageData(img,0,0);
  }
  // 明暗沙地斑块（大而柔和，模拟沙丘起伏）
  for(let i=0;i<22;i++){
    const x=Math.random()*256, y=Math.random()*256, r=rand(24,80);
    const light=Math.random()<0.5;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    if(light){
      g.addColorStop(0,`rgba(255,235,185,${rand(0.12,0.3)})`);
      g.addColorStop(1,'rgba(255,235,185,0)');
    } else {
      g.addColorStop(0,`rgba(160,130,80,${rand(0.12,0.28)})`);
      g.addColorStop(1,'rgba(160,130,80,0)');
    }
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  // 细密沙粒颗粒（散点，偏暖）
  for(let i=0;i<1500;i++){
    ctx.fillStyle=`rgba(${rand(120,220)},${rand(105,190)},${rand(70,140)},${rand(0.05,0.3)})`;
    ctx.fillRect(Math.random()*256,Math.random()*256,rand(1,2.5),rand(1,2.5));
  }
  // 极淡的风化浅痕/裂缝（低对比，不像混凝土深裂纹）
  ctx.lineCap='round';
  for(let i=0;i<5;i++){
    let x=Math.random()*256, y=Math.random()*256;
    ctx.strokeStyle=`rgba(120,95,55,${rand(0.12,0.22)})`;
    ctx.lineWidth=rand(0.8,1.6);
    ctx.beginPath(); ctx.moveTo(x,y);
    const segs=randInt(3,6);
    for(let s=0;s<segs;s++){
      x+=(Math.random()-0.5)*38; y+=(Math.random()-0.5)*38;
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
// CS 风格地面粗糙度贴图（沙地：均匀中高粗糙度，略带斑驳）
function makeCSRoughnessTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='rgb(215,215,215)'; ctx.fillRect(0,0,128,128);
  const img=ctx.getImageData(0,0,128,128), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*26;
    d[i]=d[i+1]=d[i+2]=clamp(215+n,150,255);
  }
  ctx.putImageData(img,0,0);
  for(let i=0;i<30;i++){
    const x=Math.random()*128,y=Math.random()*128,r=rand(6,24);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${rand(150,200)},${rand(150,200)},${rand(150,200)},0.45)`);
    g.addColorStop(1,'rgba(215,215,215,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 车辆车身：暗红/军绿底色 + 铁锈层
function makeVehicleTexture(kind){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  const base = kind==='green' ? '#3a4a2c' : '#4a2620';
  ctx.fillStyle=base; ctx.fillRect(0,0,256,256);
  const img=ctx.getImageData(0,0,256,256), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*16; d[i]+=n; d[i+1]+=n; d[i+2]+=n;
  }
  ctx.putImageData(img,0,0);
  // 铁锈层：橙/棕径向渐变，边缘不规则
  for(let i=0;i<30;i++){
    const x=Math.random()*256,y=Math.random()*256,r=rand(8,34);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    const c0=Math.random()<0.5 ? '#8a4a1e' : '#5a2f12';
    g.addColorStop(0,c0);
    g.addColorStop(0.6,`rgba(120,60,20,0.5)`);
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath();
    // 不规则边缘
    ctx.moveTo(x+r, y);
    for(let a=0;a<Math.PI*2;a+=0.35){
      ctx.lineTo(x+Math.cos(a)*r*rand(0.7,1.25), y+Math.sin(a)*r*rand(0.7,1.25));
    }
    ctx.closePath(); ctx.fill();
  }
  // 划痕
  ctx.strokeStyle='rgba(20,18,14,0.5)';
  for(let i=0;i<40;i++){
    ctx.beginPath();
    ctx.moveTo(Math.random()*256,Math.random()*256);
    ctx.lineTo(Math.random()*256,Math.random()*256);
    ctx.lineWidth=rand(0.5,1.6); ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 轮胎：纯黑哑光 + 纵向磨损胎纹
function makeTireTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,128,128);
  for(let i=0;i<8;i++){
    const x=i*16+rand(2,8);
    ctx.fillStyle=`rgba(40,40,42,${rand(0.15,0.4)})`;
    ctx.fillRect(x,0,rand(2,5),128);
  }
  const img=ctx.getImageData(0,0,128,128), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*18; d[i]+=n; d[i+1]+=n; d[i+2]+=n;
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 木质货箱：木纹 + 破损缺口 + 霉斑 + 血迹
function makeCrateTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#7a5a33'; ctx.fillRect(0,0,256,256);
  // 木板条纹
  for(let i=0;i<7;i++){
    ctx.fillStyle=`rgba(${rand(40,80)},${rand(28,56)},${rand(12,30)},0.6)`;
    ctx.fillRect(0,i*36+rand(0,8),256,rand(10,18));
  }
  const img=ctx.getImageData(0,0,256,256), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*24; d[i]+=n; d[i+1]+=n; d[i+2]+=n;
  }
  ctx.putImageData(img,0,0);
  // 破损缺口（锯齿状暗色块）
  for(let e=0;e<6;e++){
    const edge=Math.floor(Math.random()*4);
    ctx.fillStyle='rgba(20,14,8,0.85)';
    const len=rand(20,50);
    if(edge===0){ let x=Math.random()*256; for(let j=0;j<len;j++){ ctx.fillRect(x+j,0,3,rand(3,12)); } }
    else if(edge===1){ let x=Math.random()*256; for(let j=0;j<len;j++){ ctx.fillRect(x+j,256-rand(3,12),3,rand(3,12)); } }
    else if(edge===2){ let y=Math.random()*256; for(let j=0;j<len;j++){ ctx.fillRect(0,y+j,rand(3,12),3); } }
    else { let y=Math.random()*256; for(let j=0;j<len;j++){ ctx.fillRect(256-rand(3,12),y+j,rand(3,12),3); } }
  }
  // 霉斑（灰绿圆形不规则）
  for(let i=0;i<14;i++){
    const x=Math.random()*256,y=Math.random()*256,r=rand(6,22);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${rand(70,100)},${rand(100,120)},${rand(60,85)},${rand(0.25,0.5)})`);
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  // 血迹喷溅（暗红随机拖尾点状）
  for(let i=0;i<5;i++){
    let x=Math.random()*256, y=Math.random()*256;
    ctx.fillStyle=`rgba(${rand(90,130)},${rand(10,22)},${rand(10,20)},${rand(0.4,0.75)})`;
    const n=randInt(8,16);
    for(let j=0;j<n;j++){
      ctx.beginPath();
      ctx.arc(x+rand(-24,24), y+rand(-24,24), rand(1,4), 0, Math.PI*2);
      ctx.fill();
      x+=rand(-8,8); y+=rand(-8,8);
    }
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 新增功能：防滑交叉线纹理（步枪护木）
function makeHatchTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#2d3d2d'; ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='rgba(18,28,18,0.8)'; ctx.lineWidth=2;
  for(let i=-64;i<192;i+=10){
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(128,i+20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128,i); ctx.lineTo(0,i+20); ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 新增功能：房屋墙体纹理（脏旧混凝土 + 霉斑 + 喷漆涂鸦）
function makeHouseWallTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#3a3c3d'; ctx.fillRect(0,0,256,256);
  for(let l=0;l<3;l++){
    const img=ctx.getImageData(0,0,256,256), d=img.data;
    for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*(16+l*4); d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
    ctx.putImageData(img,0,0);
  }
  // 裂纹
  ctx.lineCap='round';
  for(let i=0;i<12;i++){
    let x=Math.random()*256, y=Math.random()*256;
    ctx.strokeStyle=`rgba(0,0,0,${rand(0.3,0.6)})`; ctx.lineWidth=rand(0.8,2);
    ctx.beginPath(); ctx.moveTo(x,y);
    const s=randInt(4,8);
    for(let j=0;j<s;j++){ x+=(Math.random()-0.5)*40; y+=(Math.random()-0.5)*40; ctx.lineTo(x,y); }
    ctx.stroke();
  }
  // 大面积霉斑（灰绿不规则）
  for(let i=0;i<26;i++){
    const x=Math.random()*256, y=Math.random()*256, r=rand(8,30);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${rand(50,80)},${rand(70,100)},${rand(45,70)},${rand(0.25,0.5)})`);
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  // 喷漆涂鸦 HELP / RUN
  ctx.font='bold 32px Arial'; ctx.fillStyle='rgba(140,25,20,0.7)'; ctx.textAlign='center';
  ctx.fillText(Math.random()<0.5?'HELP':'RUN', Math.random()*120+60, Math.random()*120+90);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 新增功能：屋顶深色瓦片纹理（不规则灰黑方块）
function makeRoofTileTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#3a3a3a'; ctx.fillRect(0,0,128,128);
  for(let y=0;y<128;y+=16) for(let x=0;x<128;x+=16){
    const v=rand(40,72);
    ctx.fillStyle=`rgb(${v},${v},${v+6})`;
    ctx.fillRect(x+rand(-2,2), y+rand(-2,2), 14+rand(-3,3), 12+rand(-2,2));
  }
  const img=ctx.getImageData(0,0,128,128), d=img.data;
  for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*30; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 新增功能：破损木地板纹理（棕色条纹 + 随机断裂缺口）
function makeWoodFloorTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#5a4226'; ctx.fillRect(0,0,128,128);
  for(let i=0;i<6;i++){
    ctx.fillStyle=`rgba(${rand(40,70)},${rand(28,50)},${rand(12,30)},0.7)`;
    ctx.fillRect(0, i*22+rand(0,6), 128, rand(10,16));
  }
  for(let i=0;i<10;i++){
    ctx.fillStyle='rgba(15,10,5,0.9)';
    ctx.fillRect(Math.random()*128, rand(0,6)*22, rand(4,16), rand(6,14));
  }
  for(let i=0;i<12;i++){
    const x=Math.random()*128, y=Math.random()*128, r=rand(5,18);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(0,0,0,${rand(0.1,0.3)})`); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  const img=ctx.getImageData(0,0,128,128), d=img.data;
  for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*18; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 新增功能：血迹喷溅纹理（不规则半透明多边形）
function makeBloodTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,128,128);
  for(let i=0;i<8;i++){
    const x=Math.random()*128, y=Math.random()*128, r=rand(12,34);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,`rgba(${rand(90,120)},${rand(8,16)},${rand(8,16)},${rand(0.5,0.85)})`);
    g.addColorStop(1,'rgba(120,10,10,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.moveTo(x+r,y);
    for(let a=0;a<Math.PI*2;a+=0.4) ctx.lineTo(x+Math.cos(a)*r*rand(0.6,1.2), y+Math.sin(a)*r*rand(0.6,1.2));
    ctx.closePath(); ctx.fill();
  }
  for(let i=0;i<20;i++){
    ctx.fillStyle=`rgba(${rand(90,125)},${rand(8,15)},${rand(8,15)},${rand(0.4,0.8)})`;
    ctx.beginPath(); ctx.arc(Math.random()*128,Math.random()*128,rand(1,3),0,Math.PI*2); ctx.fill();
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

// 握把磨砂颗粒纹理
function makeGripTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#1c1c1e'; ctx.fillRect(0,0,128,128);
  for(let i=0;i<2600;i++){
    ctx.fillStyle=`rgba(${rand(40,90)},${rand(40,90)},${rand(44,95)},${rand(0.2,0.5)})`;
    ctx.fillRect(Math.random()*128,Math.random()*128,1.6,1.6);
  }
  for(let i=0;i<5;i++){
    ctx.fillStyle='rgba(90,90,100,0.15)';
    ctx.fillRect(0,i*26,128,3);
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

// 刀柄伞绳缠绕（交叉斜纹）
function makeWrapTexture(){
  const c=makeCanvas(64,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#2d4a2d'; ctx.fillRect(0,0,64,128);
  ctx.strokeStyle='rgba(10,20,10,0.8)'; ctx.lineWidth=4;
  for(let i=-64;i<192;i+=12){
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(64,i+64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64,i); ctx.lineTo(0,i+64); ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 雾噪纹理（地面薄雾用）
function makeMistTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,256,256);
  ctx.fillStyle='#3d2b1f';
  for(let i=0;i<90;i++){
    const x=Math.random()*256,y=Math.random()*256,r=rand(14,44);
    ctx.globalAlpha=rand(0.05,0.16);
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// 圆形光点（粒子/闪光）
function makeGlowTexture(){
  const c=makeCanvas(64,64), ctx=c.getContext('2d',{willReadFrequently:true});
  const g=ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.4,'rgba(255,255,255,0.7)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}

// 刀光弧形纹理
function makeSlashTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.strokeStyle='rgba(255,255,255,1)';
  ctx.lineCap='round';
  for(let i=0;i<3;i++){
    ctx.lineWidth=5-i;
    ctx.globalAlpha=0.9-i*0.25;
    ctx.beginPath();
    ctx.arc(64,64,52-i*6, -Math.PI*0.75, Math.PI*0.25);
    ctx.stroke();
  }
  ctx.globalAlpha=1;
  return new THREE.CanvasTexture(c);
}

// 新增功能：枪口火焰十字星芒纹理（中心光斑 + 多层芒刺）
function makeFlashTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  const g=ctx.createRadialGradient(64,64,0,64,64,58);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(0.35,'rgba(255,235,190,0.95)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  ctx.lineCap='round';
  // 主芒（十字）
  ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=6;
  for(const [dx,dy] of [[1,0],[0,1]]){
    ctx.beginPath(); ctx.moveTo(64-dx*54,64-dy*54); ctx.lineTo(64+dx*54,64+dy*54); ctx.stroke();
  }
  // 对角次芒
  ctx.strokeStyle='rgba(255,200,130,0.75)'; ctx.lineWidth=3;
  for(const [dx,dy] of [[0.707,0.707],[-0.707,0.707]]){
    ctx.beginPath(); ctx.moveTo(64-dx*48,64-dy*48); ctx.lineTo(64+dx*48,64+dy*48); ctx.stroke();
  }
  // 细长芒
  ctx.strokeStyle='rgba(255,180,110,0.55)'; ctx.lineWidth=1.5;
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(64+Math.cos(a)*30,64+Math.sin(a)*30);
    ctx.lineTo(64+Math.cos(a)*60,64+Math.sin(a)*60);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// ==================== 新增功能：动态夜空 / 边界纹理 ====================
// 夜空穹顶纹理（深空蓝黑→地平线暗紫 + 银河带 + 雾霭条带）
function makeNightSkyTexture(){
  const c=makeCanvas(1024,512), ctx=c.getContext('2d',{willReadFrequently:true});
  const g=ctx.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#05050e');
  g.addColorStop(0.42,'#0a0a14');
  g.addColorStop(0.72,'#140a18');
  g.addColorStop(0.9,'#1a1016');
  g.addColorStop(1,'#1e1818'); // 地平线接近雾色 0x1a1e1a
  ctx.fillStyle=g; ctx.fillRect(0,0,1024,512);
  // 银河带（朦胧斜带，两条错开的光带）
  ctx.save();
  ctx.translate(512,220); ctx.rotate(-0.28);
  for(const [y,w,alpha] of [[0,110,0.06],[-28,70,0.045],[26,60,0.04]]){
    const gg=ctx.createLinearGradient(0,y,0,y+w);
    gg.addColorStop(0,'rgba(160,150,200,0)');
    gg.addColorStop(0.5,`rgba(165,155,210,${alpha})`);
    gg.addColorStop(1,'rgba(160,150,200,0)');
    ctx.fillStyle=gg; ctx.fillRect(-600,y,1200,w);
  }
  // 银河内密集微星
  for(let i=0;i<420;i++){
    const x=rand(-540,540), y=rand(-40,60);
    ctx.fillStyle=`rgba(200,195,235,${rand(0.06,0.4)})`;
    const s=rand(0.6,1.8);
    ctx.fillRect(x,y,s,s);
  }
  ctx.restore();
  // 已烘焙的静态星点（基座，闪烁星由 Points 单独实现）
  for(let i=0;i<520;i++){
    const x=rand(0,1024), y=rand(0,430);
    ctx.fillStyle=`rgba(255,255,255,${rand(0.15,0.75)})`;
    ctx.fillRect(x,y,rand(1,2.6),rand(1,2.6));
  }
  // 地平线雾霭（暗棕/灰色横向条带，模拟远处废墟烟尘）
  for(let i=0;i<26;i++){
    const y=rand(430,512);
    ctx.fillStyle=`rgba(${rand(40,70)},${rand(36,58)},${rand(30,46)},${rand(0.05,0.16)})`;
    ctx.fillRect(0,y,1024,rand(4,14));
  }
  // 地平线红色废墟辉光（极淡，营造末日氛围）
  const rg=ctx.createLinearGradient(0,470,0,512);
  rg.addColorStop(0,'rgba(120,30,20,0)');
  rg.addColorStop(1,'rgba(120,30,20,0.10)');
  ctx.fillStyle=rg; ctx.fillRect(0,470,1024,42);
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
// 白天天空纹理（阴天白昼：淡灰蓝→浅灰，底部地平线亮）
function makeDaySkyTexture(){
  const c=makeCanvas(1024,512), ctx=c.getContext('2d',{willReadFrequently:true});
  const g=ctx.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#8fa8c8');
  g.addColorStop(0.5,'#a8bcd2');
  g.addColorStop(0.8,'#c2cdd6');
  g.addColorStop(1,'#d4d4d4');
  ctx.fillStyle=g; ctx.fillRect(0,0,1024,512);
  // 极淡云层（灰白条带）
  for(let i=0;i<22;i++){
    ctx.fillStyle=`rgba(240,244,248,${rand(0.05,0.16)})`;
    const y=rand(40,470), h=rand(6,20);
    ctx.fillRect(0,y,1024,h);
  }
  // 细微云隙
  for(let i=0;i<30;i++){
    ctx.fillStyle=`rgba(220,228,236,${rand(0.03,0.1)})`;
    ctx.fillRect(rand(0,1024),rand(30,480),rand(120,420),rand(4,12));
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
// 月亮纹理（冷白基底 + 环形山凹陷 + 暗色月海）
function makeMoonTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#d6d6da'; ctx.fillRect(0,0,256,256);
  // 基底明暗噪点
  for(let i=0;i<900;i++){
    ctx.fillStyle=`rgba(${rand(180,225)},${rand(180,225)},${rand(185,228)},${rand(0.05,0.3)})`;
    ctx.fillRect(rand(0,256),rand(0,256),rand(1,3),rand(1,3));
  }
  // 月海（大块暗色斑）
  for(const [x,y,r] of [[70,90,42],[180,120,52],[110,190,38],[210,210,30],[50,200,28],[140,60,30]]){
    const gg=ctx.createRadialGradient(x,y,2,x,y,r);
    gg.addColorStop(0,`rgba(${rand(105,120)},${rand(105,120)},${rand(112,126)},0.5)`);
    gg.addColorStop(1,'rgba(180,180,185,0)');
    ctx.fillStyle=gg;
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }
  // 环形山（灰色圆形凹陷：外环亮 + 内陷暗）
  for(let i=0;i<46;i++){
    const x=rand(14,242), y=rand(14,242), r=rand(2.5,11);
    const ring=ctx.createRadialGradient(x-r*0.4,y-r*0.4,r*0.15,x,y,r);
    ring.addColorStop(0,'rgba(120,120,128,0.55)');
    ring.addColorStop(0.6,'rgba(150,150,156,0.35)');
    ring.addColorStop(1,'rgba(210,210,214,0.2)');
    ctx.fillStyle=ring;
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    ctx.fillStyle=`rgba(60,60,66,0.28)`;
    ctx.beginPath(); ctx.arc(x+r*0.12,y+r*0.12,r*0.55,0,7); ctx.fill();
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
// 焦黑烧焦地面纹理（边界外 5 units 过渡带）
function makeCharredTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#0d0d0e'; ctx.fillRect(0,0,256,256);
  // 焦黑渐变噪点 + 裂纹
  for(let l=0;l<3;l++){
    const img=ctx.getImageData(0,0,256,256), d=img.data;
    for(let i=0;i<d.length;i+=4){
      const n=(Math.random()-0.5)*(18+l*5);
      d[i]=clamp(d[i]+n,0,255); d[i+1]=clamp(d[i+1]+n*0.9,0,255); d[i+2]=clamp(d[i+2]+n*0.8,0,255);
    }
    ctx.putImageData(img,0,0);
  }
  // 灰烬/余烬斑点
  for(let i=0;i<180;i++){
    ctx.fillStyle=`rgba(${rand(90,150)},${rand(70,110)},${rand(50,80)},${rand(0.08,0.4)})`;
    ctx.fillRect(rand(0,256),rand(0,256),rand(2,7),rand(2,6));
  }
  for(let i=0;i<40;i++){
    ctx.fillStyle=`rgba(${rand(200,255)},${rand(60,90)},${rand(30,60)},${rand(0.15,0.5)})`;
    ctx.fillRect(rand(0,256),rand(0,256),rand(1,3),rand(1,3));
  }
  // 龟裂黑纹
  ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=1.2;
  for(let i=0;i<16;i++){
    ctx.beginPath();
    let x=rand(0,256), y=rand(0,256);
    ctx.moveTo(x,y);
    for(let j=0;j<8;j++){
      x+=rand(-14,14); y+=rand(-10,10);
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
// 环形焦土纹理：中心透明（露出 CS 沙地）、四周边缘焦黑渐变（边界视觉引导）
function makeCharredRingTexture(){
  const c=makeCanvas(256,256), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,256,256);
  // 中心透明区（半径 0.78）→ 边缘焦黑（半径 0.78~1.0），模拟 ±50 内清晰 / 外焦黑
  const center=0.74, edge=0.5;
  for(let y=0;y<256;y++){
    for(let x=0;x<256;x++){
      const dx=(x-128)/128, dy=(y-128)/128;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d>center){
        const t=clamp((d-center)/edge,0,1); // 0=内缘 1=外缘
        // 焦黑基底（越靠边越黑）
        let r=40+t*10, g=36+t*8, b=30+t*6;
        // 加噪
        r+=(Math.random()-0.5)*14; g+=(Math.random()-0.5)*12; b+=(Math.random()-0.5)*10;
        r=clamp(r,0,255); g=clamp(g,0,255); b=clamp(b,0,255);
        const a=t*t*0.92; // 透明度从内缘淡出到外缘实
        ctx.fillStyle=`rgba(${r|0},${g|0},${b|0},${a})`;
        ctx.fillRect(x,y,1,1);
      }
    }
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
// 辐射警告标牌（黄色三角形 + 黑色三叶草辐射符号）
function makeRadiationSignTexture(){
  const c=makeCanvas(128,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,128,128);
  // 黄色三角形（边框）
  ctx.fillStyle='#ffd23f';
  ctx.strokeStyle='#3a2a00'; ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(64,10); ctx.lineTo(118,112); ctx.lineTo(10,112);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 黑色辐射三叶草（中心圆 + 三叶片 + 小圆点）
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.arc(64,74,7,0,7); ctx.fill();
  for(let i=0;i<3;i++){
    const a=-Math.PI/2 + i*Math.PI*2/3;
    ctx.save();
    ctx.translate(64,74); ctx.rotate(a);
    ctx.beginPath();
    ctx.arc(0,-15,8,-0.9,0.9);
    ctx.arc(0,-15,3.2,0,7);
    ctx.fill();
    ctx.restore();
  }
  for(let i=0;i<3;i++){
    const a=-Math.PI/2 + i*Math.PI*2/3;
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.arc(64+Math.cos(a)*24,74+Math.sin(a)*24,4,0,7);
    ctx.fill();
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}
// 带刺铁丝网（透明平面：横丝 + 竖刺）
function makeBarbedWireTexture(){
  const c=makeCanvas(256,128), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,256,128);
  ctx.strokeStyle='rgba(120,120,125,0.9)'; ctx.lineWidth=2;
  for(const y of [22,48,74,100]){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke();
    // 刺（斜叉）
    ctx.strokeStyle='rgba(150,150,155,0.85)'; ctx.lineWidth=1.6;
    for(let x=8;x<256;x+=16){
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-5,y-7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+5,y-7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y-8); ctx.stroke();
    }
    ctx.strokeStyle='rgba(120,120,125,0.9)';
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}

/* ============================================================
   音频系统（Web Audio API 全合成）
============================================================ */
class AudioSystem{
  constructor(){
    this.ctx=null; this.master=null; this.started=false;
    this.listenPos=new THREE.Vector3(); this.listenFwd=new THREE.Vector3(0,0,-1);
    this.ambientTimer=rand(12,20); this.crowGain=null;
    this._panX=0; this._panY=0; this._panZ=0;
  }
  init(){
    if(this.ctx) return;
    const AC=window.AudioContext||window.webkitAudioContext;
    this.ctx=new AC();
    this.master=this.ctx.createGain(); this.master.gain.value=0.7;
    this.master.connect(this.ctx.destination);
    this._startAmbient();
    this._startBoundaryHum();
    this._scheduleAmbientEvents();
    this.started=true;
  }
  // 新增功能：边界辐射低频嗡鸣（40Hz 正弦，极弱；靠近边界音量增大）
  _startBoundaryHum(){
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(); o.type='sine'; o.frequency.value=40;
    const g=this.ctx.createGain(); g.gain.value=0;
    // 缓慢的 LFO 让嗡鸣微微起伏（警告感）
    const lfo=this.ctx.createOscillator(); lfo.frequency.value=0.5;
    const lfoG=this.ctx.createGain(); lfoG.gain.value=0.5;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    o.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this._boundaryHum={g};
  }
  // 每帧调用：v 0~1（0=远离边界，1=贴边），音量微弱放大
  setBoundaryHum(v){
    if(!this.ctx||!this._boundaryHum) return;
    const target=v>0.001?0.035+0.05*v:0;
    this._boundaryHum.g.gain.setTargetAtTime(target,this.ctx.currentTime,0.25);
  }
  resume(){ if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); }
  // 新增功能：Boss 警报音效（空袭警报，方波 440?880Hz 扫频 3 秒，与登场文字同步）
  bossAlarm(){
    if(!this.ctx) return;
    const now=this.ctx.currentTime;
    const o=this.ctx.createOscillator(); o.type='square';
    o.frequency.setValueAtTime(440,now);
    for(let i=0;i<6;i++) o.frequency.linearRampToValueAtTime(i%2?440:880,now+(i+1)*0.5);
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(0.4,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+3.0);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now+3.1);
    this._playTone(55,3,{type:'sine',toFreq:45,vol:0.2}); // 低频脉冲增强压迫感
  }
  // 新增功能：僵尸断腿音效（短促"咔嚓"：高频噪声脉冲 + 高频方波点击）
  boneBreak(){
    this._playNoise(0.08,{type:'white',filterType:'highpass',fromFreq:2800,toFreq:900,vol:0.5});
    this._playTone(2400,0.05,{type:'square',toFreq:1200,vol:0.18});
  }
  _noiseBuffer(dur,type='white'){
    const len=Math.max(1,Math.floor(this.ctx.sampleRate*dur));
    const buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=buf.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for(let i=0;i<len;i++){
      const w=Math.random()*2-1;
      if(type==='pink'){
        b0=0.997*b0+0.029591*w;
        b1=0.985*b1+0.032534*w;
        b2=0.95*b2+0.048056*w;
        d[i]=(b0+b1+b2+w*0.05)*2.2;
      }else d[i]=w;
    }
    return buf;
  }
  _playNoise(dur,opts={}){
    if(!this.ctx) return;
    const src=this.ctx.createBufferSource();
    src.buffer=this._noiseBuffer(dur,opts.type||'white');
    const f=this.ctx.createBiquadFilter();
    f.type=opts.filterType||'lowpass';
    f.frequency.setValueAtTime(opts.fromFreq||1000,this.ctx.currentTime);
    if(opts.toFreq) f.frequency.exponentialRampToValueAtTime(opts.toFreq,this.ctx.currentTime+dur);
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(opts.vol||0.2,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
    src.connect(f); f.connect(g);
    if(opts.dest) g.connect(opts.dest); else g.connect(this.master);
    src.start(); src.stop(this.ctx.currentTime+dur+0.02);
  }
  _playTone(freq,dur,opts={}){
    if(!this.ctx) return;
    const o=this.ctx.createOscillator();
    o.type=opts.type||'sine';
    o.frequency.setValueAtTime(freq,this.ctx.currentTime);
    if(opts.toFreq) o.frequency.exponentialRampToValueAtTime(opts.toFreq,this.ctx.currentTime+dur);
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(opts.vol||0.2,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur);
    o.connect(g);
    if(opts.dest) g.connect(opts.dest); else g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime+dur+0.02);
  }
  // ---- 枪声：白噪声短脉冲 + 快速衰减
  gunshot(){
    this._playNoise(0.08,{fromFreq:3200,toFreq:180,vol:0.5,filterType:'lowpass'});
    this._playTone(180,0.09,{type:'square',toFreq:60,vol:0.18});
  }
  // 新增功能：步枪枪声（更厚重：白噪声 + 低频轰鸣）
  // AK12枪声：低沉厚实为主，冲击感强
  rifleShot(){
    // 主导"砰"——低频爆发（低通噪声+超低频正弦，厚重沉闷）
    this._playNoise(0.09,{fromFreq:2000,toFreq:100,vol:1.0,filterType:'lowpass'});
    this._playTone(80,0.13,{type:'sine',toFreq:25,vol:0.7});
    this._playTone(110,0.10,{type:'square',toFreq:40,vol:0.45});
    this._playTone(160,0.08,{type:'triangle',toFreq:50,vol:0.35});
    // 高频点缀——"啪"声减弱为衬托
    this._playNoise(0.03,{fromFreq:5000,toFreq:3000,vol:0.4,filterType:'highpass'});
    // 金属回响——减弱
    setTimeout(()=>{
      if(!this.ctx) return;
      this._playNoise(0.04,{fromFreq:3500,toFreq:1500,vol:0.15,filterType:'bandpass'});
    },25);
  }
  // 新增功能：狙击枪声（CS1.6 AWP 风格：猛烈爆裂 + 低频厚重轰鸣，干而重）
  sniperShot(){
    // 主爆裂：白噪声猛脉冲（短促、响亮）
    this._playNoise(0.07,{fromFreq:4200,toFreq:150,vol:0.95,filterType:'lowpass'});
    // 高频瞬态脆裂（枪口破空）
    this._playNoise(0.025,{fromFreq:7000,toFreq:2200,vol:0.35,filterType:'highpass'});
    // 低频厚重轰鸣（AWP 标志性闷响：方波+正弦叠加）
    this._playTone(72,0.2,{type:'square',toFreq:34,vol:0.5});
    this._playTone(48,0.32,{type:'sine',toFreq:26,vol:0.38});
  }
  // 新增功能：狙击拉栓（CS1.6 AWP 上膛：拉回金属刮擦 + 复位金属撞击，两段式）
  sniperBolt(){
    // 第一段：拉机柄拉回（金属刮擦下滑）
    this._playNoise(0.13,{fromFreq:2400,toFreq:550,vol:0.26,filterType:'bandpass'});
    this._playTone(1500,0.11,{type:'sawtooth',toFreq:680,vol:0.1});
    // 第二段：推回上膛（清脆金属碰撞，延迟 0.16s）
    setTimeout(()=>{
      if(!this.ctx) return;
      this._playNoise(0.06,{fromFreq:3800,toFreq:900,vol:0.32,filterType:'bandpass'});
      this._playTone(1900,0.06,{type:'square',toFreq:800,vol:0.15});
    },160);
  }
  // ---- 换弹（CS1.6 风格：弹匣拔出金属声 / 插入碰撞 / 上膛复位）----
  reloadStart(rifle){
    // 换弹起始：手掌抓握轻摩擦
    this._playNoise(0.08,{fromFreq:900,toFreq:300,vol:0.1,filterType:'lowpass'});
  }
  reloadMagOut(rifle){
    // 弹匣拔出：金属刮擦 + 咔哒
    this._playNoise(0.07,{fromFreq:3000,toFreq:600,vol:rifle?0.2:0.16,filterType:'bandpass'});
    this._playTone(rifle?1250:1500,0.05,{type:'square',toFreq:500,vol:0.12});
  }
  reloadMagIn(rifle){
    // 新弹匣插入：清脆金属碰撞“咔哒”
    this._playNoise(0.05,{fromFreq:4500,toFreq:1000,vol:rifle?0.28:0.22,filterType:'bandpass'});
    this._playTone(rifle?1700:2100,0.05,{type:'square',toFreq:700,vol:0.16});
    this._playTone(rifle?2400:2800,0.04,{type:'sine',vol:0.08});
  }
  reloadRack(rifle){
    // 上膛：套筒/拉机柄复位“咔嚓”
    this._playNoise(0.08,{fromFreq:3000,toFreq:500,vol:0.24,filterType:'bandpass'});
    this._playTone(rifle?700:900,0.06,{type:'square',toFreq:300,vol:0.14});
  }
  // 新增功能：武器检视——轻微金属摩擦声（短促高频正弦，0.2s）
  inspect(){
    this._playNoise(0.2,{fromFreq:3800,toFreq:1400,vol:0.12,filterType:'bandpass'});
    this._playTone(2200,0.2,{type:'triangle',toFreq:900,vol:0.05});
  }
  // 新增功能：步枪卡壳——短促“咔哒”空响（高频快速衰减）
  jamClick(){
    this._playNoise(0.06,{fromFreq:2600,toFreq:700,vol:0.22,filterType:'bandpass'});
    this._playTone(1200,0.07,{type:'square',toFreq:500,vol:0.12});
  }
  // 新增功能：步枪排障——金属刮擦声（中频正弦快速衰减）
  jamClear(){
    this._playNoise(0.5,{fromFreq:1800,toFreq:500,vol:0.14,filterType:'bandpass'});
    this._playTone(700,0.45,{type:'sawtooth',toFreq:320,vol:0.08});
    this._playTone(1400,0.15,{type:'triangle',toFreq:600,vol:0.06});
  }
  // ---- 弹壳落地
  shellDing(){ this._playTone(2000,0.06,{type:'sine',toFreq:1400,vol:0.1}); }
  // 新增功能：狙击弹壳落地（低频沉闷金属撞击）
  shellDingHeavy(){ this._playTone(600,0.12,{type:'sine',toFreq:350,vol:0.14}); this._playNoise(0.08,{fromFreq:1400,toFreq:400,vol:0.08,filterType:'lowpass'}); }
  // 新增功能：散弹枪枪声（泵动式：猛烈短促爆裂 + 低沉轰鸣，比步枪更重）
  shotgunShot(){
    // 低沉拉长"砰"——低频爆发为主
    this._playNoise(0.12,{fromFreq:2500,toFreq:80,vol:1.0,filterType:'lowpass'});
    this._playTone(50,0.28,{type:'sine',toFreq:20,vol:0.65});
    this._playTone(80,0.22,{type:'square',toFreq:35,vol:0.5});
    this._playTone(120,0.16,{type:'triangle',toFreq:45,vol:0.35});
  }
  // 散弹枪泵动上膛（护木滑动刮擦 + 清脆金属入膛"咔嚓"）
  shotgunRack(){
    // 护木前推金属刮擦
    this._playNoise(0.12,{fromFreq:2200,toFreq:400,vol:0.25,filterType:'bandpass'});
    this._playTone(800,0.10,{type:'sawtooth',toFreq:300,vol:0.08});
    // 清脆金属入膛撞击"咔嚓"——延迟0.14s
    setTimeout(()=>{
      if(!this.ctx) return;
      this._playNoise(0.04,{fromFreq:5000,toFreq:1200,vol:0.35,filterType:'bandpass'});
      this._playTone(2500,0.04,{type:'square',toFreq:900,vol:0.18});
      this._playTone(3200,0.03,{type:'sine',toFreq:600,vol:0.12});
    },140);
  }
  // 新增功能：红色塑料弹壳落地（清脆塑料碰撞）
  shotgunShellDing(){
    this._playTone(900,0.07,{type:'triangle',toFreq:500,vol:0.13});
    this._playNoise(0.05,{fromFreq:2200,toFreq:900,vol:0.1,filterType:'bandpass'});
  }
  // 新增功能：雷明顿1100半自动枪声（低沉拉长"砰"，比M3略轻快）
  remingtonShot(){
    this._playNoise(0.10,{fromFreq:2600,toFreq:100,vol:0.95,filterType:'lowpass'});
    this._playTone(55,0.24,{type:'sine',toFreq:22,vol:0.58});
    this._playTone(85,0.18,{type:'square',toFreq:38,vol:0.42});
    this._playTone(130,0.13,{type:'triangle',toFreq:50,vol:0.28});
  }
  thompsonShot(){
    this._playNoise(0.05,{fromFreq:3800,toFreq:180,vol:0.6,filterType:'lowpass'});
    this._playTone(160,0.07,{type:'square',toFreq:70,vol:0.2});
  }
  stenShot(){
    // 清脆的"哒哒哒"声（800~1500 Hz 白噪声+正弦波）
    this._playNoise(0.04,{fromFreq:1500,toFreq:180,vol:0.55,filterType:'lowpass'});
    this._playTone(1200,0.05,{type:'sine',toFreq:400,vol:0.25});
    // 金属撞击"咔"声（模拟枪机运动）
    this._playNoise(0.015,{fromFreq:3200,toFreq:1800,vol:0.18,filterType:'bandpass'});
    this._playTone(2800,0.012,{type:'square',toFreq:1600,vol:0.08});
  }
  // 检视结束复位音
  inspectEnd(){
    this._playNoise(0.12,{fromFreq:1400,toFreq:500,vol:0.1,filterType:'bandpass'});
  }
  // 新增功能：检视打断（极短金属抖动，0.05s）
  inspectInterrupt(){
    this._playNoise(0.05,{fromFreq:2200,toFreq:700,vol:0.12,filterType:'bandpass'});
    this._playTone(900,0.04,{type:'square',toFreq:400,vol:0.06});
  }
  // 新增功能：搜刮弹药箱（木箱开启 + 弹药碰撞）
  loot(){
    this._playNoise(0.12,{fromFreq:500,toFreq:1200,vol:0.16,filterType:'bandpass'});
    this._playTone(300,0.16,{type:'triangle',toFreq:180,vol:0.12});
    setTimeout(()=>{ if(!this.ctx) return; this._playNoise(0.08,{fromFreq:2400,toFreq:900,vol:0.14,filterType:'bandpass'}); this._playTone(1500,0.06,{type:'square',toFreq:700,vol:0.07}); },120);
  }
  // 新增功能：后备弹药耗尽（空仓咔哒，无法换弹）
  emptyClick(){
    this._playNoise(0.05,{fromFreq:2000,toFreq:600,vol:0.18,filterType:'bandpass'});
    this._playTone(800,0.05,{type:'square',toFreq:350,vol:0.1});
  }
  // 新增功能：耐力耗尽（急促喘息）
  staminaEmpty(){
    this._playNoise(0.22,{fromFreq:700,toFreq:300,vol:0.1,filterType:'bandpass'});
    this._playTone(250,0.18,{type:'sawtooth',toFreq:140,vol:0.05});
  }
  // 新增功能：房屋内子弹命中墙体的回响（极短延迟）
  impactEcho(){
    this._playNoise(0.06,{fromFreq:900,toFreq:200,vol:0.16,filterType:'lowpass'});
    const delay=0.06;
    setTimeout(()=>{ if(this.ctx) this._playNoise(0.04,{fromFreq:650,toFreq:160,vol:0.07,filterType:'lowpass'}); },delay*1000);
  }
  // ---- 挥刀破空：白噪声 + 上扫
  swing(){ this._playNoise(0.1,{fromFreq:700,toFreq:2800,vol:0.22,filterType:'bandpass'}); }
  meatHit(){ this._playTone(150,0.18,{type:'sine',toFreq:50,vol:0.4}); this._playNoise(0.09,{fromFreq:900,toFreq:200,vol:0.2}); }
  headshotHit(){ this.meatHit(); this._playNoise(0.12,{fromFreq:1500,toFreq:250,vol:0.25,filterType:'bandpass'}); }
  // ---- 枪托
  stockWhiff(){ this._playNoise(0.06,{fromFreq:600,toFreq:1400,vol:0.14,filterType:'bandpass'}); }
  stockHit(){ this._playTone(150,0.14,{type:'sine',toFreq:45,vol:0.5}); this._playNoise(0.08,{fromFreq:500,toFreq:120,vol:0.22}); }
  // ---- 僵尸
  growl(pos){
    const d=this._mkPanner(pos);
    if(!d) return;
    const o=this.ctx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(rand(55,85),this.ctx.currentTime);
    o.frequency.linearRampToValueAtTime(rand(70,120),this.ctx.currentTime+rand(0.5,1.2));
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=320;
    const g=this.ctx.createGain();
    g.gain.setValueAtTime(0.0001,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(rand(0.15,0.3),this.ctx.currentTime+0.12);
    g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+rand(0.7,1.4));
    o.connect(f); f.connect(g); g.connect(d.gain);
    o.start(); o.stop(this.ctx.currentTime+1.6);
    this._bindPanner(d);
  }
  // ---- 僵尸呼吸（3D 定位，持续）
  startBreath(z){
    if(z._breath) return;
    const d=this._mkPanner(z.pos);
    if(!d) return;
    const src=this.ctx.createBufferSource();
    src.buffer=this._noiseBuffer(2,'pink'); src.loop=true;
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=280; f.Q.value=6;
    const lfo=this.ctx.createOscillator(); lfo.frequency.value=rand(0.6,1.0);
    const lfoG=this.ctx.createGain(); lfoG.gain.value=0.12;
    const g=this.ctx.createGain(); g.gain.value=0.12;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(d.gain);
    src.start(); lfo.start();
    z._breath={panner:d,dest:d.gain,src:src,lfo:lfo};
    this._bindPanner(d);
  }
  stopBreath(z){
    if(z._breath){
      try{ z._breath.src.stop(); z._breath.lfo.stop(); }catch(e){}
      z._breath.dest.disconnect();
      z._breath=null;
    }
  }
  _mkPanner(pos){
    if(!this.ctx) return null;
    const p=this.ctx.createPanner();
    p.panningModel='HRTF'; p.distanceModel='linear';
    p.refDistance=2; p.maxDistance=40; p.rolloffFactor=0.7;
    const g=this.ctx.createGain(); g.gain.value=1;
    p.connect(g); g.connect(this.master);
    if(pos) p.positionX.value=pos.x, p.positionY.value=pos.y, p.positionZ.value=pos.z;
    return {p:p,gain:g};
  }
  _bindPanner(d){
    if(!d) return;
    if(Number.isFinite(this._panX)) d.p.positionX.value=this._panX;
    if(Number.isFinite(this._panY)) d.p.positionY.value=this._panY;
    if(Number.isFinite(this._panZ)) d.p.positionZ.value=this._panZ;
  }
  // 供每帧更新
  updateListener(camera){
    if(!this.ctx) return;
    const p=camera.position, q=camera.quaternion;
    const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(q);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(q);
    this._panX=p.x; this._panY=p.y; this._panZ=p.z;
    if(this.ctx.listener){
      if(this.ctx.listener.positionX){ 
        this.ctx.listener.positionX.value=p.x; this.ctx.listener.positionY.value=p.y; this.ctx.listener.positionZ.value=p.z;
        this.ctx.listener.forwardX.value=fwd.x; this.ctx.listener.forwardY.value=fwd.y; this.ctx.listener.forwardZ.value=fwd.z;
        this.ctx.listener.upX.value=up.x; this.ctx.listener.upY.value=up.y; this.ctx.listener.upZ.value=up.z;
      } else {
        this.ctx.listener.setPosition(p.x,p.y,p.z);
        this.ctx.listener.setOrientation(fwd.x,fwd.y,fwd.z,up.x,up.y,up.z);
      }
    }
  }
  // ---- 环境底噪：低频隆隆声 + 粉色噪音(风)
  _startAmbient(){
    const rumble=this.ctx.createOscillator(); rumble.type='sine'; rumble.frequency.value=58;
    const lfo=this.ctx.createOscillator(); lfo.frequency.value=0.11;
    const lfoG=this.ctx.createGain(); lfoG.gain.value=12;
    lfo.connect(lfoG); lfoG.connect(rumble.frequency);
    const rg=this.ctx.createGain(); rg.gain.value=0.05;
    rumble.connect(rg); rg.connect(this.master);
    rumble.start(); lfo.start();

    const wind=this.ctx.createBufferSource();
    wind.buffer=this._noiseBuffer(4,'pink'); wind.loop=true;
    const wf=this.ctx.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value=420;
    const wg=this.ctx.createGain(); wg.gain.value=0.05;
    const wlfo=this.ctx.createOscillator(); wlfo.frequency.value=0.07;
    const wlfoG=this.ctx.createGain(); wlfoG.gain.value=0.025;
    wlfo.connect(wlfoG); wlfoG.connect(wg.gain);
    wind.connect(wf); wf.connect(wg); wg.connect(this.master);
    wind.start(); wlfo.start();
    this._wind=wind; this._windGain=wg;
  }
  _scheduleAmbientEvents(){
    if(!this.ctx) return;
    const delay=rand(15,30)*1000;
    setTimeout(()=>{
      if(!this.ctx) return;
      if(Math.random()<0.5) this._metalClang(); else this._crowCall();
      this._scheduleAmbientEvents();
    },delay);
  }
  _metalClang(){
    this._playTone(rand(600,1000),0.4,{type:'triangle',toFreq:rand(300,500),vol:0.05});
    this._playTone(rand(900,1400),0.3,{type:'sine',toFreq:600,vol:0.03});
  }
  _crowCall(){
    const src=this.ctx.createBufferSource();
    src.buffer=this._noiseBuffer(0.6,'white');
    const f=this.ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1400; f.Q.value=12;
    const g=this.ctx.createGain();
    const t=this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.05,t+0.03);
    g.gain.setValueAtTime(0.05,t+0.07);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.1);
    g.gain.setValueAtTime(0.0001,t+0.18);
    g.gain.exponentialRampToValueAtTime(0.05,t+0.21);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.4);
    const vfo=this.ctx.createOscillator(); vfo.frequency.value=2.5;
    const vfoG=this.ctx.createGain(); vfoG.gain.value=500;
    vfo.connect(vfoG); vfoG.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); vfo.start(); src.stop(t+0.5);
  }
}

/* ============================================================
   精灵粒子池（血雾/粉尘/火花/闪光/刀光）
============================================================ */
class SpritePool{
  constructor(scene,textures,max=240){
    this.scene=scene; this.max=max; this.parts=[];
    this.textures=textures;
  }
  emit(o){
    if(this.parts.length>=this.max){ const p=this.parts.shift(); this.scene.remove(p.s); p.s.material.dispose(); }
    const tex=this.textures[o.tex||'glow'];
    const mat=new THREE.SpriteMaterial({
      map:tex, color:o.color||0xffffff, transparent:true,
      opacity:o.opacity!==undefined?o.opacity:1,
      blending:(o.add!==undefined&&o.add)?THREE.AdditiveBlending:THREE.NormalBlending,
      depthWrite:false
    });
    const s=new THREE.Sprite(mat);
    s.position.copy(o.pos);
    const sz=o.size||0.1;
    s.scale.set(sz,sz,1);
    if(o.rot!==undefined) mat.rotation=o.rot;
    s.visible=true;
    this.scene.add(s);
    this.parts.push({
      s:s, vel:o.vel||new THREE.Vector3(),
      life:0, maxLife:o.life||0.5,
      gravity:o.gravity||0, shrink:o.shrink||0,
      baseSize:sz, color:o.color||0xffffff,
      add:o.add!==undefined?o.add:false,
      spin:o.spin||0,
      base:o.opacity!==undefined?o.opacity:1
    });
  }
  update(dt){
    for(let i=this.parts.length-1;i>=0;i--){
      const p=this.parts[i];
      p.life+=dt;
      const r=1-p.life/p.maxLife;
      if(p.life>=p.maxLife||r<=0){ this.scene.remove(p.s); p.s.material.dispose(); this.parts.splice(i,1); continue; }
      p.vel.y-=p.gravity*dt;
      p.s.position.addScaledVector(p.vel,dt);
      if(p.spin && p.s.material.rotation!==undefined) p.s.material.rotation+=p.spin*dt;
      const sc=Math.max(0.001,p.baseSize*(1-p.shrink*r));
      p.s.scale.set(sc,sc,1);
      p.s.material.opacity=Math.max(0,r*p.base);
    }
  }
  clear(){ while(this.parts.length){ const p=this.parts.pop(); this.scene.remove(p.s); p.s.material.dispose(); } }
}
// 修正 opacity 记录基数
function emitPart(pool,o){
  o._base=o.opacity!==undefined?o.opacity:1;
  pool.emit(o);
}

/* ============================================================
   贴花系统（弹着点黑色贴花，3 秒消失）
============================================================ */
class DecalSystem{
  constructor(scene,max=60){
    this.scene=scene; this.items=[];
    this.geo=new THREE.CircleGeometry(0.5,14);
    this.mat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.65,depthWrite:false});
  }
  add(pos,normal,size){
    if(this.items.length>=60){ const o=this.items.shift(); this.scene.remove(o.m); }
    const m=new THREE.Mesh(this.geo,this.mat.clone());
    m.position.copy(pos).addScaledVector(normal,0.02);
    m.lookAt(pos.clone().add(normal));
    m.scale.set(size,size,1);
    this.scene.add(m);
    this.items.push({m:m,life:0,base:0.65});
  }
  update(dt){
    for(let i=this.items.length-1;i>=0;i--){
      const o=this.items[i]; o.life+=dt;
      const r=1-o.life/3;
      if(r<=0){ this.scene.remove(o.m); o.m.material.dispose(); this.items.splice(i,1); continue; }
      o.m.material.opacity=o.base*r;
    }
  }
  clear(){ while(this.items.length){ const o=this.items.pop(); this.scene.remove(o.m); o.m.material.dispose(); } }
}

/* ============================================================
   环境场景构建
============================================================ */
function buildEnvironment(game){
  const scene=game.scene;
  // ---- 外挂 3D 地图（异步加载替换程序化地图，2026-08-11）----
  buildMapFromGLB(game);
  // ---- 环境贴图（PMREMGenerator 从简单天空烘焙）
  {
    const c=makeCanvas(512,256), ctx=c.getContext('2d',{willReadFrequently:true});
    const g=ctx.createLinearGradient(0,0,0,256);
    g.addColorStop(0,'#5f6468');
    g.addColorStop(0.45,'#7d8588');
    g.addColorStop(0.55,'#6a6e70');
    g.addColorStop(1,'#3d4143');
    ctx.fillStyle=g; ctx.fillRect(0,0,512,256);
    for(let i=0;i<120;i++){
      ctx.fillStyle=`rgba(255,255,255,${rand(0.02,0.06)})`;
      ctx.fillRect(Math.random()*512,Math.random()*256,rand(2,8),rand(2,4));
    }
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(game.renderer);
    const envTex=pmrem.fromEquirectangular(tex).texture;
    scene.environment=envTex;
    pmrem.dispose();
    game._envTex=envTex;
  }

  // ---- 弹药箱（塔科夫硬核：F 搜刮补给后备弹药）----
  // 随机分布（10 个）在地图加载后执行（placeAmmoCrates），需地图碰撞体判定“不在建筑内/不越界”

  // ---- 地面翻滚薄雾（Y<0.5 半透明平面，透明度正弦波动；尺寸随地图等比放大）----
  const mistGeo=new THREE.PlaneGeometry(MAP_TARGET_WIDTH*1.04,MAP_TARGET_WIDTH*0.52);
  const mistMat=new THREE.MeshBasicMaterial({
    map:game.tex.mist, color:0x3d2b1f, transparent:true,
    opacity:0.2, depthWrite:false, fog:true
  });
  const mist=new THREE.Mesh(mistGeo,mistMat);
  mist.rotation.x=-Math.PI/2; mist.position.y=0.32;
  scene.add(mist);
  game.mistMat=mistMat;
  // 第二层薄雾（略微错开，覆盖全图）
  const mist2Mat=mistMat.clone();
  const mist2=new THREE.Mesh(new THREE.PlaneGeometry(MAP_TARGET_WIDTH*1.04,MAP_TARGET_WIDTH*0.52),mist2Mat);
  mist2.rotation.x=-Math.PI/2; mist2.position.y=0.42;
  scene.add(mist2); game.mistMat2=mist2Mat;

  // ---- 漂浮环境粒子（500~800，0~3 units）
  game.dust=buildAmbientDust(scene,1200); // 画质升级：灰尘粒子 500→1200

  // ---- 玩家头灯：高亮战术手电筒（绑定相机 SpotLight，暖白、90°宽锥、80单位远射）----
  const headlight=new THREE.SpotLight(0xfff4e6,140,80,Math.PI/2,0.55,1.5);
  headlight.position.set(0,1.5,0);
  headlight.castShadow=true; headlight.shadow.mapSize.set(512,512);
  headlight.shadow.bias=-0.0004;
  game.camera.add(headlight);
  game.headlight=headlight;
  // 辅助泛光补光（PointLight，淡蓝，半径15，消除聚光边缘绝对黑暗）
  const fillLight=new THREE.PointLight(0xaaccff,0.8,15,1.5);
  fillLight.position.set(0,1.5,0);
  game.camera.add(fillLight);
  game.headlightFill=fillLight;
  // 手电筒光晕 Sprite（淡黄，尺寸2，绑定聚光位置）
  const torchGlowTex=makeGlowTexture();
  const torchGlowMat=new THREE.SpriteMaterial({
    map:torchGlowTex, color:0xffe9b0, transparent:true, opacity:0.5,
    blending:THREE.AdditiveBlending, depthWrite:false
  });
  const torchGlow=new THREE.Sprite(torchGlowMat);
  torchGlow.scale.set(2,2,1);
  torchGlow.position.set(0,1.5,-0.9);
  game.camera.add(torchGlow);
  game.headlightGlow=torchGlow;
  // 体积光雾锥
  const coneGeo=new THREE.ConeGeometry(1.6,3.4,32,1,true);
  const coneTex=makeGlowTexture();
  const coneMat=new THREE.MeshBasicMaterial({
    map:coneTex, color:0xfff4e6, transparent:true, opacity:0.06,
    blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide
  });
  const cone=new THREE.Mesh(coneGeo,coneMat);
  cone.position.set(0,1.5,-1.7); cone.rotation.x=Math.PI;
  game.camera.add(cone);
  game.camera.add(game._camHelper=new THREE.Group());
  game.scene.add(game.camera);

  // ---- 动态夜空系统（穹顶 + 星星 + 月亮 + 雾霭）----
  buildSky(game);
}

// ==================== 外挂 3D 地图（替换程序化地图，2026-08-11） ====================
// 加载 models/Fps+Map+1.glb 替换整个场景地图：
// - GLTFLoader 异步加载，所有纹理压缩至 256×256
// - 等比缩放宽度(X)=100，长度(Z)/高度(Y) 按比例自动适配；水平居中 + 主地面对齐 y=0
// - 三角形光栅化 → 0.5 units 占据网格 → 贴合实际几何的 AABB 碰撞体
//   （模型是 Blender 导出的合并网格：node 含 36 个巨型图元，逐 mesh 包围盒会变成
//     "巨型方块"封死整个区域，必须按三角形采样生成碰撞体）
// - 地图边缘围墙强制边界：边缘隐形碰撞体 + 玩家/僵尸移动循环硬钳制（applyMapBoundary）
function buildMapFromGLB(game){
  const loader=new GLTFLoader();
  loader.load(MAP_MODEL,(gltf)=>{
    const model=gltf.scene;
    // ---- 纹理压缩至 256×256（canvas 重采样；共享贴图只压一次）----
    const seen=new Set();
    model.traverse(c=>{
      if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; }
      if(c.material){
        const mats=Array.isArray(c.material)?c.material:[c.material];
        for(const mat of mats){
          for(const key of ['map','aoMap','roughnessMap','metalnessMap','normalMap','emissiveMap','alphaMap','bumpMap','displacementMap']){
            const tex=mat[key];
            if(tex&&tex.image&&!seen.has(tex)){
              seen.add(tex);
              if(tex.image.width>256||tex.image.height>256){
                const cv=document.createElement('canvas'); cv.width=cv.height=256;
                cv.getContext('2d').drawImage(tex.image,0,0,256,256);
                tex.image=cv; tex.needsUpdate=true;
              }
            }
          }
        }
      }
    });
    // ---- 等比缩放：宽度(X)=100，长度/高度按比例 ----
    const box=new THREE.Box3().setFromObject(model);
    const size=new THREE.Vector3(); box.getSize(size);
    const sf=MAP_TARGET_WIDTH/size.x;
    model.scale.setScalar(sf);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    box.getSize(size);
    const center=new THREE.Vector3(); box.getCenter(center);
    // 水平居中（Y 稍后按主地面高度对齐到 y=0）
    model.position.x-=center.x;
    model.position.z-=center.z;
    model.updateMatrixWorld(true);
    game.mapHalfW=size.x/2;   // = 50（目标宽度 100）
    game.mapHalfL=size.z/2;   // 长度按比例自动适配
    // ---- 三角形光栅化：生成碰撞体 + 求主地面高度 ----
    const rast=generateMapColliders(game,model);
    // ---- 主地面对齐到 y=0（玩家物理地面硬编码 y=0，须保证地图地板在 y=0）----
    model.position.y-=rast.floorY;
    model.updateMatrixWorld(true);
    game.colliders.push(...rast.colliders);
    // ---- 地图边缘隐形围墙（强制边界：即使墙体几何有缺口也绝对封堵）----
    const sealH=20;
    const addSeal=(cx,cz,hx,hz)=>{
      const c={min:new THREE.Vector3(cx-hx,0,cz-hz),max:new THREE.Vector3(cx+hx,sealH,cz+hz)};
      c.isBoundary=true;
      game.colliders.push(c);
      game.boundaryColliders.push(c);
    };
    // 长边分段（≤8 units），保证空间索引按中心可靠命中
    const segSeal=(cx,cz,hx,hz)=>{
      const SEG=8;
      if(hx>SEG){
        const n=Math.ceil(hx*2/SEG);
        for(let i=0;i<n;i++){
          const a=cx-hx+i*(hx*2/n), b=cx-hx+(i+1)*(hx*2/n);
          addSeal((a+b)/2,cz,(b-a)/2,hz);
        }
      } else if(hz>SEG){
        const n=Math.ceil(hz*2/SEG);
        for(let i=0;i<n;i++){
          const a=cz-hz+i*(hz*2/n), b=cz-hz+(i+1)*(hz*2/n);
          addSeal(cx,(a+b)/2,hx,(b-a)/2);
        }
      } else addSeal(cx,cz,hx,hz);
    };
    segSeal(0, game.mapHalfL, game.mapHalfW, 0.4);  // 北
    segSeal(0,-game.mapHalfL, game.mapHalfW, 0.4);  // 南
    segSeal(game.mapHalfW,0, 0.4, game.mapHalfL);   // 东
    segSeal(-game.mapHalfW,0, 0.4, game.mapHalfL);  // 西
    // ---- 加入场景 + 子弹/视线射线碰撞（envMeshes）----
    game.scene.add(model);
    game.mapModel=model;
    model.traverse(o=>{ if(o.isMesh) game.envMeshes.push(o); });
    // ---- 阴影范围覆盖全图（地图等比放大后按半宽/半长 + 光源偏移扩展）----
    for(const l of [game.sunLight,game.daySun]){
      if(!l) continue;
      const sc=Math.max(game.mapHalfW,game.mapHalfL)+Math.max(Math.abs(l.position.x),Math.abs(l.position.z))+20;
      l.shadow.camera.left=-sc; l.shadow.camera.right=sc;
      l.shadow.camera.top=sc; l.shadow.camera.bottom=-sc;
      l.shadow.camera.far=Math.max(200,sc*1.5);
      l.shadow.camera.updateProjectionMatrix();
    }
    // ---- 重建碰撞空间索引（纳入地图碰撞体）----
    game.buildColliderGrid();
    // ---- 玩家安全出生点：扫描可通行且离墙最远的点（强制在建筑外开阔处出生/复活，不在建筑内）----
    {
      let bx=0,bz=0,bd=-1;
      for(let x=-game.mapHalfW+10;x<=game.mapHalfW-10;x+=4){
        for(let z=-game.mapHalfL+10;z<=game.mapHalfL-10;z+=4){
          let blocked=false;
          for(const c of game.getNearbyColliders(x,z,2)){
            if(x+0.5>c.min.x&&x-0.5<c.max.x&&z+0.5>c.min.z&&z-0.5<c.max.z&&0<c.max.y&&1.8>c.min.y){ blocked=true; break; }
          }
          if(blocked) continue;
          const d=game.wallDistance(x,z);
          if(d>bd){ bd=d; bx=x; bz=z; }
        }
      }
      game.spawnPoint={x:bx,z:bz,wallDist:bd};
      // 若玩家已出生在原点（建筑内），立即移到安全点
      if(game.player&&Math.abs(game.player.pos.x)<1&&Math.abs(game.player.pos.z)<1){
        game.player.pos.set(bx,0,bz);
        // 玩家被传送到出生点后，把场上僵尸同步重刷到玩家周围（以玩家当前位置为中心）
        // 修复：僵尸在玩家位于原点时生成，玩家被传送后远离僵尸→全部超出感知范围→波次无法推进（2026-08-14）
        const zs=game.zombies&&game.zombies.zombies;
        if(zs){
          for(const z of zs){
            if(z.dead) continue;
            const np=game.zombies._randomSpawn();
            z.pos.copy(np);
            z.investigateTarget=null; z.state='idle';
          }
        }
      }
      console.log(`出生点 ${bx.toFixed(1)},${bz.toFixed(1)} 最近墙 ${bd.toFixed(1)}`);
    }
    // ---- 弹药箱随机分布（10 个：建筑外、不越界、相互间距≥40）----
    placeAmmoCrates(game);
    game.buildColliderGrid(); // 重建，纳入弹药箱碰撞体
    game.mapReady=true;
    console.log(`? 外挂地图加载成功 宽=${(game.mapHalfW*2).toFixed(1)} 长=${(game.mapHalfL*2).toFixed(1)} 碰撞体=${game.colliders.length} 边界=${game.boundaryColliders.length}`);
  },undefined,(err)=>{
    console.error('? 外挂地图加载失败:',err);
    fallbackMap(game);
  });
}

// 2D 三角形与单元格正方形是否相交（SAT 分离轴定理）
// 轴对齐薄墙的 XZ 投影退化为线段（零面积），点-三角形测试必漏，必须用相交测试
function triCellOverlap(ax,az,bx,bz,cx,cz,px0,pz0,px1,pz1){
  const tMinX=Math.min(ax,bx,cx), tMaxX=Math.max(ax,bx,cx);
  const tMinZ=Math.min(az,bz,cz), tMaxZ=Math.max(az,bz,cz);
  // AABB 轴（即单元格两条轴的 SAT）
  if(tMaxX<px0||tMinX>px1||tMaxZ<pz0||tMinZ>pz1) return false;
  // 三角形三条边的法线作为分离轴
  const edges=[[bx-ax,bz-az],[cx-bx,cz-bz],[ax-cx,az-cz]];
  const tx=[ax,bx,cx], tz=[az,bz,cz];
  for(let e=0;e<3;e++){
    const ex=edges[e][0], ez=edges[e][1];
    let tMin=Infinity,tMax=-Infinity;
    for(let i=0;i<3;i++){
      const p=tx[i]*(-ez)+tz[i]*ex;
      if(p<tMin)tMin=p; if(p>tMax)tMax=p;
    }
    let cMin=Infinity,cMax=-Infinity;
    const cvx=[px0,px1,px0,px1], cvz=[pz0,pz0,pz1,pz1];
    for(let i=0;i<4;i++){
      const p=cvx[i]*(-ez)+cvz[i]*ex;
      if(p<cMin)cMin=p; if(p>cMax)cMax=p;
    }
    if(tMax<cMin||cMax<tMin) return false;
  }
  return true;
}

// 三角形光栅化：把地图几何体按三角形采样到占据网格。
// - 墙面三角形（法线近水平 |ny|<0.8）标记实心 → 生成 AABB 碰撞体（贴合实际墙体/建筑）
// - 水平面（地面/屋顶）记录高度 → 求主地面高度（众数），用于把地图地板对齐到 y=0
// 返回 { colliders, boundaryColliders, floorY }
function generateMapColliders(game,model){
  const CELL=MAP_COLLIDER_CELL;
  const hw=game.mapHalfW, hl=game.mapHalfL;
  const nx=Math.ceil(hw*2/CELL), nz=Math.ceil(hl*2/CELL);
  const x0=-hw, z0=-hl;
  const solid=new Uint8Array(nx*nz);
  const minY=new Float32Array(nx*nz).fill(1e9);
  const maxY=new Float32Array(nx*nz).fill(-1e9);
  const floorH=new Float32Array(nx*nz).fill(-1e9);
  const meshes=[];
  model.traverse(o=>{ if(o.isMesh&&o.geometry&&o.geometry.attributes&&o.geometry.attributes.position) meshes.push(o); });
  model.updateMatrixWorld(true);
  for(const m of meshes){
    const geo=m.geometry;
    // 注：GLB 图元均为三角形（本版本 three 的 geometry.drawMode 实例上为 undefined，不做模式过滤）
    const pos=geo.attributes.position;
    const arr=pos.array;
    const idx=geo.index?geo.index.array:null;
    const me=m.matrixWorld.elements;
    const vc=pos.count;
    // 一次性世界变换
    const wx=new Float32Array(vc),wy=new Float32Array(vc),wz=new Float32Array(vc);
    for(let i=0;i<vc;i++){
      const x=arr[i*3],y=arr[i*3+1],z=arr[i*3+2];
      wx[i]=me[0]*x+me[4]*y+me[8]*z+me[12];
      wy[i]=me[1]*x+me[5]*y+me[9]*z+me[13];
      wz[i]=me[2]*x+me[6]*y+me[10]*z+me[14];
    }
    const ntri=idx?idx.length/3:Math.floor(vc/3);
    for(let t=0;t<ntri;t++){
      const i0=idx?idx[t*3]:t*3, i1=idx?idx[t*3+1]:t*3+1, i2=idx?idx[t*3+2]:t*3+2;
      const ax=wx[i0],ay=wy[i0],az=wz[i0], bx=wx[i1],by=wy[i1],bz=wz[i1], cx=wx[i2],cy=wy[i2],cz=wz[i2];
      const ux=bx-ax,uy=by-ay,uz=bz-az, vx=cx-ax,vy=cy-ay,vz=cz-az;
      const ncx=uy*vz-uz*vy, ncy=uz*vx-ux*vz, ncz=ux*vy-uy*vx;
      const nl=Math.sqrt(ncx*ncx+ncy*ncy+ncz*ncz);
      if(nl<1e-9) continue;
      const isWall=Math.abs(ncy)/nl<0.8; // 法线近水平=墙面；近垂直=地面/屋顶
      const minX=Math.min(ax,bx,cx), maxX=Math.max(ax,bx,cx);
      const minZ=Math.min(az,bz,cz), maxZ=Math.max(az,bz,cz);
      if(maxX<x0||minX>x0+hw*2||maxZ<z0||minZ>z0+hl*2) continue;
      const gi0=Math.max(0,Math.floor((minX-x0)/CELL));
      const gi1=Math.min(nx-1,Math.floor((maxX-x0)/CELL));
      const gj0=Math.max(0,Math.floor((minZ-z0)/CELL));
      const gj1=Math.min(nz-1,Math.floor((maxZ-z0)/CELL));
      const triMinY=Math.min(ay,by,cy), triMaxY=Math.max(ay,by,cy);
      for(let gj=gj0;gj<=gj1;gj++){
        const pz0=z0+gj*CELL, pz1=pz0+CELL;
        for(let gi=gi0;gi<=gi1;gi++){
          const px0=x0+gi*CELL, px1=px0+CELL;
          // 2D 三角形与单元格相交判定（SAT）：薄墙投影退化为线段也能命中
          if(!triCellOverlap(ax,az,bx,bz,cx,cz,px0,pz0,px1,pz1)) continue;
          const ci=gj*nx+gi;
          if(isWall){
            if(!solid[ci]){ solid[ci]=1; minY[ci]=triMinY; maxY[ci]=triMaxY; }
            else{ if(triMinY<minY[ci])minY[ci]=triMinY; if(triMaxY>maxY[ci])maxY[ci]=triMaxY; }
          } else if(triMaxY>floorH[ci]) floorH[ci]=triMaxY;
        }
      }
    }
  }
  // 主地面高度 = 水平面高度众数（地面面积最大，屋顶/楼层占少数）
  const hist=new Map();
  for(let i=0;i<floorH.length;i++){
    if(floorH[i]<=-1e8) continue;
    const bin=Math.round(floorH[i]*4)/4; // 0.25 桶
    hist.set(bin,(hist.get(bin)||0)+1);
  }
  let floorY=0,best=0;
  for(const [h,c] of hist){ if(c>best){ best=c; floorY=h; } }
  // ---- 实心格 → 沿 X 合并行段（每段 ≤4 units，保证空间索引按中心可靠命中）----
  const dy=-floorY;
  const colliders=[], boundaryColliders=[];
  const SEG=MAP_COLLIDER_SEG;
  for(let gj=0;gj<nz;gj++){
    let gi=0;
    while(gi<nx){
      if(!solid[gj*nx+gi]){ gi++; continue; }
      const start=gi;
      let runMin=minY[gj*nx+gi], runMax=maxY[gj*nx+gi];
      gi++;
      while(gi<nx&&solid[gj*nx+gi]&&(gi-start)*CELL<SEG){
        const ci=gj*nx+gi;
        if(minY[ci]<runMin)runMin=minY[ci];
        if(maxY[ci]>runMax)runMax=maxY[ci];
        gi++;
      }
      const y0=Math.max(0,runMin+dy), y1=Math.max(0.05,runMax+dy);
      if(y1<=0.05) continue; // 纯地面/低于地板
      const c={ min:new THREE.Vector3(x0+start*CELL,y0,z0+gj*CELL),
                max:new THREE.Vector3(x0+gi*CELL,y1,z0+(gj+1)*CELL) };
      const cx=(c.min.x+c.max.x)/2, cz=(c.min.z+c.max.z)/2;
      // 边界标记：位于地图边缘区域的墙体
      if(cx<-hw*0.85||cx>hw*0.85||cz<-hl*0.85||cz>hl*0.85){ c.isBoundary=true; boundaryColliders.push(c); }
      colliders.push(c);
    }
  }
  return {colliders,boundaryColliders,floorY};
}

// 地图加载失败兜底：简单地面 + 边界围墙（保证可玩）
function fallbackMap(game){
  game.mapHalfW=MAP_TARGET_WIDTH/2; game.mapHalfL=MAP_TARGET_WIDTH*0.58;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(MAP_TARGET_WIDTH,MAP_TARGET_WIDTH*1.16),
    new THREE.MeshStandardMaterial({color:0x6a6a6a,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true;
  game.scene.add(ground); game.envMeshes.push(ground);
  const B=MAP_TARGET_WIDTH*0.58, sealH=20;
  const add=(cx,cz,hx,hz)=>game.colliders.push({min:new THREE.Vector3(cx-hx,0,cz-hz),max:new THREE.Vector3(cx+hx,sealH,cz+hz)});
  add(0,B,MAP_TARGET_WIDTH/2,0.4); add(0,-B,MAP_TARGET_WIDTH/2,0.4); add(MAP_TARGET_WIDTH/2,0,0.4,B); add(-MAP_TARGET_WIDTH/2,0,0.4,B);
  game.buildColliderGrid();
  placeAmmoCrates(game);
  game.buildColliderGrid();
  game.mapReady=true;
  console.warn('?? 外挂地图加载失败，已启用兜底地面');
}

// 弹药箱随机分布：10 个、可通行、不在建筑内（距最近墙≥10）、相互间距≥40、不出界（地图加载后调用）
function placeAmmoCrates(game){
  for(const c of game.ammoCrates||[]){ if(c.mesh) game.scene.remove(c.mesh); }
  game.ammoCrates=[];
  const COUNT=10, MIN_DIST=40, WALL_MARGIN=10;
  const hw=game.mapHalfW-8, hl=game.mapHalfL-8; // 离边界留 8 余量，保证不越界
  const placed=[];
  for(let attempt=0;attempt<2000 && placed.length<COUNT;attempt++){
    const x=rand(-hw,hw), z=rand(-hl,hl);
    // 可通行（不卡进墙/障碍物）
    let blocked=false;
    for(const c of game.getNearbyColliders(x,z,2)){
      if(x+0.5>c.min.x&&x-0.5<c.max.x&&z+0.5>c.min.z&&z-0.5<c.max.z&&0<c.max.y&&1.8>c.min.y){ blocked=true; break; }
    }
    if(blocked) continue;
    // 不在建筑内（距最近墙 ≥10，避免封闭房间/厂房内部）
    if(game.wallDistance(x,z)<WALL_MARGIN) continue;
    // 与已放置的相互间距 ≥40
    let ok=true;
    for(const p of placed){
      if(Math.hypot(x-p.x,z-p.z)<MIN_DIST){ ok=false; break; }
    }
    if(!ok) continue;
    placed.push({x,z});
    const crate=buildCrate(game);
    crate.position.x=x; crate.position.z=z; // Y 由 buildCrate 底部对齐
    game.scene.add(crate);
    game.colliders.push(boxCollider(x,0,z,0.5,0.5,1.0));
    game.ammoCrates.push({x,z,looted:false,mesh:crate});
  }
  console.log(`弹药箱已分布 ${game.ammoCrates.length} 个（间距≥${MIN_DIST}）`);
}

// ==================== 新增功能：动态夜空系统 ====================
function buildSky(game){
  const scene=game.scene;
  // ---- 天空穹顶（大球体内表面；半径随地图等比放大，防穹顶穿模）----
  const skyGeo=new THREE.SphereGeometry(MAP_SKY_R,48,48);
  const skyMat=new THREE.MeshBasicMaterial({map:game.tex.nightSky,side:THREE.BackSide,fog:false,depthWrite:false});
  const sky=new THREE.Mesh(skyGeo,skyMat);
  scene.add(sky);
  game.sky=sky;

  // ---- 星星 Points（500~800 颗，闪烁动画）----
  const starCount=700;
  const pos=new Float32Array(starCount*3);
  const col=new Float32Array(starCount*3);
  const stars=[];
  for(let i=0;i<starCount;i++){
    // 球面随机分布（偏向天顶以上半球 + 部分地平线附近）
    const theta=rand(0,Math.PI*2);
    const phi=rand(0.15,Math.PI*0.95);
    const r=MAP_SKY_R-2;
    pos[i*3]=r*Math.sin(phi)*Math.cos(theta);
    pos[i*3+1]=r*Math.cos(phi)*0.9;
    pos[i*3+2]=r*Math.sin(phi)*Math.sin(theta);
    const base=rand(0.35,1.0);
    col[i*3]=col[i*3+1]=col[i*3+2]=base;
    stars.push({base,ph:rand(0,Math.PI*2),fr:rand(0.5,3.0)});
  }
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  starGeo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const starMat=new THREE.PointsMaterial({size:2.2,vertexColors:true,transparent:true,opacity:0.95,sizeAttenuation:false,depthWrite:false,fog:false});
  const starPoints=new THREE.Points(starGeo,starMat);
  scene.add(starPoints);
  game.starPoints=starPoints; game.stars=stars;

  // ---- 月亮（扁球体 + 环形山纹理 + 光晕）----
  const moonGeo=new THREE.SphereGeometry(4,48,48);
  moonGeo.scale(1,0.88,1); // 扁球
  const moonMat=new THREE.MeshStandardMaterial({map:game.tex.moon,roughness:1,metalness:0,emissive:0x222226,emissiveIntensity:0.3,fog:false});
  const moon=new THREE.Mesh(moonGeo,moonMat);
  // 随机位置（每局随机）
  const mAngle=rand(0,Math.PI*2), mElev=rand(0.5,1.15);
  const mR=MAP_SKY_R-15;
  moon.position.set(mR*Math.cos(mElev)*Math.cos(mAngle), mR*Math.sin(mElev), mR*Math.cos(mElev)*Math.sin(mAngle));
  scene.add(moon);
  // 月亮光晕（半透明 Sprite）
  const haloMat=new THREE.SpriteMaterial({map:makeGlowTexture(),color:0xaac8e8,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false});
  const halo=new THREE.Sprite(haloMat);
  halo.scale.set(36,36,1);
  halo.position.copy(moon.position);
  scene.add(halo);
  // 月亮方向光（微弱淡蓝补光）
  const moonLight=new THREE.DirectionalLight(0xaac8e8,0.3);
  moonLight.position.copy(moon.position);
  moonLight.target.position.set(0,0,0);
  scene.add(moonLight); scene.add(moonLight.target);
  game.moon={mesh:moon,halo:halo,light:moonLight};

  // ---- 地平线雾霭（半透明大平面，叠加在天空下半）----
  // 用一个巨大的半透明环/平面贴近穹顶底部，模拟远处废墟烟尘
  const hazeMat=new THREE.MeshBasicMaterial({
    map:game.tex.mist, color:0x2a1c18, transparent:true, opacity:0.35,
    depthWrite:false, side:THREE.BackSide, fog:false
  });
  const haze=new THREE.Mesh(new THREE.SphereGeometry(MAP_SKY_R-1,48,48),hazeMat);
  scene.add(haze);
  game.skyHaze=haze;
}

function boxCollider(cx,cy,cz,hx,hz,h){
  return {min:new THREE.Vector3(cx-hx,cy,cx===0?cz-hz:cz-hz), max:new THREE.Vector3(cx+hx,cy+h,cz+hz)};
}

// 货箱构建
// 弹药箱：优先3D模型（models/武器箱_box.glb），加载失败退回程序化 Box（2026-08-12）
function buildCrate(game){
  if(game._crateModel){
    const model=game._crateModel.clone(true);
    model.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; } });
    // 底部对齐 y=0
    const box=new THREE.Box3().setFromObject(model);
    model.scale.setScalar(1.5);
    box.setFromObject(model); // 缩放后重算
    model.position.y=-box.min.y;
    return model;
  }
  const mat=new THREE.MeshStandardMaterial({map:game.tex.crate,roughness:0.9,metalness:0});
  const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);
  m.castShadow=m.receiveShadow=true;
  m.position.y=0.5; // BoxGeometry 中心在原点，底部对齐地面
  return m;
}

// 漂浮灰尘粒子
function buildAmbientDust(scene,count){
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(count*3);
  const col=new Float32Array(count*3);
  const seed=[];
  for(let i=0;i<count;i++){
    pos[i*3]=rand(-MAP_TARGET_WIDTH/2,MAP_TARGET_WIDTH/2);
    pos[i*3+1]=rand(0,3);
    pos[i*3+2]=rand(-MAP_TARGET_WIDTH/2,MAP_TARGET_WIDTH/2);
    const v=rand(0.3,0.6);
    const c=Math.random()<0.5?[v,v*0.98,v*0.9]:[v*0.98,v*0.95,v*0.7];
    col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
    seed.push({vx:rand(-0.01,0.01),vy:rand(0.002,0.012),vz:rand(-0.01,0.01),ph:rand(0,6)});
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const mat=new THREE.PointsMaterial({
    size:rand(0.05,0.15), vertexColors:true, transparent:true,
    opacity:0.5, depthWrite:false, sizeAttenuation:true
  });
  const pts=new THREE.Points(geo,mat);
  pts.userData.seed=seed; pts.userData.count=count;
  scene.add(pts);
  return pts;
}

/* ============================================================
   僵尸
============================================================ */
let ZOMBIE_ID=0;
class Zombie{
  constructor(game,pos,opts={}){
    this.game=game; this.id=ZOMBIE_ID++;
    this.pos=new THREE.Vector3(pos.x,0,pos.z);
    this.vel=new THREE.Vector3();
    this.yaw=rand(0,Math.PI*2);
    this.hp=opts.hp||50; this.maxHp=this.hp;
    this.speedMult=opts.speedMult||1;
    this.state='idle';
    this.stateTimer=rand(2,5);
    this.attackCd=0; this.attackWindup=0; this.damageDealt=false;
    this.dead=false; this.deathTimer=0; this.fadeDone=false;
    this.kb=new THREE.Vector3();
    this.swipeR=0; this.swipeT=0; // 新增功能：攻击挥臂动画状态
    this.elite=opts.elite||null;
    this.waveSpeed=opts.waveSpeed||1;
    // Boss 战参数（第六波巨型僵尸 / 小兵，2026-08-11 新增）
    this.isBoss=!!opts.isBoss;
    this.isMinion=!!opts.isMinion;
    this.attackDamage=opts.damage||10;             // 单次攻击伤害（普通 10 / Boss 25）
    this.attackCooldown=opts.attackCooldown||1.2;  // 攻击冷却（普通 1.2s / Boss 1.0s）
    this.brokenLegs=0; this.legBroken={L:false,R:false}; // 受击断腿（2026-08-11）：骨折弯折+拖行减速
    this.hitSink=0; this.bodySink=0; // 受击瞬间下压 + 断腿导致身体持续下沉（2026-08-11）
    // 颜色变异
    this.tint=rand(0.8,1.2);
    this.big=(!this.isBoss)&&Math.random()<0.10;   // Boss 不参与体型随机
    this.scale=(opts.scale||(this.big?1.5:1))*(this.elite==='iron'?1.1:1);
    this.attackRange=opts.attackRange||(1.8*this.scale); // 攻击距离（Boss 显式 2.5）
    if(this.big) this.maxHp*=2, this.hp*=2;
    if(this.elite==='iron') this.maxHp=100, this.hp=100;
    if(this.elite==='swift') this.speedMult*=1.5;
    if(this.elite==='iron') this.speedMult*=0.7;
    this.detectTimer=0; this.showExclaim=false;
    this.investigateTarget=null; this.investigateArrive=0;
    this.warnPlayer=false;
    this._buildMesh();
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
    if(this.elite) this._buildEliteLabel();
    if(this.isBoss) this._buildBossAura(); // 第六波巨型僵尸：红色警示光 + 金红光晕
  }
  // 新增功能：僵尸精细化建模（两段式腿/手、脚、破损下颚、眼窝、伤口）
  _buildMesh(){
    const g=new THREE.Group();
    // CF 生化幽灵：斑驳变异墨绿皮肤 + 发光毒眼 + 尖爪獠牙 + 发光血管 + 变异肉瘤
    const skinTex=this._makeMutationSkinTexture();
    const skin=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.40*this.tint,0.58*this.tint,0.27*this.tint),map:skinTex,roughness:0.85,emissive:new THREE.Color().setRGB(0.02*this.tint,0.07*this.tint,0.0),emissiveIntensity:0.55});
    const cloth=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.26*this.tint,0.34*this.tint,0.17*this.tint),roughness:0.95});
    const dark=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.16*this.tint,0.23*this.tint,0.12*this.tint),roughness:0.9});
    const goreMat=new THREE.MeshStandardMaterial({color:0x6a1a12,transparent:true,opacity:0.55,roughness:0.9});
    const blood=new THREE.MeshStandardMaterial({color:0x5a1210,roughness:0.9});
    const clawMat=new THREE.MeshStandardMaterial({color:0x2c3520,roughness:0.5,emissive:new THREE.Color().setRGB(0.12,0.22,0.05),emissiveIntensity:0.6});
    const mutMat=new THREE.MeshStandardMaterial({color:0x2e4a20,roughness:0.7,emissive:new THREE.Color().setRGB(0.04,0.12,0.02),emissiveIntensity:0.4});
    const veinMat=new THREE.MeshStandardMaterial({color:0x1a3a14,roughness:0.4,emissive:0x2f7a20,emissiveIntensity:1.0});

    // ---- 腿（大腿+小腿+脚，两段式摆动）----
    this.hip=new THREE.Group(); this.hip.position.y=0.98; g.add(this.hip);
    this.legs={L:{},R:{}};
    const thighGeo=new THREE.CylinderGeometry(0.1,0.085,0.5,32);
    const shinGeo=new THREE.CylinderGeometry(0.075,0.06,0.44,32);
    const footGeo=new THREE.BoxGeometry(0.13,0.06,0.24);
    for(const side of ['L','R']){
      const s=side==='L'?1:-1;
      const thigh=new THREE.Mesh(thighGeo,dark); thigh.position.set(0.13*s,-0.25,0); thigh.castShadow=true;
      this.hip.add(thigh);
      const shin=new THREE.Mesh(shinGeo,dark); shin.position.set(0,-0.44,0); shin.castShadow=true;
      thigh.add(shin);
      const foot=new THREE.Mesh(footGeo,dark); foot.position.set(0,-0.08,0.05);
      shin.add(foot);
      this.legs[side]={thigh,shin,foot};
    }

    // ---- 变异躯干组（前倾驼背，上半身全挂此组）----
    this.torso=new THREE.Group();
    this.torso.position.y=0.98;
    this.torso.rotation.x=0.16;
    g.add(this.torso);
    // 躯干（更壮硕变异）+ 胸口血污
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.27,0.34,0.7,32),cloth);
    body.position.y=0.34; body.scale.set(1.18,1,1.12); body.castShadow=true; this.torso.add(body);
    this.bodyMesh=body;
    const rip=new THREE.Mesh(new THREE.SphereGeometry(0.14,48,48),goreMat);
    rip.position.set(0.08,0.36,0.18); this.torso.add(rip);
    // 变异肉瘤（肩部 + 背部）
    const tumor=new THREE.Mesh(new THREE.SphereGeometry(0.15,48,48),mutMat);
    tumor.position.set(0.34,0.60,-0.10); tumor.scale.set(1,0.85,1.25); this.torso.add(tumor);
    const tumor2=new THREE.Mesh(new THREE.SphereGeometry(0.13,48,48),mutMat);
    tumor2.position.set(-0.30,0.28,-0.30); tumor2.scale.set(1.2,0.9,1.2); this.torso.add(tumor2);
    // 躯干表面发光静脉血管
    const veinGeo=new THREE.BoxGeometry(0.035,0.42,0.015);
    for(const sx of [-1,1]){
      const vein=new THREE.Mesh(veinGeo,veinMat);
      vein.position.set(0.27*sx,0.08,0.02);
      vein.rotation.z=0.35*sx;
      body.add(vein);
    }

    // ---- 衣服下摆破布条（新增功能：随风飘动）----
    this.clothStrips=[];
    const stripGeo=new THREE.BoxGeometry(0.1,0.3,0.035);
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      const pivot=new THREE.Group();
      pivot.position.set(Math.cos(a)*0.26, -0.01, Math.sin(a)*0.26);
      const strip=new THREE.Mesh(stripGeo,cloth);
      strip.position.y=-0.15; strip.castShadow=true;
      pivot.add(strip);
      this.torso.add(pivot);
      this.clothStrips.push({pivot:pivot,phase:rand(0,6),dir:[Math.cos(a),Math.sin(a)]});
    }

    // ---- 肩膀 + 手臂（上臂+前臂+手，新增功能：手指建模）----
    this.shoulders={L:null,R:null};
    const armGeoU=new THREE.CylinderGeometry(0.062,0.05,0.3,32);
    const armGeoF=new THREE.CylinderGeometry(0.048,0.04,0.26,32);
    for(const side of ['L','R']){
      const s=side==='L'?1:-1;
      const sh=new THREE.Group(); sh.position.set(0.34*s,0.47,0); this.torso.add(sh);
      const upper=new THREE.Mesh(armGeoU,cloth); upper.position.set(0,-0.16,0); sh.add(upper);
      const fore=new THREE.Mesh(armGeoF,skin); fore.position.set(0,-0.27,0); fore.castShadow=true; upper.add(fore);
      // 变异尖爪：手掌 + 4 根锥形毒爪 + 拇指爪
      const hand=new THREE.Group(); hand.position.set(0,-0.32,0.02); fore.add(hand);
      const palm=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.06,0.07),skin); hand.add(palm);
      const clawGeo=new THREE.ConeGeometry(0.012,0.10,32);
      for(let i=0;i<4;i++){
        const claw=new THREE.Mesh(clawGeo,clawMat);
        claw.position.set(-0.024+i*0.0155, -0.065, 0.006);
        claw.rotation.x=0.5;
        hand.add(claw);
      }
      const thumbClaw=new THREE.Mesh(clawGeo,clawMat);
      thumbClaw.position.set(0.036,-0.022,0.012); thumbClaw.rotation.z=0.5; hand.add(thumbClaw);
      this.shoulders[side]=sh;
    }

    // ---- 头：五官细化（眼睛/眉毛/鼻子/嘴牙/耳朵/头发/伤疤）----
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.23,48,48),skin);
    head.position.set(0,0.77,-0.02); head.rotation.x=-0.12; head.castShadow=true; this.torso.add(head);
    this.headMesh=head;
    // 破损下颚
    const jaw=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.08,0.1),skin);
    jaw.position.set(0,1.62,0.09); head.add(jaw);
    const jawBone=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.04,0.09),blood);
    jawBone.position.set(0,1.595,0.11); head.add(jawBone);
    // 眼睛（CF 生化幽灵：发光黄绿眼 + 黑细瞳孔，夜晚清晰可见）
    for(const sx of [-1,1]){
      const sclera=new THREE.Mesh(new THREE.SphereGeometry(0.042,48,48),
        new THREE.MeshStandardMaterial({color:0xd9e66a,roughness:0.3,emissive:0xc8e04a,emissiveIntensity:1.5}));
      sclera.position.set(0.055*sx,1.795,0.185); head.add(sclera);
      const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.016,48,48),
        new THREE.MeshStandardMaterial({color:0x1a0a00,roughness:0.4}));
      pupil.position.set(0.055*sx,1.79,0.21); head.add(pupil);
      const brow=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.008,0.006),dark);
      brow.position.set(0.055*sx,1.845,0.19); brow.rotation.z=0.12*sx; head.add(brow);
    }
    // 鼻子
    const noseMat=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(0.45*this.tint,0.5*this.tint,0.4*this.tint),roughness:0.8});
    const nose=new THREE.Mesh(new THREE.ConeGeometry(0.018,0.045,32),noseMat);
    nose.rotation.x=Math.PI/2; nose.rotation.y=Math.PI/4; nose.position.set(0,1.735,0.205); head.add(nose);
    // 张开的嘴 + 牙齿
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.045,0.02),blood);
    mouth.position.set(0,1.645,0.185); head.add(mouth);
    const toothMat=new THREE.MeshStandardMaterial({color:0xd8cfb0,roughness:0.4});
    for(let i=-1;i<=1;i++){
      const tooth=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.022,0.008),toothMat);
      tooth.position.set(i*0.026,1.66,0.19); tooth.rotation.z=i*0.06; head.add(tooth);
    }
    // 上下獠牙（变异犬齿，突出嘴外）
    const fangGeo=new THREE.ConeGeometry(0.012,0.06,32);
    for(const sx of [-1,1]){
      const uf=new THREE.Mesh(fangGeo,toothMat);
      uf.position.set(0.03*sx,1.665,0.195); uf.rotation.x=0.55; head.add(uf);
      const lf=new THREE.Mesh(fangGeo,toothMat);
      lf.position.set(0.028*sx,1.60,0.185); lf.rotation.x=-0.8; lf.scale.set(0.85,1,0.85); head.add(lf);
    }
    // 耳朵
    for(const sx of [-1,1]){
      const ear=new THREE.Mesh(new THREE.SphereGeometry(0.05,48,48),skin);
      ear.position.set(0.22*sx,1.80,0.02); ear.scale.set(0.5,0.8,0.5); head.add(ear);
    }
    // 残破乱发
    const hairMat=new THREE.MeshStandardMaterial({color:0x2a2620,roughness:0.95});
    for(let i=0;i<8;i++){
      const strand=new THREE.Mesh(new THREE.BoxGeometry(0.018,rand(0.06,0.16),0.018),hairMat);
      strand.position.set(rand(-0.14,0.14),1.96+rand(0,0.05),rand(-0.05,0.12));
      strand.rotation.z=rand(-0.5,0.5); strand.rotation.x=rand(-0.4,0.2);
      head.add(strand);
    }
    // 脸颊伤疤
    const scar=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.006,0.006),dark);
    scar.position.set(0.10,1.76,0.17); scar.rotation.z=0.5; head.add(scar);
    // 头顶伤口
    const wound=new THREE.Mesh(new THREE.SphereGeometry(0.09,48,48),goreMat);
    wound.position.set(0,1.94,0); head.add(wound);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.09,0.12,32),skin);
    neck.position.set(0,0.62,0.01); this.torso.add(neck);

    g.scale.setScalar(this.scale);
    this.group=g;
    this.walkPhase=rand(0,6);
    this.head=null;
  }
  // CF 生化幽灵：斑驳变异皮肤纹理
  _makeMutationSkinTexture(){
    const c=document.createElement('canvas'); c.width=c.height=512;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.scale(2,2); // 256→512
    const r0=98,g0=140,b0=66;
    ctx.fillStyle=`rgb(${r0},${g0},${b0})`; ctx.fillRect(0,0,256,256);
    // 斑驳深/亮色变异斑点
    for(let i=0;i<280;i++){
      const x=Math.random()*256, y=Math.random()*256, rad=6+Math.random()*24;
      const shade=0.62+Math.random()*0.6;
      ctx.fillStyle=`rgba(${Math.round(r0*shade)},${Math.round(g0*shade)},${Math.round(b0*shade)},0.55)`;
      ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
    }
    // 暗色静脉纹
    ctx.strokeStyle='rgba(24,70,26,0.65)'; ctx.lineWidth=2;
    for(let i=0;i<16;i++){
      ctx.beginPath();
      let x=Math.random()*256, y=Math.random()*256;
      ctx.moveTo(x,y);
      for(let j=0;j<5;j++){ x+=(Math.random()-0.5)*46; y+=(Math.random()-0.5)*46; ctx.lineTo(x,y); }
      ctx.stroke();
    }
    // 荧光绿毒点
    ctx.fillStyle='rgba(120,220,90,0.5)';
    for(let i=0;i<40;i++){ ctx.beginPath(); ctx.arc(Math.random()*256,Math.random()*256,1.5+Math.random()*2,0,Math.PI*2); ctx.fill(); }
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  }
  // 新增功能：衣服下摆随风飘动
  _animateCloth(t){
    if(this.clothStrips){
      for(const s of this.clothStrips){
        const sway=Math.sin(t*2.3+s.phase)*0.13 + Math.sin(t*4.7+s.phase*1.7)*0.06;
        s.pivot.rotation.x=sway*s.dir[1];
        s.pivot.rotation.z=sway*s.dir[0];
      }
    }
  }
  // 新增功能：行走循环动画（腿/手交替摆动，速度自适应）
  _animateWalk(dt){
    const sp=Math.hypot(this.vel.x,this.vel.z);
    const w=clamp(sp/1.2,0,1);
    if(w>0.05) this.walkPhase+=dt*(3.5+w*7);
    else this.walkPhase+=dt*0.9;
    const sw=Math.sin(this.walkPhase)*0.55*w;
    const sw2=Math.sin(this.walkPhase);
    if(this.legs){
      for(const side of ['L','R']){
        if(this.legBroken[side]) continue; // 断腿：保持骨折姿态拖行，不再摆动
        const s=side==='L'?1:-1;
        const leg=this.legs[side];
        leg.thigh.rotation.x=sw*s;
        leg.shin.rotation.x=Math.max(0,-sw2*s)*0.5*w;
      }
    }
    if(this.shoulders){
      // 新增功能：攻击时右臂附加挥击动画（向后蓄力→向前甩出→收势）
      const swipe=this.state==='attack'?(this.swipeR||0):0;
      this.shoulders.L.rotation.x=-sw*0.6;
      this.shoulders.R.rotation.x=sw*0.6+swipe;
      this.shoulders.L.rotation.z=0.06;
      this.shoulders.R.rotation.z=-0.06;
    }
  }
  _buildEliteLabel(){
    const div=document.createElement('div');
    div.className='zLabel';
    const icon=this.elite==='swift'?'?':this.elite==='iron'?'??':'?';
    const color=this.elite==='swift'?'#55aaff':this.elite==='iron'?'#ffd455':'#ff5544';
    div.innerHTML=`<span style="font-size:22px;color:${color};filter:drop-shadow(0 0 6px ${color});">${icon}</span>`;
    this.eliteLabel=new CSS2DObject(div);
    this.eliteLabel.position.set(0,2.7*this.scale,0);
    this.group.add(this.eliteLabel);
  }
  // 新增功能：Boss 标识——红色警示光 + 金红光晕 + 体表红色发光（第六波巨型僵尸）
  _buildBossAura(){
    this.bossLight=new THREE.PointLight(0xff3300,60,36,1.8);
    this.bossLight.position.set(0,2.2*this.scale,0);
    this.group.add(this.bossLight);
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({
      map:makeGlowTexture(), color:0xffaa22, transparent:true, opacity:0.65,
      blending:THREE.AdditiveBlending, depthWrite:false
    }));
    halo.scale.setScalar(Math.min(12,4.2*this.scale)); // 光晕封顶 12 单位，防体型放大后遮天
    halo.position.set(0,2.0*this.scale,0);
    this.group.add(halo);
    this.bossHalo=halo;
    // 体表红色发光（先置红再缓存 origEmissive，保证受击闪白后恢复红色而非变黑）
    this.group.traverse(o=>{
      if(o.isMesh&&o.material.emissive){
        const m=o.material;
        m.emissive.set(0xff2200); m.emissiveIntensity=0.8;
        m.userData.origEmissive=m.emissive.clone(); m.userData.origEI=m.emissiveIntensity;
      }
    });
  }
  update(dt,t){
    if(this.dead){ this._updateDead(dt); return; }
    const game=this.game, player=game.player;
    const dx=player.pos.x-this.pos.x, dz=player.pos.z-this.pos.z;
    const dist=Math.hypot(dx,dz);
    const attackRange=this.attackRange;

    // 受击闪白
    if(this.hurtFlash>0){ this.hurtFlash-=dt; this.group.traverse(o=>{ if(o.isMesh&&o.material.emissive){ const m=o.material; if(m.userData.origEmissive===undefined){ m.userData.origEmissive=m.emissive.clone(); m.userData.origEI=m.emissiveIntensity; } m.emissive.set(0xffffff); } }); }
    else if(this._lastEmissive){ this.group.traverse(o=>{ if(o.isMesh&&o.material.emissive){ const m=o.material; if(m.userData.origEmissive!==undefined){ m.emissive.copy(m.userData.origEmissive); m.emissiveIntensity=m.userData.origEI; } else m.emissive.set(0,0,0); } }); this._lastEmissive=false; }

    // 呼吸/低吼
    if(dist<10 && !this.dead){
      game.audio.startBreath(this);
      if(Math.random()<dt*0.5) game.audio.growl(this.pos);
    } else game.audio.stopBreath(this);

    // ---- 状态机 ----
    // 视觉索敌 25→50（2026-08-14）：与生成半径(20~50)匹配，确保生成后的僵尸能发现玩家主动追击，
    // 避免地图放大后远处僵尸永远无法感知玩家而卡住波次
    const canDetect = dist<50;
    if(this.state==='idle'){
      this.stateTimer-=dt;
      this._sway(t);
      if(canDetect && this._hasLOS(player)){
        this.state='detect'; this.detectTimer=0.5; this.showExclaim=true;
      }
      if(this.investigateTarget){ this.state='investigate'; this.showExclaim=false; }
      if(this.stateTimer<=0){
        this.yaw+=rand(-Math.PI,Math.PI);
        this.stateTimer=rand(2,5);
      }
    }
    else if(this.state==='detect'){
      this._sway(t);
      if(this.detectTimer>0){
        this.detectTimer-=dt;
        this._face(player.pos,dt*8);
        if(this.detectTimer<=0){
          this.state='chase';
          this.showExclaim=false;
        }
      } else { this.state='chase'; this.showExclaim=false; }
    }
    else if(this.state==='chase'){
      // 新增功能：室内追击子状态——进入房屋后转向更灵活
      const indoors=this.game.isInsideHouse(this.pos.x,this.pos.z);
      this._face(player.pos,dt*(indoors?9:6));
      const legSlow=1-this.brokenLegs*0.35; // 断腿拖行减速（1条×0.65、2条×0.30，2026-08-11）
      const sp=1.3*this.speedMult*this.waveSpeed*(this.big?0.9:1)*legSlow;
      this._moveToward(player.pos,sp,dt);
      if(dist<attackRange){ this.state='attack'; this.attackWindup=0.4; this.damageDealt=false; }
    }
    else if(this.state==='investigate'){
      this.showExclaim=false;
      if(this.investigateTarget){
        this._face(this.investigateTarget,dt*8);
        const sp=1.8*(1-this.brokenLegs*0.35); // 断腿拖行减速
        const d=this.pos.distanceTo(this.investigateTarget);
        if(d>0.6){ this._moveToward(this.investigateTarget,sp,dt); }
        else { this.investigateArrive+=dt; this.vel.multiplyScalar(0); if(this.investigateArrive>1.5){ this.investigateTarget=null; this.state='idle'; this.stateTimer=rand(2,5); } }
      }
      // 若期间发现玩家
      if(canDetect && dist<20 && this._hasLOS(player)){ this.state='chase'; }
    }
    else if(this.state==='attack'){
      this.vel.multiplyScalar(0);
      this._face(player.pos,dt*6);
      if(this.attackWindup>0){
        this.attackWindup-=dt;
        this._sway(t,true);
        // 新增功能：攻击前摇——攻击手臂向后蓄力
        this.swipeR=0.9;
        if(this.attackWindup<=0 && !this.damageDealt){
          this.damageDealt=true;
          // 新增功能：挥击瞬间手臂向前甩出（抓到玩家）
          this.swipeT=0.35;
          this.swipeR=-1.3;
          if(dist<attackRange+0.3 && player.alive){
            player.takeDamage(this.attackDamage,this.pos);
            game.audio.meatHit();
            game.spawnParticles(player.pos.clone().setY(1.2),{color:0x8a1010,count:6,size:0.14,life:0.4,vel:2.5,grav:5});
          }
          this.attackCd=this.attackCooldown;
        }
      } else {
        // 挥击收势/恢复
        if(this.swipeT>0){
          this.swipeT-=dt;
          if(this.swipeT>0.12){
            this.swipeR=lerp(-1.3,-0.3,1-(this.swipeT-0.12)/0.23);
          } else {
            this.swipeR=lerp(-0.3,0,1-this.swipeT/0.12);
          }
        } else this.swipeR=0;
        this.attackCd-=dt;
        if(this.attackCd<=0){
          if(dist<attackRange) { this.state='attack'; this.attackWindup=0.4; this.damageDealt=false; }
          else this.state='chase';
        }
      }
    }

    // 行走循环动画（腿/手摆动） + 衣服飘动
    this._animateWalk(dt);
    this._animateCloth(t);
    this.vel.multiplyScalar(this.state==='idle'||this.state==='detect'?Math.pow(0.001,dt):1); // 摩擦
    // 击退
    if(this.kb.lengthSq()>0.0001){
      this.pos.addScaledVector(this.kb,dt);
      this.kb.multiplyScalar(Math.pow(0.02,dt));
    }
    this.pos.addScaledVector(this.vel,dt);
    // Boss 红色光晕 / 警示光脉冲
    if(this.isBoss){
      if(this.bossHalo) this.bossHalo.material.opacity=0.5+0.3*Math.sin(t*5);
      if(this.bossLight) this.bossLight.intensity=60+40*Math.sin(t*7);
    }
    this._collide(dt);
    // 边界强制约束（地图边缘围墙绝对边界）：无论碰撞如何，僵尸绝不可越出地图
    if(this.game&&this.game.applyMapBoundary) this.game.applyMapBoundary(this.pos);
    this.group.position.copy(this.pos);
    // 断腿身体下沉 + 受击下压反馈（仅普通/胖子；巨型 Boss 彻底排除该逻辑，受击零下沉，2026-08-11）
    if(!this.isBoss){
      this.group.position.y-=this.bodySink+this.hitSink;
      this.hitSink=lerp(this.hitSink,0,Math.min(1,dt*10));
    }
    this.group.rotation.y=this.yaw;
    this._updateLabel(dt);
  }
  _hasLOS(player){
    const origin=this.pos.clone().setY(this.pos.y+1.8*this.scale);
    const dir=player.pos.clone().setY(player.pos.y+1.2).sub(origin).normalize();
    const ray=new THREE.Raycaster(origin,dir,0,this.pos.distanceTo(player.pos)+0.5);
    const hits=ray.intersectObjects(this.game.envMeshes,false);
    return hits.length===0;
  }
  _face(target,amt){
    const dx=target.x-this.pos.x, dz=target.z-this.pos.z;
    const want=Math.atan2(dx,dz);
    let d=want-this.yaw;
    while(d>Math.PI) d-=Math.PI*2;
    while(d<-Math.PI) d+=Math.PI*2;
    this.yaw+=clamp(d,-amt,amt);
  }
  _moveToward(target,speed,dt){
    const dx=target.x-this.pos.x, dz=target.z-this.pos.z;
    const dist=Math.hypot(dx,dz);
    if(dist<0.01){ this.vel.set(0,0,0); return; }
    this.vel.x=dx/dist*speed;
    this.vel.z=dz/dist*speed;
  }
  _sway(t,attack=false){
    if(!attack) this.group.rotation.z=Math.sin(t*1.8+this.id)*0.04;
    else this.group.rotation.z=Math.sin(t*20)*0.06;
  }
  _collide(dt){
    // 环境碰撞（使用空间索引，性能优化）
    const r=0.4*this.scale;
    const nearby=this.game&&this.game.getNearbyColliders?this.game.getNearbyColliders(this.pos.x,this.pos.z,r+2):this.game.colliders;
    this.pos.x+=this.vel.x*dt;
    for(const c of nearby){
      if(this.pos.x+r>c.min.x&&this.pos.x-r<c.max.x&&this.pos.z+r>c.min.z&&this.pos.z-r<c.max.z&&this.pos.y<c.max.y&&this.pos.y+1.8*this.scale>c.min.y){
        if(c.isBoundary){ const ccx=(c.min.x+c.max.x)/2; this.pos.x=ccx>0?c.min.x-r:c.max.x+r; } // 边界墙：推回地图内侧，防卡进墙
        else if(this.vel.x>0) this.pos.x=c.min.x-r; else this.pos.x=c.max.x+r;
        this.vel.x=0;
      }
    }
    this.pos.z+=this.vel.z*dt;
    for(const c of nearby){
      if(this.pos.x+r>c.min.x&&this.pos.x-r<c.max.x&&this.pos.z+r>c.min.z&&this.pos.z-r<c.max.z&&this.pos.y<c.max.y&&this.pos.y+1.8*this.scale>c.min.y){
        if(c.isBoundary){ const ccz=(c.min.z+c.max.z)/2; this.pos.z=ccz>0?c.min.z-r:c.max.z+r; }
        else if(this.vel.z>0) this.pos.z=c.min.z-r; else this.pos.z=c.max.z+r;
        this.vel.z=0;
      }
    }
  }
  _updateLabel(dt){
    if(this.exclaimLabel){
      if(this.showExclaim){
        this.exclaimLabel.visible=true;
        this.exclaimLabel.position.y=2.5*this.scale+Math.sin(this.game.time*6)*0.06;
      } else this.exclaimLabel.visible=false;
    }
  }
  // 声学响应：接收到脚步脉冲
  hearPulse(srcPos){
    if(this.dead) return;
    if(this.state==='chase'||this.state==='attack') return;
    this.investigateTarget=srcPos.clone();
    this.investigateArrive=0;
    this.state='investigate';
    // 头部转向声源
    if(this.headMesh) this.headMesh.rotation.y=Math.atan2(srcPos.x-this.pos.x,srcPos.z-this.pos.z)*0.3;
    this.game.onZombieHeard(this);
    this.warnPlayer=true;
    setTimeout(()=>{ if(this.warnPlayer) this.warnPlayer=false; },600);
  }
  damage(amount,headshot,fromPos){
    if(this.dead) return;
    this.hp-=amount;
    this.hurtFlash=0.12; this._lastEmissive=true;
    // 受击瞬间下压（仅普通/胖子；巨型 Boss 不受此效果影响，2026-08-11 用户要求）
    if(!this.isBoss) this.hitSink=Math.max(this.hitSink,0.12*this.scale);
    this.game.showDamageNumber(this,amount,headshot);
    // 受击断腿：仅普通/胖子（35% 概率）；巨型 Boss 无断腿/下降效果（2026-08-11 用户要求）
    if(!this.isBoss && this.hp>0 && this.brokenLegs<2 && Math.random()<0.35) this._breakLeg();
    if(this.hp<=0){
      this.die(fromPos,headshot);
      return true;
    }
    return false;
  }
  // 新增功能：受击断腿——小腿反向骨折弯折 + 轻微侧扭，拖行减速（2026-08-11）
  _breakLeg(){
    const sides=this.legBroken.L?(this.legBroken.R?[]:['R']):(this.legBroken.R?['L']:['L','R']);
    if(!sides.length) return;
    const side=sides[randInt(0,sides.length-1)];
    this.legBroken[side]=true;
    this.brokenLegs++;
    this.bodySink+=0.15*this.scale; // 断腿导致身体持续下沉（巨型僵尸明显变矮）
    const leg=this.legs[side];
    if(leg){
      leg.shin.rotation.x=1.9;                   // 膝盖反向骨折（约 109°）
      leg.shin.rotation.z=(side==='L'?1:-1)*0.35; // 轻微侧扭
      if(leg.foot) leg.foot.rotation.x=0.8;      // 脚掌扭曲
    }
    if(this.game&&this.game.audio) this.game.audio.boneBreak();
  }
  knockback(dir,strength){
    this.kb.copy(dir).multiplyScalar(strength*3.5);
  }
  die(fromPos,headshot){
    this.dead=true;
    this.deathTimer=0;
    this.state='dead';
    this.game.audio.stopBreath(this);
    if(this.eliteLabel){ this.eliteLabel.visible=false; }
    if(this.exclaimLabel){ this.exclaimLabel.visible=false; }
    // Boss 死亡：猛烈爆炸 + 镜头震动（特殊死亡演出，2026-08-11）
    if(this.isBoss){
      this.game.shakeCamera(0.9);
      this.game.spawnParticles(this.pos.clone().setY(1.5),{color:0xff5522,count:60,size:0.6,life:1.2,vel:10,add:true});
      this.game.spawnParticles(this.pos.clone().setY(1.5),{color:0xffcc66,count:40,size:0.5,life:0.9,vel:12,add:true});
      this.game.audio.gunshot();
    }
    // 击退/倒地方向
    this.group.rotation.x=headshot?0:0;
    this.game.onZombieKilled(this,fromPos,headshot);
    // 自爆精英：0.8秒后爆炸
    if(this.elite==='boom'){
      setTimeout(()=>{
        if(!this.game||this.game.state==='GAMEOVER') return;
        const d=this.pos.distanceTo(this.game.player.pos);
        if(d<3){
          this.game.player.takeDamage(20,this.pos);
          this.game.audio.stockHit();
          this.game.shakeCamera(0.25);
        }
        this.game.spawnParticles(this.pos,{color:0xff5522,count:26,size:0.35,life:0.8,vel:6,add:true});
        this.game.spawnParticles(this.pos,{color:0xffcc66,count:16,size:0.3,life:0.5,vel:8,add:true});
        this.game.audio.gunshot();
      },800);
    }
  }
  _updateDead(dt){
    this.deathTimer+=dt;
    this.group.rotation.x=lerp(this.group.rotation.x,-Math.PI/2,Math.min(1,dt*6));
    this.group.position.y-=dt*0.5;
    if(this.deathTimer>3 && !this.fadeDone){
      this.fadeDone=true;
      this._fadeOut();
    }
  }
  _fadeOut(){
    const matArr=[];
    this.group.traverse(o=>{ if(o.isMesh) matArr.push(o.material); });
    const start=performance.now();
    const step=()=>{
      const t=(performance.now()-start)/600;
      if(t>=1){ this.dispose(); return; }
      for(const m of matArr){ if(m.transparent!==undefined){ m.transparent=true; m.opacity=1-t; } }
      requestAnimationFrame(step);
    };
    step();
  }
  dispose(){
    this.game.audio.stopBreath(this);
    this.game.scene.remove(this.group);
    if(this.eliteLabel) this.group.remove(this.eliteLabel);
    if(this.bossLight) this.group.remove(this.bossLight);
    if(this.bossHalo){ this.group.remove(this.bossHalo); this.bossHalo.material.dispose(); }
    this.group.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); if(o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
}

/* ============================================================
   僵尸管理器（生成 + AI + 波次）
============================================================ */
class ZombieManager{
  constructor(game){
    this.game=game;
    this.zombies=[];
    this.wave=1;
    this.nextWaveKills=0; // 推进阈值由 spawnWave 按波次刷新量累计（原固定 10）
  }
  spawnWave(n){
    this.wave=n;
    // 第六波：不再生成普通僵尸，进入 Boss 战（单只巨型僵尸 + 周期性小兵，2026-08-11）
    if(n>=BOSS_WAVE){ this.game.triggerBossAppear(); return; }
    // 波次刷新量（2026-08-11 用户要求）：第1波30、第2波50、每波在前一波基础上+20（30+(n-1)*20）
    // 上限120 防高波次性能崩溃（每僵尸约 40 网格）；推进阈值累计波次刷新量，保证“本波清空”才推进
    const count=clamp(30+(n-1)*20,30,120);
    this.nextWaveKills=(this.nextWaveKills||0)+count;
    const speedMult=1+(n-1)*0.05;
    this.game.showWaveBanner(n);
    // 精英：15% 概率
    let elitePick=-1;
    if(n>=1 && Math.random()<0.15) elitePick=randInt(0,count-1);
    for(let i=0;i<count;i++){
      const pos=this._randomSpawn();
      const opts={speedMult:speedMult,waveSpeed:speedMult};
      if(i===elitePick) opts.elite=['swift','iron','boom'][randInt(0,2)];
      this.zombies.push(new Zombie(this.game,pos,opts));
    }
    this.game.updateWaveUI(n);
  }
  _randomSpawn(){
    const side=randInt(0,3);
    const g=this.game;
    const hw=(g&&g.mapHalfW)||48, hl=(g&&g.mapHalfL)||48;
    // 地图集成：避免生成在墙体/建筑内（外挂地图实心格碰撞体），最多重试 15 次
    for(let attempt=0;attempt<15;attempt++){
      // 以“玩家当前位置”为中心生成（曾以地图原点为中心：外挂地图后出生点移到 spawnPoint，
      // 远离原点导致每波僵尸离玩家 50~150 单位、全部超出感知范围→波次无法推进，2026-08-14 修复）
      // 半径固定绝对距离 20~50（曾随 MAP_SCALE 放大到 63~126，同样导致远处僵尸永久 idle）
      const pp=g.player.pos;
      const r=rand(20,50), a=rand(0,Math.PI*2);
      const x=clamp(pp.x+Math.cos(a)*r,-hw+1.5,hw-1.5);
      const z=clamp(pp.z+Math.sin(a)*r,-hl+1.5,hl-1.5);
      let blocked=false;
      if(g&&g.getNearbyColliders){
        // 查询半径 2.5：单段碰撞体 ≤4 单位，取半长 2 内必覆盖该点，避免漏检墙体
        for(const c of g.getNearbyColliders(x,z,2.5)){
          if(x>c.min.x&&x<c.max.x&&z>c.min.z&&z<c.max.z&&0<c.max.y&&1.8>c.min.y){ blocked=true; break; }
        }
      }
      // 强制：不在建筑内生成（最近墙距离 ≥8，避免封闭房间/厂房内部）
      if(!blocked){
        const wd=(g&&g.wallDistance)?g.wallDistance(x,z):8;
        if(wd>=8) return new THREE.Vector3(x,0,z);
      }
    }
    // 回退：使用玩家安全出生点（建筑外开阔处）
    const sp=g&&g.spawnPoint;
    return new THREE.Vector3(sp?sp.x:0,0,sp?sp.z:0);
  }
  update(dt){
    for(let i=this.zombies.length-1;i>=0;i--){
      const z=this.zombies[i];
      z.update(dt,this.game.time);
      if(z.fadeDone){
        this.zombies.splice(i,1);
        z.dispose();
      }
    }
  }
  clear(){
    for(const z of this.zombies){ z.dispose(); }
    this.zombies=[];
  }
}

/* ============================================================
   玩家
============================================================ */
class Player{
  constructor(camera,colliders){
    this.camera=camera;
    this.colliders=colliders;
    this.pos=new THREE.Vector3(0,0,0);   // 脚底
    this.vel=new THREE.Vector3();
    this.yaw=0; this.pitch=0;
    this.onGround=false;
    this.crouch=false; this.crouchTarget=false;
    this.eyeH=1.7;
    this.lean=0; this.leanTarget=0;
    this.ads=0; this.adsHold=false;
    this.sprinting=false; this._sprintBlock=false; // 探头后需重按 Shift 恢复冲刺的封锁标志（2026-08-12）
    this.health=100; this.maxHealth=100;
    this.alive=true;
    this.bobPhase=0; this.lastPos=new THREE.Vector3();
    this.recoil=0;
    this.stepHeight=1.05;
    this.sinkShock=0;
    this.wasCrouched=false;
    this.camPush=0; this.camDip=0;
    this.stepTimer=0; this.bobY=0; this.bobX=0;
    // 新增功能：开镜呼吸晃动 + 屏息（高倍镜按住 Shift 短暂稳定）
    this.breathTime=0; this.breathPhase=0; this.breathHold=false;
    // 新增功能：塔科夫硬核耐力（冲刺/跳跃消耗，走路恢复）+ CS:GO 移动精度惩罚
    this.stamina=100; this.maxStamina=100;
    this.inacc=0; // 0~1：移动/空中/开火造成的精度损失（影响准星与弹道）
    this._fireInacc=0; // 开火后短暂精度损失
    this._exhCd=0;     // 耐力耗尽提示冷却
  }
  reset(){
    // 出生/复活强制在建筑外安全出生点（spawnPoint 由地图加载后计算；未加载时回退原点）
    const sp=this.game&&this.game.spawnPoint;
    this.pos.set(sp?sp.x:0,0,sp?sp.z:0); this.vel.set(0,0,0);
    this.yaw=0; this.pitch=0; this.onGround=false;
    this.crouch=this.crouchTarget=false;
    this.eyeH=1.7; this.health=100; this.alive=true;
    this.lean=this.leanTarget=0; this.ads=0; this.sprinting=false;
    this.recoil=0;
    this.stamina=100; this.inacc=0; this._fireInacc=0;
    this.camera.fov=80; this.camera.updateProjectionMatrix();
  }
  update(dt,keys){
    const cam=this.camera;
    const inspecting=this.game&&this.game.weapon?this.game.weapon.inspectAnim>0:false;
    // ---- 蹲伏（按住模式；检视期间禁用）----
    const wantCrouch=!!keys.ctrl&&!inspecting;
    if(wantCrouch && !this.crouch && this.onGround) this.crouchTarget=true;
    if(!wantCrouch) this.crouchTarget=false;
    if(!this.onGround && wantCrouch){} // 空中按 Ctrl 无响应
    // 蹲下限制：蹲伏禁止跳跃
    this.crouch=lerp(this.crouch,this.crouchTarget?1:0,Math.min(1,dt*15));
    const isCrouched=this.crouch>0.5;
    const targetEye=isCrouched?0.9:1.7;
    const prevEye=this.eyeH;
    this.eyeH=lerp(this.eyeH,targetEye,Math.min(1,dt*15));
    // 下蹲到底部“下沉冲击感”
    if(isCrouched && !this.wasCrouched && Math.abs(this.eyeH-targetEye)<0.05){
      this.sinkShock=-0.02;
    }
    if(this.sinkShock<0){ this.sinkShock+=dt*0.4; if(this.sinkShock>0) this.sinkShock=0; }
    this.wasCrouched=isCrouched;

    // ---- 移动输入 ----
    let ix=0,iz=0;
    if(keys.w) iz+=1; if(keys.s) iz-=1;
    if(keys.a) ix-=1; if(keys.d) ix+=1;
    const hasInput=(ix!==0||iz!==0);
    const movingLen=Math.hypot(ix,iz);
    if(movingLen>0){ ix/=movingLen; iz/=movingLen; }
    // 倾斜限制
    const leaning=Math.abs(this.lean)>0.3;
    const wc=this.game&&this.game.weapon?this.game.weapon.current:null;
    const adsBlock=this.ads>0.5;
    // 探头时禁止奔跑；松开探头后需重新按 Shift 才能恢复冲刺（2026-08-12 用户要求）
    if(leaning) this._sprintBlock=true;       // 进入探头：封锁冲刺（需松开 Shift 解除）
    if(!keys.shift) this._sprintBlock=false;  // Shift 松开解除封锁
    // 冲刺条件（换弹/探头/开镜/检视均禁止）
    this.sprinting=!!keys.shift && hasInput && !isCrouched && !leaning && !adsBlock && !inspecting
      && !this._sprintBlock && !(this.game&&this.game.weapon&&this.game.weapon.reloading) && this.onGround && this.stamina>0;
    // ---- 耐力系统（塔科夫硬核：冲刺/跳跃消耗，走路缓慢恢复）----
    const staminaDrain=this.sprinting?22:0;
    const staminaRegen=this.sprinting?0:(hasInput?13:24);
    this.stamina=clamp(this.stamina+(staminaRegen-staminaDrain)*dt,0,this.maxStamina);
    if(this._exhCd>0) this._exhCd-=dt;
    if(this.sprinting&&this.stamina<=0){
      this.sprinting=false;
      if(this._exhCd<=0){ this._exhCd=0.7; if(this.game) this.game.staminaExhausted(); }
    }
    // 新增功能：不同武器不同移速（由配件机动性决定；刀固定 4.95）
    const mobility=this.game&&this.game.weapon?this.game.weapon.curStats().mobility:70;
    const baseSpeed=wc==='knife'?4.95:(1.8+mobility*0.03);
    // 冲刺在此基础上翻倍；蹲伏/开镜/倾斜按百分比叠加
    const adsMult=wc==='sniper'?0.20:(wc==='rifle'||wc==='shotgun'||wc==='remington'?0.30:0.35); // 狙击开镜20%，步枪/散弹枪30%，手枪35%
    let speed=this.sprinting?baseSpeed*2:(isCrouched?baseSpeed*0.5:(adsBlock?baseSpeed*adsMult:(leaning?baseSpeed*0.6:baseSpeed)));
    if(inspecting) speed*=0.3; // 检视期间移动降至 30%
    // 方向（W=视向前方, S=后方, A/D=左右）
    const sinY=Math.sin(this.yaw), cosY=Math.cos(this.yaw);
    const tx=cosY*ix - sinY*iz;   // 右向分量
    const tz=-sinY*ix - cosY*iz;  // 前向分量
    const targetVx=tx*speed, targetVz=tz*speed;
    const accel=this.sprinting?14:10;
    const k=1-Math.exp(-accel*dt);
    this.vel.x=lerp(this.vel.x,targetVx,k);
    this.vel.z=lerp(this.vel.z,targetVz,k);
    if(!hasInput){
      this.vel.x*=Math.pow(0.92,dt*60);
      this.vel.z*=Math.pow(0.92,dt*60);
    }

    // ---- 跳跃（消耗耐力，塔科夫硬核：体力不足无法起跳；换弹/开镜中可跳，跳跃动画不打断换弹；2026-08-12 放开开镜跳跃）----
    if(keys.space && this.onGround && !isCrouched && !inspecting){
      if(this.stamina>=12){ this.vel.y=6.5; this.stamina-=12; this.onGround=false;
        // 动作系统：跳跃动画（播放期间不可移动，落地后回到之前状态）
        if(this.game&&this.game.anim) this.game.anim.startOneShot('jump');
      }
      else if(this._exhCd<=0){ this._exhCd=0.5; if(this.game) this.game.staminaExhausted(); }
    }

    // ---- CS:GO 射击精度（移动/空中/开火降低精度，开镜与蹲伏稳定）----
    {
      const hSpeed=Math.hypot(this.vel.x,this.vel.z);
      const moveRatio=this.onGround?clamp(hSpeed/(baseSpeed||1),0,1):1; // 全速移动=满惩罚
      const airMul=this.onGround?0:0.9;
      const crouchMul=isCrouched?0.4:1;
      const adsMul=1-this.ads*0.85; // 开镜显著降低移动惩罚（稳定射击）
      let baseInacc=(moveRatio*0.7+airMul)*crouchMul*adsMul;
      // 开火后短暂精度损失（CS:GO 后坐力恢复概念）
      if(this._fireInacc>0){ this._fireInacc-=dt*2.2; baseInacc+=0.45*this._fireInacc; }
      this.inacc=clamp(baseInacc,0,1);
    }

    // ---- 重力 ----
    this.vel.y-=20*dt;
    const prevY=this.pos.y;
    this._integrate(dt);
    // 落地检测
    if(this.pos.y<=0 && this.vel.y<=0){
      const fall=prevY-this.pos.y;
      this.pos.y=0; this.vel.y=0; this.onGround=true;
      if(fall>2){ this.game&&this.game.playerLanded(fall); }
      // 动作系统：落地提前结束跳跃动画
      if(this.game&&this.game.anim) this.game.anim.onLand();
    }

    // ---- 脚步脉冲（声学系统）----
    if(this.sprinting && this.onGround){
      if(this.stepTimer===undefined) this.stepTimer=0;
      this.stepTimer+=dt;
      if(this.stepTimer>=0.35){
        this.stepTimer=0;
        this.game&&this.game.broadcastFootstep();
      }
    }

    // ---- 头部摆动（Bobbing）----
    const hSpeed=Math.hypot(this.vel.x,this.vel.z);
    if(hSpeed>0.5 && this.onGround){
      // 开镜时晃动减弱，便于铁瞄
      const amp=(isCrouched?0.025:0.05)*(this.sprinting?1.3:1)*(1-this.ads*0.75);
      this.bobPhase+=dt*(this.sprinting?14:10);
      this.bobY=Math.sin(this.bobPhase*2)*amp;
      this.bobX=Math.sin(this.bobPhase)*amp*0.5;
    } else {
      this.bobY=lerp(this.bobY||0,0,Math.min(1,dt*6));
      this.bobX=lerp(this.bobX||0,0,Math.min(1,dt*6));
    }

    // ---- 探头（Q/E：头部偏移±0.25 + 视角倾斜±25° + 武器倾斜±30°，0.15s 平滑过渡，2026-08-12）----
    this.leanTarget=(keys.q?-1:0)+(keys.e?1:0);
    this.lean=lerp(this.lean,this.leanTarget,Math.min(1,dt*(1/0.15)));

    // ---- 开镜（FOV / 开镜速度由装配瞄准镜决定）----
    this.adsHold=!!keys.rmb;
    // 开镜立即打断检视（战斗操作优先）
    if(this.adsHold && inspecting) this.game.weapon.interruptInspect();
    const canAds=(wc==='pistol'||wc==='rifle'||wc==='sks'||wc==='sniper'||wc==='shotgun'||wc==='remington'||wc==='thompson'||wc==='sten')&&!this.game.weapon.reloading&&!this.game.weapon.stockAnim;
    const adsTarget=(this.adsHold&&canAds)?1:0;
    const stScope=this.game&&this.game.weapon?this.game.weapon.curStats():null;
    const scDef=stScope?(SCOPE_DEFS[stScope.scopeType]||SCOPE_DEFS.irons):SCOPE_DEFS.irons;
    // 开镜平滑过渡 0.25s（2026-08-12 用户要求：0.25 秒内平滑过渡到开镜/回腰射；统一速度 4/s）
    const adsRate=4.0;
    this.ads=lerp(this.ads,adsTarget,Math.min(1,dt*adsRate));
    // FOV 随倍率实时过渡（瞄准镜类型决定）；冲刺时轻微 FOV 拉远（使命召唤视角冲击感）
    const sprintFov=this.sprinting?87:80;
    const targetFov=lerp(sprintFov,scDef.fov,this.ads);
    this.camera.fov=lerp(this.camera.fov,targetFov,Math.min(1,dt*adsRate));
    this.camera.updateProjectionMatrix();
    // ---- 开镜呼吸晃动 + 屏息（高倍镜按住 Shift 短暂稳定）----
    let swayX=0, swayY=0;
    if(this.ads>0.5&&scDef.sway>0){
      if(keys.shift&&this.breathTime<=0&&scDef.breath>0){ this.breathTime=scDef.breath; this.breathHold=true; }
      if(this.breathTime>0){ this.breathTime-=dt; if(this.breathTime<=0) this.breathHold=false; }
      const amp=this.breathTime>0?0:scDef.sway;
      this.breathPhase+=dt*Math.PI; // 0.5Hz 呼吸
      swayX=Math.sin(this.breathPhase)*amp;
      swayY=Math.sin(this.breathPhase*1.3+0.7)*amp*0.6;
    } else { this.breathTime=0; this.breathHold=false; }

    // ---- 后坐力恢复 ----
    this.recoil=lerp(this.recoil,0,Math.min(1,dt*12));

    // ---- 相机应用 ----
    cam.rotation.order='YXZ';
    cam.rotation.y=this.yaw+swayX;
    cam.rotation.x=this.pitch+this.recoil*0.02+swayY;
    cam.rotation.z=-this.lean*0.436; // ±25°（Q 左倾为负值→画面向左倾斜，E 右倾相反）
    const leanX=this.lean*0.25;
    cam.position.set(this.pos.x+leanX+this.bobX, this.pos.y+this.eyeH+this.bobY+this.sinkShock+(this.camDip||0), this.pos.z-this.ads*0.18); // ADS 相机前移：靠近瞄具
  }
  _integrate(dt){
    const r=0.3;
    const H=this.crouch>0.5?1.0:1.8;
    // 使用空间索引获取附近碰撞体（性能优化；搜索半径稍大以覆盖移动跨度）
    const nearby=this.game&&this.game.getNearbyColliders?this.game.getNearbyColliders(this.pos.x,this.pos.z,r+2):this.colliders;
    // X
    this.pos.x+=this.vel.x*dt;
    for(const c of nearby){
      if(this._overlap(c,r,H)){
        // 尝试台阶
        const top=c.max.y;
        if(this.onGround&&!this.crouch&&top-this.pos.y<=this.stepHeight&&top-this.pos.y>0.02){
          if(!this._boxAt(this.pos.x,top,this.pos.z,r,H,c)){
            this.pos.y=top; this.onGround=true; this.vel.y=0;
            continue;
          }
        }
        if(c.isBoundary){ const ccx=(c.min.x+c.max.x)/2; this.pos.x=ccx>0?c.min.x-r:c.max.x+r; } // 边界墙：推回地图内侧，防卡进墙
        else if(this.vel.x>0) this.pos.x=c.min.x-r; else if(this.vel.x<0) this.pos.x=c.max.x+r;
        else this.pos.x=(this.pos.x+r-c.min.x)<(c.max.x-(this.pos.x-r))?c.min.x-r:c.max.x+r;
        this.vel.x=0;
      }
    }
    // Z
    this.pos.z+=this.vel.z*dt;
    for(const c of nearby){
      if(this._overlap(c,r,H)){
        const top=c.max.y;
        if(this.onGround&&!this.crouch&&top-this.pos.y<=this.stepHeight&&top-this.pos.y>0.02){
          if(!this._boxAt(this.pos.x,top,this.pos.z,r,H,c)){
            this.pos.y=top; this.onGround=true; this.vel.y=0;
            continue;
          }
        }
        if(c.isBoundary){ const ccz=(c.min.z+c.max.z)/2; this.pos.z=ccz>0?c.min.z-r:c.max.z+r; }
        else if(this.vel.z>0) this.pos.z=c.min.z-r; else if(this.vel.z<0) this.pos.z=c.max.z+r;
        else this.pos.z=(this.pos.z+r-c.min.z)<(c.max.z-(this.pos.z-r))?c.min.z-r:c.max.z+r;
        this.vel.z=0;
      }
    }
    // Y（落地/顶面）
    const pfe=this.pos.y;
    this.pos.y+=this.vel.y*dt;
    for(const c of nearby){
      if(this.pos.x+r>c.min.x&&this.pos.x-r<c.max.x&&this.pos.z+r>c.min.z&&this.pos.z-r<c.max.z){
        if(this.vel.y<=0 && pfe>=c.max.y && this.pos.y<=c.max.y){
          this.pos.y=c.max.y; this.vel.y=0; this.onGround=true;
        } else if(this.vel.y>0 && this.pos.y+H>c.min.y && pfe+H<=c.min.y){
          this.pos.y=c.min.y-H; this.vel.y=0;
        }
      }
    }
    this.pos.y=Math.max(0,this.pos.y);
    // 边界强制约束（地图边缘围墙绝对边界）：无论碰撞如何，玩家绝不可越出地图
    if(this.game&&this.game.applyMapBoundary) this.game.applyMapBoundary(this.pos);
  }
  _boxAt(x,y,z,r,H,skip){
    const list=this.game&&this.game.getNearbyColliders?this.game.getNearbyColliders(x,z,r+2):this.colliders;
    for(const c of list){
      if(c===skip) continue;
      if(x+r>c.min.x&&x-r<c.max.x&&z+r>c.min.z&&z-r<c.max.z&&y<c.max.y&&y+H>c.min.y) return true;
    }
    return false;
  }
  _overlap(c,r,H){
    return this.pos.x+r>c.min.x&&this.pos.x-r<c.max.x&&this.pos.z+r>c.min.z&&this.pos.z-r<c.max.z&&this.pos.y+H>c.min.y&&this.pos.y<c.max.y;
  }
  takeDamage(amount,fromPos){
    if(!this.alive) return;
    this.health-=amount;
    // 动作系统：受击动画（不可打断换弹）
    if(this.game&&this.game.anim) this.game.anim.startOneShot('hit');
    this.game.onPlayerDamaged(fromPos);
    if(this.health<=0){
      this.health=0;
      
      this.alive=false;
      this.game.gameOver();
    }
    this.game.refreshHPUI();
  }
  heal(amount){ this.health=clamp(this.health+amount,0,100); this.game.refreshHPUI(); }
}

/* ============================================================
   武器系统（手枪 + 战术刀 + 枪托锤击）
============================================================ */
class Weapon{
  constructor(game){
    this.game=game;
    this.group=new THREE.Group();
    this.current='pistol';
    this.ammo=15; this.magSize=15;
    this._ammoStore={pistol:15,rifle:30,sks:10,sniper:5,shotgun:6,remington:4,sten:32};
    // 塔科夫硬核：后备弹药（换弹从后备补充，剩余弹匣自动回收；地图弹药箱补给）
    this.reserve={pistol:45,m1911:21,rifle:90,sks:50,sniper:20,shotgun:24,remington:20};
    this._reloadTarget=0; // 本次换弹目标装填数（受后备弹药限制）
    // 使命召唤风格视角摆动（枪械随视角快速移动而滞后）
    this._swayX=0; this._swayY=0;
    this._prevYaw=0; this._prevPitch=0; this._walkPhase=0;
    this._sprintPose=0;
    this.reloading=false; this.reloadTimer=0; this.reloadTotal=1.2;
    this.handsHidden=false; // 第一人称手臂动作系统接管后隐藏程序化手部
    this._gripVec=new THREE.Vector3(); // 复用向量（枪跟随手的位置计算）
    this.tactical=false;
    this._magOutDone=false; this._magInDone=false; this._rackDone=false;
    this.switchAnim=0;
    this.swingAnim=0; this.swingHasHit=false;
    this.stockAnim=0; this.stockHasHit=false;
    this.stockCd=0;
    this.recoilPitch=0; this.recoilYaw=0; this.gunPush=0;
    this._glbLoaded={}; // GLB懒加载标记
    this.autoFiring=false; this.autoFireTimer=0; this.shotsInBurst=0; this.burstTimer=0;
    this.crossRecoil=0; // 新增功能：准心后坐力（单发微跳，连发持续上移）
    this.muzzleLight=null; this.muzzleSprite=null; this.muzzleTimer=0; this.muzzleTotal=0.05;
    this._reloadKick=0;
    this.shells=[];
    this._shellModel=null; // 禁用GLB弹壳模型节省显存
    // 新增功能：武器检视系统（I键）
    this.inspectAnim=0; this.inspectCd=0;
    // 新增功能：步枪卡壳系统
    this.jammed=false; this.jamCd=0; this.clearJamTimer=0;
    // 新增功能：狙击枪系统（射速冷却 / 拉栓音计时）
    this.shotCd=0; this.boltSfxT=-1;
    // ===== 新增功能：配件系统（weapon_loadouts 持久化）=====
    this.loadout=loadWeaponLoadouts();
    this.computed={};
    const compKeys=['pistol','rifle','sks','sniper','shotgun','remington','thompson'];
    if(!HIDE_STEN) compKeys.push('sten');
    for(const key of compKeys) this.computed[key]=computeWeaponStats(key,this.loadout);
    this._armoryParts={}; // 配件模型部件（槽位 → 各配件 mesh group）
    this._sightRefs={};   // 默认铁瞄引用（装配光学镜时隐藏）
    this._buildPistol();
    this._buildKnife();
    this._buildRifle();
    this._buildSKS();
    this._buildSniper();
    this._buildShotgun();
    this._buildThompson();
    if(!HIDE_STEN) this._buildSten(); else { this.stenGroup=new THREE.Group(); this.stenGroup.visible=false; this._stenG=this.stenGroup; this.stenMuzzle=new THREE.Object3D(); this.stenMagSlide=new THREE.Group(); }
    this._buildRemington();
    this._buildMuzzle();
    this._buildAttachmentParts();
    const visKeys=['pistol','rifle','sks','sniper','shotgun','remington','thompson'];
    if(!HIDE_STEN) visKeys.push('sten');
    for(const key of visKeys) this._applyWeaponVisuals(key);
    this.pistolGroup.visible=true; this.knifeGroup.visible=false; this.rifleGroup.visible=false; this.sksGroup.visible=false; this.sniperGroup.visible=false; this.shotgunGroup.visible=false; this.remingtonGroup.visible=false; this.thompsonGroup.visible=false; this.stenGroup.visible=false;
    this.group.add(this.pistolGroup,this.knifeGroup,this.rifleGroup,this.sksGroup,this.sniperGroup,this.shotgunGroup,this.remingtonGroup,this.thompsonGroup); if(!HIDE_STEN) this.group.add(this.stenGroup);
    this._idlePos=new THREE.Vector3(0.35,-0.25,-0.3);
    this._idleRot=new THREE.Euler(0,0,0);
  }
  _metal(){ return new THREE.MeshStandardMaterial({color:0x2a2a2a,metalness:0.85,roughness:0.35}); }
  _wearMetal(){ return new THREE.MeshStandardMaterial({color:0x555555,metalness:0.85,roughness:0.3}); }
  // ---- 配件系统：材质工具 ----
  _pMetal(c,r){ return new THREE.MeshStandardMaterial({color:c,metalness:0.8,roughness:r!==undefined?r:0.3}); }
  _pPlastic(c){ return new THREE.MeshStandardMaterial({color:c,metalness:0,roughness:0.8}); }
  _pRubber(c){ return new THREE.MeshStandardMaterial({color:c,metalness:0,roughness:0.95}); }
  _pLens(c){ return new THREE.MeshStandardMaterial({color:c,transparent:true,opacity:0.55,roughness:0.1,metalness:0.4}); }
  // 当前武器综合属性
  curStats(){ return this.computed[this.current]||this.computed.pistol; }
  // 某武器某槽位当前装配的配件定义
  getAttachment(key,slotId){
    const def=WEAPON_DEFS[key]; if(!def) return null;
    const slot=def.slots.find(s=>s.id===slotId); if(!slot) return null;
    return slot.options.find(o=>o.id===this.loadout[key][slotId])||slot.options[0];
  }
  // 装配配件：更新配置 → 重算属性 → 更新 3D 视觉 → 持久化
  equipAttachment(key,slotId,optId){
    const def=WEAPON_DEFS[key]; if(!def) return;
    const slot=def.slots.find(s=>s.id===slotId); if(!slot) return;
    if(!slot.options.find(o=>o.id===optId)) return;
    if(!this.loadout[key]) this.loadout[key]={};
    this.loadout[key][slotId]=optId;
    this.computed[key]=computeWeaponStats(key,this.loadout);
    this._applyWeaponVisuals(key);
    saveWeaponLoadouts(this.loadout);
    // 当前手持该武器 → 即时刷新弹药/数值
    if(this.current===key){
      this.magSize=this.computed[key].magSize;
      this.ammo=Math.min(this.ammo,this.magSize);
      if(this.game) this.game.refreshAmmoUI();
    }
    if(this.game&&this.game.onLoadoutChanged) this.game.onLoadoutChanged(key);
  }
  // ---- 配件 3D 部件构建（挂在对应武器内层 group 上，默认全部隐藏）----
  _buildAttachmentParts(){
    const parts=this._armoryParts;
    // ---------- 手枪（内层 g，+Z 枪口） ----------
    const pg=this._pistolG; if(pg){
      const P={ scope:{}, muzzle:{}, mag:{} };
      // 瞄准镜：装在套筒上方
      const scopeMount=new THREE.Group();
      const rdBase=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.012,0.035),this._pPlastic(0x333333));
      rdBase.position.set(0,0.065,0.05); scopeMount.add(rdBase);
      const rdTube=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.028,20),this._pPlastic(0x111111));
      rdTube.rotation.x=Math.PI/2; rdTube.position.set(0,0.083,0.05); scopeMount.add(rdTube);
      const rdLens=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.006,20),this._pLens(0x88ccff));
      rdLens.rotation.x=Math.PI/2; rdLens.position.set(0,0.083,0.062); scopeMount.add(rdLens);
      P.scope.reddot=scopeMount;
      // 微型全息镜
      const microG=new THREE.Group();
      const mb=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.025,0.05),this._pPlastic(0x2a2a2a));
      mb.position.set(0,0.075,0.05); microG.add(mb);
      const ml=new THREE.Mesh(new THREE.BoxGeometry(0.038,0.024,0.008),this._pLens(0xaa88ff));
      ml.position.set(0,0.075,0.075); microG.add(ml);
      const solar=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.005,0.03),this._pPlastic(0x1a1a2e));
      solar.position.set(0,0.09,0.05); microG.add(solar);
      P.scope.micro=microG;
      // 枪口：消音器 / 制退器
      const sup=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.1,20),this._pPlastic(0x1a1a1a));
      sup.rotation.x=Math.PI/2; sup.position.set(0,0.028,0.27);
      for(let i=0;i<4;i++){ const ring=new THREE.Mesh(new THREE.TorusGeometry(0.025,0.002,6,16),this._pMetal(0x333333)); ring.rotation.y=Math.PI/2; ring.position.set(0,0.028,0.24+i*0.02); sup.add(ring); }
      const supG=new THREE.Group(); supG.add(sup); P.muzzle.suppressor=supG;
      const brG=new THREE.Group();
      const br=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.04,20),this._pMetal(0x3a3a3a));
      br.rotation.x=Math.PI/2; br.position.set(0,0.028,0.26); brG.add(br);
      for(const sx of [-1,1]){ const slot2=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.02,0.01),this._pPlastic(0x111111)); slot2.position.set(sx*0.016,0.028,0.26); brG.add(slot2); }
      P.muzzle.brake=brG;
      // 弹匣：快速（红三角）/ 扩容（加长+号）
      const quickG=new THREE.Group();
      const tri=new THREE.Mesh(new THREE.ConeGeometry(0.006,0.01,3),new THREE.MeshStandardMaterial({color:0xcc2233,emissive:0x992222,emissiveIntensity:0.4}));
      tri.rotation.z=Math.PI; tri.position.set(0,-0.215,0); quickG.add(tri);
      P.mag.quick=quickG;
      const extG=new THREE.Group();
      const extBody=new THREE.Mesh(new THREE.BoxGeometry(0.031,0.05,0.031),this._pMetal(0x2a2a2a));
      extBody.position.set(0,-0.215,0); extG.add(extBody);
      const plus=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.004,0.004),new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5}));
      plus.position.set(0,-0.215,0.016); extG.add(plus);
      const plus2=new THREE.Mesh(new THREE.BoxGeometry(0.004,0.012,0.004),new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5}));
      plus2.position.set(0,-0.215,0.016); extG.add(plus2);
      P.mag.ext=extG;
      for(const slot in P.scope) if(P.scope[slot]){ P.scope[slot].visible=false; pg.add(P.scope[slot]); }
      for(const slot in P.muzzle) if(P.muzzle[slot]){ P.muzzle[slot].visible=false; pg.add(P.muzzle[slot]); }
      for(const slot in P.mag) if(P.mag[slot]){ P.mag[slot].visible=false; this.magSlide.add(P.mag[slot]); }
      parts.pistol=P;
    }
    // ---------- 突击步枪（g，-Z 枪口） ----------
    const rg=this._rifleG; if(rg){
      const R={ scope:{}, muzzle:{}, mag:{}, grip:{}, stock:{} };
      const railTop=0.115;
      // 瞄准镜（装在机匣顶部导轨）
      const rdG=new THREE.Group();
      const rb=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.015,0.04),this._pPlastic(0x333333));
      rb.position.set(0,railTop,-0.15); rdG.add(rb);
      const rt=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.05,20),this._pPlastic(0x111111));
      rt.rotation.x=Math.PI/2; rt.position.set(0,railTop+0.02,-0.15); rdG.add(rt);
      const rl=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.006,20),this._pLens(0x88ccff));
      rl.rotation.x=Math.PI/2; rl.position.set(0,railTop+0.02,-0.125); rdG.add(rl);
      R.scope.reddot=rdG;
      const holoG=new THREE.Group();
      const hb=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.02,0.035),this._pPlastic(0x222222));
      hb.position.set(0,railTop+0.015,-0.15); holoG.add(hb);
      const hl=new THREE.Mesh(new THREE.BoxGeometry(0.048,0.018,0.006),this._pLens(0xaa88ff));
      hl.position.set(0,railTop+0.015,-0.13); holoG.add(hl);
      const knob=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.008,10),this._pMetal(0x444444));
      knob.position.set(0,railTop+0.032,-0.15); holoG.add(knob);
      R.scope.holo=holoG;
      // 2倍镜：细长圆柱
      const twoG=new THREE.Group();
      const tbody=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.07,20),this._pPlastic(0x111111));
      tbody.rotation.x=Math.PI/2; tbody.position.set(0,railTop+0.025,-0.14); twoG.add(tbody);
      const tf=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.006,20),this._pLens(0x88ccff));
      tf.rotation.x=Math.PI/2; tf.position.set(0,railTop+0.025,-0.105); twoG.add(tf);
      const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.006,20),this._pLens(0x4466aa));
      tr.rotation.x=Math.PI/2; tr.position.set(0,railTop+0.025,-0.175); twoG.add(tr);
      for(const z of [-0.13,-0.15]){ const ring=new THREE.Mesh(new THREE.TorusGeometry(0.026,0.003,6,16),this._pMetal(0x333333)); ring.rotation.y=Math.PI/2; ring.position.set(0,railTop+0.025,z); twoG.add(ring); }
      R.scope.scope2x=twoG;
      // 4倍镜：粗长圆柱
      const fourG=new THREE.Group();
      const fbody=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.1,20),this._pPlastic(0x111111));
      fbody.rotation.x=Math.PI/2; fbody.position.set(0,railTop+0.035,-0.14); fourG.add(fbody);
      const ff=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.006,20),this._pLens(0x9966ff));
      ff.rotation.x=Math.PI/2; ff.position.set(0,railTop+0.035,-0.09); fourG.add(ff);
      const fr=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.006,20),this._pLens(0xaa88ff));
      fr.rotation.x=Math.PI/2; fr.position.set(0,railTop+0.035,-0.19); fourG.add(fr);
      const fknob=new THREE.Mesh(new THREE.CylinderGeometry(0.007,0.007,0.01,10),this._pMetal(0x444444));
      fknob.position.set(0,railTop+0.05,-0.14); fourG.add(fknob);
      for(let i=0;i<5;i++){ const groove=new THREE.Mesh(new THREE.TorusGeometry(0.036,0.002,6,16),this._pMetal(0x333333)); groove.rotation.y=Math.PI/2; groove.position.set(0,railTop+0.035,-0.1-i*0.012); fourG.add(groove); }
      R.scope.scope4x=fourG;
      // 枪口：消音器 / 补偿器 / 制退器
      const supG=new THREE.Group();
      const sup=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.18,20),this._pPlastic(0x1a1a1a));
      sup.rotation.x=Math.PI/2; sup.position.set(0,0.055,-0.62); supG.add(sup);
      for(let i=0;i<8;i++){ const groove=new THREE.Mesh(new THREE.TorusGeometry(0.031,0.002,6,16),this._pPlastic(0x2a2a2a)); groove.rotation.y=Math.PI/2; groove.position.set(0,0.055,-0.545-i*0.02); supG.add(groove); }
      R.muzzle.suppressor=supG;
      const compG=new THREE.Group();
      const comp=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.05,20),this._pMetal(0x3a3a3a));
      comp.rotation.x=Math.PI/2; comp.position.set(0,0.055,-0.60); compG.add(comp);
      for(const sx of [-1,1]){ const vent=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.014,0.02),this._pPlastic(0x111111)); vent.position.set(sx*0.02,0.055,-0.60); compG.add(vent); }
      R.muzzle.compensator=compG;
      const brG=new THREE.Group();
      const br=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.045,20),this._pMetal(0x3a3a3a));
      br.rotation.x=Math.PI/2; br.position.set(0,0.055,-0.60); brG.add(br);
      const mid=new THREE.Mesh(new THREE.TorusGeometry(0.026,0.004,6,16),this._pMetal(0x333333));
      mid.rotation.y=Math.PI/2; mid.position.set(0,0.055,-0.588); brG.add(mid);
      for(const sx of [-1,1]){ const vent=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.016,0.02),this._pPlastic(0x111111)); vent.position.set(sx*0.02,0.055,-0.60); brG.add(vent); }
      R.muzzle.brake=brG;
      // 弹匣：快速（红环）/ 扩容（+号，弹匣加长用 scale）
      const quickG=new THREE.Group();
      const ring=new THREE.Mesh(new THREE.TorusGeometry(0.012,0.003,8,16),new THREE.MeshStandardMaterial({color:0xcc2233,emissive:0x992222,emissiveIntensity:0.4}));
      ring.position.set(0,-0.20,-0.10); quickG.add(ring);
      R.mag.quick=quickG;
      const extG=new THREE.Group();
      const plusA=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.004,0.004),new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5}));
      plusA.position.set(0,-0.235,-0.115); extG.add(plusA);
      const plusB=new THREE.Mesh(new THREE.BoxGeometry(0.004,0.014,0.004),new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5}));
      plusB.position.set(0,-0.235,-0.115); extG.add(plusB);
      R.mag.ext=extG;
      // 握把（前握把位置，护木下方）
      const vertG=new THREE.Group();
      const vb=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.08,0.025),this._pPlastic(0x111111));
      vb.position.set(0,-0.075,-0.30); vertG.add(vb);
      const vgrip=new THREE.Mesh(new THREE.BoxGeometry(0.027,0.02,0.027),this._pRubber(0x0a0a0a));
      vgrip.position.set(0,-0.115,-0.30); vertG.add(vgrip);
      R.grip.vertical=vertG;
      const angG=new THREE.Group();
      const ab=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.05,0.025),this._pPlastic(0x111111));
      ab.position.set(0,-0.06,-0.30); ab.rotation.x=0.35; angG.add(ab);
      R.grip.angled=angG;
      const lightG=new THREE.Group();
      const lb=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.07,0.02),this._pPlastic(0x222222));
      lb.position.set(0,-0.07,-0.30); lightG.add(lb);
      for(let i=0;i<3;i++){ const hole=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,0.02,8),this._pPlastic(0x0a0a0a)); hole.rotation.x=Math.PI/2; hole.position.set(0,-0.055-i*0.02,-0.30); lightG.add(hole); }
      R.grip.light=lightG;
      // 枪托：轻量（镂空骨架）/ 稳定（加厚+托腮）
      const lstockG=new THREE.Group();
      const lframe=new THREE.Mesh(new THREE.BoxGeometry(0.028,0.05,0.15),this._pPlastic(0x181818));
      lframe.position.set(0,0.06,0.30); lstockG.add(lframe);
      const lpad=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.055,0.015),this._pRubber(0x0a0a0a));
      lpad.position.set(0,0.055,0.385); lstockG.add(lpad);
      R.stock.light=lstockG;
      const sstockG=new THREE.Group();
      const sbody=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.07,0.18),this._pPlastic(0x2d3d2d));
      sbody.position.set(0,0.065,0.30); sstockG.add(sbody);
      const cheek=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.02,0.09),this._pPlastic(0x2d3d2d));
      cheek.position.set(0,0.105,0.27); sstockG.add(cheek);
      const spad=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.075,0.02),this._pRubber(0x0a0a0a));
      spad.position.set(0,0.06,0.40); sstockG.add(spad);
      R.stock.stable=sstockG;
      for(const slot in R.scope) if(R.scope[slot]){ R.scope[slot].visible=false; rg.add(R.scope[slot]); }
      for(const slot in R.muzzle) if(R.muzzle[slot]){ R.muzzle[slot].visible=false; rg.add(R.muzzle[slot]); }
      for(const slot in R.mag) if(R.mag[slot]){ R.mag[slot].visible=false; this.rifleMagSlide.add(R.mag[slot]); }
      for(const slot in R.grip) if(R.grip[slot]){ R.grip[slot].visible=false; rg.add(R.grip[slot]); }
      for(const slot in R.stock) if(R.stock[slot]){ R.stock[slot].visible=false; rg.add(R.stock[slot]); }
      parts.rifle=R;
    }
    // ---------- 狙击步枪（M24，GLB裸枪 + 程序化配件，无铁瞄） ----------
    const sng=this._sniperG; if(sng){
      const S={ scope:{}, muzzle:{}, mag:{}, stock:{} };
      const scopeY=0.16;
      // 6倍镜
      const sixG=new THREE.Group();
      const sb=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.15,20),this._pPlastic(0x111111));
      sb.rotation.x=Math.PI/2; sb.position.set(0,scopeY,0); sixG.add(sb);
      const sf=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.006,20),this._pLens(0x6644cc));
      sf.rotation.x=Math.PI/2; sf.position.set(0,scopeY,-0.075); sixG.add(sf);
      const sr2=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.006,20),this._pLens(0x7755dd));
      sr2.rotation.x=Math.PI/2; sr2.position.set(0,scopeY,0.075); sixG.add(sr2);
      for(const z of[-0.05,0.05]){ const ring=new THREE.Mesh(new THREE.TorusGeometry(0.036,0.003,6,16),this._pMetal(0x333333)); ring.rotation.y=Math.PI/2; ring.position.set(0,scopeY,z); sixG.add(ring); }
      S.scope.scope6x=sixG;
      // 8倍镜
      const eightG=new THREE.Group();
      const eb=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.18,20),this._pPlastic(0x111111));
      eb.rotation.x=Math.PI/2; eb.position.set(0,scopeY,0); eightG.add(eb);
      const shade=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.05,20,1,true),this._pPlastic(0x0a0a0a));
      shade.rotation.x=-Math.PI/2; shade.position.set(0,scopeY,-0.115); eightG.add(shade);
      const eyecup=new THREE.Mesh(new THREE.TorusGeometry(0.048,0.006,8,20),this._pRubber(0x0a0a0a));
      eyecup.rotation.y=Math.PI/2; eyecup.position.set(0,scopeY,0.095); eightG.add(eyecup);
      const ef=new THREE.Mesh(new THREE.CylinderGeometry(0.036,0.036,0.006,20),this._pLens(0x5533aa));
      ef.rotation.x=Math.PI/2; ef.position.set(0,scopeY,-0.09); eightG.add(ef);
      const er=new THREE.Mesh(new THREE.CylinderGeometry(0.034,0.034,0.006,20),this._pLens(0x5533aa));
      er.rotation.x=Math.PI/2; er.position.set(0,scopeY,0.09); eightG.add(er);
      S.scope.scope8x=eightG;
      // 枪口
      const supG=new THREE.Group();
      const sup=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.25,20),this._pPlastic(0x1a1a1a));
      sup.rotation.x=Math.PI/2; sup.position.set(0,0.055,-0.85); supG.add(sup);
      for(let i=0;i<10;i++){ const groove=new THREE.Mesh(new THREE.TorusGeometry(0.036,0.002,6,16),this._pPlastic(0x2a2a2a)); groove.rotation.y=Math.PI/2; groove.position.set(0,0.055,-0.74-i*0.02); supG.add(groove); }
      S.muzzle.suppressor=supG;
      const brG=new THREE.Group();
      const br=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.08,20),this._pMetal(0x3a3a3a));
      br.rotation.x=Math.PI/2; br.position.set(0,0.055,-0.80); brG.add(br);
      for(const sx of[-1,1]){ const vent=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.03,0.03),this._pPlastic(0x111111)); vent.position.set(sx*0.02,0.055,-0.80); brG.add(vent); }
      const topV=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.006,0.02),this._pPlastic(0x111111)); topV.position.set(0,0.07,-0.80); brG.add(topV);
      S.muzzle.brake=brG;
      // 弹匣
      const quickG=new THREE.Group();
      const cdot=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.003,10),new THREE.MeshStandardMaterial({color:0xcc2233,emissive:0x992222,emissiveIntensity:0.4}));
      cdot.position.set(0,-0.095,0); quickG.add(cdot);
      S.mag.quick=quickG;
      const extG=new THREE.Group();
      const extBody=new THREE.Mesh(new THREE.BoxGeometry(0.032,0.04,0.042),this._pMetal(0x2a2a2a));
      extBody.position.set(0,-0.095,0); extG.add(extBody);
      const plusA=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.004,0.004),new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5}));
      plusA.position.set(0,-0.095,0.022); extG.add(plusA);
      const plusB=new THREE.Mesh(new THREE.BoxGeometry(0.004,0.014,0.004),new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5}));
      plusB.position.set(0,-0.095,0.022); extG.add(plusB);
      S.mag.ext=extG;
      // 枪托
      const lightG=new THREE.Group();
      const lf=new THREE.Mesh(new THREE.BoxGeometry(0.028,0.06,0.25),this._pPlastic(0x181818));
      lf.position.set(0,0.03,0.35); lightG.add(lf);
      const lp=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.065,0.02),this._pRubber(0x0a0a0a));
      lp.position.set(0,0.025,0.48); lightG.add(lp);
      S.stock.light=lightG;
      const stableG=new THREE.Group();
      const sb2=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.1,0.28),this._pPlastic(0x2d3d2d));
      sb2.position.set(0,0.05,0.35); stableG.add(sb2);
      const sp=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.11,0.025),this._pRubber(0x0a0a0a));
      sp.position.set(0,0.05,0.49); stableG.add(sp);
      S.stock.stable=stableG;
      for(const slot in S.scope) if(S.scope[slot]){ S.scope[slot].visible=false; sng.add(S.scope[slot]); }
      for(const slot in S.muzzle) if(S.muzzle[slot]){ S.muzzle[slot].visible=false; sng.add(S.muzzle[slot]); }
      for(const slot in S.mag) if(S.mag[slot]){ S.mag[slot].visible=false; this.sniperMagSlide.add(S.mag[slot]); }
      for(const slot in S.stock) if(S.stock[slot]){ S.stock[slot].visible=false; sng.add(S.stock[slot]); }
      parts.sniper=S;
    }
    // ---------- 散弹枪（内层 g，+Z 枪口） ----------
    const shg=this._shotgunG; if(shg){
      const SG={ scope:{}, muzzle:{}, mag:{} };
      // 瞄准镜（机匣顶部）
      const rdG=new THREE.Group();
      const rb=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.015,0.04),this._pPlastic(0x333333));
      rb.position.set(0,0.095,-0.1); rdG.add(rb);
      const rt=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.05,20),this._pPlastic(0x111111));
      rt.rotation.x=Math.PI/2; rt.position.set(0,0.115,-0.1); rdG.add(rt);
      const rl=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.006,20),this._pLens(0x88ccff));
      rl.rotation.x=Math.PI/2; rl.position.set(0,0.115,-0.075); rdG.add(rl);
      SG.scope.reddot=rdG;
      const holoG=new THREE.Group();
      const hb=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.02,0.04),this._pPlastic(0x222222));
      hb.position.set(0,0.11,-0.1); holoG.add(hb);
      const hl=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.018,0.006),this._pLens(0xaa88ff));
      hl.position.set(0,0.11,-0.08); holoG.add(hl);
      SG.scope.holo=holoG;
      // 枪口：收束器 / 消音器 / 制退器
      const chokeG=new THREE.Group();
      const choke=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.02,0.06,16),this._pMetal(0x3a3a3a));
      choke.rotation.x=Math.PI/2; choke.position.set(0,0.02,0.53); chokeG.add(choke);
      SG.muzzle.choke=chokeG;
      const supG=new THREE.Group();
      const sup=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.2,20),this._pPlastic(0x1a1a1a));
      sup.rotation.x=Math.PI/2; sup.position.set(0,0.02,0.56); supG.add(sup);
      for(let i=0;i<8;i++){ const groove=new THREE.Mesh(new THREE.TorusGeometry(0.041,0.002,6,16),this._pPlastic(0x2a2a2a)); groove.rotation.y=Math.PI/2; groove.position.set(0,0.02,0.47+i*0.02); supG.add(groove); }
      SG.muzzle.suppressor=supG;
      const brG=new THREE.Group();
      const br=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.06,20),this._pMetal(0x3a3a3a));
      br.rotation.x=Math.PI/2; br.position.set(0,0.02,0.52); brG.add(br);
      for(let i=0;i<4;i++){ const a=i*Math.PI/2; const vent=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.02,0.012),this._pPlastic(0x111111)); vent.position.set(Math.cos(a)*0.026,0.02,0.52); vent.rotation.y=-a; brG.add(vent); }
      SG.muzzle.brake=brG;
      // 弹仓：快速（装弹口）/ 扩容（加长）
      const quickG=new THREE.Group();
      const port=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.02,0.03),this._pMetal(0x3a3a3a));
      port.position.set(0,-0.015,0.05); quickG.add(port);
      SG.mag.quick=quickG;
      const extG=new THREE.Group();
      const ext=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.3,20),this._pMetal(0x2f2f2f));
      ext.rotation.x=Math.PI/2; ext.position.set(0,-0.015,0.18); extG.add(ext);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.02,16),this._pMetal(0x333333));
      cap.rotation.x=Math.PI/2; cap.position.set(0,-0.015,0.33); extG.add(cap);
      SG.mag.ext=extG;
      for(const slot in SG.scope) if(SG.scope[slot]){ SG.scope[slot].visible=false; shg.add(SG.scope[slot]); }
      for(const slot in SG.muzzle) if(SG.muzzle[slot]){ SG.muzzle[slot].visible=false; shg.add(SG.muzzle[slot]); }
      for(const slot in SG.mag) if(SG.mag[slot]){ SG.mag[slot].visible=false; shg.add(SG.mag[slot]); }
      parts.shotgun=SG;
    }
    // ---------- 雷明顿1100（内层 g，+Z 枪口） ----------
    const rmg=this._remingtonG; if(rmg){
      const RM={ scope:{}, muzzle:{}, mag:{} };
      // 瞄准镜（机匣顶部）
      const rdG=new THREE.Group();
      rdG.position.set(0,0.02,0.12); // 红点前移(z0.12)+微调(y0.02)
      const rb=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.015,0.04),this._pPlastic(0x333333));
      rb.position.set(0,0.095,-0.1); rdG.add(rb);
      const rt=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.05,20),this._pPlastic(0x111111));
      rt.rotation.x=Math.PI/2; rt.position.set(0,0.115,-0.1); rdG.add(rt);
      const rl=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.006,20),this._pLens(0x88ccff));
      rl.rotation.x=Math.PI/2; rl.position.set(0,0.115,-0.075); rdG.add(rl);
      RM.scope.reddot=rdG;
      const holoG=new THREE.Group();
      const hb=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.02,0.04),this._pPlastic(0x222222));
      hb.position.set(0,0.11,-0.1); holoG.add(hb);
      const hl=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.018,0.006),this._pLens(0xaa88ff));
      hl.position.set(0,0.11,-0.08); holoG.add(hl);
      RM.scope.holo=holoG;
      // 枪口：收束器 / 消音器 / 制退器
      const chokeG=new THREE.Group();
      const choke=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.02,0.06,16),this._pMetal(0x3a3a3a));
      choke.rotation.x=Math.PI/2; choke.position.set(0,0.02,0.53); chokeG.add(choke);
      RM.muzzle.choke=chokeG;
      const supG=new THREE.Group();
      const sup=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.2,20),this._pPlastic(0x1a1a1a));
      sup.rotation.x=Math.PI/2; sup.position.set(0,0.02,0.56); supG.add(sup);
      for(let i=0;i<8;i++){ const groove=new THREE.Mesh(new THREE.TorusGeometry(0.041,0.002,6,16),this._pPlastic(0x2a2a2a)); groove.rotation.y=Math.PI/2; groove.position.set(0,0.02,0.47+i*0.02); supG.add(groove); }
      RM.muzzle.suppressor=supG;
      const brG=new THREE.Group();
      const br=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.06,20),this._pMetal(0x3a3a3a));
      br.rotation.x=Math.PI/2; br.position.set(0,0.02,0.52); brG.add(br);
      for(let i=0;i<4;i++){ const a=i*Math.PI/2; const vent=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.02,0.012),this._pPlastic(0x111111)); vent.position.set(Math.cos(a)*0.026,0.02,0.52); vent.rotation.y=-a; brG.add(vent); }
      RM.muzzle.brake=brG;
      // 弹仓
      const quickG=new THREE.Group();
      const port=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.02,0.03),this._pMetal(0x3a3a3a));
      port.position.set(0,-0.015,0.05); quickG.add(port);
      RM.mag.quick=quickG;
      const extG=new THREE.Group();
      const ext=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.3,20),this._pMetal(0x2f2f2f));
      ext.rotation.x=Math.PI/2; ext.position.set(0,-0.015,0.18); extG.add(ext);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.02,16),this._pMetal(0x333333));
      cap.rotation.x=Math.PI/2; cap.position.set(0,-0.015,0.33); extG.add(cap);
      RM.mag.ext=extG;
      for(const slot in RM.scope) if(RM.scope[slot]){ RM.scope[slot].visible=false; rmg.add(RM.scope[slot]); }
      for(const slot in RM.muzzle) if(RM.muzzle[slot]){ RM.muzzle[slot].visible=false; rmg.add(RM.muzzle[slot]); }
      for(const slot in RM.mag) if(RM.mag[slot]){ RM.mag[slot].visible=false; rmg.add(RM.mag[slot]); }
      parts.remington=RM;
    }
    // 弹匣扩容：步枪/狙击弹匣通过 scale 加长（在 apply 中处理）
  }
  // 应用某武器的配件视觉（显示/隐藏对应部件，隐藏被光学镜替代的铁瞄）
  _applyWeaponVisuals(key){
    // 瞄具偏移（在所有武器都适用，不依赖_armoryParts）
    const sel_=this.loadout[key]||{};
    const hasOptical_=['reddot','micro','holo','scope2x','scope4x','scope6x','scope8x'].includes(sel_.scope);
    if(key==='rifle'&&this._rifleWrap&&this._rifleWrapBaseY!==undefined){
      this._rifleWrap.position.y=this._rifleWrapBaseY+(hasOptical_?-0.02:0);
    }
    if(key==='thompson'&&this._thompsonWrap&&this._thompsonWrapBaseY!==undefined){
      this._thompsonWrap.position.y=this._thompsonWrapBaseY+(hasOptical_?-0.5:-0.5);
    }
    if(key==='sten'&&this._stenWrap&&this._stenWrapBaseY!==undefined){
      this._stenWrap.position.y=this._stenWrapBaseY+(hasOptical_?-0.5:-0.5);
    }
    if(key==='sniper'&&this._sniperWrap&&this._sniperWrapBaseY!==undefined){
      const adsNow=this.game&&this.game.player?this.game.player.ads:0;
      this._sniperWrap.position.y=this._sniperWrapBaseY+(hasOptical_&&adsNow>0.5?-0.08:0);
    }
    const parts=this._armoryParts[key]; if(!parts) return;
    const sel=this.loadout[key]||{};
    const def=WEAPON_DEFS[key]; if(!def) return;
    for(const slot of def.slots){
      const cur=(parts[slot.id]||{})[sel[slot.id]];
      for(const opt of slot.options){
        const g=(parts[slot.id]||{})[opt.id];
        if(g) g.visible=!!cur&&(opt.id===sel[slot.id]);
      }
    }
    // 光学镜 → 隐藏默认铁瞄
    const hasOptical=['reddot','micro','holo','scope2x','scope4x','scope6x','scope8x'].includes(sel.scope);
    const sights=this._sightRefs[key];
    if(sights){
      for(const m of sights){ if(m) m.visible=!hasOptical; }
    }
    // 扩容弹匣：步枪/狙击弹匣加长
    if(key==='rifle'&&this.rifleMagSlide){
      const magMesh=this.rifleMagSlide.children.find(c=>c.isMesh);
      if(magMesh) magMesh.scale.set(1, sel.mag==='ext'?1.5:1, sel.mag==='ext'?1.15:0.88);
    }
    if(key==='sniper'&&this.sniperMagSlide){
      const magMesh=this.sniperMagSlide.children.find(c=>c.isMesh);
      if(magMesh) magMesh.scale.y=sel.mag==='ext'?1.5:1;
    }
  }
  // 开镜时隐藏高倍镜模型（scopeOverlay 替代镜内画面）
  _scopeModelsHidden(){
    const sc=this.curStats();
    return ['reddot','micro','holo','scope2x','scope4x','scope6x','scope8x'].includes(sc.scopeType)&&this.game&&this.game.player&&this.game.player.ads>0.5;
  }
  // 新增功能：玩家手部建模（握拳手型：手掌+指节+拇指+护腕）
  _makeFist(){
    // 玩家手部 + 完整前臂（FPS 视角避免"断手"漂浮）
    const g=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:0x8f7357,roughness:0.9});
    const glove=new THREE.MeshStandardMaterial({color:0x33372f,roughness:0.85});
    const sleeve=new THREE.MeshStandardMaterial({color:0x3d4a2e,roughness:0.95}); // 军绿袖子
    const palm=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.08,0.05),skin);
    g.add(palm);
    const fist=new THREE.Mesh(new THREE.BoxGeometry(0.046,0.05,0.045),skin);
    fist.position.set(0,0.035,0.04); g.add(fist);
    const knuckle=new THREE.Mesh(new THREE.BoxGeometry(0.046,0.02,0.05),skin);
    knuckle.position.set(0,0.06,0.035); g.add(knuckle);
    const thumb=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.05,0.035),skin);
    thumb.position.set(0.033,0,0); thumb.rotation.z=-0.3; g.add(thumb);
    // 手腕（手套袖口）
    const wrist=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.036,0.09,32),glove);
    wrist.position.y=-0.085; g.add(wrist);
    // 前臂（袖子，向下延伸出屏幕，避免断手）
    const forearm=new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.052,0.32,24),sleeve);
    forearm.position.y=-0.30; forearm.rotation.x=0.12; g.add(forearm);
    // 袖口（分隔手套与前臂）
    const cuff=new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.046,0.06,24),glove);
    cuff.position.y=-0.15; g.add(cuff);
    g.userData.isHand=true; // 标记为手部模型（武器库预览场景隐藏，不影响游戏内持枪视角）
    return g;
  }
  // 新增功能：手枪精细化重建模 + 机械瞄准具（铁瞄）
  _buildPistol(){
    // G18全自动手枪（GLB模型加载，程序化建模兜底）
    const g=new THREE.Group();
    const metal=this._metal();
    const wear=this._wearMetal();
    const dark=new THREE.MeshStandardMaterial({color:0x0c0c0c,metalness:0.7,roughness:0.45});
    const slideMat=new THREE.MeshStandardMaterial({color:0x1c1c1e,metalness:0.9,roughness:0.3});
    const polymerMat=new THREE.MeshStandardMaterial({map:this.game.tex.grip,color:0x1a1a1a,roughness:0.75,metalness:0.1});
    // ---- 套筒（Glock：方正、前端斜切、后部两侧防滑槽）----
    const slide=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.052,0.30),slideMat);
    slide.position.set(0,0.038,0.01); g.add(slide);
    // 套筒前端斜切（Glock 前端板向上收）
    const nose=new THREE.Mesh(new THREE.BoxGeometry(0.064,0.048,0.05),slideMat);
    nose.position.set(0,0.042,0.16); nose.rotation.x=-0.35; g.add(nose);
    // 套筒后部两侧防滑槽（Glock recoil serrations）
    for(const sx of [-1,1]){
      for(let i=0;i<4;i++){
        const serr=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.012,0.012),wear);
        serr.position.set(0.032*sx,0.058,-0.06-i*0.014); serr.rotation.z=0.45*sx; g.add(serr);
      }
    }
    // 抛壳窗（右侧）
    const port=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.032,0.09),dark);
    port.position.set(0.035,0.05,0.07); g.add(port);
    // 枪管（套筒前伸出）+ 枪口（突出更长，枪管明显在握把前方）
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.08,32),metal);
    barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.028,0.215); g.add(barrel);
    const muzzleRing=new THREE.Mesh(new THREE.TorusGeometry(0.02,0.004,6,14),dark);
    muzzleRing.rotation.y=Math.PI/2; muzzleRing.position.set(0,0.028,0.25); g.add(muzzleRing);
    // ---- 枪身框架 + 扳机护圈 + 扳机 ----
    const frame=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.13),polymerMat);
    frame.position.set(0,-0.005,-0.06); g.add(frame);
    const guard=new THREE.Mesh(new THREE.TorusGeometry(0.032,0.005,6,14,Math.PI*1.5),metal);
    guard.position.set(0,-0.028,-0.03); guard.rotation.z=0.4; g.add(guard);
    const trigger=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.018,0.006),metal);
    trigger.position.set(0,-0.016,-0.02); g.add(trigger);
    // 滑套卡笋（握把上方枪身侧面，Glock 特征）
    for(const sx of [-1,1]){
      const stop=new THREE.Mesh(new THREE.BoxGeometry(0.004,0.03,0.012),dark);
      stop.position.set(0.026*sx,-0.02,-0.02); g.add(stop);
    }
    // ---- 聚合物握把（Glock：直握把 + 底部加宽，与弹匣重叠，握把-枪管夹角105°）----
    const grip=new THREE.Mesh(new THREE.BoxGeometry(0.036,0.09,0.05),polymerMat);
    grip.position.set(0,-0.075,-0.145); grip.rotation.x=0.35; g.add(grip);
    const gripButt=new THREE.Mesh(new THREE.BoxGeometry(0.036,0.03,0.05),polymerMat);
    gripButt.position.set(0,-0.135,-0.16); gripButt.rotation.x=0.35; g.add(gripButt);
    for(let i=0;i<3;i++){
      const gs=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.008,0.004),dark);
      gs.position.set(0,-0.08-i*0.025,-0.158); gs.rotation.x=0.35; g.add(gs);
    }
    // ---- 弹匣（Glock 弹匣在握把内，底部露出 + 底板，可滑动换弹）----
    this.magSlide=new THREE.Group();
    const mag=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.11,0.03),metal);
    mag.position.set(0,-0.13,0); this.magSlide.add(mag);
    const magBase=new THREE.Mesh(new THREE.BoxGeometry(0.033,0.014,0.033),dark);
    magBase.position.set(0,-0.19,0); this.magSlide.add(magBase);
    const indicator=new THREE.Mesh(new THREE.SphereGeometry(0.007,48,48),
      new THREE.MeshStandardMaterial({color:0xff3300,emissive:0xff2200,emissiveIntensity:0.9}));
    indicator.position.set(0,-0.20,0); this.magSlide.add(indicator);
    this.magSlide.position.set(0,0,-0.145);
    this.magSlide.rotation.x=0.35; // 弹匣与握把同角度重叠
    g.add(this.magSlide);
    // ---- 机械瞄准具（前准星顶端 y=0.10 对准准心；后照门缺口式在套筒后部）----
    const front=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.04,0.012),dark);
    front.position.set(0,0.08,0.10); g.add(front);
    const rearBase=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.014,0.016),dark);
    rearBase.position.set(0,0.07,-0.12); g.add(rearBase);
    const rearPts=[];
    for(const sx of [-1,1]){
      const rp=new THREE.Mesh(new THREE.BoxGeometry(0.005,0.014,0.012),dark);
      rp.position.set(0.011*sx,0.08,-0.12); g.add(rp); rearPts.push(rp);
    }
    this._sightRefs.pistol=[front,rearBase,...rearPts];
    // 玩家双手——右手握握把（弹匣位置），左手托弹匣井/扳机护圈（不在枪管前方）
    const RH=this._makeFist();
    RH.position.set(0.015,-0.06,-0.13);
    RH.rotation.x=0.35; RH.rotation.z=0.1;
    g.add(RH);
    const LH=this._makeFist();
    LH.position.set(0.03,-0.03,-0.05);
    LH.rotation.x=-0.4; LH.rotation.z=-0.15;
    LH.scale.setScalar(0.85);
    g.add(LH);
    // ---- 朝向：模型局部 +Z 是枪口，相机前方是 -Z ----
    // 新增功能：独立的“模型层”旋转 180°，避免被 update() 的姿态 rotation.copy 覆盖
    const model=new THREE.Group();
    model.rotation.y=Math.PI;
    model.add(g);
    const outer=new THREE.Group();
    outer.add(model);
    this.pistolGroup=outer;
    this._pistolG=g;
    this.pistolMuzzle=new THREE.Object3D(); this.pistolMuzzle.position.set(0,0.028,0.24);
    g.add(this.pistolMuzzle);

    // 异步加载G18 GLB（纹理自动压缩256×256），替换程序化兜底
    this._loadGLB('models/Glock+21-S1.glb', (gltf)=>{
      const g18Model=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      g18Model.updateMatrixWorld();
      const box=new THREE.Box3(); g18Model.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld)); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const sz=box.getSize(new THREE.Vector3());
      const targetLen=0.5;
      const s=targetLen/Math.max(sz.x,sz.y,sz.z);
      const wrap=new THREE.Group();
      wrap.rotation.y=-Math.PI/2; // -X枪管→+Z（model层PI翻转后→-Z相机前方）
      wrap.rotation.x=0.0; // 枪托与枪口同高
      wrap.scale.setScalar(s);
      wrap.position.set(-center.z*s, -center.y*s-0.09, center.x*s+0.17);
      wrap.add(g18Model);
      g.add(wrap);
      // 弹匣滑动组（空组，配件弹匣挂载于此）
      this.magSlide=new THREE.Group();
      this.magSlide.position.set(0,0,-0.145);
      this.magSlide.rotation.x=0.35;
      g.add(this.magSlide);
      // GLB自带铁瞄，无程序化准心
      this._sightRefs.pistol=[];
      // 手部
      const RH2=this._makeFist();
      RH2.position.set(0.015,-0.06,-0.13); RH2.rotation.x=0.35; RH2.rotation.z=0.1; g.add(RH2);
      const LH2=this._makeFist();
      LH2.position.set(0.03,-0.03,-0.05); LH2.rotation.x=-0.4; LH2.rotation.z=-0.15; LH2.scale.setScalar(0.85); g.add(LH2);
      if(this.game&&this.game._wpWeaponKey==='pistol'){ this.game._hideWeaponHands(g); }
      // 枪口
      this.pistolMuzzle=new THREE.Object3D(); this.pistolMuzzle.position.set(0,0.028,0.24);
      g.add(this.pistolMuzzle);
      // 配件模型
      if(this._armoryParts&&this._armoryParts.pistol){
        const P=this._armoryParts.pistol;
        for(const slot in P.scope) if(P.scope[slot]){ P.scope[slot].visible=false; g.add(P.scope[slot]); }
        for(const slot in P.muzzle) if(P.muzzle[slot]){ P.muzzle[slot].visible=false; g.add(P.muzzle[slot]); }
        for(const slot in P.mag) if(P.mag[slot]){ P.mag[slot].visible=false; this.magSlide.add(P.mag[slot]); }
        this._applyWeaponVisuals('pistol');
      }
      console.log('? G18手枪GLB加载成功（纹理已压缩至256×256）');
    }, undefined, (err)=>{
      console.warn('?? G18模型加载失败，使用程序化占位几何体:', err);
    });
  }
  _buildKnife(){
    // CS 1.6 默认匕首：宽单刃 + 上翘刀尖 + 刀背锯齿 + 黑色聚合物刀柄
    const g=new THREE.Group();
    const bladeMat=new THREE.MeshStandardMaterial({color:0xc8c8c8,metalness:0.95,roughness:0.18});
    const bladeDark=new THREE.MeshStandardMaterial({color:0x8a8a8a,metalness:0.9,roughness:0.3});
    // 刀身：宽扁长方体 + 上端收窄成刀尖 + 刀尖上翘（CS 默认刀特征）
    const bladeGeo=new THREE.BoxGeometry(0.03,0.26,0.055);
    const pos=bladeGeo.attributes.position;
    for(let i=0;i<pos.count;i++){
      const y=pos.getY(i);
      if(y>0.02){
        const t=(y-0.02)/0.13;
        const s=1-0.9*t;
        pos.setX(i,pos.getX(i)*s);
        // 刀尖上翘：越靠刀尖 Z 越向后偏
        pos.setZ(i,pos.getZ(i)*s + 0.045*t);
      }
    }
    bladeGeo.computeVertexNormals();
    const blade=new THREE.Mesh(bladeGeo,bladeMat);
    blade.position.y=0.2; g.add(blade);
    // 刃口高光细条（暗示单侧开刃）
    const edge=new THREE.Mesh(new THREE.BoxGeometry(0.028,0.22,0.004),
      new THREE.MeshStandardMaterial({color:0xeaeaea,metalness:0.9,roughness:0.12}));
    edge.position.set(0,0.2,0.033); g.add(edge);
    // 刀背锯齿（5 个）
    for(let i=0;i<5;i++){
      const serr=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.012,0.016),bladeDark);
      serr.position.set(0.02,0.245-i*0.035,0);
      g.add(serr);
    }
    // 护手（刀格）哑光黑，双指槽
    const guard=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.024,0.06),
      new THREE.MeshStandardMaterial({color:0x111111,metalness:0.5,roughness:0.6}));
    guard.position.y=0.055; g.add(guard);
    // 黑色聚合物刀柄（宽、带防滑凸点）
    const handle=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.13,0.05),
      new THREE.MeshStandardMaterial({map:this.game.tex.wrap,color:0x111111,roughness:0.85}));
    handle.position.y=-0.035; g.add(handle);
    for(let i=0;i<3;i++){
      const knurl=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.006,0.054),
        new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:0.7}));
      knurl.position.set(0,-0.065+i*0.035,0); g.add(knurl);
    }
    // 刀柄尾部金属环
    const pommel=new THREE.Mesh(new THREE.TorusGeometry(0.012,0.004,6,12),
      new THREE.MeshStandardMaterial({color:0x444444,metalness:0.8,roughness:0.4}));
    pommel.position.y=-0.105; pommel.rotation.x=Math.PI/2; g.add(pommel);
    // 新增功能：玩家右手握住刀柄（右下可见）
    const RH=this._makeFist();
    RH.position.set(-0.03,-0.04,0.04);
    RH.rotation.x=0.9; RH.rotation.z=0.1;
    RH.scale.setScalar(0.85);
    g.add(RH);
    this.knifeGroup=g;

    // 异步加载战术刀GLB（纹理自动压缩256×256），替换程序化兜底
    this._loadGLB('models/combat_knife.glb', (gltf)=>{
      const knifeModel=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      knifeModel.updateMatrixWorld();
      const box=new THREE.Box3(); knifeModel.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld)); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const sz=box.getSize(new THREE.Vector3());
      const targetLen=0.35;
      const s=targetLen/Math.max(sz.x,sz.y,sz.z);
      const wrap=new THREE.Group();
      wrap.scale.setScalar(s);
      wrap.position.set(-center.x*s, -center.y*s+0.22, -center.z*s-0.67);
      wrap.add(knifeModel);
      g.add(wrap);
      // 手部
      const RH2=this._makeFist();
      RH2.position.set(-0.03,-0.04,0.04); RH2.rotation.x=0.9; RH2.rotation.z=0.1;
      RH2.scale.setScalar(0.85);
      g.add(RH2);
      if(this.game&&this.game._wpWeaponKey==='knife'){ this.game._hideWeaponHands(g); }
      console.log('? 战术刀GLB加载成功（纹理已压缩至256×256）');
    }, undefined, (err)=>{
      console.warn('?? 战术刀模型加载失败，使用程序化占位几何体:', err);
    });
  }
  // GLB模型加载+纹理压缩
  _loadGLB(path, onLoaded, onError){
    const loader=new GLTFLoader();
    loader.load(path, (gltf)=>{
      gltf.scene.traverse(c=>{
        if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; }
        if(c.material){
          const mats=Array.isArray(c.material)?c.material:[c.material];
          for(const mat of mats){
            for(const key of['map','aoMap','roughnessMap','metalnessMap','normalMap','emissiveMap','alphaMap','bumpMap','displacementMap']){
              const tex=mat[key]; if(tex&&tex.image&&(tex.image.width>256||tex.image.height>256)){
                const cv=document.createElement('canvas'); cv.width=cv.height=256;
                cv.getContext('2d').drawImage(tex.image,0,0,256,256);
                tex.image=cv; tex.needsUpdate=true;
              }
            }
          }
        }
      });
      onLoaded(gltf);
    }, undefined, onError);
  }
  // AK-12突击步枪（GLB模型加载，程序化建模兜底）
  _buildRifle(){
    const g=new THREE.Group();
    const dark=new THREE.MeshStandardMaterial({color:0x181818,metalness:0.7,roughness:0.4});
    const darkGray=new THREE.MeshStandardMaterial({color:0x3a3a3a,metalness:0.7,roughness:0.45});
    const woodMat=new THREE.MeshStandardMaterial({color:0x6f4a26,roughness:0.7,metalness:0.05}); // AK 层压木
    const woodDark=new THREE.MeshStandardMaterial({color:0x57391b,roughness:0.75,metalness:0.05});
    const orange=new THREE.MeshStandardMaterial({color:0xff6a00,emissive:0xcc4400,emissiveIntensity:0.5});
    // 机匣（方形哑光黑金属）
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.09,0.34),dark);
    receiver.position.set(0,0.05,-0.02); g.add(receiver);
    // 机匣右侧抛壳口盖 + 铆钉
    const side=new THREE.Mesh(new THREE.BoxGeometry(0.002,0.03,0.14),darkGray);
    side.position.set(0.032,0.06,0.06); g.add(side);
    for(let i=0;i<3;i++){
      const rivet=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,0.004,8),darkGray);
      rivet.rotation.x=Math.PI/2; rivet.position.set(0.032,0.045,0.10-i*0.06); g.add(rivet);
    }
    // 枪管（粗）+ 方形斜切枪口（AK 标志）
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.34,32),darkGray);
    barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.055,-0.42); g.add(barrel);
    const muzzleCut=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.034,0.016),dark);
    muzzleCut.rotation.y=Math.PI/4; muzzleCut.position.set(0,0.055,-0.585); g.add(muzzleCut);
    // 导气管（枪管上方，AK 标志）
    const gasTube=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.2,16),darkGray);
    gasTube.rotation.x=Math.PI/2; gasTube.position.set(0,0.085,-0.26); g.add(gasTube);
    // 上护木（木色，紧贴枪管上方与下护木成一体，不挡瞄具）
    const upperHG=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.04,0.18),woodMat);
    upperHG.position.set(0,0.075,-0.28); g.add(upperHG);
    // 下护木（木色，枪管下方前端）+ 散热孔
    const handguard=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.22),woodMat);
    handguard.position.set(0,0.02,-0.30); g.add(handguard);
    for(let i=0;i<3;i++){
      const vent=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.02,0.006),dark);
      vent.position.set(0,0.045,-0.25-i*0.05); g.add(vent);
    }
    // 弹匣井 + 弧形香蕉弹匣（平滑一体弧形，可滑动换弹）
    this.rifleMagSlide=new THREE.Group();
    const well=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.026,0.05),dark);
    well.position.set(0,-0.02,-0.03); g.add(well);
    // 用 TubeGeometry 沿曲线生成平滑一体弧形弹匣（AK 香蕉弹匣，无拼接缝）
    const magCurve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,-0.03,-0.03),
      new THREE.Vector3(0,-0.10,-0.06),
      new THREE.Vector3(0,-0.17,-0.09),
      new THREE.Vector3(0,-0.23,-0.11)
    ]);
    const magGeo=new THREE.TubeGeometry(magCurve,24,0.037,12,false);
    const mag=new THREE.Mesh(magGeo,darkGray);
    mag.scale.set(1,1,0.88);
    this.rifleMagSlide.add(mag);
    // 弹匣口卡笋（顶部）
    const magLip=new THREE.Mesh(new THREE.BoxGeometry(0.032,0.045,0.05),darkGray);
    magLip.position.set(0,-0.045,-0.03); this.rifleMagSlide.add(magLip);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(0.006,48,48),orange);
    dot.position.set(0,-0.20,-0.10); this.rifleMagSlide.add(dot);
    this.rifleMagSlide.position.set(0,0,-0.03);
    g.add(this.rifleMagSlide);
    // 木握把（向后倾）+ 扳机护圈
    const pgrip=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.09,0.036),woodMat);
    pgrip.position.set(0,-0.065,0.13); pgrip.rotation.x=-0.3; g.add(pgrip);
    const guard=new THREE.Mesh(new THREE.TorusGeometry(0.028,0.004,6,12,Math.PI*1.4),dark);
    guard.position.set(0,-0.045,0.08); guard.rotation.z=0.5; g.add(guard);
    // 木枪托（向后延伸）
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.06,0.24),woodMat);
    stock.position.set(0,0.06,0.30); g.add(stock);
    const stockHeel=new THREE.Mesh(new THREE.BoxGeometry(0.046,0.07,0.02),woodDark);
    stockHeel.position.set(0,0.05,0.42); g.add(stockHeel);
    // 前准星（带护圈，顶端 y=0.13 对准准心，位于枪口后方）
    const fsBase=new THREE.Mesh(new THREE.BoxGeometry(0.016,0.01,0.014),dark);
    fsBase.position.set(0,0.09,-0.40); g.add(fsBase);
    const frontBlade=new THREE.Mesh(new THREE.BoxGeometry(0.007,0.04,0.012),darkGray);
    frontBlade.position.set(0,0.11,-0.40); g.add(frontBlade); // 顶端 0.13
    const wingMeshes=[];
    for(const sx of [-1,1]){
      const wing=new THREE.Mesh(new THREE.BoxGeometry(0.004,0.045,0.014),dark);
      wing.position.set(0.016*sx,0.09,-0.40); g.add(wing); wingMeshes.push(wing);
    }
    // 缺口照门（机匣前上方，AK 照门座；顶端低于前准星 0.13）
    const rearBase=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.014,0.02),dark);
    rearBase.position.set(0,0.095,-0.12); g.add(rearBase);
    const rearPts=[];
    for(const sx of [-1,1]){
      const rp=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.02,0.014),darkGray);
      rp.position.set(0.012*sx,0.105,-0.12); g.add(rp); rearPts.push(rp); // 顶端 0.115
    }
    this._sightRefs.rifle=[frontBlade,fsBase,rearBase,...wingMeshes,...rearPts];
    // 拉机柄（机匣右侧后部，AK 特征在右侧）
    const ch=new THREE.Mesh(new THREE.BoxGeometry(0.016,0.02,0.03),darkGray);
    ch.position.set(0.04,0.055,0.10); g.add(ch);
    // 双手：右手握木握把，左手托护木
    const RH=this._makeFist();
    RH.position.set(0.01,-0.09,0.13); RH.rotation.x=0.4; RH.rotation.z=0.1; g.add(RH);
    const LH=this._makeFist();
    LH.position.set(0.02,-0.04,-0.32); LH.rotation.x=-0.4; LH.rotation.z=-0.1; LH.scale.setScalar(0.9); g.add(LH);
    this.rifleGroup=g;
    this._rifleG=g;
    this.rifleMuzzle=new THREE.Object3D(); this.rifleMuzzle.position.set(0,0.055,-0.60);
    g.add(this.rifleMuzzle);

    // 异步加载AK12 GLB（纹理自动压缩512）
    this._loadGLB('models/ak12.glb', (gltf)=>{
      const akModel=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      // 自动居中和缩放
      akModel.updateMatrixWorld();
      const box=new THREE.Box3(); akModel.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld)); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const sz=box.getSize(new THREE.Vector3());
      const targetLen=1.2;
      const s=targetLen/Math.max(sz.x,sz.y,sz.z);
      const wrap=new THREE.Group();
      wrap.rotation.y=-Math.PI/2; // GLB枪管-X→-Z（相机前方）
      wrap.scale.setScalar(s);
      wrap.position.set(center.z*s + 0.0059, -center.y*s - 0.04, -center.x*s - 0.1);
      wrap.add(akModel);
      g.add(wrap);
      this._rifleWrap=wrap; // 保存引用
      this._rifleWrapBaseY=-center.y*s - 0.04; // 基准Y
      console.log('? AK12 GLB加载成功');
      // 重新挂回弹匣滑动组
      this.rifleMagSlide=new THREE.Group();
      g.add(this.rifleMagSlide);
      // 重新挂回手部
      const RH2=this._makeFist();
      RH2.position.set(0.01,-0.09,0.13); RH2.rotation.x=0.4; RH2.rotation.z=0.1; g.add(RH2);
      const LH2=this._makeFist();
      LH2.position.set(0.02,-0.04,-0.32); LH2.rotation.x=-0.4; LH2.rotation.z=-0.1; LH2.scale.setScalar(0.9); g.add(LH2);
      // 武器库预览中隐藏手部
      if(this.game&&this.game._wpWeaponKey==='rifle'){ this.game._hideWeaponHands(g); }
      // 重新挂回准星参考
      const fsBase2=new THREE.Mesh(new THREE.BoxGeometry(0.016,0.01,0.014),dark);
      fsBase2.position.set(0,0.09,-0.40); g.add(fsBase2);
      const frontBlade2=new THREE.Mesh(new THREE.BoxGeometry(0.007,0.04,0.012),darkGray);
      frontBlade2.position.set(0,0.11,-0.40); g.add(frontBlade2);
      const rearBase2=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.014,0.02),dark);
      rearBase2.position.set(0,0.095,-0.12); g.add(rearBase2);
      const wing2=[]; for(const sx of[-1,1]){ const w=new THREE.Mesh(new THREE.BoxGeometry(0.004,0.045,0.014),dark); w.position.set(0.016*sx,0.09,-0.40); g.add(w); wing2.push(w); }
      const rearPts2=[]; for(const sx of[-1,1]){ const rp=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.02,0.014),darkGray); rp.position.set(0.012*sx,0.105,-0.12); g.add(rp); rearPts2.push(rp); }
      this._sightRefs.rifle=[frontBlade2,fsBase2,rearBase2,...wing2,...rearPts2];
      // 重新挂回枪口
      g.add(this.rifleMuzzle);
      // 重新挂回配件模型
      if(this._armoryParts&&this._armoryParts.rifle){
        const P=this._armoryParts.rifle;
        for(const slot in P.scope) if(P.scope[slot]){ P.scope[slot].visible=false; g.add(P.scope[slot]); }
        for(const slot in P.muzzle) if(P.muzzle[slot]){ P.muzzle[slot].visible=false; g.add(P.muzzle[slot]); }
        for(const slot in P.mag) if(P.mag[slot]){ P.mag[slot].visible=false; this.rifleMagSlide.add(P.mag[slot]); }
        for(const slot in P.grip) if(P.grip[slot]){ P.grip[slot].visible=false; g.add(P.grip[slot]); }
        for(const slot in P.stock) if(P.stock[slot]){ P.stock[slot].visible=false; g.add(P.stock[slot]); }
        this._applyWeaponVisuals('rifle');
      }
    }, undefined, (err)=>{
      console.warn('?? AK12模型加载失败，使用程序化占位几何体:', err);
    });
  }
  // SKS半自动步枪（GLB模型加载，程序化兜底；2026-08-12）
  _buildSKS(){
    const g=new THREE.Group();
    const dark=new THREE.MeshStandardMaterial({color:0x181818,metalness:0.65,roughness:0.45});
    const darkGray=new THREE.MeshStandardMaterial({color:0x3a3a3a,metalness:0.65,roughness:0.5});
    const woodMat=new THREE.MeshStandardMaterial({color:0x8b6914,roughness:0.65,metalness:0.05});
    // 机匣
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.07,0.30),dark);
    receiver.position.set(0,0.05,0.02); g.add(receiver);
    // 枪管
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.013,0.013,0.38,24),darkGray);
    barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.055,-0.42); g.add(barrel);
    // 枪口
    const muzzleTip=new THREE.Mesh(new THREE.BoxGeometry(0.028,0.028,0.014),dark);
    muzzleTip.position.set(0,0.055,-0.60); g.add(muzzleTip);
    // 上护木（木色）
    const upperHG=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.03,0.16),woodMat);
    upperHG.position.set(0,0.075,-0.22); g.add(upperHG);
    // 下护木（木色）
    const handguard=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,0.20),woodMat);
    handguard.position.set(0,0.02,-0.24); g.add(handguard);
    // 弹匣（10发短弹匣）
    this.sksMagSlide=new THREE.Group();
    const mag=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.08,0.04),darkGray);
    mag.position.set(0,-0.04,-0.02); this.sksMagSlide.add(mag);
    this.sksMagSlide.position.set(0,0,-0.02);
    g.add(this.sksMagSlide);
    // 木枪托
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.05,0.28),woodMat);
    stock.position.set(0,0.05,0.32); g.add(stock);
    // 前准星 + 缺口照门
    const fsBlade=new THREE.Mesh(new THREE.BoxGeometry(0.005,0.03,0.01),darkGray);
    fsBlade.position.set(0,0.10,-0.48); g.add(fsBlade);
    const rearBase=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.012,0.018),dark);
    rearBase.position.set(0,0.09,-0.10); g.add(rearBase);
    this._sightRefs.sks=[fsBlade,rearBase];
    // 双手
    const RH=this._makeFist();
    RH.position.set(0.01,-0.08,0.14); RH.rotation.x=0.4; RH.rotation.z=0.1; g.add(RH);
    const LH=this._makeFist();
    LH.position.set(0.02,-0.03,-0.26); LH.rotation.x=-0.4; LH.rotation.z=-0.1; LH.scale.setScalar(0.9); g.add(LH);
    this.sksGroup=g;
    this._sksG=g;
    this.sksMuzzle=new THREE.Object3D(); this.sksMuzzle.position.set(0,0.055,-0.60);
    g.add(this.sksMuzzle);

    // 异步加载SKS GLB（纹理自动压缩至256×256）
    this._loadGLB('models/sks.glb',(gltf)=>{
      while(this._sksG.children.length>0) this._sksG.remove(this._sksG.children[0]);
      const P=this._armoryParts.sks={scope:{},muzzle:{},mag:{},stock:{}};
      let mdl=null;
      gltf.scene.traverse(c=>{
        if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; }
        if(c.name&&c.name.toLowerCase().includes('muzzle')) this.sksMuzzle=c;
      });
      mdl=gltf.scene;
      mdl=gltf.scene;
      // 归零sks节点旋转（消除Sketchfab内部旋转干扰），统一由顶层控制朝向
      mdl.traverse(c=>{
        if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; }
        if(c.name==='sks') c.rotation.set(0,0,0);
        if(c.material){
          c.material.roughness=Math.min(c.material.roughness||0.5,0.7);
          c.material.metalness=Math.min(c.material.metalness||0.3,0.5);
        }
      });
      mdl.scale.setScalar(0.0003);
      mdl.position.set(0,-0.2,0.5); // 上移+后移
      // 枪管+Y → 前方-Z：绕X轴+90°
      mdl.rotation.set(-Math.PI/2,0,0);
      this._sksG.add(mdl);
      this.sksMuzzle.position.set(0,0.055,-0.60);
      this._sksG.add(this.sksMuzzle);
      // 配件
      for(const slot in P.scope) if(P.scope[slot]){ P.scope[slot].visible=false; this._sksG.add(P.scope[slot]); }
      for(const slot in P.muzzle) if(P.muzzle[slot]){ P.muzzle[slot].visible=false; this._sksG.add(P.muzzle[slot]); }
      for(const slot in P.mag) if(P.mag[slot]){ P.mag[slot].visible=false; this._sksG.add(P.mag[slot]); }
      for(const slot in P.stock) if(P.stock[slot]){ P.stock[slot].visible=false; this._sksG.add(P.stock[slot]); }
      this._applyWeaponVisuals('sks');
      console.log('✅ SKS加载成功（纹理已压缩至256×256）');
    }, undefined, (err)=>{
      console.warn('⚠️ SKS模型加载失败，使用程序化占位几何体:', err);
    });
  }
  // 新增功能：M24狙击步枪（GLB模型加载，程序化建模兜底）
  _buildSniper(){
    const g=new THREE.Group();
    const dark=new THREE.MeshStandardMaterial({color:0x181818,metalness:0.6,roughness:0.5});
    const bodyMat=new THREE.MeshStandardMaterial({color:0x4a5a3a,metalness:0.6,roughness:0.5}); // 哑光深绿/沙色
    const gray=new THREE.MeshStandardMaterial({color:0x3a3a3a,metalness:0.7,roughness:0.45});
    const lensMat=new THREE.MeshStandardMaterial({color:0x88ccee,transparent:true,opacity:0.55,roughness:0.1,metalness:0.4}); // 半透明淡蓝镜片
    // 机匣（扁长方体，哑光深绿/沙色）
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.07,0.55),bodyMat);
    receiver.position.set(0,0.05,-0.02); g.add(receiver);
    // 枪管（细长圆柱，比步枪枪管更长）
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.7,32),gray);
    barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.055,-0.42); g.add(barrel);
    // 枪口
    const muzzleRing=new THREE.Mesh(new THREE.TorusGeometry(0.02,0.004,6,14),dark);
    muzzleRing.rotation.y=Math.PI/2; muzzleRing.position.set(0,0.055,-0.77); g.add(muzzleRing);
    // 枪托（一体式 + 尾部橡胶垫）
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.12,0.3),bodyMat);
    stock.position.set(0,0.02,0.35); g.add(stock);
    const rubber=new THREE.Mesh(new THREE.BoxGeometry(0.042,0.13,0.03),dark);
    rubber.position.set(0,0.02,0.50); g.add(rubber);
    // 弹匣（5发，紧贴枪身下方，可滑动换弹）
    this.sniperMagSlide=new THREE.Group();
    const mag=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.09,0.04),gray);
    mag.position.set(0,-0.03,0.0); this.sniperMagSlide.add(mag);
    const magBase=new THREE.Mesh(new THREE.BoxGeometry(0.033,0.012,0.043),dark);
    magBase.position.set(0,-0.08,0.0); this.sniperMagSlide.add(magBase);
    g.add(this.sniperMagSlide);
    // 瞄准镜（高倍镜：大型圆柱 + 前后半透明镜片，直接贴枪身上方）
    const scopeGroup=new THREE.Group();
    const scopeBody=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.12,24),dark);
    scopeBody.rotation.x=Math.PI/2; scopeBody.position.set(0,0.16,0.0); scopeGroup.add(scopeBody);
    const frontLens=new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.006,24),lensMat);
    frontLens.rotation.x=Math.PI/2; frontLens.position.set(0,0.16,-0.06); scopeGroup.add(frontLens);
    const rearLens=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.006,24),lensMat);
    rearLens.rotation.x=Math.PI/2; rearLens.position.set(0,0.16,0.06); scopeGroup.add(rearLens);
    for(const z of [-0.03,0,0.03]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(0.041,0.004,6,16),dark);
      ring.rotation.y=Math.PI/2; ring.position.set(0,0.16,z); scopeGroup.add(ring);
    }
    g.add(scopeGroup);
    this.sniperScope=scopeGroup; // 开镜时隐藏瞄准镜模型（高倍镜 overlay 替代）
    // 默认铁瞄（装配机械瞄具时显示，装配光学镜时隐藏）
    const sFront=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.005,0.03,8),dark);
    sFront.position.set(0,0.10,-0.50); g.add(sFront);
    const sRear=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.016,0.016),dark);
    sRear.position.set(0,0.10,0.10); g.add(sRear);
    this._sightRefs.sniper=[sFront,sRear];
    // 拉机柄（右侧后部，拉栓动作动画）
    const boltHandle=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.05,8),gray);
    boltHandle.rotation.z=Math.PI/2;
    boltHandle.position.set(0.045,0.05,0.18);
    g.add(boltHandle);
    this.sniperBoltHandle=boltHandle;
    // 双手：右手握枪托前方/机匣后，左手托枪管下方
    const RH=this._makeFist();
    RH.position.set(0.02,-0.05,0.22); RH.rotation.x=0.4; RH.rotation.z=0.1; g.add(RH);
    const LH=this._makeFist();
    LH.position.set(0.03,-0.06,-0.42); LH.rotation.x=-0.4; LH.rotation.z=-0.1; LH.scale.setScalar(0.9); g.add(LH);
    this.sniperGroup=g;
    this._sniperG=g;
    this.sniperMuzzle=new THREE.Object3D(); this.sniperMuzzle.position.set(0,0.055,-0.78);
    g.add(this.sniperMuzzle);

    // 异步加载M24 GLB（纹理自动压缩256×256），替换程序化兜底
    this._loadGLB('models/M24.glb', (gltf)=>{
      const m24Model=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      m24Model.updateMatrixWorld();
      const box=new THREE.Box3(); m24Model.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld)); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const sz=box.getSize(new THREE.Vector3());
      const targetLen=2.5;
      const s=targetLen/Math.max(sz.x,sz.y,sz.z);
      const wrap=new THREE.Group();
      wrap.rotation.y=Math.PI/2;
      wrap.scale.setScalar(s);
      wrap.position.set(center.z*s+0.0059, -center.y*s-0.04, -center.x*s-0.1);
      this._sniperWrapBaseY=-center.y*s-0.04;
      wrap.add(m24Model);
      m24Model.traverse(c=>{ if(c.isMesh&&(c.name==='ReloadPole'||c.name.toLowerCase().includes('reload'))) c.visible=true; });
      g.add(wrap);
      this._sniperWrap=wrap;
      this.sniperBoltHandle=null; // 无拉栓动画
      this.sniperMagSlide=new THREE.Group();
      g.add(this.sniperMagSlide);
      this.sniperScope=null;
      this._sightRefs.sniper=[];
      // 重新挂回手部
      const RH2=this._makeFist();
      RH2.position.set(0.02,-0.05,0.22); RH2.rotation.x=0.4; RH2.rotation.z=0.1; g.add(RH2);
      const LH2=this._makeFist();
      LH2.position.set(0.03,-0.06,-0.42); LH2.rotation.x=-0.4; LH2.rotation.z=-0.1; LH2.scale.setScalar(0.9); g.add(LH2);
      if(this.game&&this.game._wpWeaponKey==='sniper'){ this.game._hideWeaponHands(g); }
      // 重新挂回枪口
      this.sniperMuzzle=new THREE.Object3D(); this.sniperMuzzle.position.set(0,0.055,-0.75);
      g.add(this.sniperMuzzle);
      // 更新配件引用（scope4x清空，6x/8x仍可用；旧引用随程序化几何体一同被清除）
      if(this._armoryParts&&this._armoryParts.sniper){
        const P=this._armoryParts.sniper;
        delete P.scope.scope4x; // M24无内置镜，4x由6x/8x替代
        for(const slot in P.scope) if(P.scope[slot]){ P.scope[slot].visible=false; g.add(P.scope[slot]); }
        for(const slot in P.muzzle) if(P.muzzle[slot]){ P.muzzle[slot].visible=false; g.add(P.muzzle[slot]); }
        for(const slot in P.mag) if(P.mag[slot]){ P.mag[slot].visible=false; this.sniperMagSlide.add(P.mag[slot]); }
        for(const slot in P.stock) if(P.stock[slot]){ P.stock[slot].visible=false; g.add(P.stock[slot]); }
        this._applyWeaponVisuals('sniper');
      }
      console.log('? M24狙击枪GLB加载成功（纹理已压缩至256×256）');
    }, undefined, (err)=>{
      console.warn('?? M24模型加载失败，使用程序化占位几何体:', err);
    });
  }
  // 贝内利M3泵动式霰弹枪（GLB模型加载，程序化建模兜底）
  _buildShotgun(){
    const g=new THREE.Group();
    const dark=new THREE.MeshStandardMaterial({color:0x141414,metalness:0.75,roughness:0.35});
    const metal=new THREE.MeshStandardMaterial({color:0x2a2a2a,metalness:0.85,roughness:0.3});
    const wood=new THREE.MeshStandardMaterial({color:0x6b4226,metalness:0.05,roughness:0.85});
    const woodDark=new THREE.MeshStandardMaterial({color:0x4a2a18,metalness:0.05,roughness:0.9});
    const rubber=new THREE.MeshStandardMaterial({color:0x0a0a0a,metalness:0.1,roughness:0.95});

    // === 机匣 ===
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.07,0.24),dark);
    receiver.position.set(0,0.03,0); g.add(receiver);
    const rail=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.008,0.18),metal);
    rail.position.set(0,0.068,-0.02); g.add(rail);
    // === 枪管 ===
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.55,24),metal);
    barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.04,0.42); g.add(barrel);
    const heatShield=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.015,0.40),metal);
    heatShield.position.set(0,0.06,0.35); g.add(heatShield);
    for(let i=0;i<8;i++){
      const vent=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.005,0.02),dark);
      vent.position.set(0,0.068,0.18+i*0.045); g.add(vent);
    }
    const choke=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.034,0.06,16),dark);
    choke.rotation.x=Math.PI/2; choke.position.set(0,0.04,0.70); g.add(choke);
    // === 弹仓管 ===
    const magTube=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.45,24),metal);
    magTube.rotation.x=Math.PI/2; magTube.position.set(0,-0.01,0.28); g.add(magTube);
    const tubeCap=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.014,0.03,16),dark);
    tubeCap.rotation.x=Math.PI/2; tubeCap.position.set(0,-0.01,0.50); g.add(tubeCap);
    // === 泵动护木 ===
    const forendMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.034,0.030,0.20,8),woodDark);
    forendMesh.rotation.x=Math.PI/2; forendMesh.position.set(0,0,0.10);
    this.forend=new THREE.Group(); this.forend.position.set(0,0.005,0.08);
    this.forend.add(forendMesh); g.add(this.forend);
    for(let i=0;i<5;i++){
      const groove=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.01,0.008),dark);
      groove.position.set(0,0.018,0.12+i*0.035); g.add(groove);
    }
    for(const sx of[-1,1]){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(0.006,0.006,0.22),metal);
      bar.position.set(sx*0.018,0.01,0.15); g.add(bar);
    }
    // === 枪托 ===
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.10,0.22),wood);
    stock.position.set(0,0.02,-0.24); g.add(stock);
    const gripStock=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.08,0.06),wood);
    gripStock.position.set(0,-0.04,-0.16); gripStock.rotation.x=0.35; g.add(gripStock);
    const stockPad=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.11,0.025),rubber);
    stockPad.position.set(0,0.02,-0.36); g.add(stockPad);
    // === 扳机组 ===
    const guard=new THREE.Mesh(new THREE.TorusGeometry(0.028,0.004,6,12,Math.PI*1.6),metal);
    guard.position.set(0,-0.025,-0.07); guard.rotation.z=0.3; g.add(guard);
    const trigger=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.015,0.005),metal);
    trigger.position.set(0,-0.02,-0.05); g.add(trigger);
    // === 瞄准具 ===
    const rear=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.01,0.012),dark);
    rear.position.set(0,0.07,-0.10); g.add(rear);
    const bead=new THREE.Mesh(new THREE.SphereGeometry(0.008,8,6),
      new THREE.MeshStandardMaterial({color:0xd4a030,metalness:0.8,roughness:0.3}));
    bead.position.set(0,0.06,0.16); g.add(bead);
    this._sightRefs.shotgun=[rear,bead];
    // === 双手 ===
    const RH=this._makeFist();
    RH.position.set(0.02,-0.04,-0.19); RH.rotation.x=0.3; RH.rotation.z=0.1; g.add(RH);
    const LH=this._makeFist();
    LH.position.set(0.03,-0.02,0.18); LH.rotation.x=-0.3; LH.rotation.z=-0.1; LH.scale.setScalar(0.9); g.add(LH);
    // === 朝向 ===
    const model=new THREE.Group();
    model.rotation.y=Math.PI;
    model.add(g);
    const outer=new THREE.Group();
    outer.add(model);
    this.shotgunGroup=outer;
    this._shotgunG=g;
    this.shotgunMuzzle=new THREE.Object3D(); this.shotgunMuzzle.position.set(0,0.04,0.73);
    g.add(this.shotgunMuzzle);

    // 异步加载M3 GLB（纹理自动压缩512）
    this._loadGLB('models/贝内利m3_benelli_final.glb', (gltf)=>{
      const m3Model=gltf.scene;
      // 清除程序化几何体
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      // 计算网格包围盒中心，自动居中模型（GLB单位较大，需缩放至~1单位）
      m3Model.updateMatrixWorld();
      const box=new THREE.Box3(); m3Model.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); const mb=new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld); box.union(mb); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const sz=box.getSize(new THREE.Vector3());
      const targetLen=1.6; // 目标武器长度
      const s=targetLen/Math.max(sz.x,sz.y,sz.z);
      const wrap=new THREE.Group();
      wrap.rotation.set(0.08, Math.PI, -0.04); // 枪口偏下→增大X: 0.06→0.08
      wrap.scale.setScalar(s);
      // 包围盒居中（Y=PI后model=PI抵消为0°）
      wrap.position.set(center.x*s, -center.y*s, center.z*s);
      wrap.add(m3Model);
      g.add(wrap);
      console.log('? 贝内利M3 GLB加载成功 尺寸:',sz.toArray().map(v=>v.toFixed(1)),'缩放:',s.toFixed(4));
      // 泵动护木空组（泵动动画用）
      this.forend=new THREE.Group(); this.forend.position.set(0,0.005,0.08);
      g.add(this.forend);
      // 重新挂回手部
      const RH2=this._makeFist();
      RH2.position.set(0.02,-0.04,-0.19); RH2.rotation.x=0.3; RH2.rotation.z=0.1; g.add(RH2);
      const LH2=this._makeFist();
      LH2.position.set(0.03,-0.02,0.18); LH2.rotation.x=-0.3; LH2.rotation.z=-0.1; LH2.scale.setScalar(0.9); g.add(LH2);
      // 重新挂回准星参考
      const sightG=new THREE.Group();
      const rear2=new THREE.Mesh(new THREE.BoxGeometry(0.025,0.01,0.012),dark);
      rear2.position.set(0,0.07,-0.10); sightG.add(rear2);
      const bead2=new THREE.Mesh(new THREE.SphereGeometry(0.008,8,6),
        new THREE.MeshStandardMaterial({color:0xd4a030,metalness:0.8,roughness:0.3}));
      bead2.position.set(0,0.06,0.16); sightG.add(bead2);
      g.add(sightG);
      this._sightRefs.shotgun=[rear2,bead2];
      // 重新挂回枪口参考点
      g.add(this.shotgunMuzzle);
      // 重新挂回配件模型
      if(this._armoryParts&&this._armoryParts.shotgun){
        const P=this._armoryParts.shotgun;
        for(const s in P.scope) if(P.scope[s]){ P.scope[s].visible=false; g.add(P.scope[s]); }
        for(const s in P.muzzle) if(P.muzzle[s]){ P.muzzle[s].visible=false; g.add(P.muzzle[s]); }
        for(const s in P.mag) if(P.mag[s]){ P.mag[s].visible=false; g.add(P.mag[s]); }
        this._applyWeaponVisuals('shotgun');
      }
    }, undefined, (err)=>{
      console.warn('?? 贝内利M3模型加载失败，使用程序化占位几何体:', err);
    });
  }
  // 雷明顿1100半自动霰弹枪（GLB模型加载）
  _buildRemington(){
    const g=new THREE.Group();
    const outer=new THREE.Group();
    // 先创建占位几何体（GLB加载失败时使用）
    const dark=new THREE.MeshStandardMaterial({color:0x1a1a1e,metalness:0.7,roughness:0.4});
    const metalDark=new THREE.MeshStandardMaterial({color:0x2b2b2e,metalness:0.8,roughness:0.35});
    // 简易占位机匣（枪管朝+Z，枪托朝-Z）
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.08,0.28),dark);
    receiver.position.set(0,0.02,-0.02); g.add(receiver);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.021,0.60,32),metalDark);
    barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.02,0.16); g.add(barrel);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.10,0.24),new THREE.MeshStandardMaterial({color:0x8f5f30,metalness:0.04,roughness:0.85}));
    stock.position.set(0,0.02,-0.24); g.add(stock);
    const front=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.006,0.03,10),metalDark);
    front.position.set(0,0.085,0.40); g.add(front);
    const rear=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.014,0.014),dark);
    rear.position.set(0,0.082,-0.07); g.add(rear);
    this._sightRefs.remington=[rear,front];
    const RH=this._makeFist();
    RH.position.set(0.02,-0.05,-0.14); RH.rotation.x=0.38; RH.rotation.z=0.1; g.add(RH);
    const LH=this._makeFist();
    LH.position.set(0.028,-0.02,0.08); LH.rotation.x=-0.25; LH.rotation.z=-0.15; LH.scale.setScalar(0.9); g.add(LH);
    // 朝向：GLB模型加载后会在回调中设置旋转；占位模型使用180°Y旋转
    const model=new THREE.Group();
    model.rotation.y=Math.PI;
    model.add(g);
    outer.add(model);
    this.remingtonGroup=outer;
    this._remingtonG=g;
    this.remingtonMuzzle=new THREE.Object3D(); this.remingtonMuzzle.position.set(0,0.02,0.46);
    g.add(this.remingtonMuzzle);
    // 异步加载GLB模型（纹理自动压缩512）
    this._loadGLB('models/雷明顿remington1100.glb', (gltf)=>{
      const remModel=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      const innerWrap=new THREE.Group();
      remModel.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; } });
      // 尝试旋转：GLB模型通常Y轴朝上，枪管可能朝+X或-Z
      // 我们需要枪管朝+Z（model层会用Math.PI转到-Z=相机前方）
      innerWrap.rotation.y=-Math.PI/2; // 如果GLB枪管朝+X，这个旋转会让它朝+Z
      innerWrap.scale.set(2.0,2.0,2.0);
      innerWrap.add(remModel);
      g.add(innerWrap);
      // 重新添加手
      const RH2=this._makeFist();
      RH2.position.set(0.02,-0.05,-0.14); RH2.rotation.x=0.38; RH2.rotation.z=0.1; g.add(RH2);
      const LH2=this._makeFist();
      LH2.position.set(0.028,-0.02,0.08); LH2.rotation.x=-0.25; LH2.rotation.z=-0.15; LH2.scale.setScalar(0.9); g.add(LH2);
      // 准星标记
      const fsG=new THREE.Group();
      const fs=new THREE.Mesh(new THREE.CylinderGeometry(0.005,0.006,0.03,10),metalDark);
      fs.position.set(0,0.085,0.40); fsG.add(fs);
      const rs=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.014,0.014),dark);
      rs.position.set(0,0.082,-0.07); fsG.add(rs);
      g.add(fsG);
      this._sightRefs.remington=[rs,fs];
      // 重新添加枪口参考点
      g.add(this.remingtonMuzzle);
      // 重建配件挂载
      if(this._armoryParts&&this._armoryParts.remington){
        const parts=this._armoryParts.remington;
        for(const slot in parts.scope) if(parts.scope[slot]){ parts.scope[slot].visible=false; g.add(parts.scope[slot]); }
        for(const slot in parts.muzzle) if(parts.muzzle[slot]){ parts.muzzle[slot].visible=false; g.add(parts.muzzle[slot]); }
        for(const slot in parts.mag) if(parts.mag[slot]){ parts.mag[slot].visible=false; g.add(parts.mag[slot]); }
        this._applyWeaponVisuals('remington');
      }
    }, undefined, ()=>{
      console.warn('雷明顿1100模型加载失败，使用占位几何体');
    });
  }
  // 汤普森冲锋枪（GLB模型加载，无程序化备用）
  _buildThompson(){
    const g=new THREE.Group();
    // 占位铁瞄（GLB加载后会替换）
    this._sightRefs.thompson=[];
    this.thompsonGroup=g; this._thompsonG=g;
    this.thompsonMuzzle=new THREE.Object3D(); this.thompsonMuzzle.position.set(0,0.05,-0.50); g.add(this.thompsonMuzzle);
  }
  // 汤普森GLB懒加载
  _loadThompsonGLB(g){
    this._loadGLB('models/汤普森Thompson.glb', (gltf)=>{
      const m=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      m.updateMatrixWorld();
      const box=new THREE.Box3(); m.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld)); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const s=1.1/Math.max(box.getSize(new THREE.Vector3()).x,box.getSize(new THREE.Vector3()).y,box.getSize(new THREE.Vector3()).z);
      const wrap=new THREE.Group(); wrap.rotation.y=Math.PI; wrap.rotation.x=-0.04; wrap.scale.setScalar(s); // GLB+Z→-Z, 枪口下倾
      wrap.position.set(center.x*s+0.0106, -center.y*s+0.441, center.z*s+0.04); // PI旋转居中
      wrap.add(m); g.add(wrap);
      this._thompsonWrap=wrap;
      this._thompsonWrapBaseY=-center.y*s+0.441;
      this.thompsonMagSlide=new THREE.Group(); g.add(this.thompsonMagSlide);
      const rh=this._makeFist(); rh.position.set(0.01,-0.07,0.16); rh.rotation.x=0.4; rh.rotation.z=0.1; g.add(rh);
      const lh=this._makeFist(); lh.position.set(0.02,-0.03,-0.25); lh.rotation.x=-0.35; lh.rotation.z=-0.1; lh.scale.setScalar(0.9); g.add(lh);
      if(this.game&&this.game._wpWeaponKey==='thompson'){ this.game._hideWeaponHands(g); }
      g.add(this.thompsonMuzzle);
      // GLB加载完成后重新应用配件视觉（含瞄具偏移）
      this._applyWeaponVisuals('thompson');
    }, undefined, ()=>{ console.warn('汤普森GLB加载失败'); });
  }
  // 司登冲锋枪（GLB模型加载，无程序化备用）
  _buildSten(){
    const g=new THREE.Group();
    this._sightRefs.sten=[];
    this.stenGroup=g; this._stenG=g;
    this.stenMuzzle=new THREE.Object3D(); this.stenMuzzle.position.set(0,-0.14,-0.50); g.add(this.stenMuzzle);
  }
  // 司登GLB懒加载
  _loadStenGLB(g){
    this._loadGLB('models/stengun.glb', (gltf)=>{
      const m=gltf.scene;
      while(g.children.length>0){ const c=g.children[0]; g.remove(c); }
      m.updateMatrixWorld();
      const box=new THREE.Box3(); m.traverse(c=>{ if(c.isMesh&&c.geometry){ c.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld)); } });
      const center=new THREE.Vector3(); box.getCenter(center);
      const size=box.getSize(new THREE.Vector3());
      const s=1.8/Math.max(size.x,size.y,size.z);
      const wrap=new THREE.Group();
      // GLB枪口原始朝-X(左)，-PI/2使其朝-Z(相机前方)
      wrap.rotation.y=-Math.PI/2-0.07; wrap.rotation.x=0.067; wrap.scale.setScalar(s);
      wrap.position.set(-center.x*s-0.33, -center.y*s+0.38, -center.z*s+0.5);
      wrap.add(m); g.add(wrap);
      this._stenWrap=wrap;
      this._stenWrapBaseY=-center.y*s+0.38;
      this._stenWrapBaseX=-center.x*s;
      this._stenWrapBaseZ=-center.z*s;
      this.stenMagSlide=new THREE.Group(); g.add(this.stenMagSlide);
      const rh=this._makeFist(); rh.position.set(0.01,-0.07,0.16); rh.rotation.x=0.4; rh.rotation.z=0.1; g.add(rh);
      const lh=this._makeFist(); lh.position.set(0.02,-0.03,-0.25); lh.rotation.x=-0.35; lh.rotation.z=-0.1; lh.scale.setScalar(0.9); g.add(lh);
      if(this.game&&this.game._wpWeaponKey==='sten'){ this.game._hideWeaponHands(g); }
      g.add(this.stenMuzzle);
      this._applyWeaponVisuals('sten');
    }, undefined, ()=>{ console.warn('司登GLB加载失败'); });
  }
  // 懒加载触发器
  _tryLoadWeaponGLB(key){
    if(this._glbLoaded[key]) return;
    this._glbLoaded[key]=true;
    const ig=this['_'+key+'G']||this[key+'Group'];
    if(key==='thompson'&&ig) this._loadThompsonGLB(ig);
    if(!HIDE_STEN && key==='sten'&&ig) this._loadStenGLB(ig);
  }
  // 优化枪口火焰
  _buildMuzzle(){
    this.muzzleLight=new THREE.PointLight(0xffaa33,0,8,2);
    this.game.scene.add(this.muzzleLight);
    const glow=makeGlowTexture();
    const flash=makeFlashTexture();
    // 主闪光：十字星芒
    this.muzzleSprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:flash,color:0xffcc66,transparent:true,opacity:0,
      blending:THREE.AdditiveBlending,depthWrite:false,rotation:rand(0,Math.PI*2)
    }));
    this.muzzleSprite.scale.set(0.8,0.8,1);
    this.game.scene.add(this.muzzleSprite);
    // 内芯：白炽亮斑
    this.muzzleCore=new THREE.Sprite(new THREE.SpriteMaterial({
      map:glow,color:0xffffff,transparent:true,opacity:0,
      blending:THREE.AdditiveBlending,depthWrite:false
    }));
    this.muzzleCore.scale.set(0.35,0.35,1);
    this.game.scene.add(this.muzzleCore);
  }
  // 新增功能：MB5 主武器循环切换（主武器 → 手枪 → 战术刀 → 主武器）
  switchWeapon(){
    if(this.reloading||this.swingAnim>0||this.stockAnim>0||this.autoFiring||this.clearJamTimer>0||this.game.player.ads>0.5) return;
    this.interruptInspect(); // 切换打断检视
    this.game.audio.reloadMagOut(this.current==='rifle'||this.current==='sniper');
    // 仅选刀时 MB5 无主副武器可循环（只有战术刀）
    if(this.game.loadout==='knife') return;
    // MB5 循环顺序：当前主武器 → 手枪 → 战术刀 → 当前主武器
    const main=loadoutWeapon(this.game.loadout);
    const secondary='pistol';
    const order=[main,secondary,'knife'];
    const idx=order.indexOf(this.current);
    const next=order[(idx+1)%order.length];
    this._setWeapon(next);
    this.switchAnim=0.15;
    if(this.game.player.ads>0.5) this.game.player.adsHold=false;
    this.game.updateWeaponUI(this.current);
    this.game.refreshAmmoUI();
  }
  // 数字键快速切换（1=手枪副武器，2=当前主武器，3=战术刀）
  // 仅选刀(loadout=knife)时无主副武器，只能使用战术刀
  switchToPistol(){ if(this.game.loadout==='knife') return; if(this.current==='pistol') return; this._quickSwitch('pistol'); }
  switchToMain(){ const main=loadoutWeapon(this.game.loadout); if(this.current===main) return; this._quickSwitch(main); }
  switchToKnife(){ if(this.current==='knife') return; this._quickSwitch('knife'); }
  _quickSwitch(next){
    if(this.reloading||this.swingAnim>0||this.stockAnim>0||this.autoFiring||this.clearJamTimer>0||this.game.player.ads>0.5) return;
    this.interruptInspect();
    this.game.audio.reloadMagOut(this.current==='rifle'||this.current==='sniper');
    this._setWeapon(next);
    this.switchAnim=0.15;
    if(this.game.player.ads>0.5) this.game.player.adsHold=false;
    this.game.updateWeaponUI(this.current);
    this.game.refreshAmmoUI();
  }
  _setWeapon(next){
    this._ammoStore[this.current]=this.ammo;
    this.current=next;
    // 切枪时取消手枪跪姿/跪姿过渡动画（避免残留到新武器）
    if(this.game&&this.game.anim){
      const an=this.game.anim;
      an._kneeling=false;
      if(an.oneShot&&(an.oneShot.state==='pistolStandToKneel'||an.oneShot.state==='pistolKneelToStand'||an.oneShot.state==='pistolKneelingIdle')) an.oneShot=null;
    }
    // 首次切换时触发GLB懒加载
    this._tryLoadWeaponGLB(next);
    const st=this.computed[next]||this.computed.pistol;
    this.magSize=st.magSize;
    this.ammo=this._ammoStore[next]!==undefined?Math.min(this._ammoStore[next],this.magSize):this.magSize;
    this.pistolGroup.visible=next==='pistol';
    this.rifleGroup.visible=next==='rifle';
    this.sksGroup.visible=next==='sks';
    this.sniperGroup.visible=next==='sniper';
    this.shotgunGroup.visible=next==='shotgun';
    this.remingtonGroup.visible=next==='remington';
    this.thompsonGroup.visible=next==='thompson';
    this.stenGroup.visible=HIDE_STEN?false:(next==='sten');
    this.knifeGroup.visible=next==='knife';
  }
  canFire(){ return (this.current==='pistol'||this.current==='rifle'||this.current==='sks'||this.current==='sniper'||this.current==='shotgun'||this.current==='remington'||this.current==='thompson'||this.current==='sten')&&(this.current==='shotgun'||this.current==='remington'||!this.reloading)&&!this.jammed&&this.clearJamTimer<=0&&this.ammo>0&&this.shotCd<=0; }
  // 新增功能：武器检视（I键，所有武器通用，举到屏幕中央自转展示 1.4s）
  startInspect(){
    if(this.reloading||this.inspectAnim>0||this.inspectCd>0||this.autoFiring||this.jammed||this.clearJamTimer>0) return;
    this.inspectAnim=1.4;
    this.inspectCd=0.5;
    // 检视补光：暖色点光源照亮武器（阴暗场景也清晰）
    if(!this.inspectLight){
      this.inspectLight=new THREE.PointLight(0xffd9a0,0.8,5,2);
      this.game.camera.add(this.inspectLight);
      this.inspectLight.position.set(0.3,-0.2,-0.6);
    }
    this.inspectLight.intensity=0.8;
    this.game.audio.inspect();
    clearTimeout(this._inspectEndT);
    this._inspectEndT=setTimeout(()=>{ if(this.game.audio.ctx) this.game.audio.inspectEnd(); },1400);
  }
  // 新增功能：打断检视（战斗操作优先，0.08s 快速复位 + 冷却立即重置 + 金属抖动音）
  interruptInspect(){
    if(this.inspectAnim<=0) return;
    this.inspectAnim=Math.min(this.inspectAnim,0.08); // 0.08s 内自然回位到持枪位
    this.inspectCd=0; // 打断时冷却立即重置，允许频繁打断
    this.game.audio.inspectInterrupt();
  }
  // 新增功能：步枪卡壳排障（R键，1.0s 拉机柄动作）
  startClearJam(){
    if(!this.jammed||this.clearJamTimer>0) return;
    this.clearJamTimer=1.0;
    this.game.audio.jamClear();
    this.game.showJamUI(true,true); // 显示排障中
  }
  // 左键按下：手枪半自动 / 步枪开始连发 / 刀挥砍
  primaryDown(){
    if(this.current==='pistol'||this.current==='rifle'||this.current==='sks'||this.current==='sniper'||this.current==='shotgun'||this.current==='remington'||this.current==='thompson'||this.current==='sten'){
      if(this.canFire()) this.fire();
      if(this.current==='pistol'||this.current==='rifle'||this.current==='thompson'||this.current==='sten') this.autoFiring=true;
    } else {
      this.interruptInspect(); // 挥刀打断检视
      if(this.swingAnim<=0&&this.stockAnim<=0) this.startSwing();
    }
  }
  primaryUp(){ this.autoFiring=false; }
  // 兼容旧调用
  primary(){ this.primaryDown(); }
  fire(){
    const g=this.game;
    if(this.ammo<=0) return;
    if(this.shotCd>0) return; // 狙击拉栓 / 散弹枪泵动 射速冷却
    const isRifle=this.current==='rifle';
    const isSKS=this.current==='sks';
    const isSniper=this.current==='sniper';
    const isShotgun=this.current==='shotgun';
    const isRemington=this.current==='remington';
    const isThompson=this.current==='thompson';
    const isSten=this.current==='sten';
    // 散弹枪换弹可随时中断
    if(this.reloading&&(isShotgun||isRemington)){ this.reloading=false; this.game.showReloadUI(false); }
    if(this.reloading) return;
    // 新增功能：步枪卡壳（2%概率，5秒冷却，卡壳时哑火不发射）
    if(isRifle){
      if(this.jammed||this.clearJamTimer>0) return;
      if(this.jamCd<=0 && Math.random()<0.02){
        this.jammed=true; this.jamCd=5;
        this.game.showJamUI(true,false);
        this.game.audio.jamClick();
        return;
      }
    }
    this.interruptInspect(); // 开火打断检视
    this.ammo--;
    this.game.refreshAmmoUI();
    // 动作系统：开火动画（不可打断换弹/受击）
    if(this.game&&this.game.anim) this.game.anim.startOneShot('fire');
    const st=this.curStats();
    const recoilMult=st.recoilMult;
    // 后坐力（已整体加大：狙击单发极猛、步枪连发累积、散弹枪最猛、手枪中等；受配件后坐力加成影响）
    g.player._fireInacc=1; // 开火后短暂精度损失（连发累积，CS:GO 手感）
    if(isSniper){
      this.recoilPitch+=0.14*recoilMult;
      this.recoilYaw+=(Math.random()-0.5)*0.03;
      g.player.recoil+=1.6;
    } else if(isSKS){
      this.recoilPitch+=0.06*recoilMult;
      this.recoilYaw+=(Math.random()-0.5)*0.025;
      g.player.recoil+=1.3;
    } else if(isRifle){
      this.shotsInBurst++;
      let mult=1;
      if(this.shotsInBurst>5) mult=1+(this.shotsInBurst-5)*0.1;
      this.recoilPitch+=0.10*mult*recoilMult;
      const n=this.shotsInBurst;
      let patternYaw=0;
      if(n>=4) patternYaw=Math.sin((n-4)*1.15)*0.028*(Math.min(n-3,5)/5);
      this.recoilYaw+=patternYaw+(Math.random()-0.5)*0.018;
      g.player.recoil+=0.9;
    } else if(isShotgun){
      this.recoilPitch+=0.45*recoilMult;
      this.recoilYaw+=(Math.random()-0.5)*0.08;
      g.player.recoil+=3.2;
    } else if(isRemington){
      this.recoilPitch+=0.35*recoilMult;
      this.recoilYaw+=(Math.random()-0.5)*0.06;
      g.player.recoil+=2.5;
    } else {
      this.recoilPitch+=0.11+Math.random()*0.03*recoilMult;
      this.recoilYaw+=(Math.random()-0.5)*0.024;
      g.player.recoil+=0.9;
    }
    // 枪身后撞位移（向后推枪）
    this.gunPush+=isSniper?0.32:isShotgun?0.55:isRemington?0.48:isThompson?0.15:isSten?0.10:isRifle?0.20:isSKS?0.38:0.12;
    g.crosshairExpand();
    // 新增功能：准心后坐力累积（加大：单发微跳，连发持续上移）
    this.crossRecoil=Math.min(this.crossRecoil+(isSniper?0.10:isShotgun?0.09:isRemington?0.07:isThompson?0.04:isSten?0.022:isRifle?0.05:isSKS?0.04:0.035),0.18);
    // 枪口闪光（狙击与AK-47使用相同规格）
    const rifleLike=isRifle||isSniper||isThompson||isSten||isSKS;
    this.muzzleTotal=rifleLike?0.07:0.055;
    this.muzzleTimer=this.muzzleTotal;
    this.muzzleLight.intensity=rifleLike?60:45;
    const mz=this._muzzleWorld();
    this.muzzleLight.position.copy(mz);
    this.muzzleSprite.position.copy(mz);
    this.muzzleSprite.material.opacity=1;
    this.muzzleSprite.material.rotation=rand(0,Math.PI*2);
    const fs=rifleLike?rand(0.9,1.2):rand(0.7,1.0);
    this.muzzleSprite.scale.set(fs,fs,1);
    this.muzzleCore.position.copy(mz);
    this.muzzleCore.material.opacity=0.95;
    const cs=rifleLike?rand(0.35,0.5):rand(0.28,0.4);
    this.muzzleCore.scale.set(cs,cs,1);
    if(isSniper) g.audio.sniperShot(); else if(isRifle) g.audio.rifleShot(); else if(isSKS) g.audio.rifleShot(); else if(isShotgun) g.audio.shotgunShot(); else if(isRemington) g.audio.remingtonShot(); else if(isThompson) g.audio.thompsonShot(); else if(isSten) g.audio.stenShot(); else g.audio.gunshot();
    // 弹壳（狙击延迟到拉栓时抛壳，射击瞬间不抛；散弹枪红色塑料弹壳）
    if(isSniper){ this.sniperEjected=false; }
    if(isSKS||isRifle||isThompson||isSten) this.spawnShell(isRifle||isSKS||isThompson||isSten);
    // 狙击：拉栓（0.8s 射速冷却 + 0.3s 后拉栓音）；散弹枪：泵动上膛（0.8s 冷却 + 0.35s 后上膛音）；雷明顿：半自动0.4s冷却；手枪：按射速冷却
    if(isSKS){ this.shotCd=60/st.fireRate; }
    else if(isSniper){ this.shotCd=0.8; this.boltSfxT=0.3; }
    else if(isShotgun){ this.shotCd=0.8; this.shotgunRackSfxT=0.35; }
    else if(isRemington){ this.shotCd=0.4; }
    else if(isThompson){ this.shotCd=60/st.fireRate; this.autoFiring=true; }
    else if(isSten){ this.shotCd=60/st.fireRate; this.autoFiring=true; }
    else if(this.current==='pistol'){ this.shotCd=60/st.fireRate; this.autoFiring=true; }
    // 弹道
    this._shootRay();
  }
  _muzzleWorld(){
    let mz=null;
    if(this.current==='pistol') mz=this.pistolMuzzle;
    else if(this.current==='rifle') mz=this.rifleMuzzle;
    else if(this.current==='sniper') mz=this.sniperMuzzle;
    else if(this.current==='shotgun') mz=this.shotgunMuzzle;
    else if(this.current==='remington') mz=this.remingtonMuzzle;
    else if(this.current==='sks') mz=this.sksMuzzle;
    else if(this.current==='sten') mz=this.stenMuzzle;
    const wp=new THREE.Vector3();
    if(mz){ mz.getWorldPosition(wp); return wp; }
    return this.game.player.camera.getWorldPosition(new THREE.Vector3());
  }
  _shootRay(){
    const g=this.game, cam=g.player.camera;
    const isShotgun=this.current==='shotgun'||this.current==='remington';
    const st=this.curStats();
    const baseDir=new THREE.Vector3();
    cam.getWorldDirection(baseDir);
    // M3散弹枪弹道校准：仅开镜时下偏修正（腰射仍用准心）
    if(this.current==='shotgun' && g.player.ads>0.5){
      const right=new THREE.Vector3().crossVectors(baseDir,new THREE.Vector3(0,1,0)).normalize();
      baseDir.applyAxisAngle(right,-0.035);
    }
    // 弹道上偏：仅步枪连发（第2发起）随枪口上跳；单发/狙击/手枪保持精准（瞄准即命中）
    if(this.current==='rifle' && this.shotsInBurst>1){
      baseDir.y+=Math.min(this.recoilPitch,0.25)*0.5;
    }
    // 基础散布由精准度决定（精准度越高散布越小）+ CS:GO 移动/空中/开火精度惩罚（静止瞄准最精准）
    const accRatio=st.accuracy/100;
    const pInacc=(g.player&&g.player.inacc)||0;
    const spread=(0.0065*(1-accRatio*0.9)+0.0004)*(1+pInacc*3.2);
    const origin=cam.getWorldPosition(new THREE.Vector3()).addScaledVector(baseDir,0.3);
    // 弹丸方向：散弹枪 8 颗锥形散射（1 居中 + 7 外围圆散布）；锥形角恒定 → 越近越密集、越远越散
    const rays=[];
    if(isShotgun){
      const spreadMult=(1+st.spread/100)*(1+pInacc*1.2); // 收束器 -30% → 更集中；消音器 +15% → 更散
      const up=new THREE.Vector3(0,1,0);
      const right=new THREE.Vector3().crossVectors(baseDir,up).normalize();
      const up2=new THREE.Vector3().crossVectors(right,baseDir).normalize();
      rays.push(baseDir.clone());
      for(let i=0;i<7;i++){
        const a=rand(0,Math.PI*2), r=rand(0.02,0.08)*spreadMult; // 锥形角 1.1°~4.6°
        rays.push(baseDir.clone().addScaledVector(right,Math.cos(a)*r).addScaledVector(up2,Math.sin(a)*r).normalize());
      }
    } else {
      const d=baseDir.clone();
      d.x+=(Math.random()-0.5)*spread;
      d.y+=(Math.random()-0.5)*spread;
      rays.push(d.normalize());
    }
    // 僵尸 meta + 佣兵 meta
    const zm=[], allHitObjs=[];
    for(const z of g.zombies.zombies){
      if(z.dead) continue;
      zm.push({o:z.bodyMesh,z:z,h:false,kind:'zombie'});
      zm.push({o:z.headMesh,z:z,h:true,kind:'zombie'});
    }
    for(const e of zm) allHitObjs.push(e.o);
    // 散弹枪：统计每个目标被多少颗弹丸命中
    const shotgunHits=new Map(); // key -> {b:0,h:0,kind}
    let wallFxDone=false;
    for(const rayDir of rays){
      const ray=new THREE.Raycaster(origin,rayDir,0,MAP_SHOOT_FAR);
      const tHits=ray.intersectObjects(allHitObjs,true); // 递归检测：佣兵 Group 内部 Mesh 可被命中
      const eHits=ray.intersectObjects(g.envMeshes,false);
      let tMeta=null;
      if(tHits.length){
        for(const e of zm){ if(e.o===tHits[0].object){ tMeta=e; break; } }
      }
      const eFirst=eHits[0]||null;
      if(tMeta && (!eFirst || tHits[0].distance<eFirst.distance)){
        if(isShotgun){
          const key=tMeta.kind==='zombie'?tMeta.z:tMeta.mz;
          let rec=shotgunHits.get(key);
          if(!rec){ rec={b:0,h:0,kind:tMeta.kind,z:tMeta.z,mz:tMeta.mz}; shotgunHits.set(key,rec); }
          if(tMeta.h) rec.h++; else rec.b++;
        } else {
          if(tMeta.kind==='zombie'){
            const dmg=tMeta.h?st.damage*2:st.damage;
            this._hitZombie(tMeta.z, dmg, tMeta.h, origin);
          }
        }
      } else if(eFirst && !wallFxDone){
        wallFxDone=true;
        const normal=eFirst.face?eFirst.face.normal.clone().transformDirection(eFirst.object.matrixWorld):new THREE.Vector3(0,1,0);
        g.decals.add(eFirst.point,normal,rand(0.1,0.25));
        g.spawnParticles(eFirst.point,{color:0x9a9a9a,count:randInt(5,8),size:0.12,life:0.6,vel:2.5,grav:4});
        g.spawnParticles(eFirst.point,{color:0xffaa55,count:2,size:0.06,life:0.3,vel:4,add:true});
        if(eFirst.object.userData&&eFirst.object.userData.houseWall && g.isInsideHouse(g.player.pos.x,g.player.pos.z)){
          g.audio.impactEcho();
        }
      }
    }
    // 散弹枪结算
    if(isShotgun){
      const headDmg=Math.round(st.damage*1.67);
      for(const [key,rec] of shotgunHits){
        const total=rec.b+rec.h;
        if(rec.kind==='zombie'){
          if(total>=7){ this._hitZombie(rec.z, 999, rec.h>0, origin); }
          else { this._hitZombie(rec.z, rec.h*headDmg+rec.b*st.damage, rec.h>0, origin); }
        }
      }
    }
  }
  _hitZombie(z,dmg,head,origin){
    const g=this.game;
    const dead=z.damage(dmg,head,origin);
    const dirTo=z.pos.clone().sub(origin).normalize();
    z.knockback(dirTo,head?1.2:0.8);
    if(head){
      const d=z.pos.distanceTo(origin);
      if(d>g.runMaxHeadshot) g.runMaxHeadshot=d;
    }
    g.spawnParticles(z.pos.clone().setY(1.2),{color:0x8a1010,count:head?8:5,size:0.16,life:0.5,vel:3.5,grav:6});
    if(head) g.audio.headshotHit(); else g.audio.meatHit();
  }
  startReload(){
    const cur=this.current;
    const shotgun=cur==='shotgun'||cur==='remington';
    if((cur!=='pistol'&&cur!=='rifle'&&cur!=='sks'&&cur!=='sniper'&&cur!=='thompson'&&cur!=='sten'&&!shotgun)||this.reloading||this.clearJamTimer>0||this.jammed) return;
    this.interruptInspect(); // 换弹打断检视
    const st=this.curStats();
    this.magSize=st.magSize;
    if(this.ammo>=this.magSize) return; // 弹匣已满无需换
    const reserve=this.reserve[cur]||0;
    if(reserve<=0){ // 后备耗尽：无法换弹（塔科夫硬核）
      if(this.game) this.game.showAmmoEmpty(cur);
      return;
    }
    this.reloading=true;
    this.tactical=this.ammo>0;
    // 动作系统：换弹动画（优先级最高，任何操作不可打断；按移动速度自动选原地/走路/跑步换弹）
    if(this.game&&this.game.anim) this.game.anim.startReload();
    if(shotgun){
      // 散弹枪：管状弹仓逐发装填（每发 st.reloadTime 秒，可随时中断保留进度；受后备弹药限制）
      const need=this.magSize-this.ammo;
      this._reloadStartAmmo=this.ammo;
      this._reloadTarget=Math.min(need,reserve);
      this.reloadTotal=this._reloadTarget*st.reloadTime;
      this.reloadTimer=0;
      this._magOutDone=false; this._magInDone=false; this._rackDone=false;
      this.game.audio.reloadMagOut(false);
      this.game.showReloadUI(true);
      return;
    }
    const rifle=cur==='rifle'||cur==='sniper';
    // 剩余弹匣弹药自动回收至后备（真实换弹，塔科夫/CS:GO 手感），目标装填数受后备限制
    this.reserve[cur]=reserve+this.ammo;
    this.ammo=0;
    this._reloadTarget=Math.min(this.magSize,this.reserve[cur]);
    // 战术换弹（非空仓）更快；换弹时间随装填量比例（只装几发更快）
    const frac=this._reloadTarget/this.magSize;
    this.reloadTotal=(this.tactical?st.reloadTime*0.68:st.reloadTime)*Math.max(0.5,frac);
    // 换弹总时长与所选换弹动画（原地/走路/跑步）实际时长同步（+0.2s 枪身回正；动作系统规格）
    const anim=this.game&&this.game.anim;
    if(anim){
      const rs=anim.lastReloadState||'reload';
      if(anim.durations[rs]) this.reloadTotal=anim.durations[rs]+0.2;
    }
    this.reloadTimer=0;
    this._magOutDone=false; this._magInDone=false; this._rackDone=false;
    this.game.audio.reloadStart(rifle);
    this.game.showReloadUI(true);
  }
  updateReload(dt){
    if(!this.reloading) return;
    this.reloadTimer+=dt;
    this.game.updateReloadUI(this.reloadTimer/this.reloadTotal);
    const rp=this.reloadTimer/this.reloadTotal;
    // 散弹枪：管状弹仓逐发装填（可中断保留进度；受后备弹药限制，装填时同步扣减后备）
    if(this.current==='shotgun'||this.current==='remington'){
      const target=this._reloadStartAmmo+Math.floor(rp*this._reloadTarget);
      while(this.ammo<target){
        this.ammo++;
        if((this.reserve[this.current]||0)>0) this.reserve[this.current]--;
        this.game.audio.reloadMagIn(false); this._reloadKick=0.12;
      }
      if(this.reloadTimer>=this.reloadTotal){
        this.reloading=false;
        this.ammo=this._reloadStartAmmo+this._reloadTarget;
        this.game.showReloadUI(false);
        this.game.refreshAmmoUI();
      }
      return;
    }
    const rifle=this.current==='rifle'||this.current==='sniper';
    if(!this._magOutDone && rp>0.28){ this._magOutDone=true; this.game.audio.reloadMagOut(rifle); this._reloadKick=0.18; }
    if(!this._magInDone && rp>0.62){ this._magInDone=true; this.game.audio.reloadMagIn(rifle); this._reloadKick=0.22; }
    if(this.reloadTimer>=this.reloadTotal){
      this.reloading=false;
      this.ammo=this._reloadTarget;
      this.reserve[this.current]=Math.max(0,(this.reserve[this.current]||0)-this._reloadTarget);
      this.game.showReloadUI(false);
      this.game.refreshAmmoUI();
      this.game.audio.reloadRack(rifle); // 换弹结束"咔"（枪身回正时播放）
    }
  }
  // ---- 刀挥砍 ----
  startSwing(){
    this.swingAnim=0.3; this.swingHasHit=false;
    this.game.audio.swing();
    this.game.player.recoil+=0.15;
  }
  updateSwing(dt){
    if(this.swingAnim<=0) return;
    this.swingAnim-=dt;
    const total=0.3;
    const t=1-this.swingAnim/total;
    const k=this.current==='knife'?1:0;
    const pre=0.05/total, hitEnd=0.2/total;
    let rotZ=0, posX=0.35, camDip=0;
    if(t<pre){ // 前摇 0.05
      rotZ=lerp(-0.5,-0.3,t/pre);
      posX=lerp(0.35,0.3,t/pre);
    } else if(t<hitEnd){ // 挥砍 0.15 (0.05→0.2)
      const p=(t-pre)/(hitEnd-pre);
      const e=0.5-0.5*Math.cos(p*Math.PI); // ease-in-out
      rotZ=lerp(-0.3,1.047,e); // -30°→60°
      posX=lerp(0.3,-0.1,e);
      camDip=-0.005*Math.sin(p*Math.PI);
    } else { // 后摇 0.1
      const p=(t-hitEnd)/(1-hitEnd);
      rotZ=lerp(1.047,0,p);
      posX=lerp(-0.1,0.35,p);
    }
    this.swingRotZ=rotZ*k;
    this.swingPosX=posX*k;
    this.swingCamDip=camDip*k;
    // 有效判定窗口 0.1~0.2s
    if(this.current==='knife'&&!this.swingHasHit&&t>=0.1/total&&t<=0.2/total){
      this.swingHasHit=true;
      this._meleeCheck(5,2.5,Math.PI/3,Math.PI/6,25,1.5);
      // 刀光粒子（新增功能：白色弧形刀光）
      const mz=this.knifeGroup.getWorldPosition(new THREE.Vector3());
      for(let i=0;i<4;i++){
        this.game.emitPart({tex:'slash',pos:mz.clone().add(rand(-0.1,0.1),0,0),color:0xffffff,size:rand(0.5,0.7),life:0.15,vel:new THREE.Vector3(rand(-0.3,0.3),rand(0,0.4),-0.2),rot:rand(0,3.14),add:true});
      }
    }
  }
  // ---- 枪托锤击 ----
  startStock(){
    if(this.current!=='pistol'||this.reloading||this.stockCd>0||this.game.player.ads>0.5) return;
    this.stockAnim=0.25; this.stockHasHit=false; this.stockCd=0.8;
    this.game.audio.stockWhiff();
    this.game.player.recoil+=0.2;
    this.game.showStockCd();
  }
  updateStock(dt){
    if(this.stockCd>0){ this.stockCd-=dt; this.game.updateStockCd(this.stockCd/0.8); }
    if(this.stockAnim<=0) return;
    this.stockAnim-=dt;
    const total=0.25;
    const t=1-this.stockAnim/total;
    const pre=0.05/total, hitEnd=0.12/total;
    if(t<pre){
      this.stockPos=0;
    } else if(t<hitEnd){
      const p=(t-pre)/(hitEnd-pre);
      const e=1-Math.pow(1-p,2); // ease-out
      this.stockPos=e;
      if(!this.stockHasHit){ this.stockHasHit=true; this._meleeCheck(3,2.0,Math.PI/6,Math.PI/9,15,2.0); this.game.player.camPush=0.01; }
    } else {
      const p=(t-hitEnd)/(1-hitEnd);
      this.stockPos=lerp(1,0,p);
    }
  }
  _meleeCheck(rays,range,hSpread,vSpread,dmg,kb){
    const g=this.game, cam=g.player.camera;
    const origin=cam.getWorldPosition(new THREE.Vector3());
    const baseDir=new THREE.Vector3();
    cam.getWorldDirection(baseDir);
    let hitAny=false;
    for(let i=0;i<rays;i++){
      const p=i/(rays-1)-0.5;
      const hOff=p*2*hSpread;
      const vOff=(i===0?0:(Math.random()-0.5)*vSpread*2);
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(vOff,hOff,0));
      const dir=baseDir.clone().applyQuaternion(q).normalize();
      const ray=new THREE.Raycaster(origin,dir,0,range);
      const zm=[];
      for(const z of g.zombies.zombies){
        if(z.dead) continue;
        zm.push({o:z.bodyMesh,z:z,h:false});
        zm.push({o:z.headMesh,z:z,h:true});
      }
      const hits=ray.intersectObjects(zm.map(e=>e.o),false);
      if(hits.length){
        let meta=null;
        for(const e of zm){ if(e.o===hits[0].object){ meta=e; break; } }
        if(meta){
          const z=meta.z;
          if(!z._meleeHit){
            z._meleeHit=true;
            setTimeout(()=>{ if(!z.dead) z._meleeHit=false; },300);
            hitAny=true;
            const d=meta.h?dmg*2:dmg;
            const dead=z.damage(d,meta.h,origin);
            const dirTo=z.pos.clone().sub(origin).normalize();
            z.knockback(dirTo,kb);
            g.spawnParticles(z.pos.clone().setY(1.2),{color:0x7a0e0e,count:meta.h?8:6,size:0.16,life:0.5,vel:3.5,grav:6});
            if(meta.h) g.audio.headshotHit(); else g.audio.meatHit();
            if(this.current==='knife') this._slashFX(z.pos);
          }
        }
        break;
      }
    }
    if(!hitAny && this.current==='pistol') g.audio.stockWhiff();
    return hitAny;
  }
  _slashFX(pos){
    const g=this.game;
    g.spawnParticles(pos.clone().setY(1.2),{color:0xffffff,count:randInt(3,5),size:0.3,life:0.15,vel:2,add:true});
    g.spawnParticles(pos.clone().setY(1.2),{color:0x7a0e0e,count:randInt(5,8),size:0.14,life:0.5,vel:3,grav:5});
  }
  // ---- 弹壳物理（散弹枪使用12号红色弹壳GLB模型，其他使用几何体）----
  spawnShell(isRifle){
    const g=this.game;
    if(this.shells.length>=30){ const s=this.shells.shift(); if(s.m){ g.scene.remove(s.m); if(s.isModel){ s.m.traverse(c=>{ if(c.isMesh){ if(c.material)c.material.dispose(); if(c.geometry)c.geometry.dispose(); } }); } else { if(s.m.material)s.m.material.dispose(); if(s.m.geometry)s.m.geometry.dispose(); } } }
    const mz=this._muzzleWorld();
    const isSniper=this.current==='sniper';
    const isShotgun2=this.current==='shotgun';
    const isRemington=this.current==='remington';
    const isAnyShotgun=isShotgun2||isRemington;
    // 获取相机右向量
    const cam=g.player.camera;
    const right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion);
    let m;
    if(isAnyShotgun){
      const r=0.007, h=0.018;
      const shellGeo=new THREE.CylinderGeometry(r,r,h,32);
      const mat=new THREE.MeshStandardMaterial({color:0xcc2233,metalness:0.3,roughness:0.6});
      m=new THREE.Mesh(shellGeo,mat);
      m.position.copy(mz).addScaledVector(right,0.15).addScaledVector(up,0.05).add(new THREE.Vector3(0,0,-0.1));
    } else {
      const r=isSniper?0.007:(isRifle?0.006:0.004), h=isSniper?0.04:(isRifle?0.03:0.014);
      const shellGeo=new THREE.CylinderGeometry(r,r,h,32);
      const mat=new THREE.MeshStandardMaterial({color:0xc8a84e,metalness:1,roughness:0.3});
      m=new THREE.Mesh(shellGeo,mat);
      m.position.copy(mz).addScaledVector(right,0.12).add(new THREE.Vector3(0,0.05,0.05));
    }
    m.rotation.copy(cam.rotation);
    g.scene.add(m);
    // 抛壳物理参数（12号霰弹壳：向右上方飞出，重力-12，旋转720°/s，弹跳1-2次，3秒后消失）
    const grav=isAnyShotgun?-12:-15;
    const rotSpeed=isAnyShotgun?720:rand(15,25);
    this.shells.push({
      m:m,
      vel:right.clone().multiplyScalar(isAnyShotgun?0.8:rand(1.5,2.5)).add(new THREE.Vector3(0,isAnyShotgun?0.6:rand(2.2,3.2),isAnyShotgun?-0.3:rand(0.5,1.5))),
      angVel:new THREE.Vector3(rand(-rotSpeed,rotSpeed),rand(-rotSpeed,rotSpeed),rand(-rotSpeed,rotSpeed)),
      life:0,bounces:0,maxBounces:isAnyShotgun?2:2, maxLife:isAnyShotgun?3.0:0.5,
      isSniper:isSniper, isShotgun:isAnyShotgun, grav:grav, isModel:false
    });
  }
  updateShells(dt){
    for(let i=this.shells.length-1;i>=0;i--){
      const s=this.shells[i];
      s.life+=dt;
      s.vel.y+=s.grav*dt;
      s.m.position.addScaledVector(s.vel,dt);
      s.m.rotation.x+=s.angVel.x*dt*0.01745;
      s.m.rotation.y+=s.angVel.y*dt*0.01745;
      s.m.rotation.z+=s.angVel.z*dt*0.01745;
      if(s.m.position.y<0.02){
        s.m.position.y=0.02;
        s.vel.y*=-0.4; // 反弹衰减系数0.4
        s.vel.x*=0.6; s.vel.z*=0.6;
        s.bounces++;
        if(s.isSniper) this.game.audio.shellDingHeavy(); else if(s.isShotgun) this.game.audio.shotgunShellDing(); else this.game.audio.shellDing();
      }
      if(s.bounces>=s.maxBounces||s.life>s.maxLife){
        // 清理：GLB模型仅从场景移除，几何体需要dispose
        this.game.scene.remove(s.m);
        if(!s.isModel && s.m.material) s.m.material.dispose();
        if(!s.isModel && s.m.geometry) s.m.geometry.dispose();
        this.shells.splice(i,1);
      }
    }
  }
  // ---- 姿态/动画更新 ----
  update(dt,t){
    const g=this.game, player=g.player;
    const cur=this.current;
    // 切换动画
    if(this.switchAnim>0) this.switchAnim-=dt;
    const sw=this.switchAnim>0?this.switchAnim/0.15:0;
    // 基础位置
    let basePos=new THREE.Vector3(0.35,-0.25,-0.23);
    let baseRot=new THREE.Euler(0,0,0);
    if(cur==='pistol'){
      const hipPos=new THREE.Vector3(0.40,-0.20,-0.51);
      const adsPos=new THREE.Vector3(0,-0.08,-0.45); // G18前准星对齐屏幕中心
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.04*(1-player.ads);
    } else if(cur==='knife'){
      basePos=new THREE.Vector3(0.30,-0.20,-0.35);
      baseRot.x=-2.094; // 刀尖朝前偏下 30°（与视线成 30 度角）
      // 奔跑低姿持刀：刀身放平、刀尖指向前方
      if(player.sprinting){
        basePos.set(0.3,-0.1,-0.33);
        baseRot.x=-Math.PI/2; baseRot.z=-0.35;
      }
      // 挥刀
      if(this.swingAnim>0){
        basePos.x=this.swingPosX;
        baseRot.z=this.swingRotZ;
        basePos.y+=-0.05*Math.sin(1-this.swingAnim/0.3)*1;
      }
    } else if(cur==='rifle'){
      // 新增功能：突击步枪姿态（髋射 + 机械瞄具开镜，枪贴脸）
      const hipPos=new THREE.Vector3(0.42,-0.22,-0.48);
      const adsPos=new THREE.Vector3(0,-0.13,-0.38); // 拉近贴脸
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.05*(1-player.ads);
    } else if(cur==='sks'){
      // SKS半自动步枪姿态（介于步枪和狙击之间，中远距离精准射击）
      const hipPos=new THREE.Vector3(0.40,-0.22,-0.48);
      const adsPos=new THREE.Vector3(0,-0.14,-0.40);
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.04*(1-player.ads);
    } else if(cur==='sniper'){
      // 狙击步枪姿态（GLB前准星对齐屏幕中心）
      const hipPos=new THREE.Vector3(0.34,-0.22,-0.45);
      const adsPos=new THREE.Vector3(-0.06,-0.12,-0.43);
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.04*(1-player.ads);
    } else if(cur==='shotgun'){
      const hipPos=new THREE.Vector3(0.42,-0.22,-0.48);
      const adsPos=new THREE.Vector3(0,-0.18,-0.31);
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.05*(1-player.ads);
    } else if(cur==='remington'){
      const hipPos=new THREE.Vector3(0.42,-0.22,-0.48);
      const adsPos=new THREE.Vector3(0,-0.20,-0.41);
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.05*(1-player.ads);
    } else if(cur==='thompson'){
      const hipPos=new THREE.Vector3(0.40,-0.20,-0.51);
      const adsPos=new THREE.Vector3(0,-0.12,-0.41);
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.04*(1-player.ads);
    } else if(cur==='sten'){
      const hipPos=new THREE.Vector3(0.40,-0.20,-0.51);
      const adsPos=new THREE.Vector3(0,-0.12,-0.41);
      basePos=hipPos.clone().lerp(adsPos,player.ads);
      baseRot.y=0.04*(1-player.ads);
    }
    // 枪托
    if(this.stockAnim>0 && cur==='pistol'){
      const e=this.stockPos;
      basePos.x=lerp(0.3,0.1,e);
      basePos.y=lerp(-0.15,0.05,e);
      basePos.z=lerp(-0.23,-0.53,e);
      baseRot.x=lerp(0,0.524,e); // 绕X向下30°
    }
    // 切换 下放/上抬
    const lift=cur==='pistol'?this.pistolLift:this.knifeLift;
    const offY=sw*0.25;
    // 后坐力（加大后复位稍慢，枪口上跳更持久；狙击最慢，散弹枪次之）
    const recov=cur==='sniper'?5.5:(cur==='shotgun'?6.5:(cur==='remington'?7.0:(cur==='thompson'?8.0:(cur==='sten'?8.0:(cur==='sks'?7.0:7.5)))));
    this.recoilPitch=lerp(this.recoilPitch,0,Math.min(1,dt*recov));
    this.recoilYaw=lerp(this.recoilYaw,0,Math.min(1,dt*recov));
    // 准心后坐力恢复（连发时慢，停止后较快回落）
    this.crossRecoil=lerp(this.crossRecoil,0,Math.min(1,dt*(this.autoFiring?1.5:3.5)));
    // 倾斜/蹲伏微调
    const leanP=player.lean;
    const crouchP=player.crouch;
    // 组合
    const pos=basePos.clone();
    pos.y+=offY+crouchP*0.04;
    pos.x+=leanP*0.1;
    pos.x+=this.recoilYaw*1.5;
    pos.y+=Math.abs(this.recoilPitch)*0.15;
    // 枪身后撞回位：按武器类型速度恢复，向后推枪
    const pushRecov=cur==='sniper'?15:(cur==='shotgun'?12:(cur==='remington'?12:(cur==='thompson'?11:(cur==='sten'?11:(cur==='rifle'?10:8)))));
    this.gunPush=lerp(this.gunPush,0,Math.min(1,dt*pushRecov));
    pos.z+=this.gunPush;
    const rot=baseRot.clone();
    rot.x+=this.recoilPitch;
    // 开镜时枪反向倾斜抵消相机倾斜（枪是相机子物体），照门准星在画面中保持水平（和不摆头一致，2026-08-12）
    if(player.ads>0.5) rot.z+=leanP*0.436;
    // 视角转动枪械跟随：枪口先跟上，枪托拖尾滞后，带惯性回摆
    {
      const lookVX=(player.yaw-this._prevYaw)/Math.max(dt,1e-4);
      const lookVY=(player.pitch-this._prevPitch)/Math.max(dt,1e-4);
      this._prevYaw=player.yaw; this._prevPitch=player.pitch;
      const swayMul=(1-player.ads*0.7)*(this.reloading?0.4:1);
      // 位置：枪口快速跟随视角偏移
      const tSX=-lookVX*0.015*swayMul;
      const tSY=lookVY*0.015*swayMul;
      this._swayX=lerp(this._swayX,tSX,Math.min(1,dt*8));
      this._swayY=lerp(this._swayY,tSY,Math.min(1,dt*8));
      pos.x+=this._swayX;
      pos.y+=this._swayY;
      // 旋转拖尾：枪托慢速跟上产生惯性感（左转→枪口左甩→枪托滞后）
      const tRY=-lookVX*0.06*swayMul; // 水平转向→Y轴旋转
      const tRX=lookVY*0.04*swayMul;  // 垂直转向→X轴旋转
      this._swayRY=lerp(this._swayRY||0,tRY,Math.min(1,dt*4));  // 慢速回弹
      this._swayRX=lerp(this._swayRX||0,tRX,Math.min(1,dt*4));
      rot.y+=this._swayRY;
      rot.x+=this._swayRX;
    }
    // 新增功能：冲刺持枪姿态——枪械下垂贴腰（使命召唤奔跑视角，刀已有专属姿势故跳过）
    if(cur!=='knife'){
      const want=player.sprinting&&player.ads<=0.1&&!this.reloading&&this.inspectAnim<=0?1:0;
      this._sprintPose=lerp(this._sprintPose||0,want,Math.min(1,dt*10));
      const sp=this._sprintPose;
      if(sp>0.001){
        pos.y-=0.08*sp; pos.z+=0.05*sp; pos.x-=0.02*sp;
      }
    } else if(this._sprintPose) this._sprintPose=lerp(this._sprintPose,0,Math.min(1,dt*10));
    // 跑动枪身摆动：已移除旧逻辑（2026-08-12 用户要求）——跑动时枪的摆动由“枪跟手”接管
    //（枪位置跟随右手动画摆动），不再叠加视角 bobY 的旋转摆动，避免双重摆动
    // 冲刺/横移枪械侧倾
    {
      const strafe=player.vel.x;
      const strafeAmt=clamp(strafe/(player.sprinting?6:3),-1,1)*(1-player.ads*0.8);
      rot.z+=strafeAmt*0.05*(this._sprintPose||0);
      rot.z-=this._swayX*0.4;
      rot.x+=this._swayY*0.3;
    }
    // 狙击拉栓时枪身向内侧侧转（枪身左倾入画面中央，露出右侧拉机柄）
    if(cur==='sniper' && this.shotCd>0){
      const bp=1-this.shotCd/0.8;
      const sw=bp<0.35?bp/0.35:(1-(bp-0.35)/0.65);
      rot.z+=0.5*sw;   // 绕Z正旋=逆时针左倾（枪身向内侧倒）
      pos.x-=0.05*sw;  // 枪身向左(内侧)偏移
    }
    // 新增功能：散弹枪泵动上膛动画（护木前推后拉 + 枪身轻微下压）——仅M3泵动，雷明顿半自动无泵动
    if(cur==='shotgun' && this.shotCd>0 && this.forend){
      const bp=1-this.shotCd/0.8;
      const pump=bp<0.15?0:Math.sin(Math.min((bp-0.15)/0.7,1)*Math.PI);
      this.forend.position.z=0.08+0.08*pump;
      rot.x-=0.087*pump; // 枪身下压 -5°
    }
    // 新增功能：武器检视（举到屏幕中央自转展示：0.2s 进入 + 1.0s 旋转 + 0.2s 回位）
    if(this.inspectAnim>0 && !this.reloading){
      const p=1-this.inspectAnim/1.4;
      const t1=0.2/1.4, t2=1.2/1.4;
      if(p<t1){
        const e=0.5-0.5*Math.cos((p/t1)*Math.PI);
        pos.x=lerp(basePos.x,0,e); pos.y=lerp(basePos.y,0,e); pos.z=lerp(basePos.z,-0.23,e);
        rot.x=lerp(baseRot.x,0,e); rot.y=lerp(baseRot.y,0,e); rot.z=lerp(baseRot.z,0,e);
      } else if(p<t2){
        const q=(p-t1)/(t2-t1);
        pos.set(0,0,-0.23);
        rot.set(Math.sin(q*Math.PI*3)*0.087, q*Math.PI*2, 0); // 绕Y旋转360° + X摆动±5°
      } else {
        const e=0.5-0.5*Math.cos(((p-t2)/(1-t2))*Math.PI);
        pos.x=lerp(0,basePos.x,e); pos.y=lerp(0,basePos.y,e); pos.z=lerp(-0.23,basePos.z,e);
        rot.x=lerp(0,baseRot.x,e); rot.y=lerp(0,baseRot.y,e); rot.z=lerp(0,baseRot.z,e);
      }
    }
    // 新增功能：步枪卡壳——枪身微微偏转（模拟卡弹错位）
    if(this.jammed && cur==='rifle'){
      rot.z+=0.14; rot.y+=-0.08; pos.x+=0.02;
    }
    // 新增功能：步枪排障——拉机柄动作（上抬 + 抖动 + 复位）
    if(this.clearJamTimer>0 && cur==='rifle'){
      const p=1-this.clearJamTimer/1.0;
      const e=0.5-0.5*Math.cos(clamp(p*1.4,0,1)*Math.PI);
      pos.y+=0.1*e; pos.x-=0.05*e; rot.z+=0.5*e;
      if(p>0.7) rot.z+=Math.sin(this.clearJamTimer*80)*0.08;
    }
    // 换弹枪身姿势（2026-08-12 动作系统接管后简化）：向右下方倾斜——0~0.2s 倾斜到位→播放期间保持→结束时回正
    // ?? three.js 相机子空间中负 Z 旋转=向右倾斜（与既有换弹姿势 rot.z<0 同向；幅度按规格 0.15/0.03）
    if(this.reloading && (cur==='pistol'||cur==='rifle'||cur==='sniper'||cur==='thompson'||cur==='sten')){
      const rp=this.reloadTimer/this.reloadTotal;
      let e;
      if(rp<0.12) e=rp/0.12;
      else if(rp>0.88) e=(1-rp)/0.12;
      else e=1;
      e=e*e*(3-2*e); // smoothstep
      pos.x+=0.03*e;
      rot.z-=0.15*e;
      // 弹匣出/入/上膛动作触发的微抖（与换弹音效同步，触觉反馈）
      if(this._reloadKick>0){
        this._reloadKick-=dt;
        const kv=Math.abs(Math.sin(this._reloadKick*70));
        pos.x+=Math.sin(this._reloadKick*70)*0.016*kv;
        pos.y-=kv*0.02;
        rot.z+=Math.sin(this._reloadKick*90)*0.06*kv;
        rot.x-=kv*0.03;
      }
    } else {
      if(this.magSlide && this.magSlide.position.y!==0) this.magSlide.position.y=lerp(this.magSlide.position.y,0,Math.min(1,dt*20));
      if(this.rifleMagSlide && this.rifleMagSlide.position.y!==0) this.rifleMagSlide.position.y=lerp(this.rifleMagSlide.position.y,0,Math.min(1,dt*20));
      if(this.sniperMagSlide && this.sniperMagSlide.position.y!==0) this.sniperMagSlide.position.y=lerp(this.sniperMagSlide.position.y,0,Math.min(1,dt*20));
      if(this.thompsonMagSlide && this.thompsonMagSlide.position.y!==0) this.thompsonMagSlide.position.y=lerp(this.thompsonMagSlide.position.y,0,Math.min(1,dt*20));
      if(this.stenMagSlide && this.stenMagSlide.position.y!==0) this.stenMagSlide.position.y=lerp(this.stenMagSlide.position.y,0,Math.min(1,dt*20));
    }
    // 散弹枪逐发装填动作（护木小幅前后 + 枪身微倾）——仅M3有护木动画，雷明顿仅倾斜
    if((cur==='shotgun'||cur==='remington') && this.reloading){
      if(cur==='shotgun' && this.forend){
        const rp=this.reloadTimer/this.reloadTotal;
        const e=0.5-0.5*Math.cos(rp*Math.PI*4);
        this.forend.position.z=0.08+0.03*e;
        rot.z+=0.08*e;
      } else if(cur==='remington'){
        const rp=this.reloadTimer/this.reloadTotal;
        const e=0.5-0.5*Math.cos(rp*Math.PI*4);
        rot.z+=0.06*e;
        pos.x+=0.01*e;
      }
    }
    this.pistolGroup.position.copy(pos); this.pistolGroup.rotation.copy(rot);
    if(this.m1911Group){ this.m1911Group.position.copy(pos); this.m1911Group.rotation.copy(rot); }
    this.knifeGroup.position.copy(pos); this.knifeGroup.rotation.copy(rot);
    this.rifleGroup.position.copy(pos); this.rifleGroup.rotation.copy(rot);
    this.sksGroup.position.copy(pos); this.sksGroup.rotation.copy(rot);
    this.sniperGroup.position.copy(pos); this.sniperGroup.rotation.copy(rot);
    this.shotgunGroup.position.copy(pos); this.shotgunGroup.rotation.copy(rot);
    this.remingtonGroup.position.copy(pos); this.remingtonGroup.rotation.copy(rot);
    this.thompsonGroup.position.copy(pos); this.thompsonGroup.rotation.copy(rot);
    this.stenGroup.position.copy(pos); this.stenGroup.rotation.copy(rot);
    // 腰射（未开镜）：枪跟手（2026-08-12 用户要求）——武器组位置每帧跟随右手
    //（+偏移使右手落在握把），跑/跳/摆动时枪跟上手的位置、双手始终贴住握把与护木；
    // 旋转保留武器逻辑（枪口朝前/后坐/卡壳倾斜）；检视/刀/开镜时用原定位（不跟随）
    {
      const anim=this.game.anim;
      const pl=this.game.player;
      const follow=anim&&anim.root&&anim.ready&&this.game.state==='PLAYING'&&pl.ads<=0.5
        &&this.inspectAnim<=0&&cur!=='knife';
      if(follow){
        const rh=anim.root.getObjectByName('mixamorigRightHand');
        if(rh){
          const gv=this._gripVec;
          rh.getWorldPosition(gv);
          this.game.camera.worldToLocal(gv);
          gv.add(ANIM_GRIP_OFFSET);
          // 各武器持枪姿态微调（枪+手整体移动，右手仍贴握把；2026-08-12 用户要求）
          if(cur==='remington') gv.z+=0.06;   // 雷明顿1100：枪往后收一点
          else if(cur==='shotgun') gv.y-=0.05; // 贝内利M3：枪往下一点
          else if(cur==='pistol'){ gv.x+=0.04; gv.y-=0.02; } // 手枪：建模往右平移一点 + 略下沉（2026-08-12）
          this.pistolGroup.position.copy(gv);
          if(this.m1911Group) this.m1911Group.position.copy(gv);
          this.knifeGroup.position.copy(gv);
          this.rifleGroup.position.copy(gv);
          this.sksGroup.position.copy(gv);
          this.sniperGroup.position.copy(gv);
          this.shotgunGroup.position.copy(gv);
          this.remingtonGroup.position.copy(gv);
          this.thompsonGroup.position.copy(gv);
          this.stenGroup.position.copy(gv);
          // 腰射：主武器枪托往左移，绕枪口旋转，枪口不动，手跟枪（2026-08-12）
          { const isPri=cur==='rifle'||cur==='sks'||cur==='sniper'||cur==='shotgun'||cur==='remington'||cur==='thompson'||cur==='sten';
            if(isPri){ const mz=this[cur+'Muzzle']; if(mz){
              const aY=-0.20, m=mz.position;
              const nx=m.x+aY*m.z, nz=m.z-aY*m.x;
              const grp2=this[cur+'Group'];
              const dx=m.x-nx, dz=m.z-nz;
              grp2.position.x+=dx; grp2.position.z+=dz;
              grp2.rotation.y+=aY;
              if(anim&&anim.root) anim.root.position.x+=dx; anim.root.position.z+=dz; // 手跟枪
            }}
          }
        }
      }
      // 开镜：手跟枪（2026-08-12 用户要求）——枪按自身定位（basePos→adsPos + 后坐力 + 摆动，即上面的 pos），
      // 手臂骨架每帧对齐使右手恰好落在枪的握把，左手随动画托在护木/握把位；双手始终握枪且枪的瞄准视角保持原样。
      // 开镜跳跃：手/枪跟随跳跃动画位移——起跳上晃、落地下晃（与腰射跳跃晃动一致，2026-08-12 用户要求）
      if(anim&&anim.root&&anim.ready&&this.game.state==='PLAYING'&&pl.ads>0.5
        &&this.inspectAnim<=0&&cur!=='knife'){
        const rh=anim.root.getObjectByName('mixamorigRightHand');
        if(rh){
          const os=anim.oneShot&&anim.oneShot.state;
          const jumping=os==='jump'||os==='pistolJump';
          // 目标波动（相机局部）：跳跃=动画 Y 波动（起跳上/落地下，幅度受限）；走路=bob；跳跃 X=0
          let tWX=0, tWY=0;
          if(jumping&&anim._rhIdleRel){
            const idle=anim._rhIdleRel;
            rh.getWorldPosition(this._gripVec);
            this.game.camera.worldToLocal(this._gripVec);
            this._gripVec.sub(anim.root.position);
            const dy=this._gripVec.y-idle.y;      // 跳跃 Y 位移（相对待机）
            const base=this._jumpBase||(this._jumpBase={y:dy});
            base.y=lerp(base.y,dy,0.2);
            tWY=Math.max(-0.08,Math.min(0.05,dy-base.y)); // 只保留 Y 波动（向上≤0.05、向下≤0.08）
          } else if(pl.onGround){
            const hS=pl.vel?Math.hypot(pl.vel.x,pl.vel.z):0;
            if(hS>0.5){
              const ph=pl.bobPhase*ANIM_BOB_RATE;
              const amp=0.05*(pl.sprinting?1.3:1)*ANIM_BOB_MUL*(1-pl.ads*0.7);
              tWX=Math.sin(ph)*amp*0.5;
              tWY=Math.sin(ph*2)*amp;
            }
          }
          if(!jumping) this._jumpBase=null;
          // 平滑波动（2026-08-12 用户要求"丝滑一点，有卡顿"）：对目标波动做低通，
          // 消除跳跃硬 clamp 的尖角与跳跃/走路切换的跳变；X/Z 保持开镜中心（跳跃不偏移）
          this._adsWX=this._adsWX===undefined?tWX:lerp(this._adsWX,tWX,0.3);
          this._adsWY=this._adsWY===undefined?tWY:lerp(this._adsWY,tWY,0.3);
          const wx=this._adsWX, wy=this._adsWY;
          // 手跟枪：root 用当前偏移补偿 → 右手始终落枪握把（不偏右、不脱手）
          const tmp=this._gripVec;
          rh.getWorldPosition(tmp);
          this.game.camera.worldToLocal(tmp); // 右手相机局部
          tmp.sub(anim.root.position);         // 右手相对手臂骨架的偏移（相机局部，随动画变化）
          let gx=0,gy=0,gz=0;
          if(cur==='remington') gz+=0.06;
          else if(cur==='shotgun') gy-=0.05;
          else if(cur==='pistol') gy-=0.02;
          const handLX=cur==='pistol'?0.05:0;
          // 开镜：枪居中保持照门准星对齐（不侧移），仅视角/枪同步倾斜 25°（2026-08-12）
          anim.root.position.set(
            pos.x+wx-ANIM_GRIP_OFFSET.x-gx-tmp.x-handLX,
            pos.y+wy-ANIM_GRIP_OFFSET.y-gy-tmp.y,
            pos.z-ANIM_GRIP_OFFSET.z-gz-tmp.z
          );
          // 枪=开镜位+平滑波动（居中不侧移）；M24 开镜建模整体右移 0.03（2026-08-12）
          const grp2=this[cur+'Group'];
          if(grp2){
            grp2.position.set(pos.x+wx, pos.y+wy, pos.z);
            // M24 开镜建模微调（2026-08-12 用户要求）：右移0.03 + 下移0.02；高倍镜额外下移0.05
            let extraDown=0;
            const st=this.curStats().scopeType;
            if(st==='scope4x'||st==='scope6x'||st==='scope8x') extraDown=0.05;
          if(cur==='sniper'){ grp2.position.x+=0.03; grp2.position.y-=(0.02+extraDown); anim.root.position.x+=0.03; anim.root.position.y-=(0.02+extraDown); }
          }
        }
      }
    }
    this.pistolGroup.visible=cur==='pistol';
    if(this.m1911Group) this.m1911Group.visible=cur==='m1911';
    this.knifeGroup.visible=cur==='knife';
    this.rifleGroup.visible=cur==='rifle';
    this.sksGroup.visible=cur==='sks';
    this.sniperGroup.visible=cur==='sniper';
    this.shotgunGroup.visible=cur==='shotgun';
    this.remingtonGroup.visible=cur==='remington';
    this.thompsonGroup.visible=cur==='thompson';
    this.stenGroup.visible=HIDE_STEN?false:(cur==='sten');
    // === 司登GLB修正（在所有权重计算之后强制应用）===
    if(cur==='sten' && this._stenWrap){
      this._stenWrap.rotation.y=-Math.PI/2-0.07;
      this._stenWrap.position.x=(this._stenWrapBaseX||0)-0.37;
      this._stenWrap.position.z=(this._stenWrapBaseZ||0)+0.5;
    }
    if(cur==='sten' && this.stenMuzzle){
      this.stenMuzzle.position.set(0.0, -0.14, -0.50);
    } else if(cur==='sten' && !this._stenDebug){
      this._stenDebug=true; console.log('[司登DEBUG] stenMuzzle 不存在!');
    }
    // 开镜时隐藏高倍镜模型（overlay 替代镜内画面）；普通光学镜（红点/全息）保留可见
    {
      const parts=this._armoryParts[cur]&&this._armoryParts[cur].scope;
      if(parts){
        const sel=this.loadout[cur]&&this.loadout[cur].scope;
        const hide=this._scopeModelsHidden() && cur!=='sniper'; // M24 开镜保留瞄具模型可见（2026-08-12 用户要求）
        for(const optId in parts){ if(parts[optId]) parts[optId].visible=(optId===sel)&&!hide; }
        // 瞄具随枪身后撞大幅度抖动
        if(this.gunPush>0.001||Math.abs(this.recoilPitch)>0.001){
          const shake=Math.max(this.gunPush*0.5,Math.abs(this.recoilPitch)*0.3);
          for(const optId in parts){
            const p=parts[optId];
            if(p&&p.visible){
              p.position.x=(Math.random()-0.5)*shake;
              p.position.y=(Math.random()-0.5)*shake*0.6;
              p.rotation.z=(Math.random()-0.5)*shake*0.8;
            }
          }
        }
      }
    }
    // 玩家相机下沉
    player.camDip=(this.swingCamDip||0);
    // 枪口闪光衰减（主闪光 + 内芯同步淡出收缩）
    if(this.muzzleTimer>0){
      this.muzzleTimer-=dt;
      const r=clamp(this.muzzleTimer/this.muzzleTotal,0,1);
      this.muzzleSprite.material.opacity=r*0.95;
      this.muzzleCore.material.opacity=r*0.9;
      this.muzzleLight.intensity=r*(cur==='sniper'?90:(cur==='shotgun'?55:(cur==='remington'?55:(cur==='thompson'?50:(cur==='sten'?45:(cur==='sks'?55:(cur==='rifle'?60:45)))))));
      const k=0.6+0.4*r;
      this.muzzleSprite.scale.set(this.muzzleSprite.scale.x*k,this.muzzleSprite.scale.y*k,1);
      if(this.muzzleTimer<=0){
        this.muzzleSprite.material.opacity=0;
        this.muzzleCore.material.opacity=0;
        this.muzzleLight.intensity=0;
      }
    }
    // 新增功能：步枪全自动连发（射速由配件影响，600发/分 = 0.1s一发）
    if(this.autoFiring && (cur==='pistol'||cur==='rifle'||cur==='thompson'||cur==='sten') && !this.reloading && this.game.state!=='GAMEOVER'){
      this.autoFireTimer-=dt;
      if(this.autoFireTimer<=0){
        this.autoFireTimer=60/(this.curStats().fireRate||600);
        if(this.ammo>0) this.fire(); else this.autoFiring=false;
      }
    }
    // 连发后坐力累积：停止射击 0.3s 后重置
    if(this.autoFiring){ this.burstTimer=0.3; }
    else { this.burstTimer-=dt; if(this.burstTimer<=0) this.shotsInBurst=0; }
    // 新增功能：武器检视计时（冷却）
    if(this.inspectAnim>0){ this.inspectAnim-=dt; if(this.inspectAnim<=0&&this.inspectLight) this.inspectLight.intensity=0; }
    if(this.inspectCd>0) this.inspectCd-=dt;
    // 新增功能：步枪卡壳计时（排障 / 卡壳冷却）
    if(this.clearJamTimer>0){
      this.clearJamTimer-=dt;
      if(this.clearJamTimer<=0){
        this.clearJamTimer=0;
        this.jammed=false;
        this.game.showJamUI(false,false);
        this.game.refreshAmmoUI();
      }
    }
    if(this.jamCd>0) this.jamCd-=dt;
    // 新增功能：狙击射速冷却（拉栓上膛）+ 0.3s 后拉栓音
    if(this.shotCd>0) this.shotCd-=dt;
    if(this.boltSfxT>0){ this.boltSfxT-=dt; if(this.boltSfxT<=0){ this.boltSfxT=-1; this.game.audio.sniperBolt(); this.spawnShell(true); this.game.audio.shellDingHeavy(); } } // 拉栓枪声响起时同时抛出弹壳
    // 散弹枪泵动上膛音（射击 0.35s 后触发）
    if(this.shotgunRackSfxT>0){ this.shotgunRackSfxT-=dt; if(this.shotgunRackSfxT<=0){ this.shotgunRackSfxT=-1; this.game.audio.shotgunRack(); } }
    // 狙击拉栓动作动画（拉机柄上抬后拉再复位）
    if(cur==='sniper' && this.sniperBoltHandle){
      const bp=this.shotCd>0?1-this.shotCd/0.8:1;
      let bk=0;
      if(bp<0.35) bk=bp/0.35; else bk=1-(bp-0.35)/0.65;
      this.sniperBoltHandle.rotation.x=-1.0*bk;
      this.sniperBoltHandle.position.z=0.18+0.08*bk;
      this.sniperBoltHandle.position.y=0.05+0.025*bk;
    }
    this.updateReload(dt);
    this.updateSwing(dt);
    this.updateStock(dt);
    this.updateShells(dt);
  }
  reset(){
    this.restoreHands(); // 还原所有手部可见性（确保进入游戏后 FPS 持枪手正常显示）
    this.ammo=15; this._ammoStore={pistol:15,rifle:30,sks:10,sniper:5,shotgun:6,remington:4,thompson:30,sten:32};
    this.reserve={pistol:45,m1911:21,rifle:90,sks:50,sniper:20,shotgun:24,remington:20,thompson:120,sten:160};
    this._reloadTarget=0;
    this.reloading=false; this.reloadTimer=0;
    this.shotCd=0; this.boltSfxT=-1; this.shotgunRackSfxT=-1;
    // 按开局选枪结果设置初始主武器（手枪为副武器常驻）
    const loadout=this.game&&this.game.loadout?this.game.loadout:'ar';
    const initial=loadoutWeapon(loadout);
    this.current=initial;
    this._tryLoadWeaponGLB(initial); // 首次进入战场触发GLB懒加载
    this.magSize=(this.computed[initial]||this.computed.pistol).magSize;
    this.ammo=this._ammoStore[initial]||this.magSize;
    this.ammo=Math.min(this.ammo,this.magSize);
    this.swingAnim=0; this.stockAnim=0; this.stockCd=0;
    this.autoFiring=false; this.autoFireTimer=0; this.shotsInBurst=0;
    this.crossRecoil=0; this.gunPush=0;
    this.inspectAnim=0; this.inspectCd=0;
    this.jammed=false; this.jamCd=0; this.clearJamTimer=0;
    this.pistolGroup.visible=false; this.knifeGroup.visible=false; this.rifleGroup.visible=false; this.sksGroup.visible=false; this.sniperGroup.visible=false; this.shotgunGroup.visible=false; this.remingtonGroup.visible=false; this.thompsonGroup.visible=false; this.stenGroup.visible=false;
    let vis=this.knifeGroup;
    if(initial==='pistol') vis=this.pistolGroup; else if(initial==='rifle') vis=this.rifleGroup; else if(initial==='sks') vis=this.sksGroup; else if(initial==='sniper') vis=this.sniperGroup; else if(initial==='shotgun') vis=this.shotgunGroup; else if(initial==='remington') vis=this.remingtonGroup; else if(initial==='thompson') vis=this.thompsonGroup; else if(initial==='sten') vis=this.stenGroup;
    vis.visible=true;
    this.game.refreshAmmoUI();
    this.game.updateWeaponUI(this.current);
  }
  // 还原所有武器模型中的手部部件（userData.isHand 标记；动作系统接管后保持隐藏）
  restoreHands(){
    const v=this.handsHidden?false:true;
    for(const key of ['pistol','knife','rifle','sks','sniper','shotgun','remington','thompson']){
      const grp=this[key+'Group'];
      if(grp) grp.traverse(o=>{ if(o.userData&&o.userData.isHand) o.visible=v; });
    }
  }
  // 隐藏所有武器模型中的程序化手部（第一人称手臂动作系统接管后调用，避免双套手臂）
  hideHands(){
    this.handsHidden=true;
    for(const key of ['pistol','knife','rifle','sks','sniper','shotgun','remington','thompson']){
      const grp=this[key+'Group'];
      if(grp) grp.traverse(o=>{ if(o.userData&&o.userData.isHand) o.visible=false; });
    }
  }
}

/* ============================================================
   第一人称手臂动作系统（2026-08-12）
   ------------------------------------------------------------
   加载 基础射手包/ 下全部 Mixamo 动作（仅骨骼，无网格）：
   - 以 idle 文件的骨架为基准，挂载程序化可见手臂（肩/上臂/前臂/手）
   - 其余文件只提取动画剪辑，加入同一 AnimationMixer（骨骼名完全一致）
   - 每个文件取【最后一个】剪辑（累积导出，末尾为自身动作）
   - 只应用旋转轨道（位移轨道为异常根运动，忽略防骨架飞走）
   - 基准模型 runReload.glb（含真实人物网格）；从全身蒙皮中提取手臂子网格
   - 状态机：循环状态自由切换；单次动画（fire/reload/hit/jump/turnLeft）
     播放期间阻止切换，结束后回到 previousState；reload 优先级最高
============================================================ */
class AnimSystem{
  constructor(game){
    this.game=game;
    this.root=null;          // 基准骨架（含骨骼层级 + 真实人物网格）
    this.mixer=null;
    this.actions={};         // state -> AnimationAction
    this.durations={};       // state -> 动画实际时长（秒，自动从文件读取）
    this.state='idle';
    this.previousState='idle';
    this.oneShot=null;       // {state,timer} 当前播放中的单次动画
    this.ready=false;
    this._fade=ANIM_FADE;
    this._prevYaw=0; this._turnCd=0;
    this.lastReloadState='reload'; // 最近一次换弹选用的动画状态（原地/走路/跑步）
    this._kneeling=false;          // 手枪跪姿标志（Ctrl 按住进入，松开站起）
  }
  load(){
    const g=this.game;
    const pending=[];        // 骨架未就绪前暂存的剪辑
    let remaining=ANIM_DEFS.length+2+PISTOL_ANIM_DEFS.length; // 基准(runReload) + walkReload + 长枪动作 + 手枪动作
    const finish=()=>{ if(--remaining<=0) this._onAllLoaded(); };
    const setupBase=(gltf)=>{          // 建立骨架 + 挂载 + 创建 mixer
      this.root=gltf.scene;
      this._setupRoot();
      this.mixer=new THREE.AnimationMixer(this.root);
      // 基准文件 runReload.glb 的最后一个剪辑 = 跑步换弹（累积导出，末尾为自身动作）
      const rc=gltf.animations&&gltf.animations[gltf.animations.length-1];
      if(rc&&!this.actions.runReload) this._addClip('runReload',rc,false);
      for(const it of pending){ this._addClip(it.state,it.clip,it.loop); }
      pending.length=0;
      this._playIdle();
      finish();
    };
    // 基准模型：runReload.glb（含真实人物网格 + 完整 mixamorig 骨架 + 跑步换弹动画）；加载失败退回 idle 文件骨架
    g.weapon._loadGLB(ANIM_DIR+'runReload.glb',setupBase,()=>{
      g.weapon._loadGLB(ANIM_DIR+ANIM_DEFS[0].file,setupBase,finish);
    });
    // 走路换弹（walkReload.glb，最后一个剪辑 = 自身动作 4.13s）；只需动画数据，释放其网格显存
    g.weapon._loadGLB(ANIM_DIR+'walkReload.glb',(gltf)=>{
      const clip=gltf.animations&&gltf.animations[gltf.animations.length-1];
      if(this.mixer&&clip) this._addClip('walkReload',clip,false);
      else pending.push({state:'walkReload',clip:clip,loop:false});
      gltf.scene.traverse(c=>{ if(c.isMesh){ if(c.material)c.material.dispose(); if(c.geometry)c.geometry.dispose(); } });
      finish();
    },()=>finish());
    // 各动作文件：只提取剪辑（与基准骨架同名绑定）
    for(let i=0;i<ANIM_DEFS.length;i++){
      const def=ANIM_DEFS[i];
      g.weapon._loadGLB(ANIM_DIR+def.file,(gltf)=>{
        const clip=gltf.animations&&gltf.animations[gltf.animations.length-1];
        if(this.mixer&&clip) this._addClip(def.state,clip,def.loop);
        else pending.push({state:def.state,clip:clip,loop:def.loop});
        finish();
      },()=>finish());
    }
    // 手枪动作（骨骼与基准一致，最后一个剪辑=自身动作）
    for(let i=0;i<PISTOL_ANIM_DEFS.length;i++){
      const def=PISTOL_ANIM_DEFS[i];
      g.weapon._loadGLB(PISTOL_ANIM_DIR+def.file,(gltf)=>{
        const clip=gltf.animations&&gltf.animations[gltf.animations.length-1];
        if(this.mixer&&clip) this._addClip(def.state,clip,def.loop);
        else pending.push({state:def.state,clip:clip,loop:def.loop});
        finish();
      },()=>finish());
    }
  }
  // 骨架挂载：位置/朝向/缩放 + 挂到相机（独立动画，枪跟随手）+ 提取真实手臂网格（失败则程序化手臂兜底）
  _setupRoot(){
    const root=this.root;
    // 手臂挂在相机下独立播放动画；武器组位置每帧跟随右手（见 Weapon.update 末尾“枪跟随手”）
    root.position.copy(ANIM_ARM_POS);
    root.rotation.copy(ANIM_ARM_ROT);
    root.scale.setScalar(ANIM_ARM_SCALE);
    root.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; } });
    this.game.camera.add(root);
    root.visible=false; // 开局前隐藏
    // 优先使用真实人物网格（提取手臂蒙皮）；无网格/提取失败时退回程序化手臂
    if(!this._extractArmMeshes()) this._buildArms();
    if(this.game.weapon) this.game.weapon.hideHands(); // 动作系统接管：隐藏程序化手部
  }
  // 从全身蒙皮网格提取"手臂"子网格（删除非手臂骨骼影响的顶点），FPS 视角只显示手臂
  // 返回是否成功（存在蒙皮网格且有手臂顶点）
  _extractArmMeshes(){
    const root=this.root;
    const skinned=[];
    root.traverse(o=>{ if(o.isSkinnedMesh) skinned.push(o); });
    if(!skinned.length) return false;
    // 手臂骨骼名称集合（不含躯干/头/腿，避免遮挡视线）
    const armNames=new Set(['LeftShoulder','LeftArm','LeftForeArm','LeftHand',
      'RightShoulder','RightArm','RightForeArm','RightHand']);
    for(const side of ['Left','Right']){
      for(const finger of ['Index','Middle','Pinky','Ring','Thumb']){
        for(let i=1;i<=4;i++) armNames.add(side+finger+i);
      }
    }
    // 骨骼顺序以 skeleton.bones 为准（= skin.joints 顺序 = skinIndex 引用顺序）
    const skeleton=skinned[0].skeleton;
    const bones=skeleton.bones;
    const armSet=new Set();
    for(let i=0;i<bones.length;i++){
      if(armNames.has(bones[i].name.replace('mixamorig',''))) armSet.add(i);
    }
    let any=false;
    for(const sm of skinned){
      const geo=sm.geometry;
      const pos=geo.attributes.position;
      const sIdx=geo.attributes.skinIndex;
      const sW=geo.attributes.skinWeight;
      if(!pos||!sIdx||!sW) continue;
      const count=pos.count;
      const norm=geo.attributes.normal;
      const uv=geo.attributes.uv;
      const idx=geo.index;
      const keep=new Int32Array(count).fill(-1); // 原顶点索引 -> 新索引
      const P=[],N=[],U=[],SI=[],SW=[],I=[];
      let nv=0;
      for(let i=0;i<count;i++){
        let ok=false;
        for(let b=0;b<4;b++){
          if(sW.getComponent(i,b)>0.3&&armSet.has(sIdx.getComponent(i,b))){ ok=true; break; }
        }
        if(!ok) continue;
        keep[i]=nv++;
        P.push(pos.getX(i),pos.getY(i),pos.getZ(i));
        if(norm) N.push(norm.getX(i),norm.getY(i),norm.getZ(i));
        if(uv) U.push(uv.getX(i),uv.getY(i));
        SI.push(sIdx.getX(i),sIdx.getY(i),sIdx.getZ(i),sIdx.getW(i));
        SW.push(sW.getX(i),sW.getY(i),sW.getZ(i),sW.getW(i));
      }
      if(!nv) continue; // 该网格无手臂顶点
      if(idx){
        for(let t=0;t<idx.count;t+=3){
          const a=idx.getX(t),b=idx.getX(t+1),c=idx.getX(t+2);
          if(keep[a]>=0&&keep[b]>=0&&keep[c]>=0) I.push(keep[a],keep[b],keep[c]);
        }
      }
      const ng=new THREE.BufferGeometry();
      ng.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
      if(N.length) ng.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
      if(U.length) ng.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
      // skinIndex 保持原类型（Uint16/Uint8）
      ng.setAttribute('skinIndex',new THREE.BufferAttribute(new (sIdx.array.constructor)(SI),4));
      ng.setAttribute('skinWeight',new THREE.BufferAttribute(new Float32Array(SW),4));
      if(I.length) ng.setIndex(I);
      if(!N.length) ng.computeVertexNormals();
      const nm=new THREE.SkinnedMesh(ng,sm.material);
      nm.bind(skeleton,sm.bindMatrix);
      nm.castShadow=false; nm.receiveShadow=false;
      // 与原网格同父同变换（Armature 下），隐藏原全身网格
      nm.position.copy(sm.position); nm.quaternion.copy(sm.quaternion); nm.scale.copy(sm.scale);
      sm.parent.add(nm);
      sm.visible=false;
      if(sm.geometry) sm.geometry.dispose();
      any=true;
    }
    if(any) console.log('[Anim] 已提取真实人物手臂网格');
    return any;
  }
  // 程序化手臂：肩球+上臂+前臂+手，挂到对应骨骼上由动画驱动（Mixamo 骨骼沿局部 +Y 延伸）
  _buildArms(){
    const root=this.root;
    const sleeve=new THREE.MeshStandardMaterial({color:0x3d4a2e,roughness:0.95}); // 军绿袖子（与程序化拳头一致）
    const glove =new THREE.MeshStandardMaterial({color:0x33372f,roughness:0.85}); // 手套
    const seg=24;
    const build=(side)=>{
      const upper=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.043,0.28,seg),sleeve);
      upper.position.y=0.14; // 肩→肘
      const fore=new THREE.Mesh(new THREE.CylinderGeometry(0.043,0.036,0.28,seg),sleeve);
      fore.position.y=0.14;  // 肘→腕
      const hand=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.10,0.09),glove);
      hand.position.y=0.03;  // 腕→指
      const shoulder=new THREE.Mesh(new THREE.SphereGeometry(0.045,12,10),sleeve);
      // ?? GLTFLoader 已将骨名中的 ':' 去掉（mixamorigLeftArm），用无冒号名查找
      const armBone=root.getObjectByName('mixamorig'+side+'Arm');
      const foreBone=root.getObjectByName('mixamorig'+side+'ForeArm');
      const handBone=root.getObjectByName('mixamorig'+side+'Hand');
      const shoulderBone=root.getObjectByName('mixamorig'+side+'Shoulder');
      if(armBone) armBone.add(upper);
      if(foreBone) foreBone.add(fore);
      if(handBone) handBone.add(hand);
      if(shoulderBone) shoulderBone.add(shoulder);
    };
    build('Left'); build('Right');
    // 加载完成后打印手部世界位置（帮助调整 ANIM_ARM_POS）
    setTimeout(()=>{
      if(!this.ready||!this.root) return;
      const lh=this.root.getObjectByName('mixamorigLeftHand');
      const rh=this.root.getObjectByName('mixamorigRightHand');
      if(lh&&rh){
        const l=new THREE.Vector3(), r=new THREE.Vector3();
        lh.getWorldPosition(l); rh.getWorldPosition(r);
        console.log('[Anim] 手臂就绪 LH=(%s) RH=(%s) 时长=%s',
          l.toArray().map(v=>v.toFixed(2)).join(','),
          r.toArray().map(v=>v.toFixed(2)).join(','),
          JSON.stringify(this.durations));
      }
    },300);
  }
  // 提取剪辑：只保留旋转轨道（忽略异常根位移），轨道名去掉 ':'（GLTFLoader 场景骨名已去冒号）
  // 完整保留脊柱/手臂动画：枪跟随右手方案下右手相对枪恒在握把位，无需抑制脊柱（抑制会破坏持枪姿态）
  _addClip(state,clip,loop){
    if(!clip||this.actions[state]) return;
    const tracks=clip.tracks
      .filter(t=>t.name.endsWith('.quaternion'))
      .map(t=>{ t.name=t.name.replace(/:/g,''); return t; });
    const c=new THREE.AnimationClip(state,clip.duration,tracks);
    const action=this.mixer.clipAction(c);
    action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce);
    action.clampWhenFinished=true;
    action.setEffectiveWeight(0);
    this.actions[state]=action;
    this.durations[state]=c.duration;
  }
  _playIdle(){
    if(this.actions.idle){
      this.actions.idle.reset();
      this.actions.idle.setEffectiveWeight(1);
      this.actions.idle.play();
      this.state='idle'; this.previousState='idle';
    }
    this.ready=true;
  }
  _onAllLoaded(){
    // 基准文件已加载但尚未播空闲时兜底
    if(this.root&&this.mixer&&!this.ready&&this.actions.idle) this._playIdle();
  }
  // 状态切换：fadeIn/fadeOut 交叉淡入淡出
  play(state){
    const next=this.actions[state];
    if(!next) return;
    if(state===this.state) return;
    const cur=this.actions[this.state];
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(this._fade);
    next.play();
    if(cur) cur.fadeOut(this._fade);
    this.state=state;
  }
  // 触发单次动画（fire/reload/walkReload/runReload/hit/jump/turnLeft 等）；返回是否接受
  startOneShot(state){
    if(!this.ready||!this.actions[state]) return false;
    // 手枪跳跃用专门动作（手枪动作GLB格式/）
    const wc=this.game.weapon?this.game.weapon.current:'rifle';
    if(state==='jump'&&wc==='pistol'&&this.actions.pistolJump) state='pistolJump';
    // 手枪无专用开火动画：沿用长枪 fire 会让手臂大幅乱动（枪跟手下枪被拖退/左手前伸）；
    // 保持持枪姿势不动，后坐力由枪身旋转上跳（recoilPitch）+ 枪口闪光表现（2026-08-12 用户要求“手不动，只是有后坐力”）
    if(state==='fire'&&wc==='pistol') return false;
    const cur=this.oneShot?this.oneShot.state:null;
    const reloadState=(s)=>s==='reload'||s==='walkReload'||s==='runReload';
    if(reloadState(cur)) return false;                                  // 换弹优先级最高（含走/跑换弹），任何操作不可打断
    if(cur==='hit'&&state!=='hit'&&!reloadState(state)) return false;   // 受击播放中：仅换弹可打断
    // 重复触发同一单次动画（连发/连续受击）：重置计时从头播放
    if(cur===state){
      this.oneShot.timer=this.durations[state]||1;
      const a=this.actions[state]; if(a){ a.reset(); a.setEffectiveWeight(1); a.play(); }
      return true;
    }
    if(!this.oneShot) this.previousState=this.state; // 记录播放前的循环状态（结束后返回）
    this.oneShot={state:state, timer:this.durations[state]||1};
    this.play(state);
    return true;
  }
  // 换弹：按玩家当前水平移动速度选择换弹动画（静止<0.5 原地 reload / 0.5~3.0 走路 walkReload / ≥3.0 跑步 runReload）
  startReload(){
    const p=this.game.player;
    const h=p.vel?Math.hypot(p.vel.x,p.vel.z):0;
    let state='reload';
    if(h>=3.0&&this.actions.runReload) state='runReload';
    else if(h>=0.5&&this.actions.walkReload) state='walkReload';
    this.lastReloadState=state;
    return this.startOneShot(state);
  }
  // 落地：提前结束 jump 动画回到之前状态
  onLand(){
    if(this.oneShot&&this.oneShot.state==='jump'){
      this.oneShot=null;
      this.play(this.previousState);
    }
  }
  reset(){
    this.oneShot=null; this._turnCd=0; this._prevYaw=0; this._kneeling=false;
    for(const k in this.actions){
      const a=this.actions[k];
      a.stop(); a.setEffectiveWeight(0);
    }
    if(this.actions.idle){
      this.actions.idle.reset();
      this.actions.idle.setEffectiveWeight(1);
      this.actions.idle.play();
    }
    this.state='idle'; this.previousState='idle';
  }
  // 每帧驱动：单次动画计时 / 循环状态判定 / 左转身检测 / 手枪跪姿 / mixer 更新
  update(dt){
    if(!this.ready||!this.mixer||!this.root) return;
    const p=this.game.player;
    const wc=this.game.weapon?this.game.weapon.current:'rifle';
    // 手枪用真实手臂播放手枪动作；刀仍用程序化持枪手（无刀动作）
    const procWeapon=(wc==='knife');
    if(procWeapon){
      if(this.game.weapon.handsHidden){ this.game.weapon.handsHidden=false; this.game.weapon.restoreHands(); }
    } else {
      // 非刀时无条件隐藏武器模型内置的程序化手，杜绝残留/双套手（2026-08-12）
      this.game.weapon.hideHands();
    }
    // 手枪跪姿：Ctrl 按住进入（站→跪→跪姿待机），松开站起（跪→站→待机）
    if(wc==='pistol'){
      const crouchWant=!!(this.game.keys&&this.game.keys.ctrl);
      if(crouchWant && !this._kneeling){
        this._kneeling=true;
        this.startOneShot('pistolStandToKneel');
      } else if(!crouchWant && this._kneeling){
        this._kneeling=false;
        this.startOneShot('pistolKneelToStand');
      }
    }
    // 菜单/结算 或 刀 时隐藏手臂；开镜(瞄准)时手臂保持可见——开镜时“手跟枪”：
    // 手臂骨架由 Weapon.update 末尾每帧对齐到枪的握把（见 Weapon.update），本处只需复位到基准位
    if(this.game.state!=='PLAYING'||procWeapon){
      if(this.root.visible) this.root.visible=false;
    } else if(!this.root.visible) this.root.visible=true;
    this.root.position.copy(ANIM_ARM_POS); // 开镜时会被 Weapon.update 的“手跟枪”覆盖为握把对齐位
    // 移动时手与枪摆动（2026-08-12）：跑动/走路时手臂骨架叠加 bob 摆动（枪跟手随之一起摆），
    // 幅度 ANIM_BOB_MUL、频率 ANIM_BOB_RATE 可调（用户要求“摆动再大”→后调“再稍慢、再小点”）；开镜不叠加（瞄准稳定）
    if(this.game.state==='PLAYING'&&!procWeapon&&p.ads<=0.5){
      const hSpeed=p.vel?Math.hypot(p.vel.x,p.vel.z):0;
      if(hSpeed>0.5&&p.onGround){
        const ph=p.bobPhase*ANIM_BOB_RATE;                        // 慢化的摆动相位
        const amp=0.05*(p.sprinting?1.3:1)*ANIM_BOB_MUL;          // 与视角 bob 同源幅度（走路0.05/冲刺0.065）
        this.root.position.x+=Math.sin(ph)*amp*0.5;               // x 摆动（0.5 系数与 bobX 一致）
        this.root.position.y+=Math.sin(ph*2)*amp;                 // y 摆动（2 倍频与 bobY 一致）
      }
    }
    this.root.rotation.copy(ANIM_ARM_ROT);
    // 快速左转（原地大幅左转视角触发转身动画，单次；yaw 增大=向左转）
    if(this._turnCd>0) this._turnCd-=dt;
    const yawVel=(p.yaw-this._prevYaw)/Math.max(dt,1e-4);
    this._prevYaw=p.yaw;
    if(this._turnCd<=0 && !this._hasMove() && p.ads<=0.5 && yawVel>ANIM_TURN_SPEED){  // 开镜中不触发转身动画（手臂已上抬瞄准）
      this._turnCd=ANIM_TURN_CD;
      this.startOneShot('turnLeft');
    }
    // 单次动画播放中：阻止其他状态切换
    if(this.oneShot){
      this.oneShot.timer-=dt;
      if(this.oneShot.timer<=0){
        this.oneShot=null;
        // 结束后回到播放前状态；跪姿中回跪姿待机，移动中直接衔接移动循环动画
        this.play(this._kneeling?'pistolKneelingIdle':this._computeLoopState());
      } else {
        this.mixer.update(dt);
        return;
      }
    }
    // 计算目标循环状态（移动/待机；手枪跪姿时为跪姿待机）
    const target=this._kneeling?'pistolKneelingIdle':this._computeLoopState();
    if(target!==this.state) this.play(target);
    // 跑步动画按实际移速调整 timeScale（防止脚滑）
    if(this.state==='run'&&this.actions.run&&p.vel){
      const h=Math.hypot(p.vel.x,p.vel.z);
      this.actions.run.timeScale=clamp(h/ANIM_RUN_RATE,0.4,1.6);
    }
    this.mixer.update(dt);
    // 缓存腰射待机时右手相对骨架的偏移（供开镜跳跃的“起跳上晃/落地下晃”计算，2026-08-12）：
    // 开镜跳跃时手/枪跟随跳跃动画的位移（与腰射跳跃晃动一致），而不是叠加持续 sin 摆动
    if((this.state==='idle'||this.state==='pistolIdle')&&p.ads<=0.5&&!procWeapon){
      const rh=this.root.getObjectByName('mixamorigRightHand');
      if(rh){
        const v=this._rhIdleRel||(this._rhIdleRel=new THREE.Vector3());
        rh.getWorldPosition(v);
        this.game.camera.worldToLocal(v);
        v.sub(this.root.position);
      }
    }
  }
  _hasMove(){
    const k=this.game.keys||{};
    return !!(k.w||k.s||k.a||k.d);
  }
  // 目标循环状态：按武器区分手枪/长枪动作（手枪：idle/run/runBackward/弧线/strafe；长枪：原逻辑）
  _computeLoopState(){
    const k=this.game.keys||{};
    const wc=this.game.weapon?this.game.weapon.current:'rifle';
    const isPistol=(wc==='pistol');
    let ix=0,iz=0;
    if(k.w) iz+=1; if(k.s) iz-=1;
    if(k.a) ix-=1; if(k.d) ix+=1;
    if(iz>0){ // 前进：手枪斜向移动用弧线走/跑
      if(!isPistol) return 'run';
      return (ix!==0)?(k.shift?'pistolRunArc':'pistolWalkArc'):'pistolRun';
    }
    if(iz<0){ // 后退：手枪走=弧线后退走，跑=后退跑
      if(!isPistol) return (k.shift?'runBackward':'walkBackward');
      return (k.shift?'pistolRunBackward':'pistolWalkBackwardArc');
    }
    if(ix<0) return isPistol?'pistolStrafe':'strafeLeft';
    if(ix>0) return isPistol?'pistolStrafe':'strafeRight';
    return isPistol?'pistolIdle':'idle';
  }
}

/* ============================================================
   游戏主类
============================================================ */
class Game{
  constructor(){
    this.state='MENU';   // 主题界面：游戏未开始
    this.started=false;  // 是否已进入过战场
    this.time=0;
    this.kills=0; this.score=0;
    this.lowPerfShown=false; this.downgraded=false;
    this.health100=100;
    this.particlesPool=null;
    this.envMeshes=[];
    this.colliders=[];
    this.lamps=[];
    this.dmgNumbers=[];
    this.dmgRingTimers={up:0,down:0,left:0,right:0};
    this.crossSpread=10;
    this.crossY=0; // 新增功能：准心垂直偏移（后坐力上移）
    this.fpsFrames=0; this.fpsTime=0; this.lowPerfCounter=0;
    this.camShake=0; this.camPush=0;
    this.houses=[]; this.flouroLights=[]; // 新增功能：可进入房屋系统
    this.boundaryProps=[]; this.boundaryLights=[]; // 新增功能：非规则破损边界
    this.radTick=0; // 边界辐射伤害计时
    // 新增功能：外挂 3D 地图（2026-08-11 替代程序化地图）
    this.mapHalfW=50; this.mapHalfL=50; // 地图半宽/半长（模型加载后更新：宽 100、长按比例）
    this.mapReady=false;
    this.boundaryColliders=[]; // 边界围墙碰撞体（强制边界）
    // 新增功能：设置菜单（Esc）
    this.settings={sensitivity:1.0,volume:0.8,assist:false};
    this.settingsOpen=false;
    // 新增功能：幸存者档案（localStorage 持久化统计）
    this.stats={kills:0,maxWave:1,maxSurvival:0,maxHeadshot:0,games:0,totalTime:0};
    this.runTime=0; this.runMaxSurvival=0; this.runMaxHeadshot=0;
    // 新增功能：开局选枪（localStorage 记忆上次选择）
    this.loadout='ar';
    try{ const whitelist=['ar','sk','sks','sr','sg','sg2','th']; if(!HIDE_STEN) whitelist.push('st'); whitelist.push('knife'); const l=localStorage.getItem('mrTw_loadout'); if(whitelist.includes(l)) this.loadout=l; }catch(e){}
    this._pendingReset=false; // 新增功能：Tab 回选枪页后重新开始标记
    this.mode='bio';
    this.previewAngle=0; // 主菜单 3D 预览旋转角
    this._lastScopeDrawn=null; // 已绘制的瞄准镜分划类型
    this._armorySel='rifle';  // 武器库当前选中武器
    this._wpWeaponKey=null;   // 武器库预览当前挂载的武器
    // 新增功能：昼夜随机模式
    this.isDay=Math.random()<0.5;
    
    this.ammoCrates=[]; // 弹药箱（塔科夫硬核：F 搜刮补给后备弹药）
    this._crateModel=null; // 3D武器箱模型缓存（2026-08-12）
    this._compassBuilt=false;
  }
  init(){
    const wrap=$('gameLayer');
    // ---- 渲染器（容错创建）----
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    }catch(e){
      try{ this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'default'}); }catch(e2){
        wrap.innerHTML='<div style="color:#fff;text-align:center;padding-top:200px;font-size:20px;">?? 无法创建WebGL渲染器<br><small>请检查浏览器是否支持WebGL，或尝试重启浏览器</small></div>';
        return;
      }
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.25));
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.5; // 基础曝光（随后 _applyDayNight 按昼夜覆盖）
    wrap.appendChild(this.renderer.domElement);

    // ---- CSS2D ----
    this.css2d=new CSS2DRenderer();
    this.css2d.setSize(window.innerWidth,window.innerHeight);
    $('css2d').appendChild(this.css2d.domElement);

    // ---- 场景/相机 ----
    this.scene=new THREE.Scene();
    this.scene.fog=new THREE.FogExp2(0x1a1e1a,0.0065/MAP_SCALE); // 雾密度随地图等比稀释（原 100 宽 0.0065）
    this.scene.background=new THREE.Color(0x2a3a4a);
    this.camera=new THREE.PerspectiveCamera(80,window.innerWidth/window.innerHeight,0.1,MAP_TARGET_WIDTH*2.4); // far 覆盖全图+穹顶
    this.camera.rotation.order='YXZ';
    // ---- 纹理 ----
    this.tex={
      concrete:makeConcreteTexture(), roughness:makeRoughnessTexture(),
      vehicleRed:makeVehicleTexture('red'), vehicleGreen:makeVehicleTexture('green'),
      tire:makeTireTexture(), crate:makeCrateTexture(),
      grip:makeGripTexture(), wrap:makeWrapTexture(), mist:makeMistTexture(),
      hatch:makeHatchTexture(),
      houseWall:makeHouseWallTexture(), roofTile:makeRoofTileTexture(),
      woodFloor:makeWoodFloorTexture(), blood:makeBloodTexture(),
      nightSky:makeNightSkyTexture(), moon:makeMoonTexture(),
      charredRing:makeCharredRingTexture(), radSign:makeRadiationSignTexture(),
      barbedWire:makeBarbedWireTexture(),
      csGround:makeCSGroundTexture(), csRough:makeCSRoughnessTexture() // CS 1.6 沙漠地面
    };

    // ---- 环境 ----
    this.envMeshes=[];
    this.colliders=[];
    this.lamps=[];
    // 环境光 + 半球光（场景整体调亮，保持黄昏废墟色调）
    // 保存光照引用（供昼夜切换）——环境光 + 半球光
    this.ambientLight=new THREE.AmbientLight(0x3a4b5c,0.7);
    this.scene.add(this.ambientLight);
    this.hemiLight=new THREE.HemisphereLight(0xffddaa,0x5a2a1a,0.8);
    this.scene.add(this.hemiLight);
    // 主方向光（冷色，夜晚主光）
    this.sunLight=new THREE.DirectionalLight(0x9fb4c8,1.4);
    this.sunLight.position.set(12,18,8);
    this.sunLight.castShadow=true;
    this.sunLight.shadow.mapSize.set(512,512);
    this.sunLight.shadow.camera.left=-55; this.sunLight.shadow.camera.right=55;
    this.sunLight.shadow.camera.top=55; this.sunLight.shadow.camera.bottom=-55;
    this.sunLight.shadow.camera.far=80;
    scene_shadow(this.sunLight,this);
    this.scene.add(this.sunLight);
    // 白天专用太阳光（暖白，仅白天启用）
    this.daySun=new THREE.DirectionalLight(0xfff5e6,1.35);
    this.daySun.position.set(30,40,20);
    this.daySun.castShadow=true;
    this.daySun.shadow.mapSize.set(512,512);
    this.daySun.shadow.camera.left=-55; this.daySun.shadow.camera.right=55;
    this.daySun.shadow.camera.top=55; this.daySun.shadow.camera.bottom=-55;
    this.daySun.shadow.camera.far=90;
    this.daySun.visible=false;
    this.scene.add(this.daySun);

    buildEnvironment(this);
    // 新增功能：碰撞体空间索引（提升碰撞检测性能）
    this.buildColliderGrid();

    // ---- 系统 ----
    this.audio=new AudioSystem();
    this.pool=new SpritePool(this.scene,{
      glow:makeGlowTexture(), slash:makeSlashTexture()
    });
    this.decals=new DecalSystem(this.scene);
    this.player=new Player(this.camera,this.colliders);
    this.player.game=this;
    this.weapon=new Weapon(this);
    this.camera.add(this.weapon.group);
    // 新增功能：第一人称手臂动作系统（2026-08-12，Mixamo 动作包）
    this.anim=new AnimSystem(this);
    this.anim.load();
    this.scene.add(this.camera);
    this.zombies=new ZombieManager(this);
    this.zombies.game=this;
    // Boss 战状态（第六波，2026-08-11 新增）
    this.bossSpawned=false; this.bossAlive=false; this.bossActive=false;
    this.bossInstance=null; this.minionTimer=0;

    // 初始玩家位置
    this.player.pos.set(0,0,0);

    this._bindInput();
    this._bindUI();
    this._loadSettings();   // 新增功能：读取 localStorage 设置
    this._loadStats();      // 新增功能：读取 localStorage 战绩
    this._applyDayNight();  // 新增功能：昼夜随机模式
    this._bindSettingsUI(); // 新增功能：设置菜单交互
    this._bindStatsUI();    // 新增功能：战绩面板交互
    this._bindLoadout();    // 新增功能：开局选枪菜单
    this._buildScopeOverlay(); // 新增功能：狙击镜十字线 Canvas
    this._buildCompass();   // 新增功能：顶部战术罗盘（主动构建，避免首帧节流延迟）
    window.addEventListener('resize',()=>this._resize());
    this._startClock();
    // 新增功能：主题界面生成静态僵尸作为背景——未开局不更新故不会移动，开局时由 startGame→_resetRun 重置
    this.zombies.spawnWave(1);
    this.refreshHPUI(); this.refreshAmmoUI(); this.updateWaveUI(1); this.updateWeaponUI('pistol');

    this._checkTutorial();
    // 预加载武器箱3D模型（2026-08-12 替换程序化 BoxGeometry）
    const crateLoader=new GLTFLoader();
    crateLoader.load('models/武器箱_box.glb',(gltf)=>{
      gltf.scene.traverse(c=>{
        if(c.isMesh){ c.castShadow=true; c.receiveShadow=true; }
        if(c.material){
          const mats=Array.isArray(c.material)?c.material:[c.material];
          for(const mat of mats){
            for(const key of['map','aoMap','roughnessMap','metalnessMap','normalMap','emissiveMap','alphaMap','bumpMap','displacementMap']){
              const tex=mat[key]; if(tex&&tex.image&&(tex.image.width>256||tex.image.height>256)){
                const cv=document.createElement('canvas'); cv.width=cv.height=256;
                cv.getContext('2d').drawImage(tex.image,0,0,256,256);
                tex.image=cv; tex.needsUpdate=true;
              }
            }
          }
        }
      });
      this._crateModel=gltf.scene;
      console.log('? 武器箱3D模型加载成功（纹理已压缩至256×256）');
    },undefined,()=>{
      console.warn('?? 武器箱模型加载失败，使用程序化兜底');
    });
    // 菜单预览已移除（避免双WebGL上下文导致黑屏）

    // 首帧
    this._prev=performance.now();
    this._loop=this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  _startClock(){ this.clock=new THREE.Clock(); }
  _loop(){
    requestAnimationFrame(this._loop);
    const now=performance.now();
    const dt=Math.min(0.05,(now-this._prev)/1000);
    this._prev=now;
    this.time+=dt;
    if(this.state==='PLAYING') this._update(dt);
    else this._updateAmbient(dt);
    try{ this._render(); }catch(e){ console.error('Render error:',e); }
    this._fps(dt);
    try{ this._updateUI(); }catch(e){ console.error('UI error:',e); }
  }
  // 氛围动画（菜单/暂停时仍让雾、灰尘、路灯、粒子活动）
  _updateAmbient(dt){
    this.pool.update(dt);
    this.decals.update(dt);
    this._updateDust(dt);
    this._updateLamps(dt);
    this._updateSky(dt);
    this._updateBoundary(dt);
    if(this.mistMat){ this.mistMat.opacity=0.2+0.1*Math.sin(this.time*0.8); }
    if(this.mistMat2){ this.mistMat2.opacity=0.12+0.08*Math.sin(this.time*0.6+1.5); }
    this.audio.updateListener(this.camera);
    $('sprintRipple').style.opacity=0;
    $('lowHpVignette').style.opacity=0;
  }
  _update(dt){
    this._updateAmbient(dt);
    this.player.update(dt,this.keys);
    this.anim.update(dt); // 第一人称手臂动作系统
    this.weapon.update(dt,this.time);
    this.zombies.update(dt);
    this._updateBoss(dt); // 第六波 Boss 战：小兵刷新 + Boss 血量条
    this.runTime+=dt;
    if(this.player.alive&&this.runTime>this.runMaxSurvival) this.runMaxSurvival=this.runTime;
    // 冲刺波纹
    $('sprintRipple').style.opacity=this.player.sprinting?1:0;
    // 相机震动
    this.camShake=lerp(this.camShake,0,Math.min(1,dt*8));
    if(this.camShake>0.001){
      this.camera.position.x+=(Math.random()-0.5)*this.camShake*0.08;
      this.camera.position.y+=(Math.random()-0.5)*this.camShake*0.06;
    }
    // 相机前冲（枪托）
    if(this.player.camPush>0){
      this.player.camPush=lerp(this.player.camPush,0,Math.min(1,dt*20));
      const fwd=new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      this.camera.position.addScaledVector(fwd,this.player.camPush*0.5);
    }
    // 新增功能：低血量(HP<20)轻微红色提示
    const lowHp=this.player.alive&&this.player.health<20;
    $('lowHpVignette').style.opacity=lowHp?0.65:0;
    // 房屋 LOD 与故障荧光灯
    this._updateHouses();
  }
  // 新增功能：房屋 LOD（30 units 内激活内部细节）+ 荧光灯不规则闪烁
  _updateHouses(){
    const px=this.player.pos.x, pz=this.player.pos.z;
    for(const h of this.houses){
      h.interior.visible=Math.hypot(px-h.x,pz-h.z)<30;
    }
    for(const f of this.flouroLights){
      const r=Math.random();
      if(r<0.015) f.on=false; else if(r<0.035) f.on=true;
      f.light.intensity=f.on?(4.5+Math.sin(this.time*55)*0.4):(Math.random()*0.4);
    }
  }
  // 新增功能：判定坐标是否位于某栋房屋内
  isInsideHouse(x,z){
    for(const h of this.houses){
      if(x>h.x-h.w/2&&x<h.x+h.w/2&&z>h.z-h.d/2&&z<h.z+h.d/2) return true;
    }
    return false;
  }
  // 新增功能：动态夜空——星星闪烁 + 月亮光晕呼吸
  _updateSky(dt){
    if(this.starPoints&&this.stars){
      const col=this.starPoints.geometry.attributes.color.array;
      const t=this.time;
      for(let i=0;i<this.stars.length;i++){
        const s=this.stars[i];
        const b=clamp(s.base*(0.45+0.55*Math.sin(t*s.fr+s.ph)),0.05,1);
        col[i*3]=col[i*3+1]=col[i*3+2]=b;
      }
      this.starPoints.geometry.attributes.color.needsUpdate=true;
    }
    if(this.moon&&this.moon.halo){
      this.moon.halo.material.opacity=0.42+0.1*Math.sin(this.time*0.7);
    }
  }
  // ---- 新增功能：碰撞体空间哈希索引（大幅减少逐帧遍历开销） ----
  // 格子边长 CELL（约 10 units），将碰撞体按中心落入的格子分桶
  buildColliderGrid(){
    const CELL=10, RANGE=55;
    this.colliderGrid=new Map();
    this.colliderGridCell=CELL;
    for(const c of this.colliders){
      const cx=(c.min.x+c.max.x)/2, cz=(c.min.z+c.max.z)/2;
      const gx=Math.floor(cx/CELL), gz=Math.floor(cz/CELL);
      const key=gx+','+gz;
      let arr=this.colliderGrid.get(key);
      if(!arr){ arr=[]; this.colliderGrid.set(key,arr); }
      arr.push(c);
    }
    this._gridBuilt=true;
  }
  // 返回以 (x,z) 为中心半径 r 范围内的碰撞体（跨格子收集）
  getNearbyColliders(x,z,r){
    if(!this._gridBuilt) return this.colliders;
    const CELL=this.colliderGridCell;
    const out=[];
    const minGx=Math.floor((x-r)/CELL), maxGx=Math.floor((x+r)/CELL);
    const minGz=Math.floor((z-r)/CELL), maxGz=Math.floor((z+r)/CELL);
    for(let gx=minGx;gx<=maxGx;gx++){
      for(let gz=minGz;gz<=maxGz;gz++){
        const arr=this.colliderGrid.get(gx+','+gz);
        if(arr) for(const c of arr) out.push(c);
      }
    }
    return out;
  }
  // 边界强制约束（地图边缘围墙绝对边界）：玩家/僵尸移动循环调用，绝不可越出地图
  applyMapBoundary(pos){
    const hw=this.mapHalfW||50, hl=this.mapHalfL||50, m=MAP_BOUNDARY_MARGIN;
    pos.x=clamp(pos.x,-hw+m,hw-m);
    pos.z=clamp(pos.z,-hl+m,hl-m);
    return pos;
  }
  // 到最近墙体碰撞体的距离（分档扩大查询半径；用于判断开阔度/是否在建筑内）
  wallDistance(x,z){
    let best=1e9;
    for(let r=6;r<=40&&best>r;r*=2){
      const list=this.getNearbyColliders(x,z,r+6);
      if(!list.length) continue;
      for(const c of list){
        const dx=Math.max(c.min.x-x,0,x-c.max.x);
        const dz=Math.max(c.min.z-z,0,z-c.max.z);
        const d=Math.sqrt(dx*dx+dz*dz);
        if(d<best) best=d;
      }
    }
    return best;
  }
  // 新增功能：非规则边界——红色警示灯闪烁 + 辐射区扣血 + 边界低频嗡鸣
  _updateBoundary(dt){
    // 红色警示灯缓慢闪烁（emissive 自发光替代点光源）
    for(const bl of this.boundaryLights){
      const f=0.35+0.65*Math.abs(Math.sin(this.time*0.8+bl.phase));
      if(bl.mat) bl.mat.emissiveIntensity=bl.base*(0.25+0.75*f);
    }
    // 边界辐射区：越过地图边缘（距中心>lim）每秒扣 5 HP（lim 按外挂地图尺寸适配）
    if(this.state==='PLAYING'&&this.player.alive){
      const px=this.player.pos.x, pz=this.player.pos.z;
      const d=Math.max(Math.abs(px),Math.abs(pz));
      // 低频嗡鸣随靠近边界增大（0~1）
      const lim=Math.max(this.mapHalfW||50,this.mapHalfL||50)-1;
      const near=clamp((d-(lim-11))/11,0,1);
      if(this.audio) this.audio.setBoundaryHum(near);
      if(d>lim){
        this.radTick+=dt;
        if(this.radTick>=1){
          this.radTick=0;
          this.player.takeDamage(5,null);
        }
        // 红色辐射粒子（轻微视觉效果）
        if(Math.random()<0.06){
          const sx=clamp(px,-lim,lim), sz=clamp(pz,-lim,lim);
          const dirX=(sx>0?1:-1)*0.6, dirZ=(sz>0?1:-1)*0.6;
          this.pool.emit({
            tex:'glow', pos:new THREE.Vector3(sx+rand(-0.5,0.5),rand(0.2,1.6),sz+rand(-0.5,0.5)),
            vel:new THREE.Vector3(dirX,rand(0.3,0.8),dirZ), life:rand(0.5,1.2), size:rand(0.2,0.5),
            color:0xff3030, additive:true, gravity:0
          });
        }
      }
    } else if(this.audio){
      this.audio.setBoundaryHum(0);
    }
  }
  _render(){
    this.renderer.render(this.scene,this.camera);
    this.css2d.render(this.scene,this.camera);
    // 主菜单：右侧 3D 旋转地图预览（复用主渲染器临时转相机，无第二 WebGL 上下文）
    if(this.state==='MENU'){
      const fog=this.scene.fog;
      this.scene.fog=null;
      this.previewAngle=(this.previewAngle||0)+0.02;
      const a=this.previewAngle;
      const oldPos=this.camera.position.clone();
      const oldRot=this.camera.rotation.clone();
      const oldFov=this.camera.fov;
      const oldAspect=this.camera.aspect;
      // 预览视角：俯视旋转（半径/高度随地图等比放大，保证整图可见）
      this.camera.fov=50;
      this.camera.aspect=window.innerWidth/window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(Math.cos(a)*MAP_TARGET_WIDTH*0.6,MAP_TARGET_WIDTH*0.3,Math.sin(a)*MAP_TARGET_WIDTH*0.6);
      this.camera.lookAt(0,MAP_TARGET_WIDTH*0.05,0);
      // 主菜单预览临时调亮光照（避免黑夜模式下地图过暗）
      const oldAmbInt=this.ambientLight?this.ambientLight.intensity:0;
      const oldHemiInt=this.hemiLight?this.hemiLight.intensity:0;
      const oldExposure=this.renderer?this.renderer.toneMappingExposure:1;
      if(this.ambientLight) this.ambientLight.intensity=2.0;
      if(this.hemiLight) this.hemiLight.intensity=1.8;
      if(this.renderer) this.renderer.toneMappingExposure=2.3;
      this.renderer.render(this.scene,this.camera);
      // 恢复游戏相机与光照
      if(this.ambientLight) this.ambientLight.intensity=oldAmbInt;
      if(this.hemiLight) this.hemiLight.intensity=oldHemiInt;
      if(this.renderer) this.renderer.toneMappingExposure=oldExposure;
      this.camera.position.copy(oldPos);
      this.camera.rotation.copy(oldRot);
      this.camera.fov=oldFov;
      this.camera.aspect=oldAspect;
      this.camera.updateProjectionMatrix();
      this.scene.fog=fog;
    }
    // 武器库：3D 武器预览（独立场景，自动旋转 + OrbitControls）
    if(this.wpRenderer&&this.wpScene&&this.wpCamera&&this.wpControls){
      this.wpControls.update();
      this.wpRenderer.render(this.wpScene,this.wpCamera);
    }
  }
  _fps(dt){
    this.fpsFrames++; this.fpsTime+=dt;
    if(this.fpsTime>=1){
      const fps=this.fpsFrames/this.fpsTime;
      this.fpsFrames=0; this.fpsTime=0;
      if(fps<15 && !this.lowPerfShown && this.state==='PLAYING'){
        this.lowPerfCounter++;
        if(this.lowPerfCounter>=3){ this.lowPerfShown=true; this.showLowPerf(); }
      } else if(fps>=15) this.lowPerfCounter=0;
    }
  }
  _updateDust(dt){
    const dust=this.dust; if(!dust) return;
    const pos=dust.geometry.attributes.position.array;
    const seeds=dust.userData.seed;
    for(let i=0;i<dust.userData.count;i++){
      pos[i*3]+=seeds[i].vx*dt + Math.sin(this.time*0.3+seeds[i].ph)*0.003*dt;
      pos[i*3+1]+=seeds[i].vy*dt;
      pos[i*3+2]+=seeds[i].vz*dt;
      if(pos[i*3]>50) pos[i*3]=-50; if(pos[i*3]<-50) pos[i*3]=50;
      if(pos[i*3+2]>50) pos[i*3+2]=-50; if(pos[i*3+2]<-50) pos[i*3+2]=50;
      if(pos[i*3+1]>3) pos[i*3+1]=0; if(pos[i*3+1]<0) pos[i*3+1]=3;
    }
    dust.geometry.attributes.position.needsUpdate=true;
  }
  _updateLamps(dt){
    // 路灯：emissive 自发光闪烁（替代实时光源，性能优化）
    for(const l of this.lamps){
      const flick=Math.random()<0.06?0.2:1;
      if(l.mat) l.mat.emissiveIntensity=l.base*(0.65+0.35*Math.sin(this.time*9+l.phase))*flick;
    }
  }
  // ---- 输入 ----
  _bindInput(){
    this.keys={w:false,s:false,a:false,d:false,shift:false,ctrl:false,space:false,r:false,q:false,e:false,rmb:false};
    window.addEventListener('keydown',e=>{
      if(e.repeat) return;
      const k=e.key.toLowerCase();
      if(k==='w')this.keys.w=true; if(k==='s')this.keys.s=true;
      if(k==='a')this.keys.a=true; if(k==='d')this.keys.d=true;
      if(k==='shift')this.keys.shift=true;
      if(k==='control')this.keys.ctrl=true;
      if(k===' '){ this.keys.space=true; if(this.state==='GAMEOVER') this.restart(); }
      // 新增功能：R 优先排障（步枪卡壳时），否则换弹
      if(k==='r'){
        if(this.weapon.jammed&&this.weapon.current==='rifle') this.weapon.startClearJam();
        else this.weapon.startReload();
      }
      // 新增功能：F 键搜刮弹药箱（塔科夫硬核补给）
      if(k==='f'&&this.state==='PLAYING'&&this.player.alive){ this._tryLoot(); }
      if(k==='q')this.keys.q=true;
      if(k==='e')this.keys.e=true;
      // 新增功能：I 键武器检视
      if(k==='i'&&this.state==='PLAYING'&&this.player.alive){ this.weapon.startInspect(); }
      if(k==='escape'){
        // 设置菜单优先关闭；否则若教程开着则关教程；否则游戏中打开设置
        if(this.settingsOpen) this.closeSettings();
        else if($('tutorial').style.display!=='none'){ this._closeTutorial(); }
        else if(this.state==='PLAYING') this.openSettings();
      }
      // 新增功能：数字键快速切换武器（1手枪 2主武器 3刀）
      if(this.state==='PLAYING'&&this.player.alive){
        if(k==='1') this.weapon.switchToPistol();
        else if(k==='2') this.weapon.switchToMain();
        else if(k==='3') this.weapon.switchToKnife();
      }
      // M键 已移除——请使用 Esc → 设置 → 退出游戏 返回主菜单
    });
    window.addEventListener('keyup',e=>{
      const k=e.key.toLowerCase();
      if(k==='w')this.keys.w=false; if(k==='s')this.keys.s=false;
      if(k==='a')this.keys.a=false; if(k==='d')this.keys.d=false;
      if(k==='shift')this.keys.shift=false;
      if(k==='control')this.keys.ctrl=false;
      if(k===' ')this.keys.space=false;
      if(k==='q')this.keys.q=false;
      if(k==='e')this.keys.e=false;
    });
    document.addEventListener('mousemove',e=>{
      if(document.pointerLockElement!==this.renderer.domElement) return;
      const sens=0.0022*(this.settings.sensitivity||1); // 鼠标灵敏度倍率
      this.player.yaw-=e.movementX*sens;
      this.player.pitch-=e.movementY*sens;
      this.player.pitch=clamp(this.player.pitch,-Math.PI/2+0.02,Math.PI/2-0.02);
    });
    document.addEventListener('mousedown',e=>{
      if(this.state!=='PLAYING'||!this.player.alive) return;
      if(e.button===0){ this.weapon.primaryDown(); }
      else if(e.button===2){ this.keys.rmb=true; }
      else if(e.button===4){ this.weapon.switchWeapon(); } // MB5 循环切换武器
      // MB4(button3) 本次未分配功能
    });
    document.addEventListener('mouseup',e=>{
      if(e.button===0){ this.weapon.primaryUp(); }
      if(e.button===2) this.keys.rmb=false;
    });
    document.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('pointerlockchange',()=>{
      if(document.pointerLockElement===this.renderer.domElement){
        $('startScreen').style.display='none';
        this._maybeShowTutorial();
      }
    });
  }
  // ---- 音效/UI 事件 ----
  onZombieKilled(z,fromPos,headshot){
    this.kills++;
    const bonus=z.elite?30:0;
    this.score+=50+bonus;
    $('scoreText').textContent=`击杀: ${this.kills}`;
    this.showKillFloat(bonus?`+${50+bonus}`:'+50');
    // 击杀数字
    this.showDamageNumber(z,50+bonus,false,'kill');
    this.audio.growl(z.pos);
    // Boss 被击败 → 直接胜利（不再推进波次 / 刷小兵）
    if(z.isBoss){ this.onBossDefeated(); return; }
    // Boss 战期间：普通击杀只计数，不推进波次（防小兵击杀误触发下一波）
    if(this.bossActive) return;
    // 波次推进：击杀累计达阈值 或 本波僵尸清空 时进入下一波
    const alive=this.zombies.zombies.filter(z=>!z.dead).length;
    if(this.kills>=this.zombies.nextWaveKills || alive===0){
      this.zombies.spawnWave(this.zombies.wave+1); // 推进阈值已由 spawnWave 按波次刷新量累计
    }
  }
  onZombieHeard(z){}
  onPlayerDamaged(fromPos){
    // 受击红晕
    $('hitVignette').style.opacity=1;
    setTimeout(()=>{ $('hitVignette').style.opacity=0; },120);
    // 方向指示
    if(fromPos){
      const cam=this.camera;
      const fwd=new THREE.Vector3(); cam.getWorldDirection(fwd);
      const to=fromPos.clone().sub(this.player.pos).normalize();
      const right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize();
      const fDot=to.dot(fwd), rDot=to.dot(right);
      if(Math.abs(fDot)>Math.abs(rDot)) this.triggerDmgArc(fDot>0?'up':'down');
      else this.triggerDmgArc(rDot>0?'right':'left');
    }
    this.camShake=0.5;
  }
  playerLanded(fall){
    // 落地高额脉冲（半径15）
    this.broadcastFootstep(15,this.player.pos);
    this.audio.stockWhiff();
  }
  broadcastFootstep(radius,pos){
    // 房屋内冲刺：脚步脉冲半径缩小至12（墙体会部分阻挡声音传播）
    let r=radius||(this.isInsideHouse(this.player.pos.x,this.player.pos.z)?12:20);
    // 配件隐蔽性（消音器等）：+50 隐蔽性 → AI 听觉半径减半
    if(this.weapon){
      const wst=this.weapon.curStats();
      if(wst&&wst.stealth>0) r*=Math.max(0.25,1-wst.stealth/100);
    }
    const p=pos||this.player.pos;
    for(const z of this.zombies.zombies){
      if(z.dead||z.state==='chase'||z.state==='attack') continue;
      const d=z.pos.distanceTo(p);
      if(d<=r){
        const strength=1-d/r;
        if(strength>0){
          // 房屋内僵尸听觉更敏锐：响应延迟缩短至 0.1s
          const delay=this.isInsideHouse(z.pos.x,z.pos.z)?100:200;
          setTimeout(()=>{
            if(z.dead||this.state!=='PLAYING') return;
            z.hearPulse(p);
          },delay);
        }
      }
    }
  }
  shakeCamera(v){ this.camShake=Math.max(this.camShake,v); }
  spawnParticles(pos,o){
    const count=o.count||5;
    for(let i=0;i<count;i++){
      emitPart(this.pool,{
        tex:o.tex||'glow', pos:pos.clone(),
        color:o.color||0xffffff, size:o.size||0.12,
        life:o.life||0.5, add:o.add!==undefined?o.add:false,
        vel:new THREE.Vector3(rand(-1,1),rand(-0.2,1),rand(-1,1)).multiplyScalar(o.vel||2),
        gravity:o.grav||0,
        opacity:o.opacity!==undefined?o.opacity:1,
        rot:rand(0,3.14), spin:rand(-3,3)
      });
    }
  }
  emitPart(o){ emitPart(this.pool,o); }
  // ---- 伤害数字 ----
  showDamageNumber(z,amount,headshot,kind){
    if(this.dmgNumbers.length>=30){ const d=this.dmgNumbers.shift(); this.css2d.domElement&&d.el.parentNode&&d.el.parentNode.removeChild(d.el); }
    const div=document.createElement('div');
    div.className='dmgNum';
    let cls,text;
    if(kind==='kill'){ cls='color:#ffd700;font-size:26px;'; text=`+${amount}`; }
    else if(kind==='loot'){ cls='color:#4ade80;font-size:26px;'; text=`+${amount}`; }
    else if(headshot){ cls='color:#ff4040;font-size:36px;'; text=`-${amount} ?`; }
    else { cls='color:#ffffff;font-size:24px;'; text=`-${amount}`; }
    div.style.cssText=`${cls}text-shadow:0 0 8px #000,0 2px 3px #000;font-weight:900;`;
    div.textContent=text;
    const obj=new CSS2DObject(div);
    obj.position.set(0,2.2*z.scale,0);
    z.group.add(obj);
    const t0=performance.now();
    const life=kind==='kill'?1.5:(kind==='loot'?1.6:1.2);
    this.dmgNumbers.push({el:div,obj:obj,t0:t0,life:life,z:z});
  }
  updateDmgNumbers(dt){
    const now=performance.now();
    for(let i=this.dmgNumbers.length-1;i>=0;i--){
      const d=this.dmgNumbers[i];
      const parent=d.mc?d.mc.group:(d.z?d.z.group:null);
      if(!parent||!parent.parent){
        // 父组已移除：同步删掉 DOM 标签与 three 对象（CSS2DRenderer 只添加不移除，必须手动 removeChild 防残留，2026-08-14）
        if(d.el&&d.el.parentNode) d.el.parentNode.removeChild(d.el);
        if(d.obj&&d.obj.parent) d.obj.parent.remove(d.obj);
        this.dmgNumbers.splice(i,1); continue;
      }
      const t=(now-d.t0)/1000;
      if(t>=d.life){
        if(d.el&&d.el.parentNode) d.el.parentNode.removeChild(d.el);
        if(d.obj.parent) d.obj.parent.remove(d.obj);
        this.dmgNumbers.splice(i,1); continue;
      }
      d.obj.position.y=(d.mc?1.8:2.2)+t*2;
      d.obj.position.x=Math.sin(t*4)*0.03;
      d.el.style.opacity=Math.max(0,1-t);
    }
  }
  // ---- 方向受击指示 ----
  triggerDmgArc(dir){
    const map={up:'arcUp',down:'arcDown',left:'arcLeft',right:'arcRight'};
    const el=$(map[dir]); if(!el) return;
    el.style.opacity=1;
    el.style.transition='opacity 0.6s';
    clearTimeout(this._arcTimer);
    this._arcTimer=setTimeout(()=>{
      el.style.opacity=0;
    },600);
  }
  // ---- UI ----
  refreshHPUI(){
    const p=this.player;
    $('hpText').textContent=`${Math.max(0,Math.round(p.health))}/${p.maxHealth}`;
    $('hpFill').style.width=`${Math.max(0,p.health)/p.maxHealth*100}%`;
  }
  refreshAmmoUI(){
    const w=this.weapon;
    const cur=w.current;
    if(cur==='pistol'||cur==='rifle'||cur==='sks'||cur==='sniper'||cur==='shotgun'||cur==='remington'||cur==='thompson'||cur==='sten'){
      const res=w.reserve[cur]||0;
      $('ammoNum').innerHTML=`${w.ammo} <span class="res">/ ${res}</span>`;
    } else $('ammoNum').innerHTML=`∞`;
  }
  // ---- 顶部战术罗盘（三角洲/使命召唤风格）----
  _buildCompass(){
    const c=$('compassTicks'); if(!c) return;
    c.innerHTML='';
    const card=['N','E','S','W'];
    for(let copy=0;copy<2;copy++){
      for(let deg=0;deg<=360;deg+=10){
        const i=document.createElement('i');
        i.style.left=((copy*360+deg)/720*100)+'%';
        if(deg%90===0){
          i.classList.add('major');
          i.style.height='42%';
          const b=document.createElement('b');
          b.textContent=card[(deg/90)%4];
          i.appendChild(b);
        } else {
          i.style.height=deg%45===0?'26%':'16%';
        }
        c.appendChild(i);
      }
    }
    this._compassBuilt=true;
  }
  _updateCompass(){
    const el=$('compassTicks'); if(!el) return;
    if(!this._compassBuilt) this._buildCompass();
    // yaw=0 → 朝向 -Z；转换为屏幕方位角（0°=北）
    const heading=(((-this.player.yaw)*180/Math.PI)%360+360)%360;
    el.style.transform='translateX('+(-(heading/360)*50)+'%)';
    const nEl=$('compassN');
    if(nEl) nEl.textContent=Math.round(heading)+'°';
  }
  // ---- 交互提示（靠近未搜刮的弹药箱显示 F）----
  _updateInteractHint(){
    const hint=$('interactHint'); if(!hint) return;
    const p=this.player;
    if(this.state!=='PLAYING'||!p.alive){ hint.style.opacity=0; return; }
    let near=null;
    for(const c of this.ammoCrates){
      if(Math.hypot(p.pos.x-c.x,p.pos.z-c.z)<3.0){ near=c; break; }
    }
    if(near){ hint.style.opacity=1; hint.textContent='[F] 搜刮弹药箱 — 补给后备弹药'; }
    else hint.style.opacity=0;
  }
  // ---- 搜刮弹药箱（无限领取）----
  _tryLoot(){
    const p=this.player, w=this.weapon;
    let near=null;
    for(const c of this.ammoCrates){
      if(Math.hypot(p.pos.x-c.x,p.pos.z-c.z)<3.0){ near=c; break; }
    }
    if(!near) return;
    // 补满当前武器后备弹药
    const DEF_RESERVE={pistol:45,m1911:21,rifle:90,sks:50,sniper:20,shotgun:24,remington:20,thompson:120};
    let gained=0;
    const cur=w.current;
    if(w.reserve[cur]!==undefined){
      const add=Math.max(0,(DEF_RESERVE[cur]||45)-w.reserve[cur]);
      w.reserve[cur]+=add; gained+=add;
    }
    const add2=Math.max(0,DEF_RESERVE.pistol-(w.reserve.pistol||0));
    w.reserve.pistol+=add2; gained+=add2;
    // 视觉反馈：箱子变暗 + 绿色粒子 + 绿色飘字
    if(near.mesh&&near.mesh.material){
      near.mesh.material.color.setHex(0x556055);
      near.mesh.material.emissive=new THREE.Color(0x22aa44);
      near.mesh.material.emissiveIntensity=0.6;
    }
    const pos=new THREE.Vector3(near.x,1.1,near.z);
    this.spawnParticles(pos,{color:0x4ade80,count:12,size:0.14,life:0.7,vel:3,grav:2});
    const fake={group:new THREE.Group(),scale:1};
    fake.group.position.set(near.x,1.0,near.z);
    this.scene.add(fake.group);
    this.showDamageNumber(fake,gained>0?`弹药 +${gained}`:'弹药已满',false,'loot');
    setTimeout(()=>{ if(fake.group.parent) fake.group.parent.remove(fake.group); },1700);
    if(this.audio) this.audio.loot();
    this.refreshAmmoUI();
  }
  // ---- 耐力耗尽提示 ----
  staminaExhausted(){
    const el=$('staminaWrap');
    if(el){ el.classList.add('exhausted'); clearTimeout(this._staminaFlash); this._staminaFlash=setTimeout(()=>{ if(el) el.classList.remove('exhausted'); },500); }
    if(this.audio) this.audio.staminaEmpty();
  }
  // ---- 后备弹药耗尽（无法换弹）提示 ----
  showAmmoEmpty(){
    const el=$('ammoState');
    if(el) el.textContent='? 后备弹药耗尽！搜索地图弹药箱 [F]';
    if(this.audio) this.audio.emptyClick();
  }
  updateWeaponUI(which){
    const el=$('weaponIcon');
    el.classList.add('hide');
    setTimeout(()=>{
      el.textContent=which==='pistol'?'?':(which==='knife'?'?':(which==='sniper'?'?':(which==='remington'?'?':(which==='shotgun'?'?':(which==='thompson'?'?':(which==='sten'?'?':'?'))))));
      el.classList.remove('hide');
    },200);
  }
  showReloadUI(show){
    $('reloadBar').style.display=show?'block':'none';
    if(!show) $('ammoState').textContent='';
  }
  updateReloadUI(p){
    $('reloadFill').style.width=`${p*100}%`;
    $('ammoState').textContent=this.weapon.tactical?'战术换弹中...':'空仓换弹中...';
  }
  showKillFloat(text){
    const el=$('killFloat');
    el.textContent=text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  updateWaveUI(n){
    $('waveText').textContent=`波次: ${n}`;
  }
  showWaveBanner(n){
    const el=$('waveBanner');
    el.textContent=`第 ${n} 波`;
    el.style.opacity=1;
    setTimeout(()=>{ el.style.opacity=0; },2000);
  }
  showStockCd(){
    const el=$('stockCd');
    el.style.opacity=1;
    this._stockCd=0.8;
  }
  // 新增功能：步枪卡壳提示（??红色图标）
  showJamUI(show,clearing){
    const el=$('jamIcon'); if(!el) return;
    if(show){
      el.style.opacity=1;
      el.textContent=clearing?'?':'??';
    } else {
      el.style.opacity=0;
    }
  }
  updateStockCd(p){ $('stockCd').style.background=`conic-gradient(rgba(255,255,255,.85) ${(1-p)*100}%, rgba(255,255,255,0) 0%)`; if(p<=0) $('stockCd').style.opacity=0; }
  crosshairExpand(){ this.crossSpread=30; }
  _updateUI(){
    // 准星（CS:GO 手感：移动/空中/开火使准星张开，静止/开镜瞄准收拢）
    const target=lerp(this.crossSpread,10,0.06);
    this.crossSpread=target;
    const inacc=(this.player&&this.player.inacc)||0;
    const gap=(this.crossSpread+inacc*80)/2;
    const ch=$('crosshair');
    const isSg=this.weapon.current==='shotgun'||this.weapon.current==='remington';
    if(isSg) ch.classList.add('shotgun'); else ch.classList.remove('shotgun');
    ch.style.opacity=(this.player.ads>0.5||this.state!=='PLAYING')?0:1;
    // 新增功能：瞄准镜 overlay（开镜显示，替代动态准星；机械瞄具无遮罩）
    const st=this.weapon.curStats();
    const scDef=SCOPE_DEFS[st.scopeType]||SCOPE_DEFS.irons;
    const scoped=this.player.ads>0.5&&st.scopeType!=='irons';
    const isReflex=st.scopeType==='reddot'||st.scopeType==='micro'||st.scopeType==='holo';
    $('scopeOverlay').style.display=scoped?'block':'none';
    // 开镜 overlay 随后坐力抖动（真实瞄准体验）
    if(scoped){
      const sx=this.weapon.recoilYaw*80, sy=-this.weapon.recoilPitch*90;
      const canvas=$('scopeCanvas');
      if(canvas) canvas.style.transform=`translate(${sx}px,${sy}px)`;
    }
    if(scoped&&this._lastScopeDrawn!==st.scopeType){
      this._drawScopeOverlay(st.scopeType);
      this._lastScopeDrawn=st.scopeType;
    }
    // 镜外模糊（仅高倍镜；红点/全息类不模糊）
    if(this.renderer&&this.renderer.domElement){
      this.renderer.domElement.style.filter=(scoped&&!isReflex)?('blur('+scDef.blur+'px)'):'';
    }
    // 高倍镜管状遮罩：仅高倍镜显示，红点/全息/机械瞄具完全隐藏
    const sv=$('scopeVignette');
    if(sv&&sv.style){
      if(!scoped||isReflex){
        sv.style.display='none';
      } else {
        sv.style.display='block';
        sv.style.opacity=String(clamp(scDef.vignette,0,1));
      }
    }
    // 呼吸屏息条（高倍镜按住 Shift 屏息）
    const breathEl=$('breathBar');
    if(breathEl){
      if(this.player.ads>0.5&&scDef.breath>0&&this.state==='PLAYING'){
        breathEl.style.display='block';
        const p=clamp(this.player.breathTime/scDef.breath,0,1);
        breathEl.querySelector('i').style.width=(p*100)+'%';
        breathEl.style.opacity=1;
      } else breathEl.style.opacity=0;
    }
    // 新增功能：后坐力准心——单发微微上跳，连发持续上移（幅度加大）
    this.crossY=clamp(-this.weapon.crossRecoil*180,-18,0);
    ch.style.transform=`translateY(${this.crossY}px)`;
    $('chTop').style.transform=`translateY(${-gap-8}px)`;
    $('chBot').style.transform=`translateY(${gap+8}px)`;
    $('chLef').style.transform=`translateX(${-gap-8}px)`;
    $('chRig').style.transform=`translateX(${gap+8}px)`;
    // 伤害数字
    this.updateDmgNumbers(0.016);
    
    // 新增功能：顶部战术罗盘（随朝向滑动）
    this._updateCompass();
    // 新增功能：塔科夫硬核耐力条
    if($('staminaWrap')){
      const stEl=$('staminaFill'), sw=$('staminaWrap');
      const p=this.player;
      stEl.style.width=(p.stamina/p.maxStamina*100)+'%';
      if(this.state==='PLAYING') sw.style.display='block'; else sw.style.display='none';
    }
    // 新增功能：交互提示（F 搜刮弹药箱）
    this._updateInteractHint();
  }
  // ---- 引导 ----
  _checkTutorial(){
    const seen=localStorage.getItem('mrTw_guide');
    if(seen) return;
    this._tutorialShown=false;
  }
  _maybeShowTutorial(){
    if(localStorage.getItem('mrTw_guide')) return;
    if(this._tutorialShown) return;
    this._tutorialShown=true;
    $('tutorial').style.display='flex';
    setTimeout(()=>{ this._closeTutorial(); },5000);
    setTimeout(()=>{ $('cornerHints').style.opacity=0; },10000);
  }
  _maybeCloseTutorial(){ if($('tutorial').style.display!=='none') this._closeTutorial(); }
  _closeTutorial(){
    $('tutorial').style.display='none';
    localStorage.setItem('mrTw_guide','1');
  }
  // ---- 性能降级 ----
  showLowPerf(){
    $('lowPerfDlg').style.display='flex';
  }
  _downgrade(){
    if(this.downgraded) return;
    this.downgraded=true;
    $('lowPerfDlg').style.display='none';
    // 关闭阴影
    this.renderer.shadowMap.enabled=false;
    // 粒子减半
    if(this.dust){ this.dust.geometry.setAttribute('position',new THREE.BufferAttribute(this.dust.geometry.attributes.position.array.slice(0,this.dust.userData.count/2*3),3)); this.dust.geometry.setAttribute('color',new THREE.BufferAttribute(this.dust.geometry.attributes.color.array.slice(0,this.dust.userData.count/2*3),3)); this.dust.userData.count=Math.floor(this.dust.userData.count/2); }
    // 星星减半（性能优化）
    if(this.starPoints){
      const half=Math.floor(this.starPoints.geometry.attributes.position.count/2);
      this.starPoints.geometry.setAttribute('position',new THREE.BufferAttribute(this.starPoints.geometry.attributes.position.array.slice(0,half*3),3));
      this.starPoints.geometry.setAttribute('color',new THREE.BufferAttribute(this.starPoints.geometry.attributes.color.array.slice(0,half*3),3));
      if(this.stars) this.stars=this.stars.slice(0,half);
    }
    // 重建渲染器关闭抗锯齿 + 降低渲染分辨率（提升帧率）
    const old=this.renderer.domElement;
    const wrap=$('gameLayer');
    wrap.removeChild(old);
    this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.25));
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.renderer.shadowMap.enabled=false;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=this.isDay?1.8:1.75; // 低性能重建后保持昼夜提亮
    wrap.appendChild(this.renderer.domElement);
  }
  // ==================== 第六波 Boss 战（2026-08-11 新增）====================
  // 触发：第五波清空 → spawnWave(6) 调用；bossSpawned 标志位防止重复生成（仅一只）
  triggerBossAppear(){
    if(this.bossSpawned) return;
    this.bossSpawned=true; this.bossActive=true;
    this.zombies.wave=BOSS_WAVE;
    this.updateWaveUI(BOSS_WAVE);
    // 刚进入 Boss 战：删除之前波次刷新的所有僵尸（含正在倒地淡出、尚未从数组移除的 dead 僵尸），
    // 场上只保留后续生成的 Boss 与其小兵
    this.zombies.clear();
    // 屏幕中央红色边框大字（放大缩小闪烁）→ 警报声 → 3 秒后淡出并生成 Boss
    const el=$('boss-announce');
    el.style.display='block';
    this.audio.bossAlarm();
    setTimeout(()=>{
      el.style.transition='opacity .35s'; el.style.opacity='0';
      setTimeout(()=>{ el.style.display='none'; el.style.opacity='1'; el.style.transition=''; },380);
      // 玩家若在提示期间死亡（GAMEOVER），不再生成 Boss
      if(this.state==='PLAYING') this._spawnBoss();
    },BOSS_ANNOUNCE_MS);
  }
  // 生成 Boss（仅一只，bossInstance 防重复）
  _spawnBoss(){
    if(this.bossInstance&&!this.bossInstance.dead) return;
    const pos=this._findBossSpawn();
    this.bossInstance=new Zombie(this,pos,{
      hp:BOSS_HP, scale:BOSS_SCALE, speedMult:BOSS_SPEED_MULT,
      damage:BOSS_DAMAGE, attackCooldown:BOSS_ATTACK_CD, attackRange:BOSS_ATTACK_RANGE,
      isBoss:true
    });
    this.zombies.zombies.push(this.bossInstance);
    this.bossAlive=true;
    // 显示 Boss 血量条 + 小兵计数
    $('boss-hp-container').style.display='block';
    this.updateBossHP(this.bossInstance.hp);
    // 立即刷新第一批小兵
    this._spawnMinions();
    this.minionTimer=0;
  }
  // Boss 出生点：玩家周围 20~40 单位、可通行、不在建筑内（回退安全出生点）
  _findBossSpawn(){
    const p=this.player.pos;
    for(let i=0;i<20;i++){
      const a=rand(0,Math.PI*2), r=rand(20,40);
      const x=clamp(p.x+Math.cos(a)*r,-this.mapHalfW+3,this.mapHalfW-3);
      const z=clamp(p.z+Math.sin(a)*r,-this.mapHalfL+3,this.mapHalfL-3);
      if(this.isOpenSpot(x,z)) return new THREE.Vector3(x,0,z);
    }
    const sp=this.spawnPoint;
    return new THREE.Vector3(sp?sp.x:0,0,sp?sp.z:0);
  }
  // 判定某点是否可通行且不在建筑内（用于 Boss / 小兵生成）
  isOpenSpot(x,z){
    for(const c of this.getNearbyColliders(x,z,2.5)){
      if(x>c.min.x&&x<c.max.x&&z>c.min.z&&z<c.max.z&&0<c.max.y&&1.8>c.min.y) return false;
    }
    return this.wallDistance(x,z)>=8;
  }
  // 小兵刷新：Boss 周围半径 15~25 随机、每 20 秒 5 只、上限 20（Boss 存活才刷）
  _spawnMinions(){
    if(!this.bossAlive||!this.bossInstance) return;
    const current=this.zombies.zombies.filter(z=>z.isMinion&&!z.dead).length;
    if(current>=MINION_MAX) return;
    const count=Math.min(MINION_BATCH,MINION_MAX-current);
    const bp=this.bossInstance.pos;
    for(let i=0;i<count;i++){
      const pos=this._findMinionSpawn(bp);
      const minion=new Zombie(this,pos,{speedMult:1,waveSpeed:1,isMinion:true});
      this.zombies.zombies.push(minion);
    }
  }
  _findMinionSpawn(bp){
    for(let i=0;i<15;i++){
      const a=rand(0,Math.PI*2), r=rand(MINION_R_MIN,MINION_R_MAX);
      const x=clamp(bp.x+Math.cos(a)*r,-this.mapHalfW+1.5,this.mapHalfW-1.5);
      const z=clamp(bp.z+Math.sin(a)*r,-this.mapHalfL+1.5,this.mapHalfL-1.5);
      if(this.isOpenSpot(x,z)) return new THREE.Vector3(x,0,z);
    }
    return this.zombies._randomSpawn();
  }
  // 每帧：小兵刷新计时 + Boss 血量条 + 小兵计数
  _updateBoss(dt){
    const mcEl=$('minionCount');
    if(!this.bossAlive){ if(mcEl&&mcEl.style.display!=='none') mcEl.style.display='none'; return; }
    if(mcEl) mcEl.style.display='block';
    this.minionTimer+=dt;
    if(this.minionTimer>=MINION_INTERVAL){ this.minionTimer=0; this._spawnMinions(); }
    if(this.bossInstance) this.updateBossHP(this.bossInstance.hp);
    const mc=this.zombies.zombies.filter(z=>z.isMinion&&!z.dead).length;
    if(mcEl) mcEl.textContent=`剩余小兵：${mc}`;
  }
  updateBossHP(hp){
    hp=clamp(hp,0,BOSS_HP);
    const fill=$('bossHpFill'); if(fill) fill.style.width=(hp/BOSS_HP*100)+'%';
    const txt=$('bossHpText'); if(txt) txt.textContent=`Boss：${Math.ceil(hp)}/${BOSS_HP}`;
  }
  // Boss 被击败 → 停止刷小兵 + 胜利结算
  onBossDefeated(){
    this.bossAlive=false; this.bossActive=false;
    $('boss-hp-container').style.display='none';
    $('minionCount').style.display='none';
    this.victory();
  }
  // 胜利结算（击败巨型僵尸，游戏结束）
  victory(){
    if(this.state==='GAMEOVER') return;
    this.state='GAMEOVER';
    try{ document.exitPointerLock(); }catch(e){}
    this._saveRunStats();
    const t=$('goTitle'); if(t){ t.textContent='? 胜利！击败了巨型僵尸！'; t.classList.add('victory'); }
    $('gameOverScreen').style.display='flex';
    $('goStats').innerHTML=`击杀: ${this.kills}<br>得分: ${this.score}<br>到达波次: ${this.zombies.wave}`;
    $('goProfile').innerHTML=`<div style="margin-top:16px;padding:12px 20px;background:rgba(0,0,0,.4);border:1px solid #555;border-radius:10px;font-size:14px;color:#ddd;text-align:left;">`+this._statsHTML()+`</div>`;
  }
  // ---- 开始 / 暂停 / 结束 / 重启 ----
  // 新增功能：进入战场（首次开局或从 Tab 暂停中恢复）
  startGame(){
    this.audio.init(); this.audio.resume();
    if(!this.started || this._pendingReset){
      this.started=true;
      this._pendingReset=false;
      this._resetRun();
    }
    this.state='PLAYING';
    // 进入对局立即预加载所有GLB模型
    const allKeys=['rifle','shotgun','remington','thompson'];
    for(const k of allKeys) this.weapon._tryLoadWeaponGLB(k);
    // 直接隐藏开始界面（不依赖指针锁定成功，修复 Edge 中指针锁定被拦截时“没反应”的问题）
    $('startScreen').style.display='none';
    this._disposeWeaponPreview();
    this._maybeShowTutorial();
    // 请求指针锁定；失败不阻塞游戏（降级为鼠标可见模式）
    try{
      const r=this.renderer.domElement.requestPointerLock();
      if(r&&r.catch) r.catch(()=>{});
    }catch(e){}
    this._prev=performance.now();
  }
  // Esc → 设置 → 退出游戏 返回主界面（可重新选武器或直接进入战场）
  toMenu(){
    this._pendingReset=true;
    this.state='MENU';
    try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
    for(const z of this.zombies.zombies) this.audio.stopBreath(z);
    if(this.anim&&this.anim.root) this.anim.root.visible=false; // 菜单不跑 anim.update，手动隐藏手臂（避免残留在预览/菜单）
    $('gameOverScreen').style.display='none';
    $('tutorial').style.display='none';
    $('loadoutScreen').style.display='none';
    $('startScreen').style.display='flex';
    this._disposeWeaponPreview();
    this._renderWeaponList();
  }
  _resetRun(){
    this.zombies.clear();
    // 重置 Boss 战状态（第六波，2026-08-11）
    this.bossSpawned=false; this.bossAlive=false; this.bossActive=false;
    this.bossInstance=null; this.minionTimer=0;
    $('boss-hp-container').style.display='none';
    $('minionCount').style.display='none';
    $('boss-announce').style.display='none';
    const gt=$('goTitle'); if(gt) gt.classList.remove('victory');
    this.weapon.reset();
    this.player.reset();
    this.player.game=this;
    // 重置手臂动作系统（回到待机）
    if(this.anim) this.anim.reset();
    // 重置弹药箱搜刮状态（塔科夫硬核补给，新一轮可再次搜刮）
    for(const c of this.ammoCrates){
      c.looted=false;
      if(c.mesh&&c.mesh.material){
        c.mesh.material.color.setHex(0xffffff);
        c.mesh.material.emissive=new THREE.Color(0x000000);
        c.mesh.material.emissiveIntensity=1;
      }
    }
    this.pool.clear();
    this.decals.clear();
    // 清理残留伤害数字标签（防上一局遗留到屏幕；需同时删 DOM，CSS2DRenderer 只添加不移除，2026-08-14）
    while(this.dmgNumbers.length){ const d=this.dmgNumbers.pop(); if(d.el&&d.el.parentNode) d.el.parentNode.removeChild(d.el); if(d.obj&&d.obj.parent) d.obj.parent.remove(d.obj); }
    while(this.weapon.shells.length){ const s=this.weapon.shells.pop(); this.scene.remove(s.m); if(s.isModel){ s.m.traverse(c=>{ if(c.isMesh){ if(c.material)c.material.dispose(); if(c.geometry)c.geometry.dispose(); } }); } else { if(s.m.material)s.m.material.dispose(); if(s.m.geometry)s.m.geometry.dispose(); } }
    this.kills=0; this.score=0;
    this.zombies.wave=1; this.zombies.nextWaveKills=0;
    this.zombies.spawnWave(1);
    this.updateWaveUI(1);
    $('gameOverScreen').style.display='none';
    this.refreshHPUI(); this.refreshAmmoUI();
    $('scoreText').textContent=`击杀: 0`; // 重新开局后击杀数归零显示（2026-08-14，原仅击杀时更新导致残留旧值）
    this.crossSpread=10;
    this.runTime=0; this.runMaxSurvival=0; this.runMaxHeadshot=0;
    this.showJamUI(false,false);
    this.showModeBanner();
  }
  gameOver(){
    if(this.state==='GAMEOVER') return;
    this.state='GAMEOVER';
    document.exitPointerLock();
    this._saveRunStats();
    const t=$('goTitle');
    if(t){ t.textContent=this.bossActive?'? 你倒在了Boss面前…':'YOU DIED'; t.classList.remove('victory'); }
    // Boss 战失败：隐藏 Boss 相关 UI（结算界面背后不残留）
    $('boss-hp-container').style.display='none';
    $('minionCount').style.display='none';
    $('boss-announce').style.display='none';
    $('gameOverScreen').style.display='flex';
    $('goStats').innerHTML=`击杀: ${this.kills}<br>得分: ${this.score}<br>到达波次: ${this.zombies.wave}`;
    $('goProfile').innerHTML=`<div style="margin-top:16px;padding:12px 20px;background:rgba(0,0,0,.4);border:1px solid #555;border-radius:10px;font-size:14px;color:#ddd;text-align:left;">`+this._statsHTML()+`</div>`;
  }
  restart(){
    this._resetRun();
    this.state='PLAYING';
    this._prev=performance.now();
    // 重新锁定
    try{ const r=this.renderer.domElement.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){}
  }
  _resize(){
    const w=window.innerWidth,h=window.innerHeight;
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h);
    this.css2d.setSize(w,h);
    // 武器库 3D 预览渲染器同步尺寸
    const wpc=$('weaponPreview');
    if(this.wpRenderer&&this.wpCamera&&wpc){
      const pw=wpc.clientWidth||300, ph=wpc.clientHeight||300;
      this.wpRenderer.setSize(pw,ph);
      this.wpCamera.aspect=pw/ph; this.wpCamera.updateProjectionMatrix();
    }
  }
  _bindUI(){
    $('startBtn').addEventListener('click',()=>{
      $('hintLine').textContent='点击画面锁定鼠标 · Esc 释放';
      this.startGame();
    });
    // 新增功能：主界面“武器库”按钮 → 打开武器库界面（左列表 + 右详情）
    $('loadoutBtn').addEventListener('click',()=>this._openLoadout());
    $('perfYes').addEventListener('click',()=>this._downgrade());
    $('perfNo').addEventListener('click',()=>{ $('lowPerfDlg').style.display='none'; this.lowPerfShown=true; });
  }
  // ==================== 武器库（左列表 + 右详情，三角洲风格）====================
  _bindLoadout(){
    const list=$('weaponList');
    if(!list) return;
    list.innerHTML='';
    WEAPON_LIST.forEach(item=>{
      const el=document.createElement('div');
      el.className='wpItem';
      el.dataset.key=item.key;
      const def=item.def?WEAPON_DEFS[item.def]:null;
      const icon=def?def.icon:item.icon;
      const name=def?def.name:item.name;
      el.innerHTML=`<span class="wpIcon">${icon}</span><span class="wpName">${name}</span><span class="wpStatus"></span>`;
      el.addEventListener('click',()=>this._selectArmory(item.key));
      list.appendChild(el);
    });
    const eb=$('armoryEquipBtn'), bb=$('armoryBackBtn');
    if(eb) eb.addEventListener('click',()=>this._equipArmory());
    if(bb) bb.addEventListener('click',()=>this._closeLoadout());
    // 点击空白处关闭配件下拉
    document.addEventListener('click',()=>{
      document.querySelectorAll('#attachmentsPanel .wpSlotMenu').forEach(m=>m.style.display='none');
    });
    this._renderWeaponList();
    this._selectArmory(this._armorySel,false);
  }
  _selectArmory(key,refreshList=true){
    this._armorySel=key;
    if(refreshList) this._renderWeaponList();
    this._renderWeaponDetail(key);
    this._mountWeaponPreview(key);
  }
  _renderWeaponList(){
    const list=$('weaponList'); if(!list) return;
    list.querySelectorAll('.wpItem').forEach(el=>{
      const key=el.dataset.key;
      el.classList.toggle('active',key===this._armorySel);
      const st=el.querySelector('.wpStatus');
      if(!st) return;
      if(key==='knife'){
        const eq=this.loadout==='knife';
        st.textContent=eq?'? 已装备':'近战';
        st.className='wpStatus'+(eq?' equipped':'');
      } else if(key==='pistol'){
        st.textContent='常驻 · '+this._partsCount(key)+' 配件';
        st.className='wpStatus';
      } else {
        const def=WEAPON_DEFS[key];
        const eq=def&&this.loadout===def.mainLoadout;
        st.textContent=eq?'? 已装备':this._partsCount(key)+' 配件';
        st.className='wpStatus'+(eq?' equipped':'');
      }
    });
  }
  _partsCount(key){ return WEAPON_DEFS[key]?WEAPON_DEFS[key].slots.length:0; }
  _renderWeaponDetail(key){
    const def=WEAPON_DEFS[key];
    const panel=$('statsPanel'), attach=$('attachmentsPanel');
    if(!panel||!attach) return;
    if(!def){
      panel.innerHTML='<div class="wpNoData">? 战术刀 — 无声近战武器<br>无法改装配件</div>';
      attach.innerHTML='';
      return;
    }
    const st=this.weapon.computed[key];
    const b=def.base;
    const rows=[
      {label:'伤害', val:st.damage, base:b.damage, max:40, suf:'', better:'up'},
      {label:'射速', val:st.fireRate, base:b.fireRate, max:900, suf:' 发/分', better:'up'},
      {label:'弹匣容量', val:st.magSize, base:b.magSize, max:60, suf:' 发', better:'up'},
      {label:'换弹时间', val:st.reloadTime, base:b.reloadTime, max:4, suf:key==='shotgun'?' s/发':' s', better:'down'},
      {label:'有效射程', val:st.range, base:b.range, max:150, suf:' m', better:'up'},
      {label:'精准度', val:st.accuracy, base:b.accuracy, max:100, suf:'%', better:'up'},
      {label:'机动性', val:st.mobility, base:b.mobility, max:100, suf:'%', better:'up'}
    ];
    let html=`<div class="wpStatTitle">${def.icon} ${def.name}<span class="wpStatTag">${def.cat}</span></div>`;
    rows.forEach(r=>{
      const ratio=clamp(r.val/r.max,0,1);
      const color=statColor(ratio);
      let deltaHtml='';
      const diff=Math.round((r.val-r.base)*100)/100;
      if(Math.abs(diff)>0.01){
        const better=(diff>0)===(r.better==='up');
        const dText=(diff>0?'+':'')+diff+r.suf.trim();
        deltaHtml=` <span class="wpStatDelta ${better?'up':'down'}">(${dText})</span>`;
      }
      html+=`<div class="wpStatRow"><div class="wpStatLabel">${r.label}</div><div class="wpStatBar"><i style="width:${ratio*100}%;background:linear-gradient(90deg,${color},${color}cc);box-shadow:0 0 7px ${color}88;"></i></div><div class="wpStatVal" style="color:${color};">${r.val}${r.suf}${deltaHtml}</div></div>`;
    });
    html+=`<div class="wpScopeNote">瞄准镜：${st.scopeName} · 后坐力×${st.recoilMult.toFixed(2)} · 开镜速度×${st.adsMult.toFixed(2)}${st.stealth>0?' · 隐蔽'+st.stealth+'%':''}</div>`;
    panel.innerHTML=html;
    // 配件槽位
    let ah='<div class="wpAttTitle">配件改装</div>';
    def.slots.forEach(slot=>{
      const cur=this.weapon.getAttachment(key,slot.id);
      ah+=`<div class="wpSlot" data-slot="${slot.id}">
        <div class="wpSlotHead"><span class="wpSlotLabel">${slot.label}</span><span class="wpSlotCur">${cur.name} ?</span></div>
        <div class="wpSlotMenu"></div>
      </div>`;
    });
    attach.innerHTML=ah;
    attach.querySelectorAll('.wpSlot').forEach(slotEl=>{
      const slotId=slotEl.dataset.slot;
      slotEl.querySelector('.wpSlotHead').addEventListener('click',(e)=>{
        e.stopPropagation();
        this._toggleSlotMenu(key,slotEl,slotId);
      });
    });
  }
  _toggleSlotMenu(key,slotEl,slotId){
    const menu=slotEl.querySelector('.wpSlotMenu');
    const open=menu.style.display==='block';
    document.querySelectorAll('#attachmentsPanel .wpSlotMenu').forEach(m=>m.style.display='none');
    if(open) return;
    const def=WEAPON_DEFS[key]; if(!def) return;
    const slot=def.slots.find(s=>s.id===slotId); if(!slot) return;
    const cur=this.weapon.getAttachment(key,slotId).id;
    let html='';
    slot.options.forEach(opt=>{
      const active=opt.id===cur;
      html+=`<div class="wpOpt${active?' active':''}" data-opt="${opt.id}">${active?'? ':''}${opt.name}</div>`;
      html+=`<div class="wpOptDesc">${this._modText(opt.mods)}</div>`;
    });
    menu.innerHTML=html;
    menu.style.display='block';
    menu.querySelectorAll('.wpOpt').forEach(optEl=>{
      optEl.addEventListener('click',(e)=>{
        e.stopPropagation();
        this.weapon.equipAttachment(key,slotId,optEl.dataset.opt);
        menu.style.display='none';
        this._renderWeaponDetail(key); // 数据面板 + 槽位实时刷新
      });
    });
  }
  // 配件效果说明文本（三角洲武器库风格 tooltip）
  _modText(mods){
    if(!mods||!Object.keys(mods).length) return '无加成';
    const names={damage:'伤害',damagePct:'伤害',fireRate:'射速',mag:'弹匣容量',reload:'换弹时间',range:'射程',accuracy:'精准度',mobility:'机动性',recoil:'后坐力',ads:'开镜速度',stealth:'隐蔽性',spread:'弹丸散布'};
    const parts=Object.entries(mods).map(([k,v])=>{
      const name=names[k]||k;
      if(k==='reload') return v<0?`${name} ${Math.abs(v)}% (更快)`: `${name} +${v}% (更慢)`;
      if(k==='recoil') return v<0?`${name} ${Math.abs(v)}% (更稳)`: `${name} +${v}% (更晃)`;
      let unit='';
      if(['damagePct','fireRate','range','mobility','ads','spread'].includes(k)) unit='%';
      return `${name} ${v>0?'+':''}${v}${unit}`;
    });
    return parts.join(' · ');
  }
  onLoadoutChanged(key){
    if(this._armorySel===key) this._renderWeaponDetail(key);
  }
  _equipArmory(){
    const key=this._armorySel;
    if(key==='pistol'){
      // 手枪是常驻副武器：仅保存配件配置，主武器不变
      saveWeaponLoadouts(this.weapon.loadout);
    } else {
      const def=key==='knife'?{mainLoadout:'knife'}:WEAPON_DEFS[key];
      this.loadout=def.mainLoadout;
      try{ localStorage.setItem('mrTw_loadout',this.loadout); }catch(e){}
      saveWeaponLoadouts(this.weapon.loadout);
      // 装备时立即触发GLB预加载
      if(key!=='knife'&&key!=='pistol') this.weapon._tryLoadWeaponGLB(key);
    }
    this._renderWeaponList();
    this._closeLoadout();
  }
  _openLoadout(){
    $('startScreen').style.display='none';
    $('loadoutScreen').style.display='flex';
    this._initWeaponPreview();
    this._renderWeaponList();
    this._selectArmory(this._armorySel,false);
  }
  _closeLoadout(){
    $('loadoutScreen').style.display='none';
    $('startScreen').style.display='flex';
    this._disposeWeaponPreview();
  }
  // ---- 武器库 3D 武器预览（独立场景，OrbitControls + 自动旋转）----
  _initWeaponPreview(){
    const container=$('weaponPreview');
    if(!container) return;
    while(container.firstChild) container.removeChild(container.firstChild);
    if(this.wpRenderer){ try{ this.wpRenderer.dispose(); }catch(e){} }
    const pr=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power',preserveDrawingBuffer:false});
    pr.setPixelRatio(Math.min(window.devicePixelRatio,1));
    const pw=container.clientWidth||300, ph=container.clientHeight||300;
    pr.setSize(pw,ph);
    pr.shadowMap.enabled=false;
    pr.toneMapping=THREE.ACESFilmicToneMapping;
    pr.toneMappingExposure=1.5;
    container.appendChild(pr.domElement);
    this.wpRenderer=pr;
    this.wpScene=new THREE.Scene();
    // 独立灯光：环境光 + 两盏方向光（让武器金属质感清晰）
    this.wpScene.add(new THREE.AmbientLight(0xffffff,0.55));
    const d1=new THREE.DirectionalLight(0xfff0dd,1.5); d1.position.set(2,3,2); this.wpScene.add(d1);
    const d2=new THREE.DirectionalLight(0x88aaff,0.8); d2.position.set(-2,1,-2); this.wpScene.add(d2);
    this.wpScene.add(new THREE.HemisphereLight(0xffffff,0x2a2a3a,0.4));
    // 半透明底盘（增强立体感）
    const floor=new THREE.Mesh(new THREE.CircleGeometry(0.95,48),
      new THREE.MeshStandardMaterial({color:0x18182e,roughness:0.9,metalness:0.2,transparent:true,opacity:0.7}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-0.34; this.wpScene.add(floor);
    this._wpPreviewFloor=floor; // 记录供 dispose 释放
    // 相机位于 (0,0,2) 附近
    this.wpCamera=new THREE.PerspectiveCamera(45,pw/ph,0.1,100);
    this.wpCamera.position.set(0.15,0.25,2.0);
    this.wpCamera.lookAt(0,0,0);
    this.wpControls=new OrbitControls(this.wpCamera,pr.domElement);
    this.wpControls.enablePan=false;
    this.wpControls.enableDamping=true; this.wpControls.dampingFactor=0.08;
    this.wpControls.autoRotate=true; this.wpControls.autoRotateSpeed=5.7; // ≈0.01 rad/帧
    this.wpControls.minDistance=0.7; this.wpControls.maxDistance=4;
    this.wpControls.target.set(0,0,0);
  }
  _mountWeaponPreview(key){
    if(!this.wpScene) return;
    const w=this.weapon;
    const grp=w[key+'Group'];
    // 卸载上一把武器（先还原其手部可见性，避免影响游戏内持枪视角）
    if(this._wpWeaponKey&&this._wpWeaponKey!==key){
      const old=w[this._wpWeaponKey+'Group'];
      if(old){
        this._restoreWeaponHands(old);
        if(old.parent===this.wpScene) this.wpScene.remove(old);
        old.rotation.set(0,0,0); old.scale.set(1,1,1);
        w.group.add(old);
      }
    }
    this._wpWeaponKey=key;
    if(!grp) return;
    // 预览时触发GLB懒加载
    w._tryLoadWeaponGLB(key);
    if(grp.parent!==this.wpScene){
      if(grp.parent) grp.parent.remove(grp);
      this.wpScene.add(grp);
    }
    grp.position.set(0,0,0);
    grp.rotation.set(-0.12,Math.PI,0); // 枪口朝相机
    grp.scale.setScalar(key==='pistol'?1.3:(key==='sniper'?0.72:(key==='shotgun'?1.2:0.95)));
    grp.visible=true;
    // 预览只显示纯武器：隐藏手部/手臂模型（不影响游戏内 FPS 持枪视角）
    this._hideWeaponHands(grp);
  }
  // 隐藏 / 还原武器模型中的手部部件（userData.isHand 标记，由 _makeFist 设置）
  _hideWeaponHands(grp){ if(grp) grp.traverse(o=>{ if(o.userData&&o.userData.isHand) o.visible=false; }); }
  _restoreWeaponHands(grp){ if(grp) grp.traverse(o=>{ if(o.userData&&o.userData.isHand) o.visible=!(this.weapon&&this.weapon.handsHidden); }); }
  _disposeWeaponPreview(){
    if(this._wpWeaponKey){
      const w=this.weapon;
      const grp=w[this._wpWeaponKey+'Group'];
      if(grp){
        this._restoreWeaponHands(grp); // 还原手部，回到游戏后仍正常显示持枪手
        if(grp.parent===this.wpScene) this.wpScene.remove(grp);
        grp.rotation.set(0,0,0); grp.scale.set(1,1,1);
        w.group.add(grp);
      }
      this._wpWeaponKey=null;
    }
    // 释放预览专用资源：仅处理预览自建的对象（底盘/灯光），绝不动武器组共享材质
    if(this.wpScene&&this._wpPreviewFloor){
      this.wpScene.remove(this._wpPreviewFloor);
      if(this._wpPreviewFloor.material) this._wpPreviewFloor.material.dispose();
      if(this._wpPreviewFloor.geometry) this._wpPreviewFloor.geometry.dispose();
      this._wpPreviewFloor=null;
    }
    if(this.wpControls){ try{ this.wpControls.dispose(); }catch(e){} this.wpControls=null; }
    if(this.wpRenderer){
      try{ this.wpRenderer.dispose(); }catch(e){}
      const container=$('weaponPreview');
      if(container&&this.wpRenderer.domElement&&container.contains(this.wpRenderer.domElement)){
        container.removeChild(this.wpRenderer.domElement);
      }
      this.wpRenderer=null;
    }
    this.wpScene=null; this.wpCamera=null;
  }
  // 新增功能：瞄准镜 Canvas（镜框遮罩 + 分划 + 镜片镀膜反光），按瞄准镜类型差异化绘制
  _buildScopeOverlay(){
    const c=$('scopeCanvas');
    if(!c) return;
    this._drawScopeOverlay('scope4x');
  }
  _drawScopeOverlay(type){
    const c=$('scopeCanvas');
    if(!c) return;
    const W=window.innerWidth, H=window.innerHeight;
    c.width=W; c.height=H;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const cx=W/2, cy=H/2;
    const def=SCOPE_DEFS[type]||SCOPE_DEFS.irons;
    const win=def.window;
    // roundRect polyfill
    const rRect=(x,y,w,h,r)=>{if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}else{ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}};
    // 红点/全息类：半透明暗角遮罩 + 方形镜框 + 分划（战术反射式风格）
    const isReflex=type==='reddot'||type==='micro'||type==='holo';
    if(isReflex){
      if(win&&win.type==='rect'){
        const rw=win.w*H, rh=win.h*H;
        // 方形镜框（黑框调薄）
        ctx.strokeStyle='rgba(20,24,30,0.92)'; ctx.lineWidth=Math.max(4,H*0.008);
        rRect(cx-rw/2,cy-rh/2,rw,rh,H*0.02); ctx.stroke();
        ctx.strokeStyle='rgba(80,90,110,0.3)'; ctx.lineWidth=2;
        rRect(cx-rw/2+H*0.003,cy-rh/2+H*0.003,rw-H*0.006,rh-H*0.006,H*0.018); ctx.stroke();
        // 镜片淡蓝镀膜
        const lensG=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rw,rh)*0.6);
        lensG.addColorStop(0,'rgba(255,255,255,0)');
        lensG.addColorStop(1,hexA(def.lens,0.08));
        ctx.fillStyle=lensG; rRect(cx-rw/2,cy-rh/2,rw,rh,H*0.02); ctx.fill();
        this._drawReticle(ctx,cx,cy,H,type,win);
      } else {
        this._drawReticle(ctx,cx,cy,H,type,null);
      }
      return;
    }
    // 高倍镜：全屏黑色遮罩 + 圆形镜框（无黑边，仅分划圈）
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    if(win){
      ctx.save();
      ctx.globalCompositeOperation='destination-out';
      const r=win.r*H;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      ctx.restore();
      // 镜片镀膜
      ctx.save();
      ctx.globalCompositeOperation='source-over';
      const lens=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      lens.addColorStop(0,'rgba(255,255,255,0)');
      lens.addColorStop(0.8,hexA(def.lens,0.10));
      lens.addColorStop(1,hexA(def.lens,0.28));
      ctx.fillStyle=lens; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      const arc=ctx.createRadialGradient(cx,cy-r*0.35,r*0.2,cx,cy,r*1.05);
      arc.addColorStop(0,hexA(def.lens,0.16)); arc.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=arc; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
      ctx.restore();
      this._drawReticle(ctx,cx,cy,H,type,win);
    } else {
      this._drawReticle(ctx,cx,cy,H,'irons',null);
    }
  }
  _drawReticle(ctx,cx,cy,H,type,win){
    const R=type==='holo'?0.02*H:0.014*H;
    const dot=()=>{ ctx.fillStyle='#ff2525'; ctx.beginPath(); ctx.arc(cx,cy,Math.max(1.5,R*0.16),0,Math.PI*2); ctx.fill(); };
    const cross=()=>{
      ctx.strokeStyle='rgba(0,0,0,0.92)'; ctx.lineWidth=1;
      ctx.beginPath();
      const len=H*0.22;
      ctx.moveTo(cx,cy-len); ctx.lineTo(cx,cy+len);
      ctx.moveTo(cx-len,cy); ctx.lineTo(cx+len,cy);
      ctx.stroke();
    };
    const milDots=(n)=>{ // 密位点阵
      ctx.fillStyle='rgba(0,0,0,0.85)';
      const step=H*0.022;
      for(let i=1;i<=n;i++){
        for(const dir of [1,-1]){
          ctx.beginPath(); ctx.arc(cx+dir*i*step,cy,1.4,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx,cy+dir*i*step,1.4,0,Math.PI*2); ctx.fill();
        }
      }
    };
    const ticks=(n)=>{ // 短刻度
      ctx.strokeStyle='rgba(0,0,0,0.8)'; ctx.lineWidth=1;
      const step=H*0.018;
      for(let i=1;i<=n;i++){
        for(const dir of [1,-1]){
          ctx.beginPath(); ctx.moveTo(cx+dir*i*step,cy-5); ctx.lineTo(cx+dir*i*step,cy+5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx-5,cy+dir*i*step); ctx.lineTo(cx+5,cy+dir*i*step); ctx.stroke();
        }
      }
    };
    if(type==='reddot'||type==='micro'){
      if(type==='micro'){
        // 微全息：红圈 + 中心红点 + 下方红点（三点一线）
        ctx.strokeStyle='rgba(255,40,40,0.9)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(cx,cy,R*1.8,0,Math.PI*2); ctx.stroke();
        dot();
        ctx.fillStyle='#ff2525'; ctx.beginPath(); ctx.arc(cx,cy+R*2.6,1.8,0,Math.PI*2); ctx.fill();
      } else {
        // 红点：发光红点（模拟真实红点瞄准镜）
        const dotR=Math.max(2.5,R*0.24);
        // 光晕（微弱扩散）
        const glow=ctx.createRadialGradient(cx,cy,dotR*0.25,cx,cy,dotR*4);
        glow.addColorStop(0,'rgba(255,25,25,0.6)');
        glow.addColorStop(0.35,'rgba(255,15,15,0.2)');
        glow.addColorStop(1,'rgba(255,0,0,0)');
        ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,dotR*4,0,Math.PI*2); ctx.fill();
        // 中心红点
        ctx.fillStyle='#ff1818'; ctx.beginPath(); ctx.arc(cx,cy,dotR,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ff5050'; ctx.beginPath(); ctx.arc(cx,cy,dotR*0.4,0,Math.PI*2); ctx.fill();
      }
    } else if(type==='holo'){
      // 全息：小圆环 + 中心红点
      const ringR=R*1.4;
      ctx.strokeStyle='rgba(255,40,40,0.8)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(cx,cy,ringR,0,Math.PI*2); ctx.stroke();
      // 圆环微光
      ctx.strokeStyle='rgba(255,40,40,0.15)'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(cx,cy,ringR,0,Math.PI*2); ctx.stroke();
      // 中心红点
      const dotR2=Math.max(2,R*0.16);
      const glow2=ctx.createRadialGradient(cx,cy,dotR2*0.3,cx,cy,dotR2*3.5);
      glow2.addColorStop(0,'rgba(255,25,25,0.55)');
      glow2.addColorStop(1,'rgba(255,0,0,0)');
      ctx.fillStyle=glow2; ctx.beginPath(); ctx.arc(cx,cy,dotR2*3.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff2020'; ctx.beginPath(); ctx.arc(cx,cy,dotR2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff5555'; ctx.beginPath(); ctx.arc(cx,cy,dotR2*0.4,0,Math.PI*2); ctx.fill();
    } else if(type==='scope2x'){
      cross(); milDots(0); ticks(4); dot();
    } else if(type==='scope4x'){
      cross(); milDots(5); dot();
    } else if(type==='scope6x'){
      cross(); milDots(7);
      // 左侧垂直测距标尺
      ctx.strokeStyle='rgba(0,0,0,0.85)'; ctx.lineWidth=1;
      const lx=cx-H*0.09;
      ctx.beginPath(); ctx.moveTo(lx,cy-H*0.12); ctx.lineTo(lx,cy+H*0.12); ctx.stroke();
      for(let i=-4;i<=4;i++){ const y=cy+i*H*0.026; ctx.beginPath(); ctx.moveTo(lx,y-3); ctx.lineTo(lx+ (i===0?6:3),y); ctx.stroke(); }
      dot();
    } else if(type==='scope8x'){
      cross(); milDots(9);
      // 弹道补偿标尺（垂直多刻度）
      ctx.strokeStyle='rgba(0,0,0,0.9)'; ctx.lineWidth=1;
      const bx=cx+H*0.09;
      ctx.beginPath(); ctx.moveTo(bx,cy-H*0.16); ctx.lineTo(bx,cy+H*0.02); ctx.stroke();
      for(let i=0;i<=7;i++){ const y=cy-i*H*0.02; ctx.beginPath(); ctx.moveTo(bx-4,y); ctx.lineTo(bx,y); ctx.stroke(); }
      // 中心红色亮十字（极小）
      ctx.strokeStyle='rgba(255,30,30,0.95)'; ctx.lineWidth=1;
      const cr=R*0.5;
      ctx.beginPath(); ctx.moveTo(cx-cr,cy); ctx.lineTo(cx+cr,cy); ctx.moveTo(cx,cy-cr); ctx.lineTo(cx,cy+cr); ctx.stroke();
    }
    // 高倍镜：十字周围特粗圆框（无黑边镜身）
    if(type==='scope2x'||type==='scope4x'||type==='scope6x'||type==='scope8x'){
      const r=win?win.r*H:0.30*H;
      ctx.strokeStyle='rgba(0,0,0,0.92)'; ctx.lineWidth=Math.max(10,H*0.018);
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    }
  }

  // ==================== 新增功能：设置菜单（Esc） ====================
  _loadSettings(){
    try{
      const s=JSON.parse(localStorage.getItem('mrTw_settings')||'{}');
      if(typeof s.sensitivity==='number') this.settings.sensitivity=s.sensitivity;
      if(typeof s.volume==='number') this.settings.volume=s.volume;
      if(typeof s.assist==='boolean') this.settings.assist=s.assist;
    }catch(e){}
    // 钳制灵敏度到合法范围（0.5~2.0倍率，防止旧数据或损坏值导致灵敏度异常）
    this.settings.sensitivity=clamp(this.settings.sensitivity||1,0.5,2.5);
    this.settings.volume=clamp(this.settings.volume||0.8,0,1);
    // 应用到音频
    if(this.audio&&this.audio.master) this.audio.master.gain.value=this.settings.volume;
    // 更新滑块 UI
    const sensEl=$('setSens'), volEl=$('setVol');
    if(sensEl){ sensEl.value=this.settings.sensitivity; $('setSensVal').textContent=this.settings.sensitivity.toFixed(1)+'x'; }
    if(volEl){ volEl.value=Math.round(this.settings.volume*100); $('setVolVal').textContent=Math.round(this.settings.volume*100)+'%'; }
    this._updateAssistToggle();
  }
  _saveSettings(){
    try{ localStorage.setItem('mrTw_settings',JSON.stringify(this.settings)); }catch(e){}
  }
  openSettings(){
    if(this.settingsOpen) return;
    this.settingsOpen=true;
    $('settingsScreen').style.display='flex';
    try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
  }
  closeSettings(){
    if(!this.settingsOpen) return;
    this.settingsOpen=false;
    $('settingsScreen').style.display='none';
    // 游戏中关闭则重新锁定
    if(this.state==='PLAYING'){
      try{ const r=this.renderer.domElement.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){}
    }
  }
  _updateAssistToggle(){
    const el=$('setAssist');
    if(el){ el.classList.toggle('on',this.settings.assist); }
  }
  _bindSettingsUI(){
    const sensEl=$('setSens'), volEl=$('setVol');
    sensEl.addEventListener('input',()=>{
      this.settings.sensitivity=clamp(parseFloat(sensEl.value)||1,0.5,2.5);
      sensEl.value=this.settings.sensitivity;
      $('setSensVal').textContent=this.settings.sensitivity.toFixed(1)+'x';
      this._saveSettings();
    });
    volEl.addEventListener('input',()=>{
      this.settings.volume=parseInt(volEl.value,10)/100;
      $('setVolVal').textContent=volEl.value+'%';
      if(this.audio&&this.audio.master) this.audio.master.gain.value=this.settings.volume;
      this._saveSettings();
    });
    $('setAssist').addEventListener('click',()=>{
      this.settings.assist=!this.settings.assist;
      this._updateAssistToggle();
      this._saveSettings();
    });
    $('setExitBtn').addEventListener('click',()=>{
      if(confirm('确定退出当前对局？')){
        this.toMenu();
        this.closeSettings();
      }
    });
    $('setCloseBtn').addEventListener('click',()=>this.closeSettings());
  }

  // ==================== 新增功能：幸存者档案（localStorage 统计） ====================
  _loadStats(){
    try{
      const s=JSON.parse(localStorage.getItem('mrTw_stats')||'{}');
      this.stats.kills=s.kills||0;
      this.stats.maxWave=s.maxWave||1;
      this.stats.maxSurvival=s.maxSurvival||0;
      this.stats.maxHeadshot=s.maxHeadshot||0;
      this.stats.games=s.games||0;
      this.stats.totalTime=s.totalTime||0;
    }catch(e){}
  }
  _saveStats(){
    try{ localStorage.setItem('mrTw_stats',JSON.stringify(this.stats)); }catch(e){}
  }
  _fmtDuration(sec){
    sec=Math.floor(sec||0);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    if(h>0) return `${h}小时${m}分`;
    if(m>0) return `${m}分${s}秒`;
    return `${s}秒`;
  }
  _statsHTML(){
    return `<div class="statRow"><span class="k">总击杀</span><span class="v">${this.stats.kills.toLocaleString()}</span></div>
      <div class="statRow"><span class="k">最高波次</span><span class="v">${this.stats.maxWave}</span></div>
      <div class="statRow"><span class="k">最长存活</span><span class="v">${this._fmtDuration(this.stats.maxSurvival)}</span></div>
      <div class="statRow"><span class="k">最远爆头</span><span class="v">${Math.round(this.stats.maxHeadshot)}m</span></div>
      <div class="statRow"><span class="k">总对局</span><span class="v">${this.stats.games.toLocaleString()}</span></div>
      <div class="statRow"><span class="k">总时长</span><span class="v">${this._fmtDuration(this.stats.totalTime)}</span></div>`;
  }
  _renderStatsPanel(){
    $('statsContent').innerHTML=this._statsHTML();
  }
  _saveRunStats(){
    // 本局累计到长期统计
    this.stats.kills+=this.kills;
    if(this.zombies.wave>this.stats.maxWave) this.stats.maxWave=this.zombies.wave;
    if(this.runMaxSurvival>this.stats.maxSurvival) this.stats.maxSurvival=this.runMaxSurvival;
    if(this.runMaxHeadshot>this.stats.maxHeadshot) this.stats.maxHeadshot=this.runMaxHeadshot;
    this.stats.games+=1;
    this.stats.totalTime+=Math.floor(this.runTime);
    this._saveStats();
  }
  _bindStatsUI(){
    $('statsBtn').addEventListener('click',()=>{
      this._renderStatsPanel();
      $('statsScreen').style.display='flex';
    });
    $('statsCloseBtn').addEventListener('click',()=>{ $('statsScreen').style.display='none'; });
    $('statsResetBtn').addEventListener('click',()=>{
      if(confirm('确定要重置所有战绩数据吗？此操作不可恢复！')){
        this.stats={kills:0,maxWave:1,maxSurvival:0,maxHeadshot:0,games:0,totalTime:0};
        this._saveStats();
        this._renderStatsPanel();
      }
    });
  }

  // ==================== 新增功能：昼夜随机模式（50%白天/黑夜） ====================
  _applyDayNight(){
    const day=this.isDay;
    if(day){
      // 天空穹顶：淡灰蓝→浅灰（阴天白昼）
      const tex=this.skyDayTex||(this.skyDayTex=makeDaySkyTexture());
      if(this.sky) this.sky.material.map=tex, this.sky.material.needsUpdate=true;
      if(this.starPoints) this.starPoints.visible=false;
      if(this.moon){ this.moon.mesh.visible=false; this.moon.halo.visible=false; this.moon.light.visible=false; }
      if(this.skyHaze) this.skyHaze.visible=false;
      // 光照（提亮：环境1.25 / 半球1.0）
      this.ambientLight.color.set(0xb0c4de); this.ambientLight.intensity=1.25;
      this.hemiLight.color.set(0x87ceeb); this.hemiLight.groundColor.set(0x8aa87a); this.hemiLight.intensity=1.0;
      this.sunLight.visible=false;
      this.daySun.visible=true;
      // 曝光（白天更亮）
      this.renderer.toneMappingExposure=1.8;
      // 头灯：几乎关闭（应急补光）
      if(this.headlight){ this.headlight.intensity=3; if(this.headlightFill) this.headlightFill.intensity=0.1; }
      // 雾：淡灰蓝、更通透
      this.scene.fog=new THREE.FogExp2(0xb0c4de,0.003/MAP_SCALE);
      this.scene.background=new THREE.Color(0x8fa8c8);
    } else {
      // 黑夜：保持夜间预设（星空/月亮/深色穹顶已由 buildSky 建立）
      if(this.starPoints) this.starPoints.visible=true;
      if(this.moon){ this.moon.mesh.visible=true; this.moon.halo.visible=true; this.moon.light.visible=true; }
      if(this.skyHaze) this.skyHaze.visible=true;
      this.ambientLight.color.set(0x2a3b4d); this.ambientLight.intensity=0.85;
      this.hemiLight.color.set(0xffddaa); this.hemiLight.groundColor.set(0x7a5a3a); this.hemiLight.intensity=1.15;
      this.sunLight.visible=true;
      this.daySun.visible=false;
      // 曝光（黑夜提亮：环境0.85/半球1.15/主光1.4/曝光1.75，清晰可见仍保留夜色氛围）
      this.renderer.toneMappingExposure=1.75;
      if(this.headlight){ this.headlight.intensity=140; if(this.headlightFill) this.headlightFill.intensity=1.2; }
      this.scene.fog=new THREE.FogExp2(0x1a1e1a,0.005/MAP_SCALE);
      this.scene.background=new THREE.Color(0x12161f);
    }
  }
  // 开局时显示 "?? 白天" / "? 黑夜" 2秒
  showModeBanner(){
    const el=$('modeBanner');
    el.textContent=this.isDay?'?? 白天':'? 黑夜';
    el.style.color=this.isDay?'#cfe4ff':'#b9c8e8';
    el.style.opacity=1;
    setTimeout(()=>{ el.style.opacity=0; },2000);
  }
}
function scene_shadow(sun,g){ sun.shadow.mapSize.set(512,512); sun.shadow.bias=-0.0004; }

/* ============================================================
   启动
============================================================ */
window.addEventListener('load',()=>{
  window.game=new Game();
  window.game.init();
});



