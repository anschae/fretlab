import type { AppModule } from "./types";

// One line per exercise or tool. Navigation, routing and the stats page are
// generated from this list — nothing else needs to change to add a module.

export const MODULES: readonly AppModule[] = [
];

export function findModule(id: string): AppModule | undefined {
  return MODULES.find((m) => m.id === id);
}
