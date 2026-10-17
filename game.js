// Platanus Hack 26 — Caracas
// Base vacía: configuración de Phaser y controles de la máquina arcade.

const W = 800;
const H = 600;

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

const KEY_TO_ARCADE = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const key of keys) KEY_TO_ARCADE[normKey(key)] = code;
}

// held: botones mantenidos. pressed: botones presionados en este frame.
const held = Object.create(null);
const pressed = Object.create(null);

window.addEventListener('keydown', (e) => {
  // El navegador bloquea el audio hasta que hay una interacción: lo reanudamos con la primera tecla.
  const ac = sc && sc.sound.context;
  if (ac && ac.state != 'running') ac.resume();
  const code = KEY_TO_ARCADE[normKey(e.key)];
  if (!code) return;
  if (!held[code]) pressed[code] = true;
  held[code] = true;
});
window.addEventListener('keyup', (e) => {
  const code = KEY_TO_ARCADE[normKey(e.key)];
  if (code) held[code] = false;
});

function normKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  scene: { create, update },
};

new Phaser.Game(config);

// Grilla infinita: celdas cuadradas de CS px. Cada 2 líneas, una es "mayor" (más brillante).
const CS = 40;
const LR = 170; // radio de luz del jugador
const DARK = 0.035; // brillo mínimo de la grilla (casi oscura)
const DZX = 90, DZY = 60; // zona muerta de la cámara, desde el centro

// Estado de la escena
let gS, gG, gE, gP; // gráficos: estrellas, grilla, enemigos/explosiones, jugador
let sc; // escena
let lv; // luz por vértice de la grilla, en coordenadas de mundo ("c,r" → [r, g, b], cada uno 0..1)
let pl; // jugador (coordenadas de mundo, sin límites)
let cx, cy; // centro de la cámara en el mundo
let stars; // partículas de fondo con parallax
let shots; // proyectiles {x, y, vx, vy, t}
let foes; // enemigos {x, y, vx, vy, a, va, t}; t > 0 = cuenta regresiva para explotar
let blasts; // explosiones {x, y, t, r, c (destello), k (anillo)}
let snakes; // serpientes {s: segmentos [{x, y, a, hf}], m (rumbo de la cabeza), p (fase del zigzag), hc}
let mines; // minas {x, y, a, t (segundos desde que apareció), hp, hf, bp (próximo pitido)}
let mt; // segundos hasta la próxima mina
let ft; // segundos hasta la próxima formación de cuadrados
let dias; // diamantes de oleada {x, y, a (rumbo), d (distancia recorrida), w (oleada), hf}
let lanes; // carriles anunciados antes de una oleada {x, y, a, t (segundos de aviso), w}
let wt; // segundos hasta la próxima oleada
let spins; // espirales {x, y, a, m (rumbo), hp, hf, hc (espera entre golpes al jugador)}
let jets; // naves {t (tipo), x, y, a, m (rumbo), cd, hp, hf (destello de golpe)}
let eshots; // proyectiles enemigos {x, y, vx, vy, t}
// estado de partida: hp (corazones), sh (barra de escudo 0..1), rg (espera para regenerar), hf (destello de la barra),
// lvl, xp, cr (créditos), time, inv (invulnerable), dead (segundos muerto), pw (nivel de cada powerup)
let st;
let gH, tLvl, tTime, tScore, tCr, tOver; // HUD: gráficos y textos
let shop; // tienda abierta: {c (powerups ofrecidos), s (carta elegida), t (segundos abierta)} o null
let gShop, tShop; // tienda: gráficos y textos
let beams; // rayos láser activos {k (0 frontal, 1 cruz), t, w (ancho), len, tick}
let pwt; // enfriamiento restante de cada powerup
let drA, spA; // ángulo de órbita de los drones y de la espiral
let tg; // enemigos vivos este cuadro, como {e, k (tipo)}
let orbs; // puntos recolectables {x, y, vx, vy, p (fase del pulso)}
let bits; // chispas de explosión {x, y, vx, vy, t, c}
let menu = 1, mT = 0, mB = 0; // pantalla de inicio activa, su reloj y si muestra la tabla a pedido
let best = 0; // mejor puntaje de la tabla
let board = []; // tabla de puntajes guardada: hasta 10 {n (iniciales), s (puntaje)}, de mayor a menor
let ent; // ingreso de iniciales: {l (índice de cada letra), i (letra elegida)} o null
let hl = -1; // fila de la tabla recién agregada, para resaltarla
let pause = 0;
let tBoard, tHint, tEnt; // textos de tabla, indicaciones e iniciales
let boss; // jefe activo o null (ver sección Jefes)
let tBan, tBanS, banT = 0; // aviso grande en pantalla (nivel nuevo o jefe) y su tiempo restante
let tBoss; // nombre del jefe sobre su barra de vida
let items, itT; // objetos sueltos por el mapa {x, y, k (tipo), t (vida)} y espera hasta el próximo
let tCombo, tPop; // texto del combo y aviso flotante al tomar un objeto
let tMenu; // textos de la pantalla de inicio
const NAME = 'NEÓN GRID'; // nombre provisional del juego
const BOARD_KEY = 'neongrid.scores';
const ABC = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789';

// Enemigos: dos cuadrados flotando. Al acercarte vibran y explotan.
const FN = 14; // cantidad de enemigos alrededor del jugador
const DASH = 0.16, DSPD = 1100, DCD = 1.4; // dash: duración, velocidad y recarga

// Dificultad: sube con cada nivel hasta el 15. dif() va de 0 a 14 y spd() multiplica las
// velocidades (hasta 1.84 veces): todo se mueve y dispara más rápido, y aparecen más enemigos.
const dif = () => Math.min(st.lvl - 1, 14);
const spd = () => 1 + dif() * 0.06;
const TRIG = 140; // distancia que los activa
const ARM = 1.2; // segundos de vibración antes de explotar
const BR = 110; // radio de la explosión
const RED = 0xff2a3a, YEL = 0xffd23a, ORA = 0xff7a1a;

// Aviones: se mantienen a distancia del jugador, lo rodean y le disparan.
const PNK = 0xff4fd8, SPC = 0xff3399;

// Espirales: molinos de aspas que deambulan girando sin perseguir al jugador. Tocarlos daña.
const SN = 3; // cantidad alrededor del jugador
const SR = 20; // radio

// Oleadas: cada cierto tiempo cruzan la pantalla filas y/o columnas de diamantes azules.
const DB = 0x4d82ff;
const DN = 12; // diamantes por carril
const DGAP = 70; // separación entre diamantes
const DSP = 220; // velocidad
const WARN = 1.6; // segundos de aviso antes de que entren

// Minas: aparecen de pronto cerca del jugador, muestran su gran área de daño, vibran y explotan.
const MC = 0xff4630;
const MR = 170; // radio de la explosión
const FUSE = 2.2; // segundos hasta explotar

// Serpientes: filas de estrellas verdes que te persiguen en zigzag. Cada disparo destruye un
// segmento; si es uno del medio, la serpiente se parte en dos.
const GRN = 0x7dff3a;
const SNN = 2; // serpientes alrededor del jugador
const SGAP = 26; // separación entre segmentos
const SSP = 120; // velocidad
// Tipos de nave (t): n cantidad cerca del jugador, sp velocidad, d distancia preferida,
// cd espera entre disparos, hp golpes que aguanta, r radio de choque, xp/cr recompensa.
const JT = [
  // 0: avión naranja, rápido; vuela rodeando al jugador y dispara 1 proyectil.
  { n: 4, sp: 140, d: 260, cd: 1.6, hp: 1, r: 14, c: ORA, xp: 25, cr: 3 },
  // 1: nave doble rosa, lenta; siempre mira al jugador y dispara 2 proyectiles paralelos.
  { n: 2, sp: 80, d: 330, cd: 2.2, hp: 3, r: 18, c: PNK, xp: 40, cr: 5 },
];

function create() {
  gS = this.add.graphics().setScrollFactor(0);
  gG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  gE = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  gP = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  // Resplandor real (bloom) sobre enemigos, explosiones, jugador y proyectiles: difumina
  // cada trazo con su propio color. Solo existe en WebGL.
  if (this.renderer.type == Phaser.WEBGL) {
    gE.postFX.addBloom(0xffffff, 1, 1, 1.2, 1.4, 4);
    gP.postFX.addBloom(0xffffff, 1, 1, 1.2, 1.4, 4);
  }
  sc = this;
  st = { hp: 5, sh: 1, rg: 0, hf: 0, lvl: 1, xp: 0, cr: 0, pts: 0, time: 0, inv: 0, dead: 0, pw: [0, 0, 0, 0, 0], bn: 0, sw: 0, cb: 0, ct: 0, mg: 0 };
  createHud(this);
  createMenu(this);
  try {
    // Lo guardado puede venir de otra versión: solo se aceptan filas válidas.
    window.platanusArcadeStorage.get(BOARD_KEY).then((r) => {
      if (!r || !r.found || !Array.isArray(r.value)) return;
      board = r.value.filter((e) => e && typeof e.n == 'string' && Number.isFinite(e.s))
        .map((e) => ({ n: e.n.slice(0, 3), s: e.s | 0 })).sort((a, b) => b.s - a.s).slice(0, 10);
      best = board.length ? board[0].s : 0;
    }).catch(() => {});
  } catch (e) {}
  lv = new Map();
  // a: giro del hexágono; f: ángulo del frente (hacia donde dispara); cd: enfriamiento del disparo
  // dt: tiempo de dash restante; dc: recarga del dash; vx, vy: dirección del dash; gh: estela
  pl = { x: 0, y: 0, r: 16, a: 0, f: -Math.PI / 2, sp: 220, cd: 0, dt: 0, dc: 0, vx: 0, vy: 0, gh: [] };
  shots = [];
  foes = [];
  blasts = [];
  jets = [];
  spins = [];
  dias = [];
  mines = [];
  snakes = [];
  beams = [];
  pwt = [0, 0, 0, 0, 0];
  drA = spA = 0;
  mt = 10;
  ft = 12;
  lanes = [];
  wt = 15;
  eshots = [];
  bits = [];
  orbs = [];
  items = [];
  itT = 15;
  cx = cy = 0;
  // z: cuánto se mueven con la cámara (más bajo = más lejos y más tenue)
  stars = [];
  for (let i = 0; i < 110; i++) {
    const z = 0.1 + Math.random() * 0.5;
    stars.push({ x: Math.random() * W, y: Math.random() * H, z, sz: z > 0.45 ? 2 : 1, al: 0.15 + z });
  }
}

function update(_, dt) {
  const s = dt / 1000;
  music();
  // Con la tienda abierta el juego queda en pausa.
  if (shop) {
    updateShop(s);
    for (const k in pressed) delete pressed[k];
    return;
  }
  if (menu) {
    updateMenu(this, s);
    for (const k in pressed) delete pressed[k];
    return;
  }
  // Pausa: START la abre y la cierra; [2] abandona la partida y vuelve al inicio.
  if (pause) {
    if (pressed.START1) setPause(0);
    else if (pressed.P1_2) {
      setPause(0);
      toMenu();
    }
    for (const k in pressed) delete pressed[k];
    return;
  }
  if (pressed.START1 && !st.dead) {
    setPause(1);
    for (const k in pressed) delete pressed[k];
    return;
  }
  st.inv -= s;
  banT -= s;
  st.mg -= s;
  // El combo se corta si pasan unos segundos sin destruir nada.
  if ((st.ct -= s) <= 0) st.cb = 0;
  // Tras vencer al jefe, la tienda se abre cuando termina la explosión.
  if (st.sw > 0 && (st.sw -= s) <= 0) openShop();
  st.hf -= s;
  if (st.pf) st.pf[1] -= s;
  // La barra de escudo se regenera sola tras 2 segundos sin recibir daño.
  if ((st.rg -= s) <= 0 && !st.dead) st.sh = Math.min(1, st.sh + s * 0.35);
  if (st.dead) {
    st.dead += s;
    // Fin de partida: si el puntaje entra en la tabla, primero se ingresan las iniciales.
    // Después, START o disparo vuelve a la pantalla de inicio (también sola a los 12 s).
    if (st.q) {
      if (st.dead > 1.2) updateEntry();
    } else if ((st.dead > 1.2 && (pressed.START1 || pressed.P1_1)) || st.dead > 12) {
      toMenu();
      for (const k in pressed) delete pressed[k];
      return;
    }
  }
  const live = !st.dead;
  let dx = (held.P1_R ? 1 : 0) - (held.P1_L ? 1 : 0);
  let dy = (held.P1_D ? 1 : 0) - (held.P1_U ? 1 : 0);
  if (!live) dx = dy = 0;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  pl.x += dx * pl.sp * s;
  pl.y += dy * pl.sp * s;
  // Dash: [2] da un impulso corto y veloz hacia donde te mueves (o hacia el frente si estás
  // quieto). Eres invulnerable mientras dura: sirve para atravesar enemigos y explosiones.
  if ((pl.dc -= s) <= 0 && pl.dc > -s && live) sfx.ready();
  if (live && pressed.P1_2 && pl.dc <= 0) {
    pl.dc = DCD;
    pl.dt = DASH;
    pl.vx = dx || dy ? dx : Math.cos(pl.f);
    pl.vy = dx || dy ? dy : Math.sin(pl.f);
    sfx.dash();
  }
  if (pl.dt > 0) {
    pl.dt -= s;
    pl.x += pl.vx * DSPD * s;
    pl.y += pl.vy * DSPD * s;
    pl.gh.push({ x: pl.x, y: pl.y, a: pl.a, t: 0.3 });
    light(pl.x, pl.y, 130, 0.8, HC);
  }
  for (const g of pl.gh) g.t -= s;
  pl.gh = pl.gh.filter((g) => g.t > 0);
  pl.a += s * 0.6;

  // El frente gira suave hacia la dirección en que se mueve el jugador.
  if (dx || dy) pl.f = Phaser.Math.Angle.RotateTo(pl.f, Math.atan2(dy, dx), s * 12);

  // Disparo: mantener P1_1 dispara en ráfaga desde la punta del frente.
  pl.cd -= s;
  if (live && held.P1_1 && pl.cd <= 0) {
    pl.cd = 0.14;
    const ux = Math.cos(pl.f), uy = Math.sin(pl.f);
    sfx.shoot();
    shots.push({ x: pl.x + ux * (pl.r + 8), y: pl.y + uy * (pl.r + 8), vx: ux * 640, vy: uy * 640, t: 1.1 });
  }
  if (live) updatePowers(s);
  else beams = [];
  for (const b of shots) {
    b.x += b.vx * s;
    b.y += b.vy * s;
    b.t -= s;
  }
  shots = shots.filter((b) => b.t > 0);

  updateFoes(s);
  updateJets(s);
  updateSpins(s);
  updateWaves(s);
  updateMines(s);
  updateSnakes(s);
  updateBoss(s);
  updateOrbs(s);
  updateItems(s);

  // La cámara solo sigue al jugador cuando sale de la zona muerta, y lo hace suave.
  const tx = pl.x - Phaser.Math.Clamp(pl.x - cx, -DZX, DZX);
  const ty = pl.y - Phaser.Math.Clamp(pl.y - cy, -DZY, DZY);
  const k = Math.min(1, s * 4);
  cx += (tx - cx) * k;
  cy += (ty - cy) * k;
  this.cameras.main.setScroll(cx - W / 2, cy - H / 2);

  // La luz se apaga con el tiempo; cerca del jugador se recarga según la distancia.
  fade(s);
  // Cada cosa ilumina la grilla con su propio color.
  if (live) light(pl.x, pl.y, LR, 1);
  for (const b of shots) light(b.x, b.y, 70, 0.5, b.c);
  for (const b of beams) {
    for (const a of beamAngles(b)) {
      for (let k = 40; k < b.len; k += 60) light(pl.x + Math.cos(a) * k, pl.y + Math.sin(a) * k, 70, 0.6, PNK);
    }
  }
  for (const e of foes) {
    light(e.x, e.y, 90, 0.5, RED);
    // Activado: la zona de peligro se enciende en amarillo cada vez más fuerte.
    if (e.t > 0) light(e.x, e.y, BR, 0.7 * (1 - e.t / ARM), YEL);
  }
  for (const j of jets) light(j.x, j.y, 100, 0.55, JT[j.t].c);
  for (const e of spins) light(e.x, e.y, 110, 0.6, SPC);
  for (const e of dias) light(e.x, e.y, 70, 0.45, DB);
  // Mina: toda su área de daño se tiñe de rojo, cada vez más fuerte.
  for (const k of snakes) for (const e of k.s) light(e.x, e.y, 70, 0.4, GRN);
  for (const e of mines) light(e.x, e.y, MR, 0.25 + 0.6 * Math.min(1, e.t / FUSE), MC, 1);
  for (const e of blasts) if (e.t < 0.3) light(e.x, e.y, e.r * 2.2, 1, e.k);
  for (const b of eshots) light(b.x, b.y, 60, 0.4, b.c);
  if (boss) bossLight();
  for (const o of items) light(o.x, o.y, 90, 0.6, IC[o.k]);
  for (const o of orbs) light(o.x, o.y, 50, 0.3, OB);

  drawStars();
  drawGrid();
  drawFoes();
  drawPlayer();
  if (live) st.time += s;
  drawHud();
  for (const k in pressed) delete pressed[k];
}

