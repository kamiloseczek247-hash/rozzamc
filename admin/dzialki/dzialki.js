const loginView = document.querySelector("#admin-login-view");
const passwordView = document.querySelector("#admin-password-view");
const appView = document.querySelector("#admin-app");
const message = document.querySelector("#admin-message");
const requestList = document.querySelector("#admin-requests-list");
const requestsState = document.querySelector("#admin-requests-state");
const activePlotsList = document.querySelector("#active-plots-list");
const activePlotsState = document.querySelector("#active-plots-state");
const detailView = document.querySelector("#request-data");
const placeholder = document.querySelector("#request-placeholder");
const logoutButton = document.querySelector("#admin-logout-button");
const approveButton = document.querySelector("#approve-button");
const rejectForm = document.querySelector("#reject-form");
let selectedRequestId = null;
let selectedRequest = null;
let selectedCollision = null;
let submitting = false;
let playerToken = sessionStorage.getItem("rozzamcToken");
const publicPermissionLabels = {
  BUILD: "Budowanie",
  BREAK: "Niszczenie",
  CONTAINERS: "Otwieranie pojemników",
  DOORS: "Otwieranie drzwi",
  REDSTONE: "Mechanizmy redstone",
  ENTER: "Wchodzenie na działkę",
  ITEMS: "Podnoszenie i używanie przedmiotów",
  PVP: "PvP",
  VEHICLES: "Pojazdy"
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(playerToken ? { Authorization: "Bearer " + playerToken } : {}),
      ...options.headers
    }
  });
  let data = {};
  try { data = await response.json(); } catch { /* Empty or non-JSON responses use a fallback below. */ }
  if (!response.ok) {
    const error = new Error(typeof data.error === "string" && data.error.trim() ? data.error : `Nie udało się wykonać operacji (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatDate(value) {
  if (value == null || value === "") return "Brak danych";
  let date;
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const numeric = Number(value);
    date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pl-PL");
}

function displayValue(value, fallback = "—") {
  return value == null || value === "" ? fallback : String(value);
}

function statusText(status) {
  const normalized = String(status || "").toUpperCase();
  return {
    PENDING: "Oczekuje",
    REJECTED: "Odrzucony",
    APPROVED: "Zatwierdzony"
  }[normalized] || displayValue(status, "Nieznany status");
}

function setAuthenticationView(view) {
  loginView.hidden = view !== "login";
  passwordView.hidden = view !== "password";
  appView.hidden = view !== "app";
}

function showLogin(text) {
  selectedRequestId = null;
  selectedRequest = null;
  setAuthenticationView("login");
  message.textContent = text || "";
}

function addFact(label, value) {
  const fact = document.createElement("div");
  fact.className = "request-fact";
  const term = document.createElement("span");
  term.className = "request-fact-label";
  term.textContent = label;
  const detail = document.createElement("strong");
  detail.textContent = displayValue(value);
  fact.append(term, detail);
  document.querySelector("#request-facts").append(fact);
}

function makeRequestListItem(request) {
  const item = document.createElement("li");
  item.className = "admin-request-item";
  const select = document.createElement("button");
  select.type = "button";
  select.className = "admin-request-select";
  select.setAttribute("aria-current", String(String(request.id) === String(selectedRequestId)));
  const title = document.createElement("strong");
  title.textContent = displayValue(request.playerName, displayValue(request.playerUuid, `Wniosek ${request.id}`));
  const sub = document.createElement("span");
  sub.textContent = `${displayValue(request.world, "Świat nieznany")} · ${statusText(request.status)}`;
  const date = document.createElement("span");
  date.className = "admin-request-date";
  date.textContent = formatDate(request.createdAt);
  select.dataset.requestId = String(request.id);
  select.append(title, sub, date);
  select.addEventListener("click", () => loadRequestDetail(request.id));
  item.append(select);
  return item;
}

function makeActivePlot(plot) {
  const item = document.createElement("li");
  item.className = "data-card plot-card";
  const heading = document.createElement("div");
  heading.className = "plot-card-heading";
  const title = document.createElement("strong");
  title.textContent = displayValue(plot.name, `Działka ${displayValue(plot.id)}`);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "small-button secondary-small";
  remove.textContent = "Usuń działkę";
  remove.addEventListener("click", async () => {
    if (submitting || !window.confirm(`Czy na pewno usunąć działkę „${displayValue(plot.name, plot.id)}”? Tej operacji nie można cofnąć.`)) return;
    setSubmitting(true);
    message.textContent = `Usuwanie działki „${displayValue(plot.name, plot.id)}”…`;
    try {
      await api("/api/admin/plots/delete", {
        method: "POST",
        body: JSON.stringify({ plotId: plot.id })
      });
      message.textContent = `Działka „${displayValue(plot.name, plot.id)}” została usunięta.`;
      await loadRequests();
    } catch (error) {
      message.textContent = `Nie udało się usunąć działki: ${error.message}`;
    } finally {
      setSubmitting(false);
    }
  });
  heading.append(title, remove);
  item.append(heading);
  addPlotDetail(item, "Właściciel", plot.ownerName);
  addPlotDetail(item, "Świat", plot.world);
  addPlotDetail(item, "Wymiary", `${displayValue(plot.width)} × ${displayValue(plot.depth)} bloków`);
  addPlotDetail(item, "Powierzchnia", plot.area == null ? "—" : `${plot.area} bloków²`);
  addPlotDetail(item, "Zakres X", `${displayValue(plot.minX)} – ${displayValue(plot.maxX)}`);
  addPlotDetail(item, "Zakres Z", `${displayValue(plot.minZ)} – ${displayValue(plot.maxZ)}`);

  const fieldset = document.createElement("fieldset");
  fieldset.className = "plot-permissions";
  const legend = document.createElement("legend");
  legend.textContent = "Publiczne uprawnienia";
  fieldset.append(legend);
  const grid = document.createElement("div");
  grid.className = "permission-grid";
  const permissions = plot.permissions && typeof plot.permissions === "object" ? plot.permissions : {};
  for (const [permission, labelText] of Object.entries(publicPermissionLabels)) {
    const label = document.createElement("label");
    label.className = "permission-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = permissions[permission] === true;
    checkbox.setAttribute("aria-label", `${labelText} — ${displayValue(plot.name, `działka ${plot.id}`)}`);
    checkbox.addEventListener("change", async () => {
      const enabled = checkbox.checked;
      setSubmitting(true);
      message.textContent = `Aktualizowanie uprawnienia „${labelText}”…`;
      try {
        await api("/api/admin/plots/permissions", {
          method: "POST",
          body: JSON.stringify({ plotId: plot.id, permission, enabled })
        });
        message.textContent = `Zmieniono uprawnienie „${labelText}” dla działki „${displayValue(plot.name, plot.id)}”.`;
        await loadRequests();
      } catch (error) {
        checkbox.checked = !enabled;
        message.textContent = `Nie udało się zmienić uprawnienia „${labelText}”: ${error.message}`;
      } finally {
        setSubmitting(false);
      }
    });
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(checkbox, text);
    grid.append(label);
  }
  fieldset.append(grid);
  item.append(fieldset);
  return item;
}

function addPlotDetail(parent, label, value) {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.append(strong, document.createTextNode(displayValue(value)));
  parent.append(line);
}

async function loadRequests() {
  requestsState.textContent = "Ładowanie wniosków…";
  activePlotsState.textContent = "Ładowanie działek…";
  try {
    const data = await api("/api/admin/plots");
    const requests = Array.isArray(data.requests) ? data.requests : [];
    const plots = Array.isArray(data.plots) ? data.plots : [];
    requestList.replaceChildren(...requests.map(makeRequestListItem));
    requestsState.textContent = requests.length ? "" : "Brak wniosków o działkę.";
    activePlotsList.replaceChildren(...plots.map(makeActivePlot));
    activePlotsState.textContent = plots.length ? "" : "Brak aktywnych działek.";
    if (selectedRequestId != null && requests.some(request => String(request.id) === String(selectedRequestId))) {
      await loadRequestDetail(selectedRequestId, false);
    } else if (selectedRequestId != null) {
      selectedRequestId = null;
      selectedRequest = null;
      selectedCollision = null;
      detailView.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "Wybrany wniosek nie znajduje się już na liście.";
    }
  } catch (error) {
    if (error.status === 401) {
      showLogin("Sesja administratora wygasła. Zaloguj się ponownie.");
      return;
    }
    requestsState.textContent = `Nie udało się pobrać wniosków: ${error.message}`;
    activePlotsState.textContent = `Nie udało się pobrać aktywnych działek: ${error.message}`;
  }
}

async function loadRequestDetail(id, announce = true) {
  selectedRequestId = id;
  if (announce) message.textContent = "Pobieranie szczegółów wniosku…";
  placeholder.hidden = true;
  detailView.hidden = true;
  try {
    const data = await api(`/api/admin/plots/${encodeURIComponent(String(id))}`);
    const request = data.request;
    if (!request || typeof request !== "object") throw new Error("Serwer nie zwrócił szczegółów wniosku.");
    selectedRequest = request;
    selectedCollision = data.collision && typeof data.collision === "object" ? data.collision : null;
    renderRequest(request, selectedCollision);
    if (announce) message.textContent = "";
    requestList.querySelectorAll(".admin-request-select").forEach(button => {
      button.setAttribute("aria-current", String(button.dataset.requestId === String(request.id)));
    });
  } catch (error) {
    if (error.status === 401) {
      showLogin("Sesja administratora wygasła. Zaloguj się ponownie.");
      return;
    }
    selectedRequest = null;
    selectedCollision = null;
    placeholder.hidden = false;
    placeholder.textContent = `Nie udało się pobrać szczegółów: ${error.message}`;
    if (announce) message.textContent = "";
  }
}

function renderRequest(request, collision) {
  const facts = document.querySelector("#request-facts");
  facts.replaceChildren();
  addFact("Status", statusText(request.status));
  addFact("Właściciel", displayValue(request.playerName, displayValue(request.playerUuid)));
  addFact("UUID gracza", request.playerUuid);
  addFact("Świat", request.world);
  addFact("Współrzędne X", `${displayValue(request.minX)} – ${displayValue(request.maxX)}`);
  addFact("Współrzędne Z", `${displayValue(request.minZ)} – ${displayValue(request.maxZ)}`);
  addFact("Wymiary", `${displayValue(request.width)} × ${displayValue(request.depth)} bloków`);
  addFact("Powierzchnia", request.area == null ? "—" : `${request.area} bloków²`);
  addFact("Data złożenia", formatDate(request.createdAt));
  if (request.reviewedAt != null) addFact("Data rozpatrzenia", formatDate(request.reviewedAt));
  if (request.rejectionReason) addFact("Powód odrzucenia", request.rejectionReason);

  const schematic = document.querySelector("#plot-schematic");
  const width = Number(request.width);
  const depth = Number(request.depth);
  const ratio = Number.isFinite(width) && Number.isFinite(depth) && width > 0 && depth > 0
    ? Math.max(0.55, Math.min(1.8, width / depth))
    : 1;
  schematic.style.setProperty("--schematic-ratio", String(ratio));
  schematic.setAttribute("aria-label", `Schemat działki ${displayValue(request.width)} na ${displayValue(request.depth)} bloków`);

  const collisionStatus = document.querySelector("#collision-status");
  collisionStatus.classList.remove("collision-clear", "collision-found", "collision-unknown");
  if (collision && typeof collision.available === "boolean") {
    collisionStatus.classList.add(collision.available ? "collision-clear" : "collision-found");
    const summary = collision.available ? "Brak kolizji — wniosek może zostać zatwierdzony." : "Wykryto kolizję — wniosek nie może zostać zatwierdzony.";
    collisionStatus.textContent = collision.reason ? `${summary} ${collision.reason}` : summary;
  } else {
    collisionStatus.classList.add("collision-unknown");
    collisionStatus.textContent = "Nie otrzymano prawidłowej informacji o kolizji. Zatwierdzanie jest zablokowane.";
  }

  const pending = String(request.status || "").toUpperCase() === "PENDING";
  const actionable = pending && collision && collision.available === true;
  approveButton.disabled = !actionable || submitting;
  document.querySelector("#reject-button").disabled = !pending || submitting;
  document.querySelector("#rejection-reason").disabled = !pending || submitting;
  detailView.hidden = false;
  placeholder.hidden = true;
}

function setSubmitting(value) {
  submitting = value;
  document.querySelectorAll("#admin-app button, #admin-app textarea, #admin-app input").forEach(control => {
    control.disabled = value;
  });
  if (!value) {
    requestList.querySelectorAll(".admin-request-select").forEach(control => { control.disabled = false; });
    activePlotsList.querySelectorAll("input, button").forEach(control => { control.disabled = false; });
  }
  if (!value && selectedRequest && detailView && !detailView.hidden) {
    renderRequest(selectedRequest, selectedCollision);
  }
}

async function approveRequest() {
  if (submitting || !selectedRequest || !selectedCollision || selectedCollision.available !== true) return;
  if (String(selectedRequest.status || "").toUpperCase() !== "PENDING") return;
  if (!window.confirm("Brak kolizji. Czy na pewno zatwierdzić ten wniosek?")) return;
  const id = selectedRequest.id;
  setSubmitting(true);
  message.textContent = "Zatwierdzanie wniosku…";
  try {
    await api(`/api/admin/plots/${encodeURIComponent(String(id))}/approve`, { method: "POST" });
    message.textContent = "Wniosek został zatwierdzony.";
    await loadRequests();
  } catch (error) {
    message.textContent = `Nie udało się zatwierdzić wniosku: ${error.message}`;
  } finally {
    setSubmitting(false);
  }
}

async function rejectRequest(event) {
  event.preventDefault();
  if (submitting || !selectedRequest || String(selectedRequest.status || "").toUpperCase() !== "PENDING") return;
  const reasonInput = document.querySelector("#rejection-reason");
  const reason = reasonInput.value.trim();
  if (!reason) {
    message.textContent = "Podaj powód odrzucenia wniosku.";
    reasonInput.focus();
    return;
  }
  const id = selectedRequest.id;
  setSubmitting(true);
  message.textContent = "Odrzucanie wniosku…";
  try {
    await api(`/api/admin/plots/${encodeURIComponent(String(id))}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
    message.textContent = "Wniosek został odrzucony.";
    reasonInput.value = "";
    await loadRequests();
  } catch (error) {
    message.textContent = `Nie udało się odrzucić wniosku: ${error.message}`;
  } finally {
    setSubmitting(false);
  }
}

