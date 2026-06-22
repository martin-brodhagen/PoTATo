// Realistic sample of PS data/text/pokedex.ts (i18n source) — M-B-relevant species
export const PokedexText: {[k: string]: PokedexTextEntry} = {
  pikachu: {
    desc: "Whenever Pikachu meets somebody, it charges its electric cheeks. The more charged they are, the more voltage they produce. It can shock with over 100,000 volts.",
  },
  charizard: {
    desc: "Charizard flies around the sky in search of powerful opponents. It breathes fire of such great heat that it melts anything.",
  },
  garchomp: {
    desc: "It is said that when one runs at high speed, its wings create blades of wind that can fell nearby trees.",
  },
  meowstic: {
    desc: "When in danger, it raises its ears, releases psychic energy, and overwhelms its opponents.",
  },
  /* comment-only entry should still produce an empty dict */
  gholdengo: {},
  /* entry with apostrophe in description */
  farfetchd: {
    desc: "Farfetch'd is always seen with a stick from a plant. If the stick breaks, Farfetch'd will sometimes repair it with a leek.",
  },
  // M-B introduced new species
  annihilape: {
    desc: "Its rage has transformed it. The leash it once held is now wrapped around its own body.",
  },
  "mr-mime": {
    desc: "Mr. Mime is a master of pantomime. Its gestures and motions convince watchers that something invisible really exists.",
  },
  rotomheat: {
    desc: "If a microwave oven is placed in a cold spot, Rotom may possess it. This Rotom is known for its fiery personality.",
  },
};
