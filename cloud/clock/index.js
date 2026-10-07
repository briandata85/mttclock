// public/tournament-summary.js
var statuses = /* @__PURE__ */ new Set(["ready", "running", "paused", "finished"]);
var count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e7 ? n : null;
function savedTournamentSummary(value) {
  if (!value || !statuses.has(value.status)) return null;
  const playersLeft = count(value.playersLeft), entrants = count(value.entrants);
  const consistent = playersLeft === null || entrants === null || playersLeft <= entrants;
  const remainingMs2 = value.status !== "running" && Number.isSafeInteger(value.remainingMs) && value.remainingMs >= 0 && value.remainingMs <= 864e5 ? value.remainingMs : null;
  return { status: value.status, playersLeft: consistent ? playersLeft : null, entrants: consistent ? entrants : null, remainingMs: remainingMs2 };
}

// cloud/store.js
function makeStore({ url: url2, secretKey: secretKey2, publishableKey: publishableKey2, fetcher = fetch, artwork: artwork2 }) {
  async function rest(path, { method = "GET", body: body2, prefer } = {}) {
    const response = await fetcher(`${url2}/rest/v1/${path}`, { method, headers: { apikey: secretKey2, "Content-Type": "application/json", ...prefer ? { Prefer: prefer } : {} }, body: body2 === void 0 ? void 0 : JSON.stringify(body2), signal: AbortSignal.timeout(6e3) });
    if (!response.ok) throw new Error(`Database operation failed (${response.status}).`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function closing(owner) { return !!(await rest(`clock_account_deletions?owner_id=eq.${owner}&select=owner_id&limit=1`))?.length; }
  return {
    ...artwork2 ? { artwork: artwork2 } : {},
    async identity(jwt) {
      const response = await fetcher(`${url2}/auth/v1/user`, { headers: { apikey: publishableKey2, Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(6e3) });
      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) return null;
        if (response.status === 429) throw Object.assign(new Error("Too many attempts. Wait a little, then try again."), { status: 429 });
        throw Object.assign(new Error("The sign-in service is unavailable. Please try again in a moment."), { status: 503 });
      }
      const user = await response.json();
      if (user?.id && await closing(user.id)) return null;
      return typeof user?.id === "string" && user.id.length > 0 && user.is_anonymous === false && typeof user.email_confirmed_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(user.email_confirmed_at) && Number.isFinite(Date.parse(user.email_confirmed_at)) ? user.id : null;
    },
    async get(id) {
      const row = (await rest(`clock_tournaments?id=eq.${id}&select=*`))[0];
      return row && !await closing(row.owner_id) ? row : undefined;
    },
    async meta(id) {
      const row = (await rest(`clock_tournaments?id=eq.${id}&select=owner_id,observer_hash,revision,deleted_at:record->>deletedAt,display_enabled:record->>displayEnabled`))[0];
      return row && !await closing(row.owner_id) ? row : undefined;
    },
    async list(owner2, trash = false) {
      const rows = await rest(`clock_tournaments?owner_id=eq.${owner2}&record->>deletedAt=${trash ? "not.is.null" : "is.null"}&select=id,name,revision,created_at,updated_at,deleted_at:record->>deletedAt,saved_status:record->state->clock->>status,saved_remaining:record->state->clock->remainingMs,saved_players:record->state->playersLeft,saved_entrants:record->state->entrants&order=updated_at.desc&limit=100`);
      return rows.map((row) => ({ id: row.id, name: row.name, revision: row.revision, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at, summary: savedTournamentSummary({ status: row.saved_status, remainingMs: row.saved_remaining, playersLeft: row.saved_players, entrants: row.saved_entrants }) }));
    },
    async create(row) {
      return artwork2?.quotaProtected ? rest("rpc/clock_create", { method: "POST", body: { p_id: row.id, p_owner: row.owner_id, p_name: row.name, p_record: row.record } }) : rest("clock_tournaments", { method: "POST", body: row });
    },
    async commit(id, expected, record2) {
      return rest("rpc/clock_commit", { method: "POST", body: { p_id: id, p_expected: expected, p_record: record2 } });
    },
    async remove(id, owner2, revision) {
      const rows = await rest(`clock_tournaments?id=eq.${id}&owner_id=eq.${owner2}&revision=eq.${revision}&select=id`, { method: "DELETE", prefer: "return=representation" });
      return Array.isArray(rows) && rows.length === 1;
    },
    async observer(id, owner2, hash3) {
      return rest(`clock_tournaments?id=eq.${id}&owner_id=eq.${owner2}`, { method: "PATCH", body: { observer_hash: hash3 } });
    },
    async releaseDisplaySound(id, owner2) {
      return rest(`clock_tournaments?id=eq.${id}&owner_id=eq.${owner2}&record->>displayEnabled=eq.false`, { method: "PATCH", body: { sound_client: null, sound_until: null } });
    },
    async sound(id, owner2, client, release) {
      return rest("rpc/clock_sound_lease", { method: "POST", body: { p_id: id, p_owner: owner2, p_client: client, p_release: release } });
    }
  };
}

// public/domain.js
var structures = {
  deepstack: { name: "Deepstack", rows: [[20, 100, 200, 200], [20, 200, 400, 400], [20, 300, 600, 600], [15, 0, 0, 0, true], [20, 400, 800, 800], [20, 600, 1200, 1200], [20, 1e3, 1500, 1500], [15, 0, 0, 0, true], [20, 1e3, 2e3, 2e3], [20, 1500, 3e3, 3e3], [20, 2e3, 4e3, 4e3], [15, 0, 0, 0, true], [20, 3e3, 6e3, 6e3], [20, 4e3, 8e3, 8e3], [20, 5e3, 1e4, 1e4], [20, 6e3, 12e3, 12e3]] },
  standard: { name: "Standard", rows: [[15, 100, 200, 200], [15, 200, 300, 300], [15, 200, 400, 400], [10, 0, 0, 0, true], [15, 300, 600, 600], [15, 400, 800, 800], [15, 500, 1e3, 1e3], [10, 0, 0, 0, true], [15, 600, 1200, 1200], [15, 1e3, 1500, 1500], [15, 1e3, 2e3, 2e3], [10, 0, 0, 0, true], [15, 1500, 3e3, 3e3], [15, 2e3, 4e3, 4e3], [15, 3e3, 6e3, 6e3]] },
  turbo: { name: "Turbo", rows: [[8, 100, 200, 200], [8, 200, 400, 400], [8, 300, 600, 600], [8, 500, 1e3, 1e3], [8, 0, 0, 0, true], [8, 1e3, 1500, 1500], [8, 1e3, 2e3, 2e3], [8, 1500, 3e3, 3e3], [8, 2e3, 4e3, 4e3], [8, 3e3, 6e3, 6e3], [8, 0, 0, 0, true], [8, 4e3, 8e3, 4e3], [8, 5e3, 1e4, 5e3], [8, 7500, 15e3, 15e3]] },
  mixed: { name: "Omaha / Stud Mixed", rows: [[30, 100, 200, 100], [30, 200, 400, 200], [30, 300, 600, 300], [15, 0, 0, 0, true], [30, 500, 1e3, 500], [30, 600, 1200, 600], [30, 1e3, 2e3, 1e3], [15, 0, 0, 0, true], [30, 1500, 3e3, 1500], [30, 2e3, 4e3, 2e3], [30, 3e3, 6e3, 3e3], [15, 0, 0, 0, true], [30, 4e3, 8e3, 4e3], [30, 5e3, 1e4, 5e3]] }
};
var levelsFor = (key) => structures[key].rows.map(([minutes, small, big, ante, isBreak = false]) => ({ minutes, small, big, ante, isBreak }));
var defaults = () => ({
  eventName: "$130 NO-LIMIT HOLD'EM TRIPLE STACK TURBO",
  entrants: 91,
  playersLeft: 42,
  buyIn: 300,
  prizePerEntry: 255,
  startingStack: 1e4,
  autoAdvance: true,
  tableNumbers: "",
  showTableNumbers: false,
  tickerText: "WELCOME POKER CHIP FORUM - GOOD LUCK!",
  showTicker: true,
  structurePreset: "deepstack",
  structureName: "Deepstack",
  levels: levelsFor("deepstack"),
  currentIndex: 0,
  timerRemaining: 1200,
  payoutPreset: "top10",
  payoutLabel: "Remaining Places",
  roundPayouts: false,
  customPayouts: [],
  appearance: { board: "#063b1d", accent: "#f5ea36", boardFont: "arial-bold", scale: 100 },
  bounty: { mode: "off", amount: 0 },
  registration: { cutoffIndex: 4, override: "auto" },
  clock: { status: "ready", deadline: null, remainingMs: 12e5, run: 0, consumed: [], lastCheck: null }
});
function remainingMs(s, now = Date.now()) {
  return Math.max(0, s.clock.status === "running" ? s.clock.deadline - now : s.clock.remainingMs);
}
var freshTournament = () => ({ ...defaults(), eventName: "Poker Tournament", entrants: 0, playersLeft: 0, buyIn: 0, prizePerEntry: 0, payoutPreset: "custom", customPayouts: [], tickerText: "WELCOME POKER PLAYERS - GOOD LUCK!" });
var themeDetails = {
  classic: { label: "Classic", group: "Originals", description: "The original board layout and familiar bold Arial typography.", font: "Arial, Helvetica, sans-serif", timerFont: "Arial, Helvetica, sans-serif" },
  wsop: { label: "Modern", group: "Originals", description: "The familiar three-column display: a central clock, side statistics and a stationary payout rail.", font: "'Clock Roboto', Arial, sans-serif", timerFont: "'Clock Roboto', Arial, sans-serif" },
  "wsop-broadcast": { label: "Broadcast", group: "Room & event", description: "For a shared broadcast screen: a clock-led stage, payout desk and a lower information ribbon.", font: "'Clock Roboto', Arial, sans-serif", timerFont: "'Clock Roboto', Arial, sans-serif", timer: 9.6, timerHours: 8.2, preview: "ribbon" },
  "wsop-arena": { label: "Arena", group: "Room & event", description: "For a tournament hall: a stadium-sized countdown, level progress and bold supporting score panels.", font: "Arial, Helvetica, sans-serif", timerFont: "Impact, 'Arial Narrow', Arial, sans-serif", timer: 11.5, timerHours: 9.8, preview: "bold" },
  "wsop-final-table": { label: "Final Table", group: "Room & event", description: "For the money stages: a full-height prize ladder takes the spotlight, beside a calm clock and tournament totals.", font: "Georgia, 'Times New Roman', serif", timerFont: "Georgia, 'Times New Roman', serif", timer: 9.1, timerHours: 7.7, preview: "serif" },
  "wsop-club": { label: "Event", group: "Room & event", description: "For your event artwork: an open picture area, a clear clock card and a wide lower prize ribbon. Add your image under Images.", font: "'Trebuchet MS', Arial, sans-serif", timerFont: "'Trebuchet MS', Arial, sans-serif", timer: 9.4, timerHours: 8, preview: "rounded" },
  "wsop-split": { label: "Split Stage", group: "Planning & information", description: "For planning ahead: the current clock occupies one stage and upcoming levels occupy the other.", font: "'Clock Roboto', Arial, sans-serif", timerFont: "'Clock Roboto', Arial, sans-serif", timer: 9.5, timerHours: 8, preview: "split" },
  "wsop-rail": { label: "Bottom Rail", group: "Planning & information", description: "For wide screens: an open clock stage with tournament totals collected into a horizontal bottom rail.", font: "Arial, Helvetica, sans-serif", timerFont: "Arial, Helvetica, sans-serif", timer: 10, timerHours: 8.5, preview: "rail" },
  "wsop-compact": { label: "Run Sheet", group: "Planning & information", description: "For the tournament desk: a five-row upcoming schedule with explicit breaks, beside the current clock and payouts.", font: "Verdana, Arial, sans-serif", timerFont: "Verdana, Arial, sans-serif", timer: 8.5, timerHours: 7.1, preview: "compact" },
  "wsop-scoreboard": { label: "Scoreboard", group: "Planning & information", description: "For tracking the field: a statistics-first matrix with aligned numbers and clearly separated clock and payout blocks.", font: "Consolas, 'Courier New', monospace", timerFont: "Consolas, 'Courier New', monospace", timer: 9, timerHours: 7.5, preview: "score" },
  "wsop-digital": { label: "Digital", group: "Planning & information", description: "For keeping pace: an instrument-style timer, remaining-level progress and a dedicated upcoming-structure panel.", font: "'Clock Roboto', Arial, sans-serif", timerFont: "Consolas, 'Courier New', monospace", timer: 9.2, timerHours: 7.8, preview: "digital" },
  "wsop-focus": { label: "Big Clock", group: "Distance & clarity", description: "For viewing across the room: a full-width countdown above large blinds, with prizes and supporting facts below.", font: "Arial, Helvetica, sans-serif", timerFont: "Arial, Helvetica, sans-serif", timer: 12.6, timerHours: 10.4, preview: "focus" },
  "wsop-minimal": { label: "Minimal", group: "Distance & clarity", description: "For a quieter room: an airy clock composition with secondary information kept visually subdued and grouped together.", font: "Arial, Helvetica, sans-serif", timerFont: "Arial, Helvetica, sans-serif", timer: 9.5, timerHours: 8.1, preview: "minimal" },
  "wsop-contrast": { label: "High Contrast", group: "Distance & clarity", description: "For clear visual separation: large white-on-black reading blocks and firm borders around each information group.", font: "Arial, Helvetica, sans-serif", timerFont: "Arial, Helvetica, sans-serif", timer: 10, timerHours: 8.5, preview: "contrast" }
};
var featuredThemes = Object.freeze(["classic", "wsop", "wsop-final-table", "wsop-focus", "wsop-compact", "wsop-club"]);
var themes = Object.fromEntries(Object.entries(themeDetails).map(([key, details]) => [key, details.label]));
var displayFields = [
  { key: "prizePool", label: "Prize pool" },
  { key: "entrants", label: "Entrants", onlyClassic: true },
  { key: "playersLeft", label: "Players left" },
  { key: "chopValue", label: "Chop value", classicOptional: true },
  { key: "lateReg", label: "Late registration", classicOptional: true },
  { key: "payouts", label: "Payout list" },
  { key: "nextPrize", label: "Next prize", onlyWsop: true },
  { key: "nextBlinds", label: "Next blinds" },
  { key: "nextAnte", label: "Next ante" },
  { key: "totalChips", label: "Total chips", wsop: false },
  { key: "averageStack", label: "Average stack" },
  { key: "nextBreak", label: "Next break" },
  { key: "wallClock", label: "Time-of-day clock" },
  { key: "largestStack", label: "Largest stack", onlyWsop: true },
  { key: "smallestStack", label: "Smallest stack", onlyWsop: true },
  { key: "playDown", label: "Play-down message", onlyWsop: true }
];
function finances(s) {
  const gross = Math.round(s.entrants * s.prizePerEntry * 100) / 100;
  const reserve = s.bounty.mode === "off" ? 0 : Math.round(s.bounty.amount * (s.bounty.mode === "per-entry" ? s.entrants : 1) * 100) / 100;
  return { gross, reserve, pool: Math.max(0, Math.round((gross - reserve) * 100) / 100) };
}
function payouts(s) {
  if (s.payoutPreset === "custom") return [...s.customPayouts];
  const n = s.payoutPreset === "winner" ? 1 : Math.min(2e3, Math.max(1, Math.ceil((Number.isFinite(s.entrants) ? s.entrants : 0) * ({ top10: 0.1, top15: 0.15, top20: 0.2 }[s.payoutPreset] || 0.1))));
  const pool = finances(s).pool;
  const decay = s.payoutPreset === "top20" ? 0.84 : s.payoutPreset === "top15" ? 0.8 : 0.74;
  const weights = Array.from({ length: n }, (_, i) => decay ** i), sum = weights.reduce((a, b) => a + b, 0);
  if (!s.roundPayouts) {
    const values = weights.map((w) => Math.floor(pool * w / sum));
    values[0] = Math.round((values[0] + pool - values.reduce((a, b) => a + b, 0)) * 100) / 100;
    return values;
  }
  const unit = 20;
  const units = Math.floor((pool + 1e-7) / unit);
  const exact = weights.map((w) => units * w / sum), result = exact.map(Math.floor);
  const order = exact.map((v, i) => ({ i, fraction: v - result[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0, rest = units - result.reduce((a, b) => a + b, 0); i < rest; i++) result[order[i].i]++;
  return result.map((v) => Math.round(v * unit * 100) / 100);
}
var fontChoices = {
  rounded: { family: "'Arial Rounded MT Bold', 'Trebuchet MS', Arial, sans-serif", weight: 900 },
  arial: { family: "Arial, Helvetica, sans-serif", weight: 400 },
  "arial-bold": { family: "Arial, Helvetica, sans-serif", weight: 700 },
  georgia: { family: "Georgia, 'Times New Roman', serif", weight: 700 },
  trebuchet: { family: "'Trebuchet MS', Arial, sans-serif", weight: 700 },
  verdana: { family: "Verdana, Arial, sans-serif", weight: 700 }
};

// public/payout-safety.js
var defaultRecipe = () => ({ itm: 15, type: "normal", finalTable: 9, places: null, minimumMultiple: 2, roundPayouts: false });
var payoutBasis = (s) => ({ entrants: s.entrants, pool: Math.round(finances(s).pool * 100) / 100, buyIn: s.buyIn });
function payoutReview(s) {
  const values = payouts(s), basis = payoutBasis(s), saved = s.payoutConfig?.basis;
  const assigned = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100, difference = Math.round((basis.pool - assigned) * 100) / 100;
  const stale = !!saved && (saved.entrants !== basis.entrants || saved.pool !== basis.pool || saved.buyIn !== void 0 && saved.buyIn !== basis.buyIn);
  const errors = [];
  const missingSchedule = !values.length || !assigned;
  if (difference < 0) errors.push("Payouts exceed the tournament prize pool.");
  if (values.length > s.entrants) errors.push("Paid places exceed total entrants.");
  if (values.some((v, i) => v <= 0 || i > 0 && v > values[i - 1])) errors.push("Each prize must be positive and no larger than the prize above it.");
  if (missingSchedule) errors.push("Add a payout schedule first.");
  return { assigned, difference, stale, missingSchedule, errors, canFinalize: !errors.length && !stale, finalized: s.payoutConfig?.finalized === true };
}

// public/artwork.js
var artworkPresetChoices = { large: "Large image", small: "Smaller images", watermark: "Watermark", cover: "Full background", none: "None \xB7 Color only" };
var artworkLimits = { inputBytes: 10 * 1024 * 1024, backgroundBytes: 512 * 1024, logoBytes: 128 * 1024, backgroundEdge: 2048, logoEdge: 768 };
var hash = /^[a-f0-9]{64}$/;
var owner = /^(?:local|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
var validArtworkRef = (ref2) => ref2 === null || !!ref2 && typeof ref2 === "object" && !Array.isArray(ref2) && Object.keys(ref2).length === 2 && hash.test(ref2.id) && owner.test(ref2.owner);
function validateArtwork(appearance) {
  const a = appearance?.artwork;
  if (a === void 0) return true;
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  if (a.advanced !== void 0 && typeof a.advanced !== "boolean" || a.advancedConfigured !== void 0 && typeof a.advancedConfigured !== "boolean") return false;
  if (a.preset !== void 0 && !Object.hasOwn(artworkPresetChoices, a.preset)) return false;
  for (const key of ["background", "logo"]) if (a[key] !== void 0 && !validArtworkRef(a[key])) return false;
  for (const [key, min, max] of [["opacity", 0, 100], ["size", 10, 150], ["x", 0, 100], ["y", 0, 100], ["logoSize", 30, 100], ["logoOpacity", 0, 100]]) if (a[key] !== void 0 && (!Number.isFinite(a[key]) || a[key] < min || a[key] > max)) return false;
  return a.monochrome === void 0 || typeof a.monochrome === "boolean";
}

// lib/engine.js
var CommandError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};
var requireValue = (condition, message) => {
  if (!condition) throw new CommandError(message);
};
var num = (n, min, max, integer = false) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
var fields = ["eventName", "entrants", "playersLeft", "buyIn", "prizePerEntry", "startingStack", "autoAdvance", "tableNumbers", "showTableNumbers", "tickerText", "showTicker", "payoutPreset", "payoutLabel", "roundPayouts", "customPayouts", "appearance", "bounty", "registration", "payoutConfig"];
function validate(s) {
  for (const [key, max] of [["eventName", 70], ["tickerText", 180], ["tableNumbers", 40], ["payoutLabel", 36]]) requireValue(typeof s[key] === "string" && s[key].length <= max, `Invalid ${key}`);
  for (const key of ["entrants", "playersLeft"]) requireValue(num(s[key], 0, 1e4, true), `Invalid ${key}`);
  requireValue(s.playersLeft <= s.entrants, "Players left cannot exceed entrants");
  for (const key of ["buyIn", "prizePerEntry", "startingStack"]) requireValue(num(s[key], 0, 1e8), `Invalid ${key}`);
  for (const key of ["autoAdvance", "showTableNumbers", "showTicker", "roundPayouts"]) requireValue(typeof s[key] === "boolean", `Invalid ${key}`);
  requireValue(["top10", "top15", "top20", "winner", "custom"].includes(s.payoutPreset), "Invalid payout preset");
  requireValue(Array.isArray(s.customPayouts) && s.customPayouts.length <= 1e3 && s.customPayouts.every((v) => num(v, 0, 1e10)), "Invalid custom payouts");
  if (s.payoutConfig !== void 0) {
    const c = s.payoutConfig;
    requireValue(c && typeof c === "object" && !Array.isArray(c), "Invalid payout settings");
    requireValue(c.finalized === void 0 || typeof c.finalized === "boolean", "Invalid payout protection");
    if (c.basis !== void 0 && c.basis !== null) requireValue(num(c.basis.entrants, 0, 1e4, true) && num(c.basis.pool, 0, 1e12) && (c.basis.buyIn === void 0 || num(c.basis.buyIn, 0, 1e8)), "Invalid payout basis");
    if (c.recipe !== void 0) {
      const r = c.recipe;
      requireValue(r && [5, 10, 12, 15, 18, 20, 25].includes(r.itm) && ["steep", "normal", "flat", "flatter"].includes(r.type) && [9, 7, 5].includes(r.finalTable) && (r.places === null || num(r.places, 1, 1e3, true)) && [1, 1.5, 2].includes(r.minimumMultiple) && typeof r.roundPayouts === "boolean", "Invalid payout calculator options");
    }
  }
  requireValue(Array.isArray(s.levels) && s.levels.length > 0 && s.levels.length <= 300, "Use 1\u2013300 levels");
  for (const row of s.levels) requireValue(row && num(row.minutes, 1, 1440) && ["small", "big", "ante"].every((k) => num(row[k], 0, 1e10)) && typeof row.isBreak === "boolean", "Invalid blind structure");
  requireValue(num(s.currentIndex, 0, s.levels.length - 1, true), "Invalid current level");
  requireValue(s.appearance && ["board", "accent"].every((k) => /^#[a-f0-9]{6}$/i.test(s.appearance[k])) && Object.hasOwn(fontChoices, s.appearance.boardFont) && num(s.appearance.scale, 85, 115), "Invalid appearance");
  requireValue(validateArtwork(s.appearance), "Invalid artwork settings");
  requireValue(s.bounty && ["off", "total", "per-entry"].includes(s.bounty.mode) && num(s.bounty.amount, 0, 1e10), "Invalid bounty allocation");
  const f = finances(s);
  requireValue(f.reserve <= f.gross, "Bounty reserve cannot exceed the tournament pool");
  requireValue(s.registration && num(s.registration.cutoffIndex, 0, s.levels.length, true) && ["auto", "open", "closed"].includes(s.registration.override), "Invalid registration cutoff");
  return s;
}
function importLegacy(saved, now) {
  requireValue(saved && typeof saved === "object" && Array.isArray(saved.levels) && saved.levels.length > 0, "Invalid saved tournament: a blind structure is required");
  const s = defaults();
  for (const key of fields) if (Object.hasOwn(saved, key)) s[key] = structuredClone(saved[key]);
  if (s.payoutConfig) s.payoutConfig = { ...s.payoutConfig, finalized: false };
  if (saved.appearance) {
    s.appearance = { ...defaults().appearance, ...saved.appearance };
    const f = s.appearance.boardFont;
    if (!Object.hasOwn(fontChoices, f)) s.appearance.boardFont = String(f).includes("Rounded") ? "rounded" : String(f).startsWith("Arial") ? "arial-bold" : "verdana";
  }
  if (saved.levels) s.levels = structuredClone(saved.levels);
  s.structureName = typeof saved.structureName === "string" ? saved.structureName.slice(0, 70) : "Imported";
  s.structurePreset = Object.hasOwn(structures, saved.structurePreset) ? saved.structurePreset : "custom";
  s.currentIndex = num(saved.currentIndex, 0, s.levels.length - 1, true) ? saved.currentIndex : 0;
  s.registration.cutoffIndex = Math.min(s.registration.cutoffIndex, s.levels.length);
  const seconds = num(saved.timerRemaining, 0, 86400) ? saved.timerRemaining : s.levels[s.currentIndex].minutes * 60;
  s.clock.remainingMs = seconds * 1e3;
  s.clock.status = "paused";
  s.clock.lastCheck = now;
  validate(s);
  return s;
}
function silencePast(s, now) {
  const left = remainingMs(s, now);
  for (const mark of [60, 0]) if (left <= mark * 1e3 && !s.clock.consumed.includes(mark)) s.clock.consumed.push(mark);
  s.clock.lastCheck = now;
}
function selectLevel(s, index, now) {
  s.currentIndex = index;
  s.clock = { status: "paused", deadline: null, remainingMs: s.levels[index].minutes * 6e4, run: s.clock.run + 1, consumed: [], lastCheck: now };
  silencePast(s, now);
}
var Engine = class {
  constructor(record2, now = Date.now(), { recover = true } = {}) {
    this.record = record2 || { schema: 2, id: "local", ownerId: "local-owner", revision: 0, state: defaults(), history: [], receipts: [] };
    validate(this.record.state);
    if (recover) this.tick(now, false);
  }
  snapshot(now = Date.now()) {
    const r = this.record, s = structuredClone(r.state);
    s.timerRemaining = Math.ceil(remainingMs(s, now) / 1e3);
    return { id: r.id, revision: r.revision, state: s, serverNow: now, canUndo: r.history.length > 0, announcement: r.announcement && now - r.announcement.at < 10000 ? r.announcement : null, capabilities: { setupDrafts: true } };
  }
  command(command, now = Date.now()) {
    requireValue(command && typeof command === "object", "Invalid command");
    requireValue(typeof command.id === "string" && /^[\w-]{8,100}$/.test(command.id), "A unique command ID is required");
    const receipt = this.record.receipts.find((r) => r.id === command.id);
    if (receipt) {
      requireValue(receipt.payload === JSON.stringify(command), "Command ID already used");
      return this.snapshot(now);
    }
    if (command.revision !== this.record.revision) throw new CommandError("Tournament changed on another screen. Review the latest values and retry.", 409);
    const draft = structuredClone(this.record), s = draft.state;
    const before = structuredClone(s);
    before.clock.remainingMs = remainingMs(s, now);
    before.clock.deadline = null;
    if (before.clock.status === "running") before.clock.status = "paused";
    let saveUndo = true;
    switch (command.type) {
      case "announce": {
        requireValue(typeof command.text === "string", "Enter an announcement.");
        const text = command.text.trim().replace(/\s+/g, " ");
        requireValue(text.length > 0 && text.length <= 240, "Use 1–240 characters for an announcement.");
        requireValue(s.appearance?.soundEnabled !== false && (s.appearance?.soundVolume ?? 70) > 0, "Turn sound on and raise the volume before announcing.");
        requireValue(!draft.announcement || now - draft.announcement.at >= 5000, "Wait a few seconds before another announcement.");
        draft.announcement = { id: command.id, text, at: now };
        saveUndo = false;
        break;
      }
      case "start":
        requireValue(s.clock.status !== "running" && s.clock.remainingMs > 0, "Clock cannot start");
        s.clock.status = "running";
        s.clock.deadline = now + s.clock.remainingMs;
        silencePast(s, now);
        break;
      case "pause":
        requireValue(s.clock.status === "running", "Clock is not running");
        s.clock.remainingMs = remainingMs(s, now);
        s.clock.status = "paused";
        s.clock.deadline = null;
        silencePast(s, now);
        break;
      case "time":
        requireValue(num(command.seconds, 0, 86400), "Time must be between 0 and 86400 seconds");
        s.clock.remainingMs = command.seconds * 1e3;
        if (s.clock.status === "running") s.clock.deadline = now + s.clock.remainingMs;
        if (command.seconds === 0) {
          s.clock.status = "paused";
          s.clock.deadline = null;
        }
        silencePast(s, now);
        break;
      case "resetLevel":
        selectLevel(s, s.currentIndex, now);
        break;
      case "level":
        requireValue(num(command.index, 0, s.levels.length - 1, true), "Invalid level");
        selectLevel(s, command.index, now);
        break;
      case "players":
        requireValue(command.delta === 1 || command.delta === -1, "Invalid player change");
        s.playersLeft = Math.max(0, Math.min(s.entrants, s.playersLeft + command.delta));
        break;
      case "setup":
      case "settings":
        requireValue(command.patch && typeof command.patch === "object" && !Array.isArray(command.patch), "Invalid settings");
        for (const [key, value] of Object.entries(command.patch)) {
          requireValue(fields.includes(key), `Unsupported setting: ${key}`);
          s[key] = structuredClone(value);
        }
        if (command.type === "setup" && command.structure) {
          const { preset, levels } = command.structure;
          requireValue(preset === "custom" || Object.hasOwn(structures, preset), "Unknown structure");
          s.levels = preset === "custom" ? structuredClone(levels) : levelsFor(preset);
          requireValue(Array.isArray(s.levels) && s.levels.length > 0 && s.levels.length <= 300, "Use 1\u2013300 levels");
          s.structurePreset = preset;
          s.structureName = preset === "custom" ? "Custom" : structures[preset].name;
          s.registration.cutoffIndex = Math.min(s.registration.cutoffIndex, s.levels.length);
          s.currentIndex = 0;
          validate(s);
          selectLevel(s, 0, now);
        }
        break;
      case "structure":
        if (command.preset !== "custom") {
          requireValue(Object.hasOwn(structures, command.preset), "Unknown structure");
          s.levels = levelsFor(command.preset);
          s.structureName = structures[command.preset].name;
        } else {
          requireValue(Array.isArray(command.levels) && command.levels.length > 0 && command.levels.length <= 300, "Use 1\u2013300 levels");
          s.levels = structuredClone(command.levels);
          s.structureName = "Custom";
        }
        s.structurePreset = command.preset;
        s.registration.cutoffIndex = Math.min(s.registration.cutoffIndex, s.levels.length);
        selectLevel(s, 0, now);
        break;
      case "import":
        draft.state = importLegacy(command.saved, now);
        draft.state.clock.run = s.clock.run + 1;
        break;
      case "undo":
        requireValue(draft.history.length > 0, "Nothing to undo");
        draft.state = draft.history.pop();
        draft.state.clock.run = s.clock.run + 1;
        if (draft.state.currentIndex === s.currentIndex) draft.state.clock.consumed = [.../* @__PURE__ */ new Set([...draft.state.clock.consumed, ...s.clock.consumed])];
        silencePast(draft.state, now);
        saveUndo = false;
        break;
      default:
        throw new CommandError("Unknown command");
    }
    validate(draft.state);
    const previous = this.record.state, next = draft.state, locked = previous.payoutConfig?.finalized === true;
    const schedule = (s2) => JSON.stringify([s2.payoutPreset, s2.customPayouts, s2.roundPayouts]);
    const action = command.type === "setup" ? command.payoutAction : void 0;
    requireValue(action === void 0 || ["finalize", "unlock"].includes(action), "Invalid payout action");
    if (locked && action !== "unlock") {
      requireValue(schedule(previous) === schedule(next) && next.payoutConfig?.finalized === true && JSON.stringify(previous.payoutConfig.basis) === JSON.stringify(next.payoutConfig.basis), "Unlock finalized payouts before changing or replacing them.");
    }
    if (!locked && next.payoutConfig?.finalized === true && action !== "finalize" && command.type !== "undo") throw new CommandError("Use Finalize payouts to protect the schedule.");
    if (action === "unlock") next.payoutConfig = { ...next.payoutConfig, finalized: false };
    if (action === "finalize") {
      requireValue(next.payoutPreset === "custom", "Apply a fixed payout schedule before finalizing.");
      const review = payoutReview(next);
      requireValue(review.canFinalize, review.errors[0] || "The pool, entrants or buy-in changed. Recalculate or confirm the current amounts first.");
      requireValue(review.difference === 0 || command.acceptUnassigned === true, "Confirm the unassigned prize money before finalizing.");
      next.payoutConfig = { ...next.payoutConfig, basis: payoutBasis(next), finalized: true };
    }
    if (command.type === "setup" && next.payoutPreset === "custom") requireValue(payoutReview(next).difference >= 0, "Payouts exceed the tournament prize pool. Adjust the payouts or contribution before saving.");
    if (saveUndo) {
      draft.history.push(before);
      draft.history = draft.history.slice(-50);
    }
    draft.revision++;
    draft.receipts.push({ id: command.id, payload: JSON.stringify(command) });
    draft.receipts = draft.receipts.slice(-256);
    this.record = draft;
    return this.snapshot(now);
  }
  tick(now = Date.now(), emit = true) {
    const s = this.record.state, cues = [];
    let changed = false;
    while (s.clock.status === "running") {
      const c = s.clock, left = c.deadline - now;
      for (const mark of [60, 0]) {
        if (left <= mark * 1e3 && !c.consumed.includes(mark)) {
          c.consumed.push(mark);
          changed = true;
          const due = c.deadline - mark * 1e3;
          if (emit && now - due < 1800) cues.push({ id: `${c.run}:${mark}`, mark, at: due });
        }
      }
      if (left > 0) break;
      const boundary = c.deadline;
      if (s.autoAdvance && s.currentIndex < s.levels.length - 1) {
        selectLevel(s, s.currentIndex + 1, boundary);
        s.clock.status = "running";
        s.clock.deadline = boundary + s.clock.remainingMs;
      } else {
        c.remainingMs = 0;
        c.status = "finished";
        c.deadline = null;
      }
      changed = true;
    }
    if (changed) this.record.revision++;
    return { changed, cues };
  }
};

// public/tournament-reuse.js
function reuseTournament(saved, name) {
  const s = structuredClone(saved), fresh = freshTournament();
  s.eventName = name;
  s.entrants = 0;
  s.playersLeft = 0;
  s.currentIndex = 0;
  s.timerRemaining = s.levels[0].minutes * 60;
  s.clock = { ...fresh.clock, remainingMs: s.timerRemaining * 1e3 };
  s.registration = { ...s.registration, override: "auto" };
  if (s.bounty.mode === "total") s.bounty.amount = 0;
  s.appearance = { ...s.appearance, largestStack: null, smallestStack: null };
  s.payoutConfig = { recipe: structuredClone(s.payoutConfig?.recipe || { ...defaultRecipe(), itm: { top10: 10, top15: 15, top20: 20 }[s.payoutPreset] || 15, places: s.payoutPreset === "winner" ? 1 : null, roundPayouts: s.roundPayouts }), finalized: false, basis: null };
  s.payoutPreset = "custom";
  s.customPayouts = [];
  return s;
}

// cloud/service.js
var uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
var fail = (message, status = 400) => {
  throw new CommandError(message, status);
};
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function displayEnabled(row) {
  const value = row?.record ? row.record.displayEnabled : row?.display_enabled;
  return value === void 0 || value === null || value === true || value === "true";
}
function authorizeRow(row, actor) {
  if (!row || row.deleted_at || row.record?.deletedAt) fail("Tournament not found or access unavailable.", 403);
  if (actor.userId && row.owner_id === actor.userId) return "director";
  if (actor.publicDisplay) {
    if (!displayEnabled(row)) fail("Display access is disabled. Ask the owner to enable it again.", 403);
    return "display";
  }
  if (actor.observerHash && row.observer_hash && row.observer_hash === actor.observerHash) return "observer";
  fail("Tournament not found or access unavailable.", 403);
}
var CloudClock = class {
  constructor(store, now = Date.now) {
    this.store = store;
    this.now = now;
  }
  async read(id, actor) {
    const row = await this.store.get(id);
    authorizeRow(row, actor);
    return row;
  }
  async advance(id, actor) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await this.read(id, actor), now = this.now(), engine = new Engine(row.record, now, { recover: false });
      const { changed, cues } = engine.tick(now, true);
      if (!changed) return { row, engine };
      engine.record.lastCues = cues;
      if (await this.store.commit(id, row.revision, engine.record)) return { row: { ...row, record: engine.record, revision: engine.record.revision }, engine };
    }
    fail("Tournament is busy. Please retry.", 409);
  }
  async packet(row, engine, actor) {
    const packet = engine.snapshot(this.now()), role = authorizeRow(row, actor);
    let artworkUrls = [], artworkUnavailable = false;
    if (this.store.artwork?.links) {
      const art = packet.state.appearance?.artwork;
      try {
        artworkUrls = await this.store.artwork.links(row.owner_id, [art?.background, art?.logo]);
      } catch {
        artworkUnavailable = true;
      }
    }
    return { ...packet, serverNow: this.now(), role, artworkUrls, artworkUnavailable, ...role === "director" ? { displayEnabled: displayEnabled(row), capabilities: { ...packet.capabilities, displayAccess: typeof this.store.releaseDisplaySound === "function" } } : {}, cues: (engine.record.lastCues || []).filter((c) => this.now() - c.at >= 0 && this.now() - c.at < 1800) };
  }
  async state(id, actor) {
    const { row, engine } = await this.advance(id, actor);
    return this.packet(row, engine, actor);
  }
  async command(id, actor, input) {
    if (!actor.userId) fail("Director access required.", 403);
    const artwork2 = input?.patch?.appearance?.artwork;
    for (const ref2 of [artwork2?.background, artwork2?.logo]) if (ref2 && ref2.owner !== actor.userId) fail("Use an image uploaded to your own account.", 403);
    const { row, engine } = await this.advance(id, actor);
    engine.command(input, this.now());
    if (engine.record.revision === row.revision) return this.packet(row, engine, actor);
    if (!engine.record.state.eventName.trim()) fail("Saved tournaments need a name.");
    engine.record.lastCues = [];
    if (!await this.store.commit(id, row.revision, engine.record)) fail("Tournament changed on another screen. Review the latest values and retry.", 409);
    return this.packet(row, engine, actor);
  }
  async create(actor, input = {}) {
    if (!actor.userId) fail("Sign in to save tournaments.", 401);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 70) fail("Use a tournament name of 1\u201370 characters.");
    if (input.reuseId && !uuidPattern.test(input.reuseId)) fail("Invalid source tournament.");
    if (input.creationId && !uuidPattern.test(input.creationId)) fail("Invalid creation ID.");
    const id = input.creationId?.toLowerCase() || crypto.randomUUID(), creation = { name, reuseId: input.reuseId || null, duplicateId: input.duplicateId || null };
    const accepted = (row) => row?.owner_id === actor.userId && JSON.stringify(row.record.creation) === JSON.stringify(creation);
    const existing = await this.store.get(id);
    if (existing) {
      if (accepted(existing) && !existing.record.deletedAt) return { id };
      fail("This creation request was already used. Refresh My tournaments before trying again.", 409);
    }
    let state = freshTournament();
    if (input.reuseId) {
      const source = await this.read(input.reuseId, actor);
      state = reuseTournament(source.record.state, name);
    }
    if (input.duplicateId) {
      if (!uuidPattern.test(input.duplicateId)) fail("Invalid source tournament.");
      const source = await this.read(input.duplicateId, actor);
      state = structuredClone(source.record.state);
      state.currentIndex = 0;
      state.playersLeft = state.entrants;
      state.registration.override = "auto";
      state.clock = { ...defaults().clock, remainingMs: state.levels[0].minutes * 6e4 };
      if (state.payoutConfig) state.payoutConfig = { ...state.payoutConfig, finalized: false };
    }
    state.eventName = name;
    validate(state);
    const record2 = { schema: 2, id, ownerId: actor.userId, revision: 0, state, history: [], receipts: [], lastCues: [], creation };
    try {
      await this.store.create({ id, owner_id: actor.userId, name, record: record2, revision: 0 });
    } catch (error) {
      const row = await this.store.get(id);
      if (!accepted(row) || row.record.deletedAt) throw error;
    }
    return { id };
  }
  async remove(id, actor, input) {
    if (!actor.userId) fail("Director access required.", 403);
    if (input.confirmation !== "DELETE") fail("Confirm permanent deletion before continuing.");
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail("Refresh My tournaments before deleting this tournament.");
    const row = await this.store.get(id);
    if (!row) return { id, deleted: true, permanent: true };
    if (row.owner_id !== actor.userId) fail("Tournament not found or access unavailable.", 403);
    if (row.revision !== input.revision) fail("Tournament changed on another screen. Refresh My tournaments and review before deleting.", 409);
    if (!await this.store.remove(id, actor.userId, input.revision)) {
      if (await this.store.get(id)) fail("Tournament changed on another screen. Refresh My tournaments before deleting.", 409);
    }
    return { id, deleted: true, permanent: true };
  }
  async trash(id, actor, input, deleted) {
    const row = await this.store.get(id);
    if (!actor.userId || !row || row.owner_id !== actor.userId) fail("Tournament not found or access unavailable.", 403);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail("Refresh My tournaments before changing this tournament.");
    if (Boolean(row.record.deletedAt) === deleted) return { id, deleted };
    if (row.revision !== input.revision) fail("Tournament changed on another screen. Refresh My tournaments and review before trying again.", 409);
    const record2 = structuredClone(row.record), now = this.now();
    record2.deletedAt = deleted ? new Date(now).toISOString() : null;
    record2.state.clock.remainingMs = remainingMs(record2.state, now);
    record2.state.clock.status = "paused";
    record2.state.clock.deadline = null;
    record2.state.clock.lastCheck = now;
    record2.state.clock.run++;
    record2.lastCues = [];
    record2.revision++;
    if (!await this.store.commit(id, row.revision, record2)) fail("Tournament changed on another screen. Refresh My tournaments and try again.", 409);
    return { id, deleted };
  }
  async clearDisplaySound(id, owner2) {
    try {
      await this.store.releaseDisplaySound(id, owner2);
    } catch {
      fail("Display access was disabled, but cleanup of the previous sound lease could not be confirmed. Refresh to check the current setting.", 503);
    }
  }
  async displayAccess(id, actor, input) {
    if (!actor.userId) fail("Director access required.", 403);
    const row = await this.read(id, actor);
    if (row.owner_id !== actor.userId) fail("Director access required.", 403);
    if (typeof input?.enabled !== "boolean" || !Number.isSafeInteger(input.revision) || input.revision < 0) fail("Review the current Display access setting before changing it.");
    if (typeof this.store.releaseDisplaySound !== "function") fail("Display access controls are unavailable on this service.", 503);
    if (displayEnabled(row) === input.enabled) {
      if (!input.enabled) await this.clearDisplaySound(id, actor.userId);
      return this.packet(row, new Engine(row.record, this.now(), { recover: false }), actor);
    }
    if (row.revision !== input.revision) fail("Tournament changed on another screen. Review Display access and try again.", 409);
    const record2 = structuredClone(row.record);
    record2.displayEnabled = input.enabled;
    record2.revision++;
    record2.lastCues = [];
    if (!await this.store.commit(id, row.revision, record2)) fail("Tournament changed on another screen. Review Display access and try again.", 409);
    if (!input.enabled) await this.clearDisplaySound(id, actor.userId);
    return this.packet({ ...row, record: record2, revision: record2.revision }, new Engine(record2, this.now(), { recover: false }), actor);
  }
  async observer(id, actor, input) {
    if (!actor.userId) fail("Director access required.", 403);
    await this.read(id, actor);
    if (typeof input.enabled !== "boolean") fail("Specify enabled.");
    const token = input.enabled ? newToken() : null;
    await this.store.observer(id, actor.userId, token ? await digest(token) : null);
    return { path: token ? `/watch/${id}/${token}` : null };
  }
  async sound(id, actor, input) {
    if (!actor.userId && !actor.publicDisplay) fail("Display access required.", 403);
    const row = await this.read(id, actor);
    if (typeof input.client !== "string" || !/^[-\w]{8,100}$/.test(input.client)) fail("Invalid display ID.");
    const active = await this.store.sound(id, row.owner_id, input.client, input.release === true);
    if (actor.publicDisplay) {
      try {
        authorizeRow(await this.store.meta(id), actor);
      } catch (error) {
        if (active) try {
          await this.store.sound(id, row.owner_id, input.client, true);
        } catch {
        }
        throw error;
      }
    }
    if (!active && !input.release) fail("Sound is enabled on another display. Mute it there first.", 409);
    return { active: !input.release };
  }
};

// lib/artwork.js
var fail2 = (message) => {
  const error = new Error(message);
  error.status = 400;
  throw error;
};
var crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 3988292384 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
var crc = (bytes) => {
  let n = 4294967295;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ n >>> 8;
  return (n ^ 4294967295) >>> 0;
};
async function decodeArtwork(input) {
  const kind = input?.kind, limit = artworkLimits[kind + "Bytes"], edge = artworkLimits[kind + "Edge"];
  if (!["background", "logo"].includes(kind) || typeof input.data !== "string" || input.data.length > Math.ceil(limit / 3) * 4 + 24) fail2("Image is too large or invalid.");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.data)) fail2("Upload an optimized PNG image.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(input.data.split(",")[1]), (c) => c.charCodeAt(0));
  } catch {
    fail2("Invalid image.");
  }
  if (bytes.length > limit || bytes.length < 57 || bytes.slice(0, 8).join(",") !== "137,80,78,71,13,10,26,10") fail2("Invalid PNG image.");
  const view = new DataView(bytes.buffer), parts = [];
  let position = 8, width = 0, height = 0, channels = 0, ended = false;
  while (position < bytes.length) {
    if (position + 12 > bytes.length) fail2("Incomplete PNG image.");
    const length = view.getUint32(position), end = position + 12 + length, type = String.fromCharCode(...bytes.slice(position + 4, position + 8));
    if (end > bytes.length || crc(bytes.slice(position + 4, end - 4)) !== view.getUint32(end - 4)) fail2("Invalid PNG checksum.");
    if (position === 8 && type !== "IHDR") fail2("Invalid PNG header.");
    if (type === "IHDR") {
      if (position !== 8 || length !== 13) fail2("Invalid PNG header.");
      width = view.getUint32(position + 8);
      height = view.getUint32(position + 12);
      channels = bytes[position + 17] === 6 ? 4 : bytes[position + 17] === 2 ? 3 : 0;
      if (!width || !height || width > edge || height > edge || bytes[position + 16] !== 8 || !channels || bytes.slice(position + 18, position + 21).some((v) => v !== 0)) fail2("Unsupported PNG dimensions or format.");
    } else if (type === "IDAT") parts.push(bytes.slice(position + 8, end - 4));
    else if (type === "IEND") {
      if (length || !parts.length || end !== bytes.length) fail2("Invalid PNG ending.");
      ended = true;
    } else if ({ sRGB: 1, gAMA: 4, cHRM: 32 }[type] !== length) fail2("Use a still image without embedded metadata.");
    position = end;
  }
  if (!ended) fail2("Incomplete PNG image.");
  const stride = width * channels + 1, expected = stride * height;
  const reader = new Blob(parts).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  let count2 = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) if ((count2 + i) % stride === 0 && value[i] > 4) fail2("Invalid PNG row.");
      count2 += value.length;
      if (count2 > expected) fail2("Invalid PNG pixel size.");
    }
  } catch {
    fail2("Invalid compressed image.");
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  if (count2 !== expected) fail2("Incomplete PNG pixels.");
  const id = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
  return { id, bytes, kind, width, height };
}

