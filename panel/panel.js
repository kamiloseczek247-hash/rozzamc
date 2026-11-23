const apiBase = document.querySelector("meta[name='api-base']")?.content || window.location.origin;
const loginView = document.querySelector("#login-view");
const appView = document.querySelector("#app-view");
const message = document.querySelector("#message");
let token = sessionStorage.getItem("rozzamcToken");
let refreshInProgress = false;

async function api(path, options = {}) {
  const response = await fetch(apiBase + path, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Błąd operacji");
    error.status = response.status;
    throw error;
  }
  return data;
}

function logout() {
  token = null;
  sessionStorage.removeItem("rozzamcToken");
  window.dispatchEvent(new CustomEvent("rozzamc:session", { detail: { token: null } }));
  appView.hidden = true;
  loginView.hidden = false;
}

function dateFromTimestamp(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const timestamp = Number(value);
  const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateFromTimestamp(value);
  return date ? date.toLocaleString("pl-PL") : "Brak terminu";
}

function countdown(value) {
  const date = dateFromTimestamp(value);
  if (!date) return "Brak terminu";
  const remaining = Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  return `${days}d ${hours}g ${minutes}m ${seconds}s`;
}

function updateCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach(element => {
    element.textContent = countdown(element.dataset.countdown);
  });
}

function setLoading(selector, text) {
  document.querySelector(selector).textContent = text;
}

async function refreshLoans() {
  const state = document.querySelector("#loans-state");
  state.textContent = "Ładowanie pożyczek…";
  try {
    const data = await api("/api/loans");
    const summary = document.querySelector("#loan-summary");
    const activeLoans = data.loans.filter(loan => String(loan.status).toUpperCase() === "ACTIVE").length;
    summary.textContent = `Saldo: ${data.balance} zł · Limit: ${activeLoans}/${data.maxLoans} aktywnych pożyczek · Maksymalna kwota: ${data.maxAmount} zł · Odsetki: ${data.interestPercent}%`;
    const amountInput = document.querySelector("#loan-amount");
    amountInput.max = data.maxAmount;
    const loanButton = document.querySelector("#loan-form button");
    loanButton.disabled = activeLoans >= data.maxLoans;
    loanButton.title = loanButton.disabled ? "Osiągnięto limit aktywnych pożyczek." : "";
    const list = document.querySelector("#loans-list");
    list.replaceChildren();
    if (!data.loans.length) {
      state.textContent = "Nie masz aktywnych pożyczek.";
      return;
    }
    state.textContent = "";
    for (const loan of data.loans) {
      const item = document.createElement("li");
      item.className = "data-card";
      const title = document.createElement("strong");
      const status = String(loan.status).toUpperCase() === "ACTIVE" ? "Aktywna" : loan.status;
      title.textContent = `Pożyczka · ${status}`;
      const details = document.createElement("p");
      const remaining = Math.max(0, Number(loan.totalDue) - Number(loan.installmentAmount) * loan.installmentsPaid);
      details.textContent = `Kwota: ${loan.principal} zł · Pozostało: ${remaining.toFixed(2)} zł · Rata: ${loan.nextInstallment} zł · Spłacone raty: ${loan.installmentsPaid}/${loan.installmentsTotal}`;
      item.append(title, details);
      if (String(loan.status).toUpperCase() === "ACTIVE" && loan.nextDueAt != null) {
        const due = document.createElement("p");
        due.className = "loan-due";
        due.textContent = `Następna rata: ${loan.nextInstallment} zł · termin ${formatDate(loan.nextDueAt)} (za `;
        const timer = document.createElement("span");
        timer.dataset.countdown = String(loan.nextDueAt);
        timer.textContent = countdown(loan.nextDueAt);
        due.append(timer, document.createTextNode(")"));
        item.append(due);
      } else {
        const due = document.createElement("p");
        due.textContent = String(loan.status).toUpperCase() === "ACTIVE" ? "Oczekiwanie na termin kolejnej raty." : "Pożyczka została spłacona.";
        item.append(due);
      }
      if (String(loan.status).toUpperCase() === "ACTIVE") {
        const repay = document.createElement("button");
        repay.type = "button";
        repay.className = "small-button";
        repay.textContent = "Spłać ratę";
        repay.addEventListener("click", async () => {
          repay.disabled = true;
          message.textContent = "Spłacanie raty…";
          try {
            await api("/api/loans/repay", { method: "POST", body: JSON.stringify({ loanId: loan.id }) });
            message.textContent = "Rata została spłacona.";
            await refreshLoans();
            await refreshAccount();
          } catch (error) {
            message.textContent = error.message;
            repay.disabled = false;
          }
        });
        item.append(repay);
      }
      list.append(item);
    }
  } catch (error) {
    state.textContent = "Nie udało się załadować pożyczek. Spróbuj ponownie przy następnym odświeżeniu.";
    if (error.status === 401) throw error;
    console.error("Pobieranie pożyczek nie powiodło się.", error);
  }
}

