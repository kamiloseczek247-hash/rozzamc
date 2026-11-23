
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "panel.rozzamc.pl") {
      url.pathname = "/panel" + (
        url.pathname === "/" ? "/" : url.pathname
      );
    }

    return env.ASSETS.fetch(
      new Request(url, request)
    );
  }
};
