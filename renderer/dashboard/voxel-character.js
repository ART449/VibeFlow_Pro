/**
 * Colmena ByFlow — Generador de personajes 3D Voxel
 * Procedural — cero assets externos
 */

const VOXEL_SIZE = 0.12;

/**
 * Crea un cubo voxel
 */
function createVoxel(THREE, color, x, y, z, size = VOXEL_SIZE) {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x * size, y * size, z * size);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Crea un bloque de voxels (cuerpo, cabeza, etc)
 */
function createBlock(THREE, color, w, h, d, offsetX = 0, offsetY = 0, offsetZ = 0) {
  const group = new THREE.Group();
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        // Solo exterior (optimización)
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1) {
          group.add(createVoxel(THREE, color, x + offsetX, y + offsetY, z + offsetZ));
        }
      }
    }
  }
  return group;
}

/**
 * Genera un personaje voxel completo
 * @param {THREE} THREE - Three.js module
 * @param {Object} config - { color, accentColor, emoji, accessory }
 * @returns {THREE.Group} personaje completo con partes nombradas
 */
function createCharacter(THREE, config) {
  const { color, accentColor, accessory } = config;
  const character = new THREE.Group();

  // Cabeza (3x3x3)
  const head = createBlock(THREE, color, 3, 3, 3, -1, 8, -1);
  head.name = 'head';
  character.add(head);

  // Ojos (2 voxels blancos + 2 negros)
  const eyeL = createVoxel(THREE, 0xffffff, -1, 9, 2);
  const eyeR = createVoxel(THREE, 0xffffff, 1, 9, 2);
  const pupilL = createVoxel(THREE, 0x111111, -1, 9, 2, VOXEL_SIZE * 0.5);
  const pupilR = createVoxel(THREE, 0x111111, 1, 9, 2, VOXEL_SIZE * 0.5);
  pupilL.position.z += VOXEL_SIZE * 0.3;
  pupilR.position.z += VOXEL_SIZE * 0.3;
  character.add(eyeL, eyeR, pupilL, pupilR);

  // Boca
  const mouth = createVoxel(THREE, 0x333333, 0, 8, 2, VOXEL_SIZE * 0.6);
  mouth.position.z += VOXEL_SIZE * 0.3;
  character.add(mouth);

  // Cuerpo (3x4x2)
  const body = createBlock(THREE, color, 3, 4, 2, -1, 4, 0);
  body.name = 'body';
  character.add(body);

  // Brazos (1x3x1) — con pivote para animación
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-2 * VOXEL_SIZE, 7 * VOXEL_SIZE, 0.5 * VOXEL_SIZE);
  leftArmPivot.name = 'leftArm';
  const leftArm = createBlock(THREE, color, 1, 3, 1, 0, -3, 0);
  leftArmPivot.add(leftArm);
  character.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(2 * VOXEL_SIZE, 7 * VOXEL_SIZE, 0.5 * VOXEL_SIZE);
  rightArmPivot.name = 'rightArm';
  const rightArm = createBlock(THREE, color, 1, 3, 1, 0, -3, 0);
  rightArmPivot.add(rightArm);
  character.add(rightArmPivot);

  // Piernas (1x3x1)
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.5 * VOXEL_SIZE, 4 * VOXEL_SIZE, 0.5 * VOXEL_SIZE);
  leftLegPivot.name = 'leftLeg';
  const leftLeg = createBlock(THREE, accentColor || 0x333333, 1, 3, 1, 0, -3, 0);
  leftLegPivot.add(leftLeg);
  character.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.5 * VOXEL_SIZE, 4 * VOXEL_SIZE, 0.5 * VOXEL_SIZE);
  rightLegPivot.name = 'rightLeg';
  const rightLeg = createBlock(THREE, accentColor || 0x333333, 1, 3, 1, 0, -3, 0);
  rightLegPivot.add(rightLeg);
  character.add(rightLegPivot);

  // Accesorio distintivo
  if (accessory === 'glasses') {
    // Clip Flow — lentes
    const glassL = createVoxel(THREE, 0xaaddff, -1, 9.5, 2.2, VOXEL_SIZE * 0.8);
    const glassR = createVoxel(THREE, 0xaaddff, 1, 9.5, 2.2, VOXEL_SIZE * 0.8);
    const bridge = createVoxel(THREE, 0x888888, 0, 9.5, 2.2, VOXEL_SIZE * 0.3);
    glassL.position.z += VOXEL_SIZE * 0.4;
    glassR.position.z += VOXEL_SIZE * 0.4;
    bridge.position.z += VOXEL_SIZE * 0.4;
    character.add(glassL, glassR, bridge);
  } else if (accessory === 'headphones') {
    // GFlow / Robot DJ — audífonos
    const hpL = createVoxel(THREE, accentColor, -1.5, 10, 0, VOXEL_SIZE * 1.2);
    const hpR = createVoxel(THREE, accentColor, 1.5, 10, 0, VOXEL_SIZE * 1.2);
    const band = createBlock(THREE, 0x444444, 4, 1, 1, -1.5, 11, 0);
    character.add(hpL, hpR, band);
  } else if (accessory === 'hat') {
    // Michi — sombrero
    const brim = createBlock(THREE, 0x444444, 5, 1, 5, -2, 11, -2);
    const top = createBlock(THREE, 0x555555, 3, 2, 3, -1, 12, -1);
    character.add(brim, top);
  } else if (accessory === 'cap') {
    // Bolita DJ — gorra
    const cap = createBlock(THREE, accentColor, 4, 1, 3, -1.5, 11, -1);
    const visor = createBlock(THREE, accentColor, 3, 1, 1, -1, 10.5, 2);
    character.add(cap, visor);
  } else if (accessory === 'antenna') {
    // Robot DJ — antena
    const pole = createBlock(THREE, 0xcccccc, 1, 3, 1, 0, 11, 0);
    const tip = createVoxel(THREE, 0xff0000, 0, 14, 0, VOXEL_SIZE * 0.8);
    character.add(pole, tip);
  }

  // Plataforma
  const platformGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.06, 16);
  const platformMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: 0.4
  });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.y = VOXEL_SIZE * 0.5;
  platform.receiveShadow = true;
  platform.name = 'platform';
  character.add(platform);

  // Escalar todo
  character.scale.setScalar(0.8);

  return character;
}

/**
 * Crea un bot pequeño (mini voxel subordinado)
 */
function createBot(THREE, color, index) {
  const bot = new THREE.Group();
  const size = VOXEL_SIZE * 0.6;

  // Cuerpo simple (2x2x2)
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      for (let z = 0; z < 2; z++) {
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.2,
          transparent: true,
          opacity: 0.8
        });
        const v = new THREE.Mesh(geo, mat);
        v.position.set(x * size, y * size, z * size);
        v.castShadow = true;
        bot.add(v);
      }
    }
  }

  // Ojo
  const eyeGeo = new THREE.BoxGeometry(size * 0.4, size * 0.4, size * 0.2);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(size * 0.5, size * 1.2, size * 1.1);
  bot.add(eye);

  bot.scale.setScalar(0.5);
  bot.userData = { botIndex: index, orbitAngle: (index / 3) * Math.PI * 2, orbitSpeed: 0.5 + Math.random() * 0.5 };

  return bot;
}

// Export for use with import maps or require
if (typeof module !== 'undefined') module.exports = { createCharacter, createBot };
if (typeof window !== 'undefined') window.VoxelCharacter = { createCharacter, createBot };