function appendCompanyLine(parent, label, value) {
  const line = document.createElement("p");
  line.textContent = `${label}: ${value}`;
  parent.append(line);
}

function addField(form, labelText, input) {
  const label = document.createElement("label");
  label.textContent = labelText;
  label.append(input);
  form.append(label);
}

function makeCompanyActionForm(company, type) {
  const form = document.createElement("form");
  form.className = "inline-form";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0.01";
  input.step = "0.01";
  input.required = true;
  input.inputMode = "decimal";
  if (type === "fund") {
    input.placeholder = "Kwota";
    addField(form, "Wpłać na konto firmy", input);
  } else {
    input.placeholder = "Nick gracza";
    input.type = "text";
    input.minLength = 3;
    input.maxLength = 16;
    input.pattern = "[A-Za-z0-9_]{3,16}";
    const nickname = input;
    const salary = document.createElement("input");
    salary.type = "number";
    salary.min = "0.01";
    salary.step = "0.01";
    salary.required = true;
    salary.inputMode = "decimal";
    addField(form, "Nick pracownika", nickname);
    addField(form, "Wynagrodzenie", salary);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await api("/api/companies/hire", { method: "POST", body: JSON.stringify({ companyId: company.id, nickname: nickname.value, salary: salary.value }) });
        message.textContent = `Wysłano zaproszenie do ${nickname.value}.`;
        await refreshCompanies();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });
    const hire = document.createElement("button");
    hire.type = "submit";
    hire.className = "small-button";
    hire.textContent = "Zaproś pracownika";
    form.append(hire);
    return form;
  }
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "small-button";
  button.textContent = "Wpłać";
  form.append(button);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    try {
      await api("/api/companies/fund", { method: "POST", body: JSON.stringify({ companyId: company.id, amount: input.value }) });
      message.textContent = "Wpłata na konto firmy została wykonana.";
      await refreshCompanies();
      await refreshAccount();
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
    }
  });
  return form;
}

