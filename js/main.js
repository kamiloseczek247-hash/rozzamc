const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");

const initialServerStatus = {
  state: "SPRAWDZANIE",
  address: "rozzamc.pl",
  players: "—",
  version: "—",
  availability: "ŁĄCZENIE…",
  headline: "Sprawdzam status serwera…",
  updated: "AKTUALIZACJA CO MINUTĘ"
};

function renderServerStatus(status) {
  document.querySelectorAll("[data-status-field]").forEach((element) => {
    const field = element.getAttribute("data-status-field");
    if (field && Object.prototype.hasOwnProperty.call(status, field)) {
      element.textContent = status[field];
    }
  });
}

function isLocalWebsite() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function loadServerStatus() {
  try {
    const url = isLocalWebsite()
      ? "http://127.0.0.1:8123/api/public/status"
      : "https://api.mcsrvstat.us/3/rozzamc.pl";
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Status API zwróciło HTTP ${response.status}`);
    const data = await response.json();
    const online = isLocalWebsite() ? data.online : data.online === true;
    const playersOnline = isLocalWebsite() ? data.onlinePlayers : (data.players?.online ?? 0);
    const maxPlayers = isLocalWebsite() ? data.maxPlayers : data.players?.max;
    renderServerStatus({
      state: online ? "ONLINE" : "OFFLINE",
      players: `${playersOnline} / ${Number.isInteger(maxPlayers) ? maxPlayers : "—"}`,
      version: (isLocalWebsite() ? data.version : data.version) || "—",
      availability: online ? "SERWER DOSTĘPNY" : "SERWER NIEDOSTĘPNY",
      headline: online ? "Serwer jest aktywny" : "Serwer jest obecnie offline",
      updated: `OSTATNIA AKTUALIZACJA: ${new Date().toLocaleTimeString("pl-PL")}`
    });
  } catch (error) {
    renderServerStatus({
      state: "BRAK DANYCH",
      players: "—",
      version: "—",
      availability: "NIE UDAŁO SIĘ SPRAWDZIĆ",
      headline: "Nie można pobrać statusu serwera",
      updated: `PONOWNA PRÓBA ZA MINUTĘ · ${new Date().toLocaleTimeString("pl-PL")}`
    });
    console.error("Pobranie statusu serwera nie powiodło się.", error);
  }
}

renderServerStatus(initialServerStatus);
loadServerStatus();
window.setInterval(loadServerStatus, 60_000);

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Otwórz menu" : "Zamknij menu");
    siteNav.classList.toggle("is-open", !isOpen);
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Otwórz menu");
      siteNav.classList.remove("is-open");
    }
  });
}

const revealElements = document.querySelectorAll(".reveal");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if ("IntersectionObserver" in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

const toast = document.querySelector(".toast");
let toastTimeout;

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();

  if (!copied) {
    throw new Error("Nie udało się skopiować adresu IP.");
  }
}

document.querySelectorAll("[data-copy-ip]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await copyText(button.getAttribute("data-copy-ip"));
      if (toast) {
        toast.textContent = "SKOPIOWANO!";
        toast.classList.add("is-visible");
        window.clearTimeout(toastTimeout);
        toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
      }
    } catch (error) {
      if (toast) {
        toast.textContent = "NIE UDAŁO SIĘ SKOPIOWAĆ";
        toast.classList.add("is-visible");
        window.clearTimeout(toastTimeout);
        toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 3000);
      }
      console.error("Kopiowanie IP nie powiodło się.", error);
    }
  });
});