function updateFoes(s) {
  // Mantener FN enemigos cerca: aparecen fuera de pantalla y desaparecen si quedan muy lejos.
  foes = foes.filter((e) => Math.hypot(e.x - pl.x, e.y - pl.y) < 1300);
  let n = foes.filter((e) => !e.g).length;
  for (; !boss && n < FN + dif(); n++) {
    const a = Math.random() * 6.28, d = 520 + Math.random() * 500;
    const m = Math.random() * 6.28, v = (15 + Math.random() * 30) * spd();
    foes.push({
      x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d,
      vx: Math.cos(m) * v, vy: Math.sin(m) * v,
      a: Math.random() * 6.28, va: (Math.random() - 0.5) * 1.5, t: 0,
    });
  }
  // Desde el nivel 2 llegan formaciones que viajan juntas, cada vez más seguidas y grandes.
  if (st.lvl > 1 && !boss && !st.dead && (ft -= s) <= 0) {
    ft = Math.max(5, 14 - dif()) + Math.random() * 3;
    formation();
  }
  for (const g of new Set(foes.map((e) => e.g).filter(Boolean))) {
    g.x += g.vx * s;
    g.y += g.vy * s;
    g.a += g.va * s;
  }
  for (const e of foes) {
    // En formación: su lugar es el punto (ox, oy) del grupo, girado con él.
    if (e.g && e.t <= 0) {
      const c = Math.cos(e.g.a), sn = Math.sin(e.g.a);
      e.x = e.g.x + e.ox * c - e.oy * sn;
      e.y = e.g.y + e.ox * sn + e.oy * c;
    }
    if (e.t > 0) {
      // Activado: queda quieto, vibra cada vez más y al llegar a 0 explota.
      e.t -= s;
      // Pitidos de alarma, cada vez más seguidos.
      if ((e.bp -= s) <= 0) {
        e.bp = 0.05 + 0.25 * (e.t / ARM);
        sfx.beep();
      }
      if (e.t <= 0) e.dead = true, boom(e.x, e.y, BR, YEL, RED, 0.7);
      continue;
    }
    e.x += e.vx * s;
    e.y += e.vy * s;
    e.a += e.va * s;
    // Al activarse se suelta de su formación y se queda quieto.
    if (!st.dead && Math.hypot(e.x - pl.x, e.y - pl.y) < TRIG) e.t = ARM, e.bp = 0, e.g = null;
    // Un proyectil lo hace explotar al instante.
    for (const b of shots) {
      if (b.t > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 20) {
        b.t = 0;
        killFoe(e);
        break;
      }
    }
  }
  foes = foes.filter((e) => !e.dead);
  shots = shots.filter((b) => b.t > 0);

  for (const e of blasts) e.t += s;
  blasts = blasts.filter((e) => e.t < 0.7);
  for (const p of bits) {
    p.x += p.vx * s;
    p.y += p.vy * s;
    p.vx *= 1 - s * 2.5;
    p.vy *= 1 - s * 2.5;
    p.t -= s;
  }
  bits = bits.filter((p) => p.t > 0);
}

// Formación de cuadrados que entra desde lejos y cruza por donde está el jugador:
// 0 anillo que gira, 1 muro, 2 flecha que apunta al jugador, 3 rejilla que gira.
// Al ser cuadrados, una sola explosión puede detonar la formación entera en cadena.
function formation() {
  const D = dif(), a = Math.random() * 6.28, v = 70 * spd(), k = (Math.random() * 4) | 0, P = [];
  const g = { x: pl.x + Math.cos(a) * 700, y: pl.y + Math.sin(a) * 700, vx: -Math.cos(a) * v, vy: -Math.sin(a) * v, a, va: 0 };
  if (k == 0) {
    const n = 8 + (D >> 1), r = 70 + n * 5;
    for (let i = 0; i < n; i++) P.push([Math.cos((i / n) * 6.28) * r, Math.sin((i / n) * 6.28) * r]);
    g.va = 0.7;
  } else if (k == 1) {
    const n = 6 + (D >> 1);
    for (let i = 0; i < n; i++) P.push([0, (i - (n - 1) / 2) * 46]);
  } else if (k == 2) {
    P.push([0, 0]);
    for (let i = 1; i <= 3 + (D >> 2); i++) P.push([i * 38, i * 38], [i * 38, -i * 38]);
  } else {
    const n = D > 6 ? 4 : 3;
    for (let i = 0; i < n * n; i++) P.push([((i % n) - (n - 1) / 2) * 52, (((i / n) | 0) - (n - 1) / 2) * 52]);
    g.va = 0.5;
  }
  for (const [ox, oy] of P) foes.push({ x: g.x, y: g.y, vx: 0, vy: 0, a: Math.random() * 6.28, va: 1.2, t: 0, g, ox, oy });
  sfx.warn();
}

function updateJets(s) {
  jets = jets.filter((j) => !j.dead && Math.hypot(j.x - pl.x, j.y - pl.y) < 1400);
  JT.forEach((T, t) => {
    while (!boss && jets.filter((j) => j.t == t).length < T.n + ((dif() / (3 + t)) | 0)) {
      const a = Math.random() * 6.28, d = 650 + Math.random() * 400;
      jets.push({ t, x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d, a: a + Math.PI, m: a + Math.PI, cd: 1 + Math.random() * 2, hp: T.hp, hf: 0 });
    }
  });
  for (const j of jets) {
    const T = JT[j.t];
    const px = pl.x - j.x, py = pl.y - j.y, d = Math.hypot(px, py), toP = Math.atan2(py, px);
    // Lejos: se acerca. Muy cerca: se aleja. A buena distancia: rodea al jugador.
    const want = d > T.d + 60 ? toP : d < T.d - 60 ? toP + Math.PI : toP + Math.PI / 2;
    j.m = Phaser.Math.Angle.RotateTo(j.m, want, s * 2.5);
    j.x += Math.cos(j.m) * T.sp * spd() * s;
    j.y += Math.sin(j.m) * T.sp * spd() * s;
    // El avión apunta hacia donde vuela; la nave doble gira para mirar al jugador.
    j.a = j.t ? Phaser.Math.Angle.RotateTo(j.a, toP, s * 2) : j.m;
    j.hf -= s;
    if ((j.cd -= s) <= 0 && d < 500 && !st.dead) {
      j.cd = (T.cd + Math.random() * 0.8) / (1 + dif() * 0.05);
      if (j.t) {
        // Dos proyectiles paralelos, uno desde cada ala, en la dirección en que mira.
        const ux = Math.cos(j.a), uy = Math.sin(j.a);
        for (const o of [-14, 14]) {
          eshots.push({ x: j.x - uy * o, y: j.y + ux * o, vx: ux * 260 * spd(), vy: uy * 260 * spd(), t: 2.8, c: PNK, d: 0.2 });
        }
        sfx.eshoot2();
      } else {
        eshots.push({ x: j.x, y: j.y, vx: (px / d) * 300 * spd(), vy: (py / d) * 300 * spd(), t: 2.5, c: ORA, d: 0.25 });
        sfx.eshoot();
      }
    }
    for (const b of shots) {
      if (b.t > 0 && Math.hypot(j.x - b.x, j.y - b.y) < T.r + 4) {
        b.t = 0;
        j.hf = 0.08;
        if (--j.hp <= 0) killJet(j);
        else sfx.hit();
        break;
      }
    }
    // Chocar con una nave la destruye, pero te hace daño.
    if (!j.dead && !st.dead && d < pl.r + T.r) {
      j.dead = true;
      boom(j.x, j.y, 55, YEL, T.c);
      hurt(0.4);
    }
  }
  jets = jets.filter((j) => !j.dead);
  shots = shots.filter((b) => b.t > 0);
  for (const b of eshots) {
    b.x += b.vx * s;
    b.y += b.vy * s;
    b.t -= s;
    if (!st.dead && Math.hypot(b.x - pl.x, b.y - pl.y) < pl.r + 3) {
      b.t = 0;
      hurt(b.d);
    }
  }
  eshots = eshots.filter((b) => b.t > 0);
}

// Explosión de radio r: destello de color c, anillo de color k, chispas de ambos.
// Si dmg, quita esa parte de la barra al jugador cuando está dentro del radio, y daña a los enemigos.
function boom(x, y, r, c, k, dmg) {
  blasts.push({ x, y, t: 0, r, c, k });
  if (dmg) {
    if (Math.hypot(x - pl.x, y - pl.y) < r + pl.r) hurt(dmg);
    blastHit(x, y, r);
  }
  for (let i = 0; i < r / 4; i++) {
    const a = Math.random() * 6.28, v = 120 + Math.random() * r * 3.5;
    bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.4 + Math.random() * 0.6, c: i % 3 ? c : k });
  }
  sc.cameras.main.shake(r * 1.5, r * 0.00007);
  sfx.boom(r / BR);
}

function updateSpins(s) {
  spins = spins.filter((e) => !e.dead && Math.hypot(e.x - pl.x, e.y - pl.y) < 1400);
  while (!boss && spins.length < SN + (dif() >> 2)) {
    const a = Math.random() * 6.28, d = 600 + Math.random() * 500;
    spins.push({ x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d, a: 0, m: Math.random() * 6.28, hp: 4, hf: 0, hc: 0 });
  }
  for (const e of spins) {
    // Gira siempre y cambia de rumbo poco a poco, al azar.
    e.a += s * 3;
    e.m += (Math.random() - 0.5) * s * 3;
    e.x += Math.cos(e.m) * 60 * spd() * s;
    e.y += Math.sin(e.m) * 60 * spd() * s;
    e.hf -= s;
    e.hc -= s;
    for (const b of shots) {
      if (b.t > 0 && Math.hypot(e.x - b.x, e.y - b.y) < SR + 4) {
        b.t = 0;
        e.hf = 0.08;
        if (--e.hp <= 0) killSpin(e);
        else sfx.hit();
        break;
      }
    }
    // No muere al tocarte: te daña y espera un momento antes de volver a dañarte.
    if (!e.dead && !st.dead && e.hc <= 0 && Math.hypot(e.x - pl.x, e.y - pl.y) < SR + pl.r) {
      e.hc = 0.8;
      hurt(0.35);
    }
  }
  spins = spins.filter((e) => !e.dead);
  shots = shots.filter((b) => b.t > 0);
}

// Muertes de enemigos (por disparo o por explosión): explotan, dan recompensa y sueltan puntos.
function killFoe(e) {
  e.dead = true;
  boom(e.x, e.y, BR, YEL, RED, 0.7);
  reward(10, 1);
  drop(e.x, e.y, 1);
}

// Mina desactivada a disparos: explosión chica que no daña.
function killMine(e) {
  e.dead = true;
  boom(e.x, e.y, 50, YEL, MC);
  reward(20, 2);
  drop(e.x, e.y, 2);
}