async function refreshCompanies() {
  setLoading("#companies-state", "Ładowanie firm…");
  setLoading("#invitations-state", "Ładowanie zaproszeń…");
  try {
    const data = await api("/api/companies");
    const ownedList = document.querySelector("#owned-companies");
    const companiesList = document.querySelector("#companies-list");
    const employmentList = document.querySelector("#employment-list");
    const invitationsList = document.querySelector("#invitations-list");
    ownedList.replaceChildren();
    companiesList.replaceChildren();
    employmentList.replaceChildren();
    invitationsList.replaceChildren();

    for (const company of data.owned) {
      const item = document.createElement("li");
      item.className = "data-card";
      const title = document.createElement("strong");
      title.textContent = company.name;
      item.append(title);
      appendCompanyLine(item, "Branża", company.category);
      appendCompanyLine(item, "Saldo firmy", `${company.balance} zł`);
      appendCompanyLine(item, "Pracownicy", `${company.employeeCount}/30`);
      const employeeList = document.createElement("ul");
      employeeList.className = "employee-list";
      const employees = company.employees || [];
      if (!employees.length) {
        const empty = document.createElement("li");
        empty.textContent = "Brak aktywnych pracowników.";
        employeeList.append(empty);
      }
      for (const employee of employees) {
        const row = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = employee.username || employee.uuid;
        const salary = document.createElement("p");
        salary.textContent = `Wynagrodzenie: ${employee.salary} zł / 24 h`;
        const payout = document.createElement("p");
        payout.textContent = employee.nextPayoutAt != null ? `Następna wypłata: ${formatDate(employee.nextPayoutAt)}` : "Brak terminu wypłaty.";
        row.append(name, salary, payout);
        employeeList.append(row);
      }
      item.append(employeeList);
      item.append(makeCompanyActionForm(company, "fund"));
      if (company.employeeCount < 30) item.append(makeCompanyActionForm(company, "hire"));
      else appendCompanyLine(item, "Limit", "Firma osiągnęła limit 30 pracowników.");
      ownedList.append(item);
    }
    setLoading("#companies-state", data.owned.length ? "" : "Nie posiadasz jeszcze żadnej firmy.");

    for (const company of data.companies) {
      const item = document.createElement("li");
      item.className = "data-card compact";
      const title = document.createElement("strong");
      title.textContent = company.name;
      item.append(title);
      appendCompanyLine(item, "Branża", company.category);
      appendCompanyLine(item, "Właściciel", company.ownerName);
      appendCompanyLine(item, "Pracownicy", `${company.employeeCount}/30`);
      companiesList.append(item);
    }
    if (!data.companies.length) {
      const empty = document.createElement("li");
      empty.className = "empty-row";
      empty.textContent = "Brak firm na rynku.";
      companiesList.append(empty);
    }

    for (const job of data.employment) {
      const item = document.createElement("li");
      item.className = "data-card compact";
      const title = document.createElement("strong");
      title.textContent = job.companyName;
      item.append(title);
      appendCompanyLine(item, "Branża", job.category);
      appendCompanyLine(item, "Właściciel", job.ownerName);
      appendCompanyLine(item, "Wynagrodzenie", `${job.salary} zł`);
      appendCompanyLine(item, "Kolejna wypłata", formatDate(job.nextPayoutAt));
      const timer = document.createElement("p");
      timer.textContent = "Wypłata za ";
      const countdownElement = document.createElement("span");
      countdownElement.dataset.countdown = String(job.nextPayoutAt);
      countdownElement.textContent = countdown(job.nextPayoutAt);
      timer.append(countdownElement);
      item.append(timer);
      employmentList.append(item);
    }
    if (!data.employment.length) {
      const empty = document.createElement("li");
      empty.className = "empty-row";
      empty.textContent = "Nie jesteś zatrudniony w żadnej firmie.";
      employmentList.append(empty);
    }

    for (const invitation of data.invitations) {
      const item = document.createElement("li");
      item.className = "data-card";
      const title = document.createElement("strong");
      title.textContent = invitation.companyName;
      item.append(title);
      appendCompanyLine(item, "Branża", invitation.category);
      appendCompanyLine(item, "Właściciel", invitation.ownerName);
      appendCompanyLine(item, "Proponowane wynagrodzenie", `${invitation.salary} zł`);
      for (const [accepted, text] of [[true, "Przyjmij"], [false, "Odrzuć"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = accepted ? "small-button" : "small-button secondary-small";
        button.textContent = text;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await api("/api/companies/employment/respond", { method: "POST", body: JSON.stringify({ employmentId: invitation.id, accepted }) });
            message.textContent = accepted ? `Przyjęto zaproszenie do firmy ${invitation.companyName}.` : "Odrzucono zaproszenie.";
            await refreshCompanies();
          } catch (error) {
            message.textContent = error.message;
            button.disabled = false;
          }
        });
        item.append(button);
      }
      invitationsList.append(item);
    }
    setLoading("#invitations-state", data.invitations.length ? "" : "Brak nowych zaproszeń.");
  } catch (error) {
    setLoading("#companies-state", "Nie udało się załadować firm. Spróbuj ponownie przy następnym odświeżeniu.");
    setLoading("#invitations-state", "Nie udało się załadować zaproszeń.");
    if (error.status === 401) throw error;
    console.error("Pobieranie firm nie powiodło się.", error);
  }
}

