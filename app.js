/* ─────────────────────────────────────────────────────────
   A small letter about bumblebees
   Scenes: intro → four meadow chapters → finale.
   The bee follows your pointer (or finger). Each flower it
   reaches reveals a piece of the chapter's quote.
   ───────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const CHAPTERS = [
    {
      line: 'Start where you are. The first flowers are close.',
      quote: 'Resolve arrives in the measure of the resolute.',
      by: 'Al-Mutanabbi',
      flowers: 3, mode: 'still',
    },
    {
      line: 'Some days the wind moves everything around. Go anyway.',
      quote: 'What you seek is seeking you.',
      by: 'Rumi',
      flowers: 4, mode: 'drift', drift: 1,
    },
    {
      line: 'You will not see the whole way at once. That is fine.',
      quote: 'It always seems impossible until it is done.',
      by: 'Nelson Mandela',
      flowers: 4, mode: 'reveal',
    },
    {
      line: 'Nearly across the meadow now. Take your time.',
      quote: 'Indeed, with hardship comes ease.',
      by: 'Qur’an 94:6',
      flowers: 5, mode: 'drift', drift: 0.6,
    },
  ];
  const ROMAN = ['I', 'II', 'III', 'IV'];
  const FLOWER_SRC = ['/assets/flower-lavender.webp', '/assets/flower-cornflower.webp', '/assets/flower-daisy.webp'];
  const FLOWER_SHAPE = [{ w: 0.62, h: 1.0 }, { w: 1.0, h: 1.0 }, { w: 1.0, h: 1.0 }]; // lavender is a tall sprig

  // ───────── DOM ─────────
  const $ = (s) => document.querySelector(s);
  const scenes = { intro: $('#intro'), meadow: $('#meadow'), finale: $('#finale') };
  const introVideo = $('#introVideo');
  const finaleVideo = $('#finaleVideo');
  const field = $('#field');
  const beeEl = $('#bee');
  const chapterNum = $('#chapterNum');
  const chapterLine = $('#chapterLine');
  const quoteText = $('#quoteText');
  const quoteBy = $('#quoteBy');
  const dots = $('#dots');
  const nextBtn = $('#next');
  const touchHint = $('#touchHint');
  const soundBtn = $('#sound');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // ───────── State ─────────
  let chapter = 0;
  let flowers = [];        // { el, fx, fy, size, visited, shown, phase, amp }
  let fragments = [];      // spans in the quote
  let visitedCount = 0;
  let complete = false;
  let W = 0, H = 0;
  let running = false;
  let lastT = 0;
  let trailAcc = 0;

  const bee = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, dir: 1, size: 150, hasTarget: false };
  let dragging = false, everDragged = false;

  // ───────── Helpers ─────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const vmin = () => Math.min(W, H) / 100;

  function measure() {
    const r = field.getBoundingClientRect();
    W = r.width; H = r.height;
    bee.size = clamp(18 * vmin(), 96, 190);
    beeEl.style.setProperty('--bee', bee.size + 'px');
    flowers.forEach((f) => {
      f.size = clamp(16 * vmin(), 84, 160);
      f.el.style.setProperty('--size', f.size + 'px');
    });
  }
  window.addEventListener('resize', measure);

  function showScene(name) {
    Object.entries(scenes).forEach(([k, el]) => el.classList.toggle('is-active', k === name));
  }

  function splitQuote(text, n) {
    const words = text.split(' ');
    const per = Math.ceil(words.length / n);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(words.slice(i * per, (i + 1) * per).join(' '));
    return parts.filter(Boolean);
  }

  // ───────── Chapter setup ─────────
  function placeFlowers(n) {
    // Fractions of the field. Keep clear of the header (top) and the quote card (bottom).
    const portrait = H > W;
    const box = portrait
      ? { x0: 0.16, x1: 0.84, y0: 0.22, y1: 0.60 }
      : { x0: 0.10, x1: 0.90, y0: 0.24, y1: 0.68 };
    const minD = portrait ? 0.22 : 0.17; // in field-diagonal-ish units (fraction of larger side)
    const pts = [];
    let tries = 0;
    while (pts.length < n && tries < 600) {
      tries++;
      const p = { fx: rand(box.x0, box.x1), fy: rand(box.y0, box.y1) };
      const ok = pts.every((q) => {
        const dx = (p.fx - q.fx) * W, dy = (p.fy - q.fy) * H;
        return Math.hypot(dx, dy) > minD * Math.max(W, H);
      });
      // keep away from the bee's start as well
      const bx = 0.18 * W, by = 0.5 * H;
      if (ok && Math.hypot(p.fx * W - bx, p.fy * H - by) > bee.size * 1.2) pts.push(p);
    }
    return pts;
  }

  function buildChapter(i) {
    const c = CHAPTERS[i];
    chapter = i;
    complete = false;
    visitedCount = 0;

    // header
    chapterNum.textContent = ROMAN[i];
    chapterLine.classList.remove('is-in');
    chapterLine.textContent = c.line;
    void chapterLine.offsetWidth;
    chapterLine.classList.add('is-in');

    // quote skeleton
    const parts = splitQuote(c.quote, c.flowers);
    quoteText.innerHTML = '';
    fragments = parts.map((p, k) => {
      const s = document.createElement('span');
      s.className = 'frag is-hint';
      s.textContent = p + (k < parts.length - 1 ? ' ' : '');
      quoteText.appendChild(s);
      return s;
    });
    quoteBy.textContent = c.by;
    quoteBy.classList.remove('is-on');
    nextBtn.hidden = true; nextBtn.classList.remove('is-on');
    dots.innerHTML = parts.map(() => '<i></i>').join('');

    // flowers
    flowers.forEach((f) => f.el.remove());
    measure();
    const pts = placeFlowers(parts.length);
    flowers = pts.map((p, k) => {
      const type = k % 3;
      const el = document.createElement('div');
      el.className = 'flower';
      el.style.setProperty('--rot', rand(-10, 10) + 'deg');
      el.style.setProperty('--sway', rand(4, 7).toFixed(2) + 's');
      const img = document.createElement('img');
      img.src = FLOWER_SRC[type]; img.alt = ''; img.draggable = false;
      el.appendChild(img);
      field.insertBefore(el, beeEl);
      const f = {
        el, fx: p.fx, fy: p.fy, x: 0, y: 0, type,
        size: 0, visited: false, shown: false,
        phase: rand(0, Math.PI * 2), phase2: rand(0, Math.PI * 2),
        amp: (c.drift || 0) * rand(3, 5.5),
        speed: rand(0.25, 0.45),
      };
      return f;
    });
    measure();

    // reveal order
    flowers.forEach((f, k) => {
      const delay = c.mode === 'reveal' ? (k === 0 ? 300 : null) : 300 + k * 260;
      if (delay !== null) setTimeout(() => showFlower(f), delay);
    });

    // bee enters from the left
    bee.x = -bee.size; bee.y = H * 0.5; bee.vx = 0; bee.vy = 0; bee.dir = 1;
    bee.tx = W * 0.18; bee.ty = H * 0.5; bee.hasTarget = false;

    if (coarse && !everDragged) touchHint.classList.add('is-on');
  }

  function showFlower(f) {
    f.shown = true;
    requestAnimationFrame(() => f.el.classList.add('is-in'));
  }

  // ───────── Visiting a flower ─────────
  function visit(f) {
    f.visited = true;
    f.el.classList.add('is-visited', 'is-bump');
    pollenBurst(f.x, f.y, 14);
    const k = visitedCount++;
    if (fragments[k]) { fragments[k].classList.remove('is-hint'); fragments[k].classList.add('is-on'); }
    const d = dots.children[k]; if (d) d.classList.add('is-on');
    if (window.MeadowAudio) window.MeadowAudio.chime(k, fragments.length);
    if (navigator.vibrate && coarse) navigator.vibrate(12);

    const c = CHAPTERS[chapter];
    if (c.mode === 'reveal') {
      const nxt = flowers.find((x) => !x.shown);
      if (nxt) setTimeout(() => showFlower(nxt), 500);
    }
    if (visitedCount >= flowers.length) finishChapter();
  }

  function finishChapter() {
    complete = true;
    setTimeout(() => quoteBy.classList.add('is-on'), 500);
    setTimeout(() => { nextBtn.hidden = false; requestAnimationFrame(() => nextBtn.classList.add('is-on')); }, 1600);
  }

  // ───────── Pollen ─────────
  function pollenBurst(x, y, n) {
    if (reduceMotion) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'pollen';
      const s = rand(3, 7);
      p.style.width = p.style.height = s + 'px';
      field.appendChild(p);
      const a = rand(0, Math.PI * 2), dist = rand(30, 110) * (vmin() / 7);
      const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist - rand(10, 40);
      const dur = rand(900, 1700);
      p.animate([
        { transform: `translate3d(${x}px, ${y}px, 0) scale(1)`, opacity: 1 },
        { transform: `translate3d(${x + dx * 0.6}px, ${y + dy * 0.6}px, 0) scale(1.1)`, opacity: 1, offset: 0.4 },
        { transform: `translate3d(${x + dx}px, ${y + dy + 30}px, 0) scale(.4)`, opacity: 0 },
      ], { duration: dur, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' }).onfinish = () => p.remove();
    }
  }

  function trail(x, y) {
    const p = document.createElement('span');
    p.className = 'pollen';
    const s = rand(2, 4);
    p.style.width = p.style.height = s + 'px';
    p.style.opacity = '.7';
    field.appendChild(p);
    const dx = rand(-6, 6), dy = rand(8, 26);
    p.animate([
      { transform: `translate3d(${x}px, ${y}px, 0)`, opacity: .7 },
      { transform: `translate3d(${x + dx}px, ${y + dy}px, 0)`, opacity: 0 },
    ], { duration: rand(700, 1200), easing: 'ease-out', fill: 'forwards' }).onfinish = () => p.remove();
  }

  // ───────── Input ─────────
  function setTarget(px, py, isTouch) {
    const r = field.getBoundingClientRect();
    bee.tx = px - r.left;
    bee.ty = py - r.top - (isTouch ? bee.size * 0.6 : 0); // keep the bee above the finger
    bee.hasTarget = true;
  }
  field.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || dragging) setTarget(e.clientX, e.clientY, e.pointerType !== 'mouse');
  });
  field.addEventListener('pointerdown', (e) => {
    dragging = true;
    field.setPointerCapture && field.setPointerCapture(e.pointerId);
    setTarget(e.clientX, e.clientY, e.pointerType !== 'mouse');
    if (!everDragged) { everDragged = true; touchHint.classList.remove('is-on'); }
  });
  const endDrag = () => { dragging = false; };
  field.addEventListener('pointerup', endDrag);
  field.addEventListener('pointercancel', endDrag);
  field.addEventListener('lostpointercapture', endDrag);

  // ───────── Loop ─────────
  function tick(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;

    // bee spring toward target
    const k = 48, damp = 9.5;
    const ax = (bee.tx - bee.x) * k - bee.vx * damp;
    const ay = (bee.ty - bee.y) * k - bee.vy * damp;
    bee.vx += ax * dt; bee.vy += ay * dt;
    bee.x += bee.vx * dt; bee.y += bee.vy * dt;
    // idle: a lazy figure-eight when nobody is steering
    if (!bee.hasTarget) {
      bee.tx = W * 0.18 + Math.sin(t / 2600) * W * 0.03;
      bee.ty = H * 0.5 + Math.sin(t / 1700) * H * 0.03;
    }
    bee.x = clamp(bee.x, -bee.size, W + bee.size);
    bee.y = clamp(bee.y, -bee.size, H + bee.size);

    if (bee.vx > 40) bee.dir = 1; else if (bee.vx < -40) bee.dir = -1;
    const speed = Math.hypot(bee.vx, bee.vy);
    const tilt = clamp(bee.vy * 0.035, -22, 22) * bee.dir + clamp(bee.vx * 0.01, -6, 6);
    beeEl.style.setProperty('--x', bee.x.toFixed(1) + 'px');
    beeEl.style.setProperty('--y', bee.y.toFixed(1) + 'px');
    beeEl.style.setProperty('--rot', tilt.toFixed(2) + 'deg');
    beeEl.style.setProperty('--dir', bee.dir);

    // pollen trail when moving
    if (!reduceMotion && speed > 180) {
      trailAcc += dt * speed / 180;
      if (trailAcc > 1) { trailAcc = 0; trail(bee.x - bee.dir * bee.size * 0.3, bee.y + bee.size * 0.1); }
    }

    // flowers: drift + collision
    const c = CHAPTERS[chapter];
    for (const f of flowers) {
      let x = f.fx * W, y = f.fy * H;
      if (f.amp && !f.visited && !reduceMotion) {
        x += Math.sin(t / 1000 * f.speed + f.phase) * f.amp * vmin();
        y += Math.cos(t / 1000 * f.speed * 0.8 + f.phase2) * f.amp * 0.6 * vmin();
      }
      f.x = x; f.y = y;
      f.el.style.setProperty('--x', x.toFixed(1) + 'px');
      f.el.style.setProperty('--y', y.toFixed(1) + 'px');
      if (!f.visited && f.shown && bee.hasTarget) {
        const reach = bee.size * 0.26 + f.size * 0.3;
        if (Math.hypot(bee.x - x, bee.y - y) < reach) visit(f);
      }
    }
    requestAnimationFrame(tick);
  }

  function startLoop() {
    if (running) return;
    running = true; lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function stopLoop() { running = false; }

  // ───────── Transitions ─────────
  function toChapter(i) {
    scenes.meadow.classList.add('is-switching');
    field.style.transition = 'opacity 600ms'; field.style.opacity = '0';
    $('#quoteCard').style.transition = 'opacity 500ms'; $('#quoteCard').style.opacity = '0';
    setTimeout(() => {
      buildChapter(i);
      field.style.opacity = '1';
      $('#quoteCard').style.opacity = '1';
      scenes.meadow.classList.remove('is-switching');
    }, 650);
  }

  function enterMeadow() {
    showScene('meadow');
    buildChapter(0);
    startLoop();
    introVideo.pause();
  }

  function enterFinale() {
    stopLoop();
    showScene('finale');
    if (window.MeadowAudio) window.MeadowAudio.finale();
    const lines = finaleVideo.parentElement.querySelectorAll('.finale__quote .line');
    const sign = $('.finale__sign'), again = $('#again');
    lines.forEach((l) => l.classList.remove('is-on'));
    sign.classList.remove('is-on'); again.classList.remove('is-on');

    finaleVideo.currentTime = 0;
    const play = finaleVideo.play(); if (play && play.catch) play.catch(() => {});
    const T = reduceMotion ? 300 : 1000;
    [1.2, 3.4, 5.8, 7.6].forEach((s, i) => setTimeout(() => lines[i].classList.add('is-on'), s * T));
    setTimeout(() => sign.classList.add('is-on'), 10.2 * T);
    setTimeout(() => again.classList.add('is-on'), 12.5 * T);
  }

  // ───────── Wiring ─────────
  $('#begin').addEventListener('click', () => {
    if (window.MeadowAudio) { window.MeadowAudio.start(); soundBtn.setAttribute('aria-pressed', 'true'); }
    soundBtn.hidden = false; requestAnimationFrame(() => soundBtn.classList.add('is-shown'));
    enterMeadow();
  });
  nextBtn.addEventListener('click', () => {
    if (!complete) return;
    if (chapter + 1 < CHAPTERS.length) toChapter(chapter + 1); else enterFinale();
  });
  $('#again').addEventListener('click', () => {
    finaleVideo.pause();
    if (window.MeadowAudio) window.MeadowAudio.reset();
    showScene('meadow');
    buildChapter(0);
    startLoop();
  });
  soundBtn.addEventListener('click', () => {
    if (!window.MeadowAudio) return;
    const on = window.MeadowAudio.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
  });

  // Intro loop fades in over the still once it can play. Portrait hides it via CSS.
  introVideo.addEventListener('canplaythrough', () => {
    const p = introVideo.play();
    if (p && p.then) p.then(() => introVideo.classList.add('is-ready')).catch(() => {});
    else introVideo.classList.add('is-ready');
  }, { once: true });
  introVideo.load();

  // Warm the cache for the meadow while the opening plays
  ['/assets/meadow.jpg', '/assets/bee.webp', ...FLOWER_SRC].forEach((src) => { const im = new Image(); im.src = src; });

  measure();
})();
