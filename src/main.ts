import { setupPwa } from "./pwa";

const app = document.getElementById("app");
if (app) app.textContent = "Fretlab — setting up…";
setupPwa((reload) => {
  if (confirm("New version available — reload?")) reload();
});