logoutButton.addEventListener("click", async () => {
  if (submitting) return;
  logoutButton.disabled = true;
  message.textContent = "Wylogowywanie…";
  try {
    await api("/api/admin/plots/logout", { method: "POST" });
    showLogin("Wylogowano z panelu administratora.");
  } catch (error) {
    message.textContent = `Nie udało się wylogować: ${error.message}`;
  } finally {
    logoutButton.disabled = false;
  }
});

document.querySelector("#admin-login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const passwordInput = document.querySelector("#admin-password");
  button.disabled = true;
  passwordInput.disabled = true;
  message.textContent = "Logowanie…";
  try {
    const data = await api("/api/admin/plots/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    passwordInput.value = "";
    if (data.forcePasswordChange === true) {
      setAuthenticationView("password");
      message.textContent = "Logowanie udane. Zmień hasło, aby kontynuować.";
    } else {
      setAuthenticationView("app");
      message.textContent = "Zalogowano.";
      await loadRequests();
    }
  } catch (error) {
    message.textContent = `Nie udało się zalogować: ${error.message}`;
  } finally {
    button.disabled = false;
    passwordInput.disabled = false;
  }
});

document.querySelector("#admin-password-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const passwordInput = document.querySelector("#new-admin-password");
  button.disabled = true;
  passwordInput.disabled = true;
  message.textContent = "Zmienianie hasła…";
  try {
    await api("/api/admin/plots/change-password", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    passwordInput.value = "";
    setAuthenticationView("app");
    message.textContent = "Hasło zostało zmienione.";
    await loadRequests();
  } catch (error) {
    message.textContent = `Nie udało się zmienić hasła: ${error.message}`;
  } finally {
    button.disabled = false;
    passwordInput.disabled = false;
  }
});

approveButton.addEventListener("click", approveRequest);
rejectForm.addEventListener("submit", rejectRequest);

async function initialize() {
  try {
    const me = await api("/api/me");
    if (me.isAdmin !== true) {
      showLogin("Administracja działkami jest dostępna tylko dla uprawnionych administratorów.");
      loginView.hidden = true;
      return;
    }
    await api("/api/admin/plots");
    setAuthenticationView("app");
    await loadRequests();
  } catch (error) {
    if (error.status === 401) {
      showLogin("Administracja jest dostępna tylko dla uprawnionych administratorów.");
      loginView.hidden = true;
    } else {
      showLogin(`Nie udało się sprawdzić sesji administratora: ${error.message}`);
    }
  }
}

initialize();
