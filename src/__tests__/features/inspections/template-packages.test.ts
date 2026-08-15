import { describe, it, expect } from "vitest";
import {
  PACKAGE_FORMAT_VERSION,
  PackageFormatError,
  packageFileName,
  parsePackage,
} from "@/lib/packages/format";
import { getInstaller, reviewContents } from "@/lib/packages/registry";
import {
  INSPECTION_TEMPLATE_TYPE,
  countCustomWording,
  describeTemplate,
  packagedTemplateSchema,
  withoutCustomWording,
  type PackagedTemplate,
} from "@/features/inspections/Lib/inspectionTemplatePackage";

const TEMPLATE: PackagedTemplate = packagedTemplateSchema.parse({
  name: "Norway — EU-kontroll",
  description: "Annex I with the Norwegian periodic control in mind.",
  country: "NO",
  standard: "eu-2014-45",
  severityScale: "eu",
  sections: [
    {
      name: "Braking equipment",
      code: "1",
      items: [
        {
          name: "Brake linings and pads",
          code: "1.1.13",
          inputType: "measurement",
          unit: "mm",
          minValue: 3,
          defaultSeverity: "fail",
          defectSuggestions: ["Pads at 2mm — call Kari before ordering"],
        },
        { name: "Brake fluid", code: "1.8" },
      ],
    },
  ],
});

const packageFor = (data: PackagedTemplate) => ({
  formatVersion: PACKAGE_FORMAT_VERSION,
  kind: "bundle",
  id: "torqvoice/no-eu-kontroll",
  version: "1.0.0",
  name: data.name,
  contents: [{ type: INSPECTION_TEMPLATE_TYPE, data }],
});

describe("package format", () => {
  it("accepts a package it wrote itself", () => {
    const parsed = parsePackage(packageFor(TEMPLATE));
    expect(parsed.id).toBe("torqvoice/no-eu-kontroll");
    expect(parsed.contents).toHaveLength(1);
  });

  it("says plainly when a package is from a newer Torqvoice", () => {
    // Rather than failing as a list of unrecognised fields.
    expect(() =>
      parsePackage({ ...packageFor(TEMPLATE), formatVersion: PACKAGE_FORMAT_VERSION + 1 })
    ).toThrow(/newer version/i);
  });

  it("rejects anything that is not a package", () => {
    for (const junk of [null, 42, "{}", {}, { formatVersion: "1" }]) {
      expect(() => parsePackage(junk)).toThrow(PackageFormatError);
    }
  });

  it("rejects a package whose envelope is incomplete", () => {
    const { version: _dropped, ...withoutVersion } = packageFor(TEMPLATE);
    expect(() => parsePackage(withoutVersion)).toThrow(PackageFormatError);
  });

  it("builds a filename that survives a downloads folder", () => {
    expect(packageFileName({ name: "Norway — EU-kontroll" })).toBe("torqvoice-norway-eu-kontroll.json");
    expect(packageFileName({ name: "///" })).toBe("torqvoice-template.json");
  });
});

describe("package registry", () => {
  it("has the inspection template type registered", () => {
    expect(getInstaller(INSPECTION_TEMPLATE_TYPE)?.label).toBe("inspection template");
  });

  it("refuses a content type this version cannot install", () => {
    // All-or-nothing: a half-recognised package must install nothing.
    expect(() => reviewContents([{ type: "labour-preset", data: {} }])).toThrow(
      /cannot install/i
    );
  });

  it("refuses a payload that does not match its schema", () => {
    expect(() =>
      reviewContents([{ type: INSPECTION_TEMPLATE_TYPE, data: { name: "x", sections: [] } }])
    ).toThrow(/not valid/i);
  });

  it("returns a validated payload with a summary to show first", () => {
    const [reviewed] = reviewContents([{ type: INSPECTION_TEMPLATE_TYPE, data: TEMPLATE }]);
    expect(reviewed.details).toContain("2 checks");
    expect(reviewed.details).toContain("1 section");
  });
});

describe("inspection template payload", () => {
  it("survives a round trip through JSON unchanged", () => {
    const round = packagedTemplateSchema.parse(JSON.parse(JSON.stringify(TEMPLATE)));
    expect(round).toEqual(TEMPLATE);
  });

  it("keeps the measurement limits, which are the point of sharing one", () => {
    const round = packagedTemplateSchema.parse(JSON.parse(JSON.stringify(TEMPLATE)));
    const pads = round.sections[0].items[0];
    expect(pads.unit).toBe("mm");
    expect(pads.minValue).toBe(3);
    expect(pads.defaultSeverity).toBe("fail");
  });

  it("strips the workshop's own wording when asked", () => {
    expect(countCustomWording(TEMPLATE)).toBe(1);
    const stripped = withoutCustomWording(TEMPLATE);
    expect(countCustomWording(stripped)).toBe(0);
    // Everything else is untouched — only the free text goes.
    expect(stripped.sections[0].items[0].minValue).toBe(3);
    expect(stripped.sections[0].items[0].name).toBe("Brake linings and pads");
  });

  it("does not mutate the payload it was given", () => {
    withoutCustomWording(TEMPLATE);
    expect(countCustomWording(TEMPLATE)).toBe(1);
  });

  it("counts custom wording so the export screen can warn about it", () => {
    const details = describeTemplate(TEMPLATE);
    expect(details).toContain("1 custom defect phrase");
    expect(details).toContain("Country: NO");
    expect(details).toContain("1 measured against a limit");
  });

  it("bounds what a file can ask to be written", () => {
    // A hostile or corrupt file must not turn into an unbounded insert.
    const huge = {
      ...TEMPLATE,
      sections: Array.from({ length: 61 }, () => TEMPLATE.sections[0]),
    };
    expect(packagedTemplateSchema.safeParse(huge).success).toBe(false);
  });

  it("refuses a template with no checks in a section", () => {
    const empty = { ...TEMPLATE, sections: [{ name: "Empty", items: [] }] };
    expect(packagedTemplateSchema.safeParse(empty).success).toBe(false);
  });
});