function killSeg(e) {
  e.dead = true;
  boom(e.x, e.y, 40, YEL, GRN);
  reward(8, 1);
  drop(e.x, e.y, 1);
}

function killJet(j) {
  const T = JT[j.t];
  j.dead = true;
  boom(j.x, j.y, 55 + j.t * 15, YEL, T.c);
  reward(T.xp, T.cr);
  drop(j.x, j.y, j.t + 2);
}

function killSpin(e) {
  e.dead = true;
  boom(e.x, e.y, 65, YEL, SPC);
  reward(30, 4);
  drop(e.x, e.y, 2);
}

function killDia(e) {
  e.dead = true;
  boom(e.x, e.y, 45, 0xffffff, DB);
  reward(5, 1);
  drop(e.x, e.y, 1);
  // Bonus por destruir la oleada completa.
  if (++e.w.k == e.w.n) {
    st.pts += 200 * cm();
    sfx.lvl();
  }
}

// Las explosiones de cuadrados y minas también alcanzan a los enemigos dentro del radio:
// naves, espirales y diamantes mueren; cuadrados y minas detonan enseguida (reacción en cadena).
function blastHit(x, y, r) {
  const near = (e) => !e.dead && Math.hypot(e.x - x, e.y - y) < r;
  for (const j of jets) if (near(j)) killJet(j);
  for (const e of spins) if (near(e)) killSpin(e);
  for (const e of dias) if (near(e)) killDia(e);
  for (const k of snakes) {
    for (const e of k.s) {
      if (near(e)) killSeg(e);
    }
  }
  for (const e of foes) {
    if (near(e) && (e.t <= 0 || e.t > 0.2)) {
      e.t = 0.1 + Math.random() * 0.15;
      e.bp = 0;
    }
  }
  for (const e of mines) if (near(e)) e.t = Math.max(e.t, FUSE - 0.15);
  if (boss && Math.hypot(boss.x - x, boss.y - y) < r + 40) hitBoss(6);
}

function updateSnakes(s) {
  snakes = snakes.filter((k) => k.s.length && Math.hypot(k.s[0].x - pl.x, k.s[0].y - pl.y) < 1500);
  while (!boss && snakes.length < SNN + (dif() >> 2)) {
    const a = Math.random() * 6.28, d = 700 + Math.random() * 300, n = 4 + ((Math.random() * (9 + dif())) | 0);
    const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d, seg = [];
    for (let i = 0; i < n; i++) seg.push({ x: x + Math.cos(a) * i * SGAP, y: y + Math.sin(a) * i * SGAP, a: 0, hf: 0 });
    snakes.push({ s: seg, m: a + Math.PI, p: 0, hc: 0 });
  }
  const born = [];
  for (const k of snakes) {
    // Cabeza: va hacia el jugador, oscilando a los lados como una serpiente.
    const h = k.s[0];
    k.p += s * 3;
    k.hc -= s;
    const toP = Math.atan2(pl.y - h.y, pl.x - h.x);
    k.m = Phaser.Math.Angle.RotateTo(k.m, toP + Math.sin(k.p) * 0.9, s * 3);
    h.x += Math.cos(k.m) * SSP * spd() * s;
    h.y += Math.sin(k.m) * SSP * spd() * s;
    // Cada segmento sigue al anterior manteniendo la separación.
    for (let i = 1; i < k.s.length; i++) {
      const e = k.s[i], f = k.s[i - 1], d = Math.hypot(f.x - e.x, f.y - e.y);
      if (d > SGAP) {
        e.x = f.x - ((f.x - e.x) / d) * SGAP;
        e.y = f.y - ((f.y - e.y) / d) * SGAP;
      }
    }
    for (const e of k.s) {
      if (e.dead) continue; // ya destruido por una explosión
      e.a += s * 1.5;
      e.hf -= s;
      for (const b of shots) {
        if (b.t > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 16) {
          b.t = 0;
          killSeg(e);
          break;
        }
      }
      // Tocar cualquier segmento daña, con una pausa antes de volver a dañar.
      if (!e.dead && !st.dead && k.hc <= 0 && Math.hypot(e.x - pl.x, e.y - pl.y) < pl.r + 12) {
        k.hc = 0.8;
        hurt(0.3);
      }
    }
    // Partir la serpiente donde haya segmentos destruidos: cada tramo sigue como serpiente propia.
    if (k.s.some((e) => e.dead)) {
      let cur = [];
      const parts = [];
      for (const e of k.s) {
        if (e.dead) {
          if (cur.length) parts.push(cur);
          cur = [];
        } else cur.push(e);
      }
      if (cur.length) parts.push(cur);
      k.s = parts.shift() || [];
      for (const ps of parts) born.push({ s: ps, m: Math.atan2(ps[0].y - ps[1 % ps.length].y, ps[0].x - ps[1 % ps.length].x) || 0, p: Math.random() * 6, hc: 0 });
    }
  }
  snakes = snakes.concat(born).filter((k) => k.s.length);
  shots = shots.filter((b) => b.t > 0);
}

function updateMines(s) {
  if (!boss && !st.dead && (mt -= s) <= 0) {
    mt = (7 + Math.random() * 6) / (1 + dif() * 0.1);
    // Aparece a una distancia que deja al jugador dentro del área: hay que salir corriendo.
    // Desde el nivel 5 a veces llegan tres en triángulo y hay que escapar por un hueco.
    const a = Math.random() * 6.28, d = 90 + Math.random() * 60, tri = st.lvl >= 5 && Math.random() < 0.4;
    for (let i = 0; i < (tri ? 3 : 1); i++) {
      const b = a + i * 2.09, r = tri ? 160 : d;
      mines.push({ x: pl.x + Math.cos(b) * r, y: pl.y + Math.sin(b) * r, a: Math.random() * 6.28, t: 0, hp: 3, hf: 0, bp: 0.3 });
    }
    sfx.mine();
  }
  for (const e of mines) {
    e.t += s;
    e.hf -= s;
    if ((e.bp -= s) <= 0) {
      e.bp = 0.05 + 0.3 * (1 - e.t / FUSE);
      sfx.beep();
    }
    if (e.t >= FUSE) {
      e.dead = true;
      boom(e.x, e.y, MR, 0xff9a40, MC, 0.6);
      continue;
    }
    // Se puede desactivar a disparos antes de que explote.
    for (const b of shots) {
      if (b.t > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 22) {
        b.t = 0;
        e.hf = 0.08;
        if (--e.hp <= 0) killMine(e);
        else sfx.hit();
        break;
      }
    }
  }
  mines = mines.filter((e) => !e.dead);
  shots = shots.filter((b) => b.t > 0);
}

function updateWaves(s) {
  if (!boss && !st.dead && (wt -= s) <= 0) {
    wt = (25 + Math.random() * 10) / (1 + dif() * 0.08);
    // 0: columnas (vertical), 1: filas (horizontal), 2: combinada (cruz).
    const mode = (Math.random() * 3) | 0;
    const w = { n: 0, k: 0 };
    for (const vert of mode == 2 ? [1, 0] : [!mode, !mode]) {
      // Carril que pasa cerca del jugador, entrando por un borde de la pantalla.
      const off = (Math.random() - 0.5) * 300, sg = Math.random() < 0.5 ? 1 : -1;
      lanes.push(vert
        ? { x: pl.x + off, y: cy - sg * (H / 2 + 30), a: (sg * Math.PI) / 2, t: WARN, w }
        : { x: cx - sg * (W / 2 + 30), y: pl.y + off, a: sg > 0 ? 0 : Math.PI, t: WARN, w });
    }
    sfx.warn();
  }
  for (const l of lanes) {
    if ((l.t -= s) > 0) continue;
    // Fin del aviso: entra la fila de diamantes, uno detrás de otro.
    const ux = Math.cos(l.a), uy = Math.sin(l.a);
    for (let i = 0; i < DN; i++) {
      dias.push({ x: l.x - ux * i * DGAP, y: l.y - uy * i * DGAP, a: l.a, d: -i * DGAP, w: l.w, hf: 0 });
      l.w.n++;
    }
  }
  lanes = lanes.filter((l) => l.t > 0);
  dias = dias.filter((e) => !e.dead);

  for (const e of dias) {
    e.x += Math.cos(e.a) * DSP * spd() * s;
    e.y += Math.sin(e.a) * DSP * spd() * s;
    e.d += DSP * spd() * s;
    if (e.d > 1600) e.gone = true;
    for (const b of shots) {
      if (b.t > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 18) {
        b.t = 0;
        killDia(e);
        break;
      }
    }
    if (!e.dead && !st.dead && Math.hypot(e.x - pl.x, e.y - pl.y) < pl.r + 12) {
      e.dead = true;
      boom(e.x, e.y, 45, 0xffffff, DB);
      hurt(0.4);
    }
  }
  dias = dias.filter((e) => !e.dead && !e.gone);
  shots = shots.filter((b) => b.t > 0);
}

// ---------- Puntos recolectables ----------
const OB = 0x3a7bff; // azul de los puntos
const ON = 25; // puntos sueltos alrededor del jugador
const MAG = 80; // distancia a la que los atraes
const OL = 8; // segundos que dura un punto soltado por un enemigo (parpadea los últimos 2)

function updateOrbs(s) {
  orbs = orbs.filter((o) => Math.hypot(o.x - pl.x, o.y - pl.y) < 1300);
  while (orbs.filter((o) => !o.v).length < ON) {
    const a = Math.random() * 6.28, d = 450 + Math.random() * 750;
    orbs.push({ x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d, vx: 0, vy: 0, p: Math.random() * 6 });
  }
  for (const o of orbs) {
    o.p += s * 4;
    if (o.v && (o.l -= s) <= 0) o.got = true;
    const dx = pl.x - o.x, dy = pl.y - o.y, d = Math.hypot(dx, dy);
    // Cerca del jugador vuelan hacia él (imán).
    // Con el imán activo, todos los puntos cercanos vuelan hacia ti.
    if (d < (st.mg > 0 ? 900 : MAG) && !st.dead) {
      o.vx += (dx / d) * 1400 * s;
      o.vy += (dy / d) * 1400 * s;
    }
    o.vx *= 1 - s * 3;
    o.vy *= 1 - s * 3;
    o.x += o.vx * s;
    o.y += o.vy * s;
    if (d < pl.r + 6 && !st.dead) {
      o.got = true;
      st.pts += 10 * cm();
      sfx.orb();
    }
  }
  orbs = orbs.filter((o) => !o.got);
}

// Suelta n puntos que salen disparados desde (x, y); v marca que vienen de un enemigo.
function drop(x, y, n) {
  if (Math.random() < 0.035) spawnItem(x, y);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, v = 80 + Math.random() * 120;
    orbs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, p: 0, v: 1, l: OL + Math.random() });
  }
}

// Quita d (0..1) de la barra de escudo. Si se vacía, pierdes un corazón, la barra se
// rellena y quedas invulnerable un momento (parpadea). El daño sobrante se descarta.
function hurt(d) {
  if (st.inv > 0 || st.dead || pl.dt > 0) return;
  st.cb = 0; // recibir daño corta el combo
  st.sh -= d;
  st.rg = 2;
  st.hf = 0.15;
  if (st.sh > 0) {
    sc.cameras.main.flash(120, 110, 10, 30);
    sfx.graze();
    return;
  }
  st.hp--;
  st.sh = 1;
  st.inv = 1.5;
  sc.cameras.main.flash(220, 255, 30, 60);
  sfx.hurt();
  if (st.hp <= 0) {
    st.dead = 0.001;
    boom(pl.x, pl.y, 90, 0xffffff, HC);
    hl = -1;
    st.q = st.pts > 0 && (board.length < 10 || st.pts > board[board.length - 1].s);
    if (st.q) ent = { l: [0, 0, 0], i: 0 };
    else showOver();
  }
}

// Nueva partida en el mismo lugar del mundo, sin enemigos cerca.
function restart() {
  st = { hp: 5, sh: 1, rg: 0, hf: 0, lvl: 1, xp: 0, cr: 0, pts: 0, time: 0, inv: 1.5, dead: 0, pw: [0, 0, 0, 0, 0], bn: 0, sw: 0, cb: 0, ct: 0, mg: 0 };
  foes = [];
  jets = [];
  spins = [];
  dias = [];
  mines = [];
  snakes = [];
  beams = [];
  pwt = [0, 0, 0, 0, 0];
  drA = spA = 0;
  mt = 10;
  ft = 12;
  lanes = [];
  wt = 15;
  eshots = [];
  boss = null;
  banT = 0;
  items = [];
  itT = 15;
  for (const t of [tOver, tBan, tBanS, tBoss]) t.setVisible(false);
  shop = null;
  hideShop();
}

function fade(s) {
  for (const [key, v] of lv) {
    for (let i = 0; i < 3; i++) v[i] = Math.max(0, v[i] - s * 0.35);
    if (!(v[0] + v[1] + v[2])) lv.delete(key);
  }
}

