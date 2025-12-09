
export interface Point {
  x: number;
  y: number;
}

export interface Building {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isDestroyed: boolean;
}

export enum EnemyType {
  STANDARD = 'STANDARD',
  FAST = 'FAST',
  HEAVY = 'HEAVY',
  WOBBLY = 'WOBBLY',
  BULLET = 'BULLET',
  LASER = 'LASER',
  BOMB = 'BOMB'
}

export interface EnemyMissile {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  totalDistance: number;
  traveledDistance: number;
  speed: number;
  color: string;
  trail: Point[];
  health: number;
  maxHealth: number;
  hitByExplosionIds: number[];
}

export interface Interceptor {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  exploded: boolean;
  trail: Point[];
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  speed: number;
  trail: Point[];
}

export interface Explosion {
  id: number;
  x: number;
  y: number;
  currentRadius: number;
  maxRadius: number;
  alpha: number; // For fading out
}

export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE',
  GAME_OVER = 'GAME_OVER',
  PAUSED = 'PAUSED',
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export interface NewsReport {
  headline: string;
  description: string;
}

export interface UpgradeStats {
  speedLevel: number;
  radiusLevel: number;
  rateLevel: number;
  turretLevel: number;
  shieldLevel: number;
  targetingLevel: number;
}