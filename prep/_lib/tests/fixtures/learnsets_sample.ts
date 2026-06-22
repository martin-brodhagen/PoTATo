// Realistic sample of Champions mod learnsets.ts — M-B-relevant species
export const Learnsets: {[k: string]: ModdedLearnsetData} = {
  pikachu: {
    learnset: {
      tackle: ["9L1"],
      tailwhip: ["9L1"],
      thunderwave: ["9L4"],
      quickattack: ["9L8"],
      // line with comment
      doubleteam: ["9L12"],
      slam: ["9L16", "9M"],
      /* block comment between entries */
      thunderbolt: ["9L20", "9M", "9T"],
      agility: ["9L24"],
      thunder: ["9L28", "9M"],
    },
  },
  garchomp: {
    learnset: {
      tackle: ["9L1"],
      sandattack: ["9L1"],
      dragonrage: ["9L6"],
      sandstorm: ["9L12"],
      slash: ["9L18"],
      dragonclaw: ["9L24", "9M"],
      earthquake: ["9L30", "9M"],
      outrage: ["9L36"],
    },
  },
  // M-B new species
  annihilape: {
    learnset: {
      // empty learnset is valid
    },
  },
};