// Sonidos sintetizados con Web Audio (sin archivos).
let nbuf; // buffer de ruido blanco, se crea una vez
function nb(ac) {
  if (!nbuf) {
    nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return nbuf;
}
function tone(f0, f1, dur, type, vol) {
  const ac = sc.sound.context;
  if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur);
}
function noise(dur, vol, f0, f1) {
  const ac = sc.sound.context;
  if (!ac) return;
  const t = ac.currentTime, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = nb(ac);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f).connect(g).connect(ac.destination);
  n.start(t);
  n.stop(t + dur);
}
const sfx = {
  // "Fiumm": barrido agudo que cae rápido, con una capa grave que queda zumbando un poco más.
  shoot: () => {
    tone(1700, 170, 0.13, 'sine', 0.09);
    tone(850, 80, 0.18, 'triangle', 0.05);
  },
  beep: () => tone(1400, 1300, 0.05, 'triangle', 0.06),
  hurt: () => {
    tone(320, 60, 0.35, 'sawtooth', 0.12);
    noise(0.25, 0.25, 3000, 300);
  },
  eshoot2: () => tone(700, 260, 0.14, 'square', 0.04),
  graze: () => tone(260, 120, 0.12, 'square', 0.07),
  mine: () => tone(180, 900, 0.18, 'sawtooth', 0.06),
  warn: () => [0, 1, 2].forEach((i) => setTimeout(() => tone(620, 620, 0.16, 'square', 0.05), i * 260)),
  laser: () => {
    tone(160, 900, 0.35, 'sawtooth', 0.05);
    noise(0.4, 0.12, 4000, 600);
  },
  dash: () => {
    noise(0.22, 0.3, 500, 6000);
    tone(220, 900, 0.15, 'sine', 0.07);
  },
  ready: () => tone(1300, 1700, 0.05, 'sine', 0.03),
  missile: () => tone(300, 1200, 0.15, 'triangle', 0.05),
  buy: () => [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, f * 1.01, 0.1, 'square', 0.05), i * 60)),
  hit: () => tone(1800, 900, 0.05, 'square', 0.04),
  eshoot: () => tone(520, 180, 0.12, 'sawtooth', 0.04),
  orb: () => tone(1100 + Math.random() * 300, 1800, 0.07, 'sine', 0.06),
  lvl: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'triangle', 0.07), i * 70)),
  // v: volumen relativo (las explosiones chicas suenan más suave)
  boom: (v) => {
    noise(0.7 * v, 0.4 * v, 2200, 80);
    tone(140 / v, 35, 0.45 * v, 'sine', 0.35 * v);
  },
};

// Puntos locales [[x, y], ...] rotados según o.a y trasladados a (o.x, o.y).
function shape(o, pts) {
  const c = Math.cos(o.a), s = Math.sin(o.a);
  return pts.map(([x, y]) => ({ x: o.x + x * c - y * s, y: o.y + x * s + y * c }));
}

function sqPts(x, y, h, a) {
  const p = [];
  for (let k = 0; k < 4; k++) {
    const t = a + Math.PI / 4 + (k * Math.PI) / 2;
    p.push({ x: x + Math.cos(t) * h * Math.SQRT2, y: y + Math.sin(t) * h * Math.SQRT2 });
  }
  return p;
}

function drawFoes() {
  gE.clear();
  // Puntos: esfera azul con núcleo claro que late suave.
  for (const o of orbs) {
    // Al final de su vida parpadea cada vez más rápido antes de desaparecer.
    if (o.v && o.l < 2 && Math.sin(o.l * (14 - o.l * 4)) < 0) continue;
    const k = 1 + Math.sin(o.p) * 0.15;
    gE.fillStyle(OB, 0.07);
    gE.fillCircle(o.x, o.y, 18 * k);
    gE.fillStyle(OB, 0.15);
    gE.fillCircle(o.x, o.y, 12 * k);
    gE.fillStyle(OB, 0.35);
    gE.fillCircle(o.x, o.y, 7 * k);
    gE.fillStyle(0x9fd4ff, 1);
    gE.fillCircle(o.x, o.y, 3.5 * k);
  }
  for (const e of foes) {
    let x = e.x, y = e.y;
    if (e.t > 0) {
      // Zona de peligro: círculo amarillo que se intensifica y late cada vez más rápido.
      const q = 1 - e.t / ARM;
      const pulse = 0.5 + 0.5 * Math.sin(q * q * 40);
      gE.fillStyle(YEL, 0.05 + q * 0.2 * pulse);
      gE.fillCircle(x, y, BR);
      gE.lineStyle(2, RED, 0.3 + q * 0.6);
      gE.strokeCircle(x, y, BR);
      const amp = 1 + q * 5;
      x += (Math.random() - 0.5) * 2 * amp;
      y += (Math.random() - 0.5) * 2 * amp;
    }
    const s1 = sqPts(x, y, 13, e.a);
    const s2 = sqPts(x + 6, y + 5, 13, e.a + 0.35);
    for (const [w, al] of [[9, 0.1], [4, 0.3], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? RED : 0xffe0e6, al);
      gE.strokePoints(s1, true);
      gE.strokePoints(s2, true);
    }
  }
  // Explosión: destello amarillo y anillo rojo que se expande y se desvanece.
  for (const e of blasts) {
    const q = e.t / 0.7;
    if (q < 0.35) {
      gE.fillStyle(e.c, 0.6 * (1 - q / 0.35));
      gE.fillCircle(e.x, e.y, e.r * (0.6 + q));
    }
    for (const [w, al] of [[18, 0.15], [6, 0.4], [2, 0.9]]) {
      gE.lineStyle(w, e.k, al * (1 - q));
      gE.strokeCircle(e.x, e.y, e.r * (0.4 + q * 1.4));
    }
  }
  // Serpiente: cada segmento es una estrella de seis puntas (dos triángulos algo desplazados).
  for (const k of snakes) {
    for (const e of k.s) {
      const c = e.hf > 0 ? 0xffffff : GRN;
      const t1 = shape({ x: e.x - 1.5, y: e.y - 1, a: e.a }, [[13, 0], [-6.5, -11.3], [-6.5, 11.3], [13, 0]]);
      const t2 = shape({ x: e.x + 1.5, y: e.y + 1, a: e.a + Math.PI }, [[13, 0], [-6.5, -11.3], [-6.5, 11.3], [13, 0]]);
      for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
        gE.lineStyle(w, w > 2 ? c : 0xeaffd8, al);
        gE.strokePoints(t1, false);
        gE.strokePoints(t2, false);
      }
    }
  }
  // Mina: anillo rojo del área de daño, y tres triángulos que vibran cada vez más.
  for (const e of mines) {
    const q = Math.min(1, e.t / FUSE), in_ = Math.min(1, e.t / 0.25);
    const pulse = 0.6 + 0.4 * Math.sin(q * q * 50);
    for (const [w, al] of [[16, 0.12], [6, 0.3], [2, 0.9]]) {
      gE.lineStyle(w, MC, al * in_ * pulse);
      gE.strokeCircle(e.x, e.y, MR * (0.6 + 0.4 * in_));
    }
    const amp = 1 + q * 6, c = e.hf > 0 ? 0xffffff : MC;
    // Aparece girando rápido y frena en 0.6 s; luego gira lento y acelera justo antes de explotar.
    const sp = Math.max(0, 1 - e.t / 0.6);
    const rot = 12 * sp * sp + 0.8 * e.t + 6 * q ** 4;
    const o = { x: e.x + (Math.random() - 0.5) * 2 * amp, y: e.y + (Math.random() - 0.5) * 2 * amp, a: e.a + rot };
    const tri = (dx, dy, da) => shape({ x: o.x + dx, y: o.y + dy, a: o.a + da }, [[13 * in_, 0], [-8 * in_, -11 * in_], [-8 * in_, 11 * in_], [13 * in_, 0]]);
    const ts = [tri(-5, -3, 0), tri(5, 2, 0.15), tri(-1, 6, -0.2)];
    for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? c : 0xffe0d8, al);
      for (const t of ts) gE.strokePoints(t, false);
    }
  }
  // Aviso de oleada: línea tenue por donde pasará el carril y flechas que parpadean en el borde.
  for (const l of lanes) {
    const ux = Math.cos(l.a), uy = Math.sin(l.a), on = (l.t * 8) & 1;
    gE.lineStyle(2, DB, 0.25);
    gE.lineBetween(l.x, l.y, l.x + ux * 1000, l.y + uy * 1000);
    if (on) {
      for (const k of [45, 70]) {
        const ar = shape({ x: l.x + ux * k, y: l.y + uy * k, a: l.a }, [[-7, -10], [5, 0], [-7, 10]]);
        for (const [w, al] of [[8, 0.2], [2, 1]]) {
          gE.lineStyle(w, w > 2 ? DB : 0xdde8ff, al);
          gE.strokePoints(ar, false);
        }
      }
    }
  }
  // Diamante: rombo alargado en la dirección de viaje, con facetas interiores.
  for (const e of dias) {
    const ls = [
      shape(e, [[16, 0], [0, -10], [-16, 0], [0, 10], [16, 0]]),
      shape(e, [[-16, 0], [16, 0]]),
      shape(e, [[0, -10], [6, 0], [0, 10]]),
    ];
    for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? DB : 0xdde8ff, al);
      for (const l of ls) gE.strokePoints(l, false);
    }
  }
  // Espiral: 5 aspas triangulares alrededor del centro.
  for (const e of spins) {
    const c = e.hf > 0 ? 0xffffff : SPC;
    const bl = [];
    for (let i = 0; i < 5; i++) {
      const t = (i * 6.28) / 5;
      const p = (r, u) => [Math.cos(t + u) * r, Math.sin(t + u) * r];
      bl.push(shape(e, [p(4, 0), p(SR, 0), p(SR * 0.75, 0.95), p(4, 0)]));
    }
    for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? c : 0xfff0f8, al);
      for (const l of bl) gE.strokePoints(l, false);
    }
  }
  for (const j of jets) {
    // Al recibir un golpe destella en blanco.
    const c = j.hf > 0 ? 0xffffff : JT[j.t].c;
    const ls = j.t
      ? // Nave doble: cabina redonda con cruz, dos brazos y dos alas largas a los lados.
        [shape(j, [[-7, 0], [7, 0]]), shape(j, [[0, -7], [0, 7]]),
         shape(j, [[0, -7], [0, -15]]), shape(j, [[0, 7], [0, 15]]),
         shape(j, [[-13, -15], [13, -15]]), shape(j, [[-13, 15], [13, 15]])]
      : // Avión: punta de flecha con muesca atrás y un trazo interior.
        [shape(j, [[17, 0], [-11, -13], [-4, 0], [-11, 13], [17, 0]]), shape(j, [[8, 0], [-6, -6], [-2, 0]])];
    for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? c : 0xfff0f8, al);
      for (const l of ls) gE.strokePoints(l, false);
      if (j.t) gE.strokeCircle(j.x, j.y, 7);
    }
  }
  drawBoss();
  drawItems();
  for (const b of eshots) {
    gE.fillStyle(b.c, 0.25);
    gE.fillCircle(b.x, b.y, 7);
    gE.fillStyle(0xfff0f0, 1);
    gE.fillCircle(b.x, b.y, 2.5);
  }
  for (const p of bits) {
    gE.lineStyle(2, p.c, Math.min(1, p.t * 2));
    gE.lineBetween(p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03);
  }
}

// Ilumina los vértices dentro del radio R alrededor de (x, y), con intensidad máxima m y color c.
// Con flat, la luz es pareja dentro de todo el radio en vez de apagarse hacia el borde.
function light(x, y, R, m, c = 0xffffff, flat) {
  const k = [(c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  const c0 = Math.ceil((x - R) / CS), c1 = Math.floor((x + R) / CS);
  const r0 = Math.ceil((y - R) / CS), r1 = Math.floor((y + R) / CS);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const d = Math.hypot(c * CS - x, r * CS - y) / R;
      if (d >= 1) continue;
      const f = flat ? m : (1 - d) * (1 - d) * m, key = c + ',' + r;
      const v = lv.get(key) || [0, 0, 0];
      for (let i = 0; i < 3; i++) v[i] = Math.max(v[i], f * k[i]);
      lv.set(key, v);
    }
  }
}

const Z = [0, 0, 0];
function L(c, r) {
  return lv.get(c + ',' + r) || Z;
}

// Estrellas en pantalla, desplazadas por la cámara según su profundidad y repetidas en bucle.
function drawStars() {
  gS.clear();
  for (const t of stars) {
    const x = (((t.x - cx * t.z) % W) + W) % W;
    const y = (((t.y - cy * t.z) % H) + H) % H;
    gS.fillStyle(0xffffff, t.al);
    gS.fillRect(x, y, t.sz, t.sz);
  }
}

// Segmento entre dos vértices con luz a y b: toma el color promedio y su brillo.
function seg(x1, y1, x2, y2, a, b, maj) {
  const r = (a[0] + b[0]) / 2, g = (a[1] + b[1]) / 2, bl = (a[2] + b[2]) / 2;
  const v = Math.max(r, g, bl);
  const al = DARK + v * (maj ? 0.85 : 0.45);
  const c = v ? ((255 * r / v) << 16) | ((255 * g / v) << 8) | (255 * bl / v) : 0xffffff;
  if (v > 0.05) {
    gG.lineStyle(maj ? 6 : 4, c, al * 0.15);
    gG.lineBetween(x1, y1, x2, y2);
  }
  gG.lineStyle(maj ? 2 : 1, c, al);
  gG.lineBetween(x1, y1, x2, y2);
}

// Solo se dibujan las líneas visibles; la grilla se repite sin fin.
function drawGrid() {
  gG.clear();
  const c0 = Math.floor((cx - W / 2) / CS), c1 = Math.ceil((cx + W / 2) / CS);
  const r0 = Math.floor((cy - H / 2) / CS), r1 = Math.ceil((cy + H / 2) / CS);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = c * CS, y = r * CS, v = L(c, r);
      if (c < c1) seg(x, y, x + CS, y, v, L(c + 1, r), !(r & 1));
      if (r < r1) seg(x, y, x, y + CS, v, L(c, r + 1), !(c & 1));
    }
  }
}

function hexPts(x, y, r, a) {
  const p = [];
  for (let k = 0; k < 6; k++) {
    const t = a + (k * Math.PI) / 3;
    p.push({ x: x + Math.cos(t) * r, y: y + Math.sin(t) * r });
  }
  return p;
}

// Hexágono blanco con halo.
function drawPlayer() {
  gP.clear();
  // Muerto no se dibuja; invulnerable parpadea.
  // Estela del dash: copias cian del hexágono que se desvanecen.
  for (const g of pl.gh) {
    gP.lineStyle(3, HC, g.t * 2);
    gP.strokePoints(hexPts(g.x, g.y, pl.r, g.a), true);
  }
  // Mientras el dash se recarga, un arco fino alrededor de la nave se va completando.
  if (pl.dc > 0 && !st.dead && !menu) {
    gP.lineStyle(2, HC, 0.45);
    gP.beginPath();
    gP.arc(pl.x, pl.y, pl.r + 12, -Math.PI / 2, -Math.PI / 2 + 6.283 * (1 - pl.dc / DCD));
    gP.strokePath();
  }
  if (!st.dead && !(st.inv > 0 && (st.inv * 12) & 1)) drawShip();
  drawPowers();
  // Proyectiles: trazo corto en la dirección de vuelo, del color de quien los dispara.
  for (const b of shots) {
    for (const [w, al] of [[8, 0.15], [3, 0.5], [1.5, 1]]) {
      gP.lineStyle(w, w > 2 ? b.c || 0xffffff : 0xffffff, al);
      gP.lineBetween(b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.x, b.y);
    }
  }
}

