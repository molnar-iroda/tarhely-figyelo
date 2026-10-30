// Tárhely-figyelő kezelőfelület. Keretrendszer nélkül; minden szöveg textContent-tel kerül az oldalra.

const TABS = [
  ["attekintes", "Áttekintés"],
  ["levelek", "Levelek"],
  ["beallitasok", "Beállítások"],
  ["cegek", "Cégek"],
  ["utemezes", "Ütemezés"],
  ["naplo", "Napló"]
];

// A null/false gyerekeket kihagyjuk (különben „null” szövegként kerülnének az oldalra).
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...kids) {
  return nativeReplace.apply(this, kids.flat().filter((kid) => kid !== null && kid !== undefined && kid !== false));
};

const S = { tab: "attekintes", status: null, operationShown: false, timer: null, opTimer: null };
const main = document.getElementById("main");

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "value") el.value = value;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

async function api(path, options = {}) {
  const init = { method: options.method ?? "GET", headers: { "x-tarhely": "1" } };
  if (options.body !== undefined) {
    init.method = options.method ?? "POST";
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  let data = null;
  try { data = await response.json(); } catch { /* nem JSON */ }
  if (!response.ok) {
    const error = new Error(data?.hiba ?? `Hiba (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function toast(message, bad = false) {
  const el = h("div", { class: `toast${bad ? " bad" : ""}`, role: bad ? "alert" : "status" }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), bad ? 9000 : 4500);
}

function ask(title, body, okLabel = "Rendben", danger = false) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("dialog");
    dialog.replaceChildren(
      h("h2", {}, title),
      h("div", {}, body),
      h("div", { class: "row", style: null }, h("span", { class: "spacer" }),
        h("button", { class: "btn", onclick: () => { dialog.close(); resolve(false); } }, "Mégse"),
        h("button", { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => { dialog.close(); resolve(true); } }, okLabel))
    );
    dialog.addEventListener("close", () => resolve(false), { once: true });
    dialog.showModal();
  });
}

const fmtTime = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" });
};
const pill = (kind, label) => h("span", { class: `pill ${kind}` }, label);
const STATUS_PILL = { elkuldve: ["ok", "Elküldve"], fuggo: ["warn", "Függőben"], hiba: ["bad", "Hiba"], kihagyva: ["gray", "Kihagyva"], proba: ["gray", "Próba"] };

// ---------- navigáció és állapot ----------

function renderNav() {
  const nav = document.getElementById("nav");
  const st = S.status;
  nav.replaceChildren(...TABS.map(([id, label]) => {
    let badge = null;
    if (id === "attekintes" && st?.ellenorzes) {
      const missing = st.ellenorzes.filter((c) => !c.ok).length;
      if (missing > 0) badge = h("span", { class: "badge", title: "Hiányzó beállítás" }, missing);
    }
    if (id === "levelek" && st?.statisztika && st.statisztika.hibas > 0) badge = h("span", { class: "badge", title: "Hibás levél" }, st.statisztika.hibas);
    return h("button", { "aria-current": S.tab === id ? "page" : null, onclick: () => go(id) }, h("span", {}, label), badge);
  }));
  document.getElementById("verzio").textContent = st ? `v${st.verzio}` : "";
  const foot = document.getElementById("side-status");
  if (!st) { foot.replaceChildren(); return; }
  const run = st.muvelet?.running;
  const last = st.utolsoFutas;
  let kind = "ok", text = "Minden rendben";
  if (run) { kind = "warn"; text = "Fut egy művelet…"; }
  else if (st.ellenorzes?.some((c) => !c.ok)) { kind = "warn"; text = "Hiányzó beállítások"; }
  else if (last && last.exitCode !== 0 && last.finishedAt) { kind = "bad"; text = "Az utolsó futás hibás"; }
  else if (last && !last.finishedAt) { kind = "warn"; text = "Fut vagy megszakadt futás"; }
  foot.replaceChildren(h("div", {}, h("span", { class: `dot ${kind}` }), text),
    ...(st.utemezes?.nextRun ? [h("div", {}, `Következő futás: ${st.utemezes.nextRun}`)] : []));
}

function go(tab) {
  S.tab = tab;
  history.replaceState(null, "", `#${tab}`);
  renderNav();
  render();
}

async function refreshStatus() {
  try {
    S.status = await api("/api/allapot");
    renderNav();
    if (S.tab === "attekintes") renderOverview();
  } catch (error) {
    if (error.status === 403) location.reload();
  }
}

function render() {
  main.replaceChildren();
  ({ attekintes: renderOverview, levelek: renderLetters, beallitasok: renderSettings, cegek: renderCompanies, utemezes: renderSchedule, naplo: renderLog })[S.tab]();
  main.focus({ preventScroll: true });
}

// ---------- Áttekintés ----------

const OP_LABEL = { futtatas: "Éles futás", proba: "Próbafutás", feldolgozas: "Feldolgozás", ellenorzes: "Ellenőrzés", postafiokok: "Postafiókok listázása", "teszt-email": "Teszt e-mail" };

function consoleBox(lines) {
  const box = h("div", { class: "console", role: "log" });
  for (const line of lines) {
    const bad = /hiba|nem sikerült|sikertelen/i.test(line);
    box.append(h("div", { class: bad ? "err" : /figyelem|lejárt/i.test(line) ? "warn" : "" }, line));
  }
  queueMicrotask(() => { box.scrollTop = box.scrollHeight; });
  return box;
}

function renderOverview() {
  const st = S.status;
  if (!st) { main.replaceChildren(h("p", { class: "muted" }, "Betöltés…")); return; }
  const keep = main.scrollTop;
  const parts = [h("h1", {}, "Áttekintés"), h("p", { class: "sub" }, "A tárhely-figyelő állapota és a napi teendők.")];
  if (st.beallitasHiba) parts.push(h("div", { class: "alert bad" }, h("strong", {}, "A beállítások hibásak: "), st.beallitasHiba, " ", h("button", { class: "btn small", onclick: () => go("beallitasok") }, "Javítás")));
  if (st.zar && !st.muvelet.running) {
    parts.push(h("div", { class: "alert warn" }, st.zar.korPerc > 15
      ? `Egy futás zárolva tartja a programot ${st.zar.korPerc} perce. Ha biztosan nem fut semmi (pl. leállt a gép futás közben), feloldhatod. `
      : "Éppen fut egy ütemezett (vagy másik) futás. Várd meg a végét. ",
      st.zar.korPerc > 15 ? h("button", { class: "btn small", onclick: unlock }, "Zár feloldása") : null));
  }
  const last = st.utolsoFutas;
  if (last) {
    const done = Boolean(last.finishedAt);
    const kind = !done ? "warn" : last.exitCode === 0 ? "ok" : "bad";
    parts.push(h("div", { class: `alert ${kind}` },
      h("strong", {}, `${done ? (last.exitCode === 0 ? "Az utolsó futás rendben volt" : "Az utolsó futás hibával zárult") : "Az utolsó futás nem fejeződött be"}`),
      ` (${last.mode === "proba" ? "próba, " : ""}${fmtTime(last.startedAt)}). `,
      `${last.newLetters} új levél, ${last.emailed} e-mail, ${last.unmatched} céghez nem rendelhető. `,
      last.problems.length > 0 ? h("details", {}, h("summary", {}, `${last.problems.length} probléma`), h("ul", {}, last.problems.map((p) => h("li", {}, p)))) : null));
  } else if (st.kesz) {
    parts.push(h("div", { class: "alert warn" }, "Még nem futott a program. Állítsd be a hiányzó lépéseket, majd indíts egy próbafutást."));
  }
  const s = st.statisztika;
  if (s) {
    parts.push(h("div", { class: "grid cols-4" },
      tile("Letöltve összesen", s.osszes), tile("Ma letöltve", s.ma),
      tile("Függő e-mail", s.fuggo, s.fuggo > 0 ? "warn" : ""), tile("Hibás e-mail", s.hibas, s.hibas > 0 ? "bad" : ""),
      tile("Céghez nem rendelt", s.cegNelkul, s.cegNelkul > 0 ? "warn" : "")));
  }
  parts.push(h("div", { class: "grid cols-2", style: null },
    h("section", { class: "card" }, h("h2", {}, "Üzembe helyezés"),
      h("ul", { class: "checks" }, (st.ellenorzes ?? []).map((c) => h("li", {},
        h("span", { class: `mark ${c.ok ? "ok" : "bad"}`, "aria-label": c.ok ? "kész" : "hiányzik" }, c.ok ? "✓" : "!"),
        h("div", {}, c.cim, h("small", {}, c.reszlet)),
        c.ok ? null : h("button", { class: "btn small", onclick: () => go(c.ful) }, "Beállítom"))))),
    h("section", { class: "card" }, h("h2", {}, "Közelgő határidők"),
      s && s.kozeliHatarido.length > 0
        ? h("table", {}, h("tbody", {}, s.kozeliHatarido.map((d) => h("tr", {}, h("td", { class: "nowrap" }, d.datum, d.szamitott ? " ~" : ""), h("td", {}, d.ceg || "–", h("div", { class: "muted" }, d.targy)), h("td", {}, d.ocr ? pill("warn", "OCR") : null)))))
        : h("p", { class: "muted" }, "Nincs közelgő határidő a letöltött levelekben."))));
  parts.push(h("section", { class: "card", style: null }, h("h2", {}, "Műveletek"), opButtons(st)));
  if (st.muvelet?.name) parts.push(h("section", { class: "card", id: "opbox" }, opBox(st.muvelet)));
  main.replaceChildren(...parts.map((p, i) => (i > 0 ? p : p)));
  for (const section of main.querySelectorAll(".card")) section.style.marginTop = "16px";
  main.querySelectorAll(".alert").forEach((a) => { a.style.marginBottom = "12px"; });
  main.scrollTop = keep;
}

const tile = (label, num, kind = "") => h("div", { class: `card tile ${kind}` }, h("div", { class: "num" }, num), h("div", { class: "lbl" }, label));

function opButtons(st) {
  const running = st.muvelet?.running;
  const btn = (label, cls, fn) => h("button", { class: `btn ${cls}`, disabled: running || !st.kesz, onclick: fn }, label);
  return h("div", { class: "row" },
    btn("Futtatás most (éles)", "primary", () => startRun(false)),
    btn("Próbafutás (nem küld e-mailt)", "", () => startRun(true)),
    btn("Beállítások ellenőrzése", "", () => runOp({ nev: "ellenorzes" })),
    btn("Postafiókok listázása", "", () => runOp({ nev: "postafiokok" })),
    btn("Feldolgozás (letöltés nélkül)", "", () => runOp({ nev: "feldolgozas" })),
    running ? h("button", { class: "btn danger", onclick: () => api("/api/muvelet/megszakit", { method: "POST", body: {} }).then(poll) }, "Megszakítás") : null);
}

function opBox(op) {
  return h("div", {},
    h("div", { class: "row" }, h("h2", {}, OP_LABEL[op.name] ?? op.name), h("span", { class: "spacer" }),
      op.running ? pill("warn", "fut…") : op.exitCode === 0 ? pill("ok", "kész") : pill("bad", `hiba (${op.exitCode})`)),
    h("p", { class: "muted" }, `Indítva: ${fmtTime(op.startedAt)}${op.finishedAt ? ` · Befejezve: ${fmtTime(op.finishedAt)}` : ""}`),
    consoleBox(op.lines));
}

async function unlock() {
  if (!(await ask("Zár feloldása", "Csak akkor oldd fel, ha biztosan nem fut a program (például futás közben leállt a gép). Folytatod?", "Feloldás", true))) return;
  try { await api("/api/zar-torles", { method: "POST", body: {} }); toast("A zár feloldva."); refreshStatus(); } catch (e) { toast(e.message, true); }
}

async function startRun(proba) {
  const st = S.status;
  if (proba) { await runOp({ nev: "proba", ...(await sinceChoice(st)) }); return; }
  const info = await sinceChoice(st, true);
  if (info === null) return;
  const ok = await ask("Éles futás indítása",
    h("div", {}, h("p", {}, "A program letölti a tárhelyről az új leveleket, és e-mailben elküldi a könyvelőknek. ", h("strong", {}, "A letöltés jogilag átvételnek számít, és a határidők ettől futnak.")),
      h("p", { class: "muted" }, "Ha először próbálod, érdemes előbb próbafutást indítani.")), "Indítás");
  if (ok) await runOp({ nev: "futtatas", megerosites: true, ...info });
}

async function sinceChoice(st, strict = false) {
  if (!st.elsoFutas) return {};
  // Első letöltés: kell kezdő dátum a beállításokban, vagy itt megadott.
  if (st.ellenorzes.find((c) => c.id === "kezdo")?.ok) return {};
  const input = h("input", { type: "date" });
  const confirmed = await ask("Mettől töltsön le?", h("div", {}, h("p", {}, "Ez az első letöltés. Add meg, mettől érkezett leveleket töltsön le (a letöltés átvételnek számít!)."), input), "Tovább");
  if (!confirmed || !input.value) { if (strict) return null; return {}; }
  return { since: input.value };
}

async function runOp(body) {
  try {
    await api("/api/muvelet", { body });
    S.operationShown = true;
    await poll();
  } catch (e) { toast(e.message, true); }
}

async function poll() {
  clearTimeout(S.opTimer);
  try {
    const op = await api("/api/muvelet");
    if (S.status) S.status.muvelet = op;
    if (S.tab === "attekintes") renderOverview();
    renderNav();
    if (op.running) S.opTimer = setTimeout(poll, 1000);
    else refreshStatus();
  } catch { /* később újra */ }
}

// ---------- Levelek ----------

async function renderLetters() {
  const filter = h("select", {}, [["", "Minden állapot"], ["hiba", "Hibás"], ["fuggo", "Függő"], ["elkuldve", "Elküldve"], ["kihagyva", "Kihagyva"], ["proba", "Próba"]].map(([v, l]) => h("option", { value: v }, l)));
  const search = h("input", { type: "text", placeholder: "Keresés cégre, tárgyra, felelősre…", "aria-label": "Keresés" });
  const wrap = h("div", { class: "tablewrap" });
  const count = h("span", { class: "muted" });
  async function load() {
    try {
      const data = await api(`/api/levelek?allapot=${encodeURIComponent(filter.value)}&q=${encodeURIComponent(search.value)}`);
      count.textContent = `${data.sorok.length} találat / ${data.osszes} levél`;
      wrap.replaceChildren(data.sorok.length === 0 ? h("p", { class: "empty" }, "Nincs megjeleníthető levél.") :
        h("table", {}, h("thead", {}, h("tr", {}, ["Letöltve", "Cég", "Tárgy", "Felelős", "Határidő", "E-mail"].map((t) => h("th", {}, t)))),
          h("tbody", {}, data.sorok.map((r) => {
            const [kind, label] = STATUS_PILL[r.allapot] ?? ["gray", r.allapot];
            return h("tr", {},
              h("td", { class: "nowrap" }, fmtTime(r.letoltve)),
              h("td", {}, r.ceg || "–", r.cegNelkul ? h("div", {}, pill("warn", "nincs a céglistában")) : null),
              h("td", {}, r.targy, r.tipus ? h("div", { class: "muted" }, r.tipus) : null, r.hiba ? h("div", { class: "muted" }, `Hiba: ${r.hiba}`) : null),
              h("td", {}, r.felelos || "–"),
              h("td", {}, r.hatarido ? h("span", { title: r.megjegyzes }, r.hatarido, r.szamitott ? " (számított)" : "") : "–",
                r.ocr ? h("div", {}, pill("warn", "OCR – ellenőrizd!")) : null, r.lejart ? h("div", {}, pill("bad", "lejárt hivatkozás")) : null),
              h("td", {}, pill(kind, label), r.probalkozas > 1 ? h("div", { class: "muted" }, `${r.probalkozas}. próbálkozás`) : null));
          }))));
    } catch (e) { toast(e.message, true); }
  }
  filter.addEventListener("change", load);
  let t; search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(load, 250); });
  main.replaceChildren(h("h1", {}, "Levelek"), h("p", { class: "sub" }, "A letöltött levelek, a határidők és az e-mail állapota. A hibás vagy függő e-maileket a következő futás újra megpróbálja."),
    h("div", { class: "row" }, h("div", {}, filter), h("div", { style: null }, search), count, h("span", { class: "spacer" }),
      h("button", { class: "btn", onclick: () => api("/api/megnyitas", { body: { mit: "excel" } }).catch((e) => toast(e.message, true)) }, "Excel-napló megnyitása")),
    h("div", { class: "card", style: null }, wrap));
  search.style.minWidth = "280px";
  main.lastChild.style.marginTop = "14px";
  load();
}

// ---------- Beállítások ----------

const LISTS = ["kihagyott_postafiokok", "kihagyott_tipusok", "alapertelmezett_cimzett", "titkos_masolat", "hiba_ertesites", "extra_munkaszuneti_napok", "extra_munkanapok"];
const asLines = (v) => (Array.isArray(v) ? v : v ? [v] : []).join("\n");
const fromLines = (s) => s.split(/\r?\n|,|;/).map((x) => x.trim()).filter(Boolean);

async function renderSettings() {
  main.replaceChildren(h("h1", {}, "Beállítások"), h("p", { class: "muted" }, "Betöltés…"));
  let data, secrets;
  try { [data, secrets] = await Promise.all([api("/api/beallitasok"), api("/api/titkok")]); } catch (e) { toast(e.message, true); return; }
  const cfg = data.adatok;
  const f = {};
  const field = (id, label, hint, el) => { f[id] = el; return h("div", {}, h("label", { for: id }, label, hint ? h("span", { class: "hint" }, hint) : null), el); };
  const text = (id, label, hint, value, type = "text", ph = "") => field(id, label, hint, h("input", { id, type, value: value ?? "", placeholder: ph, autocomplete: "off" }));
  const area = (id, label, hint, value) => field(id, label, hint, h("textarea", { id }, asLines(value)));
  f.ssl = h("input", { id: "ssl", type: "checkbox" }); f.ssl.checked = cfg.smtp?.ssl === true;

  const smtp = cfg.smtp ?? {};
  const form = h("div", {},
    section("Címzettek", "Ide mennek a hibaértesítések és a céghez nem rendelhető levelek.",
      area("alapertelmezett_cimzett", "Alapértelmezett címzett", "Egy sor egy e-mail cím. Kötelező.", cfg.alapertelmezett_cimzett),
      area("hiba_ertesites", "Hibaértesítés címzettje", "Üresen hagyva az alapértelmezett címzett kapja.", cfg.hiba_ertesites),
      area("titkos_masolat", "Titkos másolat (bcc)", "Minden kiküldött levélről másolat ide is megy. Nem kötelező.", cfg.titkos_masolat)),
    section("Levelezés (SMTP)", "A tárhely-figyelő ezen a fiókon küldi a leveleket.",
      h("div", { class: "two" }, text("smtp_kiszolgalo", "Kiszolgáló", "pl. smtp.office365.com", smtp.kiszolgalo), text("smtp_port", "Port", "587 (STARTTLS) vagy 465 (SSL)", smtp.port ?? 587, "number")),
      h("div", { class: "two" }, text("smtp_felhasznalo", "Felhasználó", "Üres: hitelesítés nélküli belső továbbító.", smtp.felhasznalo), text("smtp_felado", "Feladó", "pl. Tárhely-figyelő <tarhely@example.com>", smtp.felado)),
      h("label", { class: "check" }, f.ssl, "SSL-kapcsolat azonnal (465-ös port)"),
      h("div", { class: "row", style: null }, h("button", { class: "btn", onclick: sendTest }, "Teszt e-mail küldése…"), h("span", { class: "muted" }, "Előbb mentsd a beállításokat és a jelszót."))),
    section("Letöltés", "Mit és mettől töltsön le.",
      text("kezdo_datum", "Kezdő dátum", "Az ekkortól érkezett leveleket tölti le az első futáskor. A letöltés átvételnek számít!", cfg.kezdo_datum ?? "", "date"),
      area("kihagyott_postafiokok", "Kihagyott postafiókok", "Egy sor egy név (a postafiók nevének részlete).", cfg.kihagyott_postafiokok),
      area("kihagyott_tipusok", "Kihagyott üzenettípusok", "Egy sor egy típus.", cfg.kihagyott_tipusok),
      h("div", { class: "two" }, text("max_csatolmany_mb", "Legnagyobb csatolmány (MB)", "", cfg.max_csatolmany_mb ?? 20, "number"), text("max_level_futasonkent", "Legfeljebb ennyi levél futásonként", "", cfg.max_level_futasonkent ?? 200, "number"))),
    section("Munkarend", "A határidő-számításhoz: a törvényi ünnepeket a program ismeri.",
      area("extra_munkaszuneti_napok", "Plusz munkaszüneti napok", "Egy sor egy dátum (ÉÉÉÉ-HH-NN), pl. hídnapok.", cfg.extra_munkaszuneti_napok),
      area("extra_munkanapok", "Ledolgozós szombatok", "Egy sor egy hétvégi dátum (ÉÉÉÉ-HH-NN), amely munkanap.", cfg.extra_munkanapok)),
    section("Fájlok", "Üresen vagy alapértelmezetten hagyva jó. A relatív útvonalak a beállításfájl mappájához képest értendők.",
      text("ceglista", "Céglista", "", cfg.ceglista ?? "ceglista.xlsx"), text("naplo", "Excel-napló", "", cfg.naplo ?? "letoltesek.xlsx"), text("adatmappa", "Adatmappa", "", cfg.adatmappa ?? "adat")));

  const secretsCard = h("section", { class: "card" }, h("h2", {}, "Belépők"),
    h("p", { class: "muted" }, "A jelszavak az operációs rendszer kulcstartójába kerülnek (Windows: Hitelesítő adatok kezelője, Mac: Kulcskarika), fájlba nem. A kezelőfelület sosem mutatja vissza őket; üresen hagyott mező = nem változik."),
    h("div", { class: "row" }, secrets.ugyfelkapu.megvan ? pill("ok", `Ügyfélkapu+ belépő megvan (${secrets.ugyfelkapu.felhasznalo})`) : pill("warn", "Ügyfélkapu+ belépő hiányzik"),
      secrets.smtp.kell ? (secrets.smtp.megvan ? pill("ok", "SMTP-jelszó megvan") : pill("warn", "SMTP-jelszó hiányzik")) : pill("gray", "SMTP-jelszó nem kell")),
    h("h2", { style: null }, "Ügyfélkapu+"),
    text("uk_felhasznalo", "Felhasználónév", "", "", "text", secrets.ugyfelkapu.felhasznalo ?? ""),
    text("uk_jelszo", "Jelszó", "", "", "password", secrets.ugyfelkapu.megvan ? "(változatlan)" : ""),
    text("uk_totp", "Hitelesítő alkalmazás kulcsa (TOTP-kulcs)", "A QR-kód alatti „Nem tudom beolvasni a kódot” betű-szám sora.", "", "password", secrets.ugyfelkapu.megvan ? "(változatlan)" : ""),
    h("h2", { style: null }, "SMTP-jelszó"),
    text("smtp_jelszo", "A levelező fiók jelszava", "Gmailnél alkalmazásjelszó kell.", "", "password", secrets.smtp.megvan ? "(változatlan)" : ""),
    h("div", { class: "row", style: null }, h("button", { class: "btn primary", onclick: saveSecrets }, "Belépők mentése")));
  for (const el of secretsCard.querySelectorAll("h2")) el.style.marginTop = "16px";
  secretsCard.lastChild.style.marginTop = "16px";

  const bar = h("div", { class: "row", style: null }, h("button", { class: "btn primary", onclick: saveSettings }, "Beállítások mentése"), h("span", { class: "muted" }, `Fájl: ${data.fajl}`));
  bar.style.marginTop = "16px";
  main.replaceChildren(h("h1", {}, "Beállítások"), h("p", { class: "sub" }, "Minden módosítás a mentés után él; az ütemezett futás a következő indulásnál már ezt használja."),
    data.hiba ? h("div", { class: "alert warn" }, data.hiba) : null, secretsCard, form, bar);

  function section(title, sub, ...children) {
    const s = h("section", { class: "card" }, h("h2", {}, title), h("p", { class: "muted" }, sub), ...children);
    s.style.marginTop = "16px";
    for (const row of s.querySelectorAll(".row")) row.style.marginTop = "12px";
    return s;
  }

  async function saveSettings() {
    const out = { ...cfg, smtp: { ...smtp } };
    for (const key of LISTS) out[key] = fromLines(f[key].value);
    for (const key of ["alapertelmezett_cimzett", "hiba_ertesites", "titkos_masolat", "kihagyott_postafiokok", "kihagyott_tipusok", "extra_munkaszuneti_napok", "extra_munkanapok"]) {
      if (out[key].length === 0 && key !== "alapertelmezett_cimzett") out[key] = key === "hiba_ertesites" ? [] : [];
    }
    out.kezdo_datum = f.kezdo_datum.value || null;
    out.max_csatolmany_mb = Number(f.max_csatolmany_mb.value);
    out.max_level_futasonkent = Number(f.max_level_futasonkent.value);
    out.ceglista = f.ceglista.value.trim() || "ceglista.xlsx";
    out.naplo = f.naplo.value.trim() || "letoltesek.xlsx";
    out.adatmappa = f.adatmappa.value.trim() || "adat";
    out.smtp = { ...smtp, kiszolgalo: f.smtp_kiszolgalo.value.trim(), port: Number(f.smtp_port.value), ssl: f.ssl.checked, felhasznalo: f.smtp_felhasznalo.value.trim(), felado: f.smtp_felado.value.trim() };
    try { await api("/api/beallitasok", { body: { adatok: out } }); toast("A beállítások mentve."); refreshStatus(); } catch (e) { toast(e.message, true); }
  }

  async function saveSecrets() {
    const body = {};
    if (f.uk_felhasznalo.value || f.uk_jelszo.value || f.uk_totp.value) body.ugyfelkapu = { felhasznalo: f.uk_felhasznalo.value, jelszo: f.uk_jelszo.value, totp: f.uk_totp.value };
    if (f.smtp_jelszo.value) body.smtpJelszo = f.smtp_jelszo.value;
    if (!body.ugyfelkapu && !body.smtpJelszo) { toast("Nincs mit menteni."); return; }
    try {
      await api("/api/titkok", { body });
      for (const id of ["uk_jelszo", "uk_totp", "smtp_jelszo"]) f[id].value = "";
      toast("A belépők elmentve a rendszer kulcstartójába.");
      renderSettings(); refreshStatus();
    } catch (e) { toast(e.message, true); }
  }

  async function sendTest() {
    const input = h("input", { type: "email", placeholder: "cim@example.com", value: fromLines(f.alapertelmezett_cimzett.value)[0] ?? "" });
    if (!(await ask("Teszt e-mail", h("div", {}, h("p", {}, "Kinek küldjem a próbalevelet? (A mentett beállításokat használja.)"), input), "Küldés"))) return;
    go("attekintes");
    await runOp({ nev: "teszt-email", cim: input.value });
  }
}

// ---------- Cégek ----------

async function renderCompanies() {
  main.replaceChildren(h("h1", {}, "Cégek"), h("p", { class: "muted" }, "Betöltés…"));
  try {
    const data = await api("/api/cegek");
    main.replaceChildren(h("h1", {}, "Cégek"),
      h("p", { class: "sub" }, "Melyik cég melyik könyvelőhöz tartozik. A listát Excelben szerkeszd, mentés után itt frissítsd."),
      data.hiba ? h("div", { class: "alert bad" }, data.hiba) : null,
      ...data.figyelmeztetesek.map((w) => h("div", { class: "alert warn" }, w)),
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => api("/api/megnyitas", { body: { mit: "ceglista" } }).catch((e) => toast(e.message, true)) }, "Céglista megnyitása Excelben"),
        h("button", { class: "btn", onclick: renderCompanies }, "Frissítés"), h("span", { class: "muted" }, data.fajl)),
      h("div", { class: "card", style: null }, data.cegek.length === 0 ? h("p", { class: "empty" }, "A céglista üres. Nyisd meg Excelben, és írd be a cégeket.") :
        h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Cég", "Adószám", "Felelős", "E-mail"].map((t) => h("th", {}, t)))),
          h("tbody", {}, data.cegek.map((c) => h("tr", {}, h("td", {}, c.nev), h("td", { class: "nowrap" }, c.adoszam || "–"), h("td", {}, c.felelos || "–"), h("td", {}, c.emailek.join(", ")))))))),
      h("p", { class: "muted" }, `A céghez nem rendelhető levelek ide mennek: ${data.alapertelmezett.join(", ")}`));
    main.querySelectorAll(".card, .row, .alert").forEach((el) => { el.style.marginTop = "14px"; });
  } catch (e) { toast(e.message, true); }
}

