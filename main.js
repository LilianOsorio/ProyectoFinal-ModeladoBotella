const canvas = document.getElementById("lienzo");
const ctx = canvas.getContext("2d");

// --- 1. ÁLGEBRA VECTORIAL Y MATRICIAL (SIN LIBRERÍAS) ---
const Vec3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ],
  normalize: (v) => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }
};

function mulMat4Vec4(m, v) {
  return [
    m[0]*v[0] + m[1]*v[1] + m[2]*v[2] + m[3]*v[3],
    m[4]*v[0] + m[5]*v[1] + m[6]*v[2] + m[7]*v[3],
    m[8]*v[0] + m[9]*v[1] + m[10]*v[2] + m[11]*v[3],
    m[12]*v[0] + m[13]*v[1] + m[14]*v[2] + m[15]*v[3]
  ];
}

function mulMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
    }
  }
  return out;
}

const Mat4 = {
  translation: (tx, ty, tz) => [
    1, 0, 0, tx,
    0, 1, 0, ty,
    0, 0, 1, tz,
    0, 0, 0, 1
  ],
  rotationY: (a) => [
    Math.cos(a), 0, Math.sin(a), 0,
    0, 1, 0, 0,
    -Math.sin(a), 0, Math.cos(a), 0,
    0, 0, 0, 1
  ],
  rotationZ: (a) => [
    Math.cos(a), -Math.sin(a), 0, 0,
    Math.sin(a),  Math.cos(a), 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ],
  perspective: (fovRad, aspect, near, far) => {
    const f = 1 / Math.tan(fovRad / 2);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), (2 * far * near) / (near - far),
      0, 0, -1, 0
    ];
  }
};

// --- 2. MALLA DE PRUEBA Y PARSER .OBJ ---
function crearBotellaPrueba() {
  // Perfil simple (radio, altura y)
  const perfil = [
    [0.01, -1.4], [0.55, -1.4], [0.58, -0.3], [0.48, 0.1],
    [0.56,  0.5], [0.22,  0.95], [0.22, 1.35], [0.01, 1.35]
  ];
  const segs = 20;
  const vertices = [];
  const faces = [];

  for (let i = 0; i < perfil.length; i++) {
    const [r, y] = perfil[i];
    for (let j = 0; j < segs; j++) {
      const theta = (j / segs) * Math.PI * 2;
      vertices.push([r * Math.cos(theta), y, r * Math.sin(theta)]);
    }
  }
  for (let i = 0; i < perfil.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const next = (j + 1) % segs;
      const a = i * segs + j;
      const b = i * segs + next;
      const c = (i + 1) * segs + next;
      const d = (i + 1) * segs + j;
      faces.push([a, b, c], [a, c, d]);
    }
  }
  return { vertices, faces };
}

function parseOBJ(texto) {
  const vertices = [];
  const faces = [];
  for (const linea of texto.split("\n")) {
    const partes = linea.trim().split(/\s+/);
    if (partes[0] === "v") {
      vertices.push([parseFloat(partes[1]), parseFloat(partes[2]), parseFloat(partes[3])]);
    } else if (partes[0] === "f") {
      const idx = partes.slice(1).map(tok => parseInt(tok.split("/")[0], 10) - 1);
      for (let i = 1; i < idx.length - 1; i++) {
        faces.push([idx[0], idx[i], idx[i + 1]]);
      }
    }
  }
  return { vertices, faces };
}

let malla = crearBotellaPrueba();

document.getElementById("objInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => { malla = parseOBJ(ev.target.result); };
  reader.readAsText(file);
});

