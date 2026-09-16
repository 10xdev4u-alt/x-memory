const STEPS = [
  "Sync pulls 12 saves from the demo account.",
  "Briefs land on every save with reasons attached.",
  "One claim checks out, one prediction resolves true.",
  "The Morning Paper assembles: resolved, missed, one debate.",
  "Playback reads it aloud. Total runtime under a minute.",
];

const STEP_MS = 1200;

function renderSteps(list, done) {
  list.replaceChildren();
  STEPS.forEach((text, index) => {
    const item = document.createElement("li");
    item.replaceChildren(text);
    if (index < done) item.classList.add("done");
    list.append(item);
  });
}

function play(list, status, button) {
  button.disabled = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    renderSteps(list, STEPS.length);
    status.replaceChildren("Demo complete. No motion used.");
    button.disabled = false;
    return;
  }
  let done = 0;
  renderSteps(list, done);
  status.replaceChildren("Demo running.");
  const timer = window.setInterval(() => {
    done += 1;
    renderSteps(list, done);
    if (done >= STEPS.length) {
      window.clearInterval(timer);
      status.replaceChildren("Demo complete. That was the whole product.");
      button.disabled = false;
    }
  }, STEP_MS);
}

const list = document.getElementById("demo-steps");
const status = document.getElementById("demo-status");
const button = document.getElementById("demo-play");

if (list !== null && status !== null && button !== null) {
  renderSteps(list, 0);
  status.replaceChildren("Demo ready.");
  button.addEventListener("click", () => play(list, status, button));
}