async function refreshShop() {
  const state = document.querySelector("#shop-state");
  state.textContent = "Ładowanie sklepu…";
  try {
    const data = await api("/api/shop");
    const list = document.querySelector("#shop-list");
    list.replaceChildren();
    document.querySelector("#shop-summary").textContent =
      `Ceny zawierają VAT ${data.vatPercent}%. Limit zapasu: zwykle 500 szt., tanie materiały do 3 000 szt. Uzupełnianie co 12 godzin (najbliższe: ${formatDate(data.nextRestockAt)}).`;
    for (const product of data.items) {
      const item = document.createElement("li");
      item.className = "data-card";
      const title = document.createElement("strong");
      title.textContent = product.name;
      const details = document.createElement("p");
      details.textContent = `${product.price} zł / szt. · VAT wliczony · Stan: ${product.stock}/${product.maxStock}`;
      const quantity = document.createElement("input");
      quantity.type = "number";
      quantity.min = "1";
      quantity.max = String(product.stock);
      quantity.step = "1";
      quantity.value = String(Math.min(64, product.stock || 1));
      quantity.disabled = product.stock < 1;
      quantity.setAttribute("aria-label", `Liczba sztuk: ${product.name}`);
      const buy = document.createElement("button");
      buy.type = "button";
      buy.className = "small-button";
      buy.textContent = "Kup";
      buy.disabled = product.stock < 1;
      buy.addEventListener("click", async () => {
        buy.disabled = true;
        let result;
        try {
          result = await api("/api/shop/purchase", {
            method: "POST",
            body: JSON.stringify({ itemId: product.id, amount: Number(quantity.value) })
          });
          document.querySelector("#shop-message").textContent =
            `Kupiono ${result.amount} × ${result.item} za ${result.gross} zł (VAT ${result.vat} zł wliczony). Przedmioty trafią do ekwipunku lub będą czekać na kolejne wejście na serwer.`;
        } catch (error) {
          document.querySelector("#shop-message").textContent = error.message;
          buy.disabled = false;
          return;
        }
        await Promise.allSettled([refreshShop(), refreshAccount()]);
      });
      item.append(title, details, quantity, buy);
      if (data.isAdmin) {
        const stockQuantity = document.createElement("input");
        stockQuantity.type = "number";
        stockQuantity.min = "1";
        stockQuantity.max = String(product.maxStock);
        stockQuantity.step = "1";
        stockQuantity.value = "64";
        stockQuantity.setAttribute("aria-label", `Zmiana zapasu: ${product.name}`);
        const actions = document.createElement("div");
        actions.className = "shop-admin-actions";
        item.append(stockQuantity);
        for (const [action, label] of [["add", "Dodaj"], ["remove", "Odejmij"]]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = action === "add" ? "small-button" : "small-button secondary-small";
          button.textContent = `${label} stos`;
          button.disabled = action === "add" ? product.stock >= product.maxStock : product.stock < 1;
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await api("/api/shop/stock", {
                method: "POST",
                body: JSON.stringify({ itemId: product.id, amount: Number(stockQuantity.value), action })
              });
              document.querySelector("#shop-message").textContent = `Zmieniono zapas produktu „${product.name}”.`;
              await refreshShop();
            } catch (error) {
              document.querySelector("#shop-message").textContent = error.message;
              button.disabled = false;
            }
          });
          actions.append(button);
        }
        item.append(actions);
      }
      list.append(item);
    }
    state.textContent = data.items.length ? "" : "Sklep nie ma obecnie produktów.";
  } catch (error) {
    state.textContent = "Nie udało się załadować sklepu.";
    if (error.status === 401) throw error;
    console.error("Pobieranie sklepu nie powiodło się.", error);
  }
}

