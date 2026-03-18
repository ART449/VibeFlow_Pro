/**
 * Colmena ByFlow — Escena Three.js principal
 * Setup de cámara, luces, renderer y loop de animación
 */

let scene, camera, renderer, clock;
let characters = {};  // id -> { group, bots: [], state }
let animationId;

function initScene(container, THREE, OrbitControls, VoxelChar, agentConfigs) {
  clock = new THREE.Clock();

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.Fog(0x0a0a0f, 8, 18);

  // Camera
  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 3, 7);
  camera.lookAt(0, 1, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI * 0.6;
  controls.minDistance = 3;
  controls.maxDistance = 12;
  controls.target.set(0, 1, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
  mainLight.position.set(5, 8, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 20;
  mainLight.shadow.camera.left = -6;
  mainLight.shadow.camera.right = 6;
  mainLight.shadow.camera.top = 6;
  mainLight.shadow.camera.bottom = -6;
  mainLight.shadow.bias = -0.001;
  scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.3);
  rimLight.position.set(-3, 4, -5);
  scene.add(rimLight);

  const pinkLight = new THREE.PointLight(0xff2d78, 0.4, 10);
  pinkLight.position.set(3, 2, 3);
  scene.add(pinkLight);

  // Floor grid
  const gridHelper = new THREE.GridHelper(12, 24, 0x1a1a25, 0x111118);
  scene.add(gridHelper);

  // Floor plane (recibe sombras)
  const floorGeo = new THREE.PlaneGeometry(12, 12);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0f,
    roughness: 1,
    metalness: 0
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Crear personajes + flotillas
  for (const cfg of agentConfigs) {
    const charGroup = VoxelChar.createCharacter(THREE, cfg);
    charGroup.position.set(cfg.position.x, 0, cfg.position.z);
    scene.add(charGroup);

    // Flotilla de bots
    const bots = [];
    for (let i = 0; i < (cfg.botCount || 3); i++) {
      const bot = VoxelChar.createBot(THREE, cfg.color, i);
      bot.position.set(cfg.position.x, 0.3, cfg.position.z);
      scene.add(bot);
      bots.push(bot);
    }

    // Nombre label (sprite)
    const label = createLabel(THREE, cfg.name, cfg.color);
    label.position.set(cfg.position.x, 2.2, cfg.position.z);
    scene.add(label);

    characters[cfg.id] = {
      group: charGroup,
      bots,
      state: 'idle',
      color: cfg.color
    };
  }

  // Resize handler
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  // Animation loop
  function animate() {
    animationId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    controls.update();
    animateCharacters(t);
    renderer.render(scene, camera);
  }
  animate();

  return { scene, camera, renderer, characters };
}

/**
 * Crea texto label como sprite
 */
function createLabel(THREE, text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 24px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
  ctx.fillText(text, 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8 });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.2, 0.3, 1);
  return sprite;
}

/**
 * Anima personajes según su estado
 */
function animateCharacters(t) {
  for (const [id, char] of Object.entries(characters)) {
    const { group, bots, state } = char;

    // Idle: float suave
    if (state === 'idle') {
      group.position.y = Math.sin(t * 1.5 + group.position.x) * 0.05;
      group.rotation.y = Math.sin(t * 0.3 + group.position.x * 2) * 0.1;
    }

    // Working: rotar + pulsar
    if (state === 'working') {
      group.position.y = Math.sin(t * 3) * 0.08;
      group.rotation.y += 0.02;

      // Brazos se mueven
      const leftArm = group.getObjectByName('leftArm');
      const rightArm = group.getObjectByName('rightArm');
      if (leftArm) leftArm.rotation.x = Math.sin(t * 4) * 0.5;
      if (rightArm) rightArm.rotation.x = Math.sin(t * 4 + Math.PI) * 0.5;
    }

    // Error: flash
    if (state === 'error') {
      group.visible = Math.floor(t * 6) % 2 === 0;
    } else {
      group.visible = true;
    }

    // Animar flotilla de bots — orbitan alrededor del agente
    for (const bot of bots) {
      const { orbitAngle, orbitSpeed, botIndex } = bot.userData;
      const radius = 0.6 + botIndex * 0.15;
      const angle = orbitAngle + t * orbitSpeed;
      const agentX = group.position.x;
      const agentZ = group.position.z;

      bot.position.x = agentX + Math.cos(angle) * radius;
      bot.position.z = agentZ + Math.sin(angle) * radius;
      bot.position.y = 0.3 + Math.sin(t * 2 + botIndex) * 0.08;
      bot.rotation.y = angle + Math.PI;

      // Bots activos brillan más cuando el agente trabaja
      if (state === 'working') {
        bot.scale.setScalar(0.55 + Math.sin(t * 5 + botIndex) * 0.05);
      } else {
        bot.scale.setScalar(0.5);
      }
    }
  }
}

/**
 * Actualiza estado de un agente (llamado desde IPC)
 */
function setAgentState(agentId, newState) {
  if (characters[agentId]) {
    characters[agentId].state = newState;
  }
}

function dispose() {
  if (animationId) cancelAnimationFrame(animationId);
  if (renderer) renderer.dispose();
}

if (typeof module !== 'undefined') module.exports = { initScene, setAgentState, dispose };
if (typeof window !== 'undefined') window.ColmenaScene = { initScene, setAgentState, dispose };
