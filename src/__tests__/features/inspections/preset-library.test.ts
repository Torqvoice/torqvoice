import { describe, it, expect } from "vitest";
import {
  TEMPLATE_PRESETS,
  countPresetItems,
} from "@/features/inspections/Lib/templatePresets";

/**
 * The whole library is installed for a workshop rather than picked one at a
 * time, so these guard the shape of what gets written: every preset has to be
 * uniquely named (installation skips by name), and none may be empty.
 */
describe("preset library", () => {
  const library = TEMPLATE_PRESETS.filter((p) => p.id !== "blank");

  it("names every preset uniquely, since installation matches by name", () => {
    const names = library.map((p) => p.name.trim().toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every preset at least one section and one check", () => {
    for (const preset of library) {
      expect(preset.sections.length, preset.name).toBeGreaterThan(0);
      expect(countPresetItems(preset), preset.name).toBeGreaterThan(0);
      for (const section of preset.sections) {
        expect(section.items.length, `${preset.name} / ${section.name}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the blank starting point out of the library", () => {
    // "blank" is a way to start building a checklist, not a checklist, so
    // stocking it for every workshop would just be a row to delete.
    expect(library.some((p) => p.id === "blank")).toBe(false);
    expect(TEMPLATE_PRESETS.some((p) => p.id === "blank")).toBe(true);
  });

  it("ships exactly one general checklist to be the default", () => {
    // installPresetsForOrg marks standard-multipoint as default when the
    // organization has none, rather than a national statutory test it may not
    // be approved to run.
    expect(library.filter((p) => p.id === "standard-multipoint")).toHaveLength(1);
  });

  it("gives every measurement check a unit or a bound to grade against", () => {
    for (const preset of library) {
      for (const section of preset.sections) {
        for (const item of section.items) {
          if (item.inputType !== "measurement") continue;
          const usable =
            !!item.unit || item.minValue !== undefined || item.maxValue !== undefined;
          expect(usable, `${preset.name} / ${item.name}`).toBe(true);
        }
      }
    }
  });

  it("only grades an out-of-range reading as a real defect category", () => {
    for (const preset of library) {
      for (const section of preset.sections) {
        for (const item of section.items) {
          if (!item.defaultSeverity) continue;
          expect(["attention", "fail", "dangerous"], item.name).toContain(
            item.defaultSeverity
          );
        }
      }
    }
  });
});
