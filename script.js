// ========== НАСТРОЙКИ ==========
const BLOCK_TYPES = {
    0: { name: 'Воздух', color: null },
    1: { name: 'Трава', color: 0x7CFC00 },
    2: { name: 'Земля', color: 0x8B4513 },
    3: { name: 'Камень', color: 0x808080 },
    4: { name: 'Дерево', color: 0x8B4513 },
    5: { name: 'Листва', color: 0x228B22 }
};
let currentBlockId = 1; // ID текущего выбранного блока (по умолчанию Трава)

// Размер блока (вокселя)
const BLOCK_SIZE = 1;

// Мир будет храниться в объекте Map для быстрого доступа.
// Ключ: строка "x,y,z", Значение: ID блока.
const world = new Map();

// ========== ИНИЦИАЛИЗАЦИЯ THREE.JS ==========
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87CEEB, 10, 100); // Туман для глубины

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 10, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ========== СВЕТ ==========
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 5);
scene.add(directionalLight);

// ========== УПРАВЛЕНИЕ КАМЕРОЙ ==========
let controlsMode = 'orbit'; // 'orbit' или 'walk'
let orbitControls, pointerLockControls;

// 1. Режим орбиты (вращение вокруг сцены)
orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true; // Плавность
orbitControls.dampingFactor = 0.05;

// 2. Режим ходьбы (от первого лица)
pointerLockControls = new THREE.PointerLockControls(camera, document.body);
pointerLockControls.enabled = false; // Изначально выключен

// Добавляем камеру в сцену для режима ходьбы
const walkCameraGroup = new THREE.Group();
walkCameraGroup.add(camera);
scene.add(walkCameraGroup);
pointerLockControls.getObject = () => walkCameraGroup; // Переопределяем, чтобы управлять группой

// Кнопка переключения режимов
document.getElementById('toggleModeBtn').addEventListener('click', toggleControlsMode);

// Переключение между режимами
function toggleControlsMode() {
    if (controlsMode === 'orbit') {
        controlsMode = 'walk';
        orbitControls.enabled = false;
        pointerLockControls.enabled = true;
        document.body.requestPointerLock(); // Запрашиваем захват курсора
        document.getElementById('crosshair').style.display = 'block';
    } else {
        controlsMode = 'orbit';
        pointerLockControls.enabled = false;
        orbitControls.enabled = true;
        document.exitPointerLock(); // Выходим из захвата
        document.getElementById('crosshair').style.display = 'none';
    }
    updateBlockInfo();
}

// ========== СОЗДАНИЕ МИРА (Генерация простой плоскости и холма) ==========
function generateWorld() {
    const GROUND_HEIGHT = 0;
    const SIZE = 20;

    for (let x = -SIZE; x <= SIZE; x++) {
        for (let z = -SIZE; z <= SIZE; z++) {
            // Основание из земли
            setBlock(x, GROUND_HEIGHT - 1, z, 2); // Земля
            setBlock(x, GROUND_HEIGHT, z, 1);     // Трава сверху

            // Простой холм в центре
            const dist = Math.sqrt(x * x + z * z);
            if (dist < 5) {
                setBlock(x, GROUND_HEIGHT + 1, z, 3); // Камень
            }
            if (dist < 3) {
                setBlock(x, GROUND_HEIGHT + 2, z, 3);
            }
        }
    }
    // Дерево
    setBlock(3, GROUND_HEIGHT + 1, 3, 4); // Ствол
    setBlock(3, GROUND_HEIGHT + 2, 3, 4);
    setBlock(3, GROUND_HEIGHT + 3, 3, 4);
    // Листва
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = 0; dy <= 2; dy++) {
                if (!(dx === 0 && dz === 0 && dy < 2)) { // Не ставить листву внутри ствола
                    setBlock(3 + dx, GROUND_HEIGHT + 3 + dy, 3 + dz, 5);
                }
            }
        }
    }
}

// Функция для установки блока в мир (в памяти) и на сцену (визуально)
function setBlock(x, y, z, typeId) {
    const key = `${x},${y},${z}`;

    // Удаляем старый блок с сцены, если он был
    const oldBlock = world.get(key);
    if (oldBlock && oldBlock.mesh) {
        scene.remove(oldBlock.mesh);
        oldBlock.mesh.geometry.dispose();
        oldBlock.mesh.material.dispose();
    }

    if (typeId === 0 || !BLOCK_TYPES[typeId]) {
        // Если это воздух или несуществующий тип - удаляем из мира
        world.delete(key);
        return;
    }

    // Создаём новый блок
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const material = new THREE.MeshLambertMaterial({ color: BLOCK_TYPES[typeId].color });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(x, y, z);
    scene.add(cube);

    // Сохраняем в мир
    world.set(key, { typeId, mesh: cube });
}

// Получить блок по координатам
function getBlock(x, y, z) {
    return world.get(`${x},${y},${z}`);
}

