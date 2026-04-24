import * as THREE from 'three';
import { GAME_CONFIG } from './constants';

const SOUNDS = {
    JUMP: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
    COIN: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
    CRASH: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
    SLIDE: 'https://assets.mixkit.co/active_storage/sfx/1103/1103-preview.mp3',
    AMBIENCE: 'https://assets.mixkit.co/active_storage/sfx/2816/2816-preview.mp3', // Jungle sounds
    RAIN: 'https://assets.mixkit.co/active_storage/sfx/2453/2453-preview.mp3', // Rain ambience
    POWERUP: 'https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3',
    SHIELD_UP: 'https://assets.mixkit.co/active_storage/sfx/1103/1103-preview.mp3',
    LAND: 'https://assets.mixkit.co/active_storage/sfx/1103/1103-preview.mp3',
    STEP: 'https://assets.mixkit.co/active_storage/sfx/2818/2818-preview.mp3',
    WHOOSH: 'https://assets.mixkit.co/active_storage/sfx/1131/1131-preview.mp3',
    BIRD_1: 'https://assets.mixkit.co/active_storage/sfx/12/12-preview.mp3',
    BIRD_2: 'https://assets.mixkit.co/active_storage/sfx/13/13-preview.mp3',
    WIND: 'https://assets.mixkit.co/active_storage/sfx/1131/1131-preview.mp3',
    MONKEY: 'https://assets.mixkit.co/active_storage/sfx/33/33-preview.mp3',
    RUSTLE: 'https://assets.mixkit.co/active_storage/sfx/2818/2818-preview.mp3'
};

class SoundManager {
    private sounds: { [key: string]: HTMLAudioElement } = {};
    private isMuted: boolean = false;

    constructor(onProgress?: (progress: number) => void) {
        let loadedCount = 0;
        const totalCount = Object.keys(SOUNDS).length;
        
        Object.entries(SOUNDS).forEach(([key, url]) => {
            const audio = new Audio();
            audio.src = url;
            audio.preload = 'auto';
            
            const onLoaded = () => {
                loadedCount++;
                if (onProgress) onProgress(loadedCount / totalCount);
                audio.removeEventListener('canplaythrough', onLoaded);
            };
            
            audio.addEventListener('canplaythrough', onLoaded);
            this.sounds[key] = audio;
            
            if (key === 'AMBIENCE' || key === 'RAIN') {
                audio.loop = true;
                audio.volume = key === 'RAIN' ? 0 : 0.3;
            }
        });

        // Fallback for cached or local files if event doesn't fire
        setTimeout(() => {
            if (loadedCount < totalCount && onProgress) {
                onProgress(1);
            }
        }, 3000);
    }

    public play(key: keyof typeof SOUNDS) {
        if (this.isMuted) return;
        const sound = this.sounds[key];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {}); // Catch browser autoplay blocks
        }
    }

    public setRainVolume(volume: number) {
        if (this.sounds.RAIN) {
            this.sounds.RAIN.volume = this.isMuted ? 0 : volume * 0.4;
            if (volume > 0.01 && this.sounds.RAIN.paused && !this.isMuted) {
                this.sounds.RAIN.play().catch(() => {});
            } else if (volume <= 0.01 && !this.sounds.RAIN.paused) {
                this.sounds.RAIN.pause();
            }
        }
    }

    public startAmbience() {
        if (!this.isMuted) this.sounds.AMBIENCE.play().catch(() => {});
    }

    public stopAmbience() {
        this.sounds.AMBIENCE.pause();
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) this.stopAmbience();
        else this.startAmbience();
        return this.isMuted;
    }

    public playRandomAmbient() {
        if (this.isMuted) return;
        const ambients: (keyof typeof SOUNDS)[] = ['BIRD_1', 'BIRD_2', 'WIND', 'MONKEY', 'RUSTLE'];
        const randomKey = ambients[Math.floor(Math.random() * ambients.length)];
        const sound = this.sounds[randomKey];
        if (sound) {
            sound.currentTime = 0;
            // Lower volume for background variety
            sound.volume = 0.1 + Math.random() * 0.1;
            sound.play().catch(() => {});
        }
    }
}