// ---------- Ütemezés ----------

async function renderSchedule() {
  main.replaceChildren(h("h1", {}, "Ütemezés"), h("p", { class: "muted" }, "Betöltés…"));
  let state;
  try { state = await api("/api/utemezes"); } catch (e) { toast(e.message, true); return; }
  if (!state.supported) {
    main.replaceChildren(h("h1", {}, "Ütemezés"), h("div", { class: "alert warn" }, "Az automatikus futás beállítása csak Windowson és macOS-en érhető el."));
    return;
  }
  let times = state.times.length > 0 ? [...state.times] : [...state.alapertelmezett];
  const legacy = state.tasks.filter((t) => t.legacy);
  const list = h("div", { class: "times", "aria-label": "Futási időpontok" });
  const input = h("input", { type: "time", "aria-label": "Új időpont", style: null });
  input.style.width = "140px";
  function draw() {
    list.replaceChildren(...times.map((t) => h("span", { class: "chip" }, t, h("button", { "aria-label": `${t} törlése`, onclick: () => { times = times.filter((x) => x !== t); draw(); } }, "×"))));
    if (times.length === 0) list.append(h("span", { class: "muted" }, "Nincs időpont."));
  }
  draw();
  const apply = async (on) => {
    try { await api("/api/utemezes", { body: { idopontok: times, bekapcsolva: on } }); toast("Az ütemezés beállítva."); renderSchedule(); refreshStatus(); } catch (e) { toast(e.message, true); }
  };
  main.replaceChildren(h("h1", {}, "Ütemezés"), h("p", { class: "sub" }, "Mikor fusson magától a program. Hétköznap fut, a megadott időpontokban."),
    state.enabled ? h("div", { class: "alert ok" }, h("strong", {}, "Az automatikus futás be van kapcsolva. "), `Következő futás: ${state.nextRun ?? "–"}`)
      : h("div", { class: "alert warn" }, state.tasks.length > 0 ? "Az automatikus futás ki van kapcsolva." : "Az automatikus futás még nincs beállítva."),
    legacy.length > 0 ? h("div", { class: "alert warn" }, `Régi típusú ütemezett feladat van beállítva (${legacy.map((t) => t.name).join(", ")}). Az „Alkalmaz” gomb lecseréli az újra.`) : null,
    h("section", { class: "card" }, h("h2", {}, "Futási időpontok (hétköznap)"), list,
      h("div", { class: "row" }, input, h("button", { class: "btn", onclick: () => { if (input.value && !times.includes(input.value)) { times = [...times, input.value].sort(); draw(); } input.value = ""; } }, "Időpont hozzáadása")),
      h("div", { class: "row", style: null }, h("button", { class: "btn primary", onclick: () => apply(true) }, "Alkalmaz és bekapcsol"),
        state.tasks.length > 0 ? h("button", { class: "btn", onclick: () => api("/api/utemezes/kapcsol", { body: { bekapcsolva: !state.enabled } }).then(() => { renderSchedule(); refreshStatus(); }).catch((e) => toast(e.message, true)) }, state.enabled ? "Kikapcsolás" : "Bekapcsolás") : null,
        state.tasks.length > 0 ? h("button", { class: "btn danger", onclick: async () => { if (await ask("Ütemezés törlése", "Az automatikus futás megszűnik. A letöltött adatok megmaradnak.", "Törlés", true)) api("/api/utemezes/torles", { body: {} }).then(() => { toast("Törölve."); renderSchedule(); refreshStatus(); }).catch((e) => toast(e.message, true)); } }, "Ütemezés törlése") : null)),
    h("section", { class: "card" }, h("h2", {}, "Tudnivalók"), h("ul", {},
      h("li", {}, state.platform === "darwin" ? "A program akkor fut, ha a Mac be van kapcsolva, és be vagy jelentkezve. A zárolt képernyő nem akadály." : "A program akkor fut, ha a gép be van kapcsolva, és be vagy jelentkezve a Windowsba. A zárolt képernyő nem akadály."),
      h("li", {}, state.platform === "darwin" ? "Ha a Mac egy időpontban aludt, ébredéskor pótolja a kimaradt futást; kikapcsolt gépen nem fut." : "Ha egy időpontban kikapcsolt a gép, bekapcsoláskor pótolja a kimaradt futást."),
      h("li", {}, "Állítsd be, hogy a gép munkaidőben ne menjen alvó állapotba."),
      h("li", {}, "Futás közben nem jelenik meg ablak; az eredményt az Áttekintés és a Napló mutatja."))));
  main.querySelectorAll(".card, .alert").forEach((el) => { el.style.marginTop = "14px"; });
  main.querySelectorAll(".row").forEach((el) => { el.style.marginTop = "12px"; });
}

