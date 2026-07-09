import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Side-effect import: globally silence auth-related toasts (HTTP 401/403,
// "Unauthorized", "Session expired"). Must run before any component
// renders so toast.error gets patched before pages try to call it.
import "@/lib/suppressAuthToasts";

createRoot(document.getElementById("root")!).render(<App />);
