import { describe, it, expect } from "vitest";
import {
  blankSection,
  nextItemCode,
  nextSectionCode,
  renumber,
  type EditorSection,
} from "@/features/inspections/Components/TemplateForm";

const item = (code: string) =>
  ({ key: code || "k", name: "", description: "", code, inputType: "condition" }) as never;

const section = (code: string, itemCodes: string[]): EditorSection =>
  ({
    key: `s${code}`,
    name: "",
    description: "",
    code,
    items: itemCodes.map(item),
  }) as EditorSection;

describe("new sections", () => {
  it("numbers the section and the check it starts with", () => {
    const created = blankSection("3");
    expect(created.code).toBe("3");
    // The first check used to come out blank because it was built before the
    // section knew its own number.
    expect(created.items).toHaveLength(1);
    expect(created.items[0].code).toBe("3.1");
  });

  it("leaves the first check unnumbered when the section is", () => {
    expect(blankSection().items[0].code).toBe("");
  });

  it("continues correctly from a section created this way", () => {
    const created = blankSection("3");
    expect(nextItemCode(created, 2)).toBe("3.2");
  });
});

describe("template reference numbering", () => {
  it("numbers the first section 1", () => {
    expect(nextSectionCode([])).toBe("1");
  });

  it("continues from the highest section number, not the count", () => {
    // A deleted section must not cause the next one to reuse a number.
    expect(nextSectionCode([section("1", []), section("4", [])])).toBe("5");
  });

  it("ignores sections whose reference is not a number", () => {
    expect(nextSectionCode([section("Brakes", []), section("2", [])])).toBe("3");
  });

  it("numbers a check under its section", () => {
    expect(nextItemCode(section("3", ["3.1", "3.2"]), 2)).toBe("3.3");
  });

  it("falls back to the section position when it has no reference", () => {
    expect(nextItemCode(section("", []), 0)).toBe("1.1");
  });

  it("does not renumber from an Annex I citation it cannot own", () => {
    // 1.1.13 belongs to the Directive; the next added check continues the
    // section's own sequence rather than trying to extend the citation.
    expect(nextItemCode(section("1", ["1.1.13", "1.2"]), 0)).toBe("1.3");
  });

  it("renumbers everything in order when asked", () => {
    const result = renumber([
      section("7", ["7.4", "7.9"]),
      section("2", ["2.1"]),
    ]);
    expect(result[0].code).toBe("1");
    expect(result[0].items.map((i) => i.code)).toEqual(["1.1", "1.2"]);
    expect(result[1].code).toBe("2");
    expect(result[1].items.map((i) => i.code)).toEqual(["2.1"]);
  });

  it("leaves everything else on a row untouched when renumbering", () => {
    const source = section("5", ["5.1"]);
    source.name = "Braking equipment";
    source.items[0].name = "Brake linings and pads";
    const [result] = renumber([source]);
    expect(result.name).toBe("Braking equipment");
    expect(result.items[0].name).toBe("Brake linings and pads");
  });
});
