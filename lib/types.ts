export interface Species {
  id: string;
  name: string;
  num: number;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: Record<string, string>;
  forme: string | null;
  baseSpecies: string | null;
  requiredItem: string | null;
  heightm: number | null;
  weightkg: number | null;
  color: string | null;
  moveCount: number;
}

export interface Move {
  num: number;
  accuracy: number | boolean;
  basePower: number;
  category: string;
  name: string;
  pp: number;
  priority: number;
  type: string;
  flags?: string[];
  effectCategories?: string[];
  range?: string;
  secondary?: { chance: number; boosts?: Record<string, number>; status?: string; volatileStatus?: string } | null;
  desc?: string;
  shortDesc?: string;
  isNonstandard?: string | null;
  learnedBy?: string[];
}

export interface Ability {
  name: string;
  desc: string;
  pokemon: string[];
  effectCategories?: string[];
}

export interface Item {
  name: string;
  num: number;
  desc?: string;
  shortDesc?: string;
  isNonstandard?: string | null;
  megaStone?: Record<string, string> | null;
  itemUser?: string[] | null;
}

export interface FilterFlag {
  category: 'type' | 'ability' | 'move' | 'pokemon' | 'classification' | 'effect' | 'range' | 'ability_category';
  id: string;
  label: string;
}

export interface TeamSlot {
  speciesId: string | null;
  ability?: string | null;
  nature?: string | null;
  moves?: (string | null)[];
  stats?: Record<string, number>;
  gender?: string;
  item?: string | null;
}

export interface Team {
  id: string;
  name: string;
  format: FormatId;
  slots: [TeamSlot, TeamSlot, TeamSlot, TeamSlot, TeamSlot, TeamSlot];
}

export type FormatId = 'm-a' | 'm-b' | 'm-mega';

export interface FormatData {
  index: Species[];
  learnsets: Record<string, string[]>;
  moves: Record<string, Move>;
  movesWithLearnsets: Record<string, Move>;
  abilities: Record<string, Ability>;
  items: Record<string, Item>;
}

export type DataCache = Partial<FormatData>;

export type SpriteMap = Record<string, string>;
