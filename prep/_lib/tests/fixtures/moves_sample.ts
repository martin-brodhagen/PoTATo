// Realistic sample of Champions mod moves.ts — only M-B-relevant species referenced
export const Moves: {[k: string]: ModdedMoveData} = {
  absorb: {
    inherit: true,
    shortDesc: "Heals 50% of damage dealt.",
    desc: "A nutrient-draining attack. The user's HP is restored by half the damage taken by the target.",
    pp: 24,
    category: "Special",
  },
  bite: {
    inherit: true,
    basePower: 60,
    shortDesc: "30% chance to flinch the target.",
    flags: {
      bite: 1,
      // has a comment inside
      protect: 1,
      mirror: 1,
    },
    onTryHit(target, source, move) {
      // function reference — should be dropped (key absent or value None)
    },
  },
  /* multi-line
     block comment between entries */
  celebrate: {
    inherit: true,
    shortDesc: "No competitive use. Celebrates victory.",
    onHit(target, source) {
      // empty function
    },
  },
  doubleslap: {
    inherit: true,
    /* nested
       block */
    shortDesc: "Hits 2-5 times in one turn.",
    multihit: [2, 5],
  },
  weatherball: {
    shortDesc: "Power and type vary with the weather.",
    basePower: 50,
    type: "Normal",
  },
  // M-B-specific move (M-B introduces 6 new moves)
  ragingbull: {
    shortDesc: "Type varies based on the user's form.",
    basePower: 90,
    category: "Physical",
  },
  // Move with inheritable signature
  dragonascent: {
    inherit: true,
    basePower: 120,
    shortDesc: "Lowers user's Def and Sp. Def by 1.",
    self: {
      boosts: {
        def: -1,
        spd: -1,
      },
    },
  },
};
