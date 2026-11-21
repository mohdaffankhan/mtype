export type SoloMode = 'classic' | 'sprint' | 'zen';
export type MpMode = 'race' | 'versus';
export type ModeId = SoloMode | MpMode;

export const RACE_WAVES = 5;
export const SPRINT_SECONDS = 60;

export interface ModeInfo {
  id: ModeId;
  name: string;
  tagline: string;
  description: string;
}

export const MODES: Record<ModeId, ModeInfo> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    tagline: 'One hit ends it',
    description: 'Endless waves that grow faster and wordier. A single breach ends the run.',
  },
  sprint: {
    id: 'sprint',
    name: 'Sprint',
    tagline: `${SPRINT_SECONDS} seconds`,
    description: 'Score as much as you can in a minute. Breaches cost points, not your ship.',
  },
  zen: {
    id: 'zen',
    name: 'Zen',
    tagline: 'No pressure',
    description: 'A slow, steady drift with no game over. Find your rhythm.',
  },
  race: {
    id: 'race',
    name: 'Race',
    tagline: `First to clear wave ${RACE_WAVES}`,
    description: 'Everyone faces the exact same skies. Clear five waves before your rivals do.',
  },
  versus: {
    id: 'versus',
    name: 'Versus',
    tagline: 'Last ship standing',
    description: 'Clean words charge attacks that hurl extra asteroids at your rivals.',
  },
};

export const SOLO_MODES: SoloMode[] = ['classic', 'sprint', 'zen'];
export const MP_MODES: MpMode[] = ['race', 'versus'];

export const isLethal = (m: ModeId) => m === 'classic' || m === 'race' || m === 'versus';
export const usesWaves = (m: ModeId) => m === 'classic' || m === 'race' || m === 'versus';