async function refreshAccount() {
  const me = await api("/api/me");
  document.querySelector("#balance").textContent = me.balance + " zł";
  const { transactions } = await api("/api/transactions");
  const list = document.querySelector("#transactions");
  const empty = document.querySelector("#history-empty");
  list.replaceChildren();
  empty.hidden = transactions.length > 0;
  for (const transaction of transactions) {
    const item = document.createElement("li");
    const description = document.createElement("span");
    description.textContent = `${transaction.type} · ${transaction.counterparty}`;
    const amount = document.createElement("strong");
    amount.className = transaction.direction === "OUTGOING" ? "outgoing" : "incoming";
    amount.textContent = `${transaction.direction === "OUTGOING" ? "−" : "+"}${transaction.amount} zł`;
    item.append(description, amount);
    list.append(item);
  }
}

async function refresh() {
  if (!token) return;
  try {
    await refreshAccount();
    loginView.hidden = true;
    appView.hidden = false;
    const [loanResult, companyResult, shopResult] = await Promise.allSettled([refreshLoans(), refreshCompanies(), refreshShop()]);
    const authError = [loanResult, companyResult, shopResult].find(result => result.status === "rejected" && result.reason.status === 401);
    if (authError) throw authError.reason;
    document.querySelector("#last-updated").textContent = `Ostatnia aktualizacja: ${new Date().toLocaleTimeString("pl-PL")}`;
  } catch (error) {
    if (error.status === 401) {
      logout();
      message.textContent = "Sesja wygasła. Zaloguj się ponownie.";
    } else {
      message.textContent = "Nie udało się odświeżyć danych. Spróbuję ponownie za minutę.";
      console.error("Odświeżenie danych panelu nie powiodło się.", error);
    }
  }
}

document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(tab => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-panel").forEach(panel => {
      const active = panel.dataset.panel === button.dataset.tab;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  });
});

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "Logowanie…";
  try {
    const code = document.querySelector("#code").value;
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ code }) });
    token = data.token;
    sessionStorage.setItem("rozzamcToken", token);
    window.dispatchEvent(new CustomEvent("rozzamc:session", { detail: { token } }));
    await refresh();
    message.textContent = "Zalogowano.";
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#transfer-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await api("/api/transfer", { method: "POST", body: JSON.stringify({ nickname: document.querySelector("#nickname").value, amount: document.querySelector("#amount").value }) });
    message.textContent = "Przelew do " + result.recipient + " wykonany. Prowizja: " + result.fee + " zł";
    await refresh();
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#loan-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/loans", { method: "POST", body: JSON.stringify({ amount: document.querySelector("#loan-amount").value, installments: Number(document.querySelector("#loan-installments").value) }) });
    message.textContent = "Pożyczka została przyznana.";
    form.reset();
    await refreshLoans();
    await refreshAccount();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#company-category").addEventListener("change", event => {
  const isCustom = event.target.value === "Inne";
  document.querySelector("#custom-category-wrap").hidden = !isCustom;
  document.querySelector("#custom-category").required = isCustom;
});

document.querySelector("#company-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  const category = document.querySelector("#company-category").value;
  const payload = {
    name: document.querySelector("#company-name").value,
    category
  };
  if (category === "Inne") payload.customCategory = document.querySelector("#custom-category").value;
  try {
    await api("/api/companies", { method: "POST", body: JSON.stringify(payload) });
    message.textContent = "Firma została założona.";
    form.reset();
    document.querySelector("#custom-category-wrap").hidden = true;
    document.querySelector("#custom-category").required = false;
    await refreshCompanies();
    await refreshAccount();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    logout();
  } catch (error) {
    message.textContent = error.message;
  }
});

window.setInterval(async () => {
  updateCountdowns();
  if (!token || refreshInProgress || document.hidden) return;
  refreshInProgress = true;
  try {
    await refresh();
  } finally {
    refreshInProgress = false;
  }
}, 60_000);
window.setInterval(updateCountdowns, 1_000);
refresh();
