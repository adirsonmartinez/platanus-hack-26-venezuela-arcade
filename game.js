// Platanus Hack 26 — Caracas
// Neón en una grilla infinita: sobrevive, sube de nivel y vence a los jefes.

// Todo el juego vive dentro de esta función para que el minificador pueda acortar los
// nombres (en el nivel superior serían globales y quedarían completos). Sin sangría extra.
(() => {
const { sin, cos, hypot, atan2, random, min, max, abs, PI, floor, round, ceil, SQRT1_2 } = Math;
const rotTo = Phaser.Math.Angle.RotateTo, clamp = Phaser.Math.Clamp;

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
let lv; // luz por vértice de la grilla, en coordenadas de mundo (clave gk(c, r) → [r, g, b], cada uno 0..1)
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
let bm = 0, kb = ''; // easter egg: nave plátano (código Konami en el menú) y últimas teclas del menú
let hs = 0, zp = 0, ch = 0, chT = 0; // impacto: congelado breve, zoom de golpe, explosiones en cadena
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
let ent; // ingreso de iniciales: {n (lo escrito), c (casilla del teclado elegida)} o null
let hl = -1; // fila de la tabla recién agregada, para resaltarla
let pause = 0;
let tBoard, tHint, tEnt, tKeys; // textos de tabla, indicaciones, iniciales y teclas del teclado
let boss; // jefe activo o null (ver sección Jefes)
let tBan, tBanS, banT = 0; // aviso grande en pantalla (nivel nuevo o jefe) y su tiempo restante
let tBoss; // nombre del jefe sobre su barra de vida
let items, itT; // objetos sueltos por el mapa {x, y, k (tipo), t (vida)} y espera hasta el próximo
let gL; // logo del menú
let tCombo, tPop; // texto del combo y aviso flotante al tomar un objeto
let tMul, mu = 0; // aviso grande del multiplicador ("x5!") y su tiempo restante
let ban, banW; // plátano que cruza el mapa {x, y, vx, vy, a, t, tr (estela)} o null, y espera hasta el próximo
let tMenu; // textos de la pantalla de inicio
const BOARD_KEY = 'neongrid.scores';
const ABC = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789';

// Enemigos: dos cuadrados flotando. Al acercarte vibran y explotan.
const FN = 14; // cantidad de enemigos alrededor del jugador
const DASH = 0.16, DSPD = 1100, DCD = 1.4; // dash: duración, velocidad y recarga

// Dificultad: sube con cada nivel hasta el 15. dif() va de 0 a 14 y spd() multiplica las
// velocidades (hasta 1.84 veces): todo se mueve y dispara más rápido, y aparecen más enemigos.
const dif = () => min(st.lvl - 1, 14);
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
  st = { hp: 3, sh: 1, rg: 0, hf: 0, lvl: 1, xp: 0, cr: 0, pts: 0, time: 0, inv: 0, dead: 0, pw: [0, 0, 0, 0, 0], bn: 0, sw: 0, cb: 0, ct: 0, mg: 0, pt: 0 };
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
  pl = { x: 0, y: 0, r: 16, a: 0, f: -PI / 2, sp: 220, cd: 0, dt: 0, dc: 0, vx: 0, vy: 0, gh: [] };
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
  ban = null;
  banW = 35;
  cx = cy = 0;
  // z: cuánto se mueven con la cámara (más bajo = más lejos y más tenue)
  stars = [];
  for (let i = 0; i < 110; i++) {
    const z = 0.1 + random() * 0.5;
    stars.push({ x: random() * W, y: random() * H, z, sz: z > 0.45 ? 2 : 1, al: 0.15 + z });
  }
}

function update(_, dt) {
  let s = dt / 1000;
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
  // Congelado breve tras un golpe fuerte: el mundo casi se detiene unos milisegundos.
  if (hs > 0) {
    hs -= s;
    s *= 0.08;
  }
  // Nave rota tras perder un corazón: el mundo queda congelado hasta que se rearma.
  if (pl.br > 0) {
    if ((pl.br -= s) <= 0) tone(300, 1300, 0.18, 'square', 0.05); // chasquido al rearmarse
    s = 0;
  }
  if ((chT -= s) <= 0) ch = 0;
  st.inv -= s;
  banT -= s;
  st.mg -= s;
  // El combo se corta si pasan unos segundos sin destruir nada.
  if ((st.ct -= s) <= 0) {
    // Perder un combo largo suena a caída.
    if (st.cb >= 20) tone(420, 90, 0.35, 'sawtooth', 0.06);
    st.cb = 0;
  }
  // Tras vencer al jefe, la tienda se abre cuando termina la explosión.
  if (st.sw > 0 && (st.sw -= s) <= 0) openShop();
  st.hf -= s;
  if (st.pf) st.pf[1] -= s;
  // La barra de escudo se regenera sola tras unos segundos sin recibir daño; a mayor nivel,
  // espera más y se llena más lento (nivel 1: 2 s y ~3 s; nivel 15: 4 s y ~8 s).
  if ((st.rg -= s) <= 0 && !st.dead) st.sh = min(1, st.sh + (s * 0.35) / (1 + dif() * 0.12));
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
  if (dx && dy) { dx *= SQRT1_2; dy *= SQRT1_2; }
  pl.x += dx * pl.sp * s;
  pl.y += dy * pl.sp * s;
  // Dash: [2] da un impulso corto y veloz hacia donde te mueves (o hacia el frente si estás
  // quieto). Eres invulnerable mientras dura: sirve para atravesar enemigos y explosiones.
  if ((pl.dc -= s) <= 0 && pl.dc > -s && live) sfx.ready();
  if (live && pressed.P1_2 && pl.dc <= 0) {
    pl.dc = DCD;
    pl.dt = DASH;
    pl.vx = dx || dy ? dx : cos(pl.f);
    pl.vy = dx || dy ? dy : sin(pl.f);
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
  if (dx || dy) pl.f = rotTo(pl.f, atan2(dy, dx), s * 12);

  // Disparo: mantener P1_1 dispara en ráfaga desde la punta del frente.
  pl.cd -= s;
  if (live && held.P1_1 && pl.cd <= 0) {
    pl.cd = 0.14;
    const ux = cos(pl.f), uy = sin(pl.f);
    sfx.shoot();
    shots.push({ x: pl.x + ux * (pl.r + 8), y: pl.y + uy * (pl.r + 8), vx: ux * 640, vy: uy * 640, t: 1.1, c: bm ? YEL : 0xffffff });
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
  updateBanana(s);

  // La cámara solo sigue al jugador cuando sale de la zona muerta, y lo hace suave.
  const tx = pl.x - clamp(pl.x - cx, -DZX, DZX);
  const ty = pl.y - clamp(pl.y - cy, -DZY, DZY);
  const k = min(1, s * 4);
  cx += (tx - cx) * k;
  cy += (ty - cy) * k;
  this.cameras.main.setScroll(cx - W / 2, cy - H / 2);
  // Zoom de golpe: el mundo se acerca un instante alrededor del centro de la cámara y vuelve.
  zp -= zp * min(1, s * 7);
  const z = 1 + zp;
  for (const g of [gG, gE, gP]) g.setScale(z).setPosition(cx * (1 - z), cy * (1 - z));

  // La luz se apaga con el tiempo; cerca del jugador se recarga según la distancia.
  fade(s);
  // Cada cosa ilumina la grilla con su propio color.
  // Con combo x4 o más la luz del jugador crece y la grilla brilla más.
  if (live) light(pl.x, pl.y, LR * (st.pt > 0 ? 1.4 : 1 + max(0, cm() - 3) * 0.08), 1 + max(0, cm() - 3) * 0.1, st.pt > 0 || bm ? YEL : 0xffffff);
  for (const b of shots) light(b.x, b.y, 70, 0.5, b.c);
  for (const b of beams) {
    for (const a of beamAngles(b)) {
      for (let k = 40; k < b.len; k += 60) light(pl.x + cos(a) * k, pl.y + sin(a) * k, 70, 0.6, PNK);
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
  for (const e of mines) light(e.x, e.y, MR, 0.25 + 0.6 * min(1, e.t / FUSE), MC, 1);
  for (const e of blasts) if (e.t < 0.3) light(e.x, e.y, e.r * 2.2, 1, e.k);
  for (const b of eshots) light(b.x, b.y, 60, 0.4, b.c);
  if (boss) bossLight();
  for (const o of items) light(o.x, o.y, 90, 0.6, IC[o.k]);
  if (ban) ban.tr.forEach((q, i) => i % 4 || light(q.x, q.y, 80, 0.7 * (1 - i / 24), YEL));
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
  foes = foes.filter((e) => hypot(e.x - pl.x, e.y - pl.y) < 1300);
  let n = foes.filter((e) => !e.g).length;
  for (; !boss && n < FN + dif(); n++) {
    const a = random() * 6.28, d = 520 + random() * 500;
    const m = random() * 6.28, v = (15 + random() * 30) * spd();
    foes.push({
      x: pl.x + cos(a) * d, y: pl.y + sin(a) * d,
      vx: cos(m) * v, vy: sin(m) * v,
      a: random() * 6.28, va: (random() - 0.5) * 1.5, t: 0,
    });
  }
  // Desde el nivel 2 llegan formaciones que viajan juntas, cada vez más seguidas y grandes.
  if (st.lvl > 1 && !boss && !st.dead && (ft -= s) <= 0) {
    ft = max(5, 14 - dif()) + random() * 3;
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
      const c = cos(e.g.a), sn = sin(e.g.a);
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
    if (!st.dead && hypot(e.x - pl.x, e.y - pl.y) < TRIG) e.t = ARM, e.bp = 0, e.g = null;
    // Un proyectil lo hace explotar al instante.
    for (const b of shots) {
      if (b.t > 0 && hypot(e.x - b.x, e.y - b.y) < 20) {
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
  const D = dif(), a = random() * 6.28, v = 70 * spd(), k = (random() * 4) | 0, P = [];
  const g = { x: pl.x + cos(a) * 700, y: pl.y + sin(a) * 700, vx: -cos(a) * v, vy: -sin(a) * v, a, va: 0 };
  if (k == 0) {
    const n = 8 + (D >> 1), r = 70 + n * 5;
    for (let i = 0; i < n; i++) P.push([cos((i / n) * 6.28) * r, sin((i / n) * 6.28) * r]);
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
  for (const [ox, oy] of P) foes.push({ x: g.x, y: g.y, vx: 0, vy: 0, a: random() * 6.28, va: 1.2, t: 0, g, ox, oy });
  sfx.warn();
}

function updateJets(s) {
  jets = jets.filter((j) => !j.dead && hypot(j.x - pl.x, j.y - pl.y) < 1400);
  JT.forEach((T, t) => {
    while (!boss && jets.filter((j) => j.t == t).length < T.n + ((dif() / (3 + t)) | 0)) {
      const a = random() * 6.28, d = 650 + random() * 400;
      jets.push({ t, x: pl.x + cos(a) * d, y: pl.y + sin(a) * d, a: a + PI, m: a + PI, cd: 1 + random() * 2, hp: T.hp, hf: 0 });
    }
  });
  for (const j of jets) {
    const T = JT[j.t];
    const px = pl.x - j.x, py = pl.y - j.y, d = hypot(px, py), toP = atan2(py, px);
    // Lejos: se acerca. Muy cerca: se aleja. A buena distancia: rodea al jugador.
    const want = d > T.d + 60 ? toP : d < T.d - 60 ? toP + PI : toP + PI / 2;
    j.m = rotTo(j.m, want, s * 2.5);
    j.x += cos(j.m) * T.sp * spd() * s;
    j.y += sin(j.m) * T.sp * spd() * s;
    // El avión apunta hacia donde vuela; la nave doble gira para mirar al jugador.
    j.a = j.t ? rotTo(j.a, toP, s * 2) : j.m;
    j.hf -= s;
    if ((j.cd -= s) <= 0 && d < 500 && !st.dead) {
      j.cd = (T.cd + random() * 0.8) / (1 + dif() * 0.05);
      if (j.t) {
        // Dos proyectiles paralelos, uno desde cada ala, en la dirección en que mira.
        const ux = cos(j.a), uy = sin(j.a);
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
      if (b.t > 0 && hypot(j.x - b.x, j.y - b.y) < T.r + 4) {
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
    if (!st.dead && hypot(b.x - pl.x, b.y - pl.y) < pl.r + 3) {
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
    if (hypot(x - pl.x, y - pl.y) < r + pl.r) hurt(dmg);
    blastHit(x, y, r);
  }
  for (let i = 0; i < r / 4; i++) {
    const a = random() * 6.28, v = 120 + random() * r * 3.5;
    bits.push({ x, y, vx: cos(a) * v, vy: sin(a) * v, t: 0.4 + random() * 0.6, c: i % 3 ? c : k });
  }
  // En cadena, cada explosión seguida sacude más fuerte; las grandes congelan un instante.
  const n = ++ch;
  chT = 0.35;
  sc.cameras.main.shake(r * 1.5 + n * 25, r * 0.00007 * min(3, 1 + n * 0.25), n > 2);
  if (r >= 55 || n > 3) hs = max(hs, r > 150 ? 0.22 : 0.045);
  if (n > 3) zp = max(zp, min(0.06, n * 0.01));
  sfx.boom(r / BR);
}

function updateSpins(s) {
  spins = spins.filter((e) => !e.dead && hypot(e.x - pl.x, e.y - pl.y) < 1400);
  while (!boss && spins.length < SN + (dif() >> 2)) {
    const a = random() * 6.28, d = 600 + random() * 500;
    spins.push({ x: pl.x + cos(a) * d, y: pl.y + sin(a) * d, a: 0, m: random() * 6.28, hp: 4, hf: 0, hc: 0 });
  }
  for (const e of spins) {
    // Gira siempre y cambia de rumbo poco a poco, al azar.
    e.a += s * 3;
    e.m += (random() - 0.5) * s * 3;
    e.x += cos(e.m) * 60 * spd() * s;
    e.y += sin(e.m) * 60 * spd() * s;
    e.hf -= s;
    e.hc -= s;
    for (const b of shots) {
      if (b.t > 0 && hypot(e.x - b.x, e.y - b.y) < SR + 4) {
        b.t = 0;
        e.hf = 0.08;
        if (--e.hp <= 0) killSpin(e);
        else sfx.hit();
        break;
      }
    }
    // No muere al tocarte: te daña y espera un momento antes de volver a dañarte.
    if (!e.dead && !st.dead && e.hc <= 0 && hypot(e.x - pl.x, e.y - pl.y) < SR + pl.r) {
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
  const near = (e) => !e.dead && hypot(e.x - x, e.y - y) < r;
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
      e.t = 0.1 + random() * 0.15;
      e.bp = 0;
    }
  }
  for (const e of mines) if (near(e)) e.t = max(e.t, FUSE - 0.15);
  if (boss && hypot(boss.x - x, boss.y - y) < r + 40) hitBoss(6);
}

function updateSnakes(s) {
  snakes = snakes.filter((k) => k.s.length && hypot(k.s[0].x - pl.x, k.s[0].y - pl.y) < 1500);
  while (!boss && snakes.length < SNN + (dif() >> 2)) {
    const a = random() * 6.28, d = 700 + random() * 300, n = 4 + ((random() * (9 + dif())) | 0);
    const x = pl.x + cos(a) * d, y = pl.y + sin(a) * d, seg = [];
    for (let i = 0; i < n; i++) seg.push({ x: x + cos(a) * i * SGAP, y: y + sin(a) * i * SGAP, a: 0, hf: 0 });
    snakes.push({ s: seg, m: a + PI, p: 0, hc: 0 });
  }
  const born = [];
  for (const k of snakes) {
    // Cabeza: va hacia el jugador, oscilando a los lados como una serpiente.
    const h = k.s[0];
    k.p += s * 3;
    k.hc -= s;
    const toP = atan2(pl.y - h.y, pl.x - h.x);
    k.m = rotTo(k.m, toP + sin(k.p) * 0.9, s * 3);
    h.x += cos(k.m) * SSP * spd() * s;
    h.y += sin(k.m) * SSP * spd() * s;
    // Cada segmento sigue al anterior manteniendo la separación.
    for (let i = 1; i < k.s.length; i++) {
      const e = k.s[i], f = k.s[i - 1], d = hypot(f.x - e.x, f.y - e.y);
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
        if (b.t > 0 && hypot(e.x - b.x, e.y - b.y) < 16) {
          b.t = 0;
          killSeg(e);
          break;
        }
      }
      // Tocar cualquier segmento daña, con una pausa antes de volver a dañar.
      if (!e.dead && !st.dead && k.hc <= 0 && hypot(e.x - pl.x, e.y - pl.y) < pl.r + 12) {
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
      for (const ps of parts) born.push({ s: ps, m: atan2(ps[0].y - ps[1 % ps.length].y, ps[0].x - ps[1 % ps.length].x) || 0, p: random() * 6, hc: 0 });
    }
  }
  snakes = snakes.concat(born).filter((k) => k.s.length);
  shots = shots.filter((b) => b.t > 0);
}

function updateMines(s) {
  if (!boss && !st.dead && (mt -= s) <= 0) {
    mt = (7 + random() * 6) / (1 + dif() * 0.1);
    // Aparece a una distancia que deja al jugador dentro del área: hay que salir corriendo.
    // Desde el nivel 5 a veces llegan tres en triángulo y hay que escapar por un hueco.
    const a = random() * 6.28, d = 90 + random() * 60, tri = st.lvl >= 5 && random() < 0.4;
    for (let i = 0; i < (tri ? 3 : 1); i++) {
      const b = a + i * 2.09, r = tri ? 160 : d;
      mines.push({ x: pl.x + cos(b) * r, y: pl.y + sin(b) * r, a: random() * 6.28, t: 0, hp: 3, hf: 0, bp: 0.3 });
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
      if (b.t > 0 && hypot(e.x - b.x, e.y - b.y) < 22) {
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
    wt = (25 + random() * 10) / (1 + dif() * 0.08);
    // 0: columnas (vertical), 1: filas (horizontal), 2: combinada (cruz).
    const mode = (random() * 3) | 0;
    const w = { n: 0, k: 0 };
    for (const vert of mode == 2 ? [1, 0] : [!mode, !mode]) {
      // Carril que pasa cerca del jugador, entrando por un borde de la pantalla.
      const off = (random() - 0.5) * 300, sg = random() < 0.5 ? 1 : -1;
      lanes.push(vert
        ? { x: pl.x + off, y: cy - sg * (H / 2 + 30), a: (sg * PI) / 2, t: WARN, w }
        : { x: cx - sg * (W / 2 + 30), y: pl.y + off, a: sg > 0 ? 0 : PI, t: WARN, w });
    }
    sfx.warn();
  }
  for (const l of lanes) {
    if ((l.t -= s) > 0) continue;
    // Fin del aviso: entra la fila de diamantes, uno detrás de otro.
    const ux = cos(l.a), uy = sin(l.a);
    for (let i = 0; i < DN; i++) {
      dias.push({ x: l.x - ux * i * DGAP, y: l.y - uy * i * DGAP, a: l.a, d: -i * DGAP, w: l.w, hf: 0 });
      l.w.n++;
    }
  }
  lanes = lanes.filter((l) => l.t > 0);
  dias = dias.filter((e) => !e.dead);

  for (const e of dias) {
    e.x += cos(e.a) * DSP * spd() * s;
    e.y += sin(e.a) * DSP * spd() * s;
    e.d += DSP * spd() * s;
    if (e.d > 1600) e.gone = true;
    for (const b of shots) {
      if (b.t > 0 && hypot(e.x - b.x, e.y - b.y) < 18) {
        b.t = 0;
        killDia(e);
        break;
      }
    }
    if (!e.dead && !st.dead && hypot(e.x - pl.x, e.y - pl.y) < pl.r + 12) {
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
  orbs = orbs.filter((o) => hypot(o.x - pl.x, o.y - pl.y) < 1300);
  while (orbs.filter((o) => !o.v).length < ON) {
    const a = random() * 6.28, d = 450 + random() * 750;
    orbs.push({ x: pl.x + cos(a) * d, y: pl.y + sin(a) * d, vx: 0, vy: 0, p: random() * 6 });
  }
  for (const o of orbs) {
    o.p += s * 4;
    if (o.v && (o.l -= s) <= 0) o.got = true;
    const dx = pl.x - o.x, dy = pl.y - o.y, d = hypot(dx, dy);
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
  if (random() < 0.035) spawnItem(x, y);
  for (let i = 0; i < n; i++) {
    const a = random() * 6.28, v = 80 + random() * 120;
    orbs.push({ x, y, vx: cos(a) * v, vy: sin(a) * v, p: 0, v: 1, l: OL + random() });
  }
}

// Quita d (0..1) de la barra de escudo. Si se vacía, pierdes un corazón, la barra se
// rellena y quedas invulnerable un momento (parpadea). El daño sobrante se descarta.
function hurt(d) {
  if (st.inv > 0 || st.dead || pl.dt > 0 || st.pt > 0) return;
  st.cb = 0; // recibir daño corta el combo
  st.sh -= d;
  st.rg = 2 + dif() * 0.15;
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
  if (st.hp > 0) {
    // Corazón perdido: la nave se rompe en sus 6 lados y se vuelve a armar.
    pl.br = BRK;
    sc.cameras.main.shake(250, 0.012);
    tPop.setText('-1 VIDA').setShadow(0, 0, '#ff3c5a', 10, true, true).setVisible(true);
    tPop.t = 1;
  } else {
    st.dead = 0.001;
    boom(pl.x, pl.y, 90, 0xffffff, HC);
    hl = -1;
    st.q = st.pts > 0 && (board.length < 10 || st.pts > board[board.length - 1].s);
    if (st.q) ent = { n: '', c: 0 };
    else showOver();
  }
}

// Nueva partida en el mismo lugar del mundo, sin enemigos cerca.
function restart() {
  pl.br = 0;
  st = { hp: 3, sh: 1, rg: 0, hf: 0, lvl: 1, xp: 0, cr: 0, pts: 0, time: 0, inv: 1.5, dead: 0, pw: [0, 0, 0, 0, 0], bn: 0, sw: 0, cb: 0, ct: 0, mg: 0, pt: 0 };
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
  ban = null;
  banW = 35;
  mu = 0;
  for (const t of [tOver, tBan, tBanS, tBoss, tMul]) t.setVisible(false);
  shop = null;
  hideShop();
}

function fade(s) {
  for (const [key, v] of lv) {
    for (let i = 0; i < 3; i++) v[i] = max(0, v[i] - s * 0.35);
    if (!(v[0] + v[1] + v[2])) lv.delete(key);
  }
}

// Sonidos sintetizados con Web Audio (sin archivos).
let nbuf; // buffer de ruido blanco, se crea una vez
// Salida de los efectos: un compresor que solo actúa en los picos, para que muchos sonidos a
// la vez (explosiones en cadena, impactos de láser) no saturen.
let sb;
function bus(ac) {
  if (!sb) {
    sb = ac.createDynamicsCompressor();
    sb.threshold.value = -10;
    sb.knee.value = 10;
    sb.ratio.value = 8;
    sb.connect(ac.destination);
  }
  return sb;
}
function nb(ac) {
  if (!nbuf) {
    nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = random() * 2 - 1;
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
  o.connect(g).connect(bus(ac));
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
  n.connect(f).connect(g).connect(bus(ac));
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
  // Golpe al jefe: más grave y con cuerpo, como si fuera metal pesado.
  bhit: () => {
    tone(260, 70, 0.1, 'square', 0.08);
    noise(0.06, 0.12, 3000, 400);
  },
  eshoot: () => tone(520, 180, 0.12, 'sawtooth', 0.04),
  orb: () => tone(1100 + random() * 300, 1800, 0.07, 'sine', 0.06),
  lvl: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'triangle', 0.07), i * 70)),
  // v: volumen relativo (las explosiones chicas suenan más suave)
  boom: (v) => {
    noise(0.7 * v, 0.4 * v, 2200, 80);
    tone(140 / v, 35, 0.45 * v, 'sine', 0.35 * v);
  },
};

// Cada efecto suena como mucho una vez cada 40 ms: si 14 cuadrados explotan en el mismo
// cuadro, se oye una explosión y no 14 encimadas. Una explosión más grande que la
// anterior sí suena (la final del jefe no se pierde).
const sfxT = {}, sfxV = {};
for (const k in sfx) {
  const f = sfx[k];
  sfx[k] = (...a) => {
    const t = Date.now();
    if (t - (sfxT[k] || 0) < 40 && !(a[0] > sfxV[k])) return;
    sfxT[k] = t;
    sfxV[k] = a[0];
    f(...a);
  };
}

// Puntos locales [[x, y], ...] rotados según o.a y trasladados a (o.x, o.y).
function shape(o, pts) {
  const c = cos(o.a), s = sin(o.a);
  return pts.map(([x, y]) => ({ x: o.x + x * c - y * s, y: o.y + x * s + y * c }));
}

function sqPts(x, y, h, a) {
  const p = [];
  for (let k = 0; k < 4; k++) {
    const t = a + PI / 4 + (k * PI) / 2;
    p.push({ x: x + cos(t) * h * Math.SQRT2, y: y + sin(t) * h * Math.SQRT2 });
  }
  return p;
}

function drawFoes() {
  gE.clear();
  // Puntos: esfera azul con núcleo claro que late suave.
  for (const o of orbs) {
    // Al final de su vida parpadea cada vez más rápido antes de desaparecer.
    if (o.v && o.l < 2 && sin(o.l * (14 - o.l * 4)) < 0) continue;
    const k = 1 + sin(o.p) * 0.15;
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
      const pulse = 0.5 + 0.5 * sin(q * q * 40);
      gE.fillStyle(YEL, 0.05 + q * 0.2 * pulse);
      gE.fillCircle(x, y, BR);
      gE.lineStyle(2, RED, 0.3 + q * 0.6);
      gE.strokeCircle(x, y, BR);
      const amp = 1 + q * 5;
      x += (random() - 0.5) * 2 * amp;
      y += (random() - 0.5) * 2 * amp;
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
      const t2 = shape({ x: e.x + 1.5, y: e.y + 1, a: e.a + PI }, [[13, 0], [-6.5, -11.3], [-6.5, 11.3], [13, 0]]);
      for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
        gE.lineStyle(w, w > 2 ? c : 0xeaffd8, al);
        gE.strokePoints(t1, false);
        gE.strokePoints(t2, false);
      }
    }
  }
  // Mina: anillo rojo del área de daño, y tres triángulos que vibran cada vez más.
  for (const e of mines) {
    const q = min(1, e.t / FUSE), in_ = min(1, e.t / 0.25);
    const pulse = 0.6 + 0.4 * sin(q * q * 50);
    for (const [w, al] of [[16, 0.12], [6, 0.3], [2, 0.9]]) {
      gE.lineStyle(w, MC, al * in_ * pulse);
      gE.strokeCircle(e.x, e.y, MR * (0.6 + 0.4 * in_));
    }
    const amp = 1 + q * 6, c = e.hf > 0 ? 0xffffff : MC;
    // Aparece girando rápido y frena en 0.6 s; luego gira lento y acelera justo antes de explotar.
    const sp = max(0, 1 - e.t / 0.6);
    const rot = 12 * sp * sp + 0.8 * e.t + 6 * q ** 4;
    const o = { x: e.x + (random() - 0.5) * 2 * amp, y: e.y + (random() - 0.5) * 2 * amp, a: e.a + rot };
    const tri = (dx, dy, da) => shape({ x: o.x + dx, y: o.y + dy, a: o.a + da }, [[13 * in_, 0], [-8 * in_, -11 * in_], [-8 * in_, 11 * in_], [13 * in_, 0]]);
    const ts = [tri(-5, -3, 0), tri(5, 2, 0.15), tri(-1, 6, -0.2)];
    for (const [w, al] of [[9, 0.12], [4, 0.35], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? c : 0xffe0d8, al);
      for (const t of ts) gE.strokePoints(t, false);
    }
  }
  // Aviso de oleada: línea tenue por donde pasará el carril y flechas que parpadean en el borde.
  for (const l of lanes) {
    const ux = cos(l.a), uy = sin(l.a), on = (l.t * 8) & 1;
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
      const p = (r, u) => [cos(t + u) * r, sin(t + u) * r];
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
  drawBanana();
  for (const b of eshots) {
    gE.fillStyle(b.c, 0.25);
    gE.fillCircle(b.x, b.y, 7);
    gE.fillStyle(0xfff0f0, 1);
    gE.fillCircle(b.x, b.y, 2.5);
  }
  for (const p of bits) {
    gE.lineStyle(2, p.c, min(1, p.t * 2));
    gE.lineBetween(p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03);
  }
}

// Ilumina los vértices dentro del radio R alrededor de (x, y), con intensidad máxima m y color c.
// Con flat, la luz es pareja dentro de todo el radio en vez de apagarse hacia el borde.
function light(x, y, R, m, c = 0xffffff, flat) {
  const k = [(c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  const c0 = ceil((x - R) / CS), c1 = floor((x + R) / CS);
  const r0 = ceil((y - R) / CS), r1 = floor((y + R) / CS);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const d = hypot(c * CS - x, r * CS - y) / R;
      if (d >= 1) continue;
      const f = flat ? m : (1 - d) * (1 - d) * m, key = gk(c, r);
      const v = lv.get(key) || [0, 0, 0];
      for (let i = 0; i < 3; i++) v[i] = max(v[i], min(1, f * k[i]));
      lv.set(key, v);
    }
  }
}

// Clave numérica de cada vértice (columna, fila): evita armar miles de textos por cuadro.
// Es única mientras la fila esté entre ±50 000 (2 millones de píxeles).
const gk = (c, r) => c * 1e5 + r;
const Z = [0, 0, 0];
function L(c, r) {
  return lv.get(gk(c, r)) || Z;
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
// Los segmentos apagados se guardan en dk (gruesos o finos) para dibujarlos todos juntos.
let dk;
function seg(x1, y1, x2, y2, a, b, maj) {
  const r = (a[0] + b[0]) / 2, g = (a[1] + b[1]) / 2, bl = (a[2] + b[2]) / 2;
  const v = max(r, g, bl);
  if (!v) return dk[maj ? 0 : 1].push(x1, y1, x2, y2);
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
  dk = [[], []];
  const c0 = floor((cx - W / 2) / CS), c1 = ceil((cx + W / 2) / CS);
  const r0 = floor((cy - H / 2) / CS), r1 = ceil((cy + H / 2) / CS);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = c * CS, y = r * CS, v = L(c, r);
      if (c < c1) seg(x, y, x + CS, y, v, L(c + 1, r), !(r & 1));
      if (r < r1) seg(x, y, x, y + CS, v, L(c, r + 1), !(c & 1));
    }
  }
  // Todas las líneas apagadas en dos trazos (gruesas y finas) en vez de una por segmento.
  dk.forEach((p, i) => {
    gG.lineStyle(2 - i, 0xffffff, DARK);
    gG.beginPath();
    for (let j = 0; j < p.length; j += 4) {
      gG.moveTo(p[j], p[j + 1]);
      gG.lineTo(p[j + 2], p[j + 3]);
    }
    gG.strokePath();
  });
}

function hexPts(x, y, r, a) {
  const p = [];
  for (let k = 0; k < 6; k++) {
    const t = a + (k * PI) / 3;
    p.push({ x: x + cos(t) * r, y: y + sin(t) * r });
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
    gP.arc(pl.x, pl.y, pl.r + 12, -PI / 2, -PI / 2 + 6.283 * (1 - pl.dc / DCD));
    gP.strokePath();
  }
  // Modo plátano: arco amarillo con el tiempo que queda; parpadea cuando está por terminar.
  if (st.pt > 0 && !st.dead && (st.pt > 1.5 || (st.pt * 8) & 1)) {
    gP.lineStyle(3, YEL, 0.7);
    gP.beginPath();
    gP.arc(pl.x, pl.y, pl.r + 18, -PI / 2, -PI / 2 + 6.283 * (st.pt / PT));
    gP.strokePath();
  }
  if (pl.br > 0 && !st.dead) drawBreak();
  else if (!st.dead && !(st.inv > 0 && (st.inv * 12) & 1)) drawShip();
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
  const f = pl.f, ux = cos(f), uy = sin(f);
  const o = hexPts(pl.x, pl.y, pl.r, pl.a);
  const tip = { x: pl.x + ux * (pl.r + 8), y: pl.y + uy * (pl.r + 8) };
  const arr = [
    { x: pl.x + cos(f - 0.2) * (pl.r + 4), y: pl.y + sin(f - 0.2) * (pl.r + 4) },
    tip,
    { x: pl.x + cos(f + 0.2) * (pl.r + 4), y: pl.y + sin(f + 0.2) * (pl.r + 4) },
  ];
  if (bm) {
    // Nave plátano (easter egg): más grande que el plátano del mapa y con la curva hacia atrás.
    const b = shape({ x: pl.x, y: pl.y, a: f - PI / 2 }, BAN.map(([x, y]) => [x * 1.4, (y + 3) * 1.4]));
    gP.fillStyle(YEL, 0.35);
    gP.fillPoints(b, true);
    for (const [w, al] of [[12, 0.1], [5, 0.35], [2, 1]]) {
      gP.lineStyle(w, w > 2 ? YEL : 0xfffbe0, al);
      gP.strokePoints(b, true);
    }
    gP.fillStyle(0x8a5a2b, 1);
    for (const q of [b[0], b[8]]) gP.fillCircle(q.x, q.y, 3);
  } else {
    for (const [w, al] of [[14, 0.06], [8, 0.12], [4, 0.35], [2, 1]]) {
      gP.lineStyle(w, w > 2 ? (st.pt > 0 ? YEL : 0xfff2d0) : 0xffffff, al);
      gP.strokePoints(o, true);
    }
  }
  for (const [w, al] of [[5, 0.15], [1.5, 1]]) {
    gP.lineStyle(w, 0xffffff, al);
    gP.strokePoints(arr, false);
  }
}

// Nave rota: cada lado del hexágono sale despedido girando y luego vuelve a su lugar.
const BRK = 1.3; // segundos que dura romperse y rearmarse
function drawBreak() {
  const t = 1 - pl.br / BRK, o = hexPts(pl.x, pl.y, pl.r, pl.a);
  // 0..0.4 se aleja frenando; 0.4..1 vuelve acelerando.
  const d = t < 0.4 ? 1 - (1 - t / 0.4) ** 2 : 1 - ((t - 0.4) / 0.6) ** 2;
  for (let i = 0; i < 6; i++) {
    const p = o[i], q = o[(i + 1) % 6], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const a = atan2(my - pl.y, mx - pl.x), ox = cos(a) * d * 60, oy = sin(a) * d * 60;
    const r = d * (i & 1 ? 2.5 : -2.5), h = pl.r / 2, ea = atan2(q.y - p.y, q.x - p.x) + r;
    const cx2 = mx + ox, cy2 = my + oy, ex = cos(ea) * h, ey = sin(ea) * h;
    for (const [w, al] of [[8, 0.12], [4, 0.35], [2, 1]]) {
      gP.lineStyle(w, w > 2 ? HC : 0xffffff, al);
      gP.lineBetween(cx2 - ex, cy2 - ey, cx2 + ex, cy2 + ey);
    }
  }
}

// ---------- HUD holográfico ----------
const HB = 0x2a8cff, HC = 0x5fd8ff; // azul base, cian brillante
const cm = () => min(8, 1 + ((st.cb / 5) | 0)); // multiplicador de puntos del combo
const need = () => round(150 * st.lvl ** 1.5); // XP para el siguiente nivel: 150, 424, 779, 1200...

// Suma XP y créditos por enemigo destruido; sube de nivel al llenar la barra.
function reward(xp, cr) {
  // La barra se llena hasta el tope: eliges un powerup gratis y aparece el jefe.
  // El nivel sube al vencerlo.
  st.xp = min(need(), st.xp + xp);
  st.cr += cr;
  // Combo: cada destrucción dentro de 2.5 s lo alarga; cada 5 sube el multiplicador (hasta x8).
  const m0 = cm();
  st.cb++;
  st.ct = 2.5;
  if (cm() > m0) {
    tone(500 + cm() * 120, 900 + cm() * 160, 0.15, 'square', 0.05);
    zp = max(zp, 0.03 + cm() * 0.005);
    tMul.setText('x' + cm() + (cm() > 7 ? ' ¡FRENESÍ!' : '!'));
    mu = 0.9;
  }
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
  tMul = big(150, 44).setShadow(0, 0, '#ff7a1a', 16, true, true).setColor('#ffd23a');
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
  tHint = st2(W / 2, 540, 15, '#bfe9ff', 780);
  tEnt = st2(W / 2, 236, 48, '#f2fbff');
  // Teclado de iniciales: 10 columnas por 4 filas; BORRAR ocupa dos casillas.
  tKeys = [...ABC, 'BORRAR', 'OK'].map((k, i) => st2(KX(i < 37 ? i : i == 37 ? 37.5 : 39), KY(i < 37 ? i : 39), k.length > 2 ? 13 : 22, '#f2fbff').setText(k));
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
    gH.fillRect(x0 + i * w + (x1 < x0 ? w : 0), y, abs(w) - 3, 3);
  }
}

function drawHud() {
  gH.clear();
  // Parpadeo holográfico ocasional.
  const fl = random() < 0.03 ? 0.6 : 0.95;
  gH.setAlpha(fl);
  for (const t of [tLvl, tTime, tScore, tCr]) t.setAlpha(fl);
  tOver.setAlpha(0.75 + 0.25 * sin(st.dead * 6));

  // Izquierda: rayo, barra de experiencia que se afina hacia el centro, y nivel.
  segs(34, 124, 22, 4, 0.9);
  band(70, 300, 42, 22, 8, HB, 0.4, 0);
  band(84, 280, 42, 6, 3, HB, 0.25, 0.05);
  band(84, 84 + 196 * min(1, st.xp / need()), 42, 6, 6 - 3 * min(1, st.xp / need()), HC, 1, 0.8);
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
  for (let i = 0; i < 3; i++) {
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
  gH.fillRect(598, 56, 118 * max(0, st.sh), 4);
  tCr.setText('CRÉDITOS ' + st.cr);

  drawBossHud();
  // Combo bajo el puntaje: multiplicador y una barra que se vacía hasta que se corta.
  tCombo.setVisible(st.cb > 1 && !menu);
  if (st.cb > 1) {
    const m = cm();
    tCombo.setText('COMBO ' + st.cb + (m > 1 ? '   x' + m : '')).setColor(m > 1 ? '#ffb02e' : '#bfe9ff');
    gH.fillStyle(m > 1 ? ORA : HC, 0.85);
    gH.fillRect(W / 2 - 50, 94, 100 * max(0, st.ct / 2.5), 2);
  }
  // "x5!" grande que entra de golpe y se desvanece.
  mu -= sc.game.loop.delta / 1000;
  tMul.setVisible(mu > 0 && !menu);
  if (mu > 0) tMul.setAlpha(min(1, mu * 3)).setScale(1 + max(0, mu - 0.7) * 3);

  // Abajo a la izquierda: powerups que tienes, en hexágonos con su nivel en 4 marcas.
  // El recién comprado destella en magenta un momento.
  const own = [0, 1, 2, 3, 4].filter((i) => st.pw[i]);
  if (own.length) band(16, 330, 562, 44, 10, HB, 0.25, 0);
  own.forEach((i, j) => {
    const x = 42 + j * 56, y = 556, nw = st.pf && st.pf[0] == i && st.pf[1] > 0;
    const c = nw && (st.pf[1] * 6) & 1 ? 0xff3cf0 : HC;
    const hx = hexPts(x, y, 20, PI / 6);
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
      x: x + 16 * sin(t) ** 3 * k,
      y: y - (13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t)) * k,
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
const beamAngles = (b) => (b.k ? [0, 1, 2, 3].map((i) => pl.a + (i * PI) / 2) : [pl.f]);

function drones() {
  const n = min(st.pw[4], 3), r = [];
  for (let i = 0; i < n; i++) {
    const a = drA + (i * 6.28) / n;
    r.push({ x: pl.x + cos(a) * 48, y: pl.y + sin(a) * 48, a });
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
    const d = hypot(t.e.x - x, t.e.y - y);
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
      const ux = cos(a), uy = sin(a);
      for (const t of tg) {
        const px = t.e.x - pl.x, py = t.e.y - pl.y, al = px * ux + py * uy;
        if (al > 0 && al < b.len && abs(px * uy - py * ux) < b.w / 2 + 12) hitEnemy(t.e, t.k);
      }
    }
  }
  beams = beams.filter((b) => b.t > 0);

  // Misiles: salen en abanico hacia el frente y luego giran hacia el enemigo más cercano.
  if (L[2] && pwt[2] <= 0) {
    pwt[2] = 3.2 - 0.3 * L[2];
    for (let i = 0; i < L[2]; i++) {
      const a = pl.f + (i - (L[2] - 1) / 2) * 0.5;
      shots.push({ x: pl.x, y: pl.y, vx: cos(a) * 380, vy: sin(a) * 380, t: 3, h: 1, c: ORA });
    }
    sfx.missile();
  }
  for (const b of shots) {
    if (!b.h) continue;
    const e = nearest(b.x, b.y, 500);
    if (!e) continue;
    const v = hypot(b.vx, b.vy);
    const a = rotTo(atan2(b.vy, b.vx), atan2(e.y - b.y, e.x - b.x), s * 5);
    b.vx = cos(a) * v;
    b.vy = sin(a) * v;
  }

  // Espiral: L brazos que disparan mientras el ángulo avanza.
  if (L[3] && pwt[3] <= 0) {
    pwt[3] = 0.32 - 0.03 * L[3];
    spA += 0.45;
    for (let i = 0; i < L[3]; i++) {
      const a = spA + (i * 6.28) / L[3];
      shots.push({ x: pl.x + cos(a) * pl.r, y: pl.y + sin(a) * pl.r, vx: cos(a) * 420, vy: sin(a) * 420, t: 0.9, c: PNK });
    }
  }

  // Drones: orbitan y disparan al enemigo más cercano a cada uno.
  drA += s * 2;
  if (L[4] && pwt[4] <= 0) {
    pwt[4] = L[4] > 3 ? 0.45 : 0.8;
    for (const d of drones()) {
      const e = nearest(d.x, d.y, 420);
      if (!e) continue;
      const a = atan2(e.y - d.y, e.x - d.x);
      shots.push({ x: d.x, y: d.y, vx: cos(a) * 600, vy: sin(a) * 600, t: 0.8, c: HC });
    }
  }
}

function drawPowers() {
  // Rayo magenta con núcleo blanco y nubes de energía a lo largo; se apaga al final.
  for (const b of beams) {
    const fa = min(1, b.t * 6);
    for (const a of beamAngles(b)) {
      const ux = cos(a), uy = sin(a);
      const x0 = pl.x + ux * pl.r, y0 = pl.y + uy * pl.r, x1 = pl.x + ux * b.len, y1 = pl.y + uy * b.len;
      for (const [w, c, al] of [[b.w * 2.4, PNK, 0.12], [b.w * 1.5, PNK, 0.25], [b.w, 0xff7ae8, 0.5], [b.w * 0.35, 0xffffff, 0.9]]) {
        gP.lineStyle(w, c, al * fa);
        gP.lineBetween(x0, y0, x1, y1);
      }
      for (let i = 0; i < 10; i++) {
        const k = pl.r + random() * (b.len - pl.r);
        gP.fillStyle(PNK, 0.15 * fa);
        gP.fillCircle(pl.x + ux * k + (random() - 0.5) * b.w, pl.y + uy * k + (random() - 0.5) * b.w, b.w * (0.6 + random() * 0.6));
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
    const hx = hexPts(cx, y0, 24, PI / 6);
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
      L(cos(a) * 10, sin(a) * 10, cos(a + 0.5) * 14, sin(a + 0.5) * 14);
    }
  } else {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x, y, 3 * z);
    g.strokeCircle(x, y, 11 * z);
    for (let k = 0; k < 3; k++) g.fillCircle(x + cos(k * 2.09) * 11 * z, y + sin(k * 2.09) * 11 * z, 3 * z);
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
  // Logo "COMET SURVIVOR" con letras pixeladas de neón (ver drawLogo).
  gL = scene.add.graphics().setScrollFactor(0).setDepth(12);
  tMenu = {
    go: tx(390, 24, '#f2fbff', '#ff3cf0'),
    ctl: tx(500, 13, '#bfe9ff', '#5fd8ff'),
    best: tx(540, 15, '#ffb02e', '#ff7a1a'),
  };
  tMenu.go.setText('PRESIONA START');
  tMenu.ctl.setText('JOYSTICK  MOVER     [1]  DISPARAR     [2]  DASH');
  for (const t of [tLvl, tTime, tScore, tCr]) t.setVisible(false);
}

// Vuelve a la pantalla de inicio con el mapa limpio.
function toMenu() {
  restart();
  bm = 0;
  st.inv = 0;
  shots = [];
  orbs = [];
  bits = [];
  blasts = [];
  menu = 1;
  mT = 0;
  for (const k in tMenu) tMenu[k].setVisible(true);
  for (const t of [tLvl, tTime, tScore, tCr, tOver, tBoard, tHint, tEnt, tCombo, tPop, tMul, ...tKeys]) t.setVisible(false);
  gShop.clear();
}

function updateMenu(scene, s) {
  mT += s;
  // Easter egg: ↑ ↑ ↓ ↓ ← → ← → [2] [1] (el B-A del código Konami) empieza con la nave plátano.
  for (const k of ['P1_U', 'P1_D', 'P1_L', 'P1_R', 'P1_2', 'P1_1']) if (pressed[k]) kb = (kb + k[3]).slice(-10);
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
    gL.clear();
    sfx.lvl();
    restart();
    bm = kb == 'UUDDLRLR21';
    kb = '';
    if (bm) {
      banner('¡NAVE PLÁTANO!', 'CÓDIGO SECRETO DESBLOQUEADO', YEL);
      [0, 4, 7, 12, 16].forEach((n, i) => sc.time.delayedCall(i * 90, () => tone(hz(72 + n), hz(84 + n), 0.12, 'square', 0.06)));
    }
    return;
  }
  // La cámara avanza en diagonal: las estrellas y la grilla dan sensación de mapa infinito.
  cx += 40 * s;
  cy += 18 * s;
  scene.cameras.main.setScroll(cx - W / 2, cy - H / 2);
  // El hexágono recorre una curva de Lissajous y apunta hacia donde va.
  const px = cx + cos(mT * 0.45) * 300, py = cy + sin(mT * 0.7) * 190;
  if (hypot(px - pl.x, py - pl.y) > 0.5) pl.f = atan2(py - pl.y, px - pl.x);
  pl.x = px;
  pl.y = py;
  pl.a += s * 0.6;
  fade(s);
  light(pl.x, pl.y, LR, 1);
  gE.clear();
  ML.forEach((c, i) => {
    const q = mT * (0.3 + i * 0.07) + i * 1.3;
    const x = cx + cos(q * 1.3) * (180 + i * 40), y = cy + sin(q) * (120 + i * 25);
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
  const fl = random() < 0.04 ? 0.55 : 1;
  gH.setAlpha(fl);
  tMenu.go.setAlpha(0.35 + 0.65 * abs(sin(mT * 2.5)));
  // Cada 14 segundos alterna sola entre el título y la tabla (si hay puntajes).
  const sb = mB || (board.length && mT % 14 > 8);
  tMenu.best.setText(mB ? '[2]  VOLVER' : 'RÉCORD ' + String(best).padStart(6, '0') + '      [2]  PUNTAJES');
  gL.clear();
  tBoard.setText('MEJORES PUNTAJES\n\n' + boardText(-1)).setY(225).setVisible(sb);
  if (sb) return;
  band(W / 2, W / 2 + 330, 190, 110, 10, HB, 0.22, 0);
  band(W / 2, W / 2 - 330, 190, 110, 10, HB, 0.22, 0);
  drawLogo(fl);
}

// Logo con letras pixeladas tipo arcade de 5×7: cada fila es un número de 5 bits escrito en
// base 32 (un carácter por fila, de arriba a abajo).
const FONT = { C: 'ehggghe', O: 'ehhhhhe', M: 'hrllhhh', E: 'vgguggv', T: 'v444444', S: 'fgge11u', U: 'hhhhhhe', R: 'uhhukih', V: 'hhhhha4', I: 'e44444e' };

// Palabra centrada en x con su borde de arriba en y, píxeles de p de lado. Capas: halo de
// neón, copias roja y azul desplazadas (aberración cromática), borde brillante, relleno
// claro y una sombra abajo de cada trazo para darle relieve.
function pixWord(w, x, y, p, c, f, fl, g) {
  // px: [pantalla x, pantalla y, columna, fila]; S: casillas ocupadas, para unir vecinos.
  const px = [], S = new Set();
  [...w].forEach((ch, i) =>
    [...FONT[ch]].forEach((row, r) => {
      const b = parseInt(row, 32);
      for (let k = 0; k < 5; k++)
        if (b & (16 >> k)) {
          const q = i * 6 + k;
          px.push([x + (q - (w.length * 6 - 1) / 2) * p, y + r * p, q, r]);
          S.add(q * 8 + r);
        }
    }),
  );
  const has = (q, r) => S.has(q * 8 + r);
  const R = (e, dx, dy, col, al) => {
    gL.fillStyle(col, al * fl);
    for (const [a, b] of px) gL.fillRect(a - e + dx, b - e + dy, p + e * 2, p + e * 2);
  };
  R(p * 0.7, 0, 0, c, 0.06);
  R(p * 0.35, 0, 0, c, 0.1);
  R(1, g, 2, 0xff2a3a, 0.7);
  R(1, -g, -1, 0x3a6bff, 0.7);
  R(2, 0, 0, c, 1);
  // Relleno claro: se mete 3 px solo por los lados sin vecino, así el trazo queda continuo.
  gL.fillStyle(f, fl);
  for (const [a, b, q, r] of px) {
    const l = has(q - 1, r) ? 0 : 3, t = has(q, r - 1) ? 0 : 3;
    gL.fillRect(a + l, b + t, p - l - (has(q + 1, r) ? 0 : 3), p - t - (has(q, r + 1) ? 0 : 3));
  }
  // Relieve: franja más oscura en el borde de abajo de cada trazo.
  gL.fillStyle(c, 0.55 * fl);
  for (const [a, b, q, r] of px) if (!has(q, r + 1)) gL.fillRect(a + (has(q - 1, r) ? 0 : 3), b + p - 7, p - (has(q - 1, r) ? 0 : 3) - (has(q + 1, r) ? 0 : 3), 4);
}

function drawLogo(fl) {
  const g = random() < 0.05 ? 7 : 3; // glitch: a veces las capas de color se separan más
  pixWord('COMET', W / 2, 92, 15, 0xff3cb4, 0xffd6f0, fl, g);
  pixWord('SURVIVOR', W / 2, 222, 9, 0xffb21a, 0xfff2b8, fl, g);
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
    f.frequency.exponentialRampToValueAtTime(max(90, fc / 5), at + dur);
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
  n.start(at, random() * 0.5);
  n.stop(at + dur);
}

function beat(ac, n, at) {
  const s = n % 16, bar = n >> 4, ch = ROOT[bar % 4] + bm * 5, F = menu ? 0 : cm(), L = menu ? 0 : st.lvl + (boss || st.pt > 0 ? 3 : 0) + (F >= 4) + (F >= 6);
  STEP = 60 / (148 + min(16, max(0, L - 5) * 2)) / 4;
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
    const fc = (350 + 1700 * (0.5 + 0.5 * sin(n * 0.1))) * (1 + min(L, 10) * 0.08);
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
  // Combo x4 o más: sirena rave que cae cada medio compás.
  if (F >= 4 && s % 8 == 0) vo(ac, at, 'sawtooth', hz(ch + 31), hz(ch + 19), STEP * 6, 0.045, 3800, 5);
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

// Teclado de iniciales: casilla c (0..39) → pantalla. Las 37 primeras son letras y números,
// 37–38 es BORRAR y 39 es OK.
const KX = (c) => W / 2 + ((c % 10) - 4.5) * 50;
const KY = (c) => 318 + floor(c / 10) * 46;

// Iniciales con teclado en pantalla: el joystick mueve el cursor (da la vuelta en los bordes),
// [1] escribe la letra (o usa BORRAR / OK), [2] borra y START guarda. Al completar las tres
// letras el cursor salta a OK.
function updateEntry() {
  const e = ent;
  const dx = (pressed.P1_R ? 1 : 0) - (pressed.P1_L ? 1 : 0), dy = (pressed.P1_D ? 1 : 0) - (pressed.P1_U ? 1 : 0);
  if (dx || dy) {
    let c = e.c == 38 ? 37 : e.c;
    if (dx) c = floor(c / 10) * 10 + ((c % 10) + dx + 10) % 10;
    // BORRAR mide dos casillas: hacia la derecha se salta la segunda.
    if (c == 38) c = dx > 0 ? 39 : 37;
    if (dy) c = (c + dy * 10 + 40) % 40;
    e.c = c == 38 ? 37 : c;
    sfx.beep();
  }
  let ok = pressed.START1;
  if (pressed.P1_1) {
    if (e.c < 37) {
      if (e.n.length < 3) {
        e.n += ABC[e.c];
        if (e.n.length == 3) e.c = 39;
        sfx.beep();
      }
    } else if (e.c == 37) e.n = e.n.slice(0, -1);
    else ok = 1;
  }
  if (pressed.P1_2) e.n = e.n.slice(0, -1), sfx.beep();
  if (ok && e.n) {
    const n = e.n;
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
    for (const t of tKeys) t.setVisible(false);
    sfx.buy();
    showOver();
    return;
  }
  overlay();
  tOver.setText('¡NUEVO PUNTAJE ALTO!').setVisible(true);
  tBoard.setText('INGRESA TUS INICIALES   ' + String(st.pts).padStart(6, '0')).setY(172).setVisible(true);
  // Lo escrito, con guiones en las letras que faltan; el próximo guion late.
  tEnt.setText([0, 1, 2].map((i) => e.n[i] || (i == e.n.length && (st.dead * 3) & 1 ? ' ' : '_')).join('  ')).setVisible(true);
  tHint.setText('JOYSTICK  ELEGIR    [1]  ESCRIBIR    [2]  BORRAR    START  LISTO').setVisible(true);
  for (const t of tKeys) t.setVisible(true);
  // Teclas: fondo tenue; la elegida, recuadro magenta que late.
  const k = 0.6 + 0.4 * abs(sin(st.dead * 5));
  for (let c = 0; c < 40; c++) {
    if (c == 38) continue;
    const w = c == 37 ? 94 : 44, x = c == 37 ? KX(37) + 25 : KX(c);
    gShop.fillStyle(c == e.c ? 0xff3cf0 : HB, c == e.c ? 0.3 * k : 0.15);
    gShop.fillRoundedRect(x - w / 2, KY(c) - 20, w, 40, 6);
    if (c == e.c) {
      gShop.lineStyle(2, 0xff3cf0, k);
      gShop.strokeRoundedRect(x - w / 2, KY(c) - 20, w, 40, 6);
    }
  }
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
  const k = st.bn % 3, a = random() * 6.28, hp = 45 + st.bn * 25;
  boss = { k, x: pl.x + cos(a) * 520, y: pl.y + sin(a) * 520, hp, mx: hp, a: 0, m: a + PI, t: 2, c: 0, hf: 0, hc: 0, d: 0 };
  if (k == 2) boss.s = Array.from({ length: 16 }, () => ({ x: boss.x, y: boss.y }));
  banner('¡JEFE!', BN[k], BC[k]);
  zp = 0.08;
  sfx.warn();
}

// Proyectil enemigo desde (x, y) en el ángulo a.
const eb = (x, y, a, v, c) => eshots.push({ x, y, vx: cos(a) * v, vy: sin(a) * v, t: 4, c, d: 0.2 });

// ¿El ángulo a choca con alguno de los tres escudos del núcleo?
const shieldAt = (B, a) => [0, 1, 2].some((i) => abs(atan2(sin(a - B.a * 1.4 - i * 2.09), cos(a - B.a * 1.4 - i * 2.09))) < 0.65);

// Golpe al jefe en (x, y), o en un punto de su borde si no se indica. Reacciona con
// destello blanco, temblor, chispas en el punto de impacto y un golpe grave.
function hitBoss(n, x, y) {
  const B = boss;
  if (!B || B.d) return;
  B.hp -= n * (st.pt > 0 ? 3 : 1); // con el plátano, triple daño
  B.hf = 0.06;
  B.sk = 0.15;
  if (x == null) {
    const a = atan2(pl.y - B.y, pl.x - B.x) + (random() - 0.5);
    x = B.x + cos(a) * BR2[B.k];
    y = B.y + sin(a) * BR2[B.k];
  }
  for (let i = 0; i < 4; i++) {
    const a = atan2(y - B.y, x - B.x) + (random() - 0.5) * 2, v = 150 + random() * 250;
    bits.push({ x, y, vx: cos(a) * v, vy: sin(a) * v, t: 0.25 + random() * 0.25, c: i & 1 ? 0xffffff : BC[B.k] });
  }
  sfx.bhit();
  if (B.hp <= 0) B.d = 1.4;
}

function updateBoss(s) {
  const B = boss;
  if (!B) return;
  const T = (st.bn / 3) | 0, sp = spd(), R = BR2[B.k];
  const px = pl.x - B.x, py = pl.y - B.y, d = hypot(px, py), toP = atan2(py, px);
  B.a += s;
  B.hf -= s;
  B.sk -= s;
  // La barra deja ver en blanco el daño reciente, que se descuenta poco a poco.
  B.hd = max(B.hp, (B.hd || B.mx) - B.mx * 0.5 * s);
  // Muy dañado (menos de 30 %): suelta chispas de vez en cuando.
  if (B.hp < B.mx * 0.3 && random() < s * 12) {
    const a = random() * 6.28;
    bits.push({ x: B.x + cos(a) * BR2[B.k] * 0.6, y: B.y + sin(a) * BR2[B.k] * 0.6, vx: cos(a) * 120, vy: sin(a) * 120, t: 0.5, c: random() < 0.5 ? YEL : RED });
  }
  B.hc -= s;
  // Muriendo: explosiones por todo el cuerpo y al final una enorme.
  if (B.d) {
    if (random() < s * 14) boom(B.x + (random() - 0.5) * 140, B.y + (random() - 0.5) * 140, 50, YEL, BC[B.k]);
    if ((B.d -= s) <= 0) bossDown();
    return;
  }
  B.t -= s;
  if (B.k < 2) {
    // Se acerca hasta ~260 del jugador y lo rodea despacio.
    const want = d > 300 ? toP : d < 220 ? toP + PI : toP + PI / 2;
    B.m = rotTo(B.m, want, s);
    B.x += cos(B.m) * 55 * sp * s;
    B.y += sin(B.m) * 55 * sp * s;
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
          const a = random() * 6.28, r = 120 + random() * 120;
          mines.push({ x: pl.x + cos(a) * r, y: pl.y + sin(a) * r, a: random() * 6.28, t: 0, hp: 3, hf: 0, bp: 0.3 });
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
    if (B.c < 2) B.m = rotTo(B.m, toP + (B.c ? 0 : sin(B.a * 3) * 0.6), s * (B.c ? 4 : 2));
    const v = [130 * sp, 0, 640 * sp][B.c];
    B.x += cos(B.m) * v * s;
    B.y += sin(B.m) * v * s;
    let f = B;
    for (const g of B.s) {
      const gd = hypot(f.x - g.x, f.y - g.y);
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
    const dx = b.x - B.x, dy = b.y - B.y, r = hypot(dx, dy);
    if ((B.k == 1 && r > 38 && r < 62 && shieldAt(B, atan2(dy, dx))) || (B.k == 2 && B.s.some((g) => hypot(b.x - g.x, b.y - g.y) < 20))) b.t = 0;
    else if (r < R) {
      b.t = 0;
      hitBoss(1, b.x, b.y);
    }
  }
  shots = shots.filter((b) => b.t > 0);
  // Tocarlo daña, con una pausa antes de volver a dañar.
  const touch = d < R + pl.r || (B.k == 2 && B.s.some((g) => hypot(pl.x - g.x, pl.y - g.y) < 18 + pl.r));
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
  zp = 0.12;
}

function bossLight() {
  const B = boss, c = BC[B.k];
  light(B.x, B.y, 200, 0.7, c);
  if (B.k == 2) {
    for (const g of B.s) light(g.x, g.y, 70, 0.4, c);
    // Línea de aviso antes de embestir, en rojo.
    if (B.c == 1) for (let k = 60; k < 700; k += 60) light(B.x + cos(B.m) * k, B.y + sin(B.m) * k, 50, 0.6, RED);
  }
}

function drawBoss() {
  const B = boss;
  if (!B || (B.d && random() < 0.3)) return;
  // Al recibir un golpe tiembla: se dibuja corrido unos píxeles al azar.
  const jx = B.sk > 0 ? (random() - 0.5) * 10 : 0, jy = B.sk > 0 ? (random() - 0.5) * 10 : 0;
  B.x += jx;
  B.y += jy;
  drawBossBody(B);
  B.x -= jx;
  B.y -= jy;
}

function drawBossBody(B) {
  const c = B.hf > 0 ? 0xffffff : BC[B.k], ls = [];
  if (B.k == 0) {
    for (const [r, v] of [[62, 1], [44, -1.5], [26, 2]]) ls.push(hexPts(B.x, B.y, r, B.a * v));
  } else if (B.k == 1) {
    ls.push(hexPts(B.x, B.y, 28, B.a * 2), hexPts(B.x, B.y, 14, -B.a * 3));
  } else {
    const u = cos(B.m), w = sin(B.m), P = (f, l) => ({ x: B.x + u * f - w * l, y: B.y + w * f + u * l });
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
    gE.lineStyle(2, RED, 0.5 + 0.5 * sin(B.a * 30));
    gE.lineBetween(B.x, B.y, B.x + cos(B.m) * 700, B.y + sin(B.m) * 700);
  }
}

// Flecha que late en el borde de la pantalla, apuntando a (wx, wy) si está fuera de vista.
function edge(wx, wy, c) {
  const sx = wx - cx + W / 2, sy = wy - cy + H / 2;
  if (sx > 0 && sx < W && sy > 0 && sy < H) return;
  const a = atan2(sy - H / 2, sx - W / 2), x = clamp(sx, 30, W - 30), y = clamp(sy, 120, H - 30);
  gH.fillStyle(c, 0.5 + 0.5 * sin(st.time * 16));
  gH.fillTriangle(x + cos(a) * 14, y + sin(a) * 14, x + cos(a + 2.4) * 10, y + sin(a + 2.4) * 10, x + cos(a - 2.4) * 10, y + sin(a - 2.4) * 10);
}

// Barra de vida del jefe bajo el puntaje, flecha en el borde si está fuera de pantalla,
// y el aviso grande en el centro.
function drawBossHud() {
  const B = boss;
  tBoss.setVisible(!!B);
  if (B) {
    tBoss.setText(BN[B.k]);
    gH.fillStyle(HB, 0.3);
    const bx = 250 + (B.sk > 0 ? (random() - 0.5) * 6 : 0);
    gH.fillRect(bx, 122, 300, 6);
    gH.fillStyle(0xffffff, 0.8);
    gH.fillRect(bx, 122, 300 * max(0, B.hd / B.mx), 6);
    gH.fillStyle(B.hf > 0 ? 0xffffff : BC[B.k], 0.95);
    gH.fillRect(bx, 122, 300 * max(0, B.hp / B.mx), 6);
    edge(B.x, B.y, BC[B.k]);
  }
  if (ban) edge(ban.x, ban.y, YEL);
  const on = banT > 0;
  tBan.setVisible(on);
  tBanS.setVisible(on);
  if (on) {
    // Entra grande y se asienta; tiembla un poco (glitch) y se desvanece al final.
    const al = min(1, banT * 2), g = random() < 0.08 ? (random() - 0.5) * 14 : 0;
    tBan.setAlpha(al).setScale(1 + max(0, banT - 2.3) * 2).setX(W / 2 + g);
    tBanS.setAlpha(al);
  }
}

// ---------- Objetos del mapa ----------
// Aparecen cada 15–25 s cerca del jugador y a veces los suelta un enemigo destruido (el jefe
// siempre suelta uno). Duran 12 s y parpadean los últimos 3.
// 0 ESCUDO (barra llena), 1 BOMBA (destruye lo cercano), 2 IMÁN (8 s). No hay objetos que
// devuelvan corazones: las vidas perdidas no se recuperan.
const IN = ['ESCUDO', '¡BOMBA!', 'IMÁN'];
const IC = [HC, YEL, OB];

function spawnItem(x, y) {
  items.push({ x, y, k: (random() * 3) | 0, t: 12, a: 0 });
}

function updateItems(s) {
  if (!boss && !st.dead && (itT -= s) <= 0) {
    itT = 15 + random() * 10;
    const a = random() * 6.28, d = 250 + random() * 200;
    spawnItem(pl.x + cos(a) * d, pl.y + sin(a) * d);
  }
  for (const o of items) {
    o.t -= s;
    o.a += s * 2;
    if (!st.dead && hypot(o.x - pl.x, o.y - pl.y) < pl.r + 18) {
      o.t = 0;
      takeItem(o);
    }
  }
  items = items.filter((o) => o.t > 0);
  if (tPop.visible && (tPop.t -= s) <= 0) tPop.setVisible(false);
  if (tPop.visible) tPop.setPosition(pl.x, pl.y - 40 - (1 - tPop.t) * 30).setAlpha(min(1, tPop.t * 2));
}

function takeItem(o) {
  if (o.k == 0) st.sh = 1;
  else if (o.k == 2) st.mg = 8;
  else {
    // Bomba: onda enorme que destruye todo lo cercano y los proyectiles enemigos. Da un
    // segundo de invulnerabilidad para que las explosiones en cadena no te alcancen.
    st.inv = max(st.inv, 1);
    boom(pl.x, pl.y, 340, 0xffffff, YEL);
    targets();
    for (const t of tg) {
      if (hypot(t.e.x - pl.x, t.e.y - pl.y) > 340) continue;
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
    if (o.t < 3 && sin(o.t * 18) < 0) continue;
    const c = IC[o.k], k = 1 + sin(o.a * 2) * 0.08;
    // Marco: rombo que gira, con el símbolo del objeto adentro.
    const fr = [0, 1, 2, 3].map((i) => ({ x: o.x + cos(o.a + i * 1.571) * 20 * k, y: o.y + sin(o.a + i * 1.571) * 20 * k }));
    gE.fillStyle(c, 0.15);
    gE.fillPoints(fr, true);
    for (const [w, al] of [[8, 0.15], [3, 0.4], [1.5, 1]]) {
      gE.lineStyle(w, w > 2 ? c : 0xffffff, al);
      gE.strokePoints(fr, true);
    }
    gE.fillStyle(c, 1);
    gE.lineStyle(2, 0xffffff, 1);
    if (o.k == 0) gE.strokePoints(hexPts(o.x, o.y, 8, 0), true);
    else if (o.k == 1) {
      gE.fillCircle(o.x, o.y + 2, 6);
      gE.lineBetween(o.x + 3, o.y - 3, o.x + 7, o.y - 8);
    } else {
      gE.beginPath();
      gE.arc(o.x, o.y - 2, 6, 0, PI);
      gE.strokePath();
      gE.lineBetween(o.x - 6, o.y - 2, o.x - 6, o.y - 7);
      gE.lineBetween(o.x + 6, o.y - 2, o.x + 6, o.y - 7);
    }
  }
}

// ---------- Plátano ----------
// Cada 40–70 s (y una vez en cada pelea con jefe) un plátano cruza el mapa muy rápido,
// zigzagueando y dejando una estela amarilla. Al tomarlo, durante PT segundos eres
// invencible, destruyes todo lo que tocas (también los proyectiles) y haces triple daño
// al jefe. Más rápido que el jugador: hay que cortarle el paso o alcanzarlo con el dash.
const PT = 8;

function updateBanana(s) {
  if (st.dead) return;
  if (!ban && ((banW -= s) <= 0 || (boss && !boss.b && boss.hp < boss.mx * 0.8))) {
    if (boss) boss.b = 1;
    banW = 40 + random() * 30;
    // Entra desde lejos y pasa cerca del jugador, a un lado.
    const a = random() * 6.28, x = pl.x + cos(a) * 700, y = pl.y + sin(a) * 700;
    const m = atan2(pl.y - y, pl.x - x) + (random() - 0.5) * 0.5;
    ban = { x, y, m, a: 0, t: 0, tr: [] };
    tone(800, 2400, 0.3, 'sine', 0.06);
  }
  if (ban) {
    const b = ban;
    b.t += s;
    b.a += s * 9;
    // Rumbo con zigzag: avanza a 430 px/s oscilando a los lados.
    const h = b.m + sin(b.t * 5) * 0.7;
    b.x += cos(h) * 430 * s;
    b.y += sin(h) * 430 * s;
    b.tr.unshift({ x: b.x, y: b.y });
    b.tr.length = min(b.tr.length, 24);
    if (hypot(b.x - pl.x, b.y - pl.y) < pl.r + 22) {
      ban = null;
      st.pt = PT;
      sfx.lvl();
      banner('¡MODO PLATANUS!', 'INVENCIBLE  ·  DESTRUYE TODO  ·  x3 AL JEFE', YEL);
    } else if (b.t > 5) ban = null;
  }
  if ((st.pt -= s) > 0) {
    // Todo lo que toques se destruye.
    targets();
    for (const t of tg) {
      if (hypot(t.e.x - pl.x, t.e.y - pl.y) > pl.r + (t.k == 6 ? BR2[t.e.k] : 22)) continue;
      if (t.k == 6) hitBoss(10 * s);
      else for (let i = 0; i < 5 && !t.e.dead; i++) hitEnemy(t.e, t.k);
    }
    eshots = eshots.filter((b) => hypot(b.x - pl.x, b.y - pl.y) > pl.r + 10);
  }
}

// Medialuna en coordenadas locales: borde exterior y luego el interior de vuelta.
const BAN = [];
for (let i = 0; i <= 8; i++) BAN.push([cos(-PI / 2 + (i / 8 - 0.5) * 1.9) * 24, sin(-PI / 2 + (i / 8 - 0.5) * 1.9) * 24 + 12]);
for (let i = 8; i >= 0; i--) BAN.push([cos(-PI / 2 + (i / 8 - 0.5) * 1.9) * 20, sin(-PI / 2 + (i / 8 - 0.5) * 1.9) * 20 + 17]);

function drawBanana() {
  const b = ban;
  if (!b) return;
  for (let i = 1; i < b.tr.length; i++) {
    gE.lineStyle(10 * (1 - i / b.tr.length), YEL, 0.5 * (1 - i / b.tr.length));
    gE.lineBetween(b.tr[i - 1].x, b.tr[i - 1].y, b.tr[i].x, b.tr[i].y);
  }
  const p = shape(b, BAN);
  gE.fillStyle(YEL, 0.35);
  gE.fillPoints(p, true);
  for (const [w, al] of [[10, 0.15], [4, 0.4], [2, 1]]) {
    gE.lineStyle(w, w > 2 ? YEL : 0xfffbe0, al);
    gE.strokePoints(p, true);
  }
  // Puntas cafés.
  gE.fillStyle(0x8a5a2b, 1);
  for (const q of [p[0], p[8]]) gE.fillCircle(q.x, q.y, 3);
}
})();
