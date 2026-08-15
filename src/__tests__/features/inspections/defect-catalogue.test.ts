import { describe, it, expect } from "vitest";
import { rankSuggestions } from "@/features/inspections/Lib/defectCatalogue";
import {
  conditionGrade,
  gradedConditionLabel,
} from "@/features/inspections/Lib/conditions";

describe("national defect codes", () => {
  // Verified against Statens vegvesen and Norwegian workshop guidance:
  // 0 ingen mangel, 1 mindre mangel (godkjent med merknad), 2 vesentlig
  // mangel (etterkontroll), 3 farlig mangel (bruksforbud), 4 ikke kontrollert.
  it("numbers the Norwegian EU-kontroll grades", () => {
    expect(conditionGrade("pass", "eu", "NO")).toBe(0);
    expect(conditionGrade("attention", "eu", "NO")).toBe(1);
    expect(conditionGrade("fail", "eu", "NO")).toBe(2);
    expect(conditionGrade("dangerous", "eu", "NO")).toBe(3);
    expect(conditionGrade("not_inspected", "eu", "NO")).toBe(4);
  });

  it("shows no number for a country with no scheme on record", () => {
    // The Directive names its categories but does not number them, so
    // inventing a code for an unresearched country would be a wrong code on
    // a legal document.
    expect(conditionGrade("fail", "eu", "DE")).toBeNull();
    expect(conditionGrade("fail", "eu", null)).toBeNull();
    expect(gradedConditionLabel("fail", "eu", "DE")).toBe("Major defect");
  });

  it("never numbers the plain three-step scale", () => {
    expect(conditionGrade("fail", "basic", "NO")).toBeNull();
  });

  it("puts the code before the wording", () => {
    expect(gradedConditionLabel("fail", "eu", "NO")).toBe("2 — Major defect");
    expect(gradedConditionLabel("attention", "eu", "NO", "Mindre mangel")).toBe(
      "1 — Mindre mangel"
    );
  });
});


const BRAKE_PADS = {
  name: "Brake linings and pads",
  code: "1.1.13",
  sectionCode: "1",
};

describe("rankSuggestions", () => {
  it("returns the Annex I wording for a check with a known code", () => {
    const texts = rankSuggestions(BRAKE_PADS).map((s) => s.text);
    expect(texts).toContain("Linings or pads worn down to the wear indicator");
    expect(texts).toContain("Lining or pad missing or incorrectly mounted");
  });

  it("carries the severity the Directive assigns to each reason", () => {
    const suggestions = rankSuggestions(BRAKE_PADS);
    const worn = suggestions.find(
      (s) => s.text === "Linings or pads worn down to the wear indicator"
    );
    const metalToMetal = suggestions.find((s) =>
      s.text.includes("metal to metal contact")
    );
    // The same fault is a major defect at the indicator and a dangerous one
    // past it — the whole point of pairing wording with a grade.
    expect(worn?.severity).toBe("fail");
    expect(metalToMetal?.severity).toBe("dangerous");
  });

  it("falls back to the parent code when a check has no entry of its own", () => {
    const suggestions = rankSuggestions({
      name: "Some brake sub-check",
      code: "1.1.13.4",
      sectionCode: "1",
    });
    expect(suggestions.map((s) => s.text)).toContain(
      "Linings or pads worn down to the wear indicator"
    );
  });

  it("falls back to the section when neither the code nor its parents match", () => {
    const suggestions = rankSuggestions({
      name: "Unlisted steering check",
      code: "2.99",
      sectionCode: "2",
    });
    expect(suggestions.map((s) => s.text)).toContain("Excessive play in the steering");
  });

  it("matches on the check name when a template carries no codes", () => {
    const suggestions = rankSuggestions({ name: "Front tyre tread depth" });
    expect(suggestions.map((s) => s.text)).toContain("Tread below the legal minimum");
  });

  it("always offers general wording so no check is left without a phrase", () => {
    const suggestions = rankSuggestions({ name: "Something entirely unusual" });
    expect(suggestions.map((s) => s.text)).toContain("Damaged");
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("puts the workshop's own wording first, then what it has used before", () => {
    const suggestions = rankSuggestions(
      { ...BRAKE_PADS, defectSuggestions: ["Pads at 2mm, replace"] },
      { history: [{ text: "Rear pads low", severity: "fail" }] }
    );
    expect(suggestions[0].text).toBe("Pads at 2mm, replace");
    expect(suggestions[0].source).toBe("workshop");
    expect(suggestions[1].text).toBe("Rear pads low");
    expect(suggestions[1].source).toBe("history");
  });

  it("floats phrases matching the grade already picked, without hiding the rest", () => {
    const suggestions = rankSuggestions(BRAKE_PADS, { preferred: "dangerous" });
    expect(suggestions[0].severity).toBe("dangerous");
    // Other severities are still reachable — the same fault can be graded
    // differently depending on how far gone it is.
    expect(suggestions.some((s) => s.severity === "fail")).toBe(true);
  });

  it("drops the dangerous category on the plain three-step scale", () => {
    const suggestions = rankSuggestions(BRAKE_PADS, { scale: "basic" });
    expect(suggestions.some((s) => s.severity === "dangerous")).toBe(false);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("does not repeat a phrase that appears in more than one source", () => {
    const suggestions = rankSuggestions(BRAKE_PADS, {
      history: [
        { text: "Lining or pad missing or incorrectly mounted", severity: "fail" },
      ],
    });
    const matches = suggestions.filter(
      (s) => s.text === "Lining or pad missing or incorrectly mounted"
    );
    expect(matches).toHaveLength(1);
    // The shop's own record of it wins, so its grade is the one that survives.
    expect(matches[0].source).toBe("history");
  });

  it("grades a workshop phrase as whatever the technician already picked", () => {
    const suggestions = rankSuggestions(
      { ...BRAKE_PADS, defectSuggestions: ["Shop standard wording"] },
      { preferred: "attention" }
    );
    expect(suggestions[0].severity).toBe("attention");
  });
});
