export function createDetailController({ breadcrumbView, nav, searchDetailView }) {
  const ctx = { breadcrumbView, nav, searchDetailView };

  return {
    setBreadcrumbView(v) { ctx.breadcrumbView = v; },
    setNav(v) { ctx.nav = v; },
    setSearchDetailView(v) { ctx.searchDetailView = v; },

    showPokemonDetail(s) {
      ctx.breadcrumbView?.push({ type: "pokemon", id: s.id, name: s.name });
      ctx.nav?.navigate("search-detail");
      ctx.searchDetailView?.showPokemonDetail(s);
    },

    showMoveDetail(moveId, move, resetTrail = false) {
      if (resetTrail) {
        ctx.breadcrumbView?.reset({ type: "move", id: moveId, name: move.name });
      } else {
        ctx.breadcrumbView?.push({ type: "move", id: moveId, name: move.name });
      }
      ctx.nav?.navigate("search-detail");
      ctx.searchDetailView?.showMoveDetail(moveId, move, resetTrail);
    },

    showAbilityDetail(abilityId, ability) {
      ctx.breadcrumbView?.push({ type: "ability", id: abilityId, name: ability.name });
      ctx.nav?.navigate("search-detail");
      ctx.searchDetailView?.showAbilityDetail(abilityId, ability);
    },

    showItemDetail(itemId, item) {
      ctx.breadcrumbView?.reset({ type: "item", id: itemId, name: item.name });
      ctx.nav?.navigate("search-detail");
      ctx.searchDetailView?.showItemDetail(itemId, item);
    },
  };
}