// --- 3. PIPELINE DE RENDERIZADO E ILUMINACIÓN RGB ---
function hexToRgbNorm(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

let t = 0;
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const animar = document.getElementById("chkAnim").checked;
  if (animar) t += 0.02;

  // Matriz Modelo: rotación + ligero balanceo y traslación hacia cámara (z = -4.5)
  const rotY = Mat4.rotationY(t);
  const rotZ = Mat4.rotationZ(Math.sin(t * 1.5) * 0.25);
  const trans = Mat4.translation(Math.sin(t) * 0.5, Math.cos(t * 2) * 0.15, -4.5);
  const modelView = mulMat4(trans, mulMat4(rotY, rotZ));
  const proj = Mat4.perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 100);

  // Transformar vértices a espacio de cámara/mundo
  const vCam = malla.vertices.map(v => {
    const p = mulMat4Vec4(modelView, [v[0], v[1], v[2], 1]);
    return [p[0], p[1], p[2]];
  });

  // Parámetros de luz y material (botella azul translúcida/plástico)
  const useAmb = document.getElementById("chkAmb").checked;
  const useDif = document.getElementById("chkDif").checked;
  const useEsp = document.getElementById("chkEsp").checked;

  const Ia = parseFloat(document.getElementById("iaSlider").value);
  const ambRGB = hexToRgbNorm(document.getElementById("ambColor").value);
  const lightPos = [
    parseFloat(document.getElementById("lightX").value),
    parseFloat(document.getElementById("lightY").value),
    -1.5
  ];

  // Coeficientes del objeto (RGB)
  const ka = [0.15, 0.45, 0.85];
  const kd = [0.20, 0.55, 0.95];
  const ks = [0.90, 0.95, 1.00];
  const Il = [1.0, 1.0, 1.0]; // Luz blanca principal
  const shininess = 32;

  const triangulosRender = [];

  for (const [i0, i1, i2] of malla.faces) {
    const p0 = vCam[i0], p1 = vCam[i1], p2 = vCam[i2];
    const centro = [
      (p0[0] + p1[0] + p2[0]) / 3,
      (p0[1] + p1[1] + p2[1]) / 3,
      (p0[2] + p1[2] + p2[2]) / 3
    ];

    // Normal de cara
    const N = Vec3.normalize(Vec3.cross(Vec3.sub(p1, p0), Vec3.sub(p2, p0)));
    // Vector hacia cámara (cámara en 0,0,0)
    const V = Vec3.normalize(Vec3.scale(centro, -1));

    // Backface culling
    if (Vec3.dot(N, V) <= 0) continue;

    // Vector hacia fuente de luz L y reflejo R
    const L = Vec3.normalize(Vec3.sub(lightPos, centro));
    const nDotL = Math.max(0, Vec3.dot(N, L));
    const R = Vec3.normalize(Vec3.sub(Vec3.scale(N, 2 * Vec3.dot(N, L)), L));
    const specFactor = Math.pow(Math.max(0, Vec3.dot(R, V)), shininess);

    // Cálculo RGB por canal (Ambiental + Difusa + Especular)
    const rgb = [0, 1, 2].map(c => {
      const cAmb = useAmb ? (Ia * ambRGB[c] * ka[c]) : 0;
      const cDif = useDif ? (Il[c] * kd[c] * nDotL) : 0;
      const cEsp = useEsp ? (Il[c] * ks[c] * specFactor) : 0;
      return Math.min(255, Math.round((cAmb + cDif + cEsp) * 255));
    });

    // Proyección perspectiva a pantalla 2D
    const pts2D = [p0, p1, p2].map(p => {
      const clip = mulMat4Vec4(proj, [p[0], p[1], p[2], 1]);
      const ndcX = clip[0] / clip[3];
      const ndcY = clip[1] / clip[3];
      return [
        (ndcX + 1) * 0.5 * canvas.width,
        (1 - ndcY) * 0.5 * canvas.height
      ];
    });

    triangulosRender.push({ pts2D, z: centro[2], color: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` });
  }

  // Painter's algorithm (ordenar de más lejano a más cercano)
  triangulosRender.sort((a, b) => a.z - b.z);

  for (const tri of triangulosRender) {
    ctx.beginPath();
    ctx.moveTo(tri.pts2D[0][0], tri.pts2D[0][1]);
    ctx.lineTo(tri.pts2D[1][0], tri.pts2D[1][1]);
    ctx.lineTo(tri.pts2D[2][0], tri.pts2D[2][1]);
    ctx.closePath();
    ctx.fillStyle = tri.color;
    ctx.fill();
    ctx.strokeStyle = tri.color; // Evita líneas negras entre triángulos
    ctx.stroke();
  }

  requestAnimationFrame(render);
}

render();