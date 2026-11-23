
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "panel.rozzamc.pl") {
      if (url.pathname === "/") {
        url.pathname = "/panel/";
      } else {
        url.pathname = "/panel" + url.pathname;
      }
    }

    return env.ASSETS.fetch(new Request(url, request));
  }
};