function drawShip() {
  // El hexágono gira solo; la flecha de afuera marca la dirección de disparo.
  const f = pl.f, ux = Math.cos(f), uy = Math.sin(f);
  const o = hexPts(pl.x, pl.y, pl.r, pl.a);
  const tip = { x: pl.x + ux * (pl.r + 8), y: pl.y + uy * (pl.r + 8) };
  const arr = [
    { x: pl.x + Math.cos(f - 0.2) * (pl.r + 4), y: pl.y + Math.sin(f - 0.2) * (pl.r + 4) },
    tip,
    { x: pl.x + Math.cos(f + 0.2) * (pl.r + 4), y: pl.y + Math.sin(f + 0.2) * (pl.r + 4) },
  ];
  for (const [w, al] of [[14, 0.06], [8, 0.12], [4, 0.35], [2, 1]]) {
    gP.lineStyle(w, w > 2 ? 0xfff2d0 : 0xffffff, al);
    gP.strokePoints(o, true);
  }
  for (const [w, al] of [[5, 0.15], [1.5, 1]]) {
    gP.lineStyle(w, 0xffffff, al);
    gP.strokePoints(arr, false);
  }
}

// ---------- HUD holográfico ----------
const HB = 0x2a8cff, HC = 0x5fd8ff; // azul base, cian brillante
const cm = () => Math.min(8, 1 + ((st.cb / 5) | 0)); // multiplicador de puntos del combo
const need = () => Math.round(150 * st.lvl ** 1.5); // XP para el siguiente nivel: 150, 424, 779, 1200...

// Suma XP y créditos por enemigo destruido; sube de nivel al llenar la barra.
function reward(xp, cr) {
  // La barra se llena hasta el tope: eliges un powerup gratis y aparece el jefe.
  // El nivel sube al vencerlo.
  st.xp = Math.min(need(), st.xp + xp);
  st.cr += cr;
  // Combo: cada destrucción dentro de 2.5 s lo alarga; cada 5 sube el multiplicador (hasta x8).
  const m0 = cm();
  st.cb++;
  st.ct = 2.5;
  if (cm() > m0) tone(500 + cm() * 120, 900 + cm() * 160, 0.15, 'square', 0.05);
  st.pts += xp * cm();
  if (st.xp >= need() && !boss && !shop && st.sw <= 0 && !st.dead) openShop(1);
}

function createHud(scene) {
  gH = scene.add.graphics().setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD);
  const txt = (x, y, size, ox) =>
    scene.add.text(x, y, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: size, color: '#f2fbff' })
      .setOrigin(ox, 0.5).setScrollFactor(0).setShadow(0, 0, '#5fd8ff', 8, true, true);
  tLvl = txt(92, 70, 13, 0);
  tTime = txt(W / 2, 30, 32, 0.5);
  tScore = txt(W / 2, 62, 16, 0.5);
  tCr = txt(712, 70, 13, 1);
  tBoss = txt(W / 2, 112, 12, 0.5).setVisible(false);
  tCombo = txt(W / 2, 84, 14, 0.5);
  tPop = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: 16, color: '#f2fbff' })
    .setOrigin(0.5).setDepth(8).setShadow(0, 0, '#5fd8ff', 8, true, true).setVisible(false);
  const big = (y, size) => scene.add.text(W / 2, y, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: size, color: '#f2fbff' })
    .setOrigin(0.5).setScrollFactor(0).setDepth(9).setVisible(false);
  tBan = big(200, 56);
  tBanS = big(258, 18);
  // Tienda: fondo, encabezado y 3 cartas (nombre, nivel, descripción, precio).
  gShop = scene.add.graphics().setScrollFactor(0).setDepth(10);
  const st2 = (x, y, size, col, wrap) =>
    scene.add.text(x, y, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: size, color: col, align: 'center', wordWrap: { width: wrap || 400 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11).setShadow(0, 0, '#5fd8ff', 8, true, true).setVisible(false);
  tShop = {
    head: st2(W / 2, 62, 30, '#f2fbff'),
    cr: st2(W / 2, 100, 15, '#ffb02e'),
    foot: st2(W / 2, 560, 13, '#bfe9ff'),
    cards: [0, 1, 2].map(() => ({
      n: st2(0, 228, 18, '#f2fbff', 170),
      l: st2(0, 272, 16, '#ffb02e'),
      d: st2(0, 330, 12, '#e6f2ff', 170),
      p: st2(0, 418, 16, '#ffb02e'),
    })),
  };
  tBoard = st2(W / 2, 330, 18, '#f2fbff');
  tHint = st2(W / 2, 540, 15, '#bfe9ff');
  tEnt = st2(W / 2, 320, 64, '#f2fbff');
  tOver = scene.add.text(W / 2, 110, '', {
    fontFamily: 'monospace', fontStyle: 'bold', fontSize: 34, color: '#f2fbff', align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(11).setShadow(0, 0, '#ff3cf0', 14, true, true).setVisible(false);
}

// Banda horizontal de x0 a x1 centrada en y, que cambia de alto (h0 → h1) y de brillo
// (a0 → a1) a lo largo: así parece una pieza vista en perspectiva.
function band(x0, x1, y, h0, h1, c, a0, a1) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const q = i / n, q1 = (i + 1) / n;
    const xa = x0 + (x1 - x0) * q, xb = x0 + (x1 - x0) * q1;
    const ha = (h0 + (h1 - h0) * q) / 2, hb = (h0 + (h1 - h0) * q1) / 2;
    gH.fillStyle(c, a0 + (a1 - a0) * q);
    gH.fillPoints([{ x: xa, y: y - ha }, { x: xb, y: y - hb }, { x: xb, y: y + hb }, { x: xa, y: y + ha }], true);
  }
}

// Fila de n segmentos delgados que se apagan hacia el final.
function segs(x0, x1, y, n, al) {
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    gH.fillStyle(HB, al * (1 - i / (n + 1)));
    gH.fillRect(x0 + i * w + (x1 < x0 ? w : 0), y, Math.abs(w) - 3, 3);
  }
}

function drawHud() {
  gH.clear();
  // Parpadeo holográfico ocasional.
  const fl = Math.random() < 0.03 ? 0.6 : 0.95;
  gH.setAlpha(fl);
  for (const t of [tLvl, tTime, tScore, tCr]) t.setAlpha(fl);
  tOver.setAlpha(0.75 + 0.25 * Math.sin(st.dead * 6));

  // Izquierda: rayo, barra de experiencia que se afina hacia el centro, y nivel.
  segs(34, 124, 22, 4, 0.9);
  band(70, 300, 42, 22, 8, HB, 0.4, 0);
  band(84, 280, 42, 6, 3, HB, 0.25, 0.05);
  band(84, 84 + 196 * Math.min(1, st.xp / need()), 42, 6, 6 - 3 * Math.min(1, st.xp / need()), HC, 1, 0.8);
  segs(250, 300, 56, 4, 0.6);
  const bolt = [[3, -16], [-9, 3], [-1, 3], [-4, 16], [9, -3], [1, -3], [5, -16]].map(([x, y]) => ({ x: 52 + x, y: 46 + y }));
  for (const [w, al] of [[10, 0.15], [4, 0.4]]) {
    gH.lineStyle(w, HB, al);
    gH.strokePoints(bolt, true);
  }
  gH.fillStyle(HC, 0.95);
  gH.fillPoints(bolt, true);
  tLvl.setText('NIVEL ' + st.lvl);

  // Centro: panel oscuro bajo el tiempo.
  gH.fillStyle(HB, 0.18);
  gH.fillPoints([{ x: 318, y: 8 }, { x: 482, y: 8 }, { x: 466, y: 48 }, { x: 334, y: 48 }], true);
  const t = st.time | 0;
  tTime.setText(String((t / 60) | 0).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
  tScore.setText(String(st.pts).padStart(6, '0'));

  // Derecha: barra con corazones que se afina hacia el centro, corazón grande y créditos.
  segs(770, 680, 22, 4, 0.9);
  band(730, 500, 42, 22, 8, HB, 0.4, 0);
  segs(500, 550, 56, 4, 0.6);
  for (let i = 0; i < 5; i++) {
    gH.fillStyle(HC, i < st.hp ? 0.95 : 0.15);
    gH.fillPoints(heart(706 - i * 24, 42, 0.5), true);
  }
  // Ícono con aberración cromática: copias desplazadas en magenta y cian.
  for (const [ox, w, c, al] of [[0, 10, HB, 0.2], [-2, 2, 0xff3cf0, 0.45], [2, 2, HC, 0.6], [0, 2, 0xf2fbff, 0.9]]) {
    gH.lineStyle(w, c, al);
    gH.strokePoints(heart(758 + ox, 46, 1), true);
  }
  // Barra de escudo bajo los corazones: blanca al recibir daño, roja cuando queda poco.
  gH.fillStyle(HB, 0.3);
  gH.fillRect(598, 56, 118, 4);
  gH.fillStyle(st.hf > 0 ? 0xffffff : st.sh < 0.3 ? 0xff3c5a : HC, 0.95);
  gH.fillRect(598, 56, 118 * Math.max(0, st.sh), 4);
  tCr.setText('CRÉDITOS ' + st.cr);

  drawBossHud();
  // Combo bajo el puntaje: multiplicador y una barra que se vacía hasta que se corta.
  tCombo.setVisible(st.cb > 1 && !menu);
  if (st.cb > 1) {
    const m = cm();
    tCombo.setText('COMBO ' + st.cb + (m > 1 ? '   x' + m : '')).setColor(m > 1 ? '#ffb02e' : '#bfe9ff');
    gH.fillStyle(m > 1 ? ORA : HC, 0.85);
    gH.fillRect(W / 2 - 50, 94, 100 * Math.max(0, st.ct / 2.5), 2);
  }

  // Abajo a la izquierda: powerups que tienes, en hexágonos con su nivel en 4 marcas.
  // El recién comprado destella en magenta un momento.
  const own = [0, 1, 2, 3, 4].filter((i) => st.pw[i]);
  if (own.length) band(16, 330, 562, 44, 10, HB, 0.25, 0);
  own.forEach((i, j) => {
    const x = 42 + j * 56, y = 556, nw = st.pf && st.pf[0] == i && st.pf[1] > 0;
    const c = nw && (st.pf[1] * 6) & 1 ? 0xff3cf0 : HC;
    const hx = hexPts(x, y, 20, Math.PI / 6);
    gH.fillStyle(0x0b0c24, 0.8);
    gH.fillPoints(hx, true);
    gH.lineStyle(2, c, 0.9);
    gH.strokePoints(hx, true);
    icon(gH, i, x, y, 0.75);
    for (let k = 0; k < 4; k++) {
      gH.fillStyle(k < st.pw[i] ? c : HB, k < st.pw[i] ? 0.95 : 0.3);
      gH.fillRect(x - 15 + k * 8, y + 25, 6, 3);
    }
  });
}

function heart(x, y, k) {
  const p = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * 6.28;
    p.push({
      x: x + 16 * Math.sin(t) ** 3 * k,
      y: y - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k,
    });
  }
  return p;
}

// ---------- Powerups ----------
// Cada uno tiene 4 niveles. Se compran con créditos en la tienda que se abre al subir de nivel.
const PW = [
  { n: 'LÁSER', d: 'DISPARA UN RAYO QUE ATRAVIESA ENEMIGOS HACIA ADELANTE CADA POCOS SEGUNDOS.', c: 12 },
  { n: 'LÁSER CRUZ', d: 'DISPARA RAYOS QUE ATRAVIESAN ENEMIGOS EN CUATRO DIRECCIONES.', c: 16 },
  { n: 'MISILES GUIADOS', d: 'LANZA MISILES QUE PERSIGUEN A LOS ENEMIGOS MÁS CERCANOS.', c: 12 },
  { n: 'ESPIRAL', d: 'DISPARA PROYECTILES EN ESPIRAL ALREDEDOR DE LA NAVE.', c: 10 },
  { n: 'DRONES', d: 'DRONES QUE GIRAN ALREDEDOR DE LA NAVE Y DISPARAN A LOS ENEMIGOS CERCANOS. MÁXIMO 3.', c: 14 },
];
const price = (i) => PW[i].c * (st.pw[i] + 1);
// Rayo frontal: hacia donde apuntas. Cruz: 4 rayos que giran con el hexágono.
const beamAngles = (b) => (b.k ? [0, 1, 2, 3].map((i) => pl.a + (i * Math.PI) / 2) : [pl.f]);

function drones() {
  const n = Math.min(st.pw[4], 3), r = [];
  for (let i = 0; i < n; i++) {
    const a = drA + (i * 6.28) / n;
    r.push({ x: pl.x + Math.cos(a) * 48, y: pl.y + Math.sin(a) * 48, a });
  }
  return r;
}

function targets() {
  tg = [];
  for (const e of foes) tg.push({ e, k: 0 });
  for (const e of jets) tg.push({ e, k: 1 });
  for (const e of spins) tg.push({ e, k: 2 });
  for (const e of dias) tg.push({ e, k: 3 });
  for (const e of mines) tg.push({ e, k: 4 });
  for (const k of snakes) for (const e of k.s) tg.push({ e, k: 5 });
  if (boss && !boss.d) tg.push({ e: boss, k: 6 });
}

// Un golpe a un enemigo de tipo k, igual que un disparo.
function hitEnemy(e, k) {
  if (e.dead) return;
  if (k == 6) hitBoss(1);
  else if (k == 0) killFoe(e);
  else if (k == 3) killDia(e);
  else if (k == 5) killSeg(e);
  else {
    e.hf = 0.08;
    if (--e.hp <= 0) [0, killJet, killSpin, 0, killMine][k](e);
    else sfx.hit();
  }
}

