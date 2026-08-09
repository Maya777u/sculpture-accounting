/* ============================================================
 * forge-particles.js — ذرات ذوب فلز و اخگر برای تم Forge
 * Canvas overlay — سبک و بهینه
 * ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('forge-particles');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];
  var MAX = 35;
  var running = true;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: canvas.height + 10,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -(Math.random() * 0.8 + 0.3),
      size: Math.random() * 3 + 1,
      alpha: Math.random() * 0.5 + 0.3,
      color: Math.random() > 0.5 ? '#f97316' : (Math.random() > 0.5 ? '#c87533' : '#fcd34d'),
      life: 0,
      maxLife: Math.random() * 200 + 100
    };
  }

  function update() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Spawn
    if (particles.length < MAX && Math.random() < 0.1) {
      particles.push(createParticle());
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = Math.max(0, p.alpha - 0.002);

      if (p.life > p.maxLife || p.alpha <= 0 || p.y < -10) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = p.size * 3;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    requestAnimationFrame(update);
  }

  // IntersectionObserver: only animate when visible
  if (typeof IntersectionObserver !== 'undefined') {
    var obs = new IntersectionObserver(function (entries) {
      running = entries[0].isIntersecting;
      if (running) update();
    });
    obs.observe(canvas);
  } else {
    update();
  }
})();
