/**
 * Game Configuration Constants
 */
export const GAME_CONFIG = {
  LANES: [-3, 0, 3] as const,
  LANE_WIDTH: 3,
  JUMP_FORCE: 12,
  GRAVITY: 32,
  INITIAL_SPEED: 25,
  SPEED_INCREMENT: 0.05,
  MAX_SPEED: 60,
  CHUNK_SIZE: 50, // Length of one path piece
  VISIBLE_CHUNKS: 8,
  OBSTACLE_SPAWN_CHANCE: 0.6,
  COIN_SPAWN_CHANCE: 0.4,
};

export type GameState = 'LOADING' | 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

export interface ScoreData {
  distance: number;
  coins: number;
  highScore: number;
  selectedSkin: string;
}

export interface CharacterSkin {
    id: string;
    name: string;
    color: number;
    requiredDistance: number;
}

export const SKINS: CharacterSkin[] = [
    { id: 'classic', name: 'Explorer Red', color: 0xff4444, requiredDistance: 0 },
    { id: 'forest', name: 'Forest Runner', color: 0x44ff44, requiredDistance: 100 },
    { id: 'night', name: 'Shadow Stalker', color: 0x4444ff, requiredDistance: 500 },
    { id: 'gold', name: 'Golden King', color: 0xffd700, requiredDistance: 1000 },
    { id: 'magma', name: 'Volcanic Soul', color: 0xff4400, requiredDistance: 2500 }
];