function nearest(x, y, md) {
  let best = null;
  for (const t of tg) {
    const d = Math.hypot(t.e.x - x, t.e.y - y);
    if (!t.e.dead && d < md) md = d, best = t.e;
  }
  return best;
}

function updatePowers(s) {
  targets();
  const L = st.pw;
  for (let i = 0; i < 5; i++) pwt[i] -= s;

  // Láseres: duran un momento y dañan cada 0.1 s todo lo que tocan.
  if (L[0] && pwt[0] <= 0) {
    pwt[0] = 4.6 - 0.6 * L[0];
    beams.push({ k: 0, t: 0.5 + 0.2 * L[0], w: 10 + 4 * L[0], len: 600, tick: 0 });
    sfx.laser();
  }
  if (L[1] && pwt[1] <= 0) {
    pwt[1] = 6.2 - 0.7 * L[1];
    beams.push({ k: 1, t: 0.4 + 0.15 * L[1], w: 8 + 3 * L[1], len: 450, tick: 0 });
    sfx.laser();
  }
  for (const b of beams) {
    b.t -= s;
    if ((b.tick -= s) > 0) continue;
    b.tick = 0.1;
    for (const a of beamAngles(b)) {
      const ux = Math.cos(a), uy = Math.sin(a);
      for (const t of tg) {
        const px = t.e.x - pl.x, py = t.e.y - pl.y, al = px * ux + py * uy;
        if (al > 0 && al < b.len && Math.abs(px * uy - py * ux) < b.w / 2 + 12) hitEnemy(t.e, t.k);
      }
    }
  }
  beams = beams.filter((b) => b.t > 0);

  // Misiles: salen en abanico hacia el frente y luego giran hacia el enemigo más cercano.
  if (L[2] && pwt[2] <= 0) {
    pwt[2] = 3.2 - 0.3 * L[2];
    for (let i = 0; i < L[2]; i++) {
      const a = pl.f + (i - (L[2] - 1) / 2) * 0.5;
      shots.push({ x: pl.x, y: pl.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, t: 3, h: 1, c: ORA });
    }
    sfx.missile();
  }
  for (const b of shots) {
    if (!b.h) continue;
    const e = nearest(b.x, b.y, 500);
    if (!e) continue;
    const v = Math.hypot(b.vx, b.vy);
    const a = Phaser.Math.Angle.RotateTo(Math.atan2(b.vy, b.vx), Math.atan2(e.y - b.y, e.x - b.x), s * 5);
    b.vx = Math.cos(a) * v;
    b.vy = Math.sin(a) * v;
  }

  // Espiral: L brazos que disparan mientras el ángulo avanza.
  if (L[3] && pwt[3] <= 0) {
    pwt[3] = 0.32 - 0.03 * L[3];
    spA += 0.45;
    for (let i = 0; i < L[3]; i++) {
      const a = spA + (i * 6.28) / L[3];
      shots.push({ x: pl.x + Math.cos(a) * pl.r, y: pl.y + Math.sin(a) * pl.r, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, t: 0.9, c: PNK });
    }
  }

  // Drones: orbitan y disparan al enemigo más cercano a cada uno.
  drA += s * 2;
  if (L[4] && pwt[4] <= 0) {
    pwt[4] = L[4] > 3 ? 0.45 : 0.8;
    for (const d of drones()) {
      const e = nearest(d.x, d.y, 420);
      if (!e) continue;
      const a = Math.atan2(e.y - d.y, e.x - d.x);
      shots.push({ x: d.x, y: d.y, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, t: 0.8, c: HC });
    }
  }
}

function drawPowers() {
  // Rayo magenta con núcleo blanco y nubes de energía a lo largo; se apaga al final.
  for (const b of beams) {
    const fa = Math.min(1, b.t * 6);
    for (const a of beamAngles(b)) {
      const ux = Math.cos(a), uy = Math.sin(a);
      const x0 = pl.x + ux * pl.r, y0 = pl.y + uy * pl.r, x1 = pl.x + ux * b.len, y1 = pl.y + uy * b.len;
      for (const [w, c, al] of [[b.w * 2.4, PNK, 0.12], [b.w * 1.5, PNK, 0.25], [b.w, 0xff7ae8, 0.5], [b.w * 0.35, 0xffffff, 0.9]]) {
        gP.lineStyle(w, c, al * fa);
        gP.lineBetween(x0, y0, x1, y1);
      }
      for (let i = 0; i < 10; i++) {
        const k = pl.r + Math.random() * (b.len - pl.r);
        gP.fillStyle(PNK, 0.15 * fa);
        gP.fillCircle(pl.x + ux * k + (Math.random() - 0.5) * b.w, pl.y + uy * k + (Math.random() - 0.5) * b.w, b.w * (0.6 + Math.random() * 0.6));
      }
    }
  }
  if (st.dead) return;
  // Drones: pequeños triángulos cian que apuntan hacia afuera.
  for (const d of drones()) {
    const t = shape(d, [[7, 0], [-5, -5], [-5, 5], [7, 0]]);
    for (const [w, al] of [[6, 0.2], [1.5, 1]]) {
      gP.lineStyle(w, w > 2 ? HC : 0xeaf8ff, al);
      gP.strokePoints(t, false);
    }
  }
}

// ---------- Tienda ----------
// f: tienda gratis antes del jefe (eliges 1 powerup sin pagar); al cerrarla aparece el jefe.
function openShop(f) {
  if (st.dead) return;
  const av = [0, 1, 2, 3, 4].filter((i) => st.pw[i] < 4);
  if (!av.length) return f && spawnBoss();
  Phaser.Utils.Array.Shuffle(av);
  shop = { c: av.slice(0, 3), s: 0, t: 0, f };
}
const cost = (i) => (shop.f ? 0 : price(i));

function updateShop(s) {
  shop.t += s;
  const n = shop.c.length;
  if (pressed.P1_L) shop.s = (shop.s + n - 1) % n, sfx.beep();
  if (pressed.P1_R) shop.s = (shop.s + 1) % n, sfx.beep();
  // Medio segundo de gracia para no comprar sin querer mientras disparabas.
  if (shop.t > 0.5) {
    const i = shop.c[shop.s];
    const f = shop.f;
    if (pressed.P1_1 && st.cr >= cost(i)) {
      st.cr -= cost(i);
      st.pw[i]++;
      st.pf = [i, 1.5]; // destello en el HUD del powerup recién comprado
      pwt[i] = 0.5;
      sfx.buy();
      shop = null;
    } else if (pressed.P1_2) shop = null;
    if (!shop && f) spawnBoss();
  }
  if (shop) drawShop();
  else hideShop();
}

function hideShop() {
  gShop.clear();
  for (const t of [tShop.head, tShop.cr, tShop.foot]) t.setVisible(false);
  for (const c of tShop.cards) for (const k in c) c[k].setVisible(false);
}

function drawShop() {
  const g = gShop;
  g.clear();
  g.fillStyle(0x02030c, 0.75);
  g.fillRect(0, 0, W, H);
  tShop.head.setText(shop.f ? '¡SE ACERCA UN JEFE!' : '¡SUBISTE DE NIVEL!').setVisible(true);
  tShop.cr.setText(shop.f ? 'ELIGE UN POWERUP GRATIS' : 'CRÉDITOS ' + st.cr).setVisible(true);
  tShop.foot.setText('< >  ELEGIR      [1] COMPRAR      [2] SALTAR').setVisible(true);
  const n = shop.c.length;
  tShop.cards.forEach((T, j) => {
    for (const k in T) T[k].setVisible(j < n);
    if (j >= n) return;
    const i = shop.c[j], sel = j == shop.s, ok = st.cr >= cost(i);
    const cx = W / 2 + (j - (n - 1) / 2) * 230, x0 = cx - 100, x1 = cx + 100, y0 = 160, y1 = 455;
    const col = sel ? 0xff3cf0 : HC, dim = ok ? 1 : 0.45;
    // Marco con esquinas cortadas.
    const fr = [[x0 + 12, y0], [x1 - 12, y0], [x1, y0 + 12], [x1, y1 - 12], [x1 - 12, y1], [x0 + 12, y1], [x0, y1 - 12], [x0, y0 + 12]].map(([x, y]) => ({ x, y }));
    g.fillStyle(col, (sel ? 0.28 : 0.12) * dim);
    g.fillPoints(fr, true);
    for (const [w, al] of [[10, 0.15], [5, 0.3], [2, 1]]) {
      g.lineStyle(w, col, al * dim);
      g.strokePoints(fr, true);
    }
    // Ícono en un hexágono sobre el borde superior.
    const hx = hexPts(cx, y0, 24, Math.PI / 6);
    g.fillStyle(0x0b0c24, 1);
    g.fillPoints(hx, true);
    g.lineStyle(3, col, dim);
    g.strokePoints(hx, true);
    icon(g, i, cx, y0);
    T.n.setPosition(cx, 228).setText(PW[i].n).setAlpha(dim);
    T.l.setPosition(cx, 272).setText(st.pw[i] + 1 + '/4').setAlpha(dim);
    T.d.setPosition(cx, 340).setText(PW[i].d).setAlpha(dim);
    T.p.setPosition(cx, 420).setText(shop.f ? 'GRATIS' : 'PRECIO ' + price(i)).setColor(ok ? '#ffb02e' : '#ff5a6a');
  });
}

// Íconos simples de cada powerup, en blanco.
function icon(g, i, x, y, z = 1) {
  g.lineStyle(2.5 * z, 0xffffff, 1);
  const L = (a, b, c, d) => g.lineBetween(x + a * z, y + b * z, x + c * z, y + d * z);
  if (i == 0) {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - 10 * z, y, 3 * z);
    L(-6, 0, 12, 0);
  } else if (i == 1) {
    L(-12, 0, 12, 0);
    L(0, -12, 0, 12);
  } else if (i == 2) {
    L(-8, 2, 0, -8);
    L(0, -8, 8, 2);
    L(-8, 10, 0, 0);
    L(0, 0, 8, 10);
  } else if (i == 3) {
    g.strokeCircle(x, y, 7 * z);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047;
      L(Math.cos(a) * 10, Math.sin(a) * 10, Math.cos(a + 0.5) * 14, Math.sin(a + 0.5) * 14);
    }
  } else {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x, y, 3 * z);
    g.strokeCircle(x, y, 11 * z);
    for (let k = 0; k < 3; k++) g.fillCircle(x + Math.cos(k * 2.09) * 11 * z, y + Math.sin(k * 2.09) * 11 * z, 3 * z);
  }
}

// ---------- Pantalla de inicio ----------
// El mapa sigue vivo detrás: el hexágono pasea solo por la grilla junto a luces de colores
// que dejan su estela, mientras la cámara avanza lenta. START o [1] empieza la partida.
const ML = [RED, PNK, GRN, DB, ORA]; // luces que recorren la grilla

function createMenu(scene) {
  const tx = (y, size, col, sh) =>
    scene.add.text(W / 2, y, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: size, color: col, align: 'center' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(12).setShadow(0, 0, sh, 14, true, true);
  // Título en tres capas: rojo y cian desplazados (aberración cromática) bajo el blanco.
  tMenu = {
    r: tx(190, 76, '#ff2a5a', '#ff2a5a').setBlendMode(Phaser.BlendModes.ADD),
    c: tx(190, 76, '#2ad8ff', '#2ad8ff').setBlendMode(Phaser.BlendModes.ADD),
    t: tx(190, 76, '#f2fbff', '#ff3cf0'),
    sub: tx(262, 15, '#bfe9ff', '#5fd8ff'),
    go: tx(390, 24, '#f2fbff', '#ff3cf0'),
    ctl: tx(500, 13, '#bfe9ff', '#5fd8ff'),
    best: tx(540, 15, '#ffb02e', '#ff7a1a'),
  };
  for (const k of ['r', 'c', 't']) tMenu[k].setText(NAME);
  tMenu.sub.setText('SOBREVIVE  ·  RECOLECTA  ·  MEJORA');
  tMenu.go.setText('PRESIONA START');
  tMenu.ctl.setText('JOYSTICK  MOVER     [1]  DISPARAR     [2]  DASH');
  for (const t of [tLvl, tTime, tScore, tCr]) t.setVisible(false);
}

// Vuelve a la pantalla de inicio con el mapa limpio.
function toMenu() {
  restart();
  st.inv = 0;
  shots = [];
  orbs = [];
  bits = [];
  blasts = [];
  menu = 1;
  mT = 0;
  for (const k in tMenu) tMenu[k].setVisible(true);
  for (const t of [tLvl, tTime, tScore, tCr, tOver, tBoard, tHint, tEnt, tCombo, tPop]) t.setVisible(false);
  gShop.clear();
}

function updateMenu(scene, s) {
  mT += s;
  // [2] abre o cierra la tabla de puntajes; al cerrarla, el título vuelve desde el principio.
  if (pressed.P1_2) {
    mB = !mB;
    mT = 0;
    sfx.beep();
  }
  if (pressed.START1 || pressed.P1_1) {
    menu = 0;
    mB = 0;
    for (const k in tMenu) tMenu[k].setVisible(false);
    tBoard.setVisible(false);
    for (const t of [tLvl, tTime, tScore, tCr]) t.setVisible(true);
    gE.clear();
    sfx.lvl();
    restart();
    return;
  }
  // La cámara avanza en diagonal: las estrellas y la grilla dan sensación de mapa infinito.
  cx += 40 * s;
  cy += 18 * s;
  scene.cameras.main.setScroll(cx - W / 2, cy - H / 2);
  // El hexágono recorre una curva de Lissajous y apunta hacia donde va.
  const px = cx + Math.cos(mT * 0.45) * 300, py = cy + Math.sin(mT * 0.7) * 190;
  if (Math.hypot(px - pl.x, py - pl.y) > 0.5) pl.f = Math.atan2(py - pl.y, px - pl.x);
  pl.x = px;
  pl.y = py;
  pl.a += s * 0.6;
  fade(s);
  light(pl.x, pl.y, LR, 1);
  gE.clear();
  ML.forEach((c, i) => {
    const q = mT * (0.3 + i * 0.07) + i * 1.3;
    const x = cx + Math.cos(q * 1.3) * (180 + i * 40), y = cy + Math.sin(q) * (120 + i * 25);
    light(x, y, 80, 0.6, c);
    for (const [r, al] of [[14, 0.12], [8, 0.3], [3, 1]]) {
      gE.fillStyle(r > 3 ? c : 0xffffff, al);
      gE.fillCircle(x, y, r);
    }
  });
  drawStars();
  drawGrid();
  drawPlayer();
  // Fondo del título: bandas que se afinan hacia los lados y parpadeo holográfico.
  gH.clear();
  const fl = Math.random() < 0.04 ? 0.55 : 1;
  gH.setAlpha(fl);
  tMenu.go.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(mT * 2.5)));
  // Cada 14 segundos alterna sola entre el título y la tabla (si hay puntajes).
  const sb = mB || (board.length && mT % 14 > 8);
  tMenu.best.setText(mB ? '[2]  VOLVER' : 'RÉCORD ' + String(best).padStart(6, '0') + '      [2]  PUNTAJES');
  for (const k of ['r', 'c', 't', 'sub']) tMenu[k].setVisible(!sb);
  tBoard.setText('MEJORES PUNTAJES\n\n' + boardText(-1)).setY(225).setVisible(sb);
  if (sb) return;
  band(W / 2, W / 2 + 330, 190, 110, 10, HB, 0.22, 0);
  band(W / 2, W / 2 - 330, 190, 110, 10, HB, 0.22, 0);
  band(W / 2, W / 2 + 260, 236, 3, 1, HC, 0.9, 0);
  band(W / 2, W / 2 - 260, 236, 3, 1, HC, 0.9, 0);
  // Glitch: de vez en cuando las capas de color se separan más.
  const g = Math.random() < 0.05 ? 9 : 3;
  tMenu.r.setPosition(W / 2 - g, 190).setAlpha(0.7 * fl);
  tMenu.c.setPosition(W / 2 + g, 190).setAlpha(0.7 * fl);
  tMenu.t.setAlpha(fl);
}