// cloud/account-export.js
var uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
var hash2 = /^[a-f0-9]{64}$/;
var AccountExportError = class extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "AccountExportError";
    this.code = code;
    this.status = status;
  }
};
var fail3 = (code = "export_incomplete", message = "Your export could not be completed safely. No partial file was returned.", status = 409) => {
  throw new AccountExportError(code, message, status);
};
var object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
var timestamp = (value) => {
  if (value === null || value === void 0) return null;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) fail3();
  return new Date(value).toISOString();
};
var string = (value) => {
  if (typeof value !== "string" || value.length > 4096) fail3();
  return value;
};
var number = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail3();
  return value;
};
var boolean = (value) => {
  if (typeof value !== "boolean") fail3();
  return value;
};
var nullable = (rule) => (value) => value === null ? null : rule(value);
var list = (rule, max) => (value) => {
  if (!Array.isArray(value) || value.length > max) fail3();
  return value.map(rule);
};
var record = (rules) => (value) => {
  if (!object(value)) fail3();
  const result = {};
  for (const [key, rule] of Object.entries(rules)) if (Object.hasOwn(value, key)) result[key] = rule(value[key]);
  return result;
};
var ref = nullable(record({ owner: string, id: string }));
var stateFields = {
  eventName: string,
  entrants: number,
  playersLeft: number,
  buyIn: number,
  prizePerEntry: number,
  startingStack: number,
  autoAdvance: boolean,
  tableNumbers: string,
  showTableNumbers: boolean,
  tickerText: string,
  showTicker: boolean,
  structurePreset: string,
  structureName: string,
  levels: list(record({ minutes: number, small: number, big: number, ante: number, isBreak: boolean }), 300),
  currentIndex: number,
  timerRemaining: number,
  payoutPreset: string,
  payoutLabel: string,
  roundPayouts: boolean,
  customPayouts: list(number, 1e3),
  bounty: record({ mode: string, amount: number }),
  registration: record({ cutoffIndex: number, override: string }),
  clock: record({ status: string, deadline: nullable(number), remainingMs: number, run: number, consumed: list(number, 10), lastCheck: nullable(number) }),
  payoutConfig: record({ finalized: boolean, basis: nullable(record({ entrants: number, pool: number, buyIn: number })), recipe: record({ itm: number, type: string, finalTable: number, places: nullable(number), minimumMultiple: number, roundPayouts: boolean }) }),
  appearance: record({
    board: string,
    accent: string,
    boardFont: string,
    scale: number,
    theme: string,
    layout: string,
    colorPreset: string,
    backgroundArt: string,
    currency: string,
    payoutVisibility: string,
    soundEnabled: boolean,
    soundVolume: number,
    largestStack: nullable(number),
    smallestStack: nullable(number),
    playDownText: string,
    fields: record(Object.fromEntries(displayFields.map((field) => [field.key, boolean]))),
    artwork: record({ background: ref, logo: ref, advanced: boolean, advancedConfigured: boolean, preset: string, opacity: number, size: number, x: number, y: number, logoSize: number, logoOpacity: number, monochrome: boolean })
  })
};
function projectState(value, owner2, references) {
  const result = record(stateFields)(value);
  if (Object.keys(defaults()).some((key) => !Object.hasOwn(result, key))) fail3();
  try {
    validate(result);
  } catch {
    fail3();
  }
  if (!result.clock || !["ready", "running", "paused", "finished"].includes(result.clock.status) || ["status", "deadline", "remainingMs", "run", "consumed", "lastCheck"].some((key) => !Object.hasOwn(result.clock, key))) fail3();
  const c = result.clock, nonnegative = (value2) => Number.isFinite(value2) && value2 >= 0;
  if (!nonnegative(result.timerRemaining) || result.timerRemaining > 86400 || !nonnegative(c.remainingMs) || c.remainingMs > 864e5 || !Number.isSafeInteger(c.run) || c.run < 0 || c.deadline !== null && !nonnegative(c.deadline) || c.lastCheck !== null && !nonnegative(c.lastCheck) || c.status === "running" && c.deadline === null || !Array.isArray(c.consumed) || c.consumed.some((mark) => ![0, 10, 60].includes(mark)) || new Set(c.consumed).size !== c.consumed.length) fail3();
  for (const key of ["background", "logo"]) {
    const image = result.appearance.artwork?.[key];
    if (!image) continue;
    if (image.owner !== owner2 || !hash2.test(image.id)) fail3("export_ownership", "Your export could not be completed safely.", 403);
    references.add(image.id);
  }
  return result;
}
function projectTournament(row, owner2, references) {
  if (!object(row) || row.owner_id !== owner2 || !uuid.test(row.id) || !object(row.record) || row.record.ownerId !== owner2 || row.record.id !== row.id) fail3("export_ownership", "Your export could not be completed safely.", 403);
  if (row.record.schema !== 2) fail3("export_schema", "This saved data needs a newer export format. No partial file was returned.");
  if (!Number.isSafeInteger(row.revision) || row.revision < 0 || row.record.revision !== row.revision || !Array.isArray(row.record.history) || row.record.history.length > 50) fail3();
  const state = projectState(row.record.state, owner2, references), history = row.record.history.map((item) => projectState(item, owner2, references));
  if (row.name !== state.eventName) fail3();
  return { id: row.id, name: string(row.name), revision: row.revision, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), deletedAt: timestamp(row.record.deletedAt), state, history };
}
function projectProfile(profile, owner2) {
  if (!object(profile) || profile.id !== owner2 || profile.is_anonymous !== false || !profile.email_confirmed_at) fail3("export_unauthorized", "Sign in with a verified account to export your data.", 403);
  if (typeof profile.email !== "string" || profile.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) fail3();
  return { id: owner2, email: profile.email, emailConfirmedAt: timestamp(profile.email_confirmed_at), createdAt: timestamp(profile.created_at) };
}
function assertEnvelope(value, snapshot) {
  if (!object(value) || value.snapshotId !== snapshot.snapshotId || value.version !== snapshot.version || value.ownerId !== snapshot.ownerId) fail3();
}
function toBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
async function buildAccountExport(reader, actor, { now = Date.now, pageSize = 100, maxTournaments = 1e3, maxArtwork = 64, maxBytes = 32 * 1024 * 1024, maxPages = 64, timeoutMs = 3e4, signal } = {}) {
  if (!uuid.test(actor?.userId || "")) fail3("export_unauthorized", "Please sign in again.", 401);
  for (const method of ["openSnapshot", "tournamentPage", "artworkPage", "readArtwork", "verifySnapshot", "closeSnapshot"]) if (typeof reader?.[method] !== "function") fail3("export_unavailable", "Account export is not available on this service yet.", 503);
  for (const [value, min, max] of [[pageSize, 1, 100], [maxTournaments, 0, 1e4], [maxArtwork, 0, 1e3], [maxBytes, 128, 64 * 1024 * 1024], [maxPages, 1, 1e3], [timeoutMs, 1, 6e4]]) if (!Number.isSafeInteger(value) || value < min || value > max) fail3("export_configuration", "Account export is not available on this service yet.", 503);
  const started = now();
  if (!Number.isFinite(started)) fail3();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, timeoutMs);
  let snapshot, result, error;
  const call = async (method, ...args) => {
    if (controller.signal.aborted) fail3("export_interrupted", "Export was interrupted. No partial file was returned.", 503);
    let listener;
    try {
      return await Promise.race([Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Interrupted");
        return reader[method](...args, controller.signal);
      }).catch(() => {
        throw new AccountExportError("export_unavailable", "Your export could not be completed. No partial file was returned.", 503);
      }), new Promise((_, reject) => {
        listener = () => reject(new AccountExportError("export_interrupted", "Export was interrupted. No partial file was returned.", 503));
        controller.signal.addEventListener("abort", listener, { once: true });
      })]);
    } finally {
      controller.signal.removeEventListener("abort", listener);
    }
  };
  try {
    snapshot = await call("openSnapshot", actor.userId);
    if (!object(snapshot) || snapshot.ownerId !== actor.userId || typeof snapshot.snapshotId !== "string" || !snapshot.snapshotId || typeof snapshot.version !== "string" || !snapshot.version || snapshot.status !== "active" || snapshot.consistent !== true) fail3();
    const counts = snapshot.counts;
    if (!object(counts) || !Number.isSafeInteger(counts.tournaments) || counts.tournaments < 0 || !Number.isSafeInteger(counts.artwork) || counts.artwork < 0) fail3();
    if (counts.tournaments > maxTournaments || counts.artwork > maxArtwork) fail3("export_too_large", "This account needs a larger export job. No partial file was returned.", 413);
    const profile = projectProfile(snapshot.profile, actor.userId), references = /* @__PURE__ */ new Set(), tournaments = [], artwork2 = [], seenImages = /* @__PURE__ */ new Set();
    let estimated = 4096;
    const addBytes = (value) => {
      estimated += new TextEncoder().encode(JSON.stringify(value)).byteLength;
      if (estimated > maxBytes) fail3("export_too_large", "This account needs a larger export job. No partial file was returned.", 413);
    };
    const pages = async (method, expected, consume) => {
      let cursor = null, seen = /* @__PURE__ */ new Set(), total = 0, lastKey = "";
      for (let pageNo = 0; pageNo < maxPages; pageNo++) {
        const page = await call(method, snapshot, { cursor, limit: pageSize });
        assertEnvelope(page, snapshot);
        if (!Array.isArray(page.items) || page.items.length > pageSize || !Object.hasOwn(page, "nextCursor") || page.nextCursor !== null && (typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor.length > 512)) fail3();
        if (page.nextCursor !== null && (!page.items.length || seen.has(page.nextCursor))) fail3();
        for (const item of page.items) {
          const key = item?.id;
          if (typeof key !== "string" || key <= lastKey) fail3();
          lastKey = key;
          if (++total > expected) fail3();
          await consume(item);
        }
        if (page.nextCursor === null) {
          if (total !== expected) fail3();
          return;
        }
        seen.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      fail3("export_too_large", "This account needs a larger export job. No partial file was returned.", 413);
    };
    await pages("tournamentPage", counts.tournaments, (row) => {
      const item = projectTournament(row, actor.userId, references);
      addBytes(item);
      tournaments.push(item);
    });
    await pages("artworkPage", counts.artwork, async (item) => {
      if (!object(item) || item.ownerId !== actor.userId || !hash2.test(item.id) || item.path !== `${actor.userId}/${item.id}.png`) fail3("export_ownership", "Your export could not be completed safely.", 403);
      if (!Number.isSafeInteger(item.bytes) || item.bytes < 57 || item.bytes > 524288) fail3();
      if (estimated + Math.ceil(item.bytes / 3) * 4 + 1024 > maxBytes) fail3("export_too_large", "This account needs a larger export job. No partial file was returned.", 413);
      const bytes = await call("readArtwork", snapshot, { id: item.id, path: item.path });
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== item.bytes) fail3();
      const base64 = toBase64(bytes);
      let decoded;
      try {
        decoded = await decodeArtwork({ kind: "background", data: "data:image/png;base64," + base64 });
      } catch {
        fail3();
      }
      if (decoded.id !== item.id) fail3();
      const exported = { id: item.id, filename: item.id + ".png", mediaType: "image/png", bytes: bytes.byteLength, sha256: item.id, encoding: "base64", data: base64 };
      addBytes(exported);
      artwork2.push(exported);
      seenImages.add(item.id);
    });
    if ([...references].some((id) => !seenImages.has(id))) fail3();
    const final = await call("verifySnapshot", snapshot);
    assertEnvelope(final, snapshot);
    if (final.complete !== true || final.status !== "active") fail3();
    const exportedAt = new Date(started).toISOString(), document2 = {
      schema: "pokerclock.account-export",
      version: 1,
      exportedAt,
      profile,
      coverage: {
        activeTournaments: tournaments.filter((t) => !t.deletedAt).length,
        trashedTournaments: tournaments.filter((t) => t.deletedAt).length,
        artworkFiles: artwork2.length,
        includesSavedHistory: true,
        includesDetachedArtwork: true,
        excluded: ["Passwords and authentication material", "Sharing credentials", "Private operational logs and command receipts", "Fields outside this export schema"]
      },
      tournaments,
      artwork: artwork2
    };
    const json2 = JSON.stringify(document2, null, 2);
    if (new TextEncoder().encode(json2).byteLength > maxBytes) fail3("export_too_large", "This account needs a larger export job. No partial file was returned.", 413);
    result = { filename: `pokerclock-account-${exportedAt.slice(0, 10)}.json`, json: json2 };
  } catch (caught) {
    error = caught instanceof AccountExportError ? caught : new AccountExportError("export_unavailable", "Your export could not be completed. No partial file was returned.", 503);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
    if (snapshot) {
      let cleanupTimer;
      try {
        await Promise.race([Promise.resolve().then(() => reader.closeSnapshot(snapshot)), new Promise((_, reject) => {
          cleanupTimer = setTimeout(() => reject(new Error("Cleanup timeout")), 5e3);
        })]);
      } catch {
        error = new AccountExportError("export_unavailable", "Your export could not be completed. No partial file was returned.", 503);
      } finally {
        clearTimeout(cleanupTimer);
      }
    }
  }
  if (error) throw error;
  return result;
}

