import type { AppModule } from "./types";

// One line per exercise or tool. Navigation, routing and the stats page are
// generated from this list — nothing else needs to change to add a module.
import { intervalEar } from "./interval-ear";
import { fretboardNameNote } from "./fretboard-name-note";
import { fretboardFindNote } from "./fretboard-find-note";
import { noteDrill } from "../tools/note-drill";

export const MODULES: readonly AppModule[] = [
  intervalEar,
  fretboardNameNote,
  fretboardFindNote,
  noteDrill,
];

export function findModule(id: string): AppModule | undefined {
  return MODULES.find((m) => m.id === id);
}