// ---------- Música ----------
// Techno rave sintetizado en vivo a 148 BPM, en pasos de semicorchea. Se programa un poco
// por adelantado con el reloj de Web Audio para que el ritmo no dependa de los cuadros.
// Bombo a negras, hi-hat abierto a contratiempo, palmas en 2 y 4, bajo ácido rodante con
// filtro resonante que se abre y cierra, y arpegio rápido. En el menú suena solo la base;
// con la tienda abierta o al morir todo se apaga detrás de un filtro.
// Se intensifica con el nivel: 1 bombo, bajo, hi-hat y palmas; 2 hi-hats en semicorcheas;
// 3 arpegio; 4 acordes "stab"; 5 arpegio doblado una octava arriba; del 6 en adelante
// también acelera, de 148 hasta 164 BPM, y el filtro del bajo se abre cada vez más.
let STEP = 60 / 148 / 4; // duración de un paso
const MV = 0.3; // volumen de la música
const ROOT = [45, 41, 48, 43]; // La, Fa, Do, Sol (MIDI): un acorde por compás
const THIRD = [3, 4, 4, 4]; // tercera de cada acorde (menor o mayor)
let mus; // {g (salida), f (filtro), d (bus que se agacha con el bombo), t (próximo paso), n}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function music() {
  const ac = sc.sound.context;
  if (!ac || ac.state != 'running') return;
  const now = ac.currentTime;
  if (!mus) {
    const g = ac.createGain(), f = ac.createBiquadFilter(), d = ac.createGain(), c = ac.createDynamicsCompressor();
    g.gain.value = MV;
    f.frequency.value = 18000;
    d.connect(g);
    g.connect(f).connect(c).connect(ac.destination);
    mus = { g, f, d, t: now + 0.1, n: 0 };
  }
  // Si la pestaña se durmió, retoma desde ahora en vez de recuperar los pasos perdidos.
  if (mus.t < now) mus.t = now + 0.05;
  mus.f.frequency.setTargetAtTime(shop || pause || st.dead ? 600 : menu ? 2200 : 18000, now, 0.15);
  while (mus.t < now + 0.15) {
    beat(ac, mus.n++, mus.t);
    mus.t += STEP;
  }
}

// Oscilador con barrido de tono, envolvente y filtro opcional (fc corte, q resonancia).
function vo(ac, at, type, f0, f1, dur, vol, fc, q) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  let n = o;
  if (fc) {
    const f = ac.createBiquadFilter();
    f.Q.value = q;
    f.frequency.setValueAtTime(fc, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(90, fc / 5), at + dur);
    n = o.connect(f);
  }
  n.connect(g).connect(mus.d);
  o.start(at);
  o.stop(at + dur + 0.02);
}

// Golpe de ruido filtrado (hi-hats, palmas, redoblante).
function nz(ac, at, dur, vol, type, fc) {
  const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = nb(ac);
  f.type = type;
  f.frequency.value = fc;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  n.connect(f).connect(g).connect(mus.d);
  n.start(at, Math.random() * 0.5);
  n.stop(at + dur);
}

function beat(ac, n, at) {
  const s = n % 16, bar = n >> 4, ch = ROOT[bar % 4], L = menu ? 0 : st.lvl + (boss ? 3 : 0);
  STEP = 60 / (148 + Math.min(16, Math.max(0, L - 5) * 2)) / 4;
  if (s % 4 == 0) {
    // Bombo: va directo a la salida y agacha el resto (efecto "sidechain" que bombea).
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(160, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    g.gain.setValueAtTime(1.1, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    o.connect(g).connect(mus.g);
    o.start(at);
    o.stop(at + 0.32);
    mus.d.gain.setValueAtTime(0.2, at);
    mus.d.gain.linearRampToValueAtTime(1, at + STEP * 3);
  } else {
    // Bajo ácido rodante: sierra con filtro resonante que se abre y se cierra cada 2 compases.
    const fc = (350 + 1700 * (0.5 + 0.5 * Math.sin(n * 0.1))) * (1 + Math.min(L, 10) * 0.08);
    const m = ch - 12 + (s % 4 == 3 ? 12 : 0);
    vo(ac, at, 'sawtooth', hz(m), hz(m), STEP * 0.95, 0.32, fc, 14);
  }
  if (s % 4 == 2) nz(ac, at, 0.1, 0.22, 'highpass', 7000);
  if (!L) return;
  if (s == 4 || s == 12) nz(ac, at, 0.14, 0.4, 'bandpass', 1400);
  if (L >= 2 && s % 2) nz(ac, at, 0.03, 0.1, 'highpass', 9500);
  // Arpegio rápido sobre el acorde del compás.
  const th = THIRD[bar % 4], m = ch + 12 + [0, 7, 12, th, 7, 12, th + 12, 7][s % 8];
  if (L >= 3) vo(ac, at, 'square', hz(m), hz(m), 0.11, 0.07, 3200, 4);
  if (L >= 5) vo(ac, at, 'sawtooth', hz(m + 12), hz(m + 12), 0.08, 0.035, 5000, 2);
  // Acordes "stab" a contratiempo.
  if (L >= 4 && (s == 6 || s == 14)) for (const k of [0, th, 7, 12]) vo(ac, at, 'sawtooth', hz(ch + k), hz(ch + k), 0.22, 0.05, 2600, 3);
  // Cada 8 compases, redoble que crece en la segunda mitad del último compás.
  if (bar % 8 == 7 && s >= 8) nz(ac, at, 0.08, 0.1 + (s - 8) * 0.05, 'bandpass', 2600);
}

// ---------- Pausa, tabla de puntajes e iniciales ----------
// Fondo oscuro sobre el juego congelado (usa los gráficos de la tienda, que nunca coinciden).
function overlay() {
  gShop.clear();
  gShop.fillStyle(0x02030c, 0.75);
  gShop.fillRect(0, 0, W, H);
}

function setPause(on) {
  pause = on;
  if (on) {
    overlay();
    tOver.setText('PAUSA').setVisible(true);
    tHint.setText('START  CONTINUAR\n\n[2]  SALIR AL INICIO').setY(320).setVisible(true);
    sfx.beep();
  } else {
    gShop.clear();
    tOver.setVisible(false);
    tHint.setY(540).setVisible(false);
  }
}

// Tabla como texto de ancho fijo; la fila h queda marcada con flechas.
function boardText(h) {
  if (!board.length) return 'SIN PUNTAJES TODAVÍA';
  return board.map((e, i) => (i == h ? '> ' : '  ') + String(i + 1).padStart(2) + '.  ' + e.n.padEnd(3) + '   ' + String(e.s).padStart(6, '0') + (i == h ? ' <' : '  ')).join('\n');
}

function showOver() {
  overlay();
  tOver.setText('FIN DEL JUEGO').setVisible(true);
  tBoard.setText('MEJORES PUNTAJES\n\n' + boardText(hl)).setY(320).setVisible(true);
  tHint.setText('PRESIONA START').setVisible(true);
}

// Iniciales: arriba/abajo cambia la letra, izquierda/derecha se mueve, [1] avanza y en la
// tercera guarda. La letra elegida late y tiene flechas encima y debajo.
function updateEntry() {
  const e = ent;
  if (pressed.P1_U || pressed.P1_D) {
    e.l[e.i] = (e.l[e.i] + (pressed.P1_U ? ABC.length - 1 : 1)) % ABC.length;
    sfx.beep();
  }
  if (pressed.P1_L && e.i > 0) e.i--, sfx.beep();
  if ((pressed.P1_R || pressed.P1_1) && e.i < 2) e.i++, sfx.beep();
  else if (pressed.P1_1 || pressed.START1) {
    const n = e.l.map((k) => ABC[k]).join('');
    board.push({ n, s: st.pts });
    board.sort((a, b) => b.s - a.s);
    board = board.slice(0, 10);
    hl = board.findIndex((r) => r.n == n && r.s == st.pts);
    best = board[0].s;
    try { window.platanusArcadeStorage.set(BOARD_KEY, board).catch(() => {}); } catch (x) {}
    st.q = 0;
    ent = null;
    st.dead = 1.21;
    tEnt.setVisible(false);
    sfx.buy();
    showOver();
    return;
  }
  overlay();
  tOver.setText('¡NUEVO PUNTAJE ALTO!').setVisible(true);
  tBoard.setText('INGRESA TUS INICIALES\n\n' + String(st.pts).padStart(6, '0')).setY(200).setVisible(true);
  tEnt.setText(e.l.map((k) => ABC[k]).join('  ')).setVisible(true);
  tHint.setText('ARRIBA/ABAJO  LETRA     [1]  SIGUIENTE').setVisible(true);
  // Cada letra ocupa 3 caracteres de ancho (letra + 2 espacios): ~38 px a 64 px de fuente.
  const x = W / 2 + (e.i - 1) * 115, k = 0.6 + 0.4 * Math.abs(Math.sin(st.dead * 5));
  gShop.lineStyle(3, 0xff3cf0, k);
  gShop.lineBetween(x - 22, 362, x + 22, 362);
  gShop.fillStyle(0xff3cf0, k);
  gShop.fillTriangle(x - 10, 270, x + 10, 270, x, 258);
  gShop.fillTriangle(x - 10, 378, x + 10, 378, x, 390);
}

// ---------- Jefes ----------
// Al llenar la barra de experiencia aparece un jefe y dejan de llegar enemigos nuevos; hay
// que vencerlo para subir de nivel. Rotan tres jefes y en cada vuelta tienen más vida y
// ataques más densos:
// 0 FORTALEZA: hexágonos anidados que giran; dispara anillos y ráfagas en espiral.
// 1 NÚCLEO: centro protegido por tres escudos giratorios que frenan los disparos; dispara
//   abanicos y siembra minas alrededor del jugador.
// 2 TITÁN: serpiente gigante; solo la cabeza recibe daño. Persigue, marca una línea de
//   aviso y embiste; al terminar la embestida suelta un anillo de proyectiles.
// boss: {k, x, y, hp, mx (vida máxima), a (giro), m (rumbo), t (reloj de ataque), c (paso),
//        hf (destello), hc (espera entre golpes al jugador), d (muriendo), s (segmentos del titán)}
const BN = ['FORTALEZA', 'NÚCLEO', 'TITÁN'];
const BC = [ORA, SPC, GRN];
const BR2 = [62, 30, 26]; // radio que recibe daño

// Aviso grande en el centro: título y subtítulo, con el resplandor del color c.
function banner(t, sub, c) {
  const h = '#' + c.toString(16).padStart(6, '0');
  tBan.setText(t).setShadow(0, 0, h, 16, true, true);
  tBanS.setText(sub).setShadow(0, 0, h, 10, true, true);
  banT = 2.6;
}

function spawnBoss() {
  const k = st.bn % 3, a = Math.random() * 6.28, hp = 45 + st.bn * 25;
  boss = { k, x: pl.x + Math.cos(a) * 520, y: pl.y + Math.sin(a) * 520, hp, mx: hp, a: 0, m: a + Math.PI, t: 2, c: 0, hf: 0, hc: 0, d: 0 };
  if (k == 2) boss.s = Array.from({ length: 16 }, () => ({ x: boss.x, y: boss.y }));
  banner('¡JEFE!', BN[k], BC[k]);
  sfx.warn();
}

// Proyectil enemigo desde (x, y) en el ángulo a.
const eb = (x, y, a, v, c) => eshots.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 4, c, d: 0.2 });

// ¿El ángulo a choca con alguno de los tres escudos del núcleo?
const shieldAt = (B, a) => [0, 1, 2].some((i) => Math.abs(Math.atan2(Math.sin(a - B.a * 1.4 - i * 2.09), Math.cos(a - B.a * 1.4 - i * 2.09))) < 0.65);

function hitBoss(n) {
  const B = boss;
  if (!B || B.d) return;
  B.hp -= n;
  B.hf = 0.06;
  sfx.hit();
  if (B.hp <= 0) B.d = 1.4;
}