// cloud/handler.js
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-observer-token, x-clock-display", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
var json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function body(req, limit = 2e5) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new CommandError("JSON is required.", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new CommandError("Invalid JSON.");
  let size = 0, text = "";
  const decoder = new TextDecoder();
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new CommandError("Request too large.", 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw 0;
    return value;
  } catch {
    throw new CommandError("Invalid JSON.");
  }
}
function createHandler(store, { now = Date.now, streamMs = 48e3, pollMs = 750, exportReader = null } = {}) {
  const clock = new CloudClock(store, now);
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (!["GET", "POST"].includes(req.method)) throw new CommandError("Method not allowed.", 405);
      const path = new URL(req.url).pathname.replace(/^\/functions\/v1\/clock/, "").replace(/^\/clock(?=\/)/, "");
      const match = path.match(/^\/t\/([^/]+)\/(state|events|command|links|observer|sound|delete|restore|reuse|artwork|artwork-delete|display-access)$/);
      const exporting = path === "/account/export" && exportReader !== null;
      if (!exporting && path !== "/tournaments" && (!match || !uuidPattern.test(match[1]))) throw new CommandError("Not found.", 404);
      const observer = req.headers.get("x-observer-token");
      let actor;
      if (observer) {
        if (!/^[-\w]{43}$/.test(observer) || req.method !== "GET" || !match || !["state", "events"].includes(match[2])) throw new CommandError("Read-only observer access.", 403);
        actor = { observerHash: await digest(observer) };
      } else if (req.headers.get("x-clock-display") === "1") {
        if (!match || !(req.method === "GET" && ["state", "events"].includes(match[2]) || req.method === "POST" && match[2] === "sound")) throw new CommandError("Read-only display access.", 403);
        actor = { publicDisplay: true };
      } else {
        const jwt = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
        const userId = jwt ? await store.identity(jwt) : null;
        if (!userId) throw new CommandError("Please sign in again.", 401);
        actor = { userId };
      }
      if (exporting) {
        if (req.method !== "GET") throw new CommandError("Method not allowed.", 405);
        const result = await buildAccountExport(exportReader, actor, { now, signal: req.signal });
        return new Response(result.json, { headers: { ...cors, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${result.filename}"` } });
      }
      if (path === "/tournaments") return json(req.method === "GET" ? { tournaments: await store.list(actor.userId, new URL(req.url).searchParams.get("trash") === "1"), capabilities: { trash: false, permanentDelete: true, reuse: true, idempotentCreate: true } } : await clock.create(actor, await body(req)));
      const [, id, action] = match;
      if (action === "artwork" && req.method === "GET") {
        if (!actor.userId) throw new CommandError("Director access required.", 403);
        await clock.read(id, actor);
        if (!store.artwork?.list) throw new CommandError("Image library is not enabled on this host yet.", 503);
        return json(await store.artwork.list(actor.userId));
      }
      if (action === "artwork-delete" && req.method === "POST") {
        if (!actor.userId) throw new CommandError("Director access required.", 403);
        await clock.read(id, actor);
        if (!store.artwork?.remove) throw new CommandError("Image deletion is not enabled on this host yet.", 503);
        const input = await body(req);
        return json(await store.artwork.remove(actor.userId, input.ref, input.generation));
      }
      if (action === "artwork" && req.method === "POST") {
        if (!actor.userId) throw new CommandError("Director access required.", 403);
        await clock.read(id, actor);
        if (!store.artwork) throw new CommandError("Image storage is not enabled on this host yet.", 503);
        const image = await decodeArtwork(await body(req, 71e4));
        return json(await store.artwork(actor.userId, image));
      }
      if (action === "delete" && req.method === "POST") return json(await clock.remove(id, actor, await body(req)));
      if (action === "restore" && req.method === "POST") return json(await clock.trash(id, actor, await body(req), false));
      if (action === "reuse" && req.method === "POST") {
        const input = await body(req);
        return json(await clock.create(actor, { name: input.name, reuseId: id, creationId: input.creationId }));
      }
      if (action === "state" && req.method === "GET") return json(await clock.state(id, actor));
      if (action === "command" && req.method === "POST") return json(await clock.command(id, actor, await body(req)));
      if (action === "display-access" && req.method === "POST") return json(await clock.displayAccess(id, actor, await body(req)));
      if (action === "observer" && req.method === "POST") return json(await clock.observer(id, actor, await body(req)));
      if (action === "sound" && req.method === "POST") return json(await clock.sound(id, actor, await body(req)));
      if (action === "links" && req.method === "GET") {
        const row = await clock.read(id, actor);
        return json({ id, lan: [], observerEnabled: Boolean(row.observer_hash), publicDisplay: displayEnabled(row), artworkUploads: Boolean(store.artwork), artworkLibrary: Boolean(store.artwork?.list) });
      }
      if (action === "events" && req.method === "GET") {
        const initial = await clock.state(id, actor), started = now();
        let stopped = false, timer;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const emit = (packet2) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet2)}

`));
            const close = () => {
              if (!stopped) {
                stopped = true;
                clearTimeout(timer);
                controller.close();
              }
            };
            let packet = initial, lastHeartbeat = now();
            emit(packet);
            const loop = async () => {
              if (stopped) return;
              if (req.signal.aborted || now() - started >= streamMs) {
                close();
                return;
              }
              try {
                const meta = await store.meta(id);
                authorizeRow(meta, actor);
                const c = packet.state.clock;
                const tickDue = c.status === "running" && [60, 10, 0].some((mark) => !c.consumed.includes(mark) && now() >= c.deadline - mark * 1e3);
                if (meta.revision !== packet.revision || tickDue) {
                  packet = await clock.state(id, actor);
                  if (!stopped) emit(packet);
                } else if (now() - lastHeartbeat >= 8e3 && !stopped) {
                  controller.enqueue(encoder.encode(": connected\n\n"));
                  lastHeartbeat = now();
                }
                if (!stopped) timer = setTimeout(loop, pollMs);
              } catch (error) {
                if (!stopped && error.status === 403) controller.enqueue(encoder.encode("event: revoked\ndata: {}\n\n"));
                close();
              }
            };
            timer = setTimeout(loop, pollMs);
            req.signal.addEventListener("abort", close, { once: true });
          },
          cancel() {
            stopped = true;
            clearTimeout(timer);
          }
        });
        return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Connection": "keep-alive" } });
      }
      throw new CommandError("Method not allowed.", 405);
    } catch (error) {
      return json({ error: error.status ? error.message : "The account service is unavailable. No change was confirmed." }, error.status || 503);
    }
  };
}

// cloud/private-artwork-store.js
var ownerPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
var idPattern = /^[a-f0-9]{64}$/;
var imageLibraryLimit = 10;
var imageLinkSeconds = 300;
var failure = (message, status = 503) => Object.assign(new Error(message), { status });
function validOwner(owner2) {
  if (!ownerPattern.test(owner2)) throw failure("Invalid image owner.", 400);
}
function validRef(ref2, owner2) {
  validOwner(owner2);
  if (!ref2 || ref2.owner !== owner2 || !idPattern.test(ref2.id)) throw failure("Use an image from your own library.", 403);
}
var objectPath = (owner2, id, generation) => `${owner2}/${id}${generation > 1 ? "-g" + generation : ""}.png`;
function privateArtworkStore(origin, secretKey2, fetcher = fetch, now = Date.now, ledger = null) {
  const base = `${new URL(origin).origin}/storage/v1`, signed = /* @__PURE__ */ new Map(), uploads = /* @__PURE__ */ new Map();
  async function request(path, body2, { binary = false, method = "POST" } = {}) {
    const response = await fetcher(base + path, { method, headers: { apikey: secretKey2, "Content-Type": binary ? "image/png" : "application/json", ...binary ? { "Cache-Control": "max-age=300", "x-upsert": "false" } : {} }, body: binary ? body2 : JSON.stringify(body2), signal: AbortSignal.timeout(6e3) });
    return response;
  }
  async function files(owner2) {
    validOwner(owner2);
    const response = await request("/object/list/clock-artwork", { prefix: owner2 + "/", limit: imageLibraryLimit + 1, offset: 0, sortBy: { column: "created_at", order: "desc" } });
    if (!response.ok) throw failure("Your image library is unavailable. Please try again.");
    const result = await response.json();
    if (!Array.isArray(result)) throw failure("Your image library is unavailable. Please try again.");
    return result;
  }
  async function link(owner2, ref2, knownGeneration) {
    validRef(ref2, owner2);
    let generation = knownGeneration;
    if (ledger && generation === void 0) {
      const rows = await ledger.list(owner2), asset = rows.find((row) => row.image_id === ref2.id && row.status === "ready");
      if (!asset) throw failure("This image is no longer available. Choose another saved image.", 409);
      generation = asset.generation;
    }
    if (ledger && (!Number.isSafeInteger(generation) || generation < 1)) throw failure("Image version is unavailable.");
    const path = objectPath(owner2, ref2.id, generation || 1), cached = signed.get(path);
    if (cached && cached.expiresAt - now() > 9e4) return { ...cached };
    const response = await request(`/object/sign/clock-artwork/${path}`, { expiresIn: imageLinkSeconds });
    if (!response.ok) throw failure("An image preview could not be loaded. Please try again.");
    const result = await response.json(), expected = `/object/sign/clock-artwork/${path}`;
    if (typeof result?.signedURL !== "string") throw failure("An image preview could not be loaded.");
    const url2 = new URL(base + result.signedURL);
    if (url2.origin !== new URL(base).origin || url2.pathname !== `/storage/v1${expected}` || !url2.searchParams.get("token") || url2.username || url2.password) throw failure("An image preview could not be loaded.");
    const value = { ref: { owner: owner2, id: ref2.id }, generation: generation || 1, url: url2.href, expiresAt: now() + imageLinkSeconds * 1e3 };
    if (signed.size >= 256) signed.delete(signed.keys().next().value);
    signed.set(path, value);
    return { ...value };
  }
  async function list2(owner2) {
    validOwner(owner2);
    if (ledger) {
      const rows2 = await ledger.list(owner2);
      if (!Array.isArray(rows2)) throw failure("Your image library is unavailable. Please retry.");
      const images2 = await Promise.all(rows2.map(async (row) => {
        const ref2 = { owner: owner2, id: row.image_id };
        validRef(ref2, owner2);
        if (!Number.isSafeInteger(row.generation) || row.generation < 1 || !["pending", "ready", "deleting"].includes(row.status)) throw failure("Your image library is unavailable. Please retry.");
        return { ref: ref2, generation: row.generation, status: row.status, bytes: row.bytes, ...row.status === "ready" ? await link(owner2, ref2, row.generation) : {} };
      }));
      return { images: images2, limit: imageLibraryLimit, canDelete: true };
    }
    const rows = await files(owner2);
    const images = await Promise.all(rows.filter((file) => /^[a-f0-9]{64}\.png$/.test(file.name)).slice(0, imageLibraryLimit).map(async (file) => ({
      ...await link(owner2, { owner: owner2, id: file.name.slice(0, -4) }),
      bytes: Number.isSafeInteger(file.metadata?.size) && file.metadata.size >= 0 ? file.metadata.size : null
    })));
    return { images, limit: imageLibraryLimit };
  }
  async function save(owner2, image) {
    validRef({ owner: owner2, id: image?.id }, owner2);
    if (!(image.bytes instanceof Uint8Array) || image.bytes.length > 512 * 1024) throw failure("Use an optimized image no larger than 512 KB.", 413);
    if (ledger) {
      const reservation = await ledger.reserve(owner2, image.id, image.bytes.length);
      if (!Number.isSafeInteger(reservation?.generation) || reservation.generation < 1 || !["pending", "ready"].includes(reservation.status)) throw failure("Image upload was not confirmed. Please retry.");
      if (reservation.status === "pending") {
        const response = await request(`/object/clock-artwork/${objectPath(owner2, image.id, reservation.generation)}`, image.bytes, { binary: true });
        if (!response.ok && response.status !== 409) throw failure("Image upload was not confirmed. Retry the same file to finish it.");
        if (!await ledger.finishUpload(owner2, image.id, reservation.generation)) throw failure("Image upload changed. Refresh the library and retry.");
      }
      return { ref: { owner: owner2, id: image.id }, generation: reservation.generation, status: "ready", ...await link(owner2, { owner: owner2, id: image.id }, reservation.generation) };
    }
    const rows = await files(owner2), name = image.id + ".png";
    if (!rows.some((file) => file.name === name)) {
      if (rows.length >= imageLibraryLimit) throw failure("Your library holds 10 images. Choose one already saved.", 409);
      const response = await request(`/object/clock-artwork/${owner2}/${name}`, image.bytes, { binary: true });
      if (!response.ok && response.status !== 409) throw failure("Image upload was not confirmed. Please try again.");
    }
    return { ref: { owner: owner2, id: image.id }, ...await link(owner2, { owner: owner2, id: image.id }) };
  }
  const upload = async (owner2, image) => {
    validOwner(owner2);
    const previous = uploads.get(owner2) || Promise.resolve();
    const current = previous.catch(() => {
    }).then(() => save(owner2, image));
    uploads.set(owner2, current);
    try {
      return await current;
    } finally {
      if (uploads.get(owner2) === current) uploads.delete(owner2);
    }
  };
  upload.list = list2;
  upload.link = link;
  upload.quotaProtected = Boolean(ledger);
  if (ledger) upload.remove = async (owner2, ref2, generation) => {
    validRef(ref2, owner2);
    if (!Number.isSafeInteger(generation) || generation < 1) throw failure("Refresh the image library before deleting this image.", 400);
    const result = await ledger.beginDelete(owner2, ref2.id, generation);
    if (result?.status === "deleted") return { deleted: true, affected: 0 };
    if (result?.status !== "deleting") throw failure("Image removal was not confirmed. Refresh and retry.");
    signed.delete(objectPath(owner2, ref2.id, generation));
    const response = await request("/object/clock-artwork", { prefixes: [objectPath(owner2, ref2.id, generation)] }, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw failure("The image was removed from your displays, but file cleanup is not confirmed. Retry Delete.");
    if (!await ledger.finishDelete(owner2, ref2.id, generation)) throw failure("Image cleanup changed. Refresh the library and retry.");
    return { deleted: true, affected: Number.isSafeInteger(result.affected) ? result.affected : 0 };
  };
  upload.links = async (owner2, refs) => Promise.all([...new Map(refs.filter(Boolean).filter((ref2) => ref2.owner === owner2).map((ref2) => [ref2.id, ref2])).values()].map((ref2) => link(owner2, ref2)));
  return upload;
}

// cloud/artwork-ledger.js
var publicMessages = /* @__PURE__ */ new Set([
  "Your library holds 10 images. Delete one before uploading another.",
  "Image storage is temporarily full. Existing images remain available.",
  "Image removal is still finishing. Retry shortly.",
  "This upload is not confirmed yet. Retry its upload before deleting it.",
  "Refresh the image library before deleting this image.",
  "This image is no longer available. Choose another saved image."
]);
function artworkLedger(origin, secretKey2, fetcher = fetch) {
  const base = new URL(origin).origin + "/rest/v1/";
  async function request(path, body2) {
    const response = await fetcher(base + path, { method: body2 === void 0 ? "GET" : "POST", headers: { apikey: secretKey2, "Content-Type": "application/json" }, ...body2 === void 0 ? {} : { body: JSON.stringify(body2) }, signal: AbortSignal.timeout(6e3) });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Object.assign(new Error("Image storage is unavailable. Please retry."), { status: 503 });
    }
    if (!response.ok) throw Object.assign(new Error(publicMessages.has(data?.message) ? data.message : "Image storage is unavailable. Please retry."), { status: publicMessages.has(data?.message) ? 409 : 503 });
    return data;
  }
  return {
    list: (owner2) => request(`clock_artwork_assets?owner_id=eq.${owner2}&status=neq.deleted&select=image_id,bytes,generation,status&order=updated_at.desc&limit=10`),
    reserve: (owner2, id, bytes) => request("rpc/clock_artwork_reserve", { p_owner: owner2, p_image: id, p_bytes: bytes }),
    finishUpload: (owner2, id, generation) => request("rpc/clock_artwork_finish_upload", { p_owner: owner2, p_image: id, p_generation: generation }),
    beginDelete: (owner2, id, generation) => request("rpc/clock_artwork_begin_delete", { p_owner: owner2, p_image: id, p_generation: generation }),
    finishDelete: (owner2, id, generation) => request("rpc/clock_artwork_finish_delete", { p_owner: owner2, p_image: id, p_generation: generation })
  };
}

// cloud/artwork-config.js
function privateArtworkEnabled(url2, optIn) {
  return optIn === "clock-artwork" || url2 === "https://sipqgkatvkczxzafhcfn.supabase.co";
}

// cloud/edge.js
function platformKey(name) {
  try {
    const value = JSON.parse(Deno.env.get(name) || "{}")?.default;
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    return null;
  }
}
var secretKey = platformKey("SUPABASE_SECRET_KEYS");
var publishableKey = platformKey("SUPABASE_PUBLISHABLE_KEYS");
var url = Deno.env.get("SUPABASE_URL");
if (!secretKey || !publishableKey || !url) throw new Error("Supabase runtime keys are not configured.");
var artwork = privateArtworkEnabled(url, Deno.env.get("CLOCK_ARTWORK_PRIVATE")) ? privateArtworkStore(url, secretKey, fetch, Date.now, artworkLedger(url, secretKey)) : void 0;
Deno.serve(createHandler(makeStore({ url, secretKey, publishableKey, artwork })));

