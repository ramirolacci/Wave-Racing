// ═══════════════════════════════════════════════════════
//  CONFIG — shared constants & utilities
// ═══════════════════════════════════════════════════════

// Track geometry
export const TRACK_WIDTH = 16;
export const CURB_W = 1.2;
export const SEG = 600;
export const DIRT_WIDTH = 14;

// Physics
export const MAX_SPEED = 40;
export const ACCEL = 22;
export const BRAKE = 35;
export const DRAG = 10;
export const TURN_RATE = 2.6;
export const GRIP_TRACK = 1.0;
export const GRIP_GRASS = 0.6;
export const DRIFT_FACTOR = 0.15;

// Particles
export const SMOKE_COUNT = 200;
export const DUST_COUNT = 150;
export const SPEED_LINE_COUNT = 80;

// Tire marks
export const MAX_TIRE_MARKS = 8000;

// Scenery clearance
export const MIN_SCENERY_DIST = TRACK_WIDTH / 2 + 4;

// Scenery material palettes
export const TRUNK_COLORS = [0x5a2d0c, 0x6b3a1f, 0x7a4a2a, 0x4a2510];
export const LEAF_COLORS = [0x1a5b1a, 0x1a7a1a, 0x2d8f2d, 0x1a6a1a, 0x0f4f0f, 0x3a9f3a];
export const AUTUMN_COLORS = [0xcc6600, 0xdd9900, 0xaa3300, 0xee7722];

// Utilities
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function rand(a, b) { return a + Math.random() * (b - a); }