function updateBoss(s) {
  const B = boss;
  if (!B) return;
  const T = (st.bn / 3) | 0, sp = spd(), R = BR2[B.k];
  const px = pl.x - B.x, py = pl.y - B.y, d = Math.hypot(px, py), toP = Math.atan2(py, px);
  B.a += s;
  B.hf -= s;
  B.hc -= s;
  // Muriendo: explosiones por todo el cuerpo y al final una enorme.
  if (B.d) {
    if (Math.random() < s * 14) boom(B.x + (Math.random() - 0.5) * 140, B.y + (Math.random() - 0.5) * 140, 50, YEL, BC[B.k]);
    if ((B.d -= s) <= 0) bossDown();
    return;
  }
  B.t -= s;
  if (B.k < 2) {
    // Se acerca hasta ~260 del jugador y lo rodea despacio.
    const want = d > 300 ? toP : d < 220 ? toP + Math.PI : toP + Math.PI / 2;
    B.m = Phaser.Math.Angle.RotateTo(B.m, want, s);
    B.x += Math.cos(B.m) * 55 * sp * s;
    B.y += Math.sin(B.m) * 55 * sp * s;
  }
  if (B.k == 0) {
    if (B.t <= 0) {
      if (B.c++ % 2 == 0) {
        const n = 14 + T * 4;
        for (let i = 0; i < n; i++) eb(B.x, B.y, (i / n) * 6.28 + B.a, 170 * sp, ORA);
        sfx.eshoot2();
        B.t = 1.6 / sp;
      } else {
        B.sp = 1.8;
        B.t = 2.6 / sp;
      }
    }
    if (B.sp > 0) {
      B.sp -= s;
      if ((B.ft = (B.ft || 0) - s) <= 0) {
        B.ft = 0.09;
        for (let j = 0; j < 3 + T; j++) eb(B.x, B.y, B.a * 2.2 + (j * 6.28) / (3 + T), 210 * sp, YEL);
      }
    }
  } else if (B.k == 1) {
    if (B.t <= 0) {
      if (B.c++ % 3 == 2) {
        for (let i = 0; i < 2 + T; i++) {
          const a = Math.random() * 6.28, r = 120 + Math.random() * 120;
          mines.push({ x: pl.x + Math.cos(a) * r, y: pl.y + Math.sin(a) * r, a: Math.random() * 6.28, t: 0, hp: 3, hf: 0, bp: 0.3 });
        }
        sfx.mine();
        B.t = 2.4 / sp;
      } else {
        const n = 3 + T * 2;
        for (let i = 0; i < n; i++) eb(B.x, B.y, toP + (i - (n - 1) / 2) * 0.22, 260 * sp, SPC);
        sfx.eshoot2();
        B.t = 0.9 / sp;
      }
    }
  } else {
    // c: 0 persigue, 1 apunta (línea de aviso), 2 embiste.
    if (B.t <= 0) {
      if (B.c == 2) {
        const n = 10 + T * 4;
        for (let i = 0; i < n; i++) eb(B.x, B.y, (i / n) * 6.28, 180 * sp, GRN);
        sfx.eshoot2();
      }
      B.c = (B.c + 1) % 3;
      B.t = [3 / sp, 0.8, 0.8][B.c];
      if (B.c == 1) sfx.warn();
      if (B.c == 2) sfx.dash();
    }
    if (B.c < 2) B.m = Phaser.Math.Angle.RotateTo(B.m, toP + (B.c ? 0 : Math.sin(B.a * 3) * 0.6), s * (B.c ? 4 : 2));
    const v = [130 * sp, 0, 640 * sp][B.c];
    B.x += Math.cos(B.m) * v * s;
    B.y += Math.sin(B.m) * v * s;
    let f = B;
    for (const g of B.s) {
      const gd = Math.hypot(f.x - g.x, f.y - g.y);
      if (gd > 30) {
        g.x = f.x - ((f.x - g.x) / gd) * 30;
        g.y = f.y - ((f.y - g.y) / gd) * 30;
      }
      f = g;
    }
  }
  // Disparos del jugador: los escudos del núcleo y el cuerpo del titán los frenan.
  for (const b of shots) {
    if (b.t <= 0) continue;
    const dx = b.x - B.x, dy = b.y - B.y, r = Math.hypot(dx, dy);
    if ((B.k == 1 && r > 38 && r < 62 && shieldAt(B, Math.atan2(dy, dx))) || (B.k == 2 && B.s.some((g) => Math.hypot(b.x - g.x, b.y - g.y) < 20))) b.t = 0;
    else if (r < R) {
      b.t = 0;
      hitBoss(1);
    }
  }
  shots = shots.filter((b) => b.t > 0);
  // Tocarlo daña, con una pausa antes de volver a dañar.
  const touch = d < R + pl.r || (B.k == 2 && B.s.some((g) => Math.hypot(pl.x - g.x, pl.y - g.y) < 18 + pl.r));
  if (touch && B.hc <= 0 && !st.dead) {
    B.hc = 0.8;
    hurt(0.4);
  }
}

// Jefe vencido: explosión final, gran recompensa y nivel nuevo; la tienda se abre después.
function bossDown() {
  const B = boss;
  boom(B.x, B.y, 220, 0xffffff, BC[B.k]);
  st.pts += 1000 * (st.bn + 1);
  st.cr += 15 + 5 * st.bn;
  drop(B.x, B.y, 14);
  spawnItem(B.x, B.y);
  st.bn++;
  boss = null;
  st.xp = 0;
  st.lvl++;
  sfx.lvl();
  const news = { 2: '¡LLEGAN FORMACIONES!', 5: '¡MINAS EN TRIÁNGULO!', 15: 'DIFICULTAD MÁXIMA' };
  banner('NIVEL ' + st.lvl, news[st.lvl] || (st.lvl < 15 ? 'MÁS RÁPIDO  ·  MÁS ENEMIGOS' : '¡SIGUE VIVO!'), HC);
  st.sw = 1.8;
}

function bossLight() {
  const B = boss, c = BC[B.k];
  light(B.x, B.y, 200, 0.7, c);
  if (B.k == 2) {
    for (const g of B.s) light(g.x, g.y, 70, 0.4, c);
    // Línea de aviso antes de embestir, en rojo.
    if (B.c == 1) for (let k = 60; k < 700; k += 60) light(B.x + Math.cos(B.m) * k, B.y + Math.sin(B.m) * k, 50, 0.6, RED);
  }
}

function drawBoss() {
  const B = boss;
  if (!B || (B.d && Math.random() < 0.3)) return;
  const c = B.hf > 0 ? 0xffffff : BC[B.k], ls = [];
  if (B.k == 0) {
    for (const [r, v] of [[62, 1], [44, -1.5], [26, 2]]) ls.push(hexPts(B.x, B.y, r, B.a * v));
  } else if (B.k == 1) {
    ls.push(hexPts(B.x, B.y, 28, B.a * 2), hexPts(B.x, B.y, 14, -B.a * 3));
  } else {
    const u = Math.cos(B.m), w = Math.sin(B.m), P = (f, l) => ({ x: B.x + u * f - w * l, y: B.y + w * f + u * l });
    ls.push([P(30, 0), P(-6, -24), P(-18, 0), P(-6, 24), P(30, 0)]);
    B.s.forEach((g, i) => ls.push(hexPts(g.x, g.y, 16 - i * 0.5, B.a * 2 + i)));
  }
  for (const [w, al] of [[12, 0.12], [5, 0.35], [2, 1]]) {
    gE.lineStyle(w, w > 2 ? c : 0xfff0f8, al);
    for (const l of ls) gE.strokePoints(l, true);
    if (B.k == 1) {
      for (let i = 0; i < 3; i++) {
        const a = B.a * 1.4 + i * 2.09;
        gE.beginPath();
        gE.arc(B.x, B.y, 50, a - 0.65, a + 0.65);
        gE.strokePath();
      }
    }
  }
  if (B.k == 2 && B.c == 1) {
    gE.lineStyle(2, RED, 0.5 + 0.5 * Math.sin(B.a * 30));
    gE.lineBetween(B.x, B.y, B.x + Math.cos(B.m) * 700, B.y + Math.sin(B.m) * 700);
  }
}

// Barra de vida del jefe bajo el puntaje, flecha en el borde si está fuera de pantalla,
// y el aviso grande en el centro.
function drawBossHud() {
  const B = boss;
  tBoss.setVisible(!!B);
  if (B) {
    tBoss.setText(BN[B.k]);
    gH.fillStyle(HB, 0.3);
    gH.fillRect(250, 122, 300, 6);
    gH.fillStyle(B.hf > 0 ? 0xffffff : BC[B.k], 0.95);
    gH.fillRect(250, 122, 300 * Math.max(0, B.hp / B.mx), 6);
    const sx = B.x - cx + W / 2, sy = B.y - cy + H / 2;
    if (sx < 0 || sx > W || sy < 0 || sy > H) {
      const a = Math.atan2(sy - H / 2, sx - W / 2), x = Phaser.Math.Clamp(sx, 30, W - 30), y = Phaser.Math.Clamp(sy, 120, H - 30);
      gH.fillStyle(BC[B.k], 0.5 + 0.5 * Math.sin(B.a * 8));
      gH.fillTriangle(x + Math.cos(a) * 14, y + Math.sin(a) * 14, x + Math.cos(a + 2.4) * 10, y + Math.sin(a + 2.4) * 10, x + Math.cos(a - 2.4) * 10, y + Math.sin(a - 2.4) * 10);
    }
  }
  const on = banT > 0;
  tBan.setVisible(on);
  tBanS.setVisible(on);
  if (on) {
    // Entra grande y se asienta; tiembla un poco (glitch) y se desvanece al final.
    const al = Math.min(1, banT * 2), g = Math.random() < 0.08 ? (Math.random() - 0.5) * 14 : 0;
    tBan.setAlpha(al).setScale(1 + Math.max(0, banT - 2.3) * 2).setX(W / 2 + g);
    tBanS.setAlpha(al);
  }
}

// ---------- Objetos del mapa ----------
// Aparecen cada 15–25 s cerca del jugador y a veces los suelta un enemigo destruido (el jefe
// siempre suelta uno). Duran 12 s y parpadean los últimos 3.
// 0 VIDA (+1 corazón), 1 ESCUDO (barra llena), 2 BOMBA (destruye lo cercano), 3 IMÁN (8 s).
const IN = ['+1 VIDA', 'ESCUDO', '¡BOMBA!', 'IMÁN'];
const IC = [0xff4f7a, HC, YEL, OB];

function spawnItem(x, y) {
  items.push({ x, y, k: (Math.random() * 4) | 0, t: 12, a: 0 });
}

function updateItems(s) {
  if (!boss && !st.dead && (itT -= s) <= 0) {
    itT = 15 + Math.random() * 10;
    const a = Math.random() * 6.28, d = 250 + Math.random() * 200;
    spawnItem(pl.x + Math.cos(a) * d, pl.y + Math.sin(a) * d);
  }
  for (const o of items) {
    o.t -= s;
    o.a += s * 2;
    if (!st.dead && Math.hypot(o.x - pl.x, o.y - pl.y) < pl.r + 18) {
      o.t = 0;
      takeItem(o);
    }
  }
  items = items.filter((o) => o.t > 0);
  if (tPop.visible && (tPop.t -= s) <= 0) tPop.setVisible(false);
  if (tPop.visible) tPop.setPosition(pl.x, pl.y - 40 - (1 - tPop.t) * 30).setAlpha(Math.min(1, tPop.t * 2));
}

function takeItem(o) {
  if (o.k == 0) st.hp = Math.min(5, st.hp + 1);
  else if (o.k == 1) st.sh = 1;
  else if (o.k == 3) st.mg = 8;
  else {
    // Bomba: onda enorme que destruye todo lo cercano y los proyectiles enemigos. Da un
    // segundo de invulnerabilidad para que las explosiones en cadena no te alcancen.
    st.inv = 1;
    boom(pl.x, pl.y, 340, 0xffffff, YEL);
    targets();
    for (const t of tg) {
      if (Math.hypot(t.e.x - pl.x, t.e.y - pl.y) > 340) continue;
      if (t.k == 6) hitBoss(10);
      else for (let i = 0; i < 5 && !t.e.dead; i++) hitEnemy(t.e, t.k);
    }
    eshots = [];
  }
  sfx.buy();
  tPop.setText(IN[o.k]).setShadow(0, 0, '#' + IC[o.k].toString(16).padStart(6, '0'), 10, true, true).setVisible(true);
  tPop.t = 1;
}

function drawItems() {
  for (const o of items) {
    if (o.t < 3 && Math.sin(o.t * 18) < 0) continue;
    const c = IC[o.k], k = 1 + Math.sin(o.a * 2) * 0.08;
    // Marco: rombo que gira, con el símbolo del objeto adentro.
    const fr = [0, 1, 2, 3].map((i) => ({ x: o.x + Math.cos(o.a + i * 1.571) * 20 * k, y: o.y + Math.sin(o.a + i * 1.571) * 20 * k }));
    gE.fillStyle(c, 0.15);
    gE.fillPoints(fr, true);
    for (const [w, al] of [[8, 0.15], [3, 0.4], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? c : 0xffffff, al);
      gE.strokePoints(fr, true);
    }
    gE.fillStyle(c, 1);
    gE.lineStyle(2, 0xffffff, 1);
    if (o.k == 0) gE.fillPoints(heart(o.x, o.y + 1, 0.42), true);
    else if (o.k == 1) gE.strokePoints(hexPts(o.x, o.y, 8, 0), true);
    else if (o.k == 2) {
      gE.fillCircle(o.x, o.y + 2, 6);
      gE.lineBetween(o.x + 3, o.y - 3, o.x + 7, o.y - 8);
    } else {
      gE.beginPath();
      gE.arc(o.x, o.y - 2, 6, 0, Math.PI);
      gE.strokePath();
      gE.lineBetween(o.x - 6, o.y - 2, o.x - 6, o.y - 7);
      gE.lineBetween(o.x + 6, o.y - 2, o.x + 6, o.y - 7);
    }
  }
}