// ---------- Napló ----------

async function renderLog() {
  const monthSel = h("select", { "aria-label": "Hónap" });
  const onlyErrors = h("input", { type: "checkbox", id: "csakhiba" });
  const box = h("div", { class: "console" });
  async function load() {
    try {
      const data = await api(`/api/naplo?${monthSel.value ? `honap=${monthSel.value}&` : ""}hibak=${onlyErrors.checked ? 1 : 0}`);
      if (monthSel.options.length === 0) monthSel.replaceChildren(...data.honapok.map((m) => h("option", { value: m }, m)));
      if (data.honap) monthSel.value = data.honap;
      box.replaceChildren(...(data.sorok.length === 0 ? [h("div", {}, "Nincs naplóbejegyzés.")] : data.sorok.map((line) => h("div", { class: /hiba|nem sikerült|sikertelen/i.test(line) ? "err" : /figyelem|lejárt/i.test(line) ? "warn" : "" }, line))));
      box.scrollTop = box.scrollHeight;
    } catch (e) { toast(e.message, true); }
  }
  monthSel.addEventListener("change", load); onlyErrors.addEventListener("change", load);
  const bar = h("div", { class: "row" }, monthSel, h("label", { class: "check", for: "csakhiba", style: null }, onlyErrors, "Csak hibák és figyelmeztetések"), h("span", { class: "spacer" }),
    h("button", { class: "btn", onclick: load }, "Frissítés"),
    h("button", { class: "btn", onclick: () => api("/api/megnyitas", { body: { mit: "naplo" } }).catch((e) => toast(e.message, true)) }, "Naplómappa megnyitása"));
  bar.querySelector("label").style.margin = "0";
  monthSel.style.width = "auto";
  main.replaceChildren(h("h1", {}, "Napló"), h("p", { class: "sub" }, "Minden futás részletes naplója, havi bontásban (az utolsó 600 sor)."), bar, box);
  box.style.marginTop = "14px"; box.style.maxHeight = "none"; box.style.height = "60vh";
  load();
}

// ---------- indulás ----------

const initial = location.hash.slice(1);
if (TABS.some(([id]) => id === initial)) S.tab = initial;
renderNav();
render();
refreshStatus().then(() => { if (S.status?.muvelet?.running) poll(); });
S.timer = setInterval(() => { if (!document.hidden && !S.status?.muvelet?.running) refreshStatus(); }, 5000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshStatus(); });
