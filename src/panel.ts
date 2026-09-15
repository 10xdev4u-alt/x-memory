for (const zone of ["library", "reader", "paper"]) {
  document.getElementById(zone)?.setAttribute("data-ready", "true");
}
