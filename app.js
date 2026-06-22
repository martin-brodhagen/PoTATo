import {
  loadIndex,
  loadItems,
  loadAbilities,
  loadMovesWithLearnsets,
  loadSpriteMap,
  loadShinySpriteMap,
  setFormat,
  getAllCaches,
} from "./lib/data-loader.js";
import {
  createTeam,
  loadTeams,
  saveTeams,
  loadLastTeamId,
  saveLastTeamId,
  migrateFromLegacy,
} from "./lib/team-store.js";
import { initApp, createPokedexSubtabWidgets } from "./lib/app-init.js";
import {
  setState,
  getCurrentTeam,
  getSpeciesById,
  isTeamLegal,
  getFormat,
  getAllSpecies,
  getSpriteMap,
  getShinySpriteMap,
  getTeams,
  getCurrentTeamId,
  getCachedItems,
  setCurrentTeamId,
  setTeams,
  addTeam,
} from "./lib/app-state.js";
import { initI18n, applyI18n, getLang, setLang, getSupportedLanguages } from "./lib/i18n.js";

const formatSelect = document.getElementById("format-select");
const teamSelect = document.getElementById("team-select");
const langSelect = document.getElementById("lang-select");
const newTeamBtn = document.getElementById("new-team-btn");
const teamWarning = document.getElementById("team-warning");
const headerTeam = document.getElementById("header-team");
const searchDetailContent = document.getElementById("search-detail-content");
const breadcrumbBar = document.getElementById("breadcrumb-bar");

const widgets = {
  nav: null,
  headerView: null,
  breadcrumbView: null,
  searchDetailView: null,
  detailController: null,
  pokemonWidget: null,
  teamBuilderWidget: null,
  defensiveCoverageWidget: null,
  moveCoverageWidget: null,
  movesWidget: null,
  abilitiesWidget: null,
  itemsWidget: null,
};

function persist() {
  saveTeams(getFormat(), getTeams());
}

async function loadFormatData(format) {
  setState({ currentFormat: format });
  setFormat(format);

  const [index, map, shinyMap, items] = await Promise.all([
    loadIndex(format),
    loadSpriteMap(format),
    loadShinySpriteMap(format),
    loadItems(format),
  ]);
  setState({
    cachedItems: items,
    allSpecies: index,
    spriteMap: map,
    shinySpriteMap: shinyMap,
  });
}

function loadTeamsForFormat(format) {
  const teams = loadTeams(format);
  setTeams(teams);

  const savedId = loadLastTeamId(format);
  const teamId = teams.find(t => t.id === savedId) ? savedId : (teams[0]?.id ?? null);
  setCurrentTeamId(teamId);
}

async function refreshWidgetsForFormatChange(data) {
  if (widgets.movesWidget) {
    widgets.movesWidget.destroy();
    widgets.movesWidget = null;
  }
  if (widgets.abilitiesWidget) {
    widgets.abilitiesWidget.destroy();
    widgets.abilitiesWidget = null;
  }
  if (widgets.itemsWidget) {
    widgets.itemsWidget.destroy();
    widgets.itemsWidget = null;
  }
  if (widgets.searchDetailView) {
    widgets.searchDetailView.destroy();
  }

  if (widgets.pokemonWidget) {
    widgets.pokemonWidget.clear();
    widgets.pokemonWidget.setData(getAllSpecies(), getSpriteMap());
  }

  createPokedexSubtabWidgets(widgets, getFormat(), getAllSpecies(), data);

  if (widgets.teamBuilderWidget) {
    widgets.teamBuilderWidget.setData(
      getAllSpecies(),
      getSpriteMap(),
      getShinySpriteMap(),
      getFormat(),
      getCachedItems(),
    );
  }

  if (widgets.defensiveCoverageWidget) {
    widgets.defensiveCoverageWidget.opts.species = getAllSpecies();
    widgets.defensiveCoverageWidget.opts.spriteMap = getSpriteMap();
    widgets.defensiveCoverageWidget.refresh();
  }

  widgets.headerView?.renderTeamSelect();
}

