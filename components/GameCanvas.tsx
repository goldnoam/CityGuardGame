
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Building, EnemyMissile, Interceptor, Explosion, GameState, UpgradeStats, EnemyType, Difficulty, Projectile } from '../types';

interface GameCanvasProps {
  gameState: GameState;
  level: number;
  difficulty: Difficulty;
  upgradeStats: UpgradeStats;
  highScore: number;
  isMuted: boolean;
  onGameOver: (score: number) => void;
  onLevelComplete: (stats: { buildingsLost: number; enemiesDestroyed: number }) => void;
}

const LEVEL_DURATION = 30; // seconds
const COMBO_TIMEOUT = 2500; // ms to keep combo alive

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, level, difficulty, upgradeStats, highScore, isMuted, onGameOver, onLevelComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Audio Context
  const audioCtxRef = useRef<AudioContext | null>(null);
  const warningPlayedRef = useRef<boolean>(false);
  
  // Mute Ref to avoid stale closures in RAF loop
  const isMutedRef = useRef(isMuted);

  // Game State Refs (Mutable for performance in game loop)
  const buildingsRef = useRef<Building[]>([]);
  const enemiesRef = useRef<EnemyMissile[]>([]);
  const interceptorsRef = useRef<Interceptor[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  
  // New Defense Refs
  const projectilesRef = useRef<Projectile[]>([]); // Turret shots
  const shieldEnergyRef = useRef<number>(0);
  const shieldHitTimeRef = useRef<number>(0); // Timestamp of last shield hit
  const lastTurretFireTimeRef = useRef<number>(0);
  
  // Scoring & Combo Refs
  const multiplierRef = useRef<number>(1);
  const lastKillTimeRef = useRef<number>(0);
  
  const lastTimeRef = useRef<number>(0);
  const levelTimeRef = useRef<number>(0);
  const nextSpawnTimeRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
  
  // Game Over Animation Ref
  const gameOverStartRef = useRef<number>(0);
  
  // Stats for the current level
  const buildingsLostInLevelRef = useRef<number>(0);
  const enemiesDestroyedRef = useRef<number>(0);

  // Track previous game state to handle Resume vs Restart
  const prevGameStateRef = useRef<GameState>(gameState);

  // UI State exposed to React
  const [displayTime, setDisplayTime] = useState(LEVEL_DURATION);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayMultiplier, setDisplayMultiplier] = useState(1);
  const [comboProgress, setComboProgress] = useState(0); // 0 to 1 for bar

  // Calculate stats based on upgrades
  const interceptorSpeed = 600 + (upgradeStats.speedLevel * 150);
  const explosionMaxRadius = 60 + (upgradeStats.radiusLevel * 15);
  // Cooldown: 500ms base, decreases by 50ms per level, min 100ms
  const fireCooldown = Math.max(100, 500 - (upgradeStats.rateLevel * 50)); 
  
  // Static Defense Stats
  const shieldMaxEnergy = upgradeStats.shieldLevel * 100;
  const turretCooldown = Math.max(200, 1000 - (upgradeStats.turretLevel * 100)); // 1s base -> 0.2s

  // Sync mute prop to ref
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted && audioCtxRef.current?.state === 'running') {
      audioCtxRef.current.suspend();
    } else if (!isMuted && audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, [isMuted]);

  // Initialize Audio
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtxRef.current = new AudioContextClass();
    }
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  const playSound = (type: 'warning' | 'shoot' | 'explode_normal' | 'explode_heavy' | 'turret_shoot' | 'shield_hit' | 'nuke', intensity: number = 1) => {
    if (isMutedRef.current) return;
    if (!audioCtxRef.current) return;

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    if (type === 'warning') {
      // Radar blip
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } 
    else if (type === 'shoot') {
      // Laser/Missile launch
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
    else if (type === 'turret_shoot') {
      // Pew pew
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
    else if (type === 'shield_hit') {
      // Dynamic Shield Sound
      const isCritical = intensity < 0.3;
      
      // Main oscillator
      osc.type = isCritical ? 'sawtooth' : 'sine';
      
      // Pitch drops if energy is low
      const startFreq = isCritical ? 150 : 300;
      const endFreq = isCritical ? 50 : 100;
      
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.connect(gainNode);

      // If critical, add a distorted buzzing layer
      if (isCritical) {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'square';
          osc2.frequency.setValueAtTime(80, ctx.currentTime);
          osc2.frequency.linearRampToValueAtTime(40, ctx.currentTime + 0.4);
          
          gain2.gain.setValueAtTime(0.05, ctx.currentTime);
          gain2.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.4);
      }
      
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
    else if (type === 'nuke') {
       // Deep rumble
       const bufferSize = ctx.sampleRate * 2.0;
       const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
       const data = buffer.getChannelData(0);
       for (let i = 0; i < bufferSize; i++) {
         data[i] = Math.random() * 2 - 1;
       }
       const noise = ctx.createBufferSource();
       noise.buffer = buffer;
       
       const filter = ctx.createBiquadFilter();
       filter.type = 'lowpass';
       filter.frequency.setValueAtTime(200, ctx.currentTime);
       filter.frequency.linearRampToValueAtTime(10, ctx.currentTime + 2);

       gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
       gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2);

       noise.connect(filter);
       filter.connect(gainNode);
       gainNode.connect(ctx.destination);
       noise.start();
    }
    else if (type.startsWith('explode')) {
      // Noise burst for explosion
      const bufferSize = ctx.sampleRate * (type === 'explode_heavy' ? 1.0 : 0.5);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      // Filter for "boom" sound
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = type === 'explode_heavy' ? 600 : 1000;
      
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (type === 'explode_heavy' ? 0.8 : 0.4));

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);
      noise.start();
    }
  };

  // Initialize Level
  const initLevel = useCallback(() => {
    if (!canvasRef.current) return;
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    // Reset transients
    enemiesRef.current = [];
    interceptorsRef.current = [];
    explosionsRef.current = [];
    projectilesRef.current = [];
    
    levelTimeRef.current = 0; // Explicitly reset timer
    nextSpawnTimeRef.current = 0;
    buildingsLostInLevelRef.current = 0;
    enemiesDestroyedRef.current = 0;
    lastShotTimeRef.current = 0;
    lastTurretFireTimeRef.current = 0;
    warningPlayedRef.current = false;
    gameOverStartRef.current = 0;
    
    // Reset combo
    multiplierRef.current = 1;
    lastKillTimeRef.current = 0;
    setDisplayMultiplier(1);
    
    // Reset Shield Energy
    shieldEnergyRef.current = upgradeStats.shieldLevel * 100;
    shieldHitTimeRef.current = 0;

    // Create buildings if it's level 1 (New Game) or if missing
    // We only reset buildings layout on Level 1. On subsequent levels, we keep the previous state.
    if (level === 1 || buildingsRef.current.length === 0) {
      const buildingCount = 6;
      const buildingWidth = 60;
      const gap = (width - (buildingCount * buildingWidth)) / (buildingCount + 1);
      
      const newBuildings: Building[] = [];
      for (let i = 0; i < buildingCount; i++) {
        newBuildings.push({
          id: i,
          x: gap + i * (buildingWidth + gap),
          y: height - 50,
          width: buildingWidth,
          height: 40,
          isDestroyed: false
        });
      }
      buildingsRef.current = newBuildings;
      setDisplayScore(0);
    }
  }, [level, upgradeStats.shieldLevel]);

  // Handle Mouse Click (Launch Interceptor)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState !== GameState.PLAYING) return;
    
    // Resume audio context if suspended (browser policy)
    if (audioCtxRef.current?.state === 'suspended' && !isMutedRef.current) {
      audioCtxRef.current.resume();
    }
    
    const now = Date.now();
    if (now - lastShotTimeRef.current < fireCooldown) return;
    
    playSound('shoot');
    lastShotTimeRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Spawn from bottom center
    const startX = canvas.width / 2;
    const startY = canvas.height - 20;

    interceptorsRef.current.push({
      id: Date.now() + Math.random(),
      x: startX,
      y: startY,
      startX,
      startY,
      targetX: x,
      targetY: y,
      speed: interceptorSpeed,
      exploded: false,
      trail: []
    });
  };

  const getEnemyConfig = (level: number, difficulty: Difficulty) => {
    const rand = Math.random();
    let type = EnemyType.STANDARD;
    let speedMultiplier = 1;
    let difficultySpeedMod = 1;

    // Adjust entry levels based on difficulty
    let fastStart = 2;
    let bombStart = 3; 
    let heavyStart = 4;
    let bulletStart = 5;
    let wobblyStart = 6;
    let laserStart = 7;
    
    if (difficulty === Difficulty.EASY) {
      fastStart = 3;
      bombStart = 4;
      heavyStart = 6;
      bulletStart = 7;
      wobblyStart = 8;
      laserStart = 9;
      difficultySpeedMod = 0.8;
    } else if (difficulty === Difficulty.HARD) {
      fastStart = 1; 
      bombStart = 2;
      heavyStart = 3;
      bulletStart = 3;
      wobblyStart = 5;
      laserStart = 5;
      difficultySpeedMod = 1.25;
    }

    // Weighted Random Selection based on Level
    const availableTypes = [EnemyType.STANDARD];
    
    if (level >= fastStart) availableTypes.push(EnemyType.FAST);
    if (level >= bombStart) availableTypes.push(EnemyType.BOMB);
    if (level >= heavyStart) availableTypes.push(EnemyType.HEAVY);
    if (level >= bulletStart) availableTypes.push(EnemyType.BULLET);
    if (level >= wobblyStart) availableTypes.push(EnemyType.WOBBLY);
    if (level >= laserStart) availableTypes.push(EnemyType.LASER);

    // Bias towards newer types, but keep some standards
    if (availableTypes.length > 1) {
        // Simple logic: higher chance for advanced types if unlocked
        if (rand > 0.4) {
            type = availableTypes[Math.floor(Math.random() * (availableTypes.length - 1)) + 1];
        } else {
            type = EnemyType.STANDARD;
        }
    }

    // Hard Mode specific: Chaos
    if (difficulty === Difficulty.HARD && level >= 3 && rand > 0.9) {
        type = EnemyType.FAST; 
    }

    // Config based on type
    let color = '#ef4444'; // Red (Standard)
    switch(type) {
      case EnemyType.FAST:
        speedMultiplier = 1.6;
        color = '#facc15'; // Yellow
        break;
      case EnemyType.HEAVY:
        speedMultiplier = 0.5; // Slower but bigger boom
        color = '#c2410c'; // Dark Orange
        break;
      case EnemyType.WOBBLY:
        speedMultiplier = 0.8;
        color = '#d946ef'; // Purple
        break;
      case EnemyType.BOMB:
        speedMultiplier = 0.6; // Falls slower
        color = '#1e293b'; // Slate 800 (Blackish)
        break;
      case EnemyType.BULLET:
        speedMultiplier = 2.2; // Very Fast
        color = '#cbd5e1'; // Silver
        break;
      case EnemyType.LASER:
        speedMultiplier = 2.5; // Extremely Fast
        color = '#a3e635'; // Lime
        break;
    }

    return { type, speedMultiplier: speedMultiplier * difficultySpeedMod, color };
  };

  const update = (time: number) => {
    // We allow drawing in GAME_OVER for the explosion animation
    if (gameState !== GameState.PLAYING && gameState !== GameState.GAME_OVER) return;

    const deltaTime = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;
    const now = Date.now();

    // Prevent massive jumps if tab was inactive
    if (deltaTime > 0.1) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- GAME OVER ANIMATION SEQUENCE ---
    if (gameState === GameState.GAME_OVER) {
       // Initialize Game Over timer
       if (gameOverStartRef.current === 0) {
           gameOverStartRef.current = time;
           playSound('nuke');
       }

       const animTime = (time - gameOverStartRef.current) / 1000;
       
       // Clear with fade to red/black
       if (animTime < 0.2) {
           // Flash
           ctx.fillStyle = `rgba(255, 255, 255, ${1 - animTime * 5})`;
           ctx.fillRect(0, 0, canvas.width, canvas.height);
       } else {
           // Darken existing screen first, then draw nuke
           ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.8, (animTime - 0.2) * 0.5)})`;
           ctx.fillRect(0, 0, canvas.width, canvas.height);
           
           // Shake effect
           const shakeAmt = Math.max(0, 20 - animTime * 10);
           const dx = (Math.random() - 0.5) * shakeAmt;
           const dy = (Math.random() - 0.5) * shakeAmt;
           
           ctx.save();
           ctx.translate(canvas.width/2 + dx, canvas.height/2 + dy);
           
           // Draw Expanding Nuke Ring
           const radius = Math.pow(animTime, 2) * 200;
           
           // Inner Core
           ctx.beginPath();
           ctx.arc(0, 0, radius, 0, Math.PI * 2);
           const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
           grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
           grad.addColorStop(0.3, 'rgba(255, 200, 50, 0.8)');
           grad.addColorStop(0.7, 'rgba(255, 50, 0, 0.6)');
           grad.addColorStop(1, 'rgba(50, 0, 0, 0)');
           ctx.fillStyle = grad;
           ctx.fill();
           
           // Shockwave ring
           ctx.beginPath();
           ctx.arc(0, 0, radius * 1.2, 0, Math.PI * 2);
           ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - animTime * 0.3)})`;
           ctx.lineWidth = 10;
           ctx.stroke();

           ctx.restore();
       }
       
       requestRef.current = requestAnimationFrame(() => update(performance.now()));
       return;
    }

    // --- NORMAL GAMEPLAY LOGIC ---
    
    // Combo Timeout Check
    if (multiplierRef.current > 1) {
        const timeSinceKill = now - lastKillTimeRef.current;
        if (timeSinceKill > COMBO_TIMEOUT) {
            multiplierRef.current = 1;
            setDisplayMultiplier(1);
            setComboProgress(0);
        } else {
            // Update combo bar
            setComboProgress(1 - (timeSinceKill / COMBO_TIMEOUT));
        }
    }

    // 1. Level Timer
    levelTimeRef.current += deltaTime;
    const timeLeft = Math.max(0, LEVEL_DURATION - levelTimeRef.current);
    setDisplayTime(Math.ceil(timeLeft));

    if (timeLeft <= 0) {
      // Level Complete
      onLevelComplete({
        buildingsLost: buildingsLostInLevelRef.current,
        enemiesDestroyed: enemiesDestroyedRef.current
      });
      return; // Stop updating
    }

    // 2. Audio Warning Logic
    const timeUntilSpawn = nextSpawnTimeRef.current - levelTimeRef.current;
    if (timeUntilSpawn < 0.5 && timeUntilSpawn > 0 && !warningPlayedRef.current) {
        playSound('warning');
        warningPlayedRef.current = true;
    }

    // 3. Spawn Enemies
    if (levelTimeRef.current > nextSpawnTimeRef.current) {
      const activeBuildings = buildingsRef.current.filter(b => !b.isDestroyed);
      
      if (activeBuildings.length > 0) {
        // Target a random living building or ground
        const targetB = activeBuildings[Math.floor(Math.random() * activeBuildings.length)];
        const targetX = targetB ? (targetB.x + targetB.width/2) : Math.random() * canvas.width;
        const targetY = canvas.height;
        
        let startX = Math.random() * canvas.width;
        const startY = -30;

        const baseSpeed = 50 + (level * 10);
        const { type, speedMultiplier, color } = getEnemyConfig(level, difficulty);
        
        // SPECIAL SPAWN LOGIC
        if (type === EnemyType.BOMB) {
            // Bombs fall straight down
            startX = targetX; 
        }

        const dist = Math.hypot(targetX - startX, targetY - startY);

        // INITIALIZE HEALTH
        const maxHealth = type === EnemyType.HEAVY ? 3 : 1;

        enemiesRef.current.push({
          id: Date.now() + Math.random(),
          type,
          x: startX,
          y: startY,
          startX: startX,
          startY: startY,
          targetX: targetX,
          targetY: targetY,
          totalDistance: dist,
          traveledDistance: 0,
          speed: (baseSpeed + (Math.random() * 40)) * speedMultiplier,
          color: color,
          trail: [],
          health: maxHealth,
          maxHealth: maxHealth,
          hitByExplosionIds: []
        });

        // Spawn Rate Logic
        let baseRate = Math.max(0.4, 2.5 - (level * 0.15));
        
        // Difficulty modifier for spawn rate
        let rateMod = 1;
        if (difficulty === Difficulty.EASY) rateMod = 1.3; // Slower spawns
        if (difficulty === Difficulty.HARD) rateMod = 0.7; // Faster spawns

        const spawnRate = baseRate * rateMod;
        
        nextSpawnTimeRef.current = levelTimeRef.current + (Math.random() * spawnRate);
        warningPlayedRef.current = false; // Reset warning for next spawn
      }
    }

    // 4. Auto-Turret Logic
    if (upgradeStats.turretLevel > 0) {
      if (now - lastTurretFireTimeRef.current > turretCooldown) {
        // Find closest enemy
        let closestDist = Infinity;
        let closestEnemy: EnemyMissile | null = null;
        
        const turretX = 60; // Left side
        const turretY = canvas.height - 40;

        enemiesRef.current.forEach(e => {
          const d = Math.hypot(e.x - turretX, e.y - turretY);
          if (d < closestDist && e.y < canvas.height - 100) { // Don't shoot if too close to ground (visuals)
            closestDist = d;
            closestEnemy = e;
          }
        });

        if (closestEnemy) {
          // Fire!
          const angle = Math.atan2((closestEnemy as EnemyMissile).y - turretY, (closestEnemy as EnemyMissile).x - turretX);
          const pSpeed = 800;
          projectilesRef.current.push({
            id: now + Math.random(),
            x: turretX,
            y: turretY,
            velocityX: Math.cos(angle) * pSpeed,
            velocityY: Math.sin(angle) * pSpeed,
            speed: pSpeed,
            trail: []
          });
          lastTurretFireTimeRef.current = now;
          playSound('turret_shoot');
        }
      }
    }

    // Helper: Handle Kill Scoring & Combo
    const handleKill = (enemy: EnemyMissile) => {
        enemiesDestroyedRef.current += 1;
        
        // Scoring varies by type
        let baseScore = 10;
        if (enemy.type === EnemyType.FAST) baseScore = 20;
        if (enemy.type === EnemyType.BULLET) baseScore = 25;
        if (enemy.type === EnemyType.WOBBLY) baseScore = 30;
        if (enemy.type === EnemyType.LASER) baseScore = 35;
        if (enemy.type === EnemyType.HEAVY) baseScore = 40;
        if (enemy.type === EnemyType.BOMB) baseScore = 40;
        
        // Difficulty multiplier for score
        let diffMult = 1;
        if (difficulty === Difficulty.HARD) diffMult = 1.5;
        if (difficulty === Difficulty.EASY) diffMult = 0.8;

        // Combo Logic
        const timeSinceLast = now - lastKillTimeRef.current;
        if (timeSinceLast < COMBO_TIMEOUT) {
            multiplierRef.current = Math.min(multiplierRef.current + 1, 10);
        } else {
            // First kill of a chain is 1x
            multiplierRef.current = 1;
        }
        
        lastKillTimeRef.current = now;
        setDisplayMultiplier(multiplierRef.current);
        setComboProgress(1); // Reset bar

        const totalScore = Math.ceil(baseScore * diffMult * multiplierRef.current);
        setDisplayScore(s => s + totalScore);
    };

    // 5. Move Turret Projectiles
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const p = projectilesRef.current[i];
      p.x += p.velocityX * deltaTime;
      p.y += p.velocityY * deltaTime;
      
      // Trail
      p.trail.push({x: p.x, y: p.y});
      if (p.trail.length > 5) p.trail.shift();

      // Bounds check
      if (p.x < 0 || p.x > canvas.width || p.y < 0) {
        projectilesRef.current.splice(i, 1);
        continue;
      }

      // Hit Check
      for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
        const e = enemiesRef.current[j];
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist < 20) {
          // HIT!
          projectilesRef.current.splice(i, 1); // Remove projectile
          
          e.health -= 1; // Reduce Health

          if (e.health <= 0) {
              // DESTROYED
              enemiesRef.current.splice(j, 1);
              
              explosionsRef.current.push({
                id: Date.now(),
                x: e.x,
                y: e.y,
                currentRadius: 5,
                maxRadius: 30,
                alpha: 1
              });
              playSound('explode_normal');
              handleKill(e);
          } else {
              // DAMAGED BUT ALIVE
              explosionsRef.current.push({
                id: Date.now() + Math.random(),
                x: e.x,
                y: e.y,
                currentRadius: 2,
                maxRadius: 10,
                alpha: 1
              });
              // No kill count, no sound (or quiet sound)
          }
          break; // Projectile done
        }
      }
    }

    // 6. Move Interceptors
    for (let i = interceptorsRef.current.length - 1; i >= 0; i--) {
      const missile = interceptorsRef.current[i];
      const dx = missile.targetX - missile.x;
      const dy = missile.targetY - missile.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Update Trail
      missile.trail.push({ x: missile.x, y: missile.y });
      if (missile.trail.length > 20) missile.trail.shift();

      // Move
      if (dist < missile.speed * deltaTime) {
        // Reached target
        missile.x = missile.targetX;
        missile.y = missile.targetY;
        missile.exploded = true;
        
        // Create Explosion
        explosionsRef.current.push({
          id: Date.now() + Math.random(),
          x: missile.x,
          y: missile.y,
          currentRadius: 1,
          maxRadius: explosionMaxRadius,
          alpha: 1
        });
        
        interceptorsRef.current.splice(i, 1);
      } else {
        const angle = Math.atan2(dy, dx);
        missile.x += Math.cos(angle) * missile.speed * deltaTime;
        missile.y += Math.sin(angle) * missile.speed * deltaTime;
      }
    }

    // 7. Update Explosions
    for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
      const exp = explosionsRef.current[i];
      exp.currentRadius += 100 * deltaTime; // Expand speed
      if (exp.currentRadius > exp.maxRadius) {
        exp.alpha -= 2 * deltaTime; // Fade speed
        if (exp.alpha <= 0) {
          explosionsRef.current.splice(i, 1);
        }
      }
    }

    // 8. Move Enemies & Collisions
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const enemy = enemiesRef.current[i];
      
      enemy.traveledDistance += enemy.speed * deltaTime;
      const t = enemy.traveledDistance / enemy.totalDistance;

      // Update Trail
      enemy.trail.push({ x: enemy.x, y: enemy.y });
      // Wobbly trails need to be longer to see the pattern
      const maxTrail = (enemy.type === EnemyType.WOBBLY || enemy.type === EnemyType.LASER) ? 40 : 25;
      if (enemy.trail.length > maxTrail) enemy.trail.shift();

      // Base Linear Position
      let currentX = enemy.startX + (enemy.targetX - enemy.startX) * t;
      let currentY = enemy.startY + (enemy.targetY - enemy.startY) * t;

      // Apply Modifiers based on Type
      if (enemy.type === EnemyType.WOBBLY) {
        // Perpendicular offset sine wave
        const dx = enemy.targetX - enemy.startX;
        const dy = enemy.targetY - enemy.startY;
        const angle = Math.atan2(dy, dx);
        
        // Perpendicular vector (-y, x)
        const perpX = Math.cos(angle + Math.PI/2);
        const perpY = Math.sin(angle + Math.PI/2);
        
        // Amplitude: 60px, Frequency: based on distance
        const wave = Math.sin(enemy.traveledDistance * 0.03) * 60;
        
        currentX += perpX * wave;
        currentY += perpY * wave;
      }

      enemy.x = currentX;
      enemy.y = currentY;

      // --- SHIELD COLLISION ---
      if (upgradeStats.shieldLevel > 0 && shieldEnergyRef.current > 0) {
        const shieldX = canvas.width / 2;
        const shieldY = canvas.height - 20;
        // Shield visual radius varies slightly with energy
        const baseShieldRadius = 180;
        const energyPct = shieldEnergyRef.current / shieldMaxEnergy;
        // Visually the shield shrinks a tiny bit as it gets weaker
        const visualShieldRadius = baseShieldRadius * (0.9 + (0.1 * energyPct));
        
        const distToShield = Math.hypot(enemy.x - shieldX, enemy.y - shieldY);
        
        if (distToShield < visualShieldRadius) {
           // Blocked by Shield!
           handleKill(enemy); // Award points for shield defense

           shieldEnergyRef.current -= 30; // Damage to shield
           if (shieldEnergyRef.current < 0) shieldEnergyRef.current = 0;
           
           shieldHitTimeRef.current = Date.now();
           
           // Visual Feedback
           playSound('shield_hit', shieldEnergyRef.current / shieldMaxEnergy);
           
           // Small explosion
           explosionsRef.current.push({
            id: Date.now(),
            x: enemy.x,
            y: enemy.y,
            currentRadius: 5,
            maxRadius: 20,
            alpha: 1
          });
          
          enemiesRef.current.splice(i, 1);
          continue;
        }
      }

      // Check Collision with Explosions
      let destroyed = false;
      for (const exp of explosionsRef.current) {
        const distToExp = Math.hypot(enemy.x - exp.x, enemy.y - exp.y);
        
        if (distToExp < exp.currentRadius) {
          // Check if this specific explosion ID has already hit this enemy
          if (!enemy.hitByExplosionIds.includes(exp.id)) {
              enemy.hitByExplosionIds.push(exp.id);
              enemy.health -= 1;
              
              if (enemy.health <= 0) {
                  destroyed = true;
                  handleKill(enemy);
                  
                  // Explosion effect for the missile itself
                  explosionsRef.current.push({
                    id: Date.now(),
                    x: enemy.x,
                    y: enemy.y,
                    currentRadius: 5,
                    maxRadius: 30,
                    alpha: 1
                  });
                  playSound(enemy.type === EnemyType.HEAVY ? 'explode_heavy' : 'explode_normal');
                  break; 
              } else {
                  // Survived Hit - Spark effect
                  explosionsRef.current.push({
                    id: Date.now() + Math.random(),
                    x: enemy.x,
                    y: enemy.y,
                    currentRadius: 2,
                    maxRadius: 10,
                    alpha: 1
                  });
              }
          }
        }
      }

      if (destroyed) {
        enemiesRef.current.splice(i, 1);
        continue;
      }

      // Check Collision with Ground/Buildings
      if (t >= 1 || enemy.y >= canvas.height - 40) {
        // Check if hit a building
        let hitBuilding = false;
        
        // Bomb impact is larger
        const impactRadius = (enemy.type === EnemyType.BOMB || enemy.type === EnemyType.HEAVY) ? 90 : 40;

        for (const b of buildingsRef.current) {
          if (!b.isDestroyed && enemy.x >= b.x && enemy.x <= b.x + b.width) {
            b.isDestroyed = true;
            hitBuilding = true;
            buildingsLostInLevelRef.current += 1;
            
            // BREAK COMBO ON DAMAGE
            multiplierRef.current = 1;
            setDisplayMultiplier(1);
            setComboProgress(0);
            
            // Explosion at impact
            explosionsRef.current.push({
              id: Date.now(),
              x: enemy.x,
              y: canvas.height - 30,
              currentRadius: 1,
              maxRadius: impactRadius, 
              alpha: 1
            });
            playSound('explode_heavy');
          }
        }
        
        // If it hit ground but no building, still explode
        if (!hitBuilding) {
           explosionsRef.current.push({
              id: Date.now(),
              x: enemy.x,
              y: canvas.height - 20,
              currentRadius: 1,
              maxRadius: impactRadius - 20, // Slightly smaller if hitting ground
              alpha: 1
            });
            playSound(enemy.type === EnemyType.HEAVY ? 'explode_heavy' : 'explode_normal');
        }
        
        enemiesRef.current.splice(i, 1);

        // Check Game Over (All buildings destroyed)
        if (buildingsRef.current.every(b => b.isDestroyed)) {
          onGameOver(displayScore); // Pass final score
          return;
        }
      }
    }

    // --- DRAWING ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Sky Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1e293b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Ground
    ctx.fillStyle = '#1c1917'; // Dark stone
    ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

    // Draw Static Defenses (Back Layer)
    
    // Auto-Turret
    if (upgradeStats.turretLevel > 0) {
       const tx = 60;
       const ty = canvas.height - 25;
       
       // Base
       ctx.fillStyle = '#4c1d95'; // Purple base
       ctx.fillRect(tx - 15, ty, 30, 20);
       
       // Turret Head (Aiming?)
       ctx.save();
       ctx.translate(tx, ty);
       // Simple bob animation or rotation
       // For now just draw it
       ctx.fillStyle = '#a78bfa';
       ctx.beginPath();
       ctx.arc(0, 0, 12, 0, Math.PI * 2);
       ctx.fill();
       ctx.restore();
    }

    // Draw Buildings
    buildingsRef.current.forEach(b => {
      if (!b.isDestroyed) {
        // Building Body
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(b.x, b.y, b.width, b.height);
        
        // Windows (simple effect)
        ctx.fillStyle = '#fef08a'; // Light on
        for(let wx = b.x + 5; wx < b.x + b.width; wx += 15) {
             for(let wy = b.y + 5; wy < b.y + b.height; wy += 12) {
                 if (Math.random() > 0.3) ctx.fillRect(wx, wy, 8, 8);
             }
        }
      } else {
        // Rubble
        ctx.fillStyle = '#44403c';
        ctx.beginPath();
        ctx.moveTo(b.x, canvas.height - 20);
        ctx.lineTo(b.x + 10, canvas.height - 30);
        ctx.lineTo(b.x + 30, canvas.height - 25);
        ctx.lineTo(b.x + 50, canvas.height - 35);
        ctx.lineTo(b.x + b.width, canvas.height - 20);
        ctx.fill();
      }
    });

    // Draw Defense Battery (Center)
    // Upgraded Battery Appearance
    const batteryColor = upgradeStats.rateLevel > 1 ? '#3b82f6' : '#64748b';
    ctx.fillStyle = batteryColor;
    
    // Base
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height - 20, 20, Math.PI, 0);
    ctx.fill();
    
    // Tech lines for upgraded battery
    if (upgradeStats.rateLevel > 0) {
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height - 20, 12, Math.PI, 0);
        ctx.stroke();
    }
    
    // Draw Battery "Cooldown" status (small light on battery)
    const onCooldown = (Date.now() - lastShotTimeRef.current) < fireCooldown;
    ctx.fillStyle = onCooldown ? '#ef4444' : '#22c55e';
    ctx.shadowBlur = onCooldown ? 0 : 5;
    ctx.shadowColor = '#22c55e';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height - 20, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Energy Shield
    if (upgradeStats.shieldLevel > 0 && shieldEnergyRef.current > 0) {
       const shieldX = canvas.width / 2;
       const shieldY = canvas.height - 20;
       
       const energyPct = shieldEnergyRef.current / shieldMaxEnergy;
       const baseRadius = 180;
       const radius = baseRadius * (0.9 + (0.1 * energyPct));
       
       ctx.beginPath();
       ctx.arc(shieldX, shieldY, radius, Math.PI, 0); // Half circle
       
       const shieldGrad = ctx.createRadialGradient(shieldX, shieldY, radius * 0.8, shieldX, shieldY, radius);
       
       // VISUAL DEGRADATION: Color shifts from Blue (High) -> Cyan (Med) -> Red (Low)
       let r, g, b;
       
       if (energyPct > 0.5) {
           // Blue to Cyan
           r = 59;
           g = 130 + Math.floor(100 * (1 - energyPct)); // More green as it levels up
           b = 246;
       } else {
           // Cyan to Red (Critical)
           r = 59 + Math.floor(180 * (1 - (energyPct * 2))); 
           g = 130 - Math.floor(100 * (1 - (energyPct * 2)));
           b = 246 - Math.floor(200 * (1 - (energyPct * 2)));
       }
       
       // Explicit Override for Low Energy RED alert
       if (energyPct < 0.25) {
           r = 239; g = 68; b = 68;
       } else if (energyPct > 0.7) {
           r = 59; g = 130; b = 246; // Solid Blue
       }

       // Hit Flash Effect
       const timeSinceHit = Date.now() - shieldHitTimeRef.current;
       if (timeSinceHit < 100) {
           r = 255; g = 255; b = 255; // Flash White
       }
       
       // Pulse Effect for Low Energy
       let alphaMod = 1;
       if (energyPct < 0.3) {
           // Fast pulse
           alphaMod = 0.5 + (Math.sin(Date.now() / 100) * 0.4); 
       }
       
       shieldGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
       shieldGrad.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${0.1 * energyPct * alphaMod})`);
       shieldGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${0.4 * energyPct * alphaMod})`);
       
       ctx.fillStyle = shieldGrad;
       ctx.fill();
       
       ctx.lineWidth = energyPct < 0.3 ? (3 + Math.sin(Date.now() / 50)) : 2;
       ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.6 * energyPct * alphaMod})`;
       ctx.stroke();
    }

    // Draw Turret Projectiles
    ctx.fillStyle = '#d8b4fe';
    projectilesRef.current.forEach(p => {
       ctx.beginPath();
       ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
       ctx.fill();
       
       // Trail
       if (p.trail.length > 1) {
           ctx.beginPath();
           ctx.moveTo(p.trail[0].x, p.trail[0].y);
           for(let k=1; k<p.trail.length; k++) ctx.lineTo(p.trail[k].x, p.trail[k].y);
           ctx.strokeStyle = `rgba(167, 139, 250, 0.5)`;
           ctx.lineWidth = 1;
           ctx.stroke();
       }
    });

    // Draw Incoming Missiles
    enemiesRef.current.forEach(e => {
      // Draw Trail (Segmented Gradient)
      if (e.trail.length > 1) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (e.type === EnemyType.LASER) {
             // Continuous Beam Effect for Laser
             ctx.beginPath();
             ctx.moveTo(e.trail[0].x, e.trail[0].y);
             for (let k = 1; k < e.trail.length; k++) {
                 ctx.lineTo(e.trail[k].x, e.trail[k].y);
             }
             
             // Glow
             ctx.shadowBlur = 15;
             ctx.shadowColor = '#a3e635'; 
             ctx.lineWidth = 5;
             ctx.strokeStyle = 'rgba(163, 230, 53, 0.5)'; 
             ctx.stroke();
             
             // Core
             ctx.shadowBlur = 0;
             ctx.lineWidth = 1.5;
             ctx.strokeStyle = '#ffffff'; // White core
             ctx.stroke();
             
        } else {
            // Custom Widths
            let lineWidth = 3;
            if (e.type === EnemyType.HEAVY) lineWidth = 8;
            if (e.type === EnemyType.FAST) lineWidth = 2;
            if (e.type === EnemyType.WOBBLY) lineWidth = 3;
            if (e.type === EnemyType.BULLET) lineWidth = 1;

            ctx.lineWidth = lineWidth;
            
            for (let k = 0; k < e.trail.length - 1; k++) {
                const p1 = e.trail[k];
                const p2 = e.trail[k+1];
                // Calculate opacity based on position in trail (older = transparent)
                const opacity = k / e.trail.length;
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                
                let strokeColor = '';
                
                if (e.type === EnemyType.HEAVY) {
                    // Smoky dark trail
                    strokeColor = `rgba(50, 20, 20, ${opacity * 0.8})`; 
                } else if (e.type === EnemyType.FAST) {
                    // Bright yellow with hot center
                    strokeColor = `rgba(255, 255, 100, ${opacity})`;
                } else if (e.type === EnemyType.WOBBLY) {
                    // Glitchy purple/cyan split
                    strokeColor = `rgba(217, 70, 239, ${opacity})`;
                } else if (e.type === EnemyType.BULLET) {
                    // Silver
                    strokeColor = `rgba(203, 213, 225, ${opacity * 0.5})`;
                } else if (e.type === EnemyType.BOMB) {
                    // Dark bomb trail
                    strokeColor = `rgba(30, 41, 59, ${opacity * 0.6})`;
                } else {
                    // Standard red
                    strokeColor = `rgba(239, 68, 68, ${opacity})`;
                }
                
                ctx.strokeStyle = strokeColor;
                ctx.stroke();

                // Additional "Hot core" for Fast missiles
                if (e.type === EnemyType.FAST) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.stroke();
                    ctx.lineWidth = lineWidth; // Reset
                }

                // Secondary "Glitch" line for Wobbly missiles
                if (e.type === EnemyType.WOBBLY) {
                    // Main trail
                    ctx.strokeStyle = `rgba(217, 70, 239, ${opacity})`;
                    ctx.stroke();
                    
                    // Glitch trail (Offset + Jitter)
                    ctx.beginPath();
                    const jitter = (Math.random() * 4) - 2;
                    ctx.moveTo(p1.x + 4 + jitter, p1.y);
                    ctx.lineTo(p2.x + 4 + jitter, p2.y);
                    ctx.strokeStyle = `rgba(34, 211, 238, ${opacity * 0.7})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.lineWidth = 3; // Reset
                }
            }
        }
      }

      // Calculate rotation based on velocity vector
      let angle = Math.atan2(e.targetY - e.startY, e.targetX - e.startX);
      // For wobbly, use local tangent if enough trail exists
      if (e.type === EnemyType.WOBBLY && e.trail.length > 1) {
           const p1 = e.trail[e.trail.length - 1];
           const p2 = e.trail[e.trail.length - 2];
           angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(angle); 

      // Draw Missile Shape (Pointing RIGHT > in local coords)
      ctx.fillStyle = e.color;
      
      if (e.type === EnemyType.HEAVY) {
          // HEAVY: Large Orb
          // Body
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
          // Core
          ctx.fillStyle = '#450a0a';
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.arc(-3, -3, 3, 0, Math.PI * 2);
          ctx.fill();

      } else if (e.type === EnemyType.FAST) {
          // FAST: Sharp Dart with Glow
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#fff'; // Inner Glow

          // Shape: Long sharp triangle pointing Right
          ctx.beginPath();
          ctx.moveTo(15, 0); // Nose
          ctx.lineTo(-10, 5); // Back Right
          ctx.lineTo(-5, 0);  // Engine recess
          ctx.lineTo(-10, -5); // Back Left
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0; // Reset
          
          // Engine Glow
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(-15, 0);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();

      } else if (e.type === EnemyType.WOBBLY) {
           // WOBBLY: Diamond
           ctx.beginPath();
           ctx.moveTo(8, 0);
           ctx.lineTo(0, 6);
           ctx.lineTo(-8, 0);
           ctx.lineTo(0, -6);
           ctx.closePath();
           ctx.fill();
           
           // "Glitch" - random rects
           ctx.fillStyle = '#22d3ee'; // Cyan
           if (Math.random() > 0.5) ctx.fillRect(-4, -2, 8, 2);
           if (Math.random() > 0.5) ctx.fillRect(-2, 1, 4, 2);

      } else if (e.type === EnemyType.BOMB) {
           // BOMB: Teardrop / Fat body
           ctx.beginPath();
           ctx.arc(0, 0, 8, 0, Math.PI * 2); // Body
           ctx.fill();
           
           // Fins on back
           ctx.fillStyle = '#475569';
           ctx.fillRect(-10, -8, 4, 16);
           
           // Red blinking light
           if (Math.floor(Date.now() / 200) % 2 === 0) {
               ctx.fillStyle = '#ef4444';
               ctx.beginPath();
               ctx.arc(0, 0, 3, 0, Math.PI * 2);
               ctx.fill();
           }

      } else if (e.type === EnemyType.BULLET) {
           // BULLET: Simple thin rectangle
           ctx.fillRect(-6, -2, 12, 4);
           // Shine
           ctx.fillStyle = '#fff';
           ctx.fillRect(-2, -1, 4, 2);

      } else if (e.type === EnemyType.LASER) {
           // LASER: Long thin glowing beam head
           ctx.shadowBlur = 10;
           ctx.shadowColor = '#a3e635';
           ctx.fillRect(-15, -1.5, 30, 3);
           ctx.shadowBlur = 0;
           
           // Core
           ctx.fillStyle = '#ecfccb';
           ctx.fillRect(-15, -0.5, 30, 1);

      } else {
          // STANDARD: Red Arc / Streamlined Shape
          // A crescent-like aerodynamic shape
          ctx.beginPath();
          ctx.moveTo(10, 0); // Nose
          ctx.quadraticCurveTo(0, 6, -8, 6); // Bottom arc
          ctx.lineTo(-6, 0); // Indent
          ctx.lineTo(-8, -6); // Top back
          ctx.quadraticCurveTo(0, -6, 10, 0); // Top arc
          ctx.fill();
      }

      ctx.restore();
      
      // Outer Glow for specific types (Standard also gets a small one)
      ctx.shadowBlur = (e.type === EnemyType.FAST || e.type === EnemyType.LASER) ? 20 : 5;
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 0; // Reset

      // DRAW HEALTH BAR
      if (e.maxHealth > 1) {
         // Draw above missile (e.y - 20)
         const barWidth = 24;
         const barHeight = 4;
         const barX = e.x - barWidth/2;
         const barY = e.y - 20;

         // Background
         ctx.fillStyle = 'rgba(0,0,0,0.5)';
         ctx.fillRect(barX, barY, barWidth, barHeight);

         // Health Percent
         const pct = Math.max(0, e.health / e.maxHealth);
         
         // Color mapping
         if (pct > 0.5) ctx.fillStyle = '#22c55e'; // Green
         else if (pct > 0.25) ctx.fillStyle = '#eab308'; // Yellow
         else ctx.fillStyle = '#ef4444'; // Red

         ctx.fillRect(barX, barY, barWidth * pct, barHeight);
      }
    });

    // Draw Interceptors
    interceptorsRef.current.forEach(i => {
      // VISUAL UPGRADE: Speed affects trail
      const isUpgradedSpeed = upgradeStats.speedLevel > 0;
      const trailWidth = 2 + (upgradeStats.speedLevel * 0.5);
      
      // Draw Trail (Segmented)
      if (i.trail.length > 1) {
        ctx.lineWidth = trailWidth;
        ctx.lineCap = 'round';
        
        for (let k = 0; k < i.trail.length - 1; k++) {
            const p1 = i.trail[k];
            const p2 = i.trail[k+1];
            const opacity = (k / i.trail.length) * 0.8; // Max 0.8 opacity
            
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            
            const r = isUpgradedSpeed ? 59 : 96;
            const g = isUpgradedSpeed ? 130 : 165;
            const b = isUpgradedSpeed ? 246 : 250;
            
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            ctx.stroke();
        }
        
        // Extra hot core for high speed
        if (upgradeStats.speedLevel > 1) {
            ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
      }

      // Missile Head
      ctx.fillStyle = '#bfdbfe';
      ctx.beginPath();
      // VISUAL UPGRADE: Radius payload makes head slightly bigger visually
      const headSize = 2 + (upgradeStats.radiusLevel * 0.3);
      ctx.arc(i.x, i.y, headSize, 0, Math.PI * 2);
      ctx.fill();
      
      // Engine flare
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#60a5fa';
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw Explosions
    explosionsRef.current.forEach(exp => {
      // Main Blast
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.currentRadius, 0, Math.PI * 2);
      // Hotter color for higher levels
      const red = 251;
      const green = Math.max(100, 146 - (upgradeStats.radiusLevel * 20)); // More red/white as it levels up
      ctx.fillStyle = `rgba(${red}, ${green}, 60, ${exp.alpha})`;
      ctx.fill();
      
      ctx.strokeStyle = `rgba(255, 255, 255, ${exp.alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // VISUAL UPGRADE: Shockwaves for radius
      if (upgradeStats.radiusLevel > 0) {
          ctx.beginPath();
          // Inner shockwave
          ctx.arc(exp.x, exp.y, exp.currentRadius * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${exp.alpha * 0.7})`;
          ctx.lineWidth = 1 + upgradeStats.radiusLevel;
          ctx.stroke();
      }
      
      if (upgradeStats.radiusLevel > 2) {
          ctx.beginPath();
          // Outer ripple
          ctx.arc(exp.x, exp.y, exp.currentRadius * 0.85, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 200, 100, ${exp.alpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.stroke();
      }
    });

    requestRef.current = requestAnimationFrame(() => update(performance.now()));
  };

  useEffect(() => {
    // Set canvas size
    if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
    }
    
    // Init level when level changes or we start playing
    if (gameState === GameState.PLAYING) {
        // Only init if we are NOT resuming from PAUSED
        if (prevGameStateRef.current !== GameState.PAUSED) {
            initLevel();
        }
    }

    if (gameState === GameState.PLAYING || gameState === GameState.GAME_OVER) {
        requestRef.current = requestAnimationFrame((time) => {
            lastTimeRef.current = time;
            update(time);
        });
    }

    // Update prev state
    prevGameStateRef.current = gameState;

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, level, initLevel]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="block absolute top-0 left-0 z-0 cursor-crosshair"
        onClick={handleCanvasClick}
      />
      
      {(gameState === GameState.PLAYING || gameState === GameState.PAUSED) && (
        <div className="absolute top-4 left-4 right-4 flex justify-between z-10 pointer-events-none">
          <div className="flex flex-col items-start gap-1">
             <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-lg flex gap-4 items-center shadow-lg shadow-blue-500/10">
                <div className="text-blue-400 font-bold font-mono text-xl">
                  נקודות: {displayScore}
                </div>
                {/* COMBO INDICATOR */}
                {displayMultiplier > 1 && (
                    <div className={`relative px-2 py-1 rounded font-black italic transform transition-all ${
                        displayMultiplier >= 5 ? 'text-red-500 scale-110 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 
                        displayMultiplier >= 3 ? 'text-orange-400' : 'text-yellow-300'
                    }`}>
                        x{displayMultiplier}
                        {/* Combo Bar */}
                        <div className="absolute -bottom-1 left-0 h-1 bg-current rounded-full transition-all duration-100" 
                             style={{width: `${comboProgress * 100}%`, opacity: 0.7}} 
                        />
                    </div>
                )}
             </div>
             {highScore > 0 && (
               <div className="bg-slate-900/60 border border-slate-700 px-2 py-1 rounded text-yellow-400 font-mono text-sm">
                  שיא: {highScore}
               </div>
             )}
          </div>
          
          <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-lg text-red-400 font-bold font-mono text-xl shadow-lg shadow-red-500/10">
            זמן שנותר: {displayTime}
          </div>
        </div>
      )}
    </>
  );
};

export default GameCanvas;
