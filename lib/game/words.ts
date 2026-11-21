// Word pools by difficulty tier. Lowercase a–z only.
export const TIERS = ['short', 'medium', 'long', 'xlong'] as const;
export type Tier = (typeof TIERS)[number];

export const WORDS: Record<Tier, readonly string[]> = {
  short: [
    'orb', 'sun', 'ion', 'ray', 'arc', 'gas', 'ice', 'sky', 'jet', 'fog',
    'oak', 'zen', 'fox', 'key', 'map', 'hue', 'elm', 'ash', 'owl', 'yak',
    'dust', 'star', 'moon', 'void', 'nova', 'core', 'beam', 'rock', 'dark', 'glow',
    'hull', 'fuel', 'ring', 'belt', 'calm', 'echo', 'flux', 'mist', 'tide', 'wave',
    'pulse', 'quiet', 'iron', 'gold', 'haze', 'lens', 'node', 'path', 'rift', 'silk',
    'vast', 'warp', 'yarn', 'zone', 'kite', 'lume', 'mars', 'dune', 'opal', 'quay',
    'reef', 'sage', 'tusk', 'urge', 'veil', 'wisp', 'axis', 'bolt', 'cove', 'drum',
  ],
  medium: [
    'comet', 'orbit', 'meteor', 'photon', 'plasma', 'zenith', 'nebula', 'quasar', 'saturn', 'lunar',
    'solar', 'cosmic', 'gravity', 'vector', 'signal', 'beacon', 'harbor', 'anchor', 'shield', 'thrust',
    'engine', 'cipher', 'galaxy', 'radius', 'helium', 'carbon', 'silent', 'falcon', 'ember', 'frost',
    'glacier', 'horizon', 'jupiter', 'kinetic', 'lantern', 'magnet', 'nomad', 'oxygen', 'prism', 'quartz',
    'rocket', 'summit', 'tundra', 'umbra', 'velvet', 'willow', 'xenon', 'yonder', 'zephyr', 'aurora',
    'binary', 'cobalt', 'drifter', 'eclipse', 'fathom', 'garnet', 'hollow', 'island', 'jasper', 'kernel',
    'marble', 'nickel', 'onward', 'pilot', 'radar', 'sector', 'timber', 'uplink', 'vortex', 'whisper',
  ],
  long: [
    'asteroid', 'satellite', 'telescope', 'starlight', 'trajectory', 'momentum', 'spectrum', 'celestial',
    'atmosphere', 'magnitude', 'parallax', 'blackhole', 'supernova', 'meridian', 'stardust', 'moonlight',
    'navigator', 'frequency', 'resonance', 'threshold', 'labyrinth', 'monolith', 'obsidian', 'perimeter',
    'quadrant', 'reservoir', 'sanctuary', 'tolerance', 'universe', 'velocity', 'wanderer', 'xenolith',
    'yearning', 'zodiacal', 'amplitude', 'boundless', 'corridor', 'daybreak', 'elliptic', 'firmament',
    'geometry', 'harmonic', 'infinite', 'junction', 'kilometer', 'longitude', 'migration', 'nocturnal',
    'outpost', 'pendulum', 'radiance', 'sentinel', 'twilight', 'vigilant',
  ],
  xlong: [
    'constellation', 'interstellar', 'gravitational', 'observatory', 'magnetosphere', 'photosphere',
    'extraterrestrial', 'astronomical', 'circumference', 'equilibrium', 'hemisphere', 'luminescence',
    'perihelion', 'radioactive', 'synchronous', 'thermosphere', 'transmission', 'unidentified',
    'acceleration', 'counterweight', 'electromagnet', 'illumination', 'navigational', 'propulsion',
    'reconnaissance', 'stratosphere', 'telemetry', 'wavelength', 'atmospheric', 'spectroscopy',
  ],
};
