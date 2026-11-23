const message = document.querySelector("#plots-message");
const plotsList = document.querySelector("#plots-list");
const requestsList = document.querySelector("#plot-requests");
const pendingList = document.querySelector("#plot-pending");
const authNotice = document.querySelector("#plots-auth");
const permissionLabels = {
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
const statusLabels = {
  PENDING: "Oczekuje",
  REJECTED: "Odrzucony",
  APPROVED: "Zatwierdzony",
  CANCELLED: "Anulowany"
};
let token = sessionStorage.getItem("rozzamcToken");

function setPlotControlsDisabled(disabled) {
  document.querySelectorAll("#plots-list input, #plots-list button, #plot-pending input, #plot-pending button, #plot-requests input, #plot-requests button").forEach(control => {
    control.disabled = disabled;
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
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

function showAuth(messageText) {
  token = null;
  sessionStorage.removeItem("rozzamcToken");
  authNotice.hidden = false;
  document.querySelector("#owned-plots-heading").parentElement.hidden = true;
  document.querySelector("#plot-pending-heading").parentElement.hidden = true;
  document.querySelector("#plot-requests-heading").parentElement.hidden = true;
  message.textContent = messageText;
}

window.addEventListener("rozzamc:session", event => {
  token = event.detail?.token || null;
  if (token) {
    loadPlots();
    return;
  }
  plotsList.replaceChildren();
  pendingList.replaceChildren();
  requestsList.replaceChildren();
  showAuth("Zaloguj się, aby zobaczyć swoje działki.");
});

function displayDate(value) {
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

function statusBadge(status) {
  const normalized = String(status || "").toUpperCase();
  const badge = document.createElement("span");
  const knownStatus = ["PENDING", "REJECTED", "APPROVED", "CANCELLED"].includes(normalized) ? normalized.toLowerCase() : "unknown";
  badge.className = `plot-status status-${knownStatus}`;
  badge.textContent = statusLabels[normalized] || displayValue(status, "Nieznany status");
  return badge;
}

function addDetail(parent, label, value) {
  const line = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.append(strong, document.createTextNode(displayValue(value)));
  parent.append(line);
}

function makePermissionControls(plot) {
  const section = document.createElement("fieldset");
  section.className = "plot-permissions";
  const legend = document.createElement("legend");
  legend.textContent = "Uprawnienia działki";
  section.append(legend);
  const grid = document.createElement("div");
  grid.className = "permission-grid";
  const current = plot.permissions && typeof plot.permissions === "object" ? plot.permissions : {};

  for (const [permission, labelText] of Object.entries(permissionLabels)) {
    const label = document.createElement("label");
    label.className = "permission-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = current[permission] === true;
    checkbox.setAttribute("aria-label", `${labelText} — ${displayValue(plot.name, `działka ${plot.id}`)}`);
    checkbox.addEventListener("change", async () => {
      setPlotControlsDisabled(true);
      try {
        await api("/api/plots/permissions", {
          method: "POST",
          body: JSON.stringify({ plotId: plot.id, permission, enabled: checkbox.checked })
        });
        message.textContent = `Zmieniono uprawnienie „${labelText}” dla działki „${displayValue(plot.name, plot.id)}”.`;
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        message.textContent = `Nie udało się zmienić uprawnienia „${labelText}”: ${error.message}`;
      } finally {
        setPlotControlsDisabled(false);
      }
    });
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(checkbox, text);
    grid.append(label);
  }
  section.append(grid);
  return section;
}

function makeMembersSection(plot) {
  const section = document.createElement("section");
  section.className = "plot-members";
  const heading = document.createElement("h3");
  heading.textContent = "Zaufani gracze";
  const members = Array.isArray(plot.members) ? plot.members : [];
  const list = document.createElement("ul");
  list.className = "member-list";
  if (!members.length) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    empty.textContent = "Nie dodano zaufanych graczy.";
    list.append(empty);
  }
  for (const member of members) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = displayValue(member.name, displayValue(member.uuid, "Nieznany gracz"));
    const details = Array.isArray(member.permissions) && member.permissions.length
      ? document.createTextNode(` · ${member.permissions.map(value => displayValue(value)).join(", ")}`)
      : document.createTextNode("");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-button secondary-small";
    remove.textContent = "Usuń";
    remove.addEventListener("click", async () => {
      setPlotControlsDisabled(true);
      try {
        await api("/api/plots/untrust", {
          method: "POST",
          body: JSON.stringify({ plotId: plot.id, memberUuid: member.uuid })
        });
        message.textContent = `Usunięto gracza ${displayValue(member.name, member.uuid)} z zaufanych.`;
        await loadPlots();
      } catch (error) {
        message.textContent = `Nie udało się usunąć gracza: ${error.message}`;
      } finally {
        setPlotControlsDisabled(false);
      }
    });
    item.append(name, details, remove);
    list.append(item);
  }

  const form = document.createElement("form");
  form.className = "trust-form";
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "text";
  input.name = "nickname";
  input.autocomplete = "off";
  input.required = true;
  label.textContent = "Nick gracza";
  label.append(input);
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "small-button";
  button.textContent = "Dodaj zaufanego";
  form.append(label, button);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    setPlotControlsDisabled(true);
    try {
      await api("/api/plots/trust", {
        method: "POST",
        body: JSON.stringify({ plotId: plot.id, nickname: input.value.trim() })
      });
      message.textContent = `Dodano gracza ${input.value.trim()} do zaufanych.`;
      await loadPlots();
    } catch (error) {
      message.textContent = `Nie udało się dodać gracza: ${error.message}`;
    } finally {
      setPlotControlsDisabled(false);
    }
  });
  section.append(heading, list, form);
  return section;
}

function renderPlot(plot) {
  const item = document.createElement("li");
  item.className = "data-card plot-card";
  const heading = document.createElement("div");
  heading.className = "plot-card-heading";
  const title = document.createElement("strong");
  title.textContent = displayValue(plot.name, `Działka ${displayValue(plot.id)}`);
  heading.append(title);
  item.append(heading);
  addDetail(item, "Świat", plot.world);
  addDetail(item, "Właściciel", plot.ownerName);
  addDetail(item, "Wymiary", `${displayValue(plot.width)} × ${displayValue(plot.depth)} bloków`);
  addDetail(item, "Powierzchnia", plot.area == null ? "—" : `${plot.area} bloków²`);
  addDetail(item, "Koszt działki", plot.cost == null ? "—" : `${plot.cost} zł`);
  addDetail(item, "Zakres X", `${displayValue(plot.minX)} – ${displayValue(plot.maxX)}`);
  addDetail(item, "Zakres Z", `${displayValue(plot.minZ)} – ${displayValue(plot.maxZ)}`);
  addDetail(item, "Utworzono", displayDate(plot.createdAt));
  item.append(makePermissionControls(plot), makeMembersSection(plot));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "back-button secondary";
  remove.textContent = "Usuń działkę i odzyskaj koszt";
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Czy na pewno usunąć działkę „${displayValue(plot.name, plot.id)}”? Koszt zostanie zwrócony.`)) return;
    setPlotControlsDisabled(true);
    try {
      await api("/api/plots/delete", { method: "POST", body: JSON.stringify({ plotId: plot.id }) });
      message.textContent = `Usunięto działkę i zwrócono ${plot.cost == null ? "koszt" : `${plot.cost} zł`}.`;
      await loadPlots();
    } catch (error) {
      message.textContent = `Nie udało się usunąć działki: ${error.message}`;
    } finally {
      setPlotControlsDisabled(false);
    }
  });
  item.append(remove);
  return item;
}

function renderRequest(request) {
  const item = document.createElement("li");
  item.className = "data-card compact plot-request-card";
  const heading = document.createElement("div");
  heading.className = "plot-card-heading";
  const title = document.createElement("strong");
  title.textContent = `Wniosek · ${displayValue(request.world, "świat nieznany")}`;
  heading.append(title, statusBadge(request.status));
  item.append(heading);
  addDetail(item, "Wymiary", `${displayValue(request.width)} × ${displayValue(request.depth)} bloków`);
  addDetail(item, "Powierzchnia", request.area == null ? "—" : `${request.area} bloków²`);
  addDetail(item, "Koszt", request.cost == null ? "—" : `${request.cost} zł`);
  addDetail(item, "Zakres X", `${displayValue(request.minX)} – ${displayValue(request.maxX)}`);
  addDetail(item, "Zakres Z", `${displayValue(request.minZ)} – ${displayValue(request.maxZ)}`);
  addDetail(item, "Data złożenia", displayDate(request.createdAt));
  if (request.reviewedAt != null) addDetail(item, "Data rozpatrzenia", displayDate(request.reviewedAt));
  if (request.rejectionReason) addDetail(item, "Powód odrzucenia", request.rejectionReason);
  if (String(request.status || "").toUpperCase() === "PENDING") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "small-button secondary-small";
    cancel.textContent = "Anuluj zgłoszenie";
    cancel.addEventListener("click", async () => {
      if (!window.confirm("Czy na pewno anulować to zgłoszenie działki? Koszt zostanie zwrócony.")) return;
      setPlotControlsDisabled(true);
      try {
        await api("/api/plots/requests/cancel", {
          method: "POST",
          body: JSON.stringify({ requestId: request.id })
        });
        message.textContent = "Zgłoszenie zostało anulowane, a koszt zwrócony.";
        await loadPlots();
      } catch (error) {
        message.textContent = `Nie udało się anulować zgłoszenia: ${error.message}`;
      } finally {
        setPlotControlsDisabled(false);
      }
    });
    item.append(cancel);
  }
  return item;
}

async function loadPlots() {
  if (!token) {
    showAuth("Zaloguj się, aby zobaczyć swoje działki.");
    return;
  }
  authNotice.hidden = true;
  document.querySelector("#owned-plots-heading").parentElement.hidden = false;
  document.querySelector("#plot-pending-heading").parentElement.hidden = false;
  document.querySelector("#plot-requests-heading").parentElement.hidden = false;
  message.textContent = "Ładowanie działek…";
  try {
    const data = await api("/api/plots");
    const plots = Array.isArray(data.plots) ? data.plots : [];
    const requests = Array.isArray(data.requests) ? data.requests : [];
    plotsList.replaceChildren(...plots.map(renderPlot));
    const pendingRequests = requests.filter(request => String(request.status).toUpperCase() === "PENDING");
    const historyRequests = requests.filter(request => String(request.status).toUpperCase() !== "PENDING");
    pendingList.replaceChildren(...pendingRequests.map(renderRequest));
    requestsList.replaceChildren(...historyRequests.map(renderRequest));
    document.querySelector("#plots-empty").hidden = plots.length > 0;
    document.querySelector("#pending-empty").hidden = pendingRequests.length > 0;
    document.querySelector("#requests-empty").hidden = historyRequests.length > 0;
    message.textContent = "";
  } catch (error) {
    if (error.status === 401) {
      showAuth("Sesja wygasła. Zaloguj się ponownie w panelu gracza.");
      return;
    }
    message.textContent = `Nie udało się pobrać działek: ${error.message}`;
  }
}

loadPlots();