export class GameEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;
  private sounds: SoundManager;

  // Materials for dynamic updating
  private bodyMat: THREE.MeshPhongMaterial;
  private limbMat: THREE.MeshPhongMaterial;

  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;

  // Weather System
  private currentWeather: 'CLEAR' | 'RAIN' | 'FOG' = 'CLEAR';
  private weatherTimer: number = 20;
  private rainPoints: THREE.Points | null = null;
  private lightningChance: number = 0;
  private flashIntensity: number = 0;
  private lensDroplets: THREE.Group | null = null;

  // Game State
  public isRunning: boolean = false;
  public speed: number = GAME_CONFIG.INITIAL_SPEED;
  public distance: number = 0;
  public coins: number = 0;

  // Objects
  private player: THREE.Group;
  private playerModel: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private pathChunks: THREE.Group[] = [];
  private obstacles: THREE.Object3D[] = [];
  private coinsGroup: THREE.Object3D[] = [];
  private particles: { mesh: THREE.Mesh; life: number; velocity: THREE.Vector3 }[] = [];
  private shiftingStructures: { mesh: THREE.Mesh; baseY: number; phase: number; speed: number }[] = [];
  private swayables: { mesh: THREE.Mesh; baseRotation: THREE.Euler; phase: number; speed: number }[] = [];
  private godRaysGroup: THREE.Group[] = [];
  private fallingLeaves: { mesh: THREE.Mesh; velocity: THREE.Vector3; rotSpeed: number }[] = [];
  private butterflies: { mesh: THREE.Group; phase: number; speed: number; orbit: number; center: THREE.Vector3 }[] = [];
  private birds: { mesh: THREE.Group; velocity: THREE.Vector3 }[] = [];
  private fireflies: { mesh: THREE.Mesh; phase: number; speed: number; center: THREE.Vector3 }[] = [];
  private mists: THREE.Mesh[] = [];
  private invincibilityTimer: number = 0;
  private lives: number = 1;

  // Power-ups State
  private shieldTimer: number = 0;
  private magnetTimer: number = 0;
  private boostTimer: number = 0;
  private powerupItems: THREE.Object3D[] = [];

  // Power-up Visuals
  private shieldMesh: THREE.Mesh | null = null;
  private magnetAura: THREE.Mesh | null = null;
  private boostTrail: THREE.Points | null = null;
  private shadow: THREE.Mesh | null = null;

  // Player state
  private targetLane: number = 1; // 0, 1, 2
  private currentLanePos: number = 0;
  private playerY: number = 1;
  private playerVelocityY: number = 0;
  private isJumping: boolean = false;
  private isSliding: boolean = false;
  private slideTimer: number = 0;

  // Callbacks
  public onGameOver: (score: number, coins: number) => void = () => {};
  public onCoinCollect: () => void = () => {};

  private gameTime: number = 0;
  private dayTime: number = 0; // 0 to 1 cycle
  private dayScale: number = 0.01; // Cycle speed
  private ambientSoundTimer: number = 5;

  public onLoadingProgress?: (progress: number) => void;

  constructor(container: HTMLElement, onProgress?: (p: number) => void) {
    this.onLoadingProgress = onProgress;
    
    // Step 0: Setup sounds first as they are our primary "heavy" assets (70% of total)
    this.sounds = new SoundManager((p) => {
        if (this.onLoadingProgress) {
            this.onLoadingProgress(p * 0.7);
        }
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a2e24); // Dark jungle teal
    this.scene.fog = new THREE.FogExp2(0x1a2e24, 0.02);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 8); // Behind and above
    this.camera.lookAt(0, 2, -10);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    this.initLights();
    this.initWeather();
    
    // Step 1: Environment items (remaining 30%)
    if (this.onLoadingProgress) this.onLoadingProgress(0.8);
    this.initPlayer();
    if (this.onLoadingProgress) this.onLoadingProgress(0.9);
    this.initEnvironment();
    if (this.onLoadingProgress) this.onLoadingProgress(1.0);

    window.addEventListener('resize', () => this.handleResize(container));

    this.animate();
  }

  private initLights() {
    this.ambientLight = new THREE.AmbientLight(0xbde8bd, 0.4); // Cooler, deeper jungle ambient
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff8e1, 1.5); // Intense warm sunlight
    this.dirLight.position.set(20, 30, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.camera.left = -60;
    this.dirLight.shadow.camera.right = 60;
    this.dirLight.shadow.camera.top = 60;
    this.dirLight.shadow.camera.bottom = -60;
    this.dirLight.shadow.mapSize.width = 4096; // Higher res shadows
    this.dirLight.shadow.mapSize.height = 4096;
    this.dirLight.shadow.bias = -0.0005; // Fix shadow acne
    this.scene.add(this.dirLight);
  }

  private initPlayer() {
    this.player = new THREE.Group();

    this.bodyMat = new THREE.MeshPhongMaterial({ color: 0xff4444 });
    this.limbMat = new THREE.MeshPhongMaterial({ color: 0xff4444, shininess: 50 });
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xffccaa });
    const hairMat = new THREE.MeshPhongMaterial({ color: 0x3d2b1f });
    const detailMat = new THREE.MeshPhongMaterial({ color: 0x333333 });

    // Torso (Humanoid shape)
    const torsoGeom = new THREE.CapsuleGeometry(0.35, 0.7, 4, 8);
    this.playerModel = new THREE.Mesh(torsoGeom, this.bodyMat);
    this.playerModel.castShadow = true;
    this.playerModel.position.set(0, 1.45, 0);
    this.player.add(this.playerModel);

    // Explorer Backpack
    const packGeom = new THREE.BoxGeometry(0.5, 0.6, 0.3);
    const backpack = new THREE.Mesh(packGeom, new THREE.MeshPhongMaterial({ color: 0x4b3621 }));
    backpack.position.set(0, 1.5, -0.3);
    this.player.add(backpack);

    // Explorer Belt & Buckle (Human Detail)
    const beltGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 16);
    const belt = new THREE.Mesh(beltGeom, detailMat);
    belt.position.set(0, 1.2, 0);
    this.player.add(belt);

    const buckleGeom = new THREE.BoxGeometry(0.15, 0.12, 0.05);
    const buckle = new THREE.Mesh(buckleGeom, new THREE.MeshPhongMaterial({ color: 0xffd700 })); // Golden buckle
    buckle.position.set(0, 1.2, 0.38);
    this.player.add(buckle);

    // Head
    const headGeom = new THREE.SphereGeometry(0.32, 12, 12);
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.set(0, 2.1, 0);
    this.player.add(head);

    // Eyes
    const eyeGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.12, 2.15, 0.28);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.12, 2.15, 0.28);
    this.player.add(leftEye, rightEye);

    // Nose
    const noseGeom = new THREE.BoxGeometry(0.06, 0.1, 0.08);
    const nose = new THREE.Mesh(noseGeom, skinMat);
    nose.position.set(0, 2.05, 0.3);
    this.player.add(nose);

    // Ears
    const earGeom = new THREE.BoxGeometry(0.05, 0.1, 0.05);
    const lEar = new THREE.Mesh(earGeom, skinMat);
    lEar.position.set(-0.33, 2.1, 0);
    const rEar = new THREE.Mesh(earGeom, skinMat);
    rEar.position.set(0.33, 2.1, 0);
    this.player.add(lEar, rEar);

    // Hair
    const hairGeom = new THREE.BoxGeometry(0.42, 0.15, 0.42);
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.set(0, 2.35, 0);
    this.player.add(hair);

    // Legs
    const legGeom = new THREE.CapsuleGeometry(0.12, 0.6, 4, 8);
    this.leftLeg = new THREE.Mesh(legGeom, this.limbMat);
    this.leftLeg.position.set(-0.2, 0.6, 0);
    this.player.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeom, this.limbMat);
    this.rightLeg.position.set(0.2, 0.6, 0);
    this.player.add(this.rightLeg);

    // Shoes
    const shoeGeom = new THREE.BoxGeometry(0.22, 0.15, 0.35);
    const leftShoe = new THREE.Mesh(shoeGeom, detailMat);
    leftShoe.position.set(-0.2, 0.1, 0.1);
    this.player.add(leftShoe);
    const rightShoe = new THREE.Mesh(shoeGeom, detailMat);
    rightShoe.position.set(0.2, 0.1, 0.1);
    this.player.add(rightShoe);

    // Arms
    const armGeom = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
    this.leftArm = new THREE.Mesh(armGeom, this.limbMat);
    this.leftArm.position.set(-0.45, 1.7, 0);
    this.player.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeom, this.limbMat);
    this.rightArm.position.set(0.45, 1.7, 0);
    this.player.add(this.rightArm);

    // Fingers (Natural Human Hands)
    for (let i = 0; i < 3; i++) {
        const fingerGeom = new THREE.CapsuleGeometry(0.04, 0.15, 4, 8);
        const lFinger = new THREE.Mesh(fingerGeom, skinMat);
        lFinger.position.set(-0.45 + (i-1)*0.1, 1.3, 0.1);
        this.player.add(lFinger);
        
        const rFinger = new THREE.Mesh(fingerGeom, skinMat);
        rFinger.position.set(0.45 + (i-1)*0.1, 1.3, 0.1);
        this.player.add(rFinger);
    }

    // Shield Visual
    const shieldGeom = new THREE.SphereGeometry(2, 24, 24);
    const shieldMat = new THREE.MeshPhongMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.3,
        side: THREE.DoubleSide,
        emissive: 0x003333
    });
    this.shieldMesh = new THREE.Mesh(shieldGeom, shieldMat);
    this.shieldMesh.position.y = 1.5;
    this.shieldMesh.visible = false;
    this.player.add(this.shieldMesh);

    // Magnet Aura Visual
    const magnetGeom = new THREE.TorusGeometry(2.5, 0.1, 16, 32);
    const magnetMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4 });
    this.magnetAura = new THREE.Mesh(magnetGeom, magnetMat);
    this.magnetAura.rotation.x = Math.PI / 2;
    this.magnetAura.position.y = 1;
    this.magnetAura.visible = false;
    this.player.add(this.magnetAura);

    // Speed Boost Trail
    const trailCount = 100;
    const trailGeom = new THREE.BufferGeometry();
    const trailPos = new Float32Array(trailCount * 3);
    trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.PointsMaterial({ color: 0xffff00, size: 0.2, transparent: true, opacity: 0.8 });
    this.boostTrail = new THREE.Points(trailGeom, trailMat);
    this.boostTrail.visible = false;
    this.scene.add(this.boostTrail);

    // Blob Shadow for depth perception
    const shadowGeom = new THREE.CircleGeometry(0.6, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ 
        color: 0x000000, 
        transparent: true, 
        opacity: 0.4,
        depthWrite: false 
    });
    this.shadow = new THREE.Mesh(shadowGeom, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.05; // Slightly above ground
    this.scene.add(this.shadow);

    this.player.rotation.y = Math.PI; // Face forward (away from camera)
    this.scene.add(this.player);
  }

  public updateSkin(color: number) {
      if (this.bodyMat) this.bodyMat.color.setHex(color);
      if (this.limbMat) this.limbMat.color.setHex(color);
  }

  private initWeather() {
    // Rain Particles
    const rainCount = 1500;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);

    for (let i = 0; i < rainCount; i++) {
        rainPositions[i * 3] = (Math.random() - 0.5) * 40;
        rainPositions[i * 3 + 1] = Math.random() * 20;
        rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }

    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMaterial = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.1,
        transparent: true,
        opacity: 0
    });

    this.rainPoints = new THREE.Points(rainGeometry, rainMaterial);
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);

    // Lens Droplets (3D rain-on-lens effect)
    this.lensDroplets = new THREE.Group();
    for (let i = 0; i < 15; i++) {
        const dropGeom = new THREE.SphereGeometry(0.02, 6, 6);
        const dropMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.4 
        });
        const drop = new THREE.Mesh(dropGeom, dropMat);
        drop.position.set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 1.5,
            -0.5 // Close to camera
        );
        drop.scale.set(1, 1.5, 0.5);
        this.lensDroplets.add(drop);
    }
    this.camera.add(this.lensDroplets);
    this.lensDroplets.visible = false;
  }

  private updateWeather(delta: number) {
    this.weatherTimer -= delta;
    if (this.weatherTimer <= 0) {
        const types: ('CLEAR' | 'RAIN' | 'FOG')[] = ['CLEAR', 'RAIN', 'FOG'];
        this.currentWeather = types[Math.floor(Math.random() * types.length)];
        this.weatherTimer = 20 + Math.random() * 20;
    }

    // Smooth transitions for fog and rain
    let targetFogDensity = 0.02;
    let targetRainOpacity = 0;
    let targetAmbientIntensity = 0.4;

    if (this.currentWeather === 'FOG') {
        targetFogDensity = 0.15; // Much thicker fog
        targetAmbientIntensity = 0.15;
    } else if (this.currentWeather === 'RAIN') {
        targetRainOpacity = 0.6;
        targetAmbientIntensity = 0.25;

        // Lightning / Thunder Flash logic
        this.lightningChance += delta;
        if (this.lightningChance > 5 && Math.random() < 0.02) {
            this.flashIntensity = 2.5;
            this.lightningChance = 0;
            this.sounds.play('CRASH');
        }
    }

    // Flash decay
    if (this.flashIntensity > 0) {
        this.flashIntensity -= delta * 12;
    }

    // Transition density
    const currentFog = this.scene.fog as THREE.FogExp2;
    if (currentFog) {
        currentFog.density += (targetFogDensity - currentFog.density) * delta * 0.5;
    }
    
    // Smooth opacity for volumetric mist patches
    const targetMistOpacity = this.currentWeather === 'FOG' ? 0.3 : 0.05;
    this.mists.forEach(mist => {
        const mat = mist.material as THREE.MeshBasicMaterial;
        mat.opacity += (targetMistOpacity - mat.opacity) * delta * 0.5;
        // Subtle drift
        mist.position.x += Math.sin(Date.now() * 0.001 + mist.position.z) * 0.01;
    });

    // Transition ambient light
    if (this.ambientLight) {
        let intensity = targetAmbientIntensity;
        if (this.flashIntensity > 0) {
            intensity += this.flashIntensity;
        }
        this.ambientLight.intensity += (intensity - this.ambientLight.intensity) * delta * 5;
    }

    // Update God Rays visibility (Atmospheric 3D realism)
    this.godRaysGroup.forEach(rayGroup => {
        const ray = rayGroup.children[0] as THREE.Mesh;
        ray.visible = this.currentWeather === 'CLEAR';
    });

    // Handle Rain
    if (this.rainPoints) {
        const mat = this.rainPoints.material as THREE.PointsMaterial;
        mat.opacity += (targetRainOpacity - mat.opacity) * delta * 0.5;
        this.rainPoints.visible = mat.opacity > 0.01;

        // Sound update
        this.sounds.setRainVolume(mat.opacity);

        // Update Lens Droplets (Virtual 3D effect)
        if (this.lensDroplets) {
            this.lensDroplets.visible = mat.opacity > 0.3;
            this.lensDroplets.children.forEach((drop: any) => {
                drop.position.y -= delta * 0.5; // Droplets sliding down glass
                if (drop.position.y < -1) drop.position.y = 1;
            });
        }

        if (this.rainPoints.visible) {
            const positions = this.rainPoints.geometry.attributes.position.array as Float32Array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] -= 25 * delta; // Fall speed
                if (positions[i + 1] < 0) {
                    positions[i + 1] = 20;
                    positions[i] = (Math.random() - 0.5) * 40;
                    positions[i+2] = (Math.random() - 0.5) * 60;
                }
            }
            this.rainPoints.geometry.attributes.position.needsUpdate = true;
        }
    }
  }

  public setHighlight(isHighlighted: boolean) {
      const targetScale = isHighlighted ? 1.2 : 1.0;
      this.player.scale.set(targetScale, targetScale, targetScale);
  }

  private spawnLeaf() {
      const leafGeom = new THREE.PlaneGeometry(0.2, 0.1);
      const leafMat = new THREE.MeshPhongMaterial({ 
          color: 0x2b5d1a, 
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
      });
      const leaf = new THREE.Mesh(leafGeom, leafMat);
      
      const x = (Math.random() - 0.5) * 20;
      const z = -20 - Math.random() * 40;
      leaf.position.set(x, 10, z);
      
      this.scene.add(leaf);
      this.fallingLeaves.push({
          mesh: leaf,
          velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 1,
              -1 - Math.random() * 2,
              this.speed // Match ground speed roughly
          ),
          rotSpeed: Math.random() * 5
      });
  }

  private spawnBirdInTree(tree: THREE.Group) {
      const bird = new THREE.Group();
      const wingGeom = new THREE.PlaneGeometry(0.3, 0.1);
      const wingMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
      
      const leftWing = new THREE.Mesh(wingGeom, wingMat);
      leftWing.position.x = -0.15;
      const rightWing = new THREE.Mesh(wingGeom, wingMat);
      rightWing.position.x = 0.15;
      
      bird.add(leftWing, rightWing);
      bird.position.set(0, 8.5, 0); // Atop foliage
      bird.userData = { isScared: false, originalPos: bird.position.clone() };
      tree.add(bird);
      this.birds.push({ mesh: bird, velocity: new THREE.Vector3() });
  }

  private spawnButterflies(chunk: THREE.Group) {
      const colors = [0xff00ff, 0x00ffff, 0xffff00];
      const count = 3 + Math.floor(Math.random() * 5);
      const center = new THREE.Vector3((Math.random() - 0.5) * 15, 2 + Math.random() * 3, (Math.random() - 0.5) * 30);

      for (let i = 0; i < count; i++) {
          const bGroup = new THREE.Group();
          const wingGeom = new THREE.PlaneGeometry(0.15, 0.1);
          const wingMat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], side: THREE.DoubleSide });
          
          const lWing = new THREE.Mesh(wingGeom, wingMat);
          lWing.position.x = -0.08;
          const rWing = new THREE.Mesh(wingGeom, wingMat);
          rWing.position.x = 0.08;
          
          bGroup.add(lWing, rWing);
          bGroup.position.copy(center).add(new THREE.Vector3((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2));
          chunk.add(bGroup);
          
          this.butterflies.push({
              mesh: bGroup,
              phase: Math.random() * Math.PI * 2,
              speed: 2 + Math.random() * 3,
              orbit: 0.5 + Math.random() * 1.5,
              center: bGroup.position.clone()
          });
      }
  }

  private spawnFireflies(chunk: THREE.Group) {
      for (let i = 0; i < 8; i++) {
          const fireflyGeom = new THREE.SphereGeometry(0.05, 4, 4);
          const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
          const firefly = new THREE.Mesh(fireflyGeom, fireflyMat);
          
          const center = new THREE.Vector3((Math.random() - 0.5) * 20, 2 + Math.random() * 4, (Math.random() - 0.5) * GAME_CONFIG.CHUNK_SIZE);
          firefly.position.copy(center);
          chunk.add(firefly);
          
          this.fireflies.push({
              mesh: firefly,
              phase: Math.random() * Math.PI * 2,
              speed: 1 + Math.random() * 2,
              center: center
          });
      }
  }

  private spawnPowerupsForChunk(chunk: THREE.Group) {
      const types: ('SHIELD' | 'MAGNET' | 'BOOST')[] = ['SHIELD', 'MAGNET', 'BOOST'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      const laneIndex = Math.floor(Math.random() * 3);
      const zOffset = (Math.random() - 0.5) * (GAME_CONFIG.CHUNK_SIZE * 0.5);
      
      const group = new THREE.Group();
      group.userData = { type };

      let geom: THREE.BufferGeometry;
      let color: number;

      if (type === 'SHIELD') {
          geom = new THREE.OctahedronGeometry(0.8);
          color = 0x00ffff;
      } else if (type === 'MAGNET') {
          geom = new THREE.TorusGeometry(0.6, 0.2, 8, 16);
          color = 0xff0000;
      } else { // BOOST
          geom = new THREE.ConeGeometry(0.6, 1.2, 4);
          color = 0xffff00;
      }

      const mesh = new THREE.Mesh(geom, new THREE.MeshPhongMaterial({ 
          color, 
          emissive: color,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.9 
      }));
      group.add(mesh);

      // Pulse aura
      const aura = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 12, 12),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 })
      );
      group.add(aura);

      const xPos = (laneIndex - 1) * 3;
      group.position.set(xPos, 1.5, zOffset);
      chunk.add(group);
      this.powerupItems.push(group);
  }

  private initEnvironment() {
    for (let i = 0; i < GAME_CONFIG.VISIBLE_CHUNKS; i++) {
        this.createPathChunk(i * -GAME_CONFIG.CHUNK_SIZE);
    }
  }

  private createPathChunk(z: number) {
    const chunk = new THREE.Group();
    chunk.position.z = z;

    // Road
    const roadGeom = new THREE.PlaneGeometry(10, GAME_CONFIG.CHUNK_SIZE);
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    chunk.add(road);

    // Side Walls/Curbs with Moss details
    const curbGeom = new THREE.BoxGeometry(1, 1, GAME_CONFIG.CHUNK_SIZE);
    const curbMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const mossMat = new THREE.MeshPhongMaterial({ color: 0x224411 });
    
    const leftCurb = new THREE.Mesh(curbGeom, curbMat);
    leftCurb.position.set(-8.5, 0.5, 0);
    chunk.add(leftCurb);

    // Add Moss to Left Curb
    const lMoss = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 5), mossMat);
    lMoss.position.set(0, 0.5, (Math.random()-0.5)*20);
    leftCurb.add(lMoss);

    const rightCurb = new THREE.Mesh(curbGeom, curbMat);
    rightCurb.position.set(8.5, 0.5, 0);
    chunk.add(rightCurb);

    // Add Moss to Right Curb
    const rMoss = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 5), mossMat);
    rMoss.position.set(0, 0.5, (Math.random()-0.5)*20);
    rightCurb.add(rMoss);

    // Recessed 3D Water Channels
    const channelSideGeom = new THREE.BoxGeometry(0.5, 0.4, GAME_CONFIG.CHUNK_SIZE);
    const channelSideMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
    const waterGeom = new THREE.PlaneGeometry(2.5, GAME_CONFIG.CHUNK_SIZE);
    const waterMat = new THREE.MeshPhongMaterial({ color: 0x00aaff, transparent: true, opacity: 0.6, shininess: 100 });

    // Left Channel
    const lWater = new THREE.Mesh(waterGeom, waterMat);
    lWater.rotation.x = -Math.PI / 2;
    lWater.position.set(-11.5, -0.2, 0);
    chunk.add(lWater);
    
    const lWaterWall1 = new THREE.Mesh(channelSideGeom, channelSideMat);
    lWaterWall1.position.set(-10, -0.2, 0);
    chunk.add(lWaterWall1);
    const lWaterWall2 = new THREE.Mesh(channelSideGeom, channelSideMat);
    lWaterWall2.position.set(-13, -0.2, 0);
    chunk.add(lWaterWall2);

    // Right Channel
    const rWater = new THREE.Mesh(waterGeom, waterMat);
    rWater.rotation.x = -Math.PI / 2;
    rWater.position.set(11.5, -0.2, 0);
    chunk.add(rWater);

    const rWaterWall1 = new THREE.Mesh(channelSideGeom, channelSideMat);
    rWaterWall1.position.set(10, -0.2, 0);
    chunk.add(rWaterWall1);
    const rWaterWall2 = new THREE.Mesh(channelSideGeom, channelSideMat);
    rWaterWall2.position.set(13, -0.2, 0);
    chunk.add(rWaterWall2);

    // Floating Lotus Flowers (Natural resources in water)
    const lotusGeom = new THREE.SphereGeometry(0.3, 8, 8);
    const lotusMat = new THREE.MeshPhongMaterial({ color: 0xff66cc, emissive: 0x442233 });
    for (let i = 0; i < 2; i++) {
        const lotus = new THREE.Mesh(lotusGeom, lotusMat);
        lotus.scale.y = 0.2;
        lotus.position.set((Math.random() > 0.5 ? 8.5 : -8.5), -0.1, (Math.random()-0.5)*GAME_CONFIG.CHUNK_SIZE);
        chunk.add(lotus);
        
        this.swayables.push({
            mesh: lotus,
            baseRotation: lotus.rotation.clone(),
            phase: Math.random() * Math.PI,
            speed: 1.0
        });
    }

    // Fireflies (Atmospheric 3D light resources)
    if (Math.random() > 0.3) {
        this.spawnFireflies(chunk);
    }

    // Ancient Statues
    if (Math.random() > 0.5) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const statueGroup = new THREE.Group();
        
        // Stylized "Head"
        const headBase = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshPhongMaterial({ color: 0x777777 }));
        statueGroup.add(headBase);
        
        // Eyes
        const eyeGeom = new THREE.BoxGeometry(0.5, 0.5, 0.2);
        const eyeMat = new THREE.MeshPhongMaterial({ color: 0x00ffcc, emissive: 0x004433 });
        const lEye = new THREE.Mesh(eyeGeom, eyeMat); lEye.position.set(-0.5, 0.5, 1);
        const rEye = new THREE.Mesh(eyeGeom, eyeMat); rEye.position.set(0.5, 0.5, 1);
        statueGroup.add(lEye, rEye);

        // Moss on Statue
        const sMoss = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 2.1), mossMat);
        sMoss.position.y = 1.6;
        statueGroup.add(sMoss);
        
        statueGroup.position.set(15 * side, 1.5, (Math.random() - 0.5) * 20);
        statueGroup.rotation.y = side > 0 ? -Math.PI/2 : Math.PI/2;
        chunk.add(statueGroup);
    }

    // Shifting Temple Structures (Floating Blocks)
    for (let i = 0; i < 2; i++) {
        const blockGeom = new THREE.BoxGeometry(2, 4, 2);
        const blockMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const block = new THREE.Mesh(blockGeom, blockMat);
        const side = i === 0 ? 1 : -1;
        const zPos = (Math.random() - 0.5) * 30;
        const baseY = 2 + Math.random() * 4;
        
        block.position.set(15 * side, baseY, zPos);
        chunk.add(block);
        
        this.shiftingStructures.push({
            mesh: block,
            baseY: baseY,
            phase: Math.random() * Math.PI * 2,
            speed: 0.5 + Math.random() * 1.5
        });
    }

    // Decorative Pillars/Vines
    for (let i = -1; i <= 1; i++) {
        const pillarGeom = new THREE.BoxGeometry(1, 8, 1);
        const pillarMat = new THREE.MeshPhongMaterial({ color: 0x2d4c20 }); // Dark jungle green
        
        const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
        leftPillar.position.set(-7, 4, i * 15);
        chunk.add(leftPillar);

        const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
        rightPillar.position.set(7, 4, i * 15);
        chunk.add(rightPillar);

        // Hanging Vines
        if (Math.random() > 0.3) {
            const vineGeom = new THREE.CylinderGeometry(0.1, 0.1, 5, 4);
            const vineMat = new THREE.MeshPhongMaterial({ color: 0x1d3a0c });
            const vine = new THREE.Mesh(vineGeom, vineMat);
            const vineSide = Math.random() > 0.5 ? 1 : -1;
            vine.position.set(vineSide * 7, 6, i * 15 + (Math.random()-0.5)*5);
            chunk.add(vine);
            
            this.swayables.push({
                mesh: vine,
                baseRotation: vine.rotation.clone(),
                phase: Math.random() * Math.PI,
                speed: 1.5 + Math.random()
            });
        }
    }

    // Large Jungle Trees (Natural Resources)
    for (let i = 0; i < 2; i++) {
        const treeGroup = new THREE.Group();
        const side = i === 0 ? 1 : -1;
        const x = (10 + Math.random() * 5) * side;
        const z = (Math.random() - 0.5) * 40;

        // Trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 1, 15, 8),
            new THREE.MeshPhongMaterial({ color: 0x3d2b1f })
        );
        treeGroup.add(trunk);

        // Add Roots reaching into path
        if (Math.random() > 0.3) {
            const rootGeom = new THREE.CylinderGeometry(0.2, 0.4, 6, 8);
            const rootMat = new THREE.MeshPhongMaterial({ color: 0x3d2b1f });
            const root = new THREE.Mesh(rootGeom, rootMat);
            root.rotation.z = Math.PI / 2.5 * side;
            root.position.set(-side * 3, -6, 0);
            treeGroup.add(root);
        }

        // Foliage
        const foliage = new THREE.Mesh(
            new THREE.SphereGeometry(3 + Math.random() * 2, 8, 8),
            new THREE.MeshPhongMaterial({ color: 0x1a3300 })
        );
        foliage.position.y = 8;
        treeGroup.add(foliage);

        // Spawn Birds in some trees
        if (Math.random() > 0.7) {
            this.spawnBirdInTree(treeGroup);
        }

      treeGroup.position.set(x, 7.5, z);
      
      // Ensure foreground trees don't block the player view
      if (x > 0 && x < 20) {
          treeGroup.position.x = 20; // Move foreground trees further away from center
      } else if (x < 0 && x > -20) {
          treeGroup.position.x = -20; // Move background trees further away from center
      }
      
      chunk.add(treeGroup);
        
        this.swayables.push({
            mesh: treeGroup as any,
            baseRotation: treeGroup.rotation.clone(),
            phase: Math.random() * Math.PI,
            speed: 0.5 + Math.random() * 0.5
        });
    }

    // Volumetric God Rays (Atmospheric 3D Effect)
    if (Math.random() > 0.6) {
        const rayGroup = new THREE.Group();
        const rayGeom = new THREE.CylinderGeometry(2, 4, 40, 8, 1, true);
        const rayMat = new THREE.MeshBasicMaterial({
            color: 0xfff8e1,
            transparent: true,
            opacity: 0.05,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const ray = new THREE.Mesh(rayGeom, rayMat);
        ray.rotation.x = -Math.PI / 6; // Angled shafts
        rayGroup.add(ray);
        rayGroup.position.set((Math.random() - 0.5) * 40, 15, (Math.random() - 0.5) * 40);
        chunk.add(rayGroup);
        this.godRaysGroup.push(rayGroup);
    }

    // Butterflies (Fairy-like natural life)
    if (Math.random() > 0.5) {
        this.spawnButterflies(chunk);
    }

    // New Decorative Elements: Foliage, Rocks, Flowers and Dust Motes
    for (let i = 0; i < 20; i++) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = (6 + Math.random() * 6) * side;
        const zPos = (Math.random() - 0.5) * GAME_CONFIG.CHUNK_SIZE;
        
        const type = Math.random();
        if (type < 0.3) {
            // Bush
            const bushGeom = new THREE.SphereGeometry(0.5 + Math.random(), 8, 8);
            const bushMat = new THREE.MeshPhongMaterial({ color: 0x1a3300 });
            const bush = new THREE.Mesh(bushGeom, bushMat);
            bush.position.set(x, 0.4, zPos);
            bush.scale.y = 0.5 + Math.random();
            chunk.add(bush);
            
            this.swayables.push({
                mesh: bush,
                baseRotation: bush.rotation.clone(),
                phase: Math.random() * Math.PI * 2,
                speed: 1 + Math.random()
            });
        } else if (type < 0.5) {
            // Small Rock
            const sRockGeom = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.4);
            const sRockMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
            const sRock = new THREE.Mesh(sRockGeom, sRockMat);
            sRock.position.set(x * 0.8, 0.2, zPos);
            sRock.rotation.set(Math.random(), Math.random(), Math.random());
            chunk.add(sRock);
        } else if (type < 0.7) {
            // Wild Flower
            const flowerCol = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
            const stemGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
            const petalGeom = new THREE.SphereGeometry(0.2, 6, 6);
            const stem = new THREE.Mesh(stemGeom, new THREE.MeshPhongMaterial({ color: 0x244211 }));
            const petals = new THREE.Mesh(petalGeom, new THREE.MeshPhongMaterial({ color: flowerCol }));
            stem.position.set(x, 0.4, zPos);
            petals.position.set(x, 0.8, zPos);
            chunk.add(stem, petals);

            const flowerGroup = new THREE.Group();
            flowerGroup.add(stem, petals);
            chunk.add(flowerGroup);
            
            this.swayables.push({
                mesh: flowerGroup as any, // TypeScript group casting
                baseRotation: flowerGroup.rotation.clone(),
                phase: Math.random() * Math.PI * 2,
                speed: 2 + Math.random()
            });
        }
    }

    // Ancient Spirit Orbs (Floaty collectibles)
    if (Math.random() > 0.4) {
        const lane = Math.floor(Math.random() * 3);
        const orbGeom = new THREE.IcosahedronGeometry(0.4, 1);
        const orbMat = new THREE.MeshPhongMaterial({ 
            color: 0x00ffff, 
            emissive: 0x006666, 
            transparent: true, 
            opacity: 0.8 
        });
        const orb = new THREE.Mesh(orbGeom, orbMat);
        orb.position.set(GAME_CONFIG.LANES[lane], 2.5, (Math.random() - 0.5) * 40);
        orb.userData = { isOrb: true };
        
        // Add mystical aura
        const auraGeom = new THREE.SphereGeometry(0.8, 8, 8);
        const auraMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 });
        const aura = new THREE.Mesh(auraGeom, auraMat);
        orb.add(aura);
        
        chunk.add(orb);
        this.coinsGroup.push(orb); // Reuse coins logic for simplicity
    }

    // Mystic God Rays (Light shafts filtering through canopy)
    for (let i = 0; i < 3; i++) {
        const rayGeom = new THREE.CylinderGeometry(0.5, 2, 40, 8);
        const rayMat = new THREE.MeshBasicMaterial({ 
            color: 0xfff8e1, 
            transparent: true, 
            opacity: 0.05, 
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending 
        });
        const ray = new THREE.Mesh(rayGeom, rayMat);
        
        const side = Math.random() > 0.5 ? 1 : -1;
        ray.position.set(20 * side, 10, (Math.random() - 0.5) * GAME_CONFIG.CHUNK_SIZE);
        ray.rotation.z = Math.PI / 6 * -side; // Tilt inwards
        chunk.add(ray);
    }

    // Volumetric Mist Panels
    for (let i = 0; i < 2; i++) {
        const mistGeom = new THREE.PlaneGeometry(30, 20);
        const mistMat = new THREE.MeshBasicMaterial({
            color: 0x1a2e24,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            fog: false
        });
        const mist = new THREE.Mesh(mistGeom, mistMat);
        mist.position.set(0, 5, (Math.random() - 0.5) * GAME_CONFIG.CHUNK_SIZE);
        mist.rotation.y = Math.random() * Math.PI;
        chunk.add(mist);
        this.mists.push(mist);
    }

    // Ambient Dust Motes (Floating in the air)
    for (let i = 0; i < 10; i++) {
        const moteGeom = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const moteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        const mote = new THREE.Mesh(moteGeom, moteMat);
        
        mote.position.set(
            (Math.random() - 0.5) * 20,
            2 + Math.random() * 6,
            (Math.random() - 0.5) * GAME_CONFIG.CHUNK_SIZE
        );
        chunk.add(mote);
    }

    // Random Obstacles in this chunk (not in first chunk)
    if (z < -GAME_CONFIG.CHUNK_SIZE) {
        this.spawnObstaclesForChunk(chunk);
        
        // Spawn Power-ups
        if (Math.random() < 0.1) { // 10% chance per chunk
            this.spawnPowerupsForChunk(chunk);
        }
    }

    this.scene.add(chunk);
    this.pathChunks.push(chunk);
  }

  private spawnObstaclesForChunk(chunk: THREE.Group) {
      const obstacleSpawnPoints = [0.25, 0.5, 0.75]; // normalized along chunk length

      obstacleSpawnPoints.forEach(point => {
          if (Math.random() < GAME_CONFIG.OBSTACLE_SPAWN_CHANCE) {
              const laneIndex = Math.floor(Math.random() * 3);
              const rand = Math.random();
              let type: 'NORMAL' | 'UP' | 'SWING' | 'FLOOR' | 'LOG' | 'PLATFORM' = 'NORMAL';
              
              if (rand < 0.15) type = 'UP';
              else if (rand < 0.30) type = 'SWING';
              else if (rand < 0.45) type = 'FLOOR';
              else if (rand < 0.60) type = 'LOG';
              else if (rand < 0.75) type = 'PLATFORM';

              const group = new THREE.Group();

              if (type === 'UP') {
                  // Fire/Hazard Bar
                  const barGeom = new THREE.CylinderGeometry(0.2, 0.2, 3, 8);
                  const barMat = new THREE.MeshPhongMaterial({ color: 0xff4400, emissive: 0xff0000 });
                  const bar = new THREE.Mesh(barGeom, barMat);
                  bar.rotation.z = Math.PI / 2;
                  
                  const p1Geom = new THREE.BoxGeometry(0.5, 4, 0.5);
                  const pMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
                  const p1 = new THREE.Mesh(p1Geom, pMat);
                  p1.position.set(-1.5, 0, 0);
                  const p2 = new THREE.Mesh(p1Geom, pMat);
                  p2.position.set(1.5, 0, 0);
                  
                  group.add(bar, p1, p2);
                  group.position.y = 3;
              } else if (type === 'SWING') {
                  // Swinging Axe/Trap
                  const beamGeom = new THREE.CylinderGeometry(0.1, 0.1, 10, 8);
                  const beamMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
                  const beam = new THREE.Mesh(beamGeom, beamMat);
                  
                  const bladeGeom = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 3, 1, false, 0, Math.PI);
                  const bladeMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 100 });
                  const blade = new THREE.Mesh(bladeGeom, bladeMat);
                  blade.rotation.x = Math.PI / 2;
                  blade.position.y = -5;
                  
                  const trapGroup = new THREE.Group();
                  trapGroup.add(beam, blade);
                  beam.position.y = -5; // Pivot from top
                  trapGroup.position.y = 10;
                  
                  group.add(trapGroup);
                  group.userData.pivot = trapGroup;
                  group.userData.phase = Math.random() * Math.PI * 2;
              } else if (type === 'FLOOR') {
                  // Crumbling/Spiky Floor
                  const baseGeom = new THREE.BoxGeometry(2.8, 0.2, 2.8);
                  const baseMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
                  const base = new THREE.Mesh(baseGeom, baseMat);
                  
                  const spikeGeom = new THREE.ConeGeometry(0.2, 1, 4);
                  const spikeMat = new THREE.MeshPhongMaterial({ color: 0x990000 });
                  for(let i=0; i<9; i++) {
                      const spike = new THREE.Mesh(spikeGeom, spikeMat);
                      spike.position.set((i%3-1)*0.8, 0.5, (Math.floor(i/3)-1)*0.8);
                      base.add(spike);
                  }
                  group.add(base);
                  group.position.y = 0.1;
                  group.userData.phase = Math.random() * Math.PI * 2;
              } else if (type === 'LOG') {
                  // Falling Log
                  const logGeom = new THREE.CylinderGeometry(0.6, 0.6, 4, 12);
                  const logMat = new THREE.MeshPhongMaterial({ color: 0x4b3621 });
                  const log = new THREE.Mesh(logGeom, logMat);
                  log.rotation.z = Math.PI / 2;
                  
                  // Bark detail
                  const ringGeom = new THREE.TorusGeometry(0.6, 0.05, 8, 16);
                  const ringMat = new THREE.MeshPhongMaterial({ color: 0x2b1d0e });
                  for (let i = 0; i < 3; i++) {
                      const ring = new THREE.Mesh(ringGeom, ringMat);
                      ring.position.y = (i - 1) * 1.2;
                      ring.rotation.x = Math.PI / 2;
                      log.add(ring);
                  }

                  group.add(log);
                  group.position.y = 15; // Start in air
                  group.userData.vy = 0;
                  group.userData.triggered = false;
              } else if (type === 'PLATFORM') {
                  // Moving side-to-side platform
                  const platGeom = new THREE.BoxGeometry(4, 0.8, 3.5);
                  const platMat = new THREE.MeshPhongMaterial({ color: 0x8b4513 });
                  const platform = new THREE.Mesh(platGeom, platMat);
                  
                  // Stone edges
                  const edgeGeom = new THREE.BoxGeometry(4.2, 0.4, 3.7);
                  const edgeMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
                  const edge = new THREE.Mesh(edgeGeom, edgeMat);
                  edge.position.y = -0.2;
                  platform.add(edge);

                  group.add(platform);
                  group.position.y = 0.4;
                  group.userData.phase = Math.random() * Math.PI * 2;
                  group.userData.baseX = (laneIndex - 1) * 3;
              } else {
                  // Crate or Rock
                  const isCrate = Math.random() > 0.5;
                  if (isCrate) {
                      const boxGeom = new THREE.BoxGeometry(2.2, 2.2, 2.2);
                      const boxMat = new THREE.MeshPhongMaterial({ color: 0x82522c });
                      const crate = new THREE.Mesh(boxGeom, boxMat);
                      
                      // Add wood trims
                      const trimGeom = new THREE.BoxGeometry(2.3, 0.2, 0.2);
                      const trimMat = new THREE.MeshPhongMaterial({ color: 0x4a2e19 });
                      for (let i = 0; i < 4; i++) {
                          const t = new THREE.Mesh(trimGeom, trimMat);
                          t.position.y = i % 2 === 0 ? 1 : -1;
                          t.position.z = i < 2 ? 1 : -1;
                          crate.add(t);
                      }
                      group.add(crate);
                  } else {
                      const rockGeom = new THREE.DodecahedronGeometry(1.4);
                      const rockMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
                      const rock = new THREE.Mesh(rockGeom, rockMat);
                      rock.rotation.set(Math.random(), Math.random(), Math.random());
                      group.add(rock);
                  }
                  group.position.y = 1.1;
              }

              const x = GAME_CONFIG.LANES[laneIndex];
              const z = (point - 0.5) * GAME_CONFIG.CHUNK_SIZE;

              group.position.set(x, group.position.y, z);
              group.castShadow = true;
              group.userData = { ...group.userData, type, lane: laneIndex, isObstacleGroup: true };
              
              // Apply shadows to children
              group.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });
              
              chunk.add(group);
              this.obstacles.push(group);
          }

          // Spawn Coins
          if (Math.random() < GAME_CONFIG.COIN_SPAWN_CHANCE) {
              const laneIndex = Math.floor(Math.random() * 3);
              const coinGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
              const coinMat = new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0x444400 });
              const coin = new THREE.Mesh(coinGeom, coinMat);
              
              coin.rotation.x = Math.PI / 2;
              const x = GAME_CONFIG.LANES[laneIndex];
              const z = (point - 0.4) * GAME_CONFIG.CHUNK_SIZE;
              
              coin.position.set(x, 1, z);
              chunk.add(coin);
              this.coinsGroup.push(coin);
          }
      });
  }

  public start() {
    this.isRunning = true;
    this.speed = GAME_CONFIG.INITIAL_SPEED;
    this.distance = 0;
    this.coins = 0;
    this.lives = 1; // Number of "saves" before real game over
    this.invincibilityTimer = 1.0; // Grace period on start
    this.currentWeather = 'CLEAR';
    this.weatherTimer = 20;
    if (this.rainPoints) this.rainPoints.visible = false;
    this.clock.start();
    this.sounds.startAmbience();
  }

  public stop() {
    this.isRunning = false;
    this.sounds.stopAmbience();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    
    // Always update day cycle for background continuity
    this.updateDayCycle(delta);

    if (this.isRunning) {
        this.update(delta);
        this.updateBackgroundAnimations(delta);
    } else {
        // Just update some ambient animations for the menu
        this.updateBackgroundAnimations(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateDayCycle(delta: number) {
      this.dayTime += delta * this.dayScale;
      if (this.dayTime > 1) this.dayTime -= 1;

      // Smooth interpolation factors
      // 0.0 - Midnight
      // 0.25 - Dawn
      // 0.5 - Midday
      // 0.75 - Dusk
      
      const noonFactor = Math.cos((this.dayTime - 0.5) * Math.PI * 2) * 0.5 + 0.5; // 1 at noon, 0 at midnight
      const midnightFactor = 1 - noonFactor;
      
      // Calculate Colors
      const skyNoon = new THREE.Color(0x87ceeb); // Sky blue
      const skyNight = new THREE.Color(0x0a0a1a); // Deep blue black
      const skyDawn = new THREE.Color(0xff7f50); // Coral dawn
      
      let currentSkyColor = new THREE.Color();
      if (this.dayTime < 0.2) { // Night to Dawn
          currentSkyColor.lerpColors(skyNight, skyDawn, this.dayTime / 0.2);
      } else if (this.dayTime < 0.5) { // Dawn to Noon
          currentSkyColor.lerpColors(skyDawn, skyNoon, (this.dayTime - 0.2) / 0.3);
      } else if (this.dayTime < 0.8) { // Noon to Dusk
          currentSkyColor.lerpColors(skyNoon, skyDawn, (this.dayTime - 0.5) / 0.3);
      } else { // Dusk to Night
          currentSkyColor.lerpColors(skyDawn, skyNight, (this.dayTime - 0.8) / 0.2);
      }

      // Special jungle tint (blend with dark jungle teal)
      const jungleBase = new THREE.Color(0x1a2e24);
      currentSkyColor.lerp(jungleBase, 0.4);

      this.scene.background = currentSkyColor;
      this.scene.fog.color = currentSkyColor;

      // Update Lighting
      this.ambientLight.intensity = 0.1 + noonFactor * 0.4;
      this.dirLight.intensity = Math.max(0.1, noonFactor * 1.5);
      
      // Move Sun/Moon
      const sunDir = new THREE.Vector3(
          Math.cos(this.dayTime * Math.PI * 2) * 50,
          Math.sin(this.dayTime * Math.PI * 2) * 50,
          20
      );
      this.dirLight.position.copy(sunDir);

      // Environmental Reactions
      this.godRaysGroup.forEach(rayGroup => {
          const ray = rayGroup.children[0] as THREE.Mesh;
          (ray.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (noonFactor - 0.4) * 0.1);
      });

      this.fireflies.forEach(f => {
          (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (midnightFactor - 0.3) * 0.8);
      });
  }

  private updateBackgroundAnimations(delta: number) {
      this.shiftingStructures.forEach(struct => {
          struct.phase += delta * struct.speed;
          struct.mesh.position.y = struct.baseY + Math.sin(struct.phase) * 1.5;
          struct.mesh.rotation.y += delta * 0.2;
      });

      this.swayables.forEach(sway => {
          sway.phase += delta * sway.speed;
          
          // Improved organic wind simulation with occasional "gusts"
          const time = Date.now() * 0.001;
          const gust = Math.sin(time * 0.3) * Math.sin(time * 0.7) * 0.1;
          const globalWind = Math.sin(time) * 0.05 + gust;
          
          const individualSway = Math.sin(sway.phase) * 0.12;
          
          // Apply rotation sway
          sway.mesh.rotation.z = sway.baseRotation.z + individualSway + globalWind;
          sway.mesh.rotation.x = sway.baseRotation.x + Math.cos(sway.phase * 0.7) * 0.06;

          // Add subtle organic scale bobbing for bushes/vines
          if (sway.mesh.type === 'Mesh') {
              const scalePulse = 1 + Math.sin(sway.phase * 0.5) * 0.02;
              sway.mesh.scale.y = scalePulse;
          }
      });

      this.butterflies.forEach(b => {
          b.phase += delta * b.speed;
          b.mesh.position.x = b.center.x + Math.sin(b.phase) * b.orbit;
          b.mesh.position.y = b.center.y + Math.cos(b.phase * 0.5) * b.orbit * 0.5;
          b.mesh.children.forEach((wing, idx) => {
              wing.rotation.y = Math.sin(b.phase * 10) * (idx === 0 ? 1 : -1);
          });
      });

      this.fireflies.forEach(f => {
          f.phase += delta * f.speed;
          f.mesh.position.x = f.center.x + Math.sin(f.phase) * 1.5;
          f.mesh.position.y = f.center.y + Math.cos(f.phase * 0.7) * 1.0;
          f.mesh.position.z = f.center.z + Math.sin(f.phase * 0.5) * 1.5;
          (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(f.phase * 2) * 0.5;
      });
  }

  private update(delta: number) {
    if (!this.isRunning) return;

    this.updateWeather(delta);
    this.updateAmbientSounds(delta);

    // Speed up
    this.speed = Math.min(GAME_CONFIG.MAX_SPEED, this.speed + GAME_CONFIG.SPEED_INCREMENT * delta);
    
    // Speed Boost logic
    let effectiveSpeed = this.speed;
    if (this.boostTimer > 0) {
        this.boostTimer -= delta;
        effectiveSpeed += 20;
        this.camera.fov += (90 - this.camera.fov) * delta * 5;
        this.camera.updateProjectionMatrix();
        
        // Boost trail
        if (this.boostTrail) {
            this.boostTrail.visible = true;
            const pos = this.boostTrail.geometry.attributes.position.array as Float32Array;
            for(let i=0; i<100; i++) {
                if (Math.random() > 0.8) {
                    pos[i*3] = this.player.position.x + (Math.random()-0.5)*2;
                    pos[i*3+1] = this.player.position.y + Math.random()*2;
                    pos[i*3+2] = this.player.position.z + 2;
                } else {
                    pos[i*3+2] += 20 * delta;
                }
            }
            this.boostTrail.geometry.attributes.position.needsUpdate = true;
        }
    } else {
        this.camera.fov += (75 - this.camera.fov) * delta * 2;
        this.camera.updateProjectionMatrix();
        if (this.boostTrail) this.boostTrail.visible = false;
    }

    const moveZ = effectiveSpeed * delta;
    this.distance += moveZ;

    // Update Shadow
    if (this.shadow) {
        this.shadow.position.x = this.player.position.x;
        // Don't move shadow Z, it's relative to the camera/static player in local coords 
        // actually player is at 0,0,0 usually but lanes move it
        
        // Intensity decreases with height
        const heightFactor = Math.max(0, 1 - (this.player.position.y / 8));
        (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.4 * heightFactor;
        const scale = 0.5 + 0.5 * heightFactor;
        this.shadow.scale.set(scale, scale, scale);
    }

    // Animate dynamic obstacles
    this.obstacles.forEach(obs => {
        if (obs.userData.type === 'SWING' && obs.userData.pivot) {
            obs.userData.phase += delta * 2;
            obs.userData.pivot.rotation.z = Math.sin(obs.userData.phase) * (Math.PI / 3);
        } else if (obs.userData.type === 'FLOOR') {
            obs.userData.phase += delta * 3;
            // Floor spikes pop up and down
            obs.children[0].position.y = -0.5 + Math.max(0, Math.sin(obs.userData.phase)) * 0.8;
        } else if (obs.userData.type === 'LOG') {
            const worldPos = new THREE.Vector3();
            obs.getWorldPosition(worldPos);
            if (!obs.userData.triggered && worldPos.z < 45 && worldPos.z > -10) {
                obs.userData.triggered = true;
            }
            if (obs.userData.triggered) {
                obs.userData.vy -= delta * 60; // Gravity
                obs.position.y += obs.userData.vy * delta;
                if (obs.position.y < 0.6) {
                    obs.position.y = 0.6;
                    obs.userData.vy = 0;
                    if (Math.abs(obs.userData.vy) > 1) {
                         this.sounds.play('CRASH'); // Sound when log hits ground
                    }
                }
            }
        } else if (obs.userData.type === 'PLATFORM') {
            obs.userData.phase += delta * 1.5;
            obs.position.x = obs.userData.baseX + Math.sin(obs.userData.phase) * 3;
        }
    });

    // Camera follow (3D behind-the-back)
    const camTargetY = 5 + (this.player.position.y - 1) * 0.8;
    this.camera.position.x += (this.player.position.x * 0.5 - this.camera.position.x) * 5 * delta;
    this.camera.position.y += (camTargetY - this.camera.position.y) * 5 * delta;
    this.camera.position.z = this.player.position.z + 8;
    this.camera.lookAt(this.player.position.x * 0.5, 2 + (this.player.position.y - 1) * 0.5, this.player.position.z - 10);

    // Active power-up timers
    if (this.shieldTimer > 0) {
        this.shieldTimer -= delta;
        if (this.shieldMesh) {
            this.shieldMesh.visible = true;
            this.shieldMesh.rotation.y += delta * 2;
            this.shieldMesh.scale.setScalar(1 + Math.sin(Date.now() * 0.01) * 0.05);
            if (this.shieldTimer < 2) {
                this.shieldMesh.visible = Math.floor(Date.now() / 100) % 2 === 0;
            }
        }
    } else {
        if (this.shieldMesh) this.shieldMesh.visible = false;
    }

    if (this.magnetTimer > 0) {
        this.magnetTimer -= delta;
        if (this.magnetAura) {
            this.magnetAura.visible = true;
            this.magnetAura.rotation.z += delta * 5;
            if (this.magnetTimer < 2) {
                this.magnetAura.visible = Math.floor(Date.now() / 100) % 2 === 0;
            }
        }
    } else {
        if (this.magnetAura) this.magnetAura.visible = false;
    }

    // Invincibility Logic
    if (this.invincibilityTimer > 0) {
        this.invincibilityTimer -= delta;
        // Faster blinking
        this.player.visible = Math.floor(Date.now() / 80) % 2 === 0;
        if (this.invincibilityTimer <= 0) {
            this.player.visible = true;
        }
    }

    this.shiftingStructures.forEach(struct => {
        struct.phase += delta * struct.speed;
        struct.mesh.position.y = struct.baseY + Math.sin(struct.phase) * 1.5;
        struct.mesh.rotation.y += delta * 0.2;
    });

    // Swaying Foliage (3D natural wind effect)
    this.swayables.forEach(sway => {
        sway.phase += delta * sway.speed;
        const windIntensity = this.currentWeather === 'RAIN' ? 0.3 : 0.1;
        sway.mesh.rotation.z = sway.baseRotation.z + Math.sin(sway.phase) * windIntensity;
        sway.mesh.rotation.x = sway.baseRotation.x + Math.cos(sway.phase * 0.5) * windIntensity * 0.5;
    });

    // Animate falling leaves
    if (this.currentWeather === 'CLEAR' && Math.random() < 0.05) {
        this.spawnLeaf();
    }
    
    for (let i = this.fallingLeaves.length - 1; i >= 0; i--) {
        const leaf = this.fallingLeaves[i];
        leaf.mesh.position.add(leaf.velocity.clone().multiplyScalar(delta));
        leaf.mesh.rotation.x += leaf.rotSpeed * delta;
        leaf.mesh.rotation.y += leaf.rotSpeed * 0.5 * delta;
        
        if (leaf.mesh.position.y < 0) {
            this.scene.remove(leaf.mesh);
            this.fallingLeaves.splice(i, 1);
        }
    }

    // Animate God Rays (3D Pulse)
    this.godRaysGroup.forEach(rayGroup => {
        const ray = rayGroup.children[0] as THREE.Mesh;
        const mat = ray.material as THREE.MeshBasicMaterial;
        const pulse = 0.05 + Math.sin(Date.now() * 0.001) * 0.02;
        mat.opacity += (pulse - mat.opacity) * delta;
    });

    // Animate Butterflies (3D Flutters)
    this.butterflies.forEach(b => {
        b.phase += delta * b.speed;
        b.mesh.position.x = b.center.x + Math.sin(b.phase) * b.orbit;
        b.mesh.position.y = b.center.y + Math.cos(b.phase * 0.5) * b.orbit * 0.5;
        b.mesh.children.forEach((wing, idx) => {
            wing.rotation.y = Math.sin(b.phase * 10) * (idx === 0 ? 1 : -1);
        });
    });

    // Bird Logic (Scaring away)
    this.birds.forEach(b => {
        const worldPos = new THREE.Vector3();
        b.mesh.getWorldPosition(worldPos);
        const dist = worldPos.distanceTo(this.player.position);
        
        if (dist < 20 && !b.mesh.userData.isScared) {
            b.mesh.userData.isScared = true;
            b.velocity.set((Math.random() - 0.5) * 5, 5 + Math.random() * 10, -10 - Math.random() * 20);
        }

        if (b.mesh.userData.isScared) {
            b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));
            b.mesh.children.forEach((wing, idx) => {
                wing.rotation.y = Math.sin(Date.now() * 0.05) * (idx === 0 ? 1 : -1);
            });
        }
    });

    // Animate Fireflies
    this.fireflies.forEach(f => {
        f.phase += delta * f.speed;
        f.mesh.position.x = f.center.x + Math.sin(f.phase) * 1.5;
        f.mesh.position.y = f.center.y + Math.cos(f.phase * 0.7) * 1.0;
        f.mesh.position.z = f.center.z + Math.sin(f.phase * 0.5) * 1.5;
        (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(f.phase * 2) * 0.5;
    });

    // Character Torso "Breathing" (Humanoid subtle animation)
    const breath = 1 + Math.sin(Date.now() * 0.002) * 0.02;
    this.playerModel.scale.x = breath;
    this.playerModel.scale.z = breath;

    // Movement
    this.pathChunks.forEach(chunk => {
      chunk.position.z += moveZ;
      if (chunk.position.z > GAME_CONFIG.CHUNK_SIZE) {
        // Recycle chunk to back
        const furthestZ = Math.min(...this.pathChunks.map(c => c.position.z));
        chunk.position.z = furthestZ - GAME_CONFIG.CHUNK_SIZE;
        
        // Remove old obstacles from the list
        chunk.children.filter(c => c !== chunk.children[0] && c !== chunk.children[1] && c !== chunk.children[2]).forEach(c => {
             const obsIdx = this.obstacles.indexOf(c);
             if (obsIdx > -1) this.obstacles.splice(obsIdx, 1);
             const coinIdx = this.coinsGroup.indexOf(c);
             if (coinIdx > -1) this.coinsGroup.splice(coinIdx, 1);
             
             // Cleanup shifting structures
             const shiftIdx = this.shiftingStructures.findIndex(s => s.mesh === c);
             if (shiftIdx > -1) this.shiftingStructures.splice(shiftIdx, 1);

             // Cleanup swaying elements
             const swayIdx = this.swayables.findIndex(s => s.mesh === c);
             if (swayIdx > -1) this.swayables.splice(swayIdx, 1);

             // Cleanup powerup items
             const pwIdx = this.powerupItems.indexOf(c);
             if (pwIdx > -1) this.powerupItems.splice(pwIdx, 1);

             // Cleanup god rays
             const rayIdx = this.godRaysGroup.findIndex(g => g === c);
             if (rayIdx > -1) this.godRaysGroup.splice(rayIdx, 1);

             // Cleanup biological life
             const bIdx = this.butterflies.findIndex(b => b.mesh === c);
             if (bIdx > -1) this.butterflies.splice(bIdx, 1);
             const birdIdx = this.birds.findIndex(b => b.mesh === c);
             if (birdIdx > -1) this.birds.splice(birdIdx, 1);
             const fireIdx = this.fireflies.findIndex(f => f.mesh === c);
             if (fireIdx > -1) this.fireflies.splice(fireIdx, 1);
             
             const mistIdx = this.mists.indexOf(c as THREE.Mesh);
             if (mistIdx > -1) this.mists.splice(mistIdx, 1);

             chunk.remove(c);
        });

        // Spawn new ones
        this.spawnObstaclesForChunk(chunk);
      }
    });

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= delta;
        if (p.life <= 0) {
            this.scene.remove(p.mesh);
            this.particles.splice(i, 1);
        } else {
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            p.mesh.scale.multiplyScalar(0.95);
        }
    }

    // Spawn slide particles
    if (this.isSliding) {
        this.spawnParticle(this.player.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xcccccc);
    }

    // Update Player Lane
    const targetX = GAME_CONFIG.LANES[this.targetLane];
    const traction = this.currentWeather === 'RAIN' ? 7 : 15;
    this.player.position.x += (targetX - this.player.position.x) * traction * delta;

    // Update Player Jump
    if (this.isJumping) {
      this.playerVelocityY -= GAME_CONFIG.GRAVITY * delta;
      this.playerY += this.playerVelocityY * delta;

      if (this.playerY <= 1) {
        this.playerY = 1;
        if (this.isJumping) {
            this.sounds.play('LAND');
            // Land puff
            for(let i=0; i<6; i++) {
                this.spawnParticle(this.player.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xaaaaaa, 0.5);
            }
        }
        this.isJumping = false;
        this.playerVelocityY = 0;
      }
    }
    this.player.position.y = this.playerY;

    // Update Player Slide
    if (this.isSliding) {
        this.slideTimer -= delta;
        if (this.slideTimer <= 0) {
            this.isSliding = false;
            this.playerModel.scale.y = 1;
            this.playerModel.position.y = 1.45; // Adjusted for humanoid torso
        }
    }

    // Collision Detection
    this.checkCollisions();

    // Pulse Items
    this.coinsGroup.forEach(item => {
        item.rotation.y += 3 * delta;
        if (item.userData.isOrb) {
            item.position.y = 2.5 + Math.sin(Date.now() * 0.005) * 0.3;
        } else {
            item.rotation.z += 5 * delta;
        }
    });

    // Camera follow effect and speed-based FOV
    const targetFOV = 75 + (this.speed - GAME_CONFIG.INITIAL_SPEED) * 0.2;
    this.camera.fov += (targetFOV - this.camera.fov) * delta;
    this.camera.updateProjectionMatrix();

    // Removed 3D follow logic that pulls camera to center

    // Character Animations (Humanoid specific)
    const targetTilt = (targetX - this.player.position.x) * 0.1;
    this.player.rotation.z += (targetTilt - this.player.rotation.z) * delta * 5;

    if (!this.isJumping && !this.isSliding) {
        this.gameTime += delta * (this.speed / 10);
        
        // Dynamic Footsteps
        const prevPhase = this.gameTime - delta * (this.speed / 10);
        if (Math.sin(this.gameTime * 12) > 0 && Math.sin(prevPhase * 12) <= 0) {
            this.sounds.play('STEP');
        }

        const limbSwing = Math.sin(this.gameTime * 12) * 0.7; // Faster swing
        
        this.leftLeg.rotation.x = limbSwing;
        this.rightLeg.rotation.x = -limbSwing;
        this.leftArm.rotation.x = -limbSwing * 0.8;
        this.rightArm.rotation.x = limbSwing * 0.8;
        
        // Add some elbow bend
        this.leftArm.rotation.z = -0.1 - Math.abs(limbSwing) * 0.2;
        this.rightArm.rotation.z = 0.1 + Math.abs(limbSwing) * 0.2;
        
        // Humanoid head/body bob (more dynamic)
        const bob = Math.sin(this.gameTime * 24);
        this.player.children[1].position.y = 2.1 + bob * 0.03; // Head
        this.playerModel.position.y = 1.45 + Math.abs(bob) * 0.08; // Torso
    } else if (this.isJumping) {
        // Dynamic jump pose based on vertical velocity
        const jumpProgress = Math.max(-1, Math.min(1, this.playerVelocityY / 10));
        
        this.leftLeg.rotation.x = 0.4 + jumpProgress * 0.4;
        this.rightLeg.rotation.x = -0.4 + jumpProgress * 0.4;
        this.leftArm.rotation.x = -1.2 + jumpProgress * 0.4;
        this.rightArm.rotation.x = -1.2 + jumpProgress * 0.4;
        
        // Tilt back slightly during ascent, forward during descent
        this.player.rotation.x = -jumpProgress * 0.15;
    } else if (this.isSliding) {
        this.leftLeg.rotation.x = -1.5;
        this.rightLeg.rotation.x = -1.5;
        this.leftArm.rotation.x = 0.8;
        this.rightArm.rotation.x = 0.8;
        this.player.rotation.x = -0.4;
        
        // Low profile squish
        this.playerModel.scale.y = 0.6;
    }

    if (!this.isSliding) {
        // Smooth recovery from sliding/jumping
        this.player.rotation.x += (0 - this.player.rotation.x) * delta * 10;
        this.playerModel.scale.y += (1 - this.playerModel.scale.y) * delta * 10;
    }
  }

  private checkCollisions() {
      // Player bounding sphereish check
      const playerPos = new THREE.Vector3().copy(this.player.position);
      playerPos.y += this.playerModel.position.y;

      // Coins
      const isMagnetActive = this.magnetTimer > 0;
      for (let i = this.coinsGroup.length - 1; i >= 0; i--) {
          const coin = this.coinsGroup[i];
          const worldPos = new THREE.Vector3();
          coin.getWorldPosition(worldPos);

          const distance = playerPos.distanceTo(worldPos);

          // Magnet Attraction
          if (isMagnetActive && distance < 8) {
              const dir = playerPos.clone().sub(worldPos).normalize();
              coin.position.add(dir.multiplyScalar(20 * 0.016)); // Move towards player
          }

          if (distance < 1.5) {
              this.coins += 1;
              this.onCoinCollect();
              this.sounds.play('COIN');
              
              // Burst effect
              for(let j=0; j<8; j++) {
                  this.spawnParticle(worldPos, 0xffff00, 2);
              }

              coin.parent?.remove(coin);
              this.coinsGroup.splice(i, 1);
          }
      }

      // Power-ups
      for (let i = this.powerupItems.length - 1; i >= 0; i--) {
          const p = this.powerupItems[i];
          const worldPos = new THREE.Vector3();
          p.getWorldPosition(worldPos);

          if (playerPos.distanceTo(worldPos) < 1.8) {
              const type = p.userData.type;
              this.activatePowerup(type);
              
              // Effects
              for(let j=0; j<15; j++) {
                  this.spawnParticle(worldPos, type === 'SHIELD' ? 0x00ffff : type === 'MAGNET' ? 0xff0000 : 0xffff00, 3);
              }

              p.parent?.remove(p);
              this.powerupItems.splice(i, 1);
          }
      }

      // Obstacles
      for (const obs of this.obstacles) {
          const worldPos = new THREE.Vector3();
          obs.getWorldPosition(worldPos);
          
          const dx = Math.abs(this.player.position.x - worldPos.x);
          const dz = Math.abs(this.player.position.z - worldPos.z);
          const dy = Math.abs(playerPos.y - worldPos.y);

          const hWidth = 1.0;
          const hDepth = 0.5;
          const hHeight = this.isSliding ? 0.4 : 1.0;

          // Approximate bounds for groups
          const isUp = obs.userData.type === 'UP';
          const isLog = obs.userData.type === 'LOG';
          const isPlatform = obs.userData.type === 'PLATFORM';
          
          let obsHWidth = 1.1;
          let obsHHeight = 1.1;
          
          if (isUp) {
              obsHWidth = 1.5;
              obsHHeight = 0.2;
          } else if (isLog) {
              obsHWidth = 2.0;
              obsHHeight = 0.6;
          } else if (isPlatform) {
              obsHWidth = 2.0;
              obsHHeight = 0.4;
          }

          if (dx < hWidth + obsHWidth && dz < hDepth + 1.2 && dy < hHeight + obsHHeight) {
              if (this.invincibilityTimer <= 0) {
                  // SHIELD CHECK
                  if (this.shieldTimer > 0) {
                      this.shieldTimer = 0; // Consume shield
                      this.invincibilityTimer = 1.3; // Short invincibility for safety
                      this.sounds.play('CRASH');
                      for(let j=0; j<20; j++) this.spawnParticle(playerPos, 0x00ffff, 4);
                  } else if (isUp || obs.userData.type === 'NORMAL' || isLog) {
                      // Fatal obstacles
                      this.gameOver();
                  } else if (this.lives > 0) {
                      // STUMBLE MECHANIC for other obstacles
                      this.lives--;
                      this.invincibilityTimer = 1.5;
                      this.speed *= 0.7; // Significant speed penalty
                      this.sounds.play('CRASH');
                      
                      // Explosion at collision
                      for(let j=0; j<15; j++) {
                          this.spawnParticle(worldPos, 0xff4400, 2);
                          this.spawnParticle(worldPos, 0x555555, 1.5);
                      }

                      // Screen shake
                      this.camera.position.x += (Math.random() - 0.5) * 2;
                  } else {
                      this.gameOver();
                  }
              }
              break;
          }
      }
  }

  private activatePowerup(type: 'SHIELD' | 'MAGNET' | 'BOOST') {
      this.sounds.play('POWERUP');
      if (type === 'SHIELD') {
          this.shieldTimer = 10;
          this.sounds.play('SHIELD_UP');
      } else if (type === 'MAGNET') {
          this.magnetTimer = 15;
      } else if (type === 'BOOST') {
          this.boostTimer = 5;
          this.speed += 15; // Immediate kick
      }
  }

  private spawnParticle(pos: THREE.Vector3, color: number, speed: number = 1, size: number = 0.2) {
      const g = new THREE.BoxGeometry(size, size, size);
      const m = new THREE.MeshPhongMaterial({ 
          color, 
          emissive: color, 
          emissiveIntensity: 0.5,
          transparent: true 
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(pos);
      // Give it some initial random rotation
      mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      this.scene.add(mesh);

      this.particles.push({
          mesh,
          life: 0.5 + Math.random() * 0.5,
          velocity: new THREE.Vector3(
              (Math.random()-0.5) * 8 * speed,
              (Math.random()) * 8 * speed,
              (Math.random()-0.5) * 8 * speed
          )
      });
  }

  private gameOver() {
    this.isRunning = false;
    this.sounds.stopAmbience();
    this.sounds.play('CRASH');
    
    // Explosion debris
    for(let i=0; i<30; i++) {
        this.spawnParticle(this.player.position, 0xff0000, 2);
        this.spawnParticle(this.player.position, 0x444444, 2);
    }

    // Simple screen shake effect
    this.camera.position.x += (Math.random() - 0.5) * 2;
    this.camera.position.y += (Math.random() - 0.5) * 2;
    this.onGameOver(Math.floor(this.distance), this.coins);
  }

  public moveLeft() {
    if (this.targetLane > 0) {
      this.targetLane--;
      this.sounds.play('WHOOSH');
    }
  }

  public moveRight() {
    if (this.targetLane < 2) {
      this.targetLane++;
      this.sounds.play('WHOOSH');
    }
  }

  public jump() {
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.playerVelocityY = GAME_CONFIG.JUMP_FORCE;
      this.sounds.play('JUMP');
    }
  }

  public slide() {
      if (!this.isJumping && !this.isSliding) {
          this.isSliding = true;
          this.slideTimer = 0.8;
          this.playerModel.scale.y = 0.5;
          this.playerModel.position.y = 0.5;
          this.sounds.play('SLIDE');
      }
  }

  public toggleMute() {
      return this.sounds.toggleMute();
  }

  private updateAmbientSounds(delta: number) {
      this.ambientSoundTimer -= delta;
      if (this.ambientSoundTimer <= 0) {
          this.ambientSoundTimer = 5 + Math.random() * 10;
          this.sounds.playRandomAmbient();
      }
  }

  private handleResize(container: HTMLElement) {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  public destroy() {
    this.stop();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