async function switchFormat(format) {
  const oldFormat = getFormat();
  if (oldFormat && oldFormat !== format) {
    saveTeams(oldFormat, getTeams());
    if (getCurrentTeamId()) saveLastTeamId(oldFormat, getCurrentTeamId());
  }
  await loadFormatData(format);
  loadTeamsForFormat(format);
  ensureInitialTeam(format);
  const [moves, abilities] = await Promise.all([
    loadMovesWithLearnsets(format),
    loadAbilities(format),
  ]);
  applyI18n(getAllCaches());
  await refreshWidgetsForFormatChange({ moves, abilities, items: getCachedItems() });
}

// Re-load the move/ability data for the current format (no format switch),
// re-apply i18n, and re-render the search/detail widgets so the DOM picks
// up the new localized names/descriptions.
async function reRenderForLanguageChange() {
  const format = getFormat();
  const [moves, abilities] = await Promise.all([
    loadMovesWithLearnsets(format),
    loadAbilities(format),
  ]);
  applyI18n(getAllCaches());
  await refreshWidgetsForFormatChange({ moves, abilities, items: getCachedItems() });
}

function ensureInitialTeam(format) {
  if (getTeams().length > 0) return;
  const team = createTeam("Team 1", format);
  saveTeams(format, [team]);
  saveLastTeamId(format, team.id);
  setTeams([team]);
  setCurrentTeamId(team.id);
}

formatSelect.addEventListener("change", () => {
  switchFormat(formatSelect.value);
});

// Populate the language dropdown with all supported languages, label
// them with their own native name where recognizable, and react to changes.
const LANG_LABELS = {
  "en": "English",
  "ja": "日本語",
  "de": "Deutsch",
  "fr": "Français",
  "es": "Español",
  "it": "Italiano",
  "ko": "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  "pt-BR": "Português (BR)",
  "ru": "Русский",
};

function populateLangSelect(currentLangCode) {
  langSelect.innerHTML = "";
  for (const code of getSupportedLanguages()) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = LANG_LABELS[code] || code;
    if (code === currentLangCode) opt.selected = true;
    langSelect.appendChild(opt);
  }
}

langSelect.addEventListener("change", async () => {
  const newLang = langSelect.value;
  if (newLang === getLang()) return;
  await setLang(newLang);
  await reRenderForLanguageChange();
});

migrateFromLegacy();

const initialFormat = "m-b";

(async function main() {
  try {
    await initI18n();
    console.info(`[i18n] language: ${getLang()}`);
    populateLangSelect(getLang());

    await loadFormatData(initialFormat);
    loadTeamsForFormat(initialFormat);
    ensureInitialTeam(initialFormat);

    teamWarning.title = "duplicate species - Team not legal for this regulation";

    const [moves, abilities] = await Promise.all([
      loadMovesWithLearnsets(initialFormat),
      loadAbilities(initialFormat),
    ]);

    // Overlay localized names/descriptions onto the loaded data. Existing
    // widgets read `name` / `desc` from the in-memory cache, so this
    // post-process step is transparent to them.
    applyI18n(getAllCaches());

    initApp({
      dom: { headerTeam, searchDetailContent, breadcrumbBar, teamSelect, teamWarning },
      state: { getCurrentTeam, getTeams, getSpriteMap, getSpeciesById, isTeamLegal, getFormat, getAllSpecies, getShinySpriteMap, setCurrentTeamId, addTeam },
      data: { moves, abilities, items: getCachedItems() },
      callbacks: {
        onTeamChange: () => window.dispatchEvent(new Event("potato-team-change")),
        onAddToTeam: (speciesId) => {
          const team = getCurrentTeam();
          if (!team) return;
          const emptyIdx = team.slots.findIndex((slot) => slot.speciesId === null);
          if (emptyIdx === -1) return;
          widgets.teamBuilderWidget?.fillSlot(emptyIdx, speciesId);
        },
        onRemoveFromTeam: (speciesId) => {
          const team = getCurrentTeam();
          if (!team) return;
          const idx = team.slots.findIndex((slot) => slot.speciesId === speciesId);
          if (idx !== -1) {
            team.slots[idx].speciesId = null;
            team.slots[idx].item = null;
            persist();
            widgets.headerView?.renderTeamBar();
            if (widgets.teamBuilderWidget) widgets.teamBuilderWidget.refresh();
          }
        },
      },
      widgets,
    });
  } catch (err) {
    console.error("Fatal error during init:", err);
    const detail = document.getElementById("search-detail-content");
    if (detail) {
      detail.innerHTML = `<pre style="color:red;white-space:pre-wrap">${err.stack || err}</pre>`;
    }
  }
})();