// ========== ВЗАИМОДЕЙСТВИЕ (Размещение/Удаление блоков) ==========
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Функция для получения блока, на который смотрит игрок
function getTargetedBlock() {
    // Устанавливаем луч из камеры в направлении курсора (центра экрана)
    raycaster.setFromCamera(mouse, camera);

    // Получаем список пересечений луча с объектами сцены (нашими блоками)
    const intersects = raycaster.intersectObjects(Array.from(world.values()).map(data => data.mesh));

    if (intersects.length > 0) {
        return intersects[0];
    }
    return null;
}

// Обработка кликов (только в режиме ходьбы)
renderer.domElement.addEventListener('click', (event) => {
    if (controlsMode !== 'walk' || !pointerLockControls.enabled) return;

    const intersect = getTargetedBlock();
    if (!intersect) return;

    const point = intersect.point;
    const normal = intersect.face.normal;

    // Координаты блока, в который попал луч
    const targetBlock = intersect.object.position;

    if (event.button === 0) { // Левая кнопка мыши - УДАЛИТЬ блок
        // Вычисляем координаты удаляемого блока
        const x = Math.round(targetBlock.x);
        const y = Math.round(targetBlock.y);
        const z = Math.round(targetBlock.z);
        setBlock(x, y, z, 0); // Заменяем на воздух

    } else if (event.button === 2) { // Правая кнопка мыши - ПОСТАВИТЬ блок
        // Вычисляем координаты соседней ячейки (куда ставить новый блок)
        const x = Math.round(targetBlock.x + normal.x);
        const y = Math.round(targetBlock.y + normal.y);
        const z = Math.round(targetBlock.z + normal.z);
        setBlock(x, y, z, currentBlockId);
    }
});

// Запрещаем контекстное меню (правый клик) на canvas
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ========== УПРАВЛЕНИЕ ВЫБОРОМ БЛОКА ==========
document.addEventListener('keydown', (event) => {
    const num = parseInt(event.key);
    if (num >= 1 && num <= 5) {
        currentBlockId = num;
        updateBlockInfo();
    }
});

function updateBlockInfo() {
    const blockName = BLOCK_TYPES[currentBlockId]?.name || 'Неизвестно';
    document.getElementById('currentBlock').textContent = `${blockName} (ID: ${currentBlockId})`;
    document.getElementById('blockInfo').style.backgroundColor = controlsMode === 'walk' ? 'rgba(0, 50, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)';
}

// ========== УПРАВЛЕНИЕ ДВИЖЕНИЕМ В РЕЖИМЕ ХОДЬБЫ ==========
const moveState = { forward: false, backward: false, left: false, right: false, up: false, down: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const SPEED = 0.1;
const GRAVITY = -0.002;
const JUMP_FORCE = 0.15;
let isOnGround = false;
let verticalVelocity = 0;

document.addEventListener('keydown', (event) => {
    if (controlsMode !== 'walk' || !pointerLockControls.enabled) return;
    switch (event.code) {
        case 'KeyW': moveState.forward = true; break;
        case 'KeyS': moveState.backward = true; break;
        case 'KeyA': moveState.left = true; break;
        case 'KeyD': moveState.right = true; break;
        case 'Space': if (isOnGround) verticalVelocity = JUMP_FORCE; break; // Прыжок
    }
});

document.addEventListener('keyup', (event) => {
    if (controlsMode !== 'walk' || !pointerLockControls.enabled) return;
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyD': moveState.right = false; break;
    }
});

function updateMovement() {
    if (controlsMode !== 'walk' || !pointerLockControls.enabled) return;

    velocity.set(0, 0, 0);
    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();

    // Движение относительно взгляда камеры
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    const rightVector = new THREE.Vector3().crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

    velocity.add(cameraDirection.multiplyScalar(direction.z * SPEED));
    velocity.add(rightVector.multiplyScalar(direction.x * SPEED));

    // Применяем гравитацию
    verticalVelocity += GRAVITY;
    velocity.y = verticalVelocity;

    // Простая проверка столкновений с "землей"
    const camPos = walkCameraGroup.position.clone().add(velocity);
    const checkY = Math.round(camPos.y - 1); // Предполагаемая высота ног игрока

    // Проверяем, есть ли блок под ногами
    const blockUnder = getBlock(Math.round(camPos.x), checkY, Math.round(camPos.z));
    isOnGround = !!blockUnder && blockUnder.typeId !== 0;

    if (isOnGround && verticalVelocity < 0) {
        verticalVelocity = 0;
        camPos.y = checkY + 2; // Ставим игрока на верх блока
    }

    // Применяем движение
    walkCameraGroup.position.add(velocity);
}

// ========== ОСНОВНОЙ ЦИКЛ ==========
function animate() {
    requestAnimationFrame(animate);
    updateMovement();
    if (controlsMode === 'orbit') {
        orbitControls.update();
    }
    renderer.render(scene, camera);
}

// ========== ЗАПУСК ==========
generateWorld();
updateBlockInfo();
animate();

// Обработка изменения размера окна
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
