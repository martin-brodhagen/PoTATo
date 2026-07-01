export const TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];

export const TYPE_COLORS = {
  Normal: '#9099a1', Fire: '#e56c3e', Water: '#4f8ed4',
  Electric: '#e5c531', Grass: '#5fbb63', Ice: '#70cde7',
  Fighting: '#c44d4d', Poison: '#ab6ac8', Ground: '#cc9f4a',
  Flying: '#8fa8dd', Psychic: '#e26a8a', Bug: '#92bc2c',
  Rock: '#b6a14a', Ghost: '#6060b0', Dragon: '#6969cc',
  Dark: '#5a4f44', Steel: '#5a8ea2', Fairy: '#e08ee0',
};

export const MOVE_CLASSIFICATIONS = {
  bite: 'Biting', bullet: 'Ball & Bomb', contact: 'Contact', dance: 'Dance',
  punch: 'Punching', pulse: 'Pulse', wind: 'Wind', slicing: 'Slicing',
  powder: 'Powder', heal: 'Healing', sound: 'Sound-Based',
};

export const MOVE_EFFECT_CATEGORIES = {
  inflicts_status: 'Inflicts Status Condition',
  flinch: 'Chance to Flinch',
  confuse: 'Chance to Confuse',
  trap: 'Trap',
  periodic_effect: 'Periodic Effect',
  stat_drop_target: 'Stat Drop on Target',
  stat_increase_target: 'Stat Increase on Target',
  stat_drop_attacker: 'Stat Drop on Attacker',
  stat_increase_attacker: 'Stat Increase on Attacker',
  self_buff: 'Guaranteed Self Stat Buff',
  self_switch: 'Pivoting',
  force_switch: 'Forced Switching',
  priority: 'Priority',
  multi_hit: 'Multi-Hit',
  recoil: 'Recoil',
  crash_damage: 'Crash Damage',
  high_crit: 'High Crit Ratio',
  ohko: 'OHKO',
  hazard_set: 'Hazard Setting',
  hazard_remove: 'Hazard Removal',
  weather: 'Weather Setting',
  terrain: 'Terrain Setting',
  screen: 'Screen Setting',
  room: 'Room / Field Effects',
  protect: 'Protection',
  protect_break: 'Protection-Breaking',
  self_destruct: 'Self-Destruct / Sacrifice',
  thaw: 'Thaws Target',
  screen_break: 'Screen Breaking',
  special_damage: 'Special Damage Formula',
  weight_based: 'Weight-Based Damage',
};

export const RANGE_CATEGORIES = {
  self: 'Self',
  singleTarget: 'Single Target',
  singleAlly: 'Single Ally',
  allPokemon: 'All Pokémon',
  allOpponents: 'All Opponents',
  entireField: 'Entire Field',
  usersSide: "User's Side",
  opponentsSide: "Opponent's Side",
  randomOpponent: 'Random Opponent',
  varies: 'Varies',
  allAllies: 'All Allies',
};

export const ABILITY_EFFECT_CATEGORIES = {
  weather: 'Weather Related',
  terrain: 'Terrain Related',
  stats: 'Affects Stats',
  power: 'Power Boost',
  move_type: 'Changes Move Type',
  damage_reduction: 'Damage Reduction',
  immunity: 'Immunity',
  status: 'May Inflict Status Effect',
  contact: 'On Contact',
  priority: 'Affects Priority',
  bypass: 'Bypass Other Game Mechanics',
  item: 'Item Related',
  berries: 'Berries Related',
  form_change: 'Form Change',
  ability_control: 'Affects Abilities',
  healing: 'Healing',
  field_control: 'Field Control',
  switch_in_out: 'Switch In/Out',
};

export const ITEM_CATEGORIES = ['Stat Boost', 'Power Boost', 'Defense', 'Recovery', 'Effect Extend', 'Berry', 'Mega Stone', 'Other'];