// Solara Bay Run — configuration: the course, the aircraft and the rules.
// Everything is tuned so a first-time pilot can finish the course, and a
// good pilot can finish it fast, smooth and on the centreline.
export const STEP = 1 / 60;
export const BEST_KEY = 'solara-bay-run-best';

// World units are feet. The course runs north from Runway 1 (Solara Field)
// across the bay to Runway 2 (North Strip), about 9,000 ft of island flying.
export const RUNWAY_1 = { x: 0, z: 0, heading: 0, length: 2600, width: 120 };
export const RUNWAY_2 = { x: 600, z: -11800, heading: 0, length: 2600, width: 120 };

// Rings: the route a pilot flies. x east, z south (north is -z), alt in feet.
// Ring 1 sits 2,000 ft out, so a pilot has room to climb, turn and line up
// after takeoff before the first hoop.
export const RINGS = [
  { x: -150, z: -2000, alt: 450, r: 90 },
  { x: -700, z: -3100, alt: 560, r: 90 },
  { x: -250, z: -4200, alt: 700, r: 85 },
  { x: 500, z: -5300, alt: 620, r: 85 },
  { x: 1100, z: -6300, alt: 780, r: 80 },
  { x: 700, z: -7300, alt: 640, r: 80 },
  { x: 200, z: -7800, alt: 480, r: 85 },
  { x: 600, z: -8800, alt: 250, r: 90 }, // low and lined up: the final starts here
];

export const RING_SCORE = 100;
export const LANDING_BASE = 500;
export const TIME_BONUS_MAX = 300;
export const PAR_TIME = 150; // seconds; beat it for the full time bonus

// The aircraft: a single-engine bush plane, forgiving on purpose.
export const PLANE = {
  minSpeed: 38, // knots; below this the wing stops flying
  cruiseSpeed: 150, // knots at full throttle, level
  maxSpeed: 185,
  climbRate: 22, // ft/s at full throttle, best climb
  sinkRate: 9, // ft/s gliding, throttle idle
  // A turn tightens as the wing slows: the turn rate is (bank * K) / speed,
  // so at 70 knots the plane can swing around a ring, and at 180 it needs
  // room. Below 25 knots the wheels are on the ground and it cannot turn.
  turnK: 90, // knot-radians per second at full bank
  maxPitch: 0.32, // rad, about 18 degrees
  maxRoll: 0.8, // rad, about 46 degrees
  takeoffSpeed: 68, // knots; rotate at or above this
  fuelSeconds: 420, // generous: the course takes about 150 s
};

export const SEA_LEVEL = 0;
// Terrain height comes from the islands in world.js; nothing here is a guess.